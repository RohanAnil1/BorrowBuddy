package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.*
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.compose.viewModel
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.Profile
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlin.math.roundToLong
import java.time.Instant

val ChatConnected = SemanticsPropertyKey<Boolean>("ChatConnected")
val ChatEvents = SemanticsPropertyKey<Int>("ChatEvents")
val ChatConnections = SemanticsPropertyKey<Int>("ChatConnections")
val ChatMessageCount = SemanticsPropertyKey<Int>("ChatMessageCount")

@Composable fun ChatsScreen(repository: BorrowRepository, profile: Profile, open: (String) -> Unit) {
    LoadScreen(profile.id, { repository.conversationSummaries(profile.id) }) { chats -> ChatsContent(chats, open) }
}

@Composable fun ChatScreen(repository: BorrowRepository, profile: Profile, id: String,
    openLoan: (String) -> Unit, openProfile: (String) -> Unit, back: () -> Unit) {
    val model: ChatViewModel = viewModel(key = "thread-$id-${profile.id}", factory = object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T =
            ChatViewModel(repository, profile.id, id, extras.createSavedStateHandle()) as T
    })
    val state = model.ui
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, model) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START) model.start()
            if (event == Lifecycle.Event.ON_STOP) model.stop()
        }
        lifecycle.addObserver(observer)
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) model.start()
        onDispose { lifecycle.removeObserver(observer); model.stop() }
    }
    var searchOpen by rememberSaveable { mutableStateOf(false) }
    var query by rememberSaveable { mutableStateOf("") }
    val term = query.trim()
    val keyboardOpen = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    val focus = LocalFocusManager.current
    val visibleMessages = remember(state.messages, term) {
        if (term.isEmpty()) state.messages else state.messages.filter {
            "${it.body} ${it.sender?.full_name.orEmpty()}".contains(term, ignoreCase = true)
        }
    }
    val threadScroll = rememberThreadScroll(state.messages.size, state.hasOlder, state.scrollRequest)
    val searchList = rememberLazyListState()
    val list = if (term.isEmpty()) threadScroll.list else searchList
    LaunchedEffect(term) { if (term.isNotEmpty()) searchList.scrollToItem(0) }
    val scope = rememberCoroutineScope()
    val viewport = chatViewport()
    Box(Modifier.fillMaxSize().imePadding(), contentAlignment = Alignment.TopCenter) {
      Column(Modifier.widthIn(max = 1000.dp).fillMaxSize().testTag("chat-thread-page").semantics {
        this[ChatConnected] = state.connected; this[ChatEvents] = state.events
        this[ChatConnections] = state.connections; this[ChatMessageCount] = state.messages.size
        this[ChatViewportWidth] = viewport.roundToLong().toInt()
      }.padding(horizontal = if (viewport >= 800) 32.dp else 8.dp, vertical = 6.dp).background(ChatPanel)) {
        ChatHeader(state, openProfile, back, searchOpen) {
            searchOpen = !searchOpen
            if (!searchOpen) {
                focus.clearFocus()
                query = ""
            }
        }
        if (!keyboardOpen) state.loan?.let { ChatLoanChip(it, openLoan) }
        if (state.initialized && !state.connected && !keyboardOpen) {
            Text("Connecting to chat…", Modifier.padding(horizontal = 13.dp, vertical = 5.dp), style = loanBody(11), color = ChatMuted)
        }
        if (searchOpen) {
            Column(Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                ChatSearchField("Search loaded messages", query, { query = it })
                if (term.isNotEmpty()) Text("${visibleMessages.size} matching loaded messages", style = loanBody(11), color = ChatMuted)
            }
        }
        if (state.error != null) TextButton(model::retry) { Text("RETRY", style = loanMono(9), color = Cargo.Warn) }
        if (!state.initialized && state.error == null) CircularProgressIndicator(Modifier.size(24.dp), color = Cargo.Accent)
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth().background(ChatHistory).padding(horizontal = 11.dp)) {
            val bubbleWidth = minOf(maxWidth * .86f, 560.dp)
            LazyColumn(Modifier.fillMaxSize().testTag("chat-messages"), state = list, contentPadding = PaddingValues(top = 6.dp, bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                if (state.hasOlder) item(key = "older") { CargoButton(if (state.loadingOlder) "Loading…" else "Load older messages", {
                    val anchor = list.layoutInfo.visibleItemsInfo.firstOrNull { it.key != "older" }
                    val offset = list.firstVisibleItemScrollOffset
                    val generation = state.scrollRequest
                    threadScroll.pauseFollowing()
                    scope.launch {
                        model.loadOlder()
                        anchor?.takeIf { term.isEmpty() }?.let { first ->
                            val index = model.ui.messages.indexOfFirst { it.id == first.key }
                            if (index >= 0) {
                                val expected = model.ui.messages.size + if (model.ui.hasOlder) 1 else 0
                                snapshotFlow { list.layoutInfo.totalItemsCount }.first { it >= expected }
                                // A new send/receipt owns the latest-message position;
                                // a late history response must not overwrite it.
                                if (model.ui.scrollRequest == generation && !threadScroll.following.value) {
                                    list.scrollToItem(index + if (model.ui.hasOlder) 1 else 0, offset)
                                }
                            }
                        }
                    }
                }, enabled = !state.loadingOlder, secondary = true) }
                if (state.initialized && state.messages.isEmpty()) item {
                    Text(if (state.community) "Start the conversation" else "Plan your handover",
                        Modifier.fillMaxWidth().padding(vertical = 64.dp).testTag("chat-empty-thread"), style = loanBody(13),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center, color = Cargo.Ink.copy(alpha = .5f))
                }
                if (term.isNotEmpty() && visibleMessages.isEmpty()) item(key = "no-matches") {
                    Text("No matching messages. Try another term or load earlier messages.",
                        Modifier.fillMaxWidth().padding(12.dp), style = loanBody(12), textAlign = androidx.compose.ui.text.style.TextAlign.Center, color = ChatMuted)
                }
                itemsIndexed(visibleMessages, key = { _, message -> message.id }) { index, message ->
                    val previous = visibleMessages.getOrNull(index - 1)
                    val day = chatDay(message)
                    val newDay = previous == null || chatDay(previous) != day
                    val startsGroup = previous == null || newDay || previous.sender_id != message.sender_id ||
                        Instant.parse(message.created_at).epochSecond - Instant.parse(previous.created_at).epochSecond > 300
                    val next = visibleMessages.getOrNull(index + 1)
                    val endsGroup = next == null || next.sender_id != message.sender_id || chatDay(next) != day ||
                        Instant.parse(next.created_at).epochSecond - Instant.parse(message.created_at).epochSecond > 300
                    ChatMessageRow(message, message.sender_id == profile.id, day.takeIf { newDay }, startsGroup, endsGroup, bubbleWidth)
                }
            }
            if (term.isEmpty() && !threadScroll.following.value && list.canScrollForward && !keyboardOpen) {
                Box(Modifier.align(Alignment.BottomEnd).padding(6.dp).background(ChatRaised)) {
                    ChatTextAction("Latest messages", { threadScroll.following.value = true })
                }
            }
        }
        ChatComposer(state, model::updateDraft, {
            if (state.draft.isNotBlank() && !state.sending && state.initialized) {
                query = ""
                model.send()
            }
        }, showSuggestions = !keyboardOpen && !searchOpen)
      }
    }
}
