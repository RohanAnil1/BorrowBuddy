package `in`.borrowbuddy.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import `in`.borrowbuddy.android.data.*
import kotlinx.coroutines.delay

private object BuddyColors {
    val Panel = Color(0xff08090c); val Raised = Color(0xff12151b); val Raised2 = Color(0xff191d25)
    val Border = Color(0xff23272f); val Muted = Color(0xff9aa3b0); val Ink2 = Color(0xff080b10); val Late = Color(0xffff5d4a)
}
private val bodyText = TextStyle(fontFamily = Cargo.Body, fontSize = 15.sp, lineHeight = 22.sp)
private val monoText = TextStyle(fontFamily = Cargo.Mono, fontSize = 10.sp, letterSpacing = .8.sp)

fun buddySuggestions(route: String): List<String> = when {
    route.startsWith("items/") -> listOf("How do deposits work?", "How do handovers work?", "What if I return it late?")
    route == "fines" -> listOf("Do I owe anything?", "How do fines work?", "How is my trust score worked out?")
    route.startsWith("my/") || route == "dashboard" || route.startsWith("loans/") -> listOf("When are my loans due?", "Any requests waiting on me?", "Do I owe any fines?")
    route == "map" -> listOf("Where are the pickup spots?", "How do handovers work?")
    route.startsWith("campus") -> listOf("How do giveaways work?", "How does Lost & Found work?", "How do appointments work?")
    else -> listOf("Find a calculator for this weekend", "When are my loans due?", "How do fines work?", "Take me to the map")
}

/* --------------------------------- header --------------------------------- */

@Composable fun BuddyHeader(store: BuddyStore, onClose: (() -> Unit)?, onExpand: (() -> Unit)?) {
    val state by store.state.collectAsStateWithLifecycle()
    val status = when {
        state.mood == BuddyMood.Offline -> "OFFLINE"
        state.mood == BuddyMood.Thinking -> "SCANNING"
        state.mood == BuddyMood.Talking -> "REPLYING"
        state.mood == BuddyMood.Sleepy -> "ON A BREAK"
        state.quickMode -> "ONLINE · QUICK MODE"
        else -> "ONLINE"
    }
    val reduced = rememberReducedMotion()
    val belt = if (reduced) null else rememberInfiniteTransition(label = "belt").animateFloat(0f, 20f, infiniteRepeatable(tween(1400, easing = LinearEasing)), label = "belt")
    Box(Modifier.fillMaxWidth().background(Color.Black)) {
        Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 10.dp, top = 6.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            ParcelMascot(state.mood, 54.dp)
            Column(Modifier.weight(1f).padding(start = 8.dp)) {
                Text("BUDDY", style = TextStyle(fontFamily = Cargo.Title, fontSize = 24.sp), color = Cargo.Ink, modifier = Modifier.semantics { heading() })
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(Modifier.size(6.dp).background(if (state.mood == BuddyMood.Offline) Cargo.Warn else Cargo.Ok, CircleShape))
                    Text("[ $status ]", style = monoText, color = Cargo.Accent)
                }
            }
            HeaderIcon("+", "New conversation") { store.newConversation() }
            onExpand?.let { HeaderIcon("⤢", "Open full Buddy screen", it) }
            onClose?.let { HeaderIcon("✕", "Close Buddy", it) }
        }
        // a slow conveyor belt under the header
        Row(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(2.dp).offset(x = ((belt?.value ?: 0f) - 20f).dp)) {
            repeat(80) { Box(Modifier.width(10.dp).fillMaxHeight().background(Cargo.Accent.copy(alpha = .55f))); Spacer(Modifier.width(10.dp)) }
        }
    }
}

