package `in`.borrowbuddy.android

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.ui.*
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URI

class HostedShellTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun number(key: SemanticsPropertyKey<Int>) = compose.onNode(SemanticsMatcher.keyIsDefined(PortalConnected)).fetchSemanticsNode().config[key]
    private fun collapsed() = compose.onNode(SemanticsMatcher.keyIsDefined(PortalConnected)).fetchSemanticsNode().config[PortalTickerCollapsed]
    private fun await(condition: () -> Boolean) = compose.waitUntil(30_000, condition)
    private fun shown(text: String) = compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
    private fun scroll(matcher: SemanticsMatcher) = compose.onNode(hasScrollAction() and SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)).performScrollToNode(matcher)
    private fun capture(name: String) {
        val image = compose.onRoot().captureToImage().asAndroidBitmap(); assertPaintedSurface(image)
        java.io.File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir, name).outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
    }
    private fun realtime(key: SemanticsPropertyKey<Int>, expected: Int, event: SemanticsPropertyKey<Int>, previous: Int) {
        val deadline = System.nanoTime() + 12_000_000_000L
        while (System.nanoTime() < deadline) {
            compose.mainClock.advanceTimeByFrame()
            if (number(key) == expected && number(event) > previous) return
            Thread.sleep(50)
        }
        fail("Header must update through realtime within 12 seconds: expected=$expected, actual=${number(key)}, events=${number(event)}")
    }

    @Test fun faithfulShellExactCountsRealtimeAndNavigationRestoration() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Hosted shell requires isolated fixtures", listOf("qaOwnerEmail", "qaEmail", "qaPassword", "qaShellItemId").all { !args.getString(it).isNullOrBlank() })
        val password = args.getString("qaPassword")!!
        val actor = Borrower(args.getString("qaEmail")!!, password)
        val repository = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as BorrowBuddyApplication).repository
        try {
            await { shown("▶ START BORROWING") }; compose.onNodeWithText("▶ START BORROWING").performClick()
            compose.onNode(hasSetTextAction() and hasText("BENNETT EMAIL")).performTextInput(args.getString("qaOwnerEmail")!!)
            compose.onNode(hasSetTextAction() and hasText("PASSWORD")).performTextInput(password)
            compose.onAllNodesWithText("SIGN IN").onLast().performClick()
            await { compose.onAllNodesWithTag("portal-header").fetchSemanticsNodes().isNotEmpty() }
            await { number(PortalPendingRequests) == 61 && number(PortalNotificationCount) >= 61 }
            await { compose.onAllNodes(SemanticsMatcher.expectValue(PortalConnected, true)).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("pending-requests-badge", useUnmergedTree = true).assertTextEquals("61")
            compose.onNodeWithTag("notifications-badge", useUnmergedTree = true).assertTextEquals("9+")
            val unread = number(PortalNotificationCount)
            compose.onNodeWithContentDescription("Notifications ($unread unread)").assertIsDisplayed()
            compose.onNodeWithContentDescription("Open account").assertIsDisplayed()
            assertTrue(compose.onAllNodesWithText("INBOX", substring = true).fetchSemanticsNodes().isEmpty())
            assertTrue(compose.onAllNodesWithText("MY BORROWS").fetchSemanticsNodes().isEmpty())
            assertEquals(0f, collapsed(), .001f)
            capture("native-shell-expanded.png")

            compose.mainClock.autoAdvance = false
            val before = number(PortalPendingRequestEvents)
            val request = actor.request(args.getString("qaShellItemId")!!)
            realtime(PortalPendingRequests, 62, PortalPendingRequestEvents, before)
            compose.mainClock.autoAdvance = true
            compose.onNodeWithTag("pending-requests-badge", useUnmergedTree = true).assertTextEquals("62")
            compose.onNodeWithTag("catalog-pending-requests").assertTextEquals("[ 62 REQUESTS WAITING ON YOU ]").performClick()
            await { compose.onAllNodesWithTag("owner-desk").fetchSemanticsNodes().isNotEmpty() }
            compose.onNode(hasScrollAction() and SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)).performTouchInput {
                swipe(Offset(width * .98f, height * .8f), Offset(width * .98f, height * .2f), 400)
            }
            await { collapsed() > .99f }; capture("native-shell-scrolled.png")
            compose.activityRule.scenario.recreate()
            await { compose.onAllNodesWithTag("owner-desk").fetchSemanticsNodes().isNotEmpty() }; assertTrue("Ticker position must survive recreation", collapsed() > .99f)
            compose.onNodeWithContentDescription("BorrowBuddy — home").performClick()
            await { shown("WHAT'S ON THE SHELF TODAY") }; assertEquals(0f, collapsed(), .001f)
            repeat(3) {
                for (route in listOf("dashboard", "chat", "map")) {
                    compose.onNodeWithTag("nav-$route").performClick()
                    await { compose.onAllNodes(SemanticsMatcher.expectValue(PortalDestination, route)).fetchSemanticsNodes().isNotEmpty() }
                    compose.onNode(SemanticsMatcher.keyIsDefined(PortalConnected)).assert(
                        SemanticsMatcher.expectValue(PortalPreviousDestination, "home?spot={spot}&category={category}"))
                }
            }
            androidx.test.espresso.Espresso.pressBack()
            await { shown("WHAT'S ON THE SHELF TODAY") }

            compose.onNodeWithTag("nav-my/items").performClick()
            val approve = hasText("APPROVE") and hasAnyAncestor(hasTestTag("incoming-request-$request"))
            await { compose.onAllNodes(approve).fetchSemanticsNodes().isNotEmpty() }; scroll(approve)
            compose.onNode(approve).performClick()
            await { number(PortalPendingRequests) == 61 }
            assertEquals("approved", runBlocking { repository.incomingRequests(repository.client.auth.currentUserOrNull()!!.id) }.single { it.id == request }.status)
            val available = runBlocking { repository.catalog(`in`.borrowbuddy.android.domain.CatalogFilters(
                from = `in`.borrowbuddy.android.domain.Rules.today().toString(), to = `in`.borrowbuddy.android.domain.Rules.today().plusDays(1).toString())) }
            assertEquals("Booked rows must be excluded before the 48-item server limit", 48, available.size)
            assertFalse(available.any { it.id == args.getString("qaShellItemId") })
            compose.onNodeWithTag("notifications-control").performClick()
            await { shown("MARK ALL READ") }
            scroll(hasText("MARK ALL READ"))
            compose.mainClock.autoAdvance = false
            val notificationEvents = number(PortalNotificationEvents)
            compose.onNodeWithText("MARK ALL READ").performClick()
            realtime(PortalNotificationCount, 0, PortalNotificationEvents, notificationEvents)
            compose.mainClock.autoAdvance = true
            compose.onNodeWithContentDescription("Notifications").assertIsDisplayed()
            assertTrue(compose.onAllNodesWithTag("notifications-badge", useUnmergedTree = true).fetchSemanticsNodes().isEmpty())
            capture("native-shell-notifications-read.png")
            compose.onNodeWithContentDescription("Open account").performClick()
            await { shown("SIGN OUT") }; scroll(hasText("SIGN OUT")); compose.onNodeWithText("SIGN OUT").performClick()
            await { shown("WELCOME BACK") }
        } finally { compose.mainClock.autoAdvance = true; runBlocking { repository.signOut() } }
    }

    private class Borrower(email: String, password: String) {
        private var token = ""
        private val id: String
        init {
            val session = JSONObject(call("/auth/v1/token?grant_type=password", JSONObject().put("email", email).put("password", password)))
            token = session.getString("access_token"); id = session.getJSONObject("user").getString("id")
        }
        fun request(item: String): String {
            val start = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata"))
            return JSONArray(call("/rest/v1/borrow_requests", JSONObject().put("item_id", item).put("borrower_id", id)
                .put("start_date", start.toString()).put("end_date", start.plusDays(1).toString()))).getJSONObject(0).getString("id")
        }
        private fun call(path: String, body: JSONObject): String {
            val connection = URI(BuildConfig.SUPABASE_URL + path).toURL().openConnection() as HttpURLConnection
            try {
                connection.requestMethod = "POST"; connection.connectTimeout = 15_000; connection.readTimeout = 15_000; connection.doOutput = true
                connection.setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
                connection.setRequestProperty("Authorization", "Bearer ${token.ifBlank { BuildConfig.SUPABASE_ANON_KEY }}")
                connection.setRequestProperty("Content-Type", "application/json"); connection.setRequestProperty("Prefer", "return=representation")
                connection.outputStream.use { it.write(body.toString().toByteArray()) }
                assertTrue("Normal actor request failed (${connection.responseCode})", connection.responseCode in 200..299)
                return connection.inputStream.bufferedReader().use { it.readText() }
            } finally { connection.disconnect() }
        }
    }
}
