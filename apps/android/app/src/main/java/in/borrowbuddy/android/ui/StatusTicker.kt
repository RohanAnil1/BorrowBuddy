package `in`.borrowbuddy.android.ui

import androidx.compose.animation.core.withInfiniteAnimationFrameNanos
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.isActive
import kotlin.math.*

private val campusBlurbs = listOf(
    "MIRA'S CAMERA IS BACK ON THE SHELF.", "DEV IS PICKING UP A PROJECTOR AT THE SAC.",
    "SANA'S SPEAKER IS ON STAGE TONIGHT.", "ROHAN'S CATAN NIGHT IS A GO.",
    "KABIR'S LENS FOUND A NEW OWNER.", "ISHITA'S HOTPLATE CAME BACK SPOTLESS.",
    "ARYAN'S TRUST SCORE JUST HIT 92.", "CAMPUS HANDOVERS RUN BY QR — EVERY TIME.",
)

@Composable fun StatusTicker(modifier: Modifier = Modifier, viewport: Rect? = null, active: Boolean = true) {
    val measurer = rememberTextMeasurer()
    val style = TextStyle(fontFamily = Cargo.Ticket, fontSize = 15.sp, lineHeight = 22.5.sp, letterSpacing = .6.sp, color = Color.Black)
    val text = campusBlurbs.map { measurer.measure(it, style, softWrap = false, maxLines = 1) }
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    var held by remember { mutableStateOf(false) }
    var visible by remember { mutableStateOf(false) }
    var elapsed by remember { mutableDoubleStateOf(0.0) }
    val reduced = rememberReducedMotion()
    val view = LocalView.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var resumed by remember { mutableStateOf(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) resumed = true
            if (event == Lifecycle.Event.ON_PAUSE) resumed = false
        }
        lifecycle.addObserver(observer); onDispose { lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(visible, resumed, reduced, hovered, held, active) {
        if (active && visible && resumed && !reduced && !hovered && !held) {
            var last = 0L
            while (isActive) withInfiniteAnimationFrameNanos { frame ->
                if (last != 0L) elapsed += (frame - last) / 1e9
                last = frame
            }
        }
    }
    // Lucide plane path (ISC), copied from the website's installed lucide-react icon.
    val plane = remember { PathParser().parsePathString("M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z").toPath() }
    Canvas(modifier.fillMaxWidth().height(38.5.dp).background(Cargo.Warn).clipToBounds()
        .semantics { contentDescription = "Live campus lending ticker" }
        .hoverable(interaction).pointerInput(Unit) {
            awaitEachGesture { awaitFirstDown(requireUnconsumed = false); held = true; try { waitForUpOrCancellation() } finally { held = false } }
        }.onGloballyPositioned {
            val top = it.localToWindow(Offset.Zero).y; val bottom = top + it.size.height
            visible = min(bottom, viewport?.bottom ?: view.rootView.height.toFloat()) > max(top, viewport?.top ?: 0f)
        }) {
        val copyWidth = text.sumOf { it.size.width.toDouble() }.toFloat() + text.size * 96.dp.toPx()
        val shift = if (reduced) 0f else (elapsed % 42 / 42 * copyWidth).toFloat()
        val planeSize = 16.dp.toPx()
        val sidePadding = 32.dp.toPx()
        for (copy in 0..1) {
            var x = copy * copyWidth - shift
            text.forEach { layout ->
                if (x < size.width && x + layout.size.width + 96.dp.toPx() > 0) {
                drawText(layout, topLeft = Offset(x + 32.dp.toPx(), (size.height - layout.size.height) / 2))
                withTransform({ translate(x + sidePadding + layout.size.width + planeSize, (size.height - planeSize) / 2); scale(planeSize / 24, planeSize / 24, Offset.Zero) }) {
                    drawPath(plane, Color.Black); drawPath(plane, Color.Black, style = Stroke(2f, cap = androidx.compose.ui.graphics.StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Round))
                }
                }
                x += layout.size.width + 96.dp.toPx()
            }
        }
    }
}
