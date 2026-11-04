package `in`.borrowbuddy.android

import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.lifecycle.Lifecycle
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.domain.Item
import `in`.borrowbuddy.android.domain.Loan
import `in`.borrowbuddy.android.ui.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

/** Opt-in, fixture-free component validation on the dedicated QA emulator. */
class DashboardMotionTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private fun shell(command: String): String = android.os.ParcelFileDescriptor.AutoCloseInputStream(
        InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command)).bufferedReader().use { it.readText() }.trim()
    private fun alpha() = compose.onNode(SemanticsMatcher.keyIsDefined(DashboardPulseAlpha), useUnmergedTree = true)
        .fetchSemanticsNode().config[DashboardPulseAlpha]
    private fun snapshot(name: String): IntArray {
        val bitmap = compose.onNodeWithTag("dashboard-ticket-motion").captureToImage().asAndroidBitmap()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        context.filesDir.resolve("native-dashboard-pulse-$name.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        return IntArray(bitmap.width * bitmap.height).also { bitmap.getPixels(it, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height) }
    }
    @Test fun overduePixelsPulsePauseAndRespectReducedMotion() {
        assumeTrue("Dedicated emulator opt-in required", InstrumentationRegistry.getArguments().getString("qaDashboardMotion") == "1")
        assumeTrue("Global animation settings are changed only on an emulator", shell("getprop ro.kernel.qemu") == "1")
        val scale = shell("settings get global animator_duration_scale")
        check(scale == "null" || Regex("[0-9]+(?:\\.[0-9]+)?").matches(scale))
        try {
            shell("settings put global animator_duration_scale 1")
            compose.mainClock.autoAdvance = false
            val loan = Loan("motion", "request", "item", "owner", "borrower", "2026-10-15", "2026-10-16", "overdue",
                item = Item("item", "owner", "category", "Synthetic overdue camera"))
            compose.setContent { CargoTheme { Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
                DashboardTicket(loan, "borrower", DashboardTone.Danger) {}
            } } }
            compose.mainClock.advanceTimeBy(64); compose.waitForIdle()
            val samples = mutableListOf<Float>()
            var bright: IntArray? = null; var dim: IntArray? = null
            repeat(17) {
                val value = alpha(); samples += value
                if (value > .98f && bright == null) bright = snapshot("bright")
                if (value < .48f && dim == null) dim = snapshot("dim")
                compose.mainClock.advanceTimeBy(100); compose.waitForIdle()
            }
            assertTrue("Source pulse must reach its low opacity", samples.min() < .48f)
            assertTrue("Source pulse must return to full opacity", samples.max() > .98f)
            assertNotNull(bright); assertNotNull(dim)
            val brightPixels = requireNotNull(bright); val dimPixels = requireNotNull(dim)
            val changed = brightPixels.indices.count { brightPixels[it] != dimPixels[it] }
            assertTrue("Actual badge pixels must change, not just semantics", changed > 100)
            val beforeStop = alpha()
            compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
            compose.mainClock.advanceTimeBy(400)
            compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
            compose.mainClock.advanceTimeByFrame(); compose.waitForIdle()
            val afterResume = alpha()
            assertEquals("Background time must not advance the pulse", beforeStop, afterResume, .04f)
            shell("settings put global animator_duration_scale 0")
            assertEquals(0f, android.provider.Settings.Global.getFloat(InstrumentationRegistry.getInstrumentation().targetContext.contentResolver,
                android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f), .001f)
            compose.waitUntil(10_000) { compose.mainClock.advanceTimeByFrame(); alpha() == 1f }
            compose.mainClock.advanceTimeBy(900); compose.waitForIdle()
            assertEquals(1f, alpha(), .001f)
            snapshot("reduced")
            val report = org.json.JSONObject().put("minimumAlpha", samples.min()).put("maximumAlpha", samples.max())
                .put("changedPixels", changed).put("beforeStop", beforeStop).put("afterResume", afterResume).put("reducedAlpha", alpha())
            InstrumentationRegistry.getInstrumentation().targetContext.filesDir.resolve("native-dashboard-motion.json").writeText(report.toString(2))
        } finally {
            if (scale == "null") shell("settings delete global animator_duration_scale") else shell("settings put global animator_duration_scale $scale")
            compose.mainClock.autoAdvance = true
        }
    }
}
