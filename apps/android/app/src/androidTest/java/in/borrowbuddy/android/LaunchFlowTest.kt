package `in`.borrowbuddy.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.hasText
import android.view.View
import android.view.ViewGroup
import `in`.borrowbuddy.android.graphics.CargoDeviceView
import org.junit.Rule
import org.junit.Test

class LaunchFlowTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    @Test fun landingOpensNativeSignInAndRegistration() {
        compose.waitUntil(15_000) {
            compose.onAllNodes(androidx.compose.ui.test.hasText("▶ START BORROWING")).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("▶ START BORROWING").performClick()
        compose.onNodeWithText("WELCOME BACK").assertIsDisplayed()
        compose.onNodeWithText("BENNETT EMAIL").assertIsDisplayed()
        compose.onNodeWithText("SIGN UP").performClick()
        compose.onNodeWithText("GET YOUR CAMPUS PASS").assertIsDisplayed()
        compose.onNodeWithText("REPEAT PASSWORD").assertIsDisplayed()
    }

    @Test fun nativeDeviceRendersSettlesAndReleasesOnNavigation() {
        compose.waitUntil(20_000) {
            var rendered = false
            compose.activityRule.scenario.onActivity { activity ->
                findDevice(activity.window.decorView)?.let { rendered = it.renderedFrames > 5 && it.bootSettled }
            }
            rendered
        }
        compose.waitUntil(5000) {
            compose.onAllNodes(androidx.compose.ui.test.hasText("▶ START BORROWING")).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("▶ START BORROWING").performClick()
        compose.onNodeWithText("WELCOME BACK").assertIsDisplayed()
        compose.activityRule.scenario.onActivity { activity ->
            org.junit.Assert.assertNull("Native renderer must leave the view tree after navigation", findDevice(activity.window.decorView))
        }
    }
    private fun findDevice(view: View): CargoDeviceView? {
        if (view is CargoDeviceView) return view
        if (view is ViewGroup) for (index in 0 until view.childCount) findDevice(view.getChildAt(index))?.let { return it }
        return null
    }
}
