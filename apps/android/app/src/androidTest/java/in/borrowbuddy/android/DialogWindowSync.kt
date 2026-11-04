package `in`.borrowbuddy.android

import android.app.Activity
import android.view.inspector.WindowInspector
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.ComposeTestRule

/** Dialogs attach a separate Android window outside Compose's virtual clock. */
internal fun awaitDialogWindow(compose: ComposeTestRule, activity: Activity) {
    compose.waitUntil(5_000) {
        // Commit the open/restore state, then allow the real WindowManager to
        // attach, measure and focus the new root before a synchronized touch.
        compose.mainClock.advanceTimeByFrame()
        var focused=false
        compose.runOnUiThread {
            focused=WindowInspector.getGlobalWindowViews().any {
                it.rootView !== activity.window.decorView.rootView && it.isAttachedToWindow && it.hasWindowFocus()
            }
        }
        focused
    }
    // Keep normal Compose idling and the actual dialog assertion/click path.
    compose.onNode(isDialog()).assertIsDisplayed()
}