@Composable private fun HeaderIcon(glyph: String, label: String, onClick: () -> Unit) {
    Box(Modifier.padding(start = 6.dp).size(44.dp).clip(RoundedCornerShape(10.dp)).border(1.dp, BuddyColors.Border, RoundedCornerShape(10.dp))
        .clickable(role = Role.Button, onClickLabel = label, onClick = onClick).semantics { contentDescription = label },
        contentAlignment = Alignment.Center) { Text(glyph, color = Cargo.Ink.copy(alpha = .8f), fontSize = 18.sp) }
}

/* --------------------------------- thread --------------------------------- */

@Composable fun BuddyThread(store: BuddyStore, firstName: String, route: String, open: (String) -> Unit, hero: Boolean, modifier: Modifier = Modifier) {
    val state by store.state.collectAsStateWithLifecycle()
    val messages = state.active?.messages.orEmpty()
    val list = rememberLazyListState()
    val last = messages.lastOrNull()
    LaunchedEffect(messages.size, last?.text?.length, last?.cards?.size, last?.tools?.size, last?.error) {
        // Follow the bottom of the newest reply (cards can make it taller than the screen).
        if (messages.isNotEmpty()) { list.scrollToItem(messages.lastIndex); list.animateScrollBy(100_000f) }
    }
    var cooling by remember { mutableStateOf(false) }
    LaunchedEffect(state.cooldownUntil) {
        while (System.currentTimeMillis() < state.cooldownUntil) { cooling = true; delay(1000) }
        cooling = false
    }
    Column(modifier.fillMaxSize().background(BuddyColors.Panel)) {
        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (messages.isEmpty()) BuddyEmpty(store, state.mood, firstName, hero, route)
            else LazyColumn(Modifier.fillMaxSize().testTag("buddy-log").semantics { liveRegion = LiveRegionMode.Polite },
                state = list, contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(messages, key = { it.id }) { message -> BuddyMessageRow(store, message, route, open) }
            }
        }
        BuddyComposer(store, route, state.busy, cooling, state.quickMode, messages.isEmpty() || (!state.busy && messages.size < 3))
    }
}

