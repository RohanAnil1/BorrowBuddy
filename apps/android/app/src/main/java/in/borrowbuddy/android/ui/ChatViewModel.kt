package `in`.borrowbuddy.android.ui

import androidx.compose.runtime.*
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import io.github.jan.supabase.realtime.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.Instant

data class ChatUiState(
    val messages: List<Message> = emptyList(), val title: String = "Loan chat",
    val community: Boolean = false, val counterpart: Profile? = null, val loan: Loan? = null,
    val initialized: Boolean = false, val hasOlder: Boolean = false, val loadingOlder: Boolean = false,
    val connected: Boolean = false, val events: Int = 0, val connections: Int = 0,
    val scrollRequest: Int = 0, val draft: String = "", val sending: Boolean = false,
    val error: String? = null,
    // Groups
    val description: String? = null, val visibility: String = "open", val archived: Boolean = false,
    val isMember: Boolean = true, val members: List<GroupMember> = emptyList(), val joining: Boolean = false,
    // Replies, edits, and quoted messages that aren't loaded
    val replyTo: Message? = null, val editing: Message? = null, val quoted: Map<String, Message> = emptyMap(),
    // Server-side search and jumping to a result
    val searchHits: List<MessageSearchHit>? = null, val searching: Boolean = false,
    val highlight: String? = null, val revealRequest: Int = 0,
    // Announcements, mute, pins, photos, mentions and typing
    val posting: String = "everyone", val isAdmin: Boolean = false, val muted: Boolean = false,
    val pinned: List<Message> = emptyList(), val uploading: Boolean = false,
    val mentionables: List<GroupMember> = emptyList(), val typers: Map<String, Typer> = emptyMap(),
) {
    /** Reacting and voting: members of a chat that isn't archived. */
    val canReact: Boolean get() = isMember && !archived
    /** Announcement-only groups: only admins post. */
    val canPost: Boolean get() = canReact && (posting != "admins" || isAdmin)
    val canJoin: Boolean get() = community && !isMember && !archived
    /** Admins pin in groups; either student pins in a loan chat. */
    val canPin: Boolean get() = if (community) isAdmin && !archived else canReact
    val canPoll: Boolean get() = community && isAdmin && canPost
    val announcements: Boolean get() = community && posting == "admins"
    val typingLabel: String get() = typingText(typers.values.map { it.name })
}

data class Typer(val name: String, val at: Long)

internal fun typingText(names: List<String>): String = when (names.size) {
    0 -> ""
    1 -> "${names[0]} is typing…"
    2 -> "${names[0]} and ${names[1]} are typing…"
    else -> "Several people are typing…"
}

/** Students whose "@Full Name" appears in the text. */
internal fun mentionedIds(text: String, people: List<GroupMember>): List<String> =
    people.filter { it.full_name.isNotBlank() && text.contains("@${it.full_name}") }.map { it.user_id }.distinct()

/** The "@query" being typed at the end of the draft, if any. */
internal fun mentionQuery(draft: String): String? = Regex("(?:^|\\s)@([^\\s@]{0,30})$").find(draft)?.groupValues?.get(1)

/** Keeps the newest pins first, adding, updating or dropping one row. */
internal fun updatePins(current: List<Message>, row: Message): List<Message> {
    val without = current.filter { it.id != row.id }
    if (row.pinned_at == null || row.deleted_at != null) return without
    val sender = row.sender ?: current.firstOrNull { it.id == row.id }?.sender
    return (without + row.copy(sender = sender)).sortedByDescending { it.pinned_at }
}

/** Adds new rows and replaces changed ones (edits, deletes, reactions), keeping a known sender. */
internal fun mergeThreadMessages(current: List<Message>, incoming: List<Message>): List<Message> {
    val merged = current.associateByTo(linkedMapOf()) { it.id }
    incoming.forEach { row -> merged[row.id] = row.copy(sender = row.sender ?: merged[row.id]?.sender) }
    return merged.values.sortedWith(compareBy<Message> { Instant.parse(it.created_at) }.thenBy { it.id })
}

/** Toggles your reaction locally, the way toggle_message_reaction() does on the server. */
internal fun toggledReactions(reactions: Map<String, List<String>>, emoji: String, userId: String): Map<String, List<String>> {
    val users = reactions[emoji].orEmpty()
    if (userId !in users) return reactions + (emoji to users + userId)
    val rest = users - userId
    return if (rest.isEmpty()) reactions - emoji else reactions + (emoji to rest)
}

