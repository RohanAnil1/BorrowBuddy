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

@Composable fun NativeDevice(modifier: Modifier = Modifier, fallback: @Composable () -> Unit) {
    var ready by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    var view by remember { mutableStateOf<CargoDeviceView?>(null) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val reduced = rememberReducedMotion()
    val nativeView = view
    DisposableEffect(lifecycle, nativeView) {
        nativeView?.resumed = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) nativeView?.resumed = true
            if (event == Lifecycle.Event.ON_PAUSE) nativeView?.resumed = false
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer); nativeView?.resumed = false }
    }
    Box(modifier) {
        // Keep the child order stable: moving a TextureView detaches and destroys ModelViewer.
        Box(Modifier.fillMaxSize().alpha(if (ready && !failed) 0f else 1f)) { fallback() }
        if (!failed) AndroidView(
            factory = { context -> CargoDeviceView(context, { ready = true }, { failed = true }).also {
                view = it
                it.resumed = lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
                it.reducedMotion = reduced
            } },
            update = { it.reducedMotion = reduced },
            modifier = Modifier.fillMaxSize(),
        )
    }
}
