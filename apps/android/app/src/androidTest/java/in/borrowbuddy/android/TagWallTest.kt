package `in`.borrowbuddy.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.semantics.SemanticsActions
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.graphics.asAndroidBitmap
import `in`.borrowbuddy.android.ui.ActiveLoanTag
import `in`.borrowbuddy.android.ui.LoanTagRunning
import androidx.lifecycle.Lifecycle
import org.junit.Rule
import org.junit.Test

class TagWallTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun setting(value: String) {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand("settings put global animator_duration_scale $value")).use { it.readBytes() }
    }
    private fun active(index: Int) = SemanticsMatcher.expectValue(ActiveLoanTag, index)
    @Test fun arrowsSwipeKeyboardAndReducedMotionWorkOnLanding() {
        setting("0")
        try {
            compose.waitUntil(20_000) { compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty() }
            compose.onNode(hasScrollAction()).performScrollToNode(hasText("▶ LOANS IN PROGRESS"))
            compose.waitUntil(5000) { compose.onAllNodes(active(3)).fetchSemanticsNodes().isNotEmpty() }
            compose.onNode(hasScrollAction()).performScrollToNode(hasContentDescription("Next tag"))
            compose.onNodeWithContentDescription("Next tag").assertIsDisplayed()
            compose.mainClock.advanceTimeBy(2500)
            compose.onNode(active(3)).assertExists() // No interaction pause exists yet.
            compose.onNodeWithContentDescription("Next tag").performClick()
            compose.waitUntil(5000) { compose.onAllNodes(active(4)).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithContentDescription("Previous tag").performClick()
            compose.waitUntil(5000) { compose.onAllNodes(active(3)).fetchSemanticsNodes().isNotEmpty() }
            val spacing = 336 * .52f * compose.activity.resources.displayMetrics.density
            compose.onNodeWithContentDescription("Loan tag wall").performTouchInput {
                swipe(androidx.compose.ui.geometry.Offset(width * .85f, height * .4f), androidx.compose.ui.geometry.Offset(width * .85f - spacing, height * .4f), 350)
            }
            compose.waitUntil(5000) { compose.onAllNodes(active(4)).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithContentDescription("Loan tag wall").performSemanticsAction(SemanticsActions.RequestFocus) { it() }
            compose.onNodeWithContentDescription("Loan tag wall").performKeyInput { keyDown(Key.DirectionRight); keyUp(Key.DirectionRight) }
            compose.waitUntil(5000) { compose.onAllNodes(active(5)).fetchSemanticsNodes().isNotEmpty() }
            compose.mainClock.advanceTimeBy(8000)
            compose.onNode(active(5)).assertExists()
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            context.filesDir.resolve("tag-wall-native.png").outputStream().use {
                compose.onRoot().captureToImage().asAndroidBitmap().compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
            }
        } finally { setting("1") }
    }

    @Test fun autoAdvancePausesInBackgroundAndOffscreen() {
        setting("1")
        compose.waitUntil(20_000) { compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(hasScrollAction()).performScrollToNode(hasContentDescription("Next tag"))
        compose.waitUntil(5000) { compose.onAllNodes(SemanticsMatcher.expectValue(LoanTagRunning, true)).fetchSemanticsNodes().isNotEmpty() }
        val before = compose.onNodeWithContentDescription("Loan tag wall").fetchSemanticsNode().config[ActiveLoanTag]
        compose.mainClock.advanceTimeBy(1100)
        val after = compose.onNodeWithContentDescription("Loan tag wall").fetchSemanticsNode().config[ActiveLoanTag]
        org.junit.Assert.assertEquals((before + 1) % 8, after)
        compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        compose.mainClock.advanceTimeBy(4000)
        compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        compose.onNode(active(after)).assertExists()
        compose.onNode(hasScrollAction()).performScrollToNode(hasText("▶ START BORROWING"))
        compose.mainClock.advanceTimeBy(4000)
        compose.onNode(hasScrollAction()).performScrollToNode(hasContentDescription("Next tag"))
        compose.onNode(active(after)).assertExists()
    }
}
