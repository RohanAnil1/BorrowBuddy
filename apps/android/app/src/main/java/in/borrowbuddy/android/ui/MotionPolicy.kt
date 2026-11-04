package `in`.borrowbuddy.android.ui

import android.animation.ValueAnimator
import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext

@Composable fun rememberReducedMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    // Content observers can precede ValueAnimator's cached scale update.
    fun readReducedMotion() = runCatching {
        Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) <= 0f
    }.getOrElse { !ValueAnimator.areAnimatorsEnabled() }
    var reduced by remember(resolver) { mutableStateOf(readReducedMotion()) }
    DisposableEffect(resolver) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) { reduced = readReducedMotion() }
        }
        resolver.registerContentObserver(Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE), false, observer)
        onDispose { resolver.unregisterContentObserver(observer) }
    }
    return reduced
}