/** Entry-scoped state survives rotation; only STARTED screens own a subscription/read cursor. */
class ChatViewModel(private val repository: BorrowRepository, private val userId: String,
    private val id: String, private val saved: SavedStateHandle, val isAdmin: Boolean = false,
    private val userName: String = "") : ViewModel() {
    var ui by mutableStateOf(ChatUiState(draft = saved["draft"] ?: "", isAdmin = isAdmin)); private set
    private var session: Job? = null
    private var typingSession: Job? = null
    private var typingChannel: RealtimeChannel? = null
    private var typingSentAt = 0L
    private var searchJob: Job? = null
    private val mutation = Mutex()
    private val senderCache = linkedMapOf<String, Profile>()
    private val requestedQuotes = mutableSetOf<String>()

    /** The saved draft belongs to new messages; an edit in progress isn't persisted. */
    fun updateDraft(value: String) {
        val text = value.take(2000)
        if (ui.editing == null) saved["draft"] = text
        ui = ui.copy(draft = text)
        if (ui.editing == null && text.isNotBlank()) announceTyping()
    }
    /** Replaces the "@query" being typed with "@Full Name ". */
    fun pickMention(member: GroupMember) {
        val query = mentionQuery(ui.draft) ?: return
        updateDraft(ui.draft.dropLast(query.length + 1) + "@${member.full_name} ")
    }
    fun start() {
        if (session?.isActive == true) return
        val previous = session
        session = viewModelScope.launch { previous?.cancelAndJoin(); runSession() }
        if (typingSession?.isActive != true) typingSession = viewModelScope.launch { runTyping() }
    }
    fun stop() { session?.cancel(); typingSession?.cancel(); ui = ui.copy(connected = false, typers = emptyMap()) }
    fun retry() { stop(); start() }

    /** Only members keep a read cursor; previewing an open group must not join it. */
    private suspend fun markRead() { if (ui.isMember) repository.rpc("mark_conversation_read", buildJsonObject { put("p_conversation_id", id) }) }
    private suspend fun refreshTail() = mutation.withLock {
        val rows = repository.messages(id)
        val initial = !ui.initialized
        ui = ui.copy(messages = mergeThreadMessages(ui.messages, rows), initialized = true,
            hasOlder = if (initial) rows.size == 100 else ui.hasOlder,
            scrollRequest = ui.scrollRequest + if (initial) 1 else 0)
        markRead()
        loadQuoted()
    }
    /** Replies to messages older than the loaded page: fetch just the quoted rows, once. */
    private fun loadQuoted() {
        val loaded = ui.messages.mapTo(hashSetOf()) { it.id }
        val missing = ui.messages.mapNotNull { it.reply_to_id }.filter { it !in loaded && it !in requestedQuotes }.distinct()
        if (missing.isEmpty()) return
        requestedQuotes += missing
        viewModelScope.launch {
            try {
                val rows = repository.messagesById(missing)
                ui = ui.copy(quoted = ui.quoted + rows.associateBy { it.id })
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { requestedQuotes -= missing.toSet() }
        }
    }
    private suspend fun refreshMetadata(): Boolean {
        val conversation = repository.conversation(id)
        if (conversation == null) {
            ui = ui.copy(messages = emptyList(), initialized = false, error = "Conversation not found or access is no longer available.")
            return false
        }
        val group = conversation.type == "community"
        val counterpart = if (!group) repository.members(id).firstOrNull { it.user_id != userId }?.profile else null
        val members = if (group) repository.groupMembers(id) else emptyList()
        val member = !group || members.any { it.user_id == userId }
        val mentionables = if (group) members.filter { it.user_id != userId }
            else listOfNotNull(counterpart?.let { GroupMember(it.id, it.full_name) })
        ui = ui.copy(title = if (group) conversation.title ?: "Group" else counterpart?.full_name ?: "Loan chat",
            community = group, counterpart = counterpart,
            loan = conversation.loan_id?.let { repository.loan(it) },
            description = conversation.description, visibility = conversation.visibility, archived = conversation.archived_at != null,
            posting = conversation.posting, isMember = member, members = members, mentionables = mentionables,
            pinned = repository.pinnedMessages(id), muted = member && repository.isMuted(id, userId))
        return true
    }
    private suspend fun runSession() {
        var metadataLoaded = false
        while (currentCoroutineContext().isActive && !metadataLoaded) {
            try {
                repository.initialize()
                if (!refreshMetadata()) return
                refreshTail(); metadataLoaded = true
            }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)); delay(5_000) }
        }
        coroutineScope {
            launch {
                while (isActive) {
                    delay(30_000)
                    try { refreshTail() }
                    catch (cancelled: CancellationException) { throw cancelled }
                    catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
                }
            }
            while (isActive) {
                // A late leave acknowledgement must never tear down the next attempt.
                val channel = repository.client.channel("android-chat-$id-${java.util.UUID.randomUUID()}") { broadcast { replicationReady = true } }
                try {
                    coroutineScope {
                        val ready = CompletableDeferred<Unit>()
                        launch(start = CoroutineStart.UNDISPATCHED) {
                            channel.systemFlow().collect { payload ->
                                if (payload.extension in setOf("system", "postgres_changes")) {
                                    if (payload.status == "ok") ready.complete(Unit)
                                    else if (payload.status == "error") throw java.io.IOException("Live updates are unavailable")
                                }
                            }
                        }
                        val inserts = channel.postgresChangeFlow<PostgresAction.Insert>("public") {
                            table = "messages"; filter { eq("conversation_id", id) }
                        }
                        launch(start = CoroutineStart.UNDISPATCHED) {
                            inserts.collect { event ->
                                val row = event.decodeRecord<Message>()
                                if (row.conversation_id != id) return@collect
                                val sender = senderCache[row.sender_id] ?: try { repository.publicProfile(row.sender_id) }
                                catch (cancelled: CancellationException) { throw cancelled }
                                catch (_: Exception) { null }
                                sender?.let { senderCache[row.sender_id] = it; if (senderCache.size > 64) senderCache.remove(senderCache.keys.first()) }
                                mutation.withLock {
                                    ui = ui.copy(messages = mergeThreadMessages(ui.messages, listOf(row.copy(sender = sender))),
                                        events = ui.events + 1, typers = ui.typers - row.sender_id)
                                    markRead()
                                    loadQuoted()
                                }
                            }
                        }
                        // Edits, deletes and reactions all update the row.
                        val updates = channel.postgresChangeFlow<PostgresAction.Update>("public") {
                            table = "messages"; filter { eq("conversation_id", id) }
                        }
                        launch(start = CoroutineStart.UNDISPATCHED) {
                            updates.collect { event ->
                                val row = event.decodeRecord<Message>()
                                if (row.conversation_id != id) return@collect
                                mutation.withLock {
                                    if (ui.messages.any { it.id == row.id }) {
                                        ui = ui.copy(messages = mergeThreadMessages(ui.messages, listOf(row)), events = ui.events + 1)
                                    }
                                    if (ui.quoted.containsKey(row.id)) ui = ui.copy(quoted = ui.quoted + (row.id to row))
                                    val sender = ui.messages.firstOrNull { it.id == row.id }?.sender
                                    ui = ui.copy(pinned = updatePins(ui.pinned, row.copy(sender = sender)))
                                }
                            }
                        }
                        withContext(Dispatchers.IO) { withTimeout(15_000) { channel.subscribe(blockUntilSubscribed = true) } }
                        withTimeout(15_000) { ready.await() }
                        refreshTail() // Recover writes between HTTP load, join and replication readiness.
                        ui = ui.copy(connected = true, connections = ui.connections + 1, error = null)
                        channel.status.first { it != RealtimeChannel.Status.SUBSCRIBED }
                        throw java.io.IOException("Live connection interrupted. Reconnecting…")
                    }
                } catch (timeout: TimeoutCancellationException) { ui = ui.copy(error = "Live updates are unavailable. Retrying…") }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
                finally {
                    ui = ui.copy(connected = false)
                    withContext(NonCancellable) {
                        runCatching { withTimeoutOrNull(5_000) { channel.unsubscribe() } }
                        repository.client.realtime.removeChannel(channel)
                    }
                }
                delay(5_000)
            }
        }
    }
    suspend fun loadOlder() {
        if (ui.loadingOlder || !ui.hasOlder || ui.messages.isEmpty()) return
        ui = ui.copy(loadingOlder = true)
        try { mutation.withLock {
            repository.initialize()
            val rows = repository.messages(id, before = ui.messages.first())
            ui = ui.copy(messages = mergeThreadMessages(ui.messages, rows), hasOlder = rows.size == 100)
        } }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
        finally { ui = ui.copy(loadingOlder = false) }
        loadQuoted()
    }
    fun send() {
        val text = ui.draft.trim()
        if (text.isBlank() || ui.sending || !ui.initialized || !ui.canPost) return
        val originalDraft = ui.draft
        val editing = ui.editing
        val replyTo = ui.replyTo
        ui = ui.copy(sending = true, error = null)
        viewModelScope.launch {
            try {
                repository.initialize()
                if (editing != null) {
                    val row = repository.editMessage(editing.id, text)
                    mutation.withLock {
                        ui = ui.copy(messages = mergeThreadMessages(ui.messages, listOf(row)), editing = null, draft = saved["draft"] ?: "")
                    }
                    return@launch
                }
                val row = repository.sendMessage(id, userId, text, replyTo?.id, mentionedIds(text, ui.mentionables))
                mutation.withLock {
                    ui = ui.copy(messages = mergeThreadMessages(ui.messages, listOf(row)), scrollRequest = ui.scrollRequest + 1, replyTo = null)
                    if (ui.draft == originalDraft) updateDraft("")
                    if (session?.isActive == true) markRead()
                }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
            finally { ui = ui.copy(sending = false) }
        }
    }

    fun startReply(message: Message) {
        val draft = if (ui.editing != null) saved["draft"] ?: "" else ui.draft
        ui = ui.copy(replyTo = message, editing = null, draft = draft)
    }
    fun startEdit(message: Message) { ui = ui.copy(editing = message, replyTo = null, draft = message.body) }
    fun cancelCompose() {
        val draft = if (ui.editing != null) saved["draft"] ?: "" else ui.draft
        ui = ui.copy(replyTo = null, editing = null, draft = draft)
    }

    fun react(message: Message, emoji: String) {
        if (!ui.canPost || message.deleted_at != null) return
        val before = ui.messages.firstOrNull { it.id == message.id }?.reactions ?: message.reactions
        ui = ui.copy(messages = ui.messages.map { if (it.id == message.id) it.copy(reactions = toggledReactions(before, emoji, userId)) else it })
        viewModelScope.launch {
            val result = try { repository.toggleReaction(message.id, emoji) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)); before }
            ui = ui.copy(messages = ui.messages.map { if (it.id == message.id) it.copy(reactions = result) else it })
        }
    }

    /** Your own messages; admins can delete any message. */
    fun delete(message: Message) {
        viewModelScope.launch {
            try {
                repository.deleteMessage(message.id)
                ui = ui.copy(messages = ui.messages.map {
                    if (it.id == message.id) it.copy(body = "", image_path = null, reactions = emptyMap(), deleted_at = Instant.now().toString()) else it
                }, editing = ui.editing?.takeIf { it.id != message.id }, replyTo = ui.replyTo?.takeIf { it.id != message.id })
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
        }
    }

    fun join() {
        if (ui.joining) return
        ui = ui.copy(joining = true, error = null)
        viewModelScope.launch {
            try {
                repository.initialize(); repository.joinGroup(id)
                ui = ui.copy(isMember = true, members = repository.groupMembers(id))
                markRead()
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
            finally { ui = ui.copy(joining = false) }
        }
    }

    fun leave(done: () -> Unit) {
        if (ui.joining) return
        ui = ui.copy(joining = true, error = null)
        viewModelScope.launch {
            try { repository.initialize(); repository.leaveGroup(id); ui = ui.copy(isMember = false); done() }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
            finally { ui = ui.copy(joining = false) }
        }
    }

    /** Server-side search across the whole chat, debounced. */
    fun search(query: String) {
        searchJob?.cancel()
        val term = query.trim()
        if (term.length < 2) { ui = ui.copy(searchHits = null, searching = false); return }
        searchJob = viewModelScope.launch {
            delay(280)
            ui = ui.copy(searching = true)
            try { ui = ui.copy(searchHits = repository.searchMessages(id, term)) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
            finally { ui = ui.copy(searching = false) }
        }
    }

    /** Loads earlier pages (up to 1,000 messages back) until the message is in the thread, then asks the screen to show it. */
    fun reveal(messageId: String) {
        viewModelScope.launch {
            var pages = 0
            while (ui.messages.none { it.id == messageId } && ui.hasOlder && pages < 10) { loadOlder(); pages++ }
            ui = if (ui.messages.any { it.id == messageId }) ui.copy(highlight = messageId, revealRequest = ui.revealRequest + 1)
            else ui.copy(error = "That message is too far back to show here.")
        }
    }
    fun clearHighlight() { ui = ui.copy(highlight = null) }

    /** Typing: a private broadcast channel the database authorises per chat. Optional: failures stay quiet. */
    private suspend fun runTyping() = coroutineScope {
        val channel = repository.client.channel("typing:$id") { isPrivate = true; broadcast { receiveOwnBroadcasts = false } }
        launch {
            while (isActive) {
                delay(1_500)
                val cutoff = System.currentTimeMillis() - 6_000
                if (ui.typers.values.any { it.at < cutoff }) ui = ui.copy(typers = ui.typers.filterValues { it.at >= cutoff })
            }
        }
        try {
            val events = channel.broadcastFlow<JsonObject>("typing")
            launch(start = CoroutineStart.UNDISPATCHED) {
                events.collect { payload ->
                    val who = payload["user_id"]?.jsonPrimitive?.contentOrNull ?: return@collect
                    if (who == userId) return@collect
                    val name = payload["name"]?.jsonPrimitive?.contentOrNull?.trim()?.take(40)?.ifBlank { null } ?: "Someone"
                    ui = ui.copy(typers = ui.typers + (who to Typer(name, System.currentTimeMillis())))
                }
            }
            withContext(Dispatchers.IO) { withTimeout(15_000) { channel.subscribe(blockUntilSubscribed = true) } }
            typingChannel = channel
            awaitCancellation()
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { /* Chat keeps working without a typing indicator. */ }
        finally {
            typingChannel = null
            withContext(NonCancellable) {
                runCatching { withTimeoutOrNull(5_000) { channel.unsubscribe() } }
                repository.client.realtime.removeChannel(channel)
            }
        }
    }

    private fun announceTyping() {
        val channel = typingChannel ?: return
        val now = System.currentTimeMillis()
        if (!ui.canPost || now - typingSentAt < 2_500) return
        typingSentAt = now
        val name = userName.trim().substringBefore(' ')
        viewModelScope.launch {
            runCatching { channel.broadcast("typing", buildJsonObject { put("user_id", userId); put("name", name.ifBlank { "Someone" }) }) }
        }
    }

    fun toggleMute() {
        val muted = !ui.muted
        ui = ui.copy(muted = muted)
        viewModelScope.launch {
            try { repository.setMuted(id, muted) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(muted = !muted, error = friendlyError(failure)) }
        }
    }

    fun pin(message: Message, pinned: Boolean) {
        viewModelScope.launch {
            try {
                repository.pinMessage(message.id, pinned)
                val stamp = if (pinned) Instant.now().toString() else null
                val row = (ui.messages.firstOrNull { it.id == message.id } ?: message).copy(pinned_at = stamp, pinned_by = if (pinned) userId else null)
                ui = ui.copy(messages = ui.messages.map { if (it.id == message.id) row else it }, pinned = updatePins(ui.pinned, row))
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
        }
    }

    fun vote(message: Message, option: Int) {
        viewModelScope.launch {
            try {
                val poll = repository.votePoll(message.id, option)
                ui = ui.copy(messages = ui.messages.map { if (it.id == message.id) it.copy(poll = poll) else it })
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
        }
    }

    fun closePoll(message: Message, closed: Boolean) {
        viewModelScope.launch {
            try {
                repository.closePoll(message.id, closed)
                ui = ui.copy(messages = ui.messages.map { if (it.id == message.id) it.copy(poll = it.poll?.copy(closed = closed)) else it })
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
        }
    }

    fun createPoll(question: String, options: List<String>, done: () -> Unit) {
        val cleaned = options.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (question.isBlank()) { ui = ui.copy(error = "Ask a question for the poll."); return }
        if (cleaned.size < 2) { ui = ui.copy(error = "Give at least two different options."); return }
        viewModelScope.launch {
            try { repository.createPoll(id, question, cleaned); done(); refreshTail() }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
        }
    }

    /** Uploads a photo to your own folder, then sends it with the draft as its caption. */
    fun sendPhoto(uri: android.net.Uri) {
        if (ui.uploading || !ui.canPost) return
        val caption = ui.draft.trim()
        val replyTo = ui.replyTo
        ui = ui.copy(uploading = true, error = null)
        viewModelScope.launch {
            try {
                repository.initialize()
                val path = repository.upload(uri, "chat-images", userId)
                val row = repository.sendMessage(id, userId, caption, replyTo?.id, mentionedIds(caption, ui.mentionables), path)
                mutation.withLock {
                    ui = ui.copy(messages = mergeThreadMessages(ui.messages, listOf(row)), scrollRequest = ui.scrollRequest + 1, replyTo = null)
                    if (caption.isNotEmpty() && ui.draft.trim() == caption) updateDraft("")
                }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
            finally { ui = ui.copy(uploading = false) }
        }
    }
}
