package `in`.borrowbuddy.android

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import `in`.borrowbuddy.android.ui.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URI
import java.util.UUID

/** Native controls and normal member sessions only. The host harness owns isolated fixtures and cleanup. */
class HostedCampusTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val args get() = InstrumentationRegistry.getArguments()
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val repository: BorrowRepository get() = (context.applicationContext as BorrowBuddyApplication).repository
    private val device get() = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
    private fun required(key: String): String {
        val value = requireNotNull(args.getString(key))
        return if (key.endsWith("Name")) String(android.util.Base64.decode(value, android.util.Base64.DEFAULT)) else value
    }
    private fun await(condition: () -> Boolean) = compose.waitUntil(40_000) {
        try { condition() } catch (failure: IllegalStateException) {
            if (failure.message?.contains("No compose hierarchies") == true) false else throw failure
        }
    }
    private fun shown(text: String) = compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
    private fun scroll(matcher: SemanticsMatcher) {
        val outer = hasScrollAction() and SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange) and hasTestTag("collection-messages").not()
        if (compose.onAllNodesWithTag("campus-feed").fetchSemanticsNodes().isEmpty())
            await { compose.onAllNodes(matcher).fetchSemanticsNodes().isNotEmpty() }
        val scrollable = if (compose.onAllNodesWithTag("offline-screen").fetchSemanticsNodes().isNotEmpty())
            outer and hasAnyAncestor(hasTestTag("offline-screen")) else outer
        compose.onAllNodes(scrollable).onFirst().performScrollToNode(matcher)
        // Inline appointment data can replace its loader after the initial scroll,
        // moving later collection controls. Reposition against the settled layout;
        // every caller still asserts visibility and performs a real UI interaction.
        var repositions = 0
        compose.waitUntil(10_000) {
            if (compose.onNode(matcher).isDisplayed()) true else {
                repositions++
                compose.onAllNodes(scrollable).onFirst().performScrollToNode(matcher)
                compose.onNode(matcher).isDisplayed()
            }
        }
        if (repositions > 0) android.util.Log.i("BorrowBuddyQa", "Campus scroll settled after $repositions additional layout passes")
    }
    private fun tap(text: String, parent: SemanticsMatcher? = null) {
        val matcher = hasText(text) and (parent?.let { hasAnyAncestor(it) } ?: hasClickAction())
        await { compose.onAllNodes(matcher).fetchSemanticsNodes().isNotEmpty() }
        scroll(matcher); compose.onNode(matcher).assertIsDisplayed().performClick()
    }
    private fun field(label: String, value: String, parent: SemanticsMatcher? = null) {
        val matcher = hasSetTextAction() and hasText(label) and (parent?.let { hasAnyAncestor(it) } ?: SemanticsMatcher("any") { true })
        await { compose.onAllNodes(matcher).fetchSemanticsNodes().isNotEmpty() }
        scroll(matcher); compose.onNode(matcher).performTextReplacement(value); androidx.test.espresso.Espresso.closeSoftKeyboard()
    }
    private fun login(email: String) {
        await { shown("WELCOME BACK") || shown("▶ START BORROWING") }
        if (shown("▶ START BORROWING")) compose.onNodeWithText("▶ START BORROWING").performClick()
        compose.onNode(hasSetTextAction() and hasText("BENNETT EMAIL")).performTextReplacement(email)
        compose.onNode(hasSetTextAction() and hasText("PASSWORD")).performTextReplacement(required("qaPassword"))
        compose.onAllNodesWithText("SIGN IN").onLast().performClick()
        await { compose.onAllNodesWithTag("nav-campus").fetchSemanticsNodes().isNotEmpty() }
    }
    private fun logout() {
        compose.onNodeWithContentDescription("Open account").performClick(); tap("SIGN OUT"); await { shown("WELCOME BACK") }
    }
    private fun campus() { compose.onNodeWithTag("nav-campus").performClick(); await { shown("GOOD THINGS FIND THEIR WAY BACK.") } }
    private fun openPost(kind: String, id: String) {
        campus(); tap(if (kind == "found") "LOST & FOUND" else "GIVEAWAYS", hasTestTag("campus-navigation"))
        await { compose.onAllNodesWithTag("campus-feed").fetchSemanticsNodes().isNotEmpty() }
        val post = hasTestTag("campus-post-$id"); scroll(post); compose.onNode(post).performClick()
        await { shown(if (kind == "found") "DOES THIS BELONG TO YOU?" else "MAKE IT YOURS. PASS IT FORWARD.") || shown("YOUR CAMPUS POST") }
    }
    private fun confirm() { awaitDialogWindow(compose, compose.activity); compose.onNode(hasText("CONFIRM") and hasAnyAncestor(isDialog())).performClick() }
    private fun collection(id: String) {
        campus(); tap("MY ACTIVITY"); await { compose.onAllNodesWithTag("campus-transfer-$id").fetchSemanticsNodes().isNotEmpty() }
        tap("OPEN PRIVATE COLLECTION →", hasTestTag("campus-transfer-$id"))
        await { compose.onAllNodes(SemanticsMatcher.keyIsDefined(CampusCollectionConnected)).fetchSemanticsNodes().isNotEmpty() }
    }
    private fun capture(name: String) {
        val bitmap = (if (compose.onAllNodesWithTag("offline-screen").fetchSemanticsNodes().isNotEmpty()) compose.onNodeWithTag("offline-screen") else compose.onRoot()).captureToImage().asAndroidBitmap(); assertPaintedSurface(bitmap)
        context.filesDir.resolve(name).outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
    }
    @Test fun foundClaimAdminReviewAndTwoPartyCollection() {
        assumeTrue(args.getString("qaCampus") == "1")
        val found = required("qaFoundId")
        val host = Actor(required("qaHostEmail"), required("qaPassword"))
        try {
            login(required("qaEmail")); openPost("found", found)
            field("PRIVATE OWNERSHIP DETAILS", "Original Case Proof: amber triangle inside the case.")
            tap("SEND PRIVATE OWNERSHIP CLAIM")
            await { runBlocking { repository.campus.claims(post = found) }.any { it.status == "pending" } }
            assertEquals(0, host.rows("campus_claims?post_id=eq.$found").length())
            logout(); login(required("qaAdminEmail")); campus(); tap("ADMIN CLAIM REVIEW")
            await { shown("Original Case Proof: amber triangle inside the case.") }
            assertTrue(shown("Private finder mark: amber triangle inside the case."))
            val claim = runBlocking { repository.campus.claims(post = found) }.single { it.status == "pending" }
            val card = hasTestTag("campus-review-${claim.id}")
            field("APPROVE OWNERSHIP REASON", "Identifying details match the private finder record.", card)
            tap("APPROVE OWNERSHIP", card); confirm()
            await { runBlocking { repository.campus.claims(post = found) }.any { it.status == "approved" } }
            val transfer = host.rows("campus_transfers?post_id=eq.$found").getJSONObject(0).getString("id")
            logout(); login(required("qaEmail")); collection(transfer)
            tap("GENERATE / REPLACE MY CODE")
            await { compose.onAllNodesWithTag("collection-code").fetchSemanticsNodes().isNotEmpty() }
            val code = compose.onNodeWithTag("collection-code").fetchSemanticsNode().config[SemanticsProperties.Text].single().text
            assertTrue(code.matches(Regex("[0-9]{6}")))
            compose.activityRule.scenario.recreate()
            await { compose.onAllNodesWithTag("collection-code").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("collection-code").assertTextEquals(code)
            logout(); login(required("qaHostEmail")); collection(transfer)
            assertFalse(shown("Original Case Proof: amber triangle inside the case."))
            field("RECIPIENT’S SIX-DIGIT CODE", code); tap("CONFIRM COLLECTION"); confirm()
            await { compose.onAllNodesWithTag("collection-receipt").fetchSemanticsNodes().isNotEmpty() }
            scroll(hasTestTag("collection-receipt")); capture("native-campus-found-receipt.png")
            assertEquals("completed", host.rows("campus_transfers?id=eq.$transfer").getJSONObject(0).getString("status"))
            scroll(hasText("[ READ-ONLY COLLECTION RECORD ]")); compose.onNodeWithText("[ READ-ONLY COLLECTION RECORD ]").assertExists()
        } finally { runBlocking { repository.signOut() } }
    }

    @Test fun giveawayBookingRealtimeOfflineDraftAndReceipt() {
        assumeTrue(args.getString("qaCampus") == "1")
        val giveaway = required("qaGiveawayId")
        val host = Actor(required("qaHostEmail"), required("qaPassword"))
        val oldWifi = device.executeShellCommand("settings get global wifi_on").trim()
        val oldData = device.executeShellCommand("settings get global mobile_data").trim()
        var phase = "reserve"
        var workflowFailure: Throwable? = null
        try {
            login(required("qaEmail")); openPost("giveaway", giveaway)
            tap("RESERVE THIS GIVEAWAY"); confirm()
            await { shown("[ YOUR PRIVATE COLLECTION ]") }
            val transfer = runBlocking { repository.campus.transfers(required("qaUserId")) }.single { it.post_id == giveaway }
            assertTrue(transfer.expires_at != null)
            val composer = hasTestTag("chat-composer")
            phase = "draft-restoration"
            scroll(composer); compose.onNode(composer).performTextReplacement("Original Case campus draft\nSecond line")
            androidx.test.espresso.Espresso.closeSoftKeyboard()
            compose.activityRule.scenario.recreate()
            await { shown("[ YOUR PRIVATE COLLECTION ]") }; scroll(composer)
            compose.onNode(composer).assertTextContains("Original Case campus draft\nSecond line")
            // Actual device disconnect: modal must retain the existing route, session and draft.
            device.executeShellCommand("svc wifi disable"); device.executeShellCommand("svc data disable")
            phase = "offline-modal"
            await { compose.onAllNodesWithTag("offline-screen").fetchSemanticsNodes().isNotEmpty() }
            capture("native-campus-offline.png")
            device.executeShellCommand("svc wifi enable")
            device.executeShellCommand("svc data enable")
            phase = "connection-restored"
            await { shown("[ CONNECTION RESTORED ]") }
            scroll(hasText("RESUME MY PAGE")); compose.onNodeWithText("RESUME MY PAGE").performClick()
            await { compose.onAllNodesWithTag("offline-screen").fetchSemanticsNodes().isEmpty() }
            scroll(composer); compose.onNode(composer).assertTextContains("Original Case campus draft\nSecond line")
            phase = "send-and-realtime"
            compose.onNodeWithTag("chat-send").performClick()
            await { host.rows("campus_messages?transfer_id=eq.${transfer.id}").length() == 1 }
            assertEquals("Original Case campus draft\nSecond line", host.rows("campus_messages?transfer_id=eq.${transfer.id}").getJSONObject(0).getString("body"))
            await { compose.onAllNodes(SemanticsMatcher.expectValue(CampusCollectionConnected, true)).fetchSemanticsNodes().isNotEmpty() }
            val events = compose.onNode(SemanticsMatcher.keyIsDefined(CampusCollectionEvents)).fetchSemanticsNode().config[CampusCollectionEvents]
            host.rpc("send_message", JSONObject().put("id", transfer.id).put("client_id", UUID.randomUUID().toString()).put("body", "Host realtime reply"))
            compose.waitUntil(10_000) { compose.onNode(SemanticsMatcher.keyIsDefined(CampusCollectionEvents)).fetchSemanticsNode().config[CampusCollectionEvents] > events }
            val slots = runBlocking { repository.campus.slots(required("qaHostId"), CampusRules.today().toString()) }
            phase = "booking"
            assertTrue(slots.size >= 2)
            val label = "${CampusRules.date(slots[0].starts_at)} · ${required("qaLocationName")}".uppercase()
            tap("AVAILABLE TIME: CHOOSE"); compose.onNodeWithText(label).performClick()
            tap("BOOK APPOINTMENT")
            await { runBlocking { repository.campus.appointments(transfer = transfer.id) }.any { it.status == "booked" } }
            tap("CANCEL THIS APPOINTMENT"); confirm()
            await { runBlocking { repository.campus.appointments(transfer = transfer.id) }.none { it.status == "booked" } }
            tap("GENERATE / REPLACE MY CODE"); await { compose.onAllNodesWithTag("collection-code").fetchSemanticsNodes().isNotEmpty() }
            phase = "collection-receipt"
            val code = compose.onNodeWithTag("collection-code").fetchSemanticsNode().config[SemanticsProperties.Text].single().text
            host.rpc("confirm_code", JSONObject().put("id", transfer.id).put("code", code))
            await { compose.onAllNodesWithTag("collection-receipt").fetchSemanticsNodes().isNotEmpty() }
            scroll(hasTestTag("collection-receipt")); capture("native-campus-giveaway-receipt.png")
        } catch (failure: Throwable) {
            workflowFailure = failure
            val connectivity = context.getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
            val network = connectivity.activeNetwork
            android.util.Log.i("BorrowBuddyQa", "Campus network failure phase=$phase; active=$network; capabilities=${network?.let { connectivity.getNetworkCapabilities(it) }}")
            throw AssertionError("Native giveaway workflow phase: $phase", failure)
        } finally {
            device.executeShellCommand("svc wifi ${if (oldWifi == "0") "disable" else "enable"}")
            device.executeShellCommand("svc data ${if (oldData == "0") "disable" else "enable"}")
            try { runBlocking { repository.signOut() } }
            catch (cleanup: Throwable) { if (workflowFailure != null) workflowFailure.addSuppressed(cleanup) else throw cleanup }
        }
    }

    @Test fun publishPhotoWithNativePickerAndEditWithoutLosingDraft() {
        assumeTrue(args.getString("qaCampus") == "1")
        val evidence = QaEvidence.create(context, "campus-qa-${required("qaRunId")}.png", 0)
        try {
            login(required("qaHostEmail")); campus(); tap("GIVEAWAYS")
            await { shown("GIVE SOMETHING AWAY") }; tap("GIVE SOMETHING AWAY")
            await { shown("SHARE WITH CAMPUS") }
            field("TITLE", "Native campus publication ${required("qaRunId")}")
            field("DESCRIPTION / BUNDLE CONTENTS", "Two textbooks and stationery. Native photo picker integration fixture.")
            field("PICKUP INFORMATION", "Library reception during opening hours")
            tap("CATEGORY: CHOOSE"); compose.onNodeWithText(required("qaCategoryName").uppercase()).performClick()
            tap("RESERVATION PERIOD: 48 HOURS"); compose.onNodeWithText("72 HOURS").performClick()
            tap("ADD PHOTOS (0/6)")
            assertTrue(device.wait(Until.hasObject(By.pkg("com.google.android.photopicker")), 15_000))
            device.wait(Until.findObject(By.descStartsWith("Photo taken")), 15_000)!!.click()
            val done = device.wait(Until.findObject(By.text("Done")), 10_000) ?: error("System picker did not expose its Done control")
            done.click()
            await { shown("ADD PHOTOS (1/6)") }
            compose.activityRule.scenario.recreate(); await { shown("SHARE WITH CAMPUS") }
            val title = hasSetTextAction() and hasText("TITLE"); scroll(title); compose.onNode(title).assertTextContains("Native campus publication ${required("qaRunId")}")
            tap("PUBLISH POST")
            await { shown("YOUR CAMPUS POST") }
            val post = runBlocking { repository.campus.posts(owner = required("qaHostId")) }.single { it.title.startsWith("Native campus publication") }
            assertEquals(72, post.hold_hours); assertEquals(1, post.images.size)
            assertTrue(post.images.single().startsWith("${required("qaHostId")}/${post.id}/")); assertTrue(post.images.single().endsWith(".webp"))
            tap("EDIT POST"); await { shown("EDIT CAMPUS POST") }
            field("TITLE", "Updated native campus publication ${required("qaRunId")}")
            tap("SAVE POST"); await { shown("YOUR CAMPUS POST") }
            assertTrue(runBlocking { repository.campus.post(post.id) }!!.title.startsWith("Updated native"))
            capture("native-campus-published.png")
        } finally { evidence.remove(context); runBlocking { repository.signOut() } }
    }

    private class Actor(email: String, password: String) {
        private var token = ""
        init { token = JSONObject(request("/auth/v1/token?grant_type=password", "POST", JSONObject().put("email", email).put("password", password))).getString("access_token") }
        fun rows(path: String) = JSONArray(request("/rest/v1/$path", "GET"))
        fun rpc(action: String, values: JSONObject) = JSONObject(request("/rest/v1/rpc/campus_api", "POST", JSONObject().put("p_action", action).put("p_data", values)))
        private fun request(path: String, method: String, data: JSONObject? = null): String {
            val connection = URI(BuildConfig.SUPABASE_URL + path).toURL().openConnection() as HttpURLConnection
            try {
                connection.requestMethod = method; connection.connectTimeout = 15000; connection.readTimeout = 15000
                connection.setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
                connection.setRequestProperty("Authorization", "Bearer ${token.ifBlank { BuildConfig.SUPABASE_ANON_KEY }}")
                connection.setRequestProperty("Content-Type", "application/json")
                if (data != null) { connection.doOutput = true; connection.outputStream.use { it.write(data.toString().toByteArray()) } }
                assertTrue("Normal member request failed: ${connection.responseCode}", connection.responseCode in 200..299)
                return connection.inputStream.bufferedReader().use { it.readText() }
            } finally { connection.disconnect() }
        }
    }
}
