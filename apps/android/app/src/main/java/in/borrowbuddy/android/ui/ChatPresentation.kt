package `in`.borrowbuddy.android.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
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

val ChatViewportWidth = SemanticsPropertyKey<Int>("ChatViewportWidth")
val ChatBubbleMine = SemanticsPropertyKey<Boolean>("ChatBubbleMine")
@Composable internal fun chatViewport() = LocalWindowInfo.current.containerSize.width / LocalDensity.current.density
internal fun chatText(value: String) = value.replace(Regex("[\\t\\n\\r\\u000C ]+"), " ").trim(' ').uppercase()

@Composable private fun borderColor(interactions: MutableInteractionSource, normal: Color, hover: Color): Color {
    val hovered by interactions.collectIsHoveredAsState()
    val focused by interactions.collectIsFocusedAsState()
    val color by animateColorAsState(if (hovered || focused) hover else normal,
        tween(if (rememberReducedMotion()) 0 else 150, easing = FastOutSlowInEasing), label = "source-chat-border")
    return color
}

/** Source chat/page.tsx; data/loading/auth remain in ChatsScreen. */
@Composable internal fun ChatsContent(chats: List<ConversationSummary>, open: (String) -> Unit) {
    val viewport = chatViewport()
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        LazyColumn(Modifier.widthIn(max = 768.dp).fillMaxSize().testTag("chat-list").semantics {
            this[ChatViewportWidth] = viewport.roundToInt()
        }, contentPadding = PaddingValues(horizontal = if (viewport >= 800) 40.dp else 16.dp, vertical = 32.dp)) {
            item("heading") {
                Text("[ RADIO ROOM ]", style = loanMono(10), color = Cargo.Accent)
                Text("CHAT", Modifier.padding(top = 12.dp).testTag("chat-list-title"), style = sourceDisplayTitleStyle(), color = Cargo.Ink)
                Text("LOAN CHANNELS ARE PRIVATE TO THE TWO STUDENTS. COMMUNITY CHANNELS ARE OPEN TO EVERY VERIFIED STUDENT.",
                    Modifier.padding(top = 8.dp).testTag("chat-list-intro"), style = loanBody(13), color = Cargo.Ink.copy(alpha = .6f))
                Spacer(Modifier.height(32.dp))
            }
            if (chats.isEmpty()) item("empty") { ChatEmptyList() }
            itemsIndexed(chats, key = { _, row -> row.conversation.id }) { index, chat ->
                if (index > 0) Spacer(Modifier.height(12.dp))
                val interactions = remember { MutableInteractionSource() }
                val border = borderColor(interactions, if (chat.unread) Cargo.Accent.copy(alpha = .6f) else Cargo.Line,
                    if (chat.unread) Cargo.Accent.copy(alpha = .6f) else Cargo.Accent.copy(alpha = .5f))
                Row(Modifier.fillMaxWidth().testTag("conversation-${chat.conversation.id}")
                    .border(1.dp, border).background(if (chat.unread) Cargo.Accent.copy(alpha = .05f) else Cargo.Panel)
                    .hoverable(interactions).clickable(interactions, LocalIndication.current) { open(chat.conversation.id) }.padding(21.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(chatText(chat.title), Modifier.weight(1f, fill = false), style = loanMono(12), color = Cargo.Ink,
                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (chat.unread) Box(Modifier.size(8.dp).background(Cargo.Accent).semantics { contentDescription = "Unread conversation" })
                        }
                        Text(if (chat.conversation.type == "community") "EVERYONE ON CAMPUS" else "PRIVATE LOAN CHAT",
                            Modifier.padding(top = 2.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                        chat.latest?.let { Text(chatText(it.body), Modifier.padding(top = 8.dp), style = loanBody(13),
                            color = Cargo.Ink.copy(alpha = .6f), maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    }
                    Text(chat.latest?.let { loanRelativeTime(it.created_at) } ?: "NEW", style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
                }
            }
        }
    }
}

@Composable private fun ChatEmptyList() {
    Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(horizontal = 25.dp, vertical = 49.dp)
        .testTag("chat-empty-list"), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(painterResource(R.drawable.ic_messages_square), null, Modifier.size(28.dp), tint = Cargo.Accent)
        Text("[ EMPTY SHELF ]", Modifier.padding(top = 16.dp), style = loanMono(10), color = Cargo.Accent)
        Text("NO CONVERSATIONS YET", Modifier.padding(top = 12.dp), style = sourceDisplayTitleStyle(), color = Cargo.Ink, textAlign = TextAlign.Center)
        Text("EVERY APPROVED REQUEST OPENS A PRIVATE CHANNEL SO YOU CAN AGREE ON A PICKUP SPOT AND TIME.",
            Modifier.padding(top = 12.dp).widthIn(max = 384.dp), style = loanBody(13), color = Cargo.Ink.copy(alpha = .6f), textAlign = TextAlign.Center)
    }
}

@Composable internal fun ChatHeader(state: ChatUiState, openProfile: (String) -> Unit, back: () -> Unit) {
    Column(Modifier.fillMaxWidth().testTag("chat-thread-header")) {
        Row(Modifier.fillMaxWidth().padding(bottom = 16.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                val interactions = remember { MutableInteractionSource() }
                val border = borderColor(interactions, Cargo.Line, Cargo.Accent)
                val hovered by interactions.collectIsHoveredAsState()
                val focused by interactions.collectIsFocusedAsState()
                Box(Modifier.size(36.dp).border(1.dp, border, RoundedCornerShape(8.dp)).hoverable(interactions)
                    .clickable(interactions, LocalIndication.current, role = Role.Button, onClick = back)
                    .semantics { contentDescription = "Back to chats" }.testTag("chat-back"), contentAlignment = Alignment.Center) {
                    Icon(painterResource(R.drawable.ic_arrow_left), null, Modifier.size(16.dp),
                        tint = if (hovered || focused) Cargo.Accent else Cargo.Ink.copy(alpha = .6f))
                }
                Column(Modifier.weight(1f)) {
                    Text(chatText(state.title), Modifier.testTag("chat-thread-title"), style = loanBody(16).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
                    Text(if (state.community) "COMMUNITY CHANNEL" else "PRIVATE LOAN CHANNEL", Modifier.padding(top = 2.dp),
                        style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                }
            }
            state.counterpart?.let { user ->
                Row(Modifier.border(1.dp, Cargo.Accent.copy(alpha = .6f)).background(Cargo.Accent.copy(alpha = .1f))
                    .clickable(role = Role.Button) { openProfile(user.id) }.semantics { contentDescription = "Open counterparty profile" }
                    .padding(horizontal = 13.dp, vertical = 7.dp).testTag("chat-trust"),
                    horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(painterResource(R.drawable.ic_star), null, Modifier.size(12.dp), tint = Cargo.Accent)
                    Text(user.trust_score.roundToInt().toString(), style = loanMono(9), color = Cargo.Accent)
                }
            } ?: Text("OPEN TO ALL", Modifier.border(1.dp, Cargo.Line, CircleShape).padding(horizontal = 11.dp, vertical = 5.dp),
                style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Cargo.Line))
    }
}

@Composable internal fun ChatLoanChip(loan: Loan, openLoan: (String) -> Unit) {
    val interactions = remember { MutableInteractionSource() }
    val border = borderColor(interactions, Cargo.Line, Cargo.Accent)
    val blink = rememberInboxBlink(true)
    FlowRow(Modifier.padding(top = 12.dp).width(IntrinsicSize.Max).widthIn(max = 768.dp)
        .border(1.dp, border).background(Cargo.Panel).hoverable(interactions)
        .clickable(interactions, LocalIndication.current) { openLoan(loan.id) }.padding(horizontal = 13.dp, vertical = 9.dp)
        .testTag("chat-loan-link"), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp),
        itemVerticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).graphicsLayer { alpha = blink.floatValue }.background(Cargo.Accent))
        Row {
            Text("LOAN STATUS: ", style = loanMono(9), color = Cargo.Ink)
            Text((Rules.loanLabels[loan.status] ?: loan.status.replace('_', ' ')).uppercase(), style = loanMono(9), color = Cargo.Accent)
        }
        val tone = when (loan.status) {
            "awaiting_pickup", "return_pending" -> Triple(Cargo.Ink, Cargo.Ink.copy(alpha = .5f), Color.Black)
            "active" -> Triple(Cargo.Accent, Cargo.Accent.copy(alpha = .6f), Cargo.Accent.copy(alpha = .15f))
            "returned" -> Triple(Cargo.Ink.copy(alpha = .5f), Cargo.Line, Color.Transparent)
            "overdue", "lost" -> Triple(Cargo.Warn, Cargo.Warn, Cargo.Warn.copy(alpha = .2f))
            "disputed" -> Triple(Cargo.Warn, Cargo.Warn.copy(alpha = .5f), Cargo.Warn.copy(alpha = .1f))
            else -> Triple(Cargo.Ink.copy(alpha = .7f), Cargo.Line, Cargo.Panel)
        }
        Text("DUE ${loan.due_date}", Modifier.padding(start = 4.dp).background(tone.third, CircleShape).border(1.dp, tone.second, CircleShape)
            .padding(horizontal = 11.dp, vertical = 5.dp), style = loanMono(9), color = tone.first)
        Text("OPEN →", style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
    }
}

@Composable internal fun ChatMessageRow(message: Message, mine: Boolean, now: Long, bubbleWidth: Dp) {
    Column(Modifier.fillMaxWidth().testTag("message-${message.id}"), horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
        Column(Modifier.widthIn(max = bubbleWidth), horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
            verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (!mine) Text(chatText(message.sender?.full_name ?: "Someone"), Modifier.padding(horizontal = 4.dp),
                style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
            Text(chatText(message.body), Modifier.testTag("chat-bubble-${message.id}").semantics { this[ChatBubbleMine] = mine }
                .background(if (mine) Cargo.Accent else Cargo.Panel).then(if (mine) Modifier else Modifier.border(1.dp, Cargo.Line))
                .padding(horizontal = if (mine) 16.dp else 17.dp, vertical = if (mine) 12.dp else 13.dp),
                style = loanBody(14).copy(lineHeight = 24.sp), color = Cargo.Ink)
            Text(loanRelativeTime(message.created_at, java.time.Instant.ofEpochMilli(now)), Modifier.padding(horizontal = 4.dp),
                style = loanMono(8), color = Cargo.Ink.copy(alpha = .4f))
        }
    }
}

@Composable internal fun ChatComposer(state: ChatUiState, onDraft: (String) -> Unit, send: () -> Unit) {
    val interactions = remember { MutableInteractionSource() }
    val focused by interactions.collectIsFocusedAsState()
    Column(Modifier.fillMaxWidth().background(Cargo.Panel).testTag("chat-composer-panel")) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Cargo.Line))
        state.error?.let { Text("[ $it ]", Modifier.padding(top = 8.dp), style = loanMono(9), color = Cargo.Warn) }
        Row(Modifier.fillMaxWidth().padding(top = 16.dp, bottom = 16.dp), verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BasicTextField(state.draft, onDraft, Modifier.weight(1f).heightIn(min = 47.dp)
                .background(Cargo.Panel, RoundedCornerShape(8.dp)).border(1.dp, if (focused) Cargo.Accent else Cargo.Line, RoundedCornerShape(8.dp))
                .testTag("chat-composer")
                .semantics { contentDescription = "Write a message"; maxTextLength = 2000 }
                .onPreviewKeyEvent {
                    if (it.type == KeyEventType.KeyDown && it.key == Key.Enter && !it.isShiftPressed) { send(); true } else false
                }, interactionSource = interactions, maxLines = 5,
                textStyle = loanBody(14).copy(color = Cargo.Ink, platformStyle = PlatformTextStyle(includeFontPadding = false)),
                cursorBrush = SolidColor(Cargo.Accent), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { send() }),
                decorationBox = { inner -> Box(Modifier.padding(horizontal = 17.dp, vertical = 13.dp)) {
                    if (state.draft.isEmpty()) Text("Write a message…", style = loanBody(14), color = Cargo.Ink.copy(alpha = .3f))
                    inner()
                } })
            val enabled = !state.sending && state.draft.isNotBlank() && state.initialized
            val buttonInteraction = remember { MutableInteractionSource() }
            val hovered by buttonInteraction.collectIsHoveredAsState()
            Box(Modifier.size(44.dp).alpha(if (!enabled) .5f else if (hovered) .9f else 1f)
                .background(Cargo.Accent, RoundedCornerShape(8.dp)).hoverable(buttonInteraction)
                .clickable(buttonInteraction, LocalIndication.current, enabled = enabled, role = Role.Button, onClick = send)
                .semantics { contentDescription = "Send message" }.testTag("chat-send"), contentAlignment = Alignment.Center) {
                Icon(painterResource(R.drawable.ic_send), null, Modifier.size(16.dp), tint = Cargo.Ink)
            }
        }
    }
}