@Composable private fun BuddyEmpty(store: BuddyStore, mood: BuddyMood, firstName: String, hero: Boolean, route: String) {
    val starters = listOf("Find gear" to "Find a calculator for this weekend", "My loans" to "When are my loans due?",
        "My ledger" to "Do I owe any fines?", "The rules" to "How does the trust score work?")
    Column(Modifier.fillMaxSize().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        ParcelMascot(if (mood == BuddyMood.Idle) BuddyMood.Wave else mood, if (hero) 170.dp else 120.dp, description = "Parcel, Buddy's mascot")
        Spacer(Modifier.height(10.dp))
        if (hero) Text("[ CARGO DESK OPEN ]", style = monoText, color = Cargo.Accent)
        Text((if (hero) "Hey${if (firstName.isNotBlank()) " $firstName" else ""}, what do you need?" else "Hey${if (firstName.isNotBlank()) " $firstName" else ""}, I'm Buddy.").uppercase(),
            style = TextStyle(fontFamily = Cargo.Title, fontSize = if (hero) 30.sp else 24.sp, lineHeight = if (hero) 32.sp else 26.sp),
            color = Cargo.Ink, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 6.dp).semantics { heading() })
        Text("I search the live shelf, keep an eye on your loans and fines, and know every rule by heart.", style = bodyText.copy(fontSize = 14.sp),
            color = BuddyColors.Muted, textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.padding(top = 8.dp).widthIn(max = 340.dp))
        if (hero) {
            Spacer(Modifier.height(18.dp))
            starters.chunked(2).forEach { row ->
                Row(Modifier.widthIn(max = 420.dp).fillMaxWidth().padding(vertical = 5.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { (label, prompt) ->
                        Column(Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).background(Color.Black).border(1.dp, BuddyColors.Border, RoundedCornerShape(14.dp))
                            .clickable(role = Role.Button) { store.send(prompt, route) }.padding(14.dp)) {
                            Text(label.uppercase(), style = TextStyle(fontFamily = Cargo.Strong, fontSize = 13.sp), color = Cargo.Ink)
                            Text(prompt, style = bodyText.copy(fontSize = 12.sp, lineHeight = 16.sp), color = BuddyColors.Muted, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable private fun BuddyMessageRow(store: BuddyStore, message: BuddyMessage, route: String, open: (String) -> Unit) {
    if (message.user) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
            Text(message.text, Modifier.widthIn(max = 300.dp).background(Cargo.Paper, RoundedCornerShape(16.dp, 16.dp, 4.dp, 16.dp))
                .padding(horizontal = 14.dp, vertical = 10.dp), style = bodyText, color = BuddyColors.Ink2)
        }
        return
    }
    val mood = when { message.streaming -> if (message.text.isEmpty()) BuddyMood.Thinking else BuddyMood.Talking; message.error != null -> message.errorMood; else -> BuddyMood.Idle }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ParcelMascot(mood, 32.dp, interactive = false)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (message.tools.isNotEmpty()) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                message.tools.forEachIndexed { i, label ->
                    val running = message.streaming && i == message.tools.lastIndex
                    Text("${if (running) "▪" else "✓"} [ ${label.uppercase()} ]", style = monoText.copy(fontSize = 9.sp), color = if (running) Cargo.Accent else Cargo.Ink.copy(alpha = .45f))
                }
            }
            if (message.text.isNotBlank() || (message.streaming && message.tools.isEmpty())) {
                Box(Modifier.background(BuddyColors.Raised, RoundedCornerShape(4.dp, 16.dp, 16.dp, 16.dp)).border(1.dp, BuddyColors.Border, RoundedCornerShape(4.dp, 16.dp, 16.dp, 16.dp))
                    .padding(horizontal = 14.dp, vertical = 10.dp)) {
                    if (message.text.isBlank()) TypingDots() else Text(richText(message.text, message.streaming), style = bodyText, color = Cargo.Ink.copy(alpha = .92f))
                }
            }
            message.cards.forEach { BuddyCardView(store, it, open) }
            message.error?.let { error ->
                Row(Modifier.fillMaxWidth().background(Cargo.Warn.copy(alpha = .08f), RoundedCornerShape(10.dp)).border(1.dp, Cargo.Warn.copy(alpha = .45f), RoundedCornerShape(10.dp))
                    .padding(10.dp).semantics { liveRegion = LiveRegionMode.Assertive }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(error, Modifier.weight(1f), style = bodyText.copy(fontSize = 13.sp), color = Color(0xffffd79a))
                    Chip("↻ Try again") { store.retry(route) }
                }
            }
        }
    }
}

/** Paragraphs, "- " bullets and **bold**; markdown links are shown as plain text. */
private fun richText(raw: String, caret: Boolean) = buildAnnotatedString {
    val text = raw.replace(Regex("\\[([^\\]]+)]\\([^)]*\\)"), "$1")
        // A line that is only a "[Button]" the model typed itself: real buttons are cards.
        .lines().filterNot { Regex("^\\s*(\\*\\*)?\\[[^\\]]{1,60}](\\*\\*)?\\s*$").matches(it) }.joinToString("\n")
        .trim().replace(Regex("\n{3,}"), "\n\n").lines().joinToString("\n") { line ->
        line.replace(Regex("^\\s*([-*•]|\\d+\\.)\\s+"), "•  ")
    }
    Regex("\\*\\*([^*]+)\\*\\*|([^*]+|\\*)").findAll(text).forEach { match ->
        val bold = match.groupValues[1]
        if (bold.isNotEmpty()) withStyle(SpanStyle(fontFamily = Cargo.Strong, color = Color.White)) { append(bold) } else append(match.value)
    }
    if (caret) withStyle(SpanStyle(color = Cargo.Accent)) { append(" ▌") }
}

@Composable private fun TypingDots() {
    val reduced = rememberReducedMotion()
    val t = if (reduced) null else rememberInfiniteTransition(label = "dots").animateFloat(0f, 1f, infiniteRepeatable(tween(1000, easing = LinearEasing)), label = "dots")
    Row(Modifier.padding(vertical = 4.dp).semantics { contentDescription = "Buddy is typing" }, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        repeat(3) { i ->
            val phase = (((t?.value ?: 0f) - i * .15f) % 1f + 1f) % 1f
            val lift = if (phase < .3f) kotlin.math.sin(phase / .3f * Math.PI).toFloat() else 0f
            Box(Modifier.offset(y = (-4 * lift).dp).size(6.dp).background(Cargo.Accent.copy(alpha = .4f + .6f * lift), CircleShape))
        }
    }
}

/* ---------------------------------- cards --------------------------------- */

@Composable private fun BuddyCardView(store: BuddyStore, card: BuddyCard, open: (String) -> Unit) {
    fun follow(href: String) { buddyRoute(href)?.let { store.poke(BuddyMood.Happy); open(it) } }
    when (card) {
        is BuddyCard.Items -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("[ ${card.title.uppercase()} ]", style = monoText.copy(fontSize = 9.sp), color = Cargo.Accent)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(card.items, key = { it.id }) { item ->
                    Column(Modifier.width(150.dp).clip(RoundedCornerShape(10.dp)).background(Color.Black).border(1.dp, BuddyColors.Border, RoundedCornerShape(10.dp))
                        .clickable(role = Role.Button, onClickLabel = "Open ${item.title}") { follow("/items/${item.id}") }.testTag("buddy-item-${item.id}")) {
                        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3f).background(Color(0xff0d0f14))) {
                            if (item.image != null) AsyncImage(item.image, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                            Text(item.condition.uppercase(), Modifier.padding(6.dp).background(Color.Black).padding(horizontal = 5.dp, vertical = 2.dp),
                                style = monoText.copy(fontSize = 8.sp), color = Cargo.Accent)
                        }
                        Column(Modifier.padding(9.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(item.title.uppercase(), style = TextStyle(fontFamily = Cargo.Strong, fontSize = 12.sp, lineHeight = 15.sp), color = Cargo.Ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(item.deposit.uppercase(), style = monoText.copy(fontSize = 8.sp), color = Cargo.Accent)
                                Text("★ ${item.trust}", style = monoText.copy(fontSize = 8.sp), color = Cargo.Ink.copy(alpha = .5f))
                            }
                            item.spot?.let { Text("⌖ ${it.uppercase()}", style = monoText.copy(fontSize = 8.sp), color = Cargo.Ink.copy(alpha = .5f), maxLines = 1, overflow = TextOverflow.Ellipsis) }
                        }
                    }
                }
            }
        }
        is BuddyCard.Loans -> RowsCard(card.title) {
            card.loans.forEach { loan ->
                val tone = when (loan.tone) { "late" -> BuddyColors.Late; "soon" -> Cargo.Accent; "done" -> Color(0xff3a404b); else -> Cargo.Ok }
                ToneRow(loan.title, "${if (loan.role == "borrowing") "Borrowing" else "Lending"} · ${loan.statusLabel}", loan.dueLabel, tone) { follow("/loans/${loan.id}") }
            }
        }
        is BuddyCard.Requests -> RowsCard(card.title) {
            card.requests.forEach { request ->
                val tone = when (request.status) { "pending" -> Cargo.Accent; "declined", "expired" -> Color(0xff3a404b); else -> Cargo.Ok }
                ToneRow(request.title, "${if (request.direction == "incoming") "Waiting on you" else "You asked"} · ${request.dates}", request.statusLabel, tone) {
                    follow(if (request.direction == "incoming") "/my/items" else "/items/${request.itemId}")
                }
            }
        }
        is BuddyCard.Fines -> Column(Modifier.fillMaxWidth().background(Cargo.Paper, RoundedCornerShape(6.dp)).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("[ OUTSTANDING ]", Modifier.weight(1f), style = monoText.copy(fontSize = 9.sp), color = BuddyColors.Ink2.copy(alpha = .55f))
                Text(card.total, style = TextStyle(fontFamily = Cargo.Ticket, fontSize = 28.sp), color = BuddyColors.Ink2)
            }
            card.fines.forEach { fine ->
                Row(Modifier.fillMaxWidth()) {
                    Text("${(fine.itemTitle ?: fine.reason).uppercase()}  ${fine.status.uppercase()}", Modifier.weight(1f), style = monoText.copy(fontSize = 9.sp), color = BuddyColors.Ink2)
                    Text(fine.amount, style = monoText.copy(fontSize = 9.sp), color = BuddyColors.Ink2)
                }
            }
            Text("OPEN YOUR LEDGER ↗", Modifier.clickable(role = Role.Button) { follow("/fines") }.padding(vertical = 4.dp),
                style = TextStyle(fontFamily = Cargo.Strong, fontSize = 12.sp), color = BuddyColors.Ink2)
        }
        is BuddyCard.Action -> {
            val route = buddyRoute(card.href) ?: return
            Row(Modifier.clip(RoundedCornerShape(12.dp)).background(if (card.request) Cargo.Accent else BuddyColors.Raised2)
                .border(1.dp, if (card.request) Cargo.Accent else BuddyColors.Border, RoundedCornerShape(12.dp))
                .clickable(role = Role.Button) { store.poke(BuddyMood.Happy); open(route) }.heightIn(min = 48.dp).padding(horizontal = 14.dp, vertical = 10.dp)
                .testTag("buddy-action"), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(if (card.request) "▣" else "↗", color = if (card.request) BuddyColors.Ink2 else Cargo.Ink)
                Column {
                    Text(card.label.uppercase(), style = TextStyle(fontFamily = Cargo.Strong, fontSize = 13.sp), color = if (card.request) BuddyColors.Ink2 else Cargo.Ink)
                    card.description?.let { Text(it, style = bodyText.copy(fontSize = 12.sp, lineHeight = 16.sp), color = (if (card.request) BuddyColors.Ink2 else Cargo.Ink).copy(alpha = .75f)) }
                }
            }
        }
    }
}

