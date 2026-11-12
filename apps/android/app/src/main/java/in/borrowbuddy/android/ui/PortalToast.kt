package `in`.borrowbuddy.android.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.data.BuddyMood
import `in`.borrowbuddy.android.domain.Notification
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

private const val TOAST_MS = 6500L

/**
 * When realtime reports a new notification, slide in a Parcel toast with its
 * title and body; tapping opens the related screen. The header badge already
 * updates on its own, so this is only the "something just happened" nudge.
 */
@Composable fun NotificationToastHost(repository: BorrowRepository, userId: String, events: Int, open: (String) -> Unit, modifier: Modifier = Modifier) {
    var shown by remember { mutableStateOf<Notification?>(null) }
    var seen by remember(userId) { mutableStateOf<Set<String>?>(null) }
    LaunchedEffect(userId, events) {
        try {
            val latest = repository.notifications(userId).take(5)
            val known = seen
            seen = (known.orEmpty() + latest.map { it.id })
            // The first read only records what already exists; later reads toast what is new.
            if (known != null) latest.firstOrNull { it.id !in known && it.read_at == null }?.let { fresh ->
                shown = fresh
                delay(TOAST_MS)
                if (shown?.id == fresh.id) shown = null
            }
        } catch (cancelled: CancellationException) { throw cancelled } catch (_: Exception) { /* the badge still updates */ }
    }
    val reduced = rememberReducedMotion()
    Box(modifier.fillMaxWidth().padding(horizontal = 12.dp), contentAlignment = Alignment.TopEnd) {
        AnimatedVisibility(shown != null,
            enter = if (reduced) fadeIn(tween(0)) else slideInHorizontally(tween(220)) { it / 3 } + fadeIn(tween(220)),
            exit = if (reduced) fadeOut(tween(0)) else slideOutHorizontally(tween(220)) { it / 3 } + fadeOut(tween(220))) {
            val note = shown ?: return@AnimatedVisibility
            Row(Modifier.widthIn(max = 360.dp).testTag("notification-toast").background(Color.Black.copy(alpha = .95f))
                .border(1.dp, Cargo.Accent.copy(alpha = .5f))
                .clickable { notificationDestination(note)?.let(open); shown = null }
                .semantics { liveRegion = LiveRegionMode.Polite; contentDescription = "${note.title}. ${note.body}" }
                .padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                ParcelMascot(BuddyMood.Found, 40.dp, interactive = false, description = null)
                Column(Modifier.weight(1f)) {
                    Text(note.title.uppercase(), style = loanBody(12).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
                    if (note.body.isNotBlank()) Text(note.body, Modifier.padding(top = 2.dp), style = loanBody(12), color = Cargo.Ink.copy(alpha = .7f),
                        maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Icon(painterResource(R.drawable.ic_x), "Dismiss", Modifier.size(28.dp).clickable { shown = null }.padding(6.dp), tint = Cargo.Ink.copy(alpha = .5f))
            }
        }
    }
}
