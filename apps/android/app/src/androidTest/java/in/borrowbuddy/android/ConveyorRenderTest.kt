package `in`.borrowbuddy.android

import android.view.View
import android.view.ViewGroup
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.lifecycle.Lifecycle
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.graphics.CargoConveyorView
import `in`.borrowbuddy.android.graphics.ConveyorMotion
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class ConveyorRenderTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun setting(value: String) {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand("settings put global animator_duration_scale $value")).use { it.readBytes() }
    }
    private fun find(view: View): CargoConveyorView? {
        if (view is CargoConveyorView) return view
        if (view is ViewGroup) for (i in 0 until view.childCount) find(view.getChildAt(i))?.let { return it }
        return null
    }
    private fun renderer(): CargoConveyorView? {
        var view: CargoConveyorView? = null
        compose.activityRule.scenario.onActivity { view = find(it.window.decorView) }
        return view
    }
    private fun openQueue() {
        compose.waitUntil(20_000) { compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("▶ THE BORROW QUEUE"))
    }
    @Test fun originalConveyorRendersCyclesAndPausesWithLifecycle() {
        setting("1"); openQueue()
        compose.waitUntil(25_000) { renderer()?.let { it.renderedFrames > 5 && it.pose.cycle >= 1 } == true }
        val view = renderer()!!
        assertEquals(1, view.pose.crateIndex)
        assertTrue(view.gateCounts.all { it >= 1 })
        val beltBefore = view.beltTextureOffset
        compose.waitUntil(5000) { view.beltTextureOffset != beltBefore && view.pose.activeGate != null }
        Thread.sleep(180) // Capture the visible scan burst rather than the zero-opacity entry frame.
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val scanImage = instrumentation.uiAutomation.takeScreenshot()
        instrumentation.targetContext.filesDir.resolve("conveyor-scanning-native.png").outputStream().use {
            scanImage.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
        }
        scanImage.recycle()
        compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        val frames = view.renderedFrames
        val cycle = view.pose.cycle
        Thread.sleep(350)
        assertEquals(frames, view.renderedFrames); assertEquals(cycle, view.pose.cycle)
        compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        compose.waitUntil(5000) { view.renderedFrames > frames }
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("THE CAMPUS"))
        compose.waitForIdle()
        val stoppedTime = view.playbackTimeMs
        Thread.sleep(350)
        assertEquals("Offscreen scrolling must suspend the line clock", stoppedTime, view.playbackTimeMs, 0.0)
        openQueue()
        compose.waitUntil(20_000) { renderer()?.let { it.renderedFrames > 5 && it.playbackTimeMs >= stoppedTime } == true }
        val savedTime = renderer()!!.playbackTimeMs
        val savedCounts = renderer()!!.gateCounts.toList()
        compose.activityRule.scenario.recreate()
        openQueue()
        compose.waitUntil(20_000) { renderer()?.let { it.renderedFrames > 5 && it.playbackTimeMs >= savedTime } == true }
        assertTrue(renderer()!!.gateCounts.zip(savedCounts).all { (actual, saved) -> actual >= saved })
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("▶ START BORROWING"))
        compose.onNodeWithText("▶ START BORROWING").performClick()
        compose.onNodeWithText("WELCOME BACK").assertIsDisplayed()
        assertNull(renderer())
    }
    @Test fun reducedMotionShowsTheOriginalStillScene() {
        setting("0")
        try {
            openQueue()
            compose.waitUntil(20_000) { renderer()?.let { it.renderedFrames > 5 && it.pose.phases.all { phase -> phase == ConveyorMotion.Phase.STILL } } == true }
            val view = renderer()!!
            assertEquals(1.5f, view.pose.x, 0f); assertEquals(3, view.pose.stamps)
            val instrumentation = InstrumentationRegistry.getInstrumentation()
            val bitmap = instrumentation.uiAutomation.takeScreenshot()
            val bounds = android.graphics.Rect()
            compose.activityRule.scenario.onActivity {
                assertTrue(view.getGlobalVisibleRect(bounds))
                val location = IntArray(2); view.getLocationOnScreen(location)
                bounds.set(location[0], location[1], location[0] + view.width, location[1] + view.height)
            }
            instrumentation.targetContext.filesDir.resolve("conveyor-native.png").outputStream().use {
                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
            }
            var samples = 0; var hallPixels = 0; var labelPixels = 0
            for (y in bounds.top.coerceAtLeast(0) until bounds.bottom.coerceAtMost(bitmap.height) step 8)
                for (x in bounds.left.coerceAtLeast(0) until bounds.right.coerceAtMost(bitmap.width) step 8) {
                    val pixel = bitmap.getPixel(x, y)
                    val r = android.graphics.Color.red(pixel); val g = android.graphics.Color.green(pixel); val b = android.graphics.Color.blue(pixel)
                    samples++
                    if (r < 40 && g < 40 && b < 40) hallPixels++
                    if (r > 150 && g > 150 && b > 130) labelPixels++
                }
            assertTrue("The shipping hall must replace the backdrop, not merely count empty GPU frames", samples > 0 && hallPixels > samples * .4)
            assertTrue("Source station signs/parcel paper must appear in the rendered scene", labelPixels > samples * .005)
            val topPixel = bitmap.getPixel(bounds.centerX().coerceIn(0, bitmap.width - 1), (bounds.top + 2).coerceIn(0, bitmap.height - 1))
            assertTrue("The hall's masked top edge must reveal the blue page backdrop", android.graphics.Color.blue(topPixel) > android.graphics.Color.red(topPixel) + 10)
            val middlePixel = bitmap.getPixel(bounds.centerX().coerceIn(0, bitmap.width - 1), (bounds.top + (view.height * .04f).toInt()).coerceIn(0, bitmap.height - 1))
            val innerPixel = bitmap.getPixel(bounds.centerX().coerceIn(0, bitmap.width - 1), (bounds.top + (view.height * .12f).toInt()).coerceIn(0, bitmap.height - 1))
            val middleBlue = android.graphics.Color.blue(middlePixel)
            assertTrue("The mask must fade gradually instead of cutting off its first 8 percent", middleBlue > android.graphics.Color.blue(innerPixel) + 5 && middleBlue < android.graphics.Color.blue(topPixel) - 5)
            instrumentation.targetContext.filesDir.resolve("conveyor-native.png").outputStream().use {
                bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
            }
            bitmap.recycle()
        } finally { setting("1") }
    }
}
