package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.*
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.compose.viewModel
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import io.github.jan.supabase.realtime.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.*
import java.time.Instant
import java.util.UUID

private val campusCodeJson = Json { ignoreUnknownKeys = true }

data class CampusCollectionState(
    val transfer: CampusTransfer? = null, val post: CampusPost? = null,
    val host: Profile? = null, val recipient: Profile? = null, val messages: List<CampusMessage> = emptyList(),
    val initialized: Boolean = false, val connected: Boolean = false, val events: Int = 0,
    val hasOlder: Boolean = false, val loadingOlder: Boolean = false,
    val draft: String = "", val sending: Boolean = false, val error: String? = null, val scrollRequest: Int = 0,
)

class CampusCollectionModel(private val repository: BorrowRepository, private val user: String, private val id: String,
    private val saved: SavedStateHandle) : ViewModel() {
    var ui by mutableStateOf(CampusCollectionState(draft = saved["draft"] ?: "")); private set
    // Keep the short-lived secret through configuration changes, never in saved-state storage.
    var code by mutableStateOf<CampusCode?>(null); private set
    fun generatedCode(value: CampusCode) { code = value }
    private var job: Job? = null
    private val mutex = Mutex()
    fun updateDraft(text: String) { if (!ui.sending) { saved["draft"] = text.take(2000); ui = ui.copy(draft = text.take(2000)) } }
    fun start() {
        if (job?.isActive == true) return
        val old = job
        job = viewModelScope.launch { old?.cancelAndJoin(); session() }
    }
    fun stop() { job?.cancel(); ui = ui.copy(connected = false) }
    fun retry() { stop(); start() }
    private suspend fun refresh() = mutex.withLock {
        val transfer = repository.campus.transfer(id)
        if (transfer == null || user !in listOf(transfer.host_id, transfer.recipient_id)) {
            code = null
            ui = CampusCollectionState(error = "Collection not found or access is no longer available."); return@withLock
        }
        val messages = repository.campus.messages(id)
        val post = repository.campus.post(transfer.post_id)
        val host = repository.publicProfile(transfer.host_id)
        val recipient = repository.publicProfile(transfer.recipient_id)
        // Read editable state only after the suspending loads. A metadata response
        // must never replace a draft typed while the request was in flight.
        val current = ui
        val effectiveTransfer = current.transfer?.takeIf { it.id == transfer.id && it.status != "active" && transfer.status == "active" } ?: transfer
        val first = !current.initialized
        if (!effectiveTransfer.active()) code = null
        val added = messages.any { row -> current.messages.none { it.id == row.id } }
        ui = current.copy(transfer = effectiveTransfer, post = post, host = host, recipient = recipient,
            messages = CampusRules.mergeMessages(current.messages, messages), initialized = true,
            hasOlder = if (first) messages.size == 50 else current.hasOlder, error = null, scrollRequest = current.scrollRequest + if (first || added) 1 else 0)
        repository.campus.action("read_thread", campusData(id))
    }
    private suspend fun session() = coroutineScope {
        repository.initialize()
        launch { while (isActive) {
            try { refresh() } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
            delay(15_000)
        } }
        while (isActive) {
            val channel = repository.client.channel("android-collection-$id-${UUID.randomUUID()}") { broadcast { replicationReady = true } }
            try { coroutineScope {
                val ready = CompletableDeferred<Unit>()
                launch(start = CoroutineStart.UNDISPATCHED) { channel.systemFlow().collect {
                    if (it.extension in setOf("system", "postgres_changes")) {
                        if (it.status == "ok") ready.complete(Unit)
                        else if (it.status == "error") throw java.io.IOException("Collection updates are unavailable.")
                    }
                } }
                val inserts = channel.postgresChangeFlow<PostgresAction.Insert>("public") { table = "campus_messages"; filter { eq("transfer_id", id) } }
                val transfers = channel.postgresChangeFlow<PostgresAction.Update>("public") { table = "campus_transfers"; filter { eq("id", id) } }
                launch(start = CoroutineStart.UNDISPATCHED) { inserts.collect { event ->
                    val row = event.decodeRecord<CampusMessage>()
                    if (row.transfer_id == id) mutex.withLock {
                        val added = ui.messages.none { it.id == row.id }
                        ui = ui.copy(messages = CampusRules.mergeMessages(ui.messages, listOf(row)), events = ui.events + 1, scrollRequest = ui.scrollRequest + if (added) 1 else 0)
                        repository.campus.action("read_thread", campusData(id))
                    }
                } }
                launch(start = CoroutineStart.UNDISPATCHED) { transfers.collect { event ->
                    val row = event.decodeRecord<CampusTransfer>()
                    if (row.id == id) { ui = ui.copy(transfer = row); if (!row.active()) code = null }
                } }
                withContext(Dispatchers.IO) { withTimeout(15_000) { channel.subscribe(blockUntilSubscribed = true) } }
                withTimeout(15_000) { ready.await() }
                refresh(); ui = ui.copy(connected = true)
                channel.status.first { it != RealtimeChannel.Status.SUBSCRIBED }
                throw java.io.IOException("Connection interrupted. Reconnecting…")
            } }
            catch (_: TimeoutCancellationException) { ui = ui.copy(error = "Live updates unavailable. Retrying…") }
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
    fun loadOlder() {
        if (ui.loadingOlder || !ui.hasOlder) return
        ui = ui.copy(loadingOlder = true)
        viewModelScope.launch {
            try { mutex.withLock {
                val rows = repository.campus.messages(id, ui.messages.firstOrNull())
                ui = ui.copy(messages = CampusRules.mergeMessages(ui.messages, rows), hasOlder = rows.size == 50)
            } } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
            finally { ui = ui.copy(loadingOlder = false) }
        }
    }
    fun send() {
        val body = ui.draft.trim()
        if (ui.sending || body.isEmpty() || ui.transfer?.active() != true) return
        val clientId = if (saved.get<String>("pendingBody") == body) saved.get<String>("pendingId") ?: UUID.randomUUID().toString() else UUID.randomUUID().toString()
        saved["pendingBody"] = body; saved["pendingId"] = clientId
        ui = ui.copy(sending = true, error = null)
        viewModelScope.launch {
            try {
                repository.campus.action("send_message", buildJsonObject { put("id", id); put("body", body); put("client_id", clientId) })
                saved["draft"] = ""; saved.remove<String>("pendingBody"); saved.remove<String>("pendingId")
                ui = ui.copy(draft = ""); refresh()
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { ui = ui.copy(error = friendlyError(failure)) }
            finally { ui = ui.copy(sending = false) }
        }
    }
}

val CampusCollectionConnected = SemanticsPropertyKey<Boolean>("CampusCollectionConnected")
val CampusCollectionEvents = SemanticsPropertyKey<Int>("CampusCollectionEvents")
@Composable fun CampusCollectionScreen(repository: BorrowRepository, profile: Profile, id: String, open: (String) -> Unit) {
    val model: CampusCollectionModel = viewModel(key = "collection-$id-${profile.id}", factory = object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST") override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
            CampusCollectionModel(repository, profile.id, id, extras.createSavedStateHandle()) as T
    })
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, model) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_START) model.start() else if (event == Lifecycle.Event.ON_STOP) model.stop() }
        lifecycle.addObserver(observer)
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) model.start()
        onDispose { lifecycle.removeObserver(observer); model.stop() }
    }
    val state = model.ui
    val actions = rememberActions()
    LaunchedEffect(actions.revision) { if (actions.revision > 0) model.retry() }
    var now by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(lifecycle) { lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) { while (true) { now = Instant.now(); delay(1000) } } }
    CampusPage(state.post?.title ?: "Collection record", "YOUR PRIVATE COLLECTION", open) {
        state.error?.let { CampusCopy(it); CampusButton("Retry collection", model::retry, secondary = true) }
        if (!state.initialized) CircularProgressIndicator(color = Cargo.Accent)
        state.transfer?.let { transfer ->
            val active = transfer.active(now)
            StatusBadge(if (transfer.status == "active" && !active) "expired" else transfer.status)
            CampusCopy("${state.host?.full_name ?: "Host"} → ${state.recipient?.full_name ?: "Recipient"}")
            CampusSplit(primary = {
            state.post?.let { CampusButton("View original post", { open(campusPath(it)) }, secondary = true) }
            CampusCopy("Campus area · ${state.post?.location ?: "Original post withdrawn"}. Confirm your meeting point in chat or book a published slot. No payment is required.")
            CampusCollectionThread(state, model, profile.id, active)
            }, secondary = {
            transfer.expires_at?.let { CargoPanel {
                CargoLabel("[ COLLECTION DEADLINE ]"); CampusCopy(CampusRules.date(it))
                CampusCopy(if (active) "${java.time.Duration.between(now, Instant.parse(it)).toMinutes().coerceAtLeast(0)} minutes remaining. Booking and messaging do not extend your hold." else "This hold has ended.")
            } }
            if (transfer.status == "completed") CargoPanel(Modifier.testTag("collection-receipt")) {
                CargoLabel("[ COLLECTION RECEIPT ]")
                CargoTitle(if (transfer.claim_id != null) "Back with its owner." else "A new chapter starts here.")
                CampusCopy("${state.host?.full_name ?: "Host"} handed this item to ${state.recipient?.full_name ?: "Recipient"}.")
                transfer.completed_at?.let { CampusCopy(CampusRules.date(it)) }; CargoLabel("RECEIPT $id")
            } else if (active) {
                CampusAppointmentPicker(repository, transfer.host_id, "collection", transfer = id, expires = transfer.expires_at)
                CampusCollectionCode(repository, transfer, profile.id, now, actions, model.code, model::generatedCode)
                CampusReasonAction("Cancel collection", "This closes the conversation and releases the item and appointment.", actions) { reason -> repository.campus.action("cancel_transfer", campusData(id, reason)) }
            } else CampusCopy(transfer.closed_reason ?: "This collection is closed. Your conversation remains a read-only record.")
            ActionFeedback(actions)
            })
        }
    }
}

