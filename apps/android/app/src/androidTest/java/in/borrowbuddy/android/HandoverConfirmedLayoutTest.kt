package `in`.borrowbuddy.android

import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.domain.Item
import `in`.borrowbuddy.android.domain.Loan
import `in`.borrowbuddy.android.domain.Profile
import `in`.borrowbuddy.android.ui.CargoTheme
import `in`.borrowbuddy.android.ui.HandoverConfirmedOverlay
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.io.File

/**
 * No network: renders the real confirmation screen and checks DONE is fully on
 * screen without scrolling once the sequence has played. Run it on the
 * smallest phone you have (a 360×800 dp Realme caught DONE being squeezed out).
 */
class HandoverConfirmedLayoutTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private val loan = Loan("ec957583-layout", "r", "i", "owner", "borrower", "2026-11-14", "2026-11-15", "returned",
        item = Item("i", "owner", "cat", "Canon EOS 200D camera kit"),
        owner = Profile("owner", full_name = "Phone Demo"), borrower = Profile("borrower", full_name = "Rohan Anil"))

    @Test fun doneFitsAfterAReturn() = fits("return")
    @Test fun doneFitsAfterAPickup() = fits("pickup")

    private fun fits(kind: String) {
        var closed = false
        compose.mainClock.autoAdvance = false
        compose.setContent { CargoTheme { HandoverConfirmedOverlay(kind, loan, "owner") { closed = true } } }
        awaitDialogWindow(compose, compose.activity)
        compose.mainClock.advanceTimeBy(3_500)

        // The whole card fits: its scroll range is empty, so nothing is cut off or hidden below.
        val range = compose.onNodeWithTag("handover-confirmed").fetchSemanticsNode().config[SemanticsProperties.VerticalScrollAxisRange]
        assertTrue("The card overflows a ${kind} screen by ${range.maxValue()} px", range.maxValue() <= 1f)
        val window = compose.onNode(isDialog()).fetchSemanticsNode().boundsInWindow
        val done = compose.onNodeWithTag("handover-confirmed-done")
        done.assertIsDisplayed()
        val button = done.fetchSemanticsNode().boundsInWindow
        assertTrue("DONE ($button) must sit inside the screen ($window) without scrolling",
            button.top >= window.top && button.bottom <= window.bottom && button.height >= 48f)

        save(compose.onNode(isDialog()).captureToImage().asAndroidBitmap(), "confirmed-$kind.png")
        done.performClick()
        compose.mainClock.advanceTimeByFrame()
        assertTrue("DONE closes the screen", closed)
    }

    private fun save(bitmap: Bitmap, name: String) {
        val dir = InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir("qa") ?: return
        File(dir, name).outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
