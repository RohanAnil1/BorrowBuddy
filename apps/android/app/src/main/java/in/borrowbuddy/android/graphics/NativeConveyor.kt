package `in`.borrowbuddy.android.graphics

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import `in`.borrowbuddy.android.ui.rememberReducedMotion

@Composable fun NativeConveyor(playback: ConveyorPlayback, modifier: Modifier = Modifier, spread: Boolean = false,
    fallback: @Composable () -> Unit) {
    key(spread) {
        var ready by remember { mutableStateOf(false) }
        var failed by remember { mutableStateOf(false) }
        var view by remember { mutableStateOf<CargoConveyorView?>(null) }
        val lifecycle = LocalLifecycleOwner.current.lifecycle
        val reduced = rememberReducedMotion()
        val renderer = view
        DisposableEffect(lifecycle, renderer) {
            renderer?.resumed = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            val observer = LifecycleEventObserver { _, event ->
                if (event == Lifecycle.Event.ON_RESUME) renderer?.resumed = true
                if (event == Lifecycle.Event.ON_PAUSE) renderer?.resumed = false
            }
            lifecycle.addObserver(observer)
            onDispose { lifecycle.removeObserver(observer); renderer?.resumed = false }
        }
        Box(modifier) {
            Box(Modifier.fillMaxSize().alpha(if (ready && !failed) 0f else 1f)) { fallback() }
            if (!failed) AndroidView(factory = { context ->
                val renderer = CargoConveyorView(context, if (spread) 24f else 12f, playback, { ready = true }, { failed = true }).also {
                    view = it; it.resumed = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED); it.reducedMotion = reduced
                }
                ConveyorStageLayout(context, renderer)
            }, update = { it.renderer.reducedMotion = reduced }, modifier = Modifier.fillMaxSize())
        }
    }
}
