package `in`.borrowbuddy.android

import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.ui.*
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class HostedAccountLedgerTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private lateinit var repository: BorrowRepository
    private val captureChecks = JSONArray()
    private fun await(text: String) = compose.waitUntil(30_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() }
    private fun ready(tag: String) = compose.waitUntil(30_000) { compose.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
    private fun account() { compose.onNodeWithContentDescription("Open account").performClick(); ready("account-page") }
    private fun login(email: String, password: String) {
        compose.waitUntil(30_000) { compose.onAllNodesWithText("WELCOME BACK").fetchSemanticsNodes().isNotEmpty() || compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty() }
        if (compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty()) compose.onNodeWithText("▶ START BORROWING").performClick()
        compose.onNode(hasSetTextAction() and hasText("BENNETT EMAIL")).performTextReplacement(email)
        compose.onNode(hasSetTextAction() and hasText("PASSWORD")).performTextReplacement(password)
        androidx.test.espresso.Espresso.closeSoftKeyboard()
        compose.onAllNodesWithText("SIGN IN").onLast().performScrollTo().performClick(); await("BROWSE")
    }
    private fun logout() { account(); compose.onNodeWithText("SIGN OUT").performScrollTo().assertIsEnabled().performClick(); await("WELCOME BACK") }
    private fun ledger() { account(); compose.onNodeWithTag("account-fines").performScrollTo().assertHasClickAction().performClick(); ready("fines-ledger") }
    private fun field(label: String) = compose.onNode(hasSetTextAction() and hasContentDescription(label))
    private fun scroll(matcher: SemanticsMatcher) = compose.onNodeWithTag("fines-ledger").performScrollToNode(matcher)
    private fun capture(name: String) {
        val image = compose.onRoot().captureToImage().asAndroidBitmap(); assertPaintedSurface(image)
        context.filesDir.resolve("native-account-ledger-$name.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
    }
    private fun shell(command: String) = android.os.ParcelFileDescriptor.AutoCloseInputStream(instrumentation.uiAutomation.executeShellCommand(command)).bufferedReader().use { it.readText() }
    private fun wide(tag: String, name: String, assertions: () -> Unit = {}) {
        val original = compose.onNodeWithTag(tag).fetchSemanticsNode().config[AccountViewportWidth]
        val size = Regex("Override size: (\\d+x\\d+)").find(shell("wm size"))?.groupValues?.get(1)
        val density = Regex("Override density: (\\d+)").find(shell("wm density"))?.groupValues?.get(1)
        try {
            shell("wm size 1024x838"); shell("wm density 160")
            compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(AccountViewportWidth, 1024)).fetchSemanticsNodes().isNotEmpty() }
            assertions()
            // A ready semantics tree can precede a newly resized compositor frame.
            // Require a painted black source panel, not the patterned page backdrop.
            val panelTag = if (tag == "account-page") "account-fines" else "ledger-summary"
            var painted: android.graphics.Bitmap? = null
            var attempts = 0
            compose.waitUntil(30_000) {
                val root = compose.onAllNodesWithTag(tag).fetchSemanticsNodes().singleOrNull()
                if (root?.config?.getOrNull(AccountViewportWidth) != 1024) return@waitUntil false
                val panel = compose.onAllNodesWithTag(panelTag).fetchSemanticsNodes().singleOrNull() ?: return@waitUntil false
                val bounds = panel.boundsInWindow
                val candidate = instrumentation.uiAutomation.takeScreenshot() ?: return@waitUntil false
                attempts++
                if (candidate.width != 1024 || candidate.height != 838 || bounds.width <= 0 || bounds.height <= 0) {
                    candidate.recycle(); return@waitUntil false
                }
                var black = 0; var text = 0
                for (y in 0 until 32) for (x in 0 until 32) {
                    val color = candidate.getPixel((bounds.left + (x + .5f) * bounds.width / 32).toInt().coerceIn(0, candidate.width - 1),
                        (bounds.top + (y + .5f) * bounds.height / 32).toInt().coerceIn(0, candidate.height - 1))
                    val red = android.graphics.Color.red(color); val green = android.graphics.Color.green(color); val blue = android.graphics.Color.blue(color)
                    if (red < 16 && green < 16 && blue < 16) black++
                    if (maxOf(red, green, blue) > 100) text++
                }
                // Summary semantics are inside its 25dp padding. Account-link
                // semantics wrap the whole panel, with a 12dp adjacent-card gap.
                val outsideOffset = if (tag == "account-page") 4f else 32f
                var backdrop = 0
                for (fraction in listOf(.25f, .5f, .75f)) for (x in listOf(bounds.left - outsideOffset, bounds.right + outsideOffset)) {
                    val color = candidate.getPixel(x.toInt().coerceIn(0, candidate.width - 1), (bounds.top + bounds.height * fraction).toInt().coerceIn(0, candidate.height - 1))
                    if (android.graphics.Color.blue(color) > 24 && android.graphics.Color.blue(color) > android.graphics.Color.red(color) + 12) backdrop++
                }
                if (black > 560 && text > 2 && backdrop == 6) {
                    captureChecks.put(JSONObject().put("screen", tag).put("attempts", attempts).put("blackSamples", black)
                        .put("textSamples", text).put("outsideBackdropSamples", backdrop).put("displayWidth", candidate.width).put("displayHeight", candidate.height)
                        .put("nodeLeft", bounds.left).put("nodeRight", bounds.right).put("outsideOffset", outsideOffset))
                    painted = candidate; true
                } else { candidate.recycle(); false }
            }
            val image = requireNotNull(painted)
            assertEquals(1024, image.width); assertEquals(838, image.height)
            try { context.filesDir.resolve("native-account-ledger-$name.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } }
            finally { image.recycle() }
            context.filesDir.resolve("native-account-ledger-capture-checks.json").writeText(captureChecks.toString(2))
        } finally { shell("wm size ${size ?: "reset"}"); shell("wm density ${density ?: "reset"}") }
        compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(AccountViewportWidth, original)).fetchSemanticsNodes().isNotEmpty() }
    }
    @Test fun sourceAccountLedgerAndOldestFiftyFineQueue() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Isolated ledger actors/fines required", listOf("qaEmail", "qaEmptyEmail", "qaAdminEmail", "qaPassword", "qaPendingIds", "qaStudentId", "qaSettledId", "qaWaivedId").all { !args.getString(it).isNullOrBlank() })
        repository = (context.applicationContext as BorrowBuddyApplication).repository
        val password = args.getString("qaPassword")!!
        val studentId = args.getString("qaStudentId")!!
        val pendingIds = args.getString("qaPendingIds")!!.split(',')
        try {
            login(args.getString("qaEmail")!!, password); account()
            compose.onNodeWithText("TRUST SCORE 71").assertExists()
            compose.onNodeWithContentDescription("YEAR OF STUDY").assertTextContains("Year 6")
            capture("account-phone")
            if (args.getString("qaAdaptiveWindow") == "1") wide("account-page", "account-wide") {
                compose.onNodeWithTag("account-fines").performScrollTo()
                val first = compose.onNodeWithTag("account-fines").fetchSemanticsNode().boundsInRoot
                val second = compose.onNodeWithTag("account-map").fetchSemanticsNode().boundsInRoot
                assertEquals(168f, first.left, 1f); assertTrue(second.left > first.right)
                assertEquals(first.top, second.top, 1f)
                val layouts = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
                compose.onNodeWithText("ANDROID QA LEDGER STUDENT").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult) { it(layouts) }
                val title = layouts.single()
                val metrics = JSONObject().put("nativeHeight", title.size.height).put("nativeLineCount", title.lineCount)
                args.getString("qaSourceTitleHeight")?.toDouble()?.let { height ->
                    metrics.put("sourceHeight", height)
                    assertEquals("Native title line box must match the measured website title", height, title.size.height.toDouble(), 2.0)
                }
                context.filesDir.resolve("native-account-ledger-title-metrics.json").writeText(metrics.toString(2))
            }
            field("FULL NAME").performScrollTo().performTextReplacement("Android QA Ledger Updated")
            field("PHONE").performScrollTo().performTextReplacement("123")
            androidx.test.espresso.Espresso.closeSoftKeyboard()
            compose.activityRule.scenario.recreate(); ready("account-page")
            field("FULL NAME").assertTextContains("Android QA Ledger Updated")
            field("PHONE").assertTextContains("123")
            compose.onNodeWithText("SAVE DETAILS").performScrollTo().performClick()
            await("[ ENTER A VALID 10-DIGIT MOBILE NUMBER. ]")
            assertEquals("Android QA Ledger Student", runBlocking { repository.profile() }!!.full_name)
            field("PHONE").performScrollTo().performTextReplacement("9876543210")
            androidx.test.espresso.Espresso.closeSoftKeyboard()
            compose.onNodeWithContentDescription("DEPARTMENT").performScrollTo().performClick()
            compose.onNodeWithText("Design").performClick()
            field("PHONE").performScrollTo().performClick().performImeAction(); await("[ PROFILE UPDATED. ]")
            val updated = runBlocking { repository.profile() }!!
            assertEquals("Android QA Ledger Updated", updated.full_name); assertEquals("9876543210", updated.phone)
            assertEquals("Design", updated.department); assertEquals(6, updated.year_of_study)
            compose.onNodeWithText("VIEW PUBLIC PROFILE →").performScrollTo().performClick(); ready("public-profile")
            compose.onNode(hasText("71") and hasAnyAncestor(hasTestTag("profile-stats"))).assertExists()
            // The retained ID card places reputation below the initial viewport.
            // Scroll the lazy source page before expecting that section to exist.
            compose.onNodeWithTag("public-profile").performScrollToNode(hasText("[ REPUTATION ]"))
            compose.onNodeWithText("[ REPUTATION ]").assertIsDisplayed()
            UiDevice.getInstance(instrumentation).pressBack(); ready("account-page")
            compose.onNodeWithTag("account-map").performScrollTo().performClick(); ready("campus-board")
            compose.waitUntil(30_000) { compose.onNodeWithTag("campus-map-image", useUnmergedTree = true).fetchSemanticsNode().config[CampusImageWidth] > 0 }
            compose.onNodeWithTag("campus-map-image", useUnmergedTree = true).assertIsDisplayed()
            UiDevice.getInstance(instrumentation).pressBack(); ready("account-page")
            compose.onNodeWithTag("account-fines").performScrollTo().performClick(); ready("fines-ledger")
            compose.onNodeWithTag("fines-ledger").assert(SemanticsMatcher.expectValue(LedgerFineCount, 54)).assert(SemanticsMatcher.expectValue(LedgerOutstanding, 520))
            compose.onNodeWithTag("ledger-total").assertTextEquals("₹520")
            val history = runBlocking { repository.fines(studentId) }
            assertEquals(54, history.size); assertEquals(args.getString("qaSettledId"), history.first().id)
            assertEquals(pendingIds.first(), history.last().id)
            for ((id, status) in listOf(args.getString("qaSettledId")!! to "SETTLED", args.getString("qaWaivedId")!! to "WAIVED", pendingIds.last() to "PENDING")) {
                val badge = hasText(status) and hasAnyAncestor(hasTestTag("fine-$id"))
                scroll(badge); compose.onNode(badge).assertIsDisplayed()
            }
            scroll(hasText("[ ACCOUNTABILITY LEDGER ]")); capture("ledger-phone")
            if (args.getString("qaAdaptiveWindow") == "1") wide("fines-ledger", "ledger-wide")
            val link = hasTestTag("fine-loan-${args.getString("qaSettledId")}")
            scroll(link); compose.onNode(link).assertIsDisplayed().assertHasClickAction().performClick(); await("[ CUSTODY CHAIN ]")
            UiDevice.getInstance(instrumentation).pressBack(); ready("fines-ledger")
            compose.onNodeWithTag("fines-ledger").assert(SemanticsMatcher.expectValue(LedgerFineCount, 54))
            logout(); login(args.getString("qaEmptyEmail")!!, password); ledger()
            compose.onNodeWithTag("fines-ledger").assert(SemanticsMatcher.expectValue(LedgerFineCount, 0)).assert(SemanticsMatcher.expectValue(LedgerOutstanding, 0))
            compose.onNodeWithTag("ledger-total").assertTextEquals("₹0")
            scroll(hasTestTag("ledger-empty")); compose.onNodeWithText("NO FINES ON RECORD").assertIsDisplayed(); capture("empty-phone")
            assertTrue(runBlocking { repository.fines(studentId) }.isEmpty())
            logout(); login(args.getString("qaAdminEmail")!!, password)
            assertEquals(pendingIds.take(50), runBlocking { repository.fines() }.map { it.id })
            runBlocking { repository.rpc("settle_fine", buildJsonObject { put("p_fine_id", pendingIds.first()); put("p_action", "settle") }) }
            assertEquals(pendingIds.drop(1).take(50), runBlocking { repository.fines() }.map { it.id })
            logout()
            context.filesDir.resolve("native-account-ledger-result.json").writeText(JSONObject().apply {
                put("pendingFixtureCount", 52); put("personalHistoryCount", 54); put("adminQueueLimit", 50)
                put("oldestFirstAndReplenishment", true); put("personalNewestFirstUntruncated", true)
                put("draftRestored", true); put("invalidSaveRejected", true); put("profileSaved", true)
                put("storedYearSixPreserved", true); put("fineLoanNavigation", true); put("emptyLedger", true); put("otherStudentRowsDenied", true)
            }.toString(2))
        } catch (failure: Throwable) {
            runCatching {
                val image = instrumentation.uiAutomation.takeScreenshot()
                try { context.filesDir.resolve("account-ledger-failure.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } }
                finally { image.recycle() }
            }
            throw failure
        } finally { runBlocking { if (repository.client.auth.currentUserOrNull() != null) repository.signOut() } }
    }
}
