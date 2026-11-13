package `in`.borrowbuddy.android

import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.ui.LoanFactColumns
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.JsonNull
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class HostedLoanFlowTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private lateinit var repository: BorrowRepository
    private fun vertical() = hasScrollAction() and SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)
    private fun shell(command: String): String = android.os.ParcelFileDescriptor.AutoCloseInputStream(
        InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command)).bufferedReader().use { it.readText() }
    private fun capture(name: String, displayWidth: Int? = null) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        compose.waitForIdle()
        // After wm replaces the display surface, Compose's window capture can time
        // out in forceRedraw despite the new layout being ready. Capture the actual
        // compositor output for these display-size checks, retaining the layout,
        // exact display dimensions and painted-pixel assertions.
        val image = if (displayWidth == null) compose.onRoot().captureToImage().asAndroidBitmap()
            else captureResizedDisplay(compose, displayWidth, 838, compose.onNodeWithTag("loan-facts"))
        try {
            assertPaintedSurface(image)
            context.filesDir.resolve("native-loan-$name.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        } finally { if (displayWidth != null) image.recycle() }
    }
    private fun adaptiveFacts() {
        val size = Regex("Override size: (\\d+x\\d+)").find(shell("wm size"))?.groupValues?.get(1)
        val density = Regex("Override density: (\\d+)").find(shell("wm density"))?.groupValues?.get(1)
        try {
            for ((width, columns) in listOf(768 to 2, 1024 to 4)) {
                shell("wm size ${width}x838"); shell("wm density 160")
                compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(LoanFactColumns, columns)).fetchSemanticsNodes().isNotEmpty() }
                scrollTo(hasTestTag("loan-facts"))
                val labels = listOf("DATES", "DEPOSIT", "COUNTERPARTY TRUST", "HANDOVER")
                val bounds = labels.map { compose.onNodeWithTag("loan-fact-$it").fetchSemanticsNode().boundsInRoot }
                assertTrue("Source grid columns must have equal width", bounds.maxOf { it.width } - bounds.minOf { it.width } <= 1f)
                if (columns == 4) assertTrue("Wide facts must occupy one row", bounds.maxOf { it.top } - bounds.minOf { it.top } <= 1f)
                else {
                    assertEquals(bounds[0].top, bounds[1].top, 1f)
                    assertEquals(bounds[2].top, bounds[3].top, 1f)
                    assertTrue(bounds[2].top > bounds[0].bottom)
                }
                capture("facts-$width", displayWidth = width)
            }
        } finally {
            shell("wm size ${size ?: "reset"}"); shell("wm density ${density ?: "reset"}")
        }
        compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(LoanFactColumns, 1)).fetchSemanticsNodes().isNotEmpty() }
    }
    private fun scrollTo(matcher: SemanticsMatcher) = compose.onNode(vertical()).performScrollToNode(matcher)
    private fun tap(text: String) { awaitText(text); scrollTo(hasText(text)); compose.onNodeWithText(text).assertIsDisplayed().assertIsEnabled().performClick() }
    private fun awaitText(text: String, substring: Boolean = false) {
        try { compose.waitUntil(25_000) { compose.onAllNodesWithText(text, substring = substring).fetchSemanticsNodes().isNotEmpty() } }
        catch (failure: androidx.compose.ui.test.ComposeTimeoutException) { throw AssertionError("Native loan screen did not show '$text'", failure) }
    }
    private fun login(email: String, password: String) {
        compose.waitUntil(25_000) { compose.onAllNodesWithText("WELCOME BACK").fetchSemanticsNodes().isNotEmpty() || compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty() }
        if (compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty()) compose.onNodeWithText("▶ START BORROWING").performClick()
        compose.onNode(hasSetTextAction() and hasText("BENNETT EMAIL")).performTextReplacement(email)
        compose.onNode(hasSetTextAction() and hasText("PASSWORD")).performTextReplacement(password)
        compose.onAllNodesWithText("SIGN IN").onLast().performClick()
        awaitText("BROWSE")
    }
    private fun logout() {
        compose.onNodeWithContentDescription("Open account").performClick()
        tap("SIGN OUT")
        awaitText("WELCOME BACK")
    }
    private fun openLoan(id: String, owner: Boolean) {
        if (owner) compose.onNodeWithTag("nav-my/items").performClick() else openBorrowLogbook(compose)
        if (owner) compose.waitUntil(25_000) { compose.onAllNodesWithTag("owner-desk").fetchSemanticsNodes().isNotEmpty() }
        val button = if (owner) hasText("OPEN LOAN →") and hasAnyAncestor(hasTestTag("loan-$id")) else hasTestTag("loan-$id")
        scrollTo(button); compose.onNode(button).performClick()
        awaitText("[ CUSTODY CHAIN ]")
    }
    private fun code(): String {
        // The pass hides its digits until asked.
        compose.waitUntil(20_000) { compose.onAllNodesWithTag("handover-reveal").fetchSemanticsNodes().isNotEmpty() }
        if (compose.onAllNodesWithTag("handover-code").fetchSemanticsNodes().isEmpty()) {
            scrollTo(hasTestTag("handover-reveal")); compose.onNodeWithTag("handover-reveal").performClick()
        }
        compose.waitUntil(20_000) { compose.onAllNodesWithTag("handover-code").fetchSemanticsNodes().isNotEmpty() }
        scrollTo(hasTestTag("handover-code"))
        return compose.onNodeWithTag("handover-code").fetchSemanticsNode().config[SemanticsProperties.Text].single().text
    }
    private fun assertQr(payload: String) {
        compose.waitUntil(10_000) { compose.onAllNodesWithTag("handover-qr").fetchSemanticsNodes().isNotEmpty() }
        scrollTo(hasTestTag("handover-qr"))
        compose.mainClock.advanceTimeByFrame()
        compose.waitForIdle()
        val bitmap = compose.onNodeWithTag("handover-qr").captureToImage().asAndroidBitmap()
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        val decoded = try { MultiFormatReader().decode(BinaryBitmap(HybridBinarizer(RGBLuminanceSource(bitmap.width, bitmap.height, pixels)))) }
        catch (failure: com.google.zxing.ReaderException) {
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            java.io.File(context.filesDir, "native-handover-qr-failure.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            android.util.Log.i("BorrowBuddyQa", "QR capture failed: ${bitmap.width}x${bitmap.height}; darkPixels=${pixels.count { android.graphics.Color.red(it) < 64 && android.graphics.Color.green(it) < 64 && android.graphics.Color.blue(it) < 64 }}; bounds=${compose.onNodeWithTag("handover-qr").fetchSemanticsNode().boundsInRoot}")
            throw failure
        }
        assertEquals(payload, decoded.text)
    }
    private fun generateWithRealtimePrivacyCheck(loanId: String) {
        val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
        val channel = repository.client.channel("android-qa-private-handover-$loanId-${java.util.UUID.randomUUID()}") {
            broadcast { replicationReady = true }
        }
        val ready = scope.async(start = CoroutineStart.UNDISPATCHED) {
            channel.systemFlow().first { it.status == "ok" && it.extension in setOf("system", "postgres_changes") }
        }
        val changed = scope.async(start = CoroutineStart.UNDISPATCHED) {
            channel.postgresChangeFlow<PostgresAction.Update>("public") {
                table = "loans"; filter { eq("id", loanId) }
            }.first()
        }
        try {
            runBlocking { withTimeout(20_000) { channel.subscribe(blockUntilSubscribed = true); ready.await() } }
            tap("GENERATE CODE")
            val event = runBlocking { withTimeout(15_000) { changed.await() } }
            assertEquals("Expected actual loan update", loanId,
                (event.record["id"] as kotlinx.serialization.json.JsonPrimitive).content)
            for (record in listOf(event.record, event.oldRecord)) {
                for (column in listOf("handover_token_hash", "return_token_hash")) {
                    assertTrue("Realtime must not expose a handover secret", record[column] == null || record[column] == JsonNull)
                }
            }
        } finally {
            try { runBlocking { withTimeoutOrNull(5_000) { channel.unsubscribe() } } }
            finally { runBlocking { repository.client.realtime.removeChannel(channel) }; scope.cancel() }
        }
    }
    private fun confirm(kind: String, token: String, error: String? = null) {
        scrollTo(hasText("6-DIGIT CODE"))
        compose.onNode(hasSetTextAction() and hasText("6-DIGIT CODE")).performTextReplacement(token)
        compose.onNode(hasSetTextAction() and hasText("6-DIGIT CODE")).assertTextContains(token)
        compose.onNode(hasSetTextAction() and hasText("6-DIGIT CODE")).performImeAction()
        tap("CONFIRM ${kind.uppercase()}")
        if (error != null) {
            awaitText(error, true)
            compose.waitUntil(20_000) {
                compose.onAllNodesWithText("CONFIRM ${kind.uppercase()}").fetchSemanticsNodes().any { !it.config.contains(SemanticsProperties.Disabled) }
            }
        } else awaitText(if (kind == "pickup") "BORROWED" else "RETURNED")
    }
    @Test fun ownerApprovalTwoPartyHandoverLockoutRegenerationAndReview() {
        val args = InstrumentationRegistry.getArguments()
        val borrower = args.getString("qaEmail"); val owner = args.getString("qaOwnerEmail")
        val password = args.getString("qaPassword"); val requestId = args.getString("qaRequestId")
        assumeTrue("Isolated hosted owner/borrower/request required", listOf(borrower, owner, password, requestId).all { !it.isNullOrBlank() })
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        context.filesDir.resolve("hosted-loan-failure.png").delete()
        repository = (context.applicationContext as BorrowBuddyApplication).repository
        try {
            login(owner!!, password!!)
            compose.onNodeWithTag("nav-my/items").performClick()
            compose.waitUntil(25_000) { compose.onAllNodesWithTag("owner-desk").fetchSemanticsNodes().isNotEmpty() }
            val approval = hasText("APPROVE") and hasAnyAncestor(hasTestTag("incoming-request-$requestId"))
            scrollTo(approval); compose.onNode(approval).assertIsDisplayed().assertIsEnabled().performClick()
            val ownerId = repository.client.auth.currentUserOrNull()!!.id
            var approvedLoan: `in`.borrowbuddy.android.domain.Loan? = null
            compose.waitUntil(25_000) { approvedLoan = runBlocking { repository.loans(ownerId).singleOrNull { it.request_id == requestId } }; approvedLoan != null }
            val loanId = approvedLoan!!.id
            scrollTo(hasTestTag("loan-$loanId"))
            compose.onNode(hasText("AWAITING PICKUP") and hasAnyAncestor(hasTestTag("loan-$loanId"))).assertIsDisplayed()
            android.util.Log.i("BorrowBuddyQa", "Native loan: approval persisted")
            logout(); login(borrower!!, password)
            openLoan(loanId, false)
            awaitText("COUNTERPARTY TRUST"); awaitText("IN-APP 6-DIGIT CODE")
            awaitText("AWAITING PICKUP")
            awaitText("NO DEPOSIT")
            compose.onNodeWithTag("custody-APPROVED").assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Pending"))
            compose.onNodeWithTag("custody-PICKED UP").assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Pending"))
            scrollTo(hasTestTag("loan-facts"))
            val facts = compose.onNodeWithTag("loan-facts").fetchSemanticsNode()
            assertTrue("Source facts must have a nonzero native layout", facts.size.height > 0 && facts.size.width > 0)
            compose.onRoot().captureToImage().asAndroidBitmap().let { image ->
                context.filesDir.resolve("native-loan-facts.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            }
            if (args.getString("qaAdaptiveWindow") == "1") adaptiveFacts()
            tap("← BACK TO THE LOGBOOK")
            awaitText("[ LOGBOOK — BORROWED ]")
            openLoan(loanId, false)
            generateWithRealtimePrivacyCheck(loanId)
            val pickup = code(); assertQr("bb:pickup:$pickup")
            val expiry = runBlocking { repository.loan(loanId)!!.handover_token_expires_at }
            assertNotNull(expiry)
            compose.activityRule.scenario.recreate()
            assertEquals("Rotation must retain the existing single-use ticket", pickup, code())
            android.util.Log.i("BorrowBuddyQa", "Native loan: QR decode and rotation passed")
            logout(); login(owner, password); openLoan(loanId, true)
            val wrong = if (pickup == "000000") "111111" else "000000"
            for (attempt in 1..5) {
                confirm("pickup", wrong, "INCORRECT CODE")
                assertEquals(attempt, runBlocking { repository.loan(loanId)!!.handover_attempts })
                android.util.Log.i("BorrowBuddyQa", "Native loan: incorrect attempt $attempt persisted")
            }
            confirm("pickup", pickup, "TOO MANY INCORRECT ATTEMPTS")
            assertEquals("awaiting_pickup", runBlocking { repository.loan(loanId)!!.status })
            logout(); login(borrower, password); openLoan(loanId, false); tap("GENERATE CODE")
            val regenerated = code()
            assertEquals(0, runBlocking { repository.loan(loanId)!!.handover_attempts })
            android.util.Log.i("BorrowBuddyQa", "Native loan: regeneration reset attempts")
            logout(); login(owner, password); openLoan(loanId, true)
            confirm("pickup", regenerated)
            awaitText("CUSTODY CHAIN UPDATED · SCAN LOGGED")
            assertEquals("active", runBlocking { repository.loan(loanId)!!.status })
            generateWithRealtimePrivacyCheck(loanId)
            val returned = code(); assertQr("bb:return:$returned")
            logout(); login(borrower, password); openLoan(loanId, false)
            confirm("return", returned)
            awaitText("CUSTODY CHAIN UPDATED · SCAN LOGGED")
            assertEquals("returned", runBlocking { repository.loan(loanId)!!.status })
            compose.onNodeWithTag("custody-RETURNED").assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Completed"))
            scrollTo(hasContentDescription("Rate 4 stars")); compose.onNodeWithContentDescription("Rate 4 stars").performClick()
            scrollTo(hasText("COMMENT (OPTIONAL)"))
            compose.onNode(hasSetTextAction() and hasText("COMMENT (OPTIONAL)")).performTextInput("Synthetic native handover QA review")
            // Complete text entry before scrolling/tapping the action. A click
            // during IME bring-into-view can land on the keyboard instead.
            androidx.test.espresso.Espresso.closeSoftKeyboard()
            tap("SUBMIT RATING"); awaitText("[ YOUR RATING ]")
            val userId = repository.client.auth.currentUserOrNull()!!.id
            val review = runBlocking { repository.reviews(loanId = loanId).single { it.reviewer_id == userId } }
            assertEquals(4, review.rating)
            assertEquals("Synthetic native handover QA review", review.comment)
            scrollTo(hasTestTag("loan-returned-banner"))
            compose.onRoot().captureToImage().asAndroidBitmap().let { image ->
                context.filesDir.resolve("native-loan-returned.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            }
            scrollTo(hasTestTag("custody-RETURNED"))
            compose.onNodeWithTag("custody-REQUESTED").assertIsDisplayed()
            compose.onNodeWithTag("custody-RETURNED").assertIsDisplayed()
            compose.onRoot().captureToImage().asAndroidBitmap().let { image ->
                context.filesDir.resolve("native-loan-timeline.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            }
            logout()
        } catch (failure: Throwable) {
            runCatching {
                val image = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
                try {
                    context.filesDir.resolve("hosted-loan-failure.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
                } finally { image.recycle() }
            }
            throw failure
        } finally { runBlocking { if (repository.client.auth.currentUserOrNull() != null) repository.signOut() } }
    }
}
