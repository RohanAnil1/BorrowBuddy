package `in`.borrowbuddy.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.ui.*
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class HostedOwnerDeskTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private lateinit var repository: BorrowRepository
    private fun stage(value: String) {
        context.filesDir.resolve("native-owner-stage.txt").writeText(value)
        android.util.Log.i("BorrowBuddyQa", "Owner stage: $value")
    }
    private fun await(text: String) = compose.waitUntil(30_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    private fun awaitDesk() = compose.waitUntil(30_000) { compose.onAllNodesWithTag("owner-desk").fetchSemanticsNodes().isNotEmpty() }
    private fun count(key: androidx.compose.ui.semantics.SemanticsPropertyKey<Int>) = compose.onNodeWithTag("owner-desk").fetchSemanticsNode().config[key]
    private fun scroll(matcher: SemanticsMatcher) = compose.onNodeWithTag("owner-desk").performScrollToNode(matcher)
    private fun tap(text: String, parent: SemanticsMatcher) {
        val target = hasText(text) and hasAnyAncestor(parent)
        scroll(target); compose.onNode(target).assertIsDisplayed().assertIsEnabled().performClick()
    }
    private fun login(email: String, password: String) {
        compose.waitUntil(30_000) { compose.onAllNodesWithText("WELCOME BACK").fetchSemanticsNodes().isNotEmpty() || compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty() }
        if (compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty()) compose.onNodeWithText("▶ START BORROWING").performClick()
        compose.onNode(hasSetTextAction() and hasText("BENNETT EMAIL")).performTextReplacement(email)
        compose.onNode(hasSetTextAction() and hasText("PASSWORD")).performTextReplacement(password)
        compose.onAllNodesWithText("SIGN IN").onLast().performClick(); await("BROWSE")
    }
    private fun owner() { compose.onNodeWithTag("nav-my/items").performClick(); awaitDesk() }
    private fun logout() {
        stage("account-open")
        compose.onNodeWithContentDescription("Open account").performClick()
        await("SIGN OUT")
        stage("account-scroll-sign-out")
        compose.onNode(hasScrollAction() and SemanticsMatcher.keyIsDefined(androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange)).performScrollToNode(hasText("SIGN OUT"))
        stage("sign-out-click")
        compose.onNodeWithText("SIGN OUT").performClick(); await("WELCOME BACK")
    }
    private fun capture(name: String) {
        compose.waitForIdle()
        val image = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        try {
            assertPaintedSurface(image)
            context.filesDir.resolve("native-owner-$name.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        } finally { image.recycle() }
    }
    /** Change emulator geometry before instrumentation starts: live wm resize can
     * strand Compose-Espresso's old activity root during Android configuration teardown. */
    @Test fun sourceOwnerWideLayoutInFreshProcess() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue(args.getString("qaOwnerWide") == "1")
        repository = (context.applicationContext as BorrowBuddyApplication).repository
        try {
            login(args.getString("qaOwnerEmail")!!, args.getString("qaPassword")!!); owner()
            assertEquals(1024, count(OwnerViewportWidth))
            val item = args.getString("qaCoverItem")!!
            val card = hasTestTag("owner-item-$item"); scroll(card)
            compose.waitUntil(30_000) { compose.onNodeWithTag("owner-cover-$item").fetchSemanticsNode().config[OwnerCoverReady] }
            val cover = compose.onNodeWithTag("owner-cover-$item").fetchSemanticsNode().boundsInRoot
            assertEquals(80f, cover.width, 1f); assertEquals(80f, cover.height, 1f)
            assertEquals(57f, cover.left, 1f)
            val title = compose.onNodeWithTag("owner-title-$item").fetchSemanticsNode().boundsInRoot
            assertEquals("Cover and title should share a row", 157f, title.left, 1f)
            val image = captureResizedDisplay(compose, 1024, 838, compose.onNode(card))
            try { context.filesDir.resolve("native-owner-wide.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } }
            finally { image.recycle() }
            context.filesDir.resolve("native-owner-wide-result.json").writeText(org.json.JSONObject()
                .put("viewportDp", 1024).put("coverWidthDp", cover.width).put("coverHeightDp", cover.height)
                .put("coverLeftDp", cover.left).put("titleLeftDp", title.left).put("coverDecoded", true)
                .put("freshProcess", true).toString(2))
        } finally { runBlocking { if (repository.client.auth.currentUserOrNull() != null) repository.signOut() } }
    }

    @Test fun ownerRequestsListingsDraftsControlsHistoryAndEmptyState() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Isolated hosted owner fixtures required", listOf("qaOwnerEmail", "qaEmptyEmail", "qaPassword", "qaDeclineRequest", "qaApproveRequest", "qaCoverItem", "qaDeleteItem", "qaApproveItem").all { !args.getString(it).isNullOrBlank() })
        repository = (context.applicationContext as BorrowBuddyApplication).repository
        val password = args.getString("qaPassword")!!
        val decline = args.getString("qaDeclineRequest")!!; val approve = args.getString("qaApproveRequest")!!
        val coverItem = args.getString("qaCoverItem")!!; val deleteItem = args.getString("qaDeleteItem")!!; val approveItem = args.getString("qaApproveItem")!!
        val expected = args.getString("qaItemCount")!!.toInt()
        try {
            login(args.getString("qaOwnerEmail")!!, password); owner()
            stage("owner-ready")
            compose.waitUntil(30_000) { count(OwnerPendingCount) == 2 && count(OwnerListingsCount) == expected }
            assertEquals(8, count(OwnerRecentCount)); capture("requests")
            val declineCard = hasTestTag("incoming-request-$decline")
            scroll(declineCard); compose.onNode(declineCard).assert(hasAnyDescendant(hasText("TRUST 71")))
            val reason = hasSetTextAction() and hasContentDescription("Decline reason (optional)") and hasAnyAncestor(declineCard)
            scroll(reason); compose.onNode(reason).performTextReplacement("   Cannot lend during this week.   ")
            androidx.test.espresso.Espresso.closeSoftKeyboard()
            compose.activityRule.scenario.recreate(); awaitDesk()
            scroll(reason); compose.onNode(reason).assertTextContains("   Cannot lend during this week.   ")
            tap("DECLINE", declineCard)
            stage("decline-submitted")
            compose.waitUntil(30_000) { count(OwnerPendingCount) == 1 }
            val ownerId = repository.client.auth.currentUserOrNull()!!.id
            val declined = runBlocking { repository.incomingRequests(ownerId).single { it.id == decline } }
            assertEquals("declined", declined.status); assertEquals("Cannot lend during this week.", declined.decline_reason)
            assertEquals(8, count(OwnerRecentCount))
            val itemCard = hasTestTag("owner-item-$coverItem")
            stage("listing-controls")
            scroll(itemCard)
            compose.waitUntil(30_000) { compose.onNodeWithTag("owner-cover-$coverItem").fetchSemanticsNode().config[OwnerCoverReady] }
            capture("listings")
            tap("PAUSE", itemCard)
            compose.waitUntil(30_000) { compose.onAllNodes(hasText("PAUSED") and hasAnyAncestor(itemCard)).fetchSemanticsNodes().isNotEmpty() }
            assertEquals("paused", runBlocking { repository.item(coverItem) }!!.status)
            tap("ACTIVATE", itemCard)
            compose.waitUntil(30_000) { compose.onAllNodes(hasText("AVAILABLE") and hasAnyAncestor(itemCard)).fetchSemanticsNodes().isNotEmpty() }
            scroll(hasTestTag("owner-cover-$coverItem")); compose.onNodeWithTag("owner-cover-$coverItem").performClick(); await(runBlocking { repository.item(coverItem) }!!.title.uppercase())
            UiDevice.getInstance(instrumentation).pressBack(); awaitDesk()
            tap("EDIT", itemCard); await("EDIT LISTING")
            compose.onNode(hasSetTextAction() and hasText("TITLE")).assertTextContains(runBlocking { repository.item(coverItem) }!!.title)
            UiDevice.getInstance(instrumentation).pressBack(); awaitDesk()
            val deleteCard = hasTestTag("owner-item-$deleteItem")
            tap("DELETE", deleteCard); compose.onNodeWithText("KEEP LISTING").performClick()
            assertNotNull(runBlocking { repository.item(deleteItem) })
            tap("DELETE", deleteCard); compose.onNodeWithTag("owner-delete-confirm").performClick()
            compose.waitUntil(30_000) { count(OwnerListingsCount) == expected - 1 }
            assertNull(runBlocking { repository.item(deleteItem) })
            tap("APPROVE", hasTestTag("incoming-request-$approve"))
            stage("approval-submitted")
            compose.waitUntil(30_000) { count(OwnerPendingCount) == 0 }
            val loan = runBlocking { repository.loans(ownerId).single { it.request_id == approve } }
            val loanCard = hasTestTag("loan-${loan.id}")
            tap("OPEN LOAN →", loanCard); await("[ CUSTODY CHAIN ]")
            compose.onNode(hasScrollAction() and SemanticsMatcher.keyIsDefined(androidx.compose.ui.semantics.SemanticsProperties.VerticalScrollAxisRange)).performScrollToNode(hasText("← BACK TO THE LOGBOOK"))
            compose.onNodeWithText("← BACK TO THE LOGBOOK").performClick(); awaitDesk()
            tap("DELETE", hasTestTag("owner-item-$approveItem")); compose.onNodeWithTag("owner-delete-confirm").performClick()
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("owner-action-error").fetchSemanticsNodes().isNotEmpty() }
            assertNotNull(runBlocking { repository.item(approveItem) }); assertEquals("awaiting_pickup", runBlocking { repository.loan(loan.id) }!!.status)
            scroll(hasTestTag("owner-decision-$approve")); capture("decisions")
            stage("phone-layout-complete")
            logout(); login(args.getString("qaEmptyEmail")!!, password); owner()
            stage("empty-owner")
            assertEquals(0, count(OwnerListingsCount)); assertEquals(0, count(OwnerPendingCount)); assertEquals(0, count(OwnerRecentCount))
            scroll(hasText("NOTHING LISTED YET")); capture("empty")
            assertTrue(compose.onAllNodesWithText("[ RECENT DECISIONS ]").fetchSemanticsNodes().isEmpty())
            scroll(hasText("LIST YOUR FIRST ITEM")); compose.onNodeWithText("LIST YOUR FIRST ITEM").performClick()
            await("LIST AN ITEM")
            compose.waitUntil(30_000) { compose.onAllNodes(hasSetTextAction() and hasText("TITLE")).fetchSemanticsNodes().isNotEmpty() }
            compose.onNode(hasSetTextAction() and hasText("TITLE")).assert(SemanticsMatcher.expectValue(
                androidx.compose.ui.semantics.SemanticsProperties.EditableText, androidx.compose.ui.text.AnnotatedString("")))
            context.filesDir.resolve("native-owner-result.json").writeText(org.json.JSONObject()
                .put("reasonRestored", true).put("reasonTrimmed", declined.decline_reason == "Cannot lend during this week.")
                .put("recentDecisionCap", 8).put("coverDecoded", true).put("statusToggle", true).put("editOpened", true)
                .put("deletionCancelledThenConfirmed", true).put("loanHistoryDeleteRejected", true)
                .put("ownerLoanAccess", true).put("emptyFirstListingNavigation", true).toString(2))
            stage("complete")
        } catch (failure: Throwable) {
            runCatching {
                val image = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
                try { context.filesDir.resolve("native-owner-failure.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } }
                finally { image.recycle() }
            }
            throw failure
        } finally { runBlocking { if (repository.client.auth.currentUserOrNull() != null) repository.signOut() } }
    }
}
