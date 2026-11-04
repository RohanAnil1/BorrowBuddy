package `in`.borrowbuddy.android

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.graphics.asAndroidBitmap
import `in`.borrowbuddy.android.domain.*
import `in`.borrowbuddy.android.ui.*
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class CampusPresentationTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private fun scroll(matcher: SemanticsMatcher) = compose.onNode(hasScrollAction() and SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)).performScrollToNode(matcher)
    @Test fun offlinePauseDraftRestorationAndRetryRemainAccessible() {
        val restoration = StateRestorationTester(compose)
        var retries = 0
        restoration.setContent { CargoTheme { OfflineScreen(retry = { retries++ }) } }
        scroll(hasText("PAUSE ANIMATION")); compose.onNodeWithText("PAUSE ANIMATION").performClick()
        compose.onNode(SemanticsMatcher.expectValue(OfflineMotionPaused, true)).assertExists()
        restoration.emulateSavedInstanceStateRestore()
        scroll(hasText("PLAY ANIMATION")); compose.onNodeWithText("PLAY ANIMATION").assertIsDisplayed()
        scroll(hasText("TRY AGAIN")); compose.onNodeWithText("TRY AGAIN").performClick(); assertEquals(1, retries)
        compose.onNodeWithText("BORROWBUDDY").assertExists()
        scroll(hasText("A LITTLE OUT"))
        val title = compose.onNodeWithText("A LITTLE OUT").captureToImage().asAndroidBitmap()
        var visibleTextPixels = 0
        for (y in 0 until title.height) for (x in 0 until title.width) {
            val pixel = title.getPixel(x, y)
            if (android.graphics.Color.red(pixel) > 220 && android.graphics.Color.green(pixel) > 220 && android.graphics.Color.blue(pixel) > 220) visibleTextPixels++
        }
        assertTrue("Offline heading must actually paint legible light text on its black panel", visibleTextPixels > 20)
    }
    @Test fun scheduleDraftKeepsWeeklyHoursExceptionsAndLengthAfterRecreation() {
        val restoration = StateRestorationTester(compose)
        restoration.setContent { CargoTheme { CampusPage("Handover hours", open = {}) {
            CampusScheduleEditor(CampusSchedule("host", "spot"), listOf(PickupLocation("spot", "Library")), rememberActions()) {}
        } } }
        scroll(hasText("MONDAY · UNAVAILABLE")); compose.onNodeWithText("MONDAY · UNAVAILABLE").performClick()
        val start = hasSetTextAction() and hasText("MONDAY START (HH:MM)")
        scroll(start); compose.onNode(start).performTextReplacement("16:00")
        androidx.test.espresso.Espresso.closeSoftKeyboard()
        scroll(hasText("ADD BLOCKED DATE")); compose.onNodeWithText("ADD BLOCKED DATE").performClick()
        restoration.emulateSavedInstanceStateRestore()
        scroll(start); compose.onNode(start).assertTextContains("16:00")
        scroll(hasText("BLOCKED · USE REPLACEMENT HOURS")); compose.onNodeWithText("BLOCKED · USE REPLACEMENT HOURS").assertIsDisplayed()
    }
    @Test fun campusNotificationsCannotNavigateToLegacyLoanOrChatIdentifiers() {
        val transfer = Notification("notice", "u", "campus_message", "Collection message", payload = buildJsonObject {
            put("campus_transfer_id", "transfer"); put("loan_id", "foreign-loan"); put("conversation_id", "foreign-chat")
        })
        assertEquals("campus/collections/transfer", notificationDestination(transfer))
        assertNull(notificationDestination(transfer.copy(payload = buildJsonObject { put("conversation_id", "foreign-chat") })))
        assertEquals("campus/admin", notificationDestination(transfer.copy(payload = buildJsonObject { put("campus_claim_id", "claim") })))
        assertEquals("loans/loan", notificationDestination(transfer.copy(type = "loan_due", payload = buildJsonObject { put("loan_id", "loan") })))
        assertEquals("loans/loan", notificationDestination(transfer.copy(type = "campus_update", payload = buildJsonObject { put("loan_id", "loan") })))
    }
}
