package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.*
import androidx.compose.ui.platform.*
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.domain.*
import kotlin.math.roundToInt
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

val ChatViewportWidth = SemanticsPropertyKey<Int>("ChatViewportWidth")
val ChatBubbleMine = SemanticsPropertyKey<Boolean>("ChatBubbleMine")
@Composable internal fun chatViewport() = LocalWindowInfo.current.containerSize.width / LocalDensity.current.density

internal val ChatPanel = Color(0xff13161b)
internal val ChatHistory = Color(0xff101217)
internal val ChatRaised = Color(0xff1c2129)
internal val ChatBorder = Color(0xff2b313a)
internal val ChatMuted = Color(0xffa4adba)
internal val ChatAmber = Color(0xffefb35a)
private val chatDayFormat = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH).withZone(ZoneId.of("Asia/Kolkata"))
private val chatTimeFormat = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH).withZone(ZoneId.of("Asia/Kolkata"))
internal fun chatDay(message: Message) = chatDayFormat.format(Instant.parse(message.created_at))

@Composable internal fun ChatSearchField(label: String, value: String, update: (String) -> Unit, modifier: Modifier = Modifier) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val shape = RoundedCornerShape(10.dp)
    BasicTextField(
        value, update, modifier.fillMaxWidth().background(ChatHistory, shape)
            .border(1.dp, if (focused) ChatAmber else ChatBorder, shape).semantics { contentDescription = label },
        interactionSource = interaction, singleLine = true, textStyle = loanBody(13).copy(color = Cargo.Ink),
        cursorBrush = SolidColor(ChatAmber),
        decorationBox = { inner ->
            Row(Modifier.heightIn(min = 46.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                Icon(painterResource(R.drawable.ic_search), null, Modifier.size(16.dp), tint = ChatMuted)
                Box(Modifier.weight(1f)) {
                    if (value.isEmpty()) Text(label, style = loanBody(13), color = ChatMuted)
                    inner()
                }
            }
        },
    )
}

@Composable internal fun ChatTextAction(label: String, onClick: () -> Unit, selected: Boolean? = null) {
    val interactions = remember { MutableInteractionSource() }
    val focused by interactions.collectIsFocusedAsState()
    val action = if (selected == null) {
        Modifier.clickable(interactions, LocalIndication.current, role = Role.Button, onClick = onClick)
    } else {
        Modifier.selectable(selected, interactions, LocalIndication.current, role = Role.Tab, onClick = onClick)
    }
    Box(Modifier.heightIn(min = 40.dp).then(action).drawBehind {
        if (selected == true || focused) {
            val thickness = 2.dp.toPx()
            drawLine(ChatAmber, Offset(0f, size.height - thickness / 2), Offset(size.width, size.height - thickness / 2), thickness)
        }
    }.padding(horizontal = 9.dp, vertical = 6.dp), contentAlignment = Alignment.Center) {
        Text(label, style = loanBody(12), color = if (selected == true || focused) Cargo.Ink else ChatMuted)
    }
}

private enum class ChatFilter(val label: String) { All("All"), Unread("Unread"), Groups("Groups"), Loans("Loans") }

@Composable internal fun ChatsContent(chats: List<ConversationSummary>, open: (String) -> Unit) {
    val viewport = chatViewport()
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(ChatFilter.All) }
    val term = query.trim()
    val matches = chats.filter {
        val visible = when (filter) {
            ChatFilter.All -> true
            ChatFilter.Unread -> it.unread
            ChatFilter.Groups -> it.conversation.type == "community"
            ChatFilter.Loans -> it.conversation.type == "private"
        }
        visible && "${it.title} ${it.latest?.body.orEmpty()}".contains(term, ignoreCase = true)
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        LazyColumn(Modifier.widthIn(max = 760.dp).fillMaxSize().imePadding().testTag("chat-list").semantics {
            this[ChatViewportWidth] = viewport.roundToInt()
        }, contentPadding = PaddingValues(horizontal = if (viewport >= 800) 32.dp else 12.dp, vertical = 14.dp)) {
            item("filters") {
                Column(Modifier.fillMaxWidth().background(ChatPanel, RoundedCornerShape(topStart = 10.dp, topEnd = 10.dp))
                    .padding(start = 13.dp, top = 13.dp, end = 13.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val unread = chats.count { it.unread }
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Messages", Modifier.weight(1f).testTag("chat-list-title").semantics { heading() },
                            style = loanBody(24).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
                        if (unread > 0) Text("$unread unread ${if (unread == 1) "chat" else "chats"}", style = loanBody(11), color = ChatMuted)
                    }
                    ChatSearchField("Search conversations", query, { query = it })
                    FlowRow(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                        ChatFilter.entries.forEach { option -> ChatTextAction(option.label, { filter = option }, selected = filter == option) }
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(ChatBorder))
                }
            }
            if (matches.isEmpty()) item("empty") {
                if (chats.isEmpty()) ChatEmptyList()
                else Text(if (filter == ChatFilter.Unread && term.isEmpty()) "You’re caught up" else "No matching conversations",
                    Modifier.fillMaxWidth().background(ChatPanel).padding(24.dp), style = loanBody(13), color = ChatMuted, textAlign = TextAlign.Center)
            }
            val mine = matches.filter { it.isMember }
            val joinable = matches.filter { !it.isMember }
            items(mine, key = { it.conversation.id }) { chat -> ChatDirectoryRow(chat, open) }
            if (joinable.isNotEmpty()) item("joinable-heading") {
                Text("GROUPS YOU CAN JOIN", Modifier.fillMaxWidth().background(ChatPanel).padding(start = 13.dp, top = 14.dp, bottom = 6.dp)
                    .semantics { heading() }, style = loanMono(9), color = ChatMuted)
            }
            items(joinable, key = { it.conversation.id }) { chat -> ChatDirectoryRow(chat, open) }
        }
    }
}

