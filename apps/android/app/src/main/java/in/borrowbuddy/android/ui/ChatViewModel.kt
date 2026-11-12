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
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant

data class ChatUiState(
    val messages: List<Message> = emptyList(), val title: String = "Loan chat",
    val community: Boolean = false, val counterpart: Profile? = null, val loan: Loan? = null,
    val initialized: Boolean = false, val hasOlder: Boolean = false, val loadingOlder: Boolean = false,
    val connected: Boolean = false, val events: Int = 0, val connections: Int = 0,
    val scrollRequest: Int = 0, val draft: String = "", val sending: Boolean = false,
    val error: String? = null
)

internal fun mergeThreadMessages(current: List<Message>, incoming: List<Message>): List<Message> {
    val merged = current.associateByTo(linkedMapOf()) { it.id }
    incoming.forEach { row -> merged[row.id] = row.copy(sender = row.sender ?: merged[row.id]?.sender) }
    return merged.values.sortedWith(compareBy<Message> { Instant.parse(it.created_at) }.thenBy { it.id })
}

/** Entry-scoped state survives rotation; only STARTED screens own a subscription/read cursor. */
class ChatViewModel(private val repository: BorrowRepository, private val userId: String,
    private val id: String, private val saved: SavedStateHandle) : ViewModel() {
    var ui by mutableStateOf(ChatUiState(draft = saved["draft"] ?: "")); private set
    private var session: Job? = null
    private val mutation = Mutex()
    private val senderCache = linkedMapOf<String, Profile>()

    fun updateDraft(value: String) { val text = value.take(2000); saved["draft"] = text; ui = ui.copy(draft = text) }
    fun start() {
        if (session?.isActive == true) return
        val previous = session
        session = viewModelScope.launch { previous?.cancelAndJoin(); runSession() }
    }
    fun stop() { session?.cancel(); ui = ui.copy(connected = false) }
    fun retry() { stop(); start() }

    private suspend fun markRead() { repository.rpc("mark_conversation_read", buildJsonObject { put("p_conversation_id", id) }) }
    private suspend fun refreshTail() = mutation.withLock {
        val rows = repository.messages(id)
        val initial = !ui.initialized
        ui = ui.copy(messages = mergeThreadMessages(ui.messages, rows), initialized = true,
            hasOlder = if (initial) rows.size == 100 else ui.hasOlder,
            scrollRequest = ui.scrollRequest + if (initial) 1 else 0)
        markRead()
    }
    private suspend fun refreshMetadata(): Boolean {
        val conversation = repository.conversation(id)
        if (conversation == null) {
            ui = ui.copy(messages = emptyList(), initialized = false, error = "Conversation not found or access is no longer available.")
            return false
        }
        val counterpart = if (conversation.type == "private") repository.members(id).firstOrNull { it.user_id != userId }?.profile else null
        ui = ui.copy(title = if (conversation.type == "community") conversation.title ?: "Community" else counterpart?.full_name ?: "Loan chat",
            community = conversation.type == "community", counterpart = counterpart,
            loan = conversation.loan_id?.let { repository.loan(it) })
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
                                        events = ui.events + 1)
                                    markRead()
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
    }
    fun send() {
        val text = ui.draft.trim()
        if (text.isBlank() || ui.sending || !ui.initialized) return
        val originalDraft = ui.draft
        ui = ui.copy(sending = true, error = null)
        viewModelScope.launch {
            try {
                repository.initialize()
                val row = repository.sendMessage(id, userId, text)
                mutation.withLock {
                    ui = ui.copy(messages = mergeThreadMessages(ui.messages, listOf(row)), scrollRequest = ui.scrollRequest + 1)
                    if (ui.draft == originalDraft) updateDraft("")
                    if (session?.isActive == true) markRead()
                }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
            finally { ui = ui.copy(sending = false) }
        }
    }
}
