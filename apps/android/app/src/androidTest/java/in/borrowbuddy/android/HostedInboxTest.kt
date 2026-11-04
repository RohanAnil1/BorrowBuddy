package `in`.borrowbuddy.android

import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.ui.*
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class HostedInboxTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private lateinit var repository: BorrowRepository
    private fun await(text: String) = compose.waitUntil(30_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    private fun ready() = compose.waitUntil(30_000) { compose.onAllNodesWithTag("notification-inbox").fetchSemanticsNodes().isNotEmpty() }
    private fun scroll(matcher: SemanticsMatcher) = compose.onNodeWithTag("notification-inbox").performScrollToNode(matcher)
    private fun count(key: SemanticsPropertyKey<Int>) = compose.onNodeWithTag("notification-inbox").fetchSemanticsNode().config[key]
    private fun headerCount() = compose.onNode(SemanticsMatcher.keyIsDefined(PortalConnected)).fetchSemanticsNode().config[PortalNotificationCount]
    private fun login(email: String, password: String) {
        compose.waitUntil(30_000) { compose.onAllNodesWithText("WELCOME BACK").fetchSemanticsNodes().isNotEmpty() || compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty() }
        if (compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty()) compose.onNodeWithText("▶ START BORROWING").performClick()
        compose.onNode(hasSetTextAction() and hasText("BENNETT EMAIL")).performTextReplacement(email)
        compose.onNode(hasSetTextAction() and hasText("PASSWORD")).performTextReplacement(password)
        androidx.test.espresso.Espresso.closeSoftKeyboard(); compose.onAllNodesWithText("SIGN IN").onLast().performScrollTo().performClick(); await("BROWSE")
    }
    private fun inbox() { compose.onNodeWithTag("notifications-control").performClick(); ready() }
    private fun logout() {
        compose.onNodeWithContentDescription("Open account").performClick(); await("SIGN OUT")
        compose.onNodeWithText("SIGN OUT").performScrollTo().performClick(); await("WELCOME BACK")
    }
    private fun capture(name: String) {
        val bitmap = compose.onRoot().captureToImage().asAndroidBitmap(); assertPaintedSurface(bitmap)
        context.filesDir.resolve("native-inbox-$name.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
    }
    private fun shell(command: String) = android.os.ParcelFileDescriptor.AutoCloseInputStream(instrumentation.uiAutomation.executeShellCommand(command)).bufferedReader().use { it.readText() }
    private fun wide(id: String) {
        val original = count(InboxViewportWidth)
        val size = Regex("Override size: (\\d+x\\d+)").find(shell("wm size"))?.groupValues?.get(1)
        val density = Regex("Override density: (\\d+)").find(shell("wm density"))?.groupValues?.get(1)
        try {
            shell("wm size 1024x838"); shell("wm density 160")
            compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(InboxViewportWidth, 1024)).fetchSemanticsNodes().isNotEmpty() }
            compose.waitUntil(15_000) { headerCount() == 28 }
            scroll(hasTestTag("notification-$id"))
            var painted: android.graphics.Bitmap? = null
            compose.waitUntil(30_000) {
                val root = compose.onAllNodesWithTag("notification-inbox").fetchSemanticsNodes().singleOrNull()
                if (root?.config?.getOrNull(InboxViewportWidth) != 1024) return@waitUntil false
                val row = compose.onAllNodesWithTag("notification-$id").fetchSemanticsNodes().singleOrNull() ?: return@waitUntil false
                val bounds = row.boundsInWindow
                val candidate = instrumentation.uiAutomation.takeScreenshot() ?: return@waitUntil false
                if (candidate.width != 1024 || candidate.height != 838 || bounds.width < 600 || bounds.top < 0 || bounds.bottom > 838) { candidate.recycle(); return@waitUntil false }
                var edges = 0
                for (y in listOf(bounds.top + 6, bounds.center.y, bounds.bottom - 6)) for (left in listOf(true, false)) {
                    val insideX = if (left) bounds.left + 6 else bounds.right - 6
                    val outsideX = if (left) bounds.left - 4 else bounds.right + 4
                    val inside = candidate.getPixel(insideX.toInt(), y.toInt()); val outside = candidate.getPixel(outsideX.toInt(), y.toInt())
                    val blue = android.graphics.Color.blue(outside)
                    if (blue > 24 && blue > android.graphics.Color.red(outside) + 12 && android.graphics.Color.blue(inside) < blue * .7f) edges++
                }
                if (edges == 6) {
                    assertEquals(168f, bounds.left, 1f); assertEquals(856f, bounds.right, 1f)
                    context.filesDir.resolve("native-inbox-capture-checks.json").writeText(JSONObject().put("edgeContrasts", edges).put("width", 1024).put("height", 838).put("left", bounds.left).put("right", bounds.right).toString(2))
                    painted = candidate; true
                } else { candidate.recycle(); false }
            }
            val image = requireNotNull(painted)
            try { context.filesDir.resolve("native-inbox-wide.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } }
            finally { image.recycle() }
        } finally { shell("wm size ${size ?: "reset"}"); shell("wm density ${density ?: "reset"}") }
        compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(InboxViewportWidth, original)).fetchSemanticsNodes().isNotEmpty() }
    }
    @Test fun inboxLinksFortyRowWindowReadAllPrivacyRestorationAndEmptyState() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Isolated hosted inbox fixtures required", listOf("qaEmail", "qaEmptyEmail", "qaPassword", "qaIds", "qaStudentId", "qaLoanId", "qaItemId", "qaConversationId").all { !args.getString(it).isNullOrBlank() })
        repository = (context.applicationContext as BorrowBuddyApplication).repository
        val ids = args.getString("qaIds")!!.split(','); val student = args.getString("qaStudentId")!!
        val password = args.getString("qaPassword")!!
        try {
            login(args.getString("qaEmail")!!, password); inbox()
            compose.waitUntil(15_000) { headerCount() == 28 }
            assertEquals(40, count(InboxRowCount)); assertEquals(26, count(InboxUnreadCount))
            val rows = runBlocking { repository.notifications(student) }
            assertEquals(ids.take(40), rows.map { it.id }); assertEquals(28, runBlocking { repository.unreadNotifications(student) })
            assertEquals("loans/${args.getString("qaLoanId")}", notificationDestination(rows[0]))
            assertEquals("items/${args.getString("qaItemId")}", notificationDestination(rows[1]))
            assertEquals("chat/${args.getString("qaConversationId")}", notificationDestination(rows[2]))
            assertNull(notificationDestination(rows[3])); assertNull(notificationDestination(rows[4]))
            compose.onNodeWithTag("notification-${ids[0]}").assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Read"))
            capture("mixed")
            wide(ids[0])
            for ((index, heading) in listOf(0 to "[ CUSTODY CHAIN ]", 1 to "PICKUP SPOT", 2 to "MESSAGE")) {
                val row = hasTestTag("notification-${ids[index]}"); scroll(row); compose.onNode(row).assertIsDisplayed().assertHasClickAction().performClick()
                if (index == 1) {
                    await("[ OWNER ]")
                    compose.onNodeWithText(runBlocking { repository.item(args.getString("qaItemId")!!) }!!.title.uppercase()).assertExists()
                }
                else if (index == 2) compose.waitUntil(30_000) { compose.onAllNodesWithTag("chat-messages").fetchSemanticsNodes().isNotEmpty() }
                else await(heading)
                UiDevice.getInstance(instrumentation).pressBack(); ready()
            }
            for (index in listOf(3, 4)) { val row = hasTestTag("notification-${ids[index]}"); scroll(row); compose.onNode(row).assert(hasClickAction().not()) }
            val mark = hasText("MARK ALL READ"); scroll(mark); compose.onNode(mark).assertIsDisplayed().assertIsEnabled().performClick()
            compose.waitUntil(30_000) { count(InboxUnreadCount) == 0 }
            assertEquals(0, runBlocking { repository.unreadNotifications(student) })
            compose.waitUntil(15_000) { headerCount() == 0 }
            assertTrue(compose.onAllNodesWithText("MARK ALL READ").fetchSemanticsNodes().isEmpty())
            scroll(hasText("[ CONTROL TOWER ]")); capture("read")
            compose.activityRule.scenario.recreate(); ready(); assertEquals(40, count(InboxRowCount)); assertEquals(0, count(InboxUnreadCount))
            logout(); login(args.getString("qaEmptyEmail")!!, password); inbox()
            assertEquals(0, count(InboxRowCount)); scroll(hasTestTag("inbox-empty"))
            compose.onNodeWithText("NOTHING ON THE WIRE").assertIsDisplayed(); assertTrue(compose.onAllNodesWithText("MARK ALL READ").fetchSemanticsNodes().isEmpty()); capture("empty")
            logout()
            context.filesDir.resolve("native-inbox-result.json").writeText(JSONObject().put("loadedRows", 40).put("totalUnreadBefore", 28).put("visibleUnreadBefore", 26)
                .put("sourceLinkPriority", true).put("nativeConversationLinkRetained", true).put("malformedPayloadIgnored", true).put("wholeCardNavigation", true)
                .put("allOwnRowsMarkedRead", true).put("readStateRestored", true).put("emptyInbox", true).toString(2))
        } catch (failure: Throwable) {
            runCatching { val bitmap = instrumentation.uiAutomation.takeScreenshot(); try { context.filesDir.resolve("inbox-failure.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } } finally { bitmap.recycle() } }
            throw failure
        } finally { runBlocking { if (repository.client.auth.currentUserOrNull() != null) repository.signOut() } }
    }
}
