package `in`.borrowbuddy.android.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
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
            ChatViewModel(repository, profile.id, id, extras.createSavedStateHandle(), profile.is_admin, profile.full_name) as T
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
    var membersOpen by rememberSaveable { mutableStateOf(false) }
    var pollOpen by rememberSaveable { mutableStateOf(false) }
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(model::sendPhoto) }
    if (pollOpen) PollDialog({ pollOpen = false }) { question, options -> model.createPoll(question, options) { pollOpen = false } }
    val keyboardOpen = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    val focus = LocalFocusManager.current
    val threadScroll = rememberThreadScroll(state.messages.size, state.hasOlder, state.scrollRequest)
    val list = threadScroll.list
    LaunchedEffect(query, searchOpen) { if (searchOpen) model.search(query) }
    // Jump to a search result or quoted message once it's loaded.
    LaunchedEffect(state.revealRequest) {
        val target = state.highlight ?: return@LaunchedEffect
        val index = model.ui.messages.indexOfFirst { it.id == target }
        if (index >= 0) {
            threadScroll.pauseFollowing()
            list.scrollToItem(index + if (model.ui.hasOlder) 1 else 0)
            delay(2_400); model.clearHighlight()
        }
    }
    val scope = rememberCoroutineScope()
    val viewport = chatViewport()
    val closeSearch = { searchOpen = false; focus.clearFocus(); query = "" }
    Box(Modifier.fillMaxSize().imePadding(), contentAlignment = Alignment.TopCenter) {
      Column(Modifier.widthIn(max = 1000.dp).fillMaxSize().testTag("chat-thread-page").semantics {
        this[ChatConnected] = state.connected; this[ChatEvents] = state.events
        this[ChatConnections] = state.connections; this[ChatMessageCount] = state.messages.size
        this[ChatViewportWidth] = viewport.roundToLong().toInt()
      }.padding(horizontal = if (viewport >= 800) 32.dp else 8.dp, vertical = 6.dp).background(ChatPanel)) {
        ChatHeader(state, openProfile, back, searchOpen, { if (searchOpen) closeSearch() else searchOpen = true }, model::toggleMute)
        if (state.community && !keyboardOpen) ChatGroupStrip(state, membersOpen, { membersOpen = !membersOpen }, openProfile) { model.leave(back) }
        if (!keyboardOpen) state.loan?.let { ChatLoanChip(it, openLoan) }
        if (!keyboardOpen) ChatPinnedBar(state, model::reveal, if (state.canPin) { message -> model.pin(message, false) } else null)
        if (state.initialized && !state.connected && !keyboardOpen) {
            Text("Connecting to chat…", Modifier.padding(horizontal = 13.dp, vertical = 5.dp), style = loanBody(11), color = ChatMuted)
        }
        if (searchOpen) {
            Column(Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                ChatSearchField("Search this chat", query, { query = it })
                if (query.trim().length >= 2) {
                    val hits = state.searchHits
                    Text(when {
                        state.searching -> "Searching…"
                        hits == null -> ""
                        hits.size >= 30 -> "30+ matches"
                        else -> "${hits.size} ${if (hits.size == 1) "match" else "matches"}"
                    }, style = loanBody(11), color = ChatMuted)
                    if (!hits.isNullOrEmpty()) Column(Modifier.heightIn(max = 240.dp).verticalScroll(rememberScrollState()).testTag("chat-search-results")) {
                        hits.forEach { hit ->
                            Column(Modifier.fillMaxWidth().clickable(role = Role.Button) { closeSearch(); model.reveal(hit.id) }
                                .padding(horizontal = 6.dp, vertical = 7.dp)) {
                                Text("${if (hit.sender_id == profile.id) "You" else hit.sender_name ?: "Campus member"} · ${chatDayOf(hit.created_at)}",
                                    style = loanBody(10), color = ChatMuted)
                                Text(hit.body, style = loanBody(12), color = Cargo.Ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            }
        }
        if (state.error != null) TextButton(model::retry) { Text("RETRY", style = loanMono(9), color = Cargo.Warn) }
        if (!state.initialized && state.error == null) CircularProgressIndicator(Modifier.size(24.dp), color = Cargo.Accent)
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth().background(ChatHistory).padding(horizontal = 11.dp)) {
            val bubbleWidth = minOf(maxWidth * .86f, 560.dp)
            val byId = remember(state.messages) { state.messages.associateBy { it.id } }
            LazyColumn(Modifier.fillMaxSize().testTag("chat-messages"), state = list, contentPadding = PaddingValues(top = 6.dp, bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
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
                    Text(if (state.community) "Start the conversation" else "Plan your handover",
                        Modifier.fillMaxWidth().padding(vertical = 64.dp).testTag("chat-empty-thread"), style = loanBody(13),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center, color = Cargo.Ink.copy(alpha = .5f))
                }
                itemsIndexed(state.messages, key = { _, message -> message.id }) { index, message ->
                    val previous = state.messages.getOrNull(index - 1)
                    val day = chatDay(message)
                    val newDay = previous == null || chatDay(previous) != day
                    val startsGroup = previous == null || newDay || previous.sender_id != message.sender_id ||
                        Instant.parse(message.created_at).epochSecond - Instant.parse(previous.created_at).epochSecond > 300
                    val next = state.messages.getOrNull(index + 1)
                    val endsGroup = next == null || next.sender_id != message.sender_id || chatDay(next) != day ||
                        Instant.parse(next.created_at).epochSecond - Instant.parse(message.created_at).epochSecond > 300
                    val mine = message.sender_id == profile.id
                    val quoted = message.reply_to_id?.let { byId[it] ?: state.quoted[it] }
                    ChatMessageRow(message, mine, day.takeIf { newDay }, startsGroup, endsGroup, bubbleWidth,
                        actions = MessageActions(
                            userId = profile.id, canPost = state.canPost, canDelete = mine || profile.is_admin,
                            quote = message.reply_to_id?.let { quotePreview(quoted, profile.id) },
                            highlighted = state.highlight == message.id,
                            react = { emoji -> model.react(message, emoji) },
                            reply = { model.startReply(message) }, edit = { model.startEdit(message) },
                            delete = { model.delete(message) },
                            openQuote = { message.reply_to_id?.let(model::reveal) },
                            canReact = state.canReact, canPin = state.canPin, pin = { pinned -> model.pin(message, pinned) },
                            vote = { option -> model.vote(message, option) }, canClosePoll = mine || profile.is_admin,
                            closePoll = { closed -> model.closePoll(message, closed) },
                            mentionNames = state.mentionables.map { it.full_name }, myName = profile.full_name,
                            photo = { path -> PrivatePhoto(repository, "chat-images", path,
                                Modifier.size(220.dp, 165.dp).clip(RoundedCornerShape(6.dp)).testTag("chat-photo-${message.id}"), previewScale = ContentScale.Crop) },
                        ))
                }
            }
            if (!threadScroll.following.value && list.canScrollForward && !keyboardOpen) {
                Box(Modifier.align(Alignment.BottomEnd).padding(6.dp).background(ChatRaised)) {
                    ChatTextAction("Latest messages", { threadScroll.following.value = true })
                }
            }
        }
        if (state.typingLabel.isNotEmpty()) Text(state.typingLabel, Modifier.padding(horizontal = 13.dp, vertical = 3.dp).testTag("chat-typing"),
            style = loanBody(11).copy(fontStyle = androidx.compose.ui.text.font.FontStyle.Italic), color = ChatMuted)
        if (state.canPost) ChatComposer(state, model::updateDraft, {
            if (state.draft.isNotBlank() && !state.sending && state.initialized) {
                if (searchOpen) closeSearch()
                model.send()
            }
        }, showSuggestions = !keyboardOpen && !searchOpen, cancelContext = model::cancelCompose,
            pickPhoto = { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
            openPoll = if (state.canPoll) ({ pollOpen = true }) else null, pickMention = model::pickMention)
        else if (state.initialized) ChatClosedComposer(state, model::join)
      }
    }
}
