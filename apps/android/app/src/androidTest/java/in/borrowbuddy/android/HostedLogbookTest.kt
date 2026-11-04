package `in`.borrowbuddy.android

import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.Rules
import `in`.borrowbuddy.android.ui.CatalogLoading
import `in`.borrowbuddy.android.ui.CatalogResultCount
import `in`.borrowbuddy.android.ui.DashboardCategoryColumns
import `in`.borrowbuddy.android.ui.DashboardLoanCount
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class HostedLogbookTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private lateinit var repository: BorrowRepository
    private fun await(text: String) = compose.waitUntil(30_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    private fun logbookScroll(matcher: SemanticsMatcher) = compose.onNodeWithTag("borrow-logbook").performScrollToNode(matcher)
    private fun dashboardScroll(matcher: SemanticsMatcher) = compose.onNodeWithTag("dashboard-scroll").performScrollToNode(matcher)
    private fun shell(command: String): String = android.os.ParcelFileDescriptor.AutoCloseInputStream(
        InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command)).bufferedReader().use { it.readText() }
    private fun dashboard(args: android.os.Bundle) {
        android.util.Log.i("BorrowBuddyQa", "Logbook dashboard: open and exercise tabs")
        compose.onNodeWithTag("nav-dashboard").performClick()
        compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(DashboardLoanCount, 2)).fetchSemanticsNodes().isNotEmpty() }
        dashboardScroll(hasTestTag("dashboard-logbook")); capture("dashboard")
        dashboardScroll(hasTestTag("dashboard-loan-ticker"))
        compose.onNodeWithTag("dashboard-loan-ticker").performTouchInput { swipeLeft() }
        val ticket = "dashboard-ticket-${args.getString("qaLendLoan")}"
        compose.onNodeWithTag("dashboard-loan-ticker").performScrollToNode(hasTestTag(ticket))
        compose.onNodeWithTag(ticket).assertIsDisplayed().performClick(); await("[ CUSTODY CHAIN ]")
        androidx.test.espresso.Espresso.pressBack()
        compose.waitUntil(30_000) { compose.onAllNodesWithTag("dashboard-scroll").fetchSemanticsNodes().isNotEmpty() }
        dashboardScroll(hasTestTag("dashboard-lending-tab"))
        compose.onNodeWithTag("dashboard-borrowing-tab").assertTextContains("BORROWING (1)")
        compose.onNodeWithTag("dashboard-lending-tab").assertTextContains("LENDING (1)").performClick()
        val movement = "dashboard-movement-${args.getString("qaLendLoan")}"
        compose.waitUntil(10_000) { compose.onAllNodesWithTag(movement).fetchSemanticsNodes().isNotEmpty() }
        dashboardScroll(hasTestTag(movement)); capture("dashboard-lending")
        compose.onNodeWithTag(movement).performClick(); await("[ CUSTODY CHAIN ]")
        androidx.test.espresso.Espresso.pressBack()
        compose.waitUntil(30_000) { compose.onAllNodesWithTag("dashboard-scroll").fetchSemanticsNodes().isNotEmpty() }
        dashboardScroll(hasTestTag("dashboard-lending-tab")); compose.onNodeWithTag("dashboard-lending-tab").assertIsSelected()
        compose.activityRule.scenario.recreate()
        compose.waitUntil(30_000) { compose.onAllNodesWithTag("dashboard-scroll").fetchSemanticsNodes().isNotEmpty() }
        dashboardScroll(hasTestTag("dashboard-lending-tab")); compose.onNodeWithTag("dashboard-lending-tab").assertIsSelected()
        val category = runBlocking { repository.categories().first() }
        if (args.getString("qaAdaptiveWindow") == "1") {
            val size = Regex("Override size: (\\d+x\\d+)").find(shell("wm size"))?.groupValues?.get(1)
            val density = Regex("Override density: (\\d+)").find(shell("wm density"))?.groupValues?.get(1)
            try {
                android.util.Log.i("BorrowBuddyQa", "Logbook dashboard: resize to tablet")
                shell("wm size 1024x838"); shell("wm density 160")
                compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(DashboardCategoryColumns, 4)).fetchSemanticsNodes().isNotEmpty() }
                dashboardScroll(hasTestTag("dashboard-category-${category.id}"))
                val width = compose.onNodeWithTag("dashboard-category-${category.id}").fetchSemanticsNode().boundsInRoot.width
                assertTrue("Source category columns should be 227 dp at 1024 dp", width in 226f..228f)
                capture("dashboard-wide", displayWidth = 1024,
                    paintedNode = compose.onNodeWithTag("dashboard-category-${category.id}"))
            } finally {
                android.util.Log.i("BorrowBuddyQa", "Logbook dashboard: restore phone display")
                shell("wm size ${size ?: "reset"}"); shell("wm density ${density ?: "reset"}")
            }
            compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(DashboardCategoryColumns, 2)).fetchSemanticsNodes().isNotEmpty() }
            android.util.Log.i("BorrowBuddyQa", "Logbook dashboard: phone columns restored")
        }
        dashboardScroll(hasTestTag("dashboard-category-${category.id}")); compose.onNodeWithTag("dashboard-category-${category.id}").performClick()
        compose.waitUntil(30_000) { compose.onAllNodesWithContentDescription("Category: ${category.name}").fetchSemanticsNodes().isNotEmpty() }
        androidx.test.espresso.Espresso.pressBack()
        compose.waitUntil(30_000) { compose.onAllNodesWithTag("dashboard-scroll").fetchSemanticsNodes().isNotEmpty() }
    }
    private fun capture(name: String, displayWidth: Int? = null, paintedNode: SemanticsNodeInteraction? = null) {
        val image = if (displayWidth == null) compose.onRoot().captureToImage().asAndroidBitmap()
            else captureResizedDisplay(compose, displayWidth, 838, requireNotNull(paintedNode))
        try {
            assertPaintedSurface(image)
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            context.filesDir.resolve("native-logbook-$name.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        } finally { if (displayWidth != null) image.recycle() }
    }
    private fun login(email: String, password: String) {
        compose.waitUntil(30_000) { compose.onAllNodesWithText("WELCOME BACK").fetchSemanticsNodes().isNotEmpty() || compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty() }
        if (compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty()) compose.onNodeWithText("▶ START BORROWING").performClick()
        compose.onNode(hasSetTextAction() and hasText("BENNETT EMAIL")).performTextReplacement(email)
        compose.onNode(hasSetTextAction() and hasText("PASSWORD")).performTextReplacement(password)
        compose.onAllNodesWithText("SIGN IN").onLast().performClick(); await("BROWSE")
    }
    @Test fun bothLoanRolesWaitlistJoinLeaveCancellationAndEmptyBrowse() {
        val args = InstrumentationRegistry.getArguments()
        val required = listOf("qaEmail", "qaPassword", "qaEmptyEmail", "qaBorrowLoan", "qaLendLoan", "qaWaitItem", "qaNotifiedEntry", "qaPendingRequest")
        assumeTrue("Isolated logbook fixture required", required.all { !args.getString(it).isNullOrBlank() })
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        repository = (context.applicationContext as BorrowBuddyApplication).repository
        try {
            login(args.getString("qaEmail")!!, args.getString("qaPassword")!!)
            val history = runBlocking { repository.loans(repository.client.auth.currentUserOrNull()!!.id) }
            val viewer = repository.client.auth.currentUserOrNull()!!.id
            assertEquals("Website caps borrower history independently", 60, history.count { it.borrower_id == viewer })
            assertEquals("An older lending loan must survive a large borrower history", 1, history.count { it.owner_id == viewer })
            assertEquals(61, history.size)
            assertEquals(history.size, history.distinctBy { it.id }.size)
            assertTrue("Merged roles must retain newest-first order", history.zipWithNext().all { (a, b) -> java.time.Instant.parse(a.created_at) >= java.time.Instant.parse(b.created_at) })
            assertTrue(history.any { it.id == args.getString("qaLendLoan") })
            assertTrue("Borrower rows beyond the source cap must be excluded", history.none { it.id == args.getString("qaExcludedLoan") })
            val counterpart = history.first { it.owner_id != viewer }.owner_id
            val counterpartHistory = runBlocking { repository.loans(counterpart) }
            assertEquals("The owner role has the same independent cap", 60, counterpartHistory.count { it.owner_id == counterpart })
            assertEquals(1, counterpartHistory.count { it.borrower_id == counterpart })
            assertTrue("RLS must restrict cross-profile reads to the viewer's own loan parties", counterpartHistory.all { it.owner_id == viewer || it.borrower_id == viewer })
            context.filesDir.resolve("native-loan-history.json").writeText(org.json.JSONObject()
                .put("borrowerRows", history.count { it.borrower_id == viewer }).put("ownerRows", history.count { it.owner_id == viewer })
                .put("totalRows", history.size).put("uniqueRows", history.distinctBy { it.id }.size)
                .put("olderOwnerLoanVisible", history.any { it.id == args.getString("qaLendLoan") })
                .put("oldBorrowerExcluded", history.none { it.id == args.getString("qaExcludedLoan") })
                .put("counterpartOwnerRows", counterpartHistory.count { it.owner_id == counterpart })
                .put("counterpartBorrowerRows", counterpartHistory.count { it.borrower_id == counterpart })
                .put("counterpartReadRespectsRls", counterpartHistory.all { it.owner_id == viewer || it.borrower_id == viewer }).toString(2))
            dashboard(args)
            openBorrowLogbook(compose)
            logbookScroll(hasTestTag("loan-${args.getString("qaBorrowLoan")}"))
            compose.onNodeWithTag("loan-${args.getString("qaBorrowLoan")}").assert(hasText("FROM ANDROID QA OWNER", substring = true))
            capture("active")
            logbookScroll(hasText("[ YOUR ITEMS OUT ON LOAN ]"))
            logbookScroll(hasTestTag("loan-${args.getString("qaLendLoan")}"))
            compose.onNodeWithTag("loan-${args.getString("qaLendLoan")}").assert(hasText("WITH ANDROID QA OWNER · DUE", substring = true)).performClick()
            await("[ CUSTODY CHAIN ]")
            compose.onNode(hasScrollAction() and SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)).performScrollToNode(hasText("← BACK TO THE LOGBOOK"))
            compose.onNodeWithText("← BACK TO THE LOGBOOK").performClick()
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("owner-desk").fetchSemanticsNodes().isNotEmpty() }
            openBorrowLogbook(compose)
            val notified = args.getString("qaNotifiedEntry")!!
            logbookScroll(hasTestTag("waitlist-$notified"))
            compose.onNodeWithTag("waitlist-$notified").assert(hasAnyDescendant(hasText("DATES JUST OPENED UP", substring = true)))
            capture("waitlist")
            val pending = args.getString("qaPendingRequest")!!
            logbookScroll(hasTestTag("cancel-request-$pending"))
            compose.onNodeWithTag("cancel-request-$pending").performClick()
            compose.waitUntil(20_000) { compose.onAllNodesWithTag("cancel-request-$pending").fetchSemanticsNodes().isEmpty() }
            logbookScroll(hasText("NO PENDING REQUESTS. REQUESTS AUTO-EXPIRE AFTER 48 HOURS."))
            val userId = repository.client.auth.currentUserOrNull()!!.id
            assertEquals("cancelled", runBlocking { repository.outgoingRequests(userId).single { it.id == pending }.status })
            logbookScroll(hasTestTag("leave-waitlist-$notified"))
            compose.onNodeWithTag("leave-waitlist-$notified").performClick()
            compose.waitUntil(20_000) { compose.onAllNodesWithTag("leave-waitlist-$notified").fetchSemanticsNodes().isEmpty() }
            assertTrue(runBlocking { repository.waitlist(userId).none { it.id == notified } })
            // Join through the existing item calendar, using a range free of fixture loans.
            val itemId = args.getString("qaWaitItem")!!
            compose.onNodeWithTag("nav-home").performClick()
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("catalog-search").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("catalog-search").performTextInput(args.getString("qaWaitTitle")!!.replace('_', ' '))
            compose.onNodeWithText("SEARCH").performClick()
            compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(CatalogLoading, false) and
                SemanticsMatcher.expectValue(CatalogResultCount, 1)).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("catalog-scroll").performScrollToNode(hasTestTag("catalog-item-$itemId"))
            compose.onNodeWithTag("catalog-item-$itemId").performClick()
            await("[ DATES TAKEN? ]")
            val vertical = hasScrollAction() and SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)
            val start = Rules.today(); val end = start.plusDays(1)
            compose.onNode(vertical).performScrollToNode(hasContentDescription("Date $start"))
            compose.onNodeWithContentDescription("Date $start").performClick()
            if (end.month != start.month) { compose.onNode(vertical).performScrollToNode(hasText("→")); compose.onNodeWithText("→").performClick() }
            compose.onNode(vertical).performScrollToNode(hasContentDescription("Date $end")); compose.onNodeWithContentDescription("Date $end").performClick()
            compose.onNode(vertical).performScrollToNode(hasText("JOIN WAITLIST")); compose.onNodeWithText("JOIN WAITLIST").performClick()
            await("[ YOU'RE ON THE WAITLIST. ]")
            val waiting = runBlocking { repository.waitlist(userId).single { it.item_id == itemId } }
            openBorrowLogbook(compose)
            logbookScroll(hasTestTag("waitlist-${waiting.id}"))
            compose.onNodeWithTag("waitlist-${waiting.id}").assert(hasAnyDescendant(hasText("STILL BOOKED", substring = true)))
            compose.activityRule.scenario.recreate()
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("borrow-logbook").fetchSemanticsNodes().isNotEmpty() }
            logbookScroll(hasTestTag("leave-waitlist-${waiting.id}")); compose.onNodeWithTag("leave-waitlist-${waiting.id}").performClick()
            compose.waitUntil(20_000) { compose.onAllNodesWithTag("leave-waitlist-${waiting.id}").fetchSemanticsNodes().isEmpty() }
            assertTrue(runBlocking { repository.waitlist(userId).none { it.id == waiting.id } })
            logbookScroll(hasText("[ OVERDUE LOANS ACCRUE A ₹20/DAY FINE, CAPPED AT ₹1,000 ]")); capture("policy")
            compose.onNodeWithContentDescription("Open account").performClick()
            await("SIGN OUT")
            compose.onNode(vertical).performScrollToNode(hasText("SIGN OUT")); compose.onNodeWithText("SIGN OUT").performClick()
            login(args.getString("qaEmptyEmail")!!, args.getString("qaPassword")!!)
            compose.onNodeWithTag("nav-dashboard").performClick()
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("dashboard-scroll").fetchSemanticsNodes().isNotEmpty() }
            dashboardScroll(hasText("[ NOTHING MOVING RIGHT NOW — BROWSE THE CATALOG ]"))
            dashboardScroll(hasTestTag("dashboard-borrowing-tab"))
            compose.onNodeWithTag("dashboard-borrowing-tab").assertTextContains("BORROWING (0)")
            compose.onNodeWithTag("dashboard-lending-tab").assertTextContains("LENDING (0)")
            dashboardScroll(hasText("[ NOTHING HERE YET ]")); capture("dashboard-empty")
            openBorrowLogbook(compose)
            logbookScroll(hasText("[ NOTHING BORROWED RIGHT NOW ]"))
            logbookScroll(hasText("NO BORROWS YET")); capture("empty")
            logbookScroll(hasTestTag("logbook-browse")); compose.onNodeWithTag("logbook-browse").performClick()
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("catalog-search").fetchSemanticsNodes().isNotEmpty() }
        } catch (failure: Throwable) {
            // A Compose-idling failure can also block captureToImage. Capture the
            // compositor directly so the original failure retains its evidence.
            runCatching {
                val image = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
                try { context.filesDir.resolve("native-logbook-failure.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } }
                finally { image.recycle() }
            }
            throw failure
        }
        finally { runBlocking { if (repository.client.auth.currentUserOrNull() != null) repository.signOut() } }
    }
}
