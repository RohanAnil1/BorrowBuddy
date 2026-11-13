package `in`.borrowbuddy.android.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlin.math.roundToInt

/** The handover's record on the loan page: a small LED check lights up over the message, in dot-matrix type. */
@Composable fun HandoverSuccess(message: String) {
    key(message) {
        val clock = remember { Animatable(0f) }
        val reduced = rememberReducedMotion()
        val lifecycle = LocalLifecycleOwner.current.lifecycle
        LaunchedEffect(reduced, lifecycle) {
            if (reduced) clock.snapTo(1400f) else lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                val remaining = (1400f - clock.value).roundToInt().coerceAtLeast(0)
                if (remaining > 0) clock.animateTo(1400f, tween(remaining, easing = LinearEasing))
            }
        }
        Column(Modifier.fillMaxWidth().border(1.dp, Cargo.Accent.copy(alpha = .4f)).background(Cargo.Panel).padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally) {
            LedBoard("", { clock.value }, Modifier.widthIn(max = 220.dp).clearAndSetSemantics { })
            Text(message.uppercase(), Modifier.padding(top = 16.dp), textAlign = TextAlign.Center,
                style = loanBody(16).copy(fontFamily = Cargo.Ticket, letterSpacing = 1.sp, lineHeight = 22.sp), color = Cargo.Accent)
            Text("CUSTODY CHAIN UPDATED · SCAN LOGGED", Modifier.padding(top = 8.dp), textAlign = TextAlign.Center,
                style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
        }
    }
}