@Composable private fun RowsCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("[ ${title.uppercase()} ]", style = monoText.copy(fontSize = 9.sp), color = Cargo.Accent)
        content()
    }
}

@Composable private fun ToneRow(title: String, subtitle: String, trailing: String, tone: Color, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(Color.Black).border(1.dp, BuddyColors.Border, RoundedCornerShape(8.dp))
        .clickable(role = Role.Button, onClick = onClick).heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(3.dp).height(52.dp).background(tone))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp, vertical = 8.dp)) {
            Text(title.uppercase(), style = TextStyle(fontFamily = Cargo.Strong, fontSize = 12.sp), color = Cargo.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, style = bodyText.copy(fontSize = 12.sp, lineHeight = 16.sp), color = BuddyColors.Muted)
        }
        Text(trailing.uppercase(), Modifier.padding(end = 12.dp), style = monoText.copy(fontSize = 9.sp), color = tone)
    }
}

@Composable private fun Chip(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    Text(text, Modifier.clip(RoundedCornerShape(50)).background(BuddyColors.Raised).border(1.dp, BuddyColors.Border, RoundedCornerShape(50))
        .clickable(enabled = enabled, role = Role.Button, onClick = onClick).heightIn(min = 40.dp).padding(horizontal = 14.dp, vertical = 10.dp),
        style = bodyText.copy(fontSize = 13.sp, lineHeight = 18.sp), color = Cargo.Ink.copy(alpha = if (enabled) .88f else .4f))
}

