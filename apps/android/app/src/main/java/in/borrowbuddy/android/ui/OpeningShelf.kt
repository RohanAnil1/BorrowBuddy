package `in`.borrowbuddy.android.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.withInfiniteAnimationFrameNanos
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.isActive

@Composable fun OpeningShelf(modifier: Modifier = Modifier) {
    var elapsed by remember { mutableDoubleStateOf(0.0) }
    val reduced = rememberReducedMotion()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var resumed by remember { mutableStateOf(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) resumed = true
            if (event == Lifecycle.Event.ON_PAUSE) resumed = false
        }
        lifecycle.addObserver(observer); onDispose { lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(reduced, resumed) {
        if (!reduced && resumed) {
            var last = 0L
            while (isActive) withInfiniteAnimationFrameNanos { frame -> if (last != 0L) elapsed += (frame - last) / 1e9; last = frame }
        }
    }
    BoxWithConstraints(modifier.fillMaxSize().background(Cargo.Canvas), contentAlignment = Alignment.Center) {
        val fontSize = if (maxWidth >= 800.dp) 20 else 15
        Text("[ OPENING THE BUDDY SHELF. . . ]", Modifier.padding(horizontal = 16.dp).graphicsLayer {
            val phase = elapsed % 6
            alpha = if (reduced) .4f else if (phase >= .06 && phase < .12 || phase >= .18 && phase < .24) .08f else 1f
        }, style = TextStyle(fontFamily = Cargo.Mono, fontSize = fontSize.sp, letterSpacing = (fontSize * .08f).sp, color = Cargo.Accent, textAlign = androidx.compose.ui.text.style.TextAlign.Center))
    }
}

@Composable fun ShelfOpeningOverlay(transition: MutableTransitionState<Boolean>) {
    AnimatedVisibility(visibleState = transition, enter = EnterTransition.None, exit = fadeOut(tween(500, easing = CubicBezierEasing(.4f, 0f, .2f, 1f)))) {
        OpeningShelf(Modifier.pointerInput(Unit) { awaitPointerEventScope { while (true) awaitPointerEvent().changes.forEach { it.consume() } } })
    }
}
