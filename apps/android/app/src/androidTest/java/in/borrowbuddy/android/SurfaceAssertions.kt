package `in`.borrowbuddy.android

import android.graphics.Bitmap
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue

/** Semantics can remain healthy while a broken emulator GL backend paints black. */
internal fun assertPaintedSurface(bitmap: Bitmap) {
    val colors = mutableSetOf<Int>()
    for (y in 0 until 24) for (x in 0 until 24) {
        colors += bitmap.getPixel((x * bitmap.width / 24).coerceAtMost(bitmap.width - 1),
            (y * bitmap.height / 24).coerceAtMost(bitmap.height - 1))
    }
    assertTrue("The native surface must paint visible content; a uniform/black GPU capture cannot pass", colors.size > 1)
}

/** Capture the compositor after wm replaces a display surface. The content crop
 * prevents system bars or the app backdrop from satisfying the paint assertion. */
internal fun captureResizedDisplay(compose: ComposeTestRule, width: Int, height: Int,
    paintedNode: SemanticsNodeInteraction): Bitmap {
    compose.waitForIdle()
    val bounds = paintedNode.fetchSemanticsNode().boundsInWindow
    val image = requireNotNull(InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()) {
        "Display screenshot unavailable"
    }
    try {
        assertEquals("Capture must use the requested display width", width, image.width)
        assertEquals("Capture must use the requested display height", height, image.height)
        val left = bounds.left.toInt().coerceAtLeast(0)
        val top = bounds.top.toInt().coerceAtLeast(0)
        val right = bounds.right.toInt().coerceAtMost(width)
        val bottom = bounds.bottom.toInt().coerceAtMost(height)
        assertTrue("The asserted content must intersect the captured display", right > left && bottom > top)
        val content = Bitmap.createBitmap(image, left, top, right - left, bottom - top)
        try { assertPaintedSurface(content) } finally { if (content !== image) content.recycle() }
        return image
    } catch (failure: Throwable) { image.recycle(); throw failure }
}
