package `in`.borrowbuddy.android

import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.lifecycle.Lifecycle
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.ui.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class InboxMotionTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private fun shell(command: String) = android.os.ParcelFileDescriptor.AutoCloseInputStream(
        InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command)).bufferedReader().use { it.readText() }.trim()
    private fun alpha() = compose.onNodeWithTag("notification-unread-motion", useUnmergedTree = true).fetchSemanticsNode().config[InboxDotAlpha]
    private fun pixels(name: String): IntArray {
        val bitmap = compose.onNodeWithTag("notification-unread-motion", useUnmergedTree = true).captureToImage().asAndroidBitmap()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        context.filesDir.resolve("native-inbox-blink-$name.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        return IntArray(bitmap.width * bitmap.height).also { bitmap.getPixels(it, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height) }
    }
    @Test fun sourceBlinkPixelsPauseAndRespectReducedMotion() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("qaInboxMotion") == "1")
        assumeTrue(shell("getprop ro.kernel.qemu") == "1")
        val scale = shell("settings get global animator_duration_scale")
        check(scale == "null" || Regex("[0-9]+(?:\\.[0-9]+)?").matches(scale))
        var enabled by mutableStateOf(true)
        try {
            shell("settings put global animator_duration_scale 1")
            compose.mainClock.autoAdvance = false
            compose.setContent { CargoTheme { Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
                InboxUnreadIndicator("motion", rememberInboxBlink(enabled))
            } } }
            compose.mainClock.advanceTimeBy(32); compose.waitForIdle()
            val bright = pixels("bright")
            compose.waitUntil(5_000) { compose.mainClock.advanceTimeByFrame(); alpha() < .1f }
            val dim = pixels("dim"); assertEquals(bright.size, dim.size)
            val changed = bright.indices.count { bright[it] != dim[it] }; assertTrue("Actual unread-dot pixels must blink", changed > 10)
            compose.runOnIdle { enabled = false }; compose.mainClock.advanceTimeByFrame(); compose.waitForIdle()
            val paused = alpha(); compose.mainClock.advanceTimeBy(500); assertEquals(paused, alpha(), .001f)
            compose.runOnIdle { enabled = true }; compose.mainClock.advanceTimeByFrame(); compose.waitForIdle()
            assertEquals("Visibility pause must retain the clock phase", paused, alpha(), .001f)
            val beforeStop = alpha()
            compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED); compose.mainClock.advanceTimeBy(500)
            compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED); compose.mainClock.advanceTimeByFrame(); compose.waitForIdle()
            assertEquals("Background time must not advance the blink", beforeStop, alpha(), .001f)
            shell("settings put global animator_duration_scale 0")
            compose.waitUntil(10_000) { compose.mainClock.advanceTimeByFrame(); alpha() == 1f }
            repeat(400) { compose.mainClock.advanceTimeByFrame(); assertEquals("Reduced motion must stay solid through a whole source cycle", 1f, alpha(), .001f) }
            pixels("reduced")
            InstrumentationRegistry.getInstrumentation().targetContext.filesDir.resolve("native-inbox-motion.json").writeText(
                org.json.JSONObject().put("changedPixels", changed).put("pausedAlpha", paused).put("backgroundAlpha", beforeStop).put("reducedAlpha", alpha()).toString(2))
        } finally {
            if (scale == "null") shell("settings delete global animator_duration_scale") else shell("settings put global animator_duration_scale $scale")
            compose.mainClock.autoAdvance = true
        }
    }
}