/* --------------------------------- composer -------------------------------- */

@Composable private fun BuddyComposer(store: BuddyStore, route: String, busy: Boolean, cooling: Boolean, quickMode: Boolean, showSuggestions: Boolean) {
    var draft by remember { mutableStateOf("") }
    fun submit(text: String = draft) { if (text.isNotBlank() && !busy && !cooling) { store.send(text, route); draft = "" } }
    Column(Modifier.fillMaxWidth().background(Color.Black).padding(horizontal = 12.dp, vertical = 8.dp)) {
        if (showSuggestions) Row(Modifier.horizontalScroll(rememberScrollState()).padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            buddySuggestions(route).forEach { Chip(it, enabled = !busy) { submit(it) } }
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(BuddyColors.Raised).border(1.dp, BuddyColors.Border, RoundedCornerShape(16.dp))
            .padding(start = 14.dp, end = 6.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f).padding(vertical = 8.dp)) {
                if (draft.isEmpty()) Text(if (cooling) "Buddy is catching a breather…" else "Ask Buddy anything…", style = bodyText, color = Cargo.Ink.copy(alpha = .4f))
                BasicTextField(draft, { draft = it.take(1000) }, Modifier.fillMaxWidth().testTag("buddy-input").semantics { contentDescription = "Message Buddy" },
                    textStyle = bodyText.copy(color = Cargo.Ink), cursorBrush = SolidColor(Cargo.Accent), maxLines = 5,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { submit() }))
            }
            val canSend = draft.isNotBlank() && !cooling
            Box(Modifier.size(46.dp).clip(RoundedCornerShape(12.dp))
                .background(if (busy) BuddyColors.Raised2 else Cargo.Accent.copy(alpha = if (canSend) 1f else .35f))
                .clickable(enabled = busy || canSend, role = Role.Button) { if (busy) store.stop() else submit() }
                .semantics { contentDescription = if (busy) "Stop answering" else "Send message" }.testTag("buddy-send"),
                contentAlignment = Alignment.Center) {
                Text(if (busy) "■" else "↑", color = if (busy) Cargo.Ink else BuddyColors.Ink2, fontSize = 18.sp, fontFamily = Cargo.Strong)
            }
        }
        Text(if (draft.length > 800) "${1000 - draft.length} characters left" else if (quickMode) "Quick mode · live catalog and account lookups"
            else "Buddy can slip up. It only sees your own loans and fines.",
            Modifier.fillMaxWidth().padding(top = 6.dp), style = bodyText.copy(fontSize = 11.sp, lineHeight = 14.sp), color = Cargo.Ink.copy(alpha = .4f),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

/* ------------------------------- full screen -------------------------------- */

@Composable fun BuddyScreen(store: BuddyStore, firstName: String, route: String, open: (String) -> Unit) {
    val state by store.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().imePadding().testTag("buddy-screen")) {
        BuddyHeader(store, null, null)
        if (state.conversations.isNotEmpty()) LazyRow(Modifier.fillMaxWidth().background(Color.Black).padding(bottom = 8.dp),
            contentPadding = PaddingValues(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.conversations, key = { it.id }) { c ->
                val active = c.id == state.activeId
                Text(c.title.ifBlank { "New conversation" }, Modifier.widthIn(max = 200.dp).clip(RoundedCornerShape(50))
                    .background(if (active) BuddyColors.Raised2 else Color.Transparent).border(1.dp, if (active) Cargo.Accent else BuddyColors.Border, RoundedCornerShape(50))
                    .clickable(role = Role.Tab) { store.select(c.id) }.padding(horizontal = 12.dp, vertical = 8.dp),
                    style = bodyText.copy(fontSize = 12.sp, lineHeight = 16.sp), color = Cargo.Ink.copy(alpha = if (active) 1f else .7f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        BuddyThread(store, firstName, route, open, hero = true, modifier = Modifier.weight(1f))
    }
}

/* -------------------------------- launcher --------------------------------- */

/** Floating Parcel plus its sliding Buddy panel, layered over the portal. */
@Composable fun BuddyLauncher(store: BuddyStore, firstName: String, route: String, hidden: Boolean, open: (String) -> Unit) {
    val state by store.state.collectAsStateWithLifecycle()
    val reduced = rememberReducedMotion()
    var nudge by rememberSaveable { mutableStateOf<String?>(null) }
    var nudged by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(hidden) {
        if (hidden || nudged) return@LaunchedEffect
        delay(3500)
        if (!store.state.value.open) {
            nudged = true
            nudge = when { route.startsWith("items/") -> "Want me to explain deposits or handovers?"; route == "fines" -> "I can tell you exactly what you owe."
                route == "map" -> "Lost? I know every pickup spot."; route.startsWith("campus") -> "Ask me how giveaways work."
                else -> "Need something? I can search the shelf for you." }
            store.poke(BuddyMood.Wave, 2200)
            delay(9000); nudge = null
        }
    }
    BackHandler(state.open) { store.setOpen(false) }
    val lifted = route.startsWith("items/")
    Box(Modifier.fillMaxSize()) {
        AnimatedVisibility(state.open, enter = if (reduced) fadeIn() else slideInVertically { it / 3 } + fadeIn(),
            exit = if (reduced) fadeOut() else slideOutVertically { it / 3 } + fadeOut()) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .55f)).clickable(onClickLabel = "Close Buddy", indication = null,
                interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }) { store.setOpen(false) }) {
                Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().fillMaxHeight(.92f).imePadding()
                    .clip(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp)).background(BuddyColors.Panel)
                    .clickable(enabled = false) {}.semantics { paneTitle = "Buddy" }.testTag("buddy-panel")) {
                    Box(Modifier.fillMaxWidth().background(Color.Black).padding(top = 8.dp), contentAlignment = Alignment.Center) {
                        Box(Modifier.width(40.dp).height(4.dp).background(BuddyColors.Border, CircleShape))
                    }
                    BuddyHeader(store, { store.setOpen(false) }, { store.setOpen(false); open("buddy") })
                    BuddyThread(store, firstName, route, { store.setOpen(false); open(it) }, hero = false, modifier = Modifier.weight(1f))
                }
            }
        }
        if (!hidden && !state.open) Column(Modifier.align(Alignment.BottomEnd).navigationBarsPadding().padding(end = 12.dp, bottom = if (lifted) 96.dp else 16.dp),
            horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            AnimatedVisibility(nudge != null, enter = fadeIn() + scaleIn(transformOrigin = TransformOrigin(1f, 1f)), exit = fadeOut() + scaleOut(transformOrigin = TransformOrigin(1f, 1f))) {
                Row(Modifier.widthIn(max = 250.dp).background(Cargo.Paper, RoundedCornerShape(14.dp, 14.dp, 4.dp, 14.dp))
                    .clickable(role = Role.Button) { nudge = null; store.setOpen(true) }.padding(start = 12.dp, top = 10.dp, bottom = 10.dp, end = 4.dp),
                    verticalAlignment = Alignment.Top) {
                    Text(nudge.orEmpty(), Modifier.weight(1f, fill = false), style = bodyText.copy(fontSize = 13.sp, lineHeight = 17.sp), color = BuddyColors.Ink2)
                    Text("✕", Modifier.clickable(role = Role.Button, onClickLabel = "Dismiss tip") { nudge = null }.padding(horizontal = 8.dp),
                        color = BuddyColors.Ink2.copy(alpha = .55f), fontSize = 12.sp)
                }
            }
            Box(Modifier.size(82.dp).clip(RoundedCornerShape(24.dp)).clickable(role = Role.Button, onClickLabel = "Open Buddy assistant") { nudge = null; store.setOpen(true) }
                .semantics { contentDescription = "Open Buddy assistant" }.testTag("buddy-launcher"), contentAlignment = Alignment.Center) {
                ParcelMascot(state.mood, 76.dp, interactive = false)
                if (nudge != null || state.busy) Box(Modifier.align(Alignment.TopEnd).padding(8.dp).size(12.dp).background(Cargo.Warn, CircleShape).border(2.dp, Cargo.Canvas, CircleShape))
            }
        }
    }
}

