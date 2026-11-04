package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.*
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.compose.viewModel
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.Profile
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlin.math.roundToLong

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
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(lifecycle) { lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
        while (true) { now = System.currentTimeMillis(); delay(60_000) }
    } }
    val threadScroll = rememberThreadScroll(state.messages.size, state.hasOlder, state.scrollRequest)
    val list = threadScroll.list
    val scope = rememberCoroutineScope()
    val viewport = chatViewport()
    Box(Modifier.fillMaxSize().imePadding(), contentAlignment = Alignment.TopCenter) {
      Column(Modifier.widthIn(max = 768.dp).fillMaxSize().testTag("chat-thread-page").semantics {
        this[ChatConnected] = state.connected; this[ChatEvents] = state.events
        this[ChatConnections] = state.connections; this[ChatMessageCount] = state.messages.size
        this[ChatViewportWidth] = viewport.roundToLong().toInt()
      }.padding(horizontal = if (viewport >= 800) 40.dp else 16.dp, vertical = 24.dp)) {
        ChatHeader(state, openProfile, back)
        state.loan?.let { ChatLoanChip(it, openLoan) }
        if (state.error != null) TextButton(model::retry) { Text("RETRY", style = loanMono(9), color = Cargo.Warn) }
        if (!state.initialized && state.error == null) CircularProgressIndicator(Modifier.size(24.dp), color = Cargo.Accent)
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth().padding(horizontal = 4.dp)) {
            val bubbleWidth = maxWidth * .85f
            LazyColumn(Modifier.fillMaxSize().testTag("chat-messages"), state = list, contentPadding = PaddingValues(vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                if (state.hasOlder) item(key = "older") { CargoButton(if (state.loadingOlder) "Loading…" else "Load older messages", {
                    val anchor = list.layoutInfo.visibleItemsInfo.firstOrNull { it.key != "older" }
                    val offset = list.firstVisibleItemScrollOffset
                    val generation = state.scrollRequest
                    threadScroll.pauseFollowing()
                    scope.launch {
                        model.loadOlder()
                        anchor?.let { first ->
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
                    Text(if (state.community) "NOBODY HAS SAID ANYTHING YET. START THE CONVERSATION." else "SAY HELLO AND AGREE ON A PICKUP SPOT AND TIME.",
                        Modifier.fillMaxWidth().padding(vertical = 64.dp).testTag("chat-empty-thread"), style = loanBody(13),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center, color = Cargo.Ink.copy(alpha = .5f))
                }
                items(state.messages, key = { it.id }) { message ->
                    ChatMessageRow(message, message.sender_id == profile.id, now, bubbleWidth)
                }
            }
        }
        ChatComposer(state, model::updateDraft, model::send)
      }
    }
}
