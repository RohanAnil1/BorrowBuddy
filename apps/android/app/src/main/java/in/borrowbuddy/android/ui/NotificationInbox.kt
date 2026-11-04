package `in`.borrowbuddy.android.ui

import android.net.Uri
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.withInfiniteAnimationFrameNanos
import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.*
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.Notification
import `in`.borrowbuddy.android.domain.Profile
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.roundToInt

val InboxRowCount = SemanticsPropertyKey<Int>("InboxRowCount")
val InboxUnreadCount = SemanticsPropertyKey<Int>("InboxUnreadCount")
val InboxViewportWidth = SemanticsPropertyKey<Int>("InboxViewportWidth")
val InboxDotAlpha = SemanticsPropertyKey<Float>("InboxDotAlpha")
private fun inboxText(value: String) = value.replace(Regex("[\\t\\n\\r\\u000C ]+"), " ").trim(' ').uppercase()

internal fun notificationDestination(notification: Notification): String? {
    fun id(key: String) = (notification.payload[key] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf { it.isNotBlank() }?.let(Uri::encode)
    // Campus threads use distinct identifiers; loan appointments still open their loan.
    // Existing conversation and owner-desk fallbacks remain available for legacy notices.
    if (notification.type in setOf("campus_update", "campus_message")) {
        return id("campus_transfer_id")?.let { "campus/collections/$it" }
            ?: if (id("campus_claim_id") != null) "campus/admin"
            else id("campus_post_id")?.let { "campus/activity" }
                // Loan appointments intentionally retain the existing loan destination.
                ?: if (notification.type == "campus_update") id("loan_id")?.let { "loans/$it" } else null
    }
    return id("loan_id")?.let { "loans/$it" } ?: id("item_id")?.let { "items/$it" }
        ?: id("conversation_id")?.let { "chat/$it" }
        ?: if (notification.type == "request_received") "my/items" else null
}

internal fun inboxBlinkAt(elapsedMs: Float): Float = when (elapsedMs % 6000f) {
    in 60f..<120f, in 180f..<240f -> .08f
    else -> 1f
}

@Composable internal fun rememberInboxBlink(enabled: Boolean): MutableFloatState {
    val alpha = remember { mutableFloatStateOf(1f) }
    val elapsed = remember { floatArrayOf(0f) }
    val reduced = rememberReducedMotion()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(enabled, reduced, lifecycle) {
        if (reduced) alpha.floatValue = 1f
        else if (enabled) lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            var previous = 0L
            while (true) withInfiniteAnimationFrameNanos { frame ->
                if (previous != 0L) elapsed[0] = (elapsed[0] + (frame - previous) / 1_000_000f) % 6000f
                previous = frame; alpha.floatValue = inboxBlinkAt(elapsed[0])
            }
        }
    }
    return alpha
}

@Composable internal fun InboxUnreadIndicator(id: String, alpha: MutableFloatState) {
    Box(Modifier.padding(top = 6.dp).size(8.dp).testTag("notification-unread-$id").semantics { this[InboxDotAlpha] = alpha.floatValue }
        .graphicsLayer { this.alpha = alpha.floatValue }.background(Cargo.Accent))
}

@Composable fun NotificationsScreen(repository: BorrowRepository, profile: Profile, open: (String) -> Unit) {
    val actions = rememberActions()
    val list = rememberLazyListState()
    var submitting by remember { mutableStateOf(false) }
    LoadScreen(profile.id, { repository.notifications(profile.id) }, refreshKey = actions.revision) { notifications ->
        InboxContent(notifications, open, {
            if (!submitting && !actions.busy) {
                submitting = true
                actions.run { try { repository.markNotificationsRead(profile.id) } finally { submitting = false } }
            }
        }, actions.busy || submitting, actions.error, list)
    }
}

