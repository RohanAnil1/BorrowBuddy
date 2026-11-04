package `in`.borrowbuddy.android

import androidx.compose.ui.graphics.asAndroidBitmap

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.data.SecureSessionManager
import io.github.jan.supabase.auth.auth
import `in`.borrowbuddy.android.ui.PortalConnected
import `in`.borrowbuddy.android.ui.PortalEvents
import `in`.borrowbuddy.android.ui.PortalRefreshes
import `in`.borrowbuddy.android.ui.PortalNotificationEvents
import `in`.borrowbuddy.android.ui.PortalMembershipEvents
import `in`.borrowbuddy.android.ui.PortalNotificationCount
import `in`.borrowbuddy.android.ui.PortalUnreadChats
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class HostedSessionTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun delivered(key: androidx.compose.ui.semantics.SemanticsPropertyKey<Int>) =
        compose.onNode(SemanticsMatcher.keyIsDefined(PortalConnected)).fetchSemanticsNode().config[key]
    private fun awaitRealtimeText(text: String, event: androidx.compose.ui.semantics.SemanticsPropertyKey<Int>, previous: Int) {
        val deadline = System.nanoTime() + 12_000_000_000L
        while (System.nanoTime() < deadline) {
            compose.mainClock.advanceTimeByFrame()
            if (compose.onAllNodesWithContentDescription(text).fetchSemanticsNodes().isNotEmpty() && delivered(event) > previous) return
            Thread.sleep(50)
        }
        val portal = compose.onAllNodes(SemanticsMatcher.keyIsDefined(PortalConnected)).fetchSemanticsNodes().firstOrNull()?.config
        fail("Realtime badge did not update within 12 seconds: $text; connected=${portal?.get(PortalConnected)}, events=${portal?.get(PortalEvents)}, refreshes=${portal?.get(PortalRefreshes)}")
    }

    @Test fun nativeSignInRestoresEncryptedSessionAndSignsOut() {
        val arguments = InstrumentationRegistry.getArguments()
        val email = arguments.getString("qaEmail")
        val password = arguments.getString("qaPassword")
        assumeTrue("Hosted test requires an isolated account", !email.isNullOrBlank() && !password.isNullOrBlank())
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val repository = (context.applicationContext as BorrowBuddyApplication).repository
        try {
            compose.waitUntil(20_000) { compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("▶ START BORROWING").performClick()
            compose.onNode(hasSetTextAction() and hasText("BENNETT EMAIL")).performTextInput(email!!)
            compose.onNode(hasSetTextAction() and hasText("PASSWORD")).performTextInput(password!!)
            compose.onAllNodesWithText("SIGN IN").onLast().performClick()
            android.util.Log.i("BorrowBuddyQa", "Waiting for portal")
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("notifications-control").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("BROWSE").assertIsDisplayed()
            assertPaintedSurface(compose.onRoot().captureToImage().asAndroidBitmap())
            android.util.Log.i("BorrowBuddyQa", "Waiting for initial inbox badge")
            compose.waitUntil(15_000) { delivered(PortalNotificationCount) > 0 }
            compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(PortalConnected, true)).fetchSemanticsNodes().isNotEmpty() }
            val userId = repository.client.auth.currentUserOrNull()!!.id
            compose.mainClock.autoAdvance = false
            val clockBeforeRead = compose.mainClock.currentTime
            val notificationsBefore = delivered(PortalNotificationEvents)
            runBlocking { repository.markNotificationsRead(userId) }
            assertEquals("Read mutation must persist before checking delivery", 0, runBlocking { repository.unreadNotifications(userId) })
            android.util.Log.i("BorrowBuddyQa", "Waiting for realtime inbox read update")
            // Bound below the 30-second fallback: this must be a realtime update.
            awaitRealtimeText("Notifications", PortalNotificationEvents, notificationsBefore)
            assertTrue("An inbox refresh alone cannot prove realtime delivery", delivered(PortalNotificationEvents) > notificationsBefore)
            android.util.Log.i("BorrowBuddyQa", "Waiting for initial chat badge")
            assertTrue("Unread chat fixture required", delivered(PortalUnreadChats) > 0)
            val membershipsBefore = delivered(PortalMembershipEvents)
            runBlocking {
                repository.conversationSummaries(userId).filter { it.unread }.forEach {
                    repository.rpc("mark_conversation_read", kotlinx.serialization.json.buildJsonObject {
                        put("p_conversation_id", kotlinx.serialization.json.JsonPrimitive(it.conversation.id))
                    })
                }
            }
            val deadline = System.nanoTime() + 12_000_000_000L
            while (System.nanoTime() < deadline && (delivered(PortalUnreadChats) != 0 || delivered(PortalMembershipEvents) <= membershipsBefore)) {
                compose.mainClock.advanceTimeByFrame(); Thread.sleep(50)
            }
            assertEquals("Read tracking must refresh the unread conversations through realtime", 0, delivered(PortalUnreadChats))
            assertTrue("A chat refresh alone cannot prove realtime delivery", delivered(PortalMembershipEvents) > membershipsBefore)
            assertTrue("Polling must not satisfy realtime checks", compose.mainClock.currentTime - clockBeforeRead < 30_000)
            compose.mainClock.autoAdvance = true
            android.util.Log.i("BorrowBuddyQa", "Realtime badges passed")
            val stored = context.getSharedPreferences("encrypted_auth", 0).getString("data", null)
            assertNotNull("Session must be saved", stored)
            assertFalse("Session storage must not contain the email", stored!!.contains(email))
            val restored = runBlocking { SecureSessionManager(context).loadSession() }
            assertEquals(email, restored.user?.email)
            assertTrue(restored.accessToken.isNotBlank())
            compose.activityRule.scenario.recreate()
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("notifications-control").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithContentDescription("Open account").performClick()
            compose.waitUntil(30_000) { compose.onAllNodesWithText("SIGN OUT").fetchSemanticsNodes().isNotEmpty() }
            compose.onNode(hasScrollAction()).performScrollToNode(hasText("SIGN OUT"))
            compose.onNodeWithText("SIGN OUT").performClick()
            compose.waitUntil(30_000) { compose.onAllNodesWithText("WELCOME BACK").fetchSemanticsNodes().isNotEmpty() }
            assertTrue("Sign-out must erase persisted credentials", context.getSharedPreferences("encrypted_auth", 0).all.isEmpty())
        } finally {
            compose.mainClock.autoAdvance = true
            runBlocking { if (repository.client.auth.currentUserOrNull() != null) repository.signOut() }
        }
    }
}