@Composable private fun CampusCollectionThread(state: CampusCollectionState, model: CampusCollectionModel, user: String, active: Boolean) {
    CargoPanel(Modifier.semantics { this[CampusCollectionConnected] = state.connected; this[CampusCollectionEvents] = state.events }) {
        CargoLabel("[ PRIVATE COLLECTION CHANNEL · ${if (state.connected) "LIVE" else "RECONNECTING"} ]")
        CampusCopy("Only you and your collection partner can read this conversation. Ownership evidence stays in admin claim review.")
        val threadScroll = rememberThreadScroll(state.messages.size, false, state.scrollRequest)
        if (state.hasOlder) CampusButton("Load older messages", { threadScroll.pauseFollowing(); model.loadOlder() }, enabled = !state.loadingOlder, secondary = true)
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val bubbleWidth = maxWidth * .9f
            LazyColumn(Modifier.fillMaxWidth().heightIn(min = 120.dp, max = 512.dp).testTag("collection-messages"), state = threadScroll.list, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(state.messages, key = { it.id }) { message ->
                    val mine = message.sender_id == user
                    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
                        Column(Modifier.widthIn(max = bubbleWidth).background(if (mine) Cargo.Accent.copy(alpha = .1f) else Cargo.Deep.copy(alpha = .5f))
                            .border(1.dp, if (mine) Cargo.Accent.copy(alpha = .4f) else Cargo.Line).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(message.body, Modifier.testTag("collection-message-${message.id}"), style = loanBody(14).copy(lineHeight = 24.sp))
                            CargoLabel("${if (mine) "YOU" else "PARTNER"} · ${CampusRules.date(message.created_at)}", Cargo.Ink.copy(alpha = .4f))
                        }
                    }
                }
                if (state.messages.isEmpty()) item { CampusCopy("Start with a pickup location or a time that works for you.") }
            }
        }
        if (active) {
            CargoField("Message", state.draft, model::updateDraft, Modifier.testTag("chat-composer"), lines = 3, maxLines = 5,
                keyboard = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Send),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onSend = { model.send() }))
            CampusButton(if (state.sending) "Sending…" else "Send message", model::send, enabled = state.initialized && !state.sending && state.draft.isNotBlank(), modifier = Modifier.testTag("chat-send"))
            CargoLabel("${state.draft.length} / 2000 CHARACTERS", Cargo.Ink.copy(alpha = .4f))
        } else CargoLabel("[ READ-ONLY COLLECTION RECORD ]")
    }
}