/** "Public group · 12 members", "Private group · Announcements", "Archived public group". */
internal fun groupKind(visibility: String, archived: Boolean, members: Int?, posting: String = "everyone"): String {
    val base = if (visibility == "invite") "private group" else "public group"
    val kind = if (archived) "Archived $base" else base.replaceFirstChar { it.uppercase() }
    return listOfNotNull(kind, "Announcements".takeIf { posting == "admins" },
        members?.let { "$it ${if (it == 1) "member" else "members"}" }).joinToString(" · ")
}

internal fun chatPreview(chat: ConversationSummary): String {
    val community = chat.conversation.type == "community"
    if (!chat.isMember) return groupKind(chat.conversation.visibility, chat.conversation.archived_at != null, chat.memberCount, chat.conversation.posting)
    val latest = chat.latest ?: return if (community) "Say hello to the group" else "Plan your pickup or return"
    val text = if (latest.deleted_at != null) "Message deleted" else latest.body.ifBlank { if (latest.image_path != null) "Photo" else "Message" }
    return chat.latestSender?.let { "$it: $text" } ?: text
}

@Composable private fun ChatDirectoryRow(chat: ConversationSummary, open: (String) -> Unit) {
            run {
                val community = chat.conversation.type == "community"
                val interactions = remember { MutableInteractionSource() }
                val hovered by interactions.collectIsHoveredAsState()
                val focused by interactions.collectIsFocusedAsState()
                Row(Modifier.fillMaxWidth().testTag("conversation-${chat.conversation.id}")
                    .background(if (hovered || focused) ChatRaised else ChatPanel)
                    .drawBehind { drawLine(ChatBorder.copy(alpha = .55f), Offset(13.dp.toPx(), size.height), Offset(size.width - 13.dp.toPx(), size.height)) }
                    .hoverable(interactions).clickable(interactions, LocalIndication.current) { open(chat.conversation.id) }.padding(horizontal = 13.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(36.dp).background(if (community) Color(0xff233347) else Color(0xff2b333f), CircleShape),
                        contentAlignment = Alignment.Center) {
                        val initials = chat.title.trim().split(Regex("\\s+")).take(2).mapNotNull { it.firstOrNull() }.joinToString("").uppercase()
                        val icon = when {
                            !community -> null
                            chat.conversation.posting == "admins" -> R.drawable.ic_megaphone
                            chat.conversation.visibility == "invite" -> R.drawable.ic_lock
                            else -> R.drawable.ic_globe
                        }
                        if (icon == null) Text(initials, style = loanBody(11), color = Color(0xffd4dbe7))
                        else Icon(painterResource(icon), null, Modifier.size(16.dp), tint = Color(0xffd4dbe7))
                    }
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(chat.title, Modifier.weight(1f, fill = false), style = loanBody(14).copy(fontFamily = Cargo.Strong), color = Cargo.Ink,
                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (community) Text(if (chat.conversation.visibility == "invite") "Private" else "Public",
                                Modifier.border(1.dp, ChatBorder, RoundedCornerShape(3.dp)).padding(horizontal = 4.dp), style = loanBody(9), color = ChatMuted)
                            if (chat.muted) Icon(painterResource(R.drawable.ic_bell_off), "Muted", Modifier.size(12.dp), tint = ChatMuted)
                            if (chat.unreadCount > 0) {
                                val count = if (chat.unreadCount >= 100) "99+" else chat.unreadCount.toString()
                                Text(count, Modifier.background(ChatAmber, RoundedCornerShape(10.dp)).padding(horizontal = 6.dp, vertical = 1.dp)
                                    .semantics { contentDescription = "$count unread" }.testTag("chat-unread-${chat.conversation.id}"),
                                    style = loanBody(10).copy(fontFamily = Cargo.Strong), color = Cargo.Panel)
                            }
                        }
                        Text(chatPreview(chat),
                            Modifier.padding(top = 4.dp), style = loanBody(12), color = ChatMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (!chat.isMember) Text("JOIN", style = loanMono(9), color = ChatAmber)
                    else chat.latest?.let { Text(loanRelativeTime(it.created_at), style = loanMono(9), color = ChatMuted) }
                }
            }
}

@Composable private fun ChatEmptyList() {
    Column(Modifier.fillMaxWidth().background(ChatPanel).padding(horizontal = 24.dp, vertical = 32.dp)
        .testTag("chat-empty-list"), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("No conversations yet", style = loanBody(16).copy(fontFamily = Cargo.Strong), color = Cargo.Ink, textAlign = TextAlign.Center)
        Text("An approved loan opens a private chat for pickup and return.",
            Modifier.padding(top = 6.dp).widthIn(max = 360.dp), style = loanBody(13), color = ChatMuted, textAlign = TextAlign.Center)
    }
}

@Composable private fun ChatIconAction(icon: Int, label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val interactions = remember { MutableInteractionSource() }
    val hovered by interactions.collectIsHoveredAsState()
    val focused by interactions.collectIsFocusedAsState()
    Box(modifier.size(44.dp).background(if (hovered || focused) ChatRaised else Color.Transparent, RoundedCornerShape(7.dp))
        .hoverable(interactions).clickable(interactions, LocalIndication.current, role = Role.Button, onClick = onClick)
        .semantics { contentDescription = label }, contentAlignment = Alignment.Center) {
        Icon(painterResource(icon), null, Modifier.size(19.dp), tint = if (focused) ChatAmber else ChatMuted)
    }
}

@Composable internal fun ChatHeader(
    state: ChatUiState, openProfile: (String) -> Unit, back: () -> Unit,
    searchOpen: Boolean, toggleSearch: () -> Unit, toggleMute: (() -> Unit)? = null,
) {
    Column(Modifier.fillMaxWidth().background(ChatPanel).testTag("chat-thread-header")) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 7.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            ChatIconAction(R.drawable.ic_arrow_left, "Back to chats", Modifier.testTag("chat-back"), back)
            Column(Modifier.weight(1f)) {
                Text(state.title, Modifier.testTag("chat-thread-title").semantics { heading() },
                    style = loanBody(17).copy(fontFamily = Cargo.Strong), color = Cargo.Ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(if (state.community) groupKind(state.visibility, state.archived, state.members.size, state.posting) else "Private loan chat",
                    style = loanBody(11), color = ChatMuted)
            }
            state.counterpart?.let { user ->
                Row(Modifier.heightIn(min = 44.dp).clickable(role = Role.Button) { openProfile(user.id) }
                    .semantics { contentDescription = "Open counterparty profile" }.padding(horizontal = 5.dp).testTag("chat-trust"),
                    horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(painterResource(R.drawable.ic_star), null, Modifier.size(13.dp), tint = ChatAmber)
                    Text(user.trust_score.roundToInt().toString(), style = loanBody(11), color = ChatMuted)
                }
            }
            if (toggleMute != null && state.isMember) ChatIconAction(if (state.muted) R.drawable.ic_bell_off else R.drawable.ic_bell,
                if (state.muted) "Unmute this chat" else "Mute this chat", Modifier.testTag("chat-mute"), toggleMute)
            ChatIconAction(if (searchOpen) R.drawable.ic_x else R.drawable.ic_search,
                if (searchOpen) "Close search" else "Search this chat", onClick = toggleSearch)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(ChatBorder))
    }
}

