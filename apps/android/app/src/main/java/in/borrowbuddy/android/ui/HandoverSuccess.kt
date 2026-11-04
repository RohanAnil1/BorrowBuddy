package `in`.borrowbuddy.android.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlin.math.roundToInt

/** Source handover-success.tsx: expanding ring, drawn check and custody-chain acknowledgement. */
@Composable fun HandoverSuccess(message: String) {
    key(message) {
        val elapsed = remember { Animatable(0f) }
        val reduced = rememberReducedMotion()
        val lifecycle = LocalLifecycleOwner.current.lifecycle
        LaunchedEffect(reduced, lifecycle) {
            if (reduced) elapsed.snapTo(800f) else lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                val remaining = (800f - elapsed.value).roundToInt().coerceAtLeast(0)
                if (remaining > 0) elapsed.animateTo(800f, tween(remaining, easing = LinearEasing))
            }
        }
        Column(Modifier.fillMaxWidth().border(1.dp, Cargo.Accent.copy(alpha = .4f))
            .background(Cargo.Accent.copy(alpha = .05f)).padding(horizontal = 24.dp, vertical = 40.dp),
            horizontalAlignment = Alignment.CenterHorizontally) {
            Canvas(Modifier.size(48.dp)) {
                val ringTime = (elapsed.value / 700f).coerceIn(0f, 1f)
                val ease = CubicBezierEasing(.4f, 0f, .2f, 1f)
                val fraction = ease.transform(if (ringTime <= .7f) ringTime / .7f else (ringTime - .7f) / .3f)
                val scale = if (ringTime <= .7f) .4f + .75f * fraction else 1.15f - .15f * fraction
                val opacity = if (ringTime <= .7f) fraction else 1f - .75f * fraction
                drawCircle(Cargo.Accent.copy(alpha = opacity), radius = 38.dp.toPx() * scale, style = Stroke(2.dp.toPx() * scale))
                val progress = CubicBezierEasing(0f, 0f, .58f, 1f).transform(((elapsed.value - 300f) / 500f).coerceIn(0f, 1f))
                val path = Path().apply { moveTo(4f, 12.5f); lineTo(9.5f, 18f); lineTo(20f, 6.5f) }
                val measure = PathMeasure().apply { setPath(path, false) }
                val segment = Path(); measure.getSegment(0f, measure.length * progress, segment, true)
                withTransform({ scale(size.width / 24f, size.height / 24f, pivot = androidx.compose.ui.geometry.Offset.Zero) }) {
                    drawPath(segment, Cargo.Accent, style = Stroke(2.5f, cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
            }
            Spacer(Modifier.height(24.dp))
            Text("[ ${message.uppercase()} ]", style = TextStyle(fontFamily = Cargo.Mono, fontSize = 11.sp,
                letterSpacing = .88.sp, color = Cargo.Accent, textAlign = TextAlign.Center))
            Spacer(Modifier.height(8.dp))
            Text("CUSTODY CHAIN UPDATED · SCAN LOGGED", style = TextStyle(fontFamily = Cargo.Mono, fontSize = 9.sp,
                letterSpacing = .72.sp, color = Cargo.Ink.copy(alpha = .5f), textAlign = TextAlign.Center))
        }
    }
}