@Composable private fun CampusCollectionCode(repository: BorrowRepository, transfer: CampusTransfer, user: String, now: Instant, actions: ScreenActions,
    code: CampusCode?, generated: (CampusCode) -> Unit) {
    var entered by rememberSaveable(transfer.id, user) { mutableStateOf("") }
    CargoPanel {
        CargoTitle("Confirm at collection")
        if (user == transfer.recipient_id) {
            code?.takeIf { now < Instant.parse(it.expires_at) }?.let {
                QrTile("bb:collection:${it.code}")
                Text(it.code, Modifier.testTag("collection-code"), style = androidx.compose.ui.text.TextStyle(fontFamily = Cargo.Ticket, fontSize = 30.sp, letterSpacing = 5.sp))
                CargoLabel("Expires ${CampusRules.date(it.expires_at)}")
            }
            CampusButton("Generate / replace my code", { actions.run(refresh = false) {
                generated(campusCodeJson.decodeFromJsonElement<CampusCode>(repository.campus.action("generate_code", campusData(transfer.id))))
            } }, enabled = !actions.busy)
        } else if (user == transfer.host_id) {
            CargoField("Recipient’s six-digit code", entered, { if (it.length <= 6 && it.all(Char::isDigit)) entered = it },
                keyboard = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.NumberPassword))
            CampusConfirm("Confirm collection", "Confirm only when the item changes hands.", actions, primary = true) {
                require(Regex("[0-9]{6}").matches(entered)) { "Enter the six-digit code." }
                repository.campus.action("confirm_code", buildJsonObject { put("id", transfer.id); put("code", entered) }); entered = ""
            }
        }
        CampusCopy("Codes work once for 15 minutes, within the collection deadline. Five incorrect attempts require a replacement code.")
    }
}