@Composable internal fun InboxContent(notifications: List<Notification>, open: (String) -> Unit, markRead: () -> Unit,
    busy: Boolean = false, error: String? = null, list: LazyListState = rememberLazyListState()) {
    val viewport = LocalWindowInfo.current.containerSize.width / LocalDensity.current.density
    val unreadIds = remember(notifications) { notifications.filter { it.read_at == null }.map { it.id }.toSet() }
    val visibleUnread by remember(list, unreadIds) { derivedStateOf { list.layoutInfo.visibleItemsInfo.any { it.key in unreadIds } } }
    val alpha = rememberInboxBlink(visibleUnread)
    val reduced = rememberReducedMotion()
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        LazyColumn(Modifier.widthIn(max = 768.dp).fillMaxSize().testTag("notification-inbox").semantics {
            this[InboxRowCount] = notifications.size; this[InboxUnreadCount] = unreadIds.size; this[InboxViewportWidth] = viewport.roundToInt()
        }, state = list, contentPadding = PaddingValues(horizontal = if (viewport >= 800) 40.dp else 16.dp, vertical = 32.dp)) {
            item("heading") {
                FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                    verticalArrangement = Arrangement.spacedBy(16.dp), itemVerticalAlignment = Alignment.Bottom) {
                    Column {
                        Text("[ CONTROL TOWER ]", style = loanMono(10), color = Cargo.Accent)
                        Text("NOTIFICATIONS", Modifier.padding(top = 12.dp), style = sourceDisplayTitleStyle(), color = Cargo.Ink, overflow = TextOverflow.Visible)
                    }
                    if (unreadIds.isNotEmpty()) SourceSubmitButton(if (busy) "…" else "Mark all read", markRead, !busy, secondary = true, icon = R.drawable.ic_check_check)
                }
                error?.let { Text("[ ${inboxText(it)} ]", Modifier.padding(top = 16.dp), style = loanMono(10), color = Cargo.Warn) }
                Spacer(Modifier.height(32.dp))
            }
            if (notifications.isEmpty()) item("empty") {
                Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).testTag("inbox-empty")
                    .padding(horizontal = 25.dp, vertical = 49.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(painterResource(R.drawable.ic_bell_ring), null, Modifier.size(28.dp), tint = Cargo.Accent)
                    Text("[ ALL QUIET ]", Modifier.padding(top = 16.dp), style = loanMono(10), color = Cargo.Accent)
                    Text("NOTHING ON THE WIRE", Modifier.padding(top = 12.dp), style = sourceDisplayTitleStyle(), color = Cargo.Ink, textAlign = TextAlign.Center, overflow = TextOverflow.Visible)
                    Text("REQUESTS, APPROVALS, DUE DATES AND HANDOVERS ALL SHOW UP HERE.", Modifier.padding(top = 12.dp).widthIn(max = 384.dp),
                        style = loanBody(13), color = Cargo.Ink.copy(alpha = .6f), textAlign = TextAlign.Center)
                }
            }
            itemsIndexed(notifications, key = { _, notification -> notification.id }) { index, notification ->
                if (index > 0) Spacer(Modifier.height(12.dp))
                val unread = notification.read_at == null
                val destination = notificationDestination(notification)
                val interaction = remember { MutableInteractionSource() }
                val focused by interaction.collectIsFocusedAsState()
                val border by animateColorAsState(if (focused && destination != null) Cargo.Accent else if (unread) Cargo.Accent.copy(alpha = .5f) else Cargo.Line,
                    tween(if (reduced) 0 else 150), label = "inbox-border")
                val fill by animateColorAsState(if (unread) Cargo.Accent.copy(alpha = .05f) else Cargo.Panel.copy(alpha = .6f), tween(if (reduced) 0 else 150), label = "inbox-read-fill")
                Column(Modifier.fillMaxWidth().testTag("notification-${notification.id}").semantics { stateDescription = if (unread) "Unread" else "Read" }
                    .background(fill).border(1.dp, border)
                    .then(if (destination != null) Modifier.clickable(interactionSource = interaction, indication = null, role = Role.Button, onClickLabel = "Open notification") { open(destination) } else Modifier)
                    .padding(21.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Top) {
                        Column(Modifier.weight(1f)) {
                            Text(inboxText(notification.title), style = loanMono(11).copy(lineBreak = LineBreak.Paragraph), color = Cargo.Ink)
                            if (notification.body.isNotEmpty()) Text(inboxText(notification.body), Modifier.padding(top = 4.dp), style = loanBody(13).copy(lineBreak = LineBreak.Paragraph), color = Cargo.Ink.copy(alpha = .6f))
                        }
                        if (unread) InboxUnreadIndicator(notification.id, alpha)
                    }
                    Text(loanRelativeTime(notification.created_at), Modifier.padding(top = 12.dp).testTag("notification-time-${notification.id}"), style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
                }
            }
        }
    }
}