@Composable internal fun ChatLoanChip(loan: Loan, openLoan: (String) -> Unit) {
    Column {
        Row(Modifier.fillMaxWidth().clickable(role = Role.Button) { openLoan(loan.id) }
            .padding(horizontal = 13.dp, vertical = 8.dp).testTag("chat-loan-link"),
            horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(painterResource(R.drawable.ic_box), null, Modifier.size(17.dp), tint = ChatMuted)
            Column(Modifier.weight(1f)) {
                Text(loan.item?.title ?: "Loan details", style = loanBody(12).copy(fontFamily = Cargo.Strong),
                    color = Cargo.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                val status = Rules.loanLabels[loan.status] ?: loan.status.replace('_', ' ')
                Text("$status · Due ${loan.due_date}", style = loanBody(11), color = ChatMuted)
            }
            Icon(painterResource(R.drawable.ic_external_link), null, Modifier.size(15.dp), tint = ChatMuted)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(ChatBorder))
    }
}

/** What you can do with one message, and its reply preview. */
internal data class MessageActions(
    val userId: String, val canPost: Boolean, val canDelete: Boolean,
    val quote: Pair<String, String>? = null, val highlighted: Boolean = false,
    val react: (String) -> Unit = {}, val reply: () -> Unit = {}, val edit: () -> Unit = {},
    val delete: () -> Unit = {}, val openQuote: () -> Unit = {},
    /** Reacting and voting (members, including in announcement-only groups). */
    val canReact: Boolean = canPost, val canPin: Boolean = false, val pin: (Boolean) -> Unit = {},
    val vote: (Int) -> Unit = {}, val canClosePoll: Boolean = false, val closePoll: (Boolean) -> Unit = {},
    /** Names to pick out as @mentions in the text. */
    val mentionNames: List<String> = emptyList(), val myName: String = "",
    val photo: (@Composable (String) -> Unit)? = null,
)

/** Message text with known @mentions in bold amber (your own on a tint). */
internal fun mentionText(text: String, names: List<String>, myName: String): androidx.compose.ui.text.AnnotatedString {
    val known = (names + myName).filter { it.isNotBlank() }.distinct().sortedByDescending { it.length }
    if (known.isEmpty() || '@' !in text) return androidx.compose.ui.text.AnnotatedString(text)
    val pattern = Regex("@(" + known.joinToString("|") { Regex.escape(it) } + ")")
    return androidx.compose.ui.text.buildAnnotatedString {
        var last = 0
        pattern.findAll(text).forEach { match ->
            append(text.substring(last, match.range.first))
            val mine = match.value == "@$myName"
            pushStyle(androidx.compose.ui.text.SpanStyle(color = Color(0xffffd08c), fontFamily = Cargo.Strong,
                background = if (mine) Color(0x2eefb35a) else Color.Transparent))
            append(match.value); pop()
            last = match.range.last + 1
        }
        append(text.substring(last))
    }
}

@Composable internal fun PollCard(poll: Poll, userId: String, canVote: Boolean, canClose: Boolean, vote: (Int) -> Unit, close: (Boolean) -> Unit) {
    val counts = poll.options.indices.map { poll.votes[it.toString()].orEmpty().size }
    val total = counts.sum()
    val mine = poll.options.indices.firstOrNull { userId in poll.votes[it.toString()].orEmpty() }
    Column(Modifier.widthIn(min = 220.dp).testTag("chat-poll"), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(painterResource(R.drawable.ic_chart), null, Modifier.size(14.dp), tint = ChatAmber)
            Text(poll.question, style = loanBody(14).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
        }
        poll.options.forEachIndexed { index, option ->
            val share = if (total == 0) 0f else counts[index].toFloat() / total
            val chosen = mine == index
            Box(Modifier.fillMaxWidth().heightIn(min = 38.dp).border(1.dp, if (chosen) ChatAmber else ChatBorder, RoundedCornerShape(6.dp))
                .clickable(enabled = canVote && !poll.closed, role = Role.Button) { vote(index) }
                .semantics { contentDescription = "$option: ${counts[index]} ${if (counts[index] == 1) "vote" else "votes"}${if (chosen) ", your vote" else ""}"; selected = chosen }) {
                Box(Modifier.matchParentSize().drawBehind { drawRect(Color(0x24efb35a), size = size.copy(width = size.width * share)) })
                Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (chosen) Icon(painterResource(R.drawable.ic_check), null, Modifier.size(13.dp), tint = ChatAmber)
                    Text(option, Modifier.weight(1f), style = loanBody(13), color = Cargo.Ink)
                    Text(counts[index].toString(), style = loanBody(12), color = ChatMuted)
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("$total ${if (total == 1) "vote" else "votes"}" + when {
                poll.closed -> " · Closed"
                !canVote -> ""
                mine != null -> " · Tap again to take it back"
                else -> " · One vote each"
            }, Modifier.weight(1f, fill = false), style = loanBody(11), color = ChatMuted)
            if (canClose) ChatTextAction(if (poll.closed) "Reopen" else "Close poll", { close(!poll.closed) })
        }
    }
}

/** Who a reply quotes and a one-line preview, or a placeholder when the message isn't loaded yet. */
internal fun quotePreview(quoted: Message?, userId: String): Pair<String, String> {
    if (quoted == null) return "Earlier message" to ""
    val name = if (quoted.sender_id == userId) "You" else quoted.sender?.full_name ?: "Campus member"
    val text = when {
        quoted.deleted_at != null -> "Message deleted"
        quoted.poll != null -> "Poll: ${quoted.poll.question}"
        else -> quoted.body.ifBlank { "Photo" }.replace(Regex("\\s+"), " ")
    }
    return name to text
}

internal fun chatDayOf(iso: String): String = runCatching { chatDayFormat.format(Instant.parse(iso)) }.getOrDefault("")

@Composable internal fun ChatMessageRow(
    message: Message, mine: Boolean, day: String?, startsGroup: Boolean, endsGroup: Boolean, bubbleWidth: Dp,
    actions: MessageActions = MessageActions("", canPost = false, canDelete = false),
) {
    val context = LocalContext.current
    var menuOpen by remember(message.id) { mutableStateOf(false) }
    var confirmDelete by remember(message.id) { mutableStateOf(false) }
    val deleted = message.deleted_at != null
    if (confirmDelete) androidx.compose.material3.AlertDialog(onDismissRequest = { confirmDelete = false },
        title = { Text(if (mine) "Delete this message?" else "Delete as admin?") },
        text = { Text("It will show as “Message deleted” for everyone in this chat. This can’t be undone.") },
        confirmButton = { androidx.compose.material3.TextButton({ confirmDelete = false; actions.delete() }) { Text("Delete", color = Cargo.Warn) } },
        dismissButton = { androidx.compose.material3.TextButton({ confirmDelete = false }) { Text("Keep it") } },
        containerColor = ChatRaised)
    Column(Modifier.fillMaxWidth().testTag("message-${message.id}"), horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
        if (day != null) {
            Row(Modifier.fillMaxWidth().padding(vertical = 9.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                Box(Modifier.weight(1f).height(1.dp).background(ChatBorder))
                Text(day, style = loanBody(10), color = ChatMuted)
                Box(Modifier.weight(1f).height(1.dp).background(ChatBorder))
            }
        }
        Column(Modifier.widthIn(max = bubbleWidth).padding(top = if (startsGroup) 7.dp else 0.dp),
            horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
            if (!mine && startsGroup) Text(message.sender?.full_name ?: "Campus member", Modifier.padding(start = 3.dp, bottom = 3.dp),
                style = loanBody(11).copy(fontFamily = Cargo.Strong), color = ChatMuted)
            actions.quote?.let { (name, text) ->
                Row(Modifier.padding(bottom = 3.dp).background(Color(0x08ffffff), RoundedCornerShape(5.dp))
                    .clickable(role = Role.Button, onClickLabel = "Show the quoted message", onClick = actions.openQuote)
                    .drawBehind { drawLine(ChatAmber, Offset(0f, 0f), Offset(0f, size.height), 2.dp.toPx()) }
                    .padding(horizontal = 9.dp, vertical = 5.dp).testTag("chat-quote-${message.id}"),
                    horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text(name, style = loanBody(11).copy(fontFamily = Cargo.Strong), color = Color(0xffd4dbe7), maxLines = 1)
                    Text(text, style = loanBody(11), color = ChatMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
            Box {
                val shape = RoundedCornerShape(8.dp)
                val mentioned = !mine && actions.userId in message.mentions
                Column(Modifier.testTag("chat-bubble-${message.id}").semantics { this[ChatBubbleMine] = mine }
                    .then(if (deleted) Modifier.border(1.dp, ChatBorder, shape)
                        else Modifier.background(if (mine) Color(0xff333b48) else Color(0xff232832), shape))
                    .then(if (actions.highlighted) Modifier.border(2.dp, ChatAmber, shape) else if (mentioned)
                        Modifier.drawBehind { drawLine(ChatAmber, Offset(0f, 0f), Offset(0f, size.height), 3.dp.toPx()) } else Modifier)
                    .then(if (deleted) Modifier else Modifier.combinedClickable(onClickLabel = "Message options", onClick = { menuOpen = true },
                        onLongClickLabel = "Message options", onLongClick = { menuOpen = true }))
                    .padding(horizontal = 11.dp, vertical = 7.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    if (message.pinned_at != null && !deleted) Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(painterResource(R.drawable.ic_pin), null, Modifier.size(11.dp), tint = ChatAmber)
                        Text("Pinned", style = loanBody(10), color = ChatAmber)
                    }
                    val poll = message.poll
                    when {
                        deleted -> Text("Message deleted", style = loanBody(14).copy(lineHeight = 22.sp, fontStyle = androidx.compose.ui.text.font.FontStyle.Italic), color = ChatMuted)
                        poll != null -> PollCard(poll, actions.userId, actions.canReact, actions.canClosePoll, actions.vote, actions.closePoll)
                        else -> {
                            message.image_path?.let { path -> actions.photo?.invoke(path) }
                            val body = message.body + if (message.edited_at != null) "  (edited)" else ""
                            if (message.body.isNotBlank() || message.image_path == null)
                                Text(mentionText(body.ifBlank { "Message" }, actions.mentionNames, actions.myName),
                                    style = loanBody(14).copy(lineHeight = 22.sp), color = Cargo.Ink)
                        }
                    }
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }, containerColor = ChatRaised) {
                    if (actions.canReact) Row(Modifier.padding(horizontal = 6.dp).testTag("chat-reaction-picker"), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        MessageReactions.forEach { emoji ->
                            val reacted = actions.userId in message.reactions[emoji].orEmpty()
                            Box(Modifier.size(38.dp).background(if (reacted) Color(0x24efb35a) else Color.Transparent, RoundedCornerShape(7.dp))
                                .clickable(role = Role.Button) { menuOpen = false; actions.react(emoji) }
                                .semantics { contentDescription = "React $emoji" }, contentAlignment = Alignment.Center) {
                                Text(emoji, fontSize = 18.sp)
                            }
                        }
                    }
                    if (actions.canPost) DropdownMenuItem(text = { Text("Reply") }, onClick = { menuOpen = false; actions.reply() })
                    DropdownMenuItem(text = { Text("Copy message") }, onClick = {
                        val clip = android.content.ClipData.newPlainText("BorrowBuddy message", message.poll?.question ?: message.body)
                        clip.description.extras = android.os.PersistableBundle().apply { putBoolean("android.content.extra.IS_SENSITIVE", true) }
                        context.getSystemService(android.content.ClipboardManager::class.java).setPrimaryClip(clip)
                        menuOpen = false
                    })
                    if (actions.canPin) DropdownMenuItem(text = { Text(if (message.pinned_at != null) "Unpin" else "Pin") },
                        onClick = { menuOpen = false; actions.pin(message.pinned_at == null) })
                    if (mine && actions.canPost && message.poll == null && message.body.isNotBlank())
                        DropdownMenuItem(text = { Text("Edit") }, onClick = { menuOpen = false; actions.edit() })
                    if (actions.canDelete) DropdownMenuItem(text = { Text(if (mine) "Delete" else "Delete as admin", color = Cargo.Warn) },
                        onClick = { menuOpen = false; confirmDelete = true })
                }
            }
            val reactions = message.reactions.filterValues { it.isNotEmpty() }
            if (reactions.isNotEmpty()) FlowRow(Modifier.padding(top = 3.dp).testTag("chat-reactions-${message.id}"), horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)) {
                reactions.forEach { (emoji, users) ->
                    val reacted = actions.userId in users
                    Row(Modifier.heightIn(min = 28.dp).background(if (reacted) Color(0x24efb35a) else ChatPanel, RoundedCornerShape(14.dp))
                        .border(1.dp, if (reacted) ChatAmber else ChatBorder, RoundedCornerShape(14.dp))
                        .clickable(enabled = actions.canReact, role = Role.Button) { actions.react(emoji) }
                        .semantics { contentDescription = "$emoji ${users.size}${if (reacted) ", including you" else ""}"; selected = reacted }
                        .padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(emoji, fontSize = 13.sp)
                        Text(users.size.toString(), style = loanBody(11), color = if (reacted) Cargo.Ink else ChatMuted)
                    }
                }
            }
            if (endsGroup) Text(chatTimeFormat.format(Instant.parse(message.created_at)), Modifier.padding(horizontal = 3.dp, vertical = 2.dp),
                style = loanBody(10), color = ChatMuted)
        }
    }
}
@Composable internal fun ChatComposer(state: ChatUiState, onDraft: (String) -> Unit, send: () -> Unit, showSuggestions: Boolean = true,
    cancelContext: () -> Unit = {}, pickPhoto: (() -> Unit)? = null, openPoll: (() -> Unit)? = null,
    pickMention: (GroupMember) -> Unit = {}) {
    val interactions = remember { MutableInteractionSource() }
    val focused by interactions.collectIsFocusedAsState()
    val focus = remember { FocusRequester() }
    Column(Modifier.fillMaxWidth().background(ChatPanel).testTag("chat-composer-panel")) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(ChatBorder))
        state.error?.let { Text(it, Modifier.padding(8.dp), style = loanBody(11), color = ChatAmber) }
        val query = mentionQuery(state.draft)
        val suggestions = if (query == null) emptyList() else state.mentionables.filter { it.full_name.contains(query, ignoreCase = true) }.take(6)
        if (suggestions.isNotEmpty()) FlowRow(Modifier.padding(horizontal = 8.dp, vertical = 4.dp).testTag("chat-mention-suggestions"),
            horizontalArrangement = Arrangement.spacedBy(5.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            suggestions.forEach { member ->
                Text("@${member.full_name}", Modifier.background(ChatRaised, RoundedCornerShape(14.dp))
                    .clickable(role = Role.Button) { pickMention(member); runCatching { focus.requestFocus() } }
                    .padding(horizontal = 10.dp, vertical = 7.dp), style = loanBody(12), color = Cargo.Ink)
            }
        }
        val context = state.editing?.let { "Editing your message" to it.body }
            ?: state.replyTo?.let { "Replying to ${it.sender?.full_name ?: "Campus member"}" to it.body.ifBlank { "Photo" } }
        LaunchedEffect(state.editing?.id, state.replyTo?.id) { if (context != null) runCatching { focus.requestFocus() } }
        context?.let { (label, text) ->
            Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 4.dp, top = 6.dp).testTag("chat-compose-context"),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(Modifier.width(2.dp).height(30.dp).background(ChatAmber))
                Column(Modifier.weight(1f)) {
                    Text(label, style = loanBody(11).copy(fontFamily = Cargo.Strong), color = Cargo.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(text, style = loanBody(11), color = ChatMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                ChatIconAction(R.drawable.ic_x, if (state.editing != null) "Cancel editing" else "Cancel reply", onClick = cancelContext)
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (state.editing == null) {
                pickPhoto?.let { ChatIconAction(R.drawable.ic_image_plus, if (state.uploading) "Sending photo" else "Send a photo",
                    Modifier.testTag("chat-photo"), onClick = { if (!state.uploading) it() }) }
                openPoll?.let { ChatIconAction(R.drawable.ic_chart, "Create a poll", Modifier.testTag("chat-poll-button"), onClick = it) }
            }
            BasicTextField(state.draft, onDraft, Modifier.weight(1f).heightIn(min = 47.dp)
                .background(ChatHistory, RoundedCornerShape(7.dp)).border(1.dp, if (focused) ChatAmber else ChatBorder, RoundedCornerShape(7.dp))
                .focusRequester(focus)
                .testTag("chat-composer")
                .semantics { contentDescription = if (state.editing != null) "Edit your message" else "Write a message"; maxTextLength = 2000 }
                .onPreviewKeyEvent {
                    if (it.type == KeyEventType.KeyDown && it.key == Key.Enter && !it.isShiftPressed) { send(); true } else false
                }, interactionSource = interactions, maxLines = 5,
                textStyle = loanBody(14).copy(color = Cargo.Ink, platformStyle = PlatformTextStyle(includeFontPadding = false)),
                cursorBrush = SolidColor(Cargo.Accent), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { send() }),
                decorationBox = { inner -> Box(Modifier.padding(horizontal = 17.dp, vertical = 13.dp)) {
                    if (state.draft.isEmpty()) Text(when {
                        state.editing != null -> "Edit your message…"
                        state.uploading -> "Sending photo…"
                        state.mentionables.isNotEmpty() -> "Message (@ to mention)…"
                        else -> "Write a message…"
                    }, style = loanBody(14), color = ChatMuted, maxLines = 1)
                    inner()
                } })
            val enabled = !state.sending && state.draft.isNotBlank() && state.initialized
            val buttonInteraction = remember { MutableInteractionSource() }
            val hovered by buttonInteraction.collectIsHoveredAsState()
            val buttonColor = if (!enabled) ChatRaised else if (hovered) Color(0xffffd08c) else ChatAmber
            Box(Modifier.size(44.dp).background(buttonColor, RoundedCornerShape(7.dp)).hoverable(buttonInteraction)
                .clickable(buttonInteraction, LocalIndication.current, enabled = enabled, role = Role.Button, onClick = send)
                .semantics { contentDescription = if (state.editing != null) "Save edit" else "Send message" }.testTag("chat-send"), contentAlignment = Alignment.Center) {
                Icon(painterResource(if (state.editing != null) R.drawable.ic_check else R.drawable.ic_send), null, Modifier.size(18.dp), tint = if (enabled) Cargo.Panel else ChatMuted)
            }
        }
        if (showSuggestions && state.initialized && !state.community && state.draft.isEmpty() && context == null) {
            FlowRow(Modifier.padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                ChatTextAction("Plan pickup", { onDraft("When and where works for pickup?"); focus.requestFocus() })
                ChatTextAction("Plan return", { onDraft("When and where works for the return?"); focus.requestFocus() })
            }
        }
        if (state.draft.length >= 1800) Text("${state.draft.length} / 2000",
            Modifier.align(Alignment.End).padding(end = 8.dp, bottom = 4.dp), style = loanBody(10), color = ChatMuted)
    }
}

/** Description, members and leave, under a group's header. */
@Composable internal fun ChatGroupStrip(state: ChatUiState, membersOpen: Boolean, toggleMembers: () -> Unit,
    openProfile: (String) -> Unit, leave: () -> Unit) {
    var confirmLeave by remember { mutableStateOf(false) }
    if (confirmLeave) androidx.compose.material3.AlertDialog(onDismissRequest = { confirmLeave = false },
        title = { Text("Leave ${state.title}?") },
        text = { Text(if (state.visibility == "invite") "It’s invite-only: an admin will have to add you back." else "You can join again any time.") },
        confirmButton = { androidx.compose.material3.TextButton({ confirmLeave = false; leave() }) { Text("Leave", color = Cargo.Warn) } },
        dismissButton = { androidx.compose.material3.TextButton({ confirmLeave = false }) { Text("Stay") } },
        containerColor = ChatRaised)
    Column(Modifier.fillMaxWidth().background(ChatPanel).testTag("chat-group-strip")) {
        state.description?.let { Text(it, Modifier.padding(horizontal = 13.dp, vertical = 6.dp), style = loanBody(12), color = Color(0xffd4dbe7), maxLines = 3, overflow = TextOverflow.Ellipsis) }
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            ChatTextAction("${if (membersOpen) "Hide" else "Show"} ${state.members.size} ${if (state.members.size == 1) "member" else "members"}", toggleMembers)
            Spacer(Modifier.weight(1f))
            if (state.isMember) ChatTextAction(if (state.joining) "Leaving…" else "Leave group", { if (!state.joining) confirmLeave = true })
        }
        if (membersOpen) Column(Modifier.heightIn(max = 200.dp).verticalScroll(rememberScrollState()).testTag("chat-group-members")) {
            state.members.forEach { member ->
                Row(Modifier.fillMaxWidth().clickable(role = Role.Button) { openProfile(member.user_id) }.padding(horizontal = 13.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val initials = member.full_name.trim().split(Regex("\\s+")).take(2).mapNotNull { it.firstOrNull() }.joinToString("").uppercase()
                    Box(Modifier.size(26.dp).background(Color(0xff2b333f), CircleShape), contentAlignment = Alignment.Center) {
                        Text(initials.ifEmpty { "?" }, style = loanBody(9), color = Color(0xffd4dbe7))
                    }
                    Text(member.full_name.ifBlank { "Campus member" } + if (member.is_admin) " · admin" else "", style = loanBody(12), color = Cargo.Ink)
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(ChatBorder))
    }
}

/** Instead of the composer: join an open group, or why you can't post. */
@Composable internal fun ChatClosedComposer(state: ChatUiState, join: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(ChatPanel).testTag("chat-closed-composer")) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(ChatBorder))
        state.error?.let { Text(it, Modifier.padding(8.dp), style = loanBody(11), color = ChatAmber) }
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(when {
                state.archived -> "This group is archived. You can read the history, but nobody can post."
                state.canJoin && state.visibility == "invite" -> "You can read this private group as an admin. Join to post."
                state.canJoin -> "You’re previewing this public group. Join to post, react and get unread counts."
                state.announcements && state.isMember -> "Only admins post in this group. You can react and vote in polls."
                else -> "Only members can post here."
            }, Modifier.weight(1f), style = loanBody(12), color = ChatMuted)
            if (state.canJoin) CargoButton(if (state.joining) "Joining…" else "Join group", join, enabled = !state.joining)
        }
    }
}

/** The newest pin, with the others a tap away. */
@Composable internal fun ChatPinnedBar(state: ChatUiState, open: (String) -> Unit, unpin: ((Message) -> Unit)?) {
    val top = state.pinned.firstOrNull() ?: return
    var expanded by remember { mutableStateOf(false) }
    fun label(message: Message) = when {
        message.poll != null -> "Poll: ${message.poll.question}"
        message.body.isNotBlank() -> message.body.replace(Regex("\\s+"), " ")
        message.image_path != null -> "Photo"
        else -> "Message"
    }
    Column(Modifier.fillMaxWidth().background(ChatPanel).testTag("chat-pins")) {
        Row(Modifier.fillMaxWidth().clickable(role = Role.Button) { if (state.pinned.size > 1) expanded = !expanded else open(top.id) }
            .padding(horizontal = 13.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(painterResource(R.drawable.ic_pin), null, Modifier.size(14.dp), tint = ChatAmber)
            Text(androidx.compose.ui.text.buildAnnotatedString {
                pushStyle(androidx.compose.ui.text.SpanStyle(fontFamily = Cargo.Strong, color = Color(0xffd4dbe7))); append("Pinned "); pop()
                append(label(top))
            }, Modifier.weight(1f), style = loanBody(12), color = ChatMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (state.pinned.size > 1) Text("${state.pinned.size} ${if (expanded) "▴" else "▾"}", style = loanBody(11), color = ChatMuted)
        }
        if (expanded) Column(Modifier.heightIn(max = 220.dp).verticalScroll(rememberScrollState())) {
            state.pinned.forEach { message ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f).clickable(role = Role.Button) { expanded = false; open(message.id) }.padding(horizontal = 13.dp, vertical = 7.dp)) {
                        Text(message.sender?.full_name ?: "Campus member", style = loanBody(10), color = ChatMuted)
                        Text(label(message), style = loanBody(12), color = Cargo.Ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    unpin?.let { ChatTextAction("Unpin", { it(message) }) }
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(ChatBorder))
    }
}

/** Admins: a question and 2-10 options. */
@Composable internal fun PollDialog(dismiss: () -> Unit, create: (String, List<String>) -> Unit) {
    var question by rememberSaveable { mutableStateOf("") }
    var options by rememberSaveable { mutableStateOf(listOf("", "")) }
    androidx.compose.material3.AlertDialog(onDismissRequest = dismiss, containerColor = ChatRaised,
        title = { Text("New poll") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ChatSearchField("Ask a question", question, { question = it.take(300) }, Modifier.testTag("poll-question"))
                options.forEachIndexed { index, option ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        ChatSearchField("Option ${index + 1}", option, { value -> options = options.toMutableList().also { it[index] = value.take(100) } }, Modifier.weight(1f))
                        if (options.size > 2) ChatIconAction(R.drawable.ic_x, "Remove option ${index + 1}") { options = options.filterIndexed { i, _ -> i != index } }
                    }
                }
                if (options.size < 10) ChatTextAction("+ Add option", { options = options + "" })
            }
        },
        confirmButton = { androidx.compose.material3.TextButton({ create(question, options) }) { Text("Post poll", color = ChatAmber) } },
        dismissButton = { androidx.compose.material3.TextButton(dismiss) { Text("Cancel") } })
}
