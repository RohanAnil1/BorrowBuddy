package `in`.borrowbuddy.android.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.*
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import `in`.borrowbuddy.android.graphics.ConveyorPlayback
import `in`.borrowbuddy.android.graphics.ConveyorMotion
import `in`.borrowbuddy.android.graphics.NativeConveyor
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

@Composable fun BorrowQueue(playback: ConveyorPlayback, viewportWidth: Float, viewportHeight: Float,
    fallback: @Composable () -> Unit) {
    val spread = viewportWidth >= 800f
    val density = LocalDensity.current.density
    val stageHeight = if (spread) 440f else 360f
    var headerHeight by remember { mutableFloatStateOf(192f) }
    var footerHeight by remember { mutableFloatStateOf(64f) }
    val titleSize = (viewportWidth * .06f).coerceIn(40f, 64f)
    val reduced = rememberReducedMotion()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var liveAlpha by remember { mutableFloatStateOf(1f) }
    LaunchedEffect(lifecycle, reduced) {
        liveAlpha = 1f
        if (!reduced) lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (isActive) {
                delay(60); liveAlpha = .08f; delay(60); liveAlpha = 1f
                delay(60); liveAlpha = .08f; delay(60); liveAlpha = 1f; delay(5760)
            }
        }
    }
    val labelStyle = TextStyle(fontFamily = Cargo.Mono, fontSize = 11.sp, lineHeight = 20.sp,
        letterSpacing = .88.sp, color = Cargo.Ink.copy(alpha = .5f), platformStyle = PlatformTextStyle(includeFontPadding = false))
    @Composable fun heading() {
        Column {
            Text(buildAnnotatedString { withStyle(SpanStyle(color = Cargo.Accent)) { append("▶") }; appendInlineContent("gap", " "); append("THE BORROW QUEUE") },
                inlineContent = mapOf("gap" to InlineTextContent(Placeholder(.35f.em, 1.em, PlaceholderVerticalAlign.TextCenter)) { Spacer(Modifier.fillMaxSize()) }),
                style = TextStyle(fontFamily = Cargo.Title, fontSize = titleSize.sp, lineHeight = (titleSize * 1.05f).sp,
                    letterSpacing = (titleSize * .01f).sp, color = Cargo.Ink, platformStyle = PlatformTextStyle(includeFontPadding = false)))
            Spacer(Modifier.height(16.dp))
            Text("THE CAMPUS BELT RUNS 24/7 — EVERY LOAN RIDES THE LINE\nTHROUGH FOUR GATES: REQUESTED → ACCEPTED → HANDED OVER → RETURNED.", style = labelStyle)
        }
    }
    @Composable fun live() {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Spacer(Modifier.size(6.dp).alpha(liveAlpha).background(Cargo.Accent))
            Text("[ LIVE · LINE 04 · BELT 24/7 ]", style = labelStyle.copy(fontSize = (if (spread) 9 else 8).sp,
                letterSpacing = (if (spread) .72f else .64f).sp, color = Cargo.Ink.copy(alpha = .4f)))
        }
    }
    Column(Modifier.requiredWidth(viewportWidth.dp)) {
        val header = Modifier.fillMaxWidth().onSizeChanged { headerHeight = it.height / density }
            .padding(start = if (spread) 40.dp else 16.dp, end = if (spread) 40.dp else 16.dp, top = if (spread) 80.dp else 56.dp)
        if (spread) Row(header, horizontalArrangement = Arrangement.SpaceBetween) { Box(Modifier.weight(1f)) { heading() }; Box(Modifier.padding(top = 16.dp)) { live() } }
        else Column(header, verticalArrangement = Arrangement.spacedBy(24.dp)) { heading(); live() }
        Box(Modifier.fillMaxWidth().height((viewportHeight - headerHeight - footerHeight).coerceAtLeast(stageHeight + 48).dp), contentAlignment = Alignment.Center) {
            NativeConveyor(playback, Modifier.fillMaxWidth().height(stageHeight.dp), spread,
                fallback = fallback)
        }
        FlowRow(Modifier.fillMaxWidth().onSizeChanged { footerHeight = it.height / density }
            .padding(start = if (spread) 40.dp else 16.dp, end = if (spread) 40.dp else 16.dp, bottom = 56.dp),
            horizontalArrangement = Arrangement.spacedBy(32.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ConveyorMotion.gates.forEachIndexed { index, gate ->
                val countStyle = labelStyle.copy(fontSize = (if (spread) 9 else 8).sp,
                    letterSpacing = (if (spread) .72f else .64f).sp, color = Cargo.Ink.copy(alpha = .35f), lineHeight = (if (spread) 13.5 else 12.0).sp)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (spread) Text(gate.caption, style = labelStyle.copy(fontSize = 10.sp, color = Cargo.Ink.copy(alpha = .4f)))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("[ ${gate.code} · ", style = countStyle)
                        AnimatedContent(playback.counts[index], transitionSpec = {
                            if (reduced) EnterTransition.None togetherWith ExitTransition.None else
                                (fadeIn(tween(220, easing = CubicBezierEasing(.4f, 0f, .2f, 1f))) + slideInVertically(tween(220, easing = CubicBezierEasing(.4f, 0f, .2f, 1f))) { (7 * density).toInt() }) togetherWith ExitTransition.None
                        }, label = "${gate.code} scan count") { count -> Text(count.toString().padStart(3, '0'), style = countStyle, maxLines = 1, overflow = TextOverflow.Visible) }
                        Text(" ]", style = countStyle)
                    }
                }
            }
        }
    }
}
