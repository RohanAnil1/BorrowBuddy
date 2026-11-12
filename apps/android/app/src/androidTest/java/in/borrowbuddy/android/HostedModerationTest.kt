package `in`.borrowbuddy.android

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.Incident
import `in`.borrowbuddy.android.ui.PrivatePhotoLoaded
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import java.net.URL
import java.security.MessageDigest

class HostedModerationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private val device get() = UiDevice.getInstance(instrumentation)
    private lateinit var repository: BorrowRepository
    private fun await(text: String) = compose.waitUntil(30_000) {
        compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
    }
    private fun scroll(matcher: SemanticsMatcher) = compose.onNode(hasScrollAction() and
        SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)).performScrollToNode(matcher)
    private fun tap(text: String, ancestor: SemanticsMatcher? = null) {
        var matcher = hasText(text)
        if (ancestor != null) matcher = matcher and hasAnyAncestor(ancestor)
        if (compose.onAllNodesWithTag("admin-desk").fetchSemanticsNodes().isNotEmpty()) scroll(matcher)
        compose.waitUntil(30_000) { compose.onAllNodes(matcher).fetchSemanticsNodes().isNotEmpty() }
        scroll(matcher); compose.onNode(matcher).assertIsDisplayed().assertIsEnabled().performClick()
    }
    private fun field(label: String, value: String, ancestor: SemanticsMatcher? = null) {
        var matcher = hasSetTextAction() and (hasText(label) or hasContentDescription(label, ignoreCase = true))
        if (ancestor != null) matcher = matcher and hasAnyAncestor(ancestor)
        if (compose.onAllNodesWithTag("admin-desk").fetchSemanticsNodes().isNotEmpty()) scroll(matcher)
        compose.waitUntil(30_000) { compose.onAllNodes(matcher).fetchSemanticsNodes().isNotEmpty() }
        scroll(matcher); compose.onNode(matcher).performTextReplacement(value)
        androidx.test.espresso.Espresso.closeSoftKeyboard()
    }
    private fun login(email: String, password: String) {
        compose.waitUntil(30_000) { compose.onAllNodesWithText("WELCOME BACK").fetchSemanticsNodes().isNotEmpty() ||
            compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty() }
        if (compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty())
            compose.onNodeWithText("▶ START BORROWING").performClick()
        compose.onNode(hasSetTextAction() and hasText("BENNETT EMAIL")).performTextReplacement(email)
        compose.onNode(hasSetTextAction() and hasText("PASSWORD")).performTextReplacement(password)
        androidx.test.espresso.Espresso.closeSoftKeyboard()
        compose.onAllNodesWithText("SIGN IN").onLast().performScrollTo().assertIsDisplayed().assertIsEnabled().performClick()
        try { await("BROWSE") }
        catch (failure: Throwable) {
            runCatching {
                val image = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
                try { context.filesDir.resolve("native-moderation-login-failure.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } }
                finally { image.recycle() }
            }
            throw failure
        }
    }
    private fun logout() { compose.onNodeWithContentDescription("Open account").performClick(); tap("SIGN OUT"); await("WELCOME BACK") }
    private fun loan(id: String) {
        openBorrowLogbook(compose)
        compose.onNodeWithTag("borrow-logbook").performScrollToNode(hasTestTag("loan-$id"))
        compose.onNodeWithTag("loan-$id").performClick(); await("[ CUSTODY CHAIN ]")
    }
    private fun pickTwoPhotos() {
        tap("ADD PHOTOS")
        assertTrue("System multi-photo picker required", device.wait(Until.hasObject(By.pkg("com.google.android.photopicker")), 15_000))
        val images = device.wait(Until.findObjects(By.descStartsWith("Photo taken")), 15_000)
        assertNotNull(images); assertTrue("Two isolated media fixtures required", images!!.size >= 2)
        images.take(2).forEach { it.click() }
        val done = device.wait(Until.findObject(By.text("Done")), 10_000)
            ?: error("System picker did not expose its Done control")
        done.click()
        compose.waitUntil(30_000) {
            compose.onAllNodes(SemanticsMatcher.expectValue(PrivatePhotoLoaded, true)).fetchSemanticsNodes().size >= 2
        }
    }
    private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    private fun capture(name: String) {
        val bitmap = compose.onRoot().captureToImage().asAndroidBitmap()
        context.filesDir.resolve(name).outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
    private fun verifyEvidence(incident: Incident, media: List<QaEvidence>) {
        assertEquals(2, incident.photos.size)
        val actual = incident.photos.map { photo ->
            val signed = runBlocking { repository.privateImage(photo.path, "incident-photos") }
            val connection = URL(signed).openConnection().apply { connectTimeout = 10_000; readTimeout = 10_000 }
            digest(connection.getInputStream().use { it.readBytes() })
        }.toSet()
        assertEquals("Evidence bytes must match both actual picker selections", media.map { digest(it.bytes) }.toSet(), actual)
    }
    private fun report(id: String, type: String, label: String, media: List<QaEvidence>): Incident {
        loan(id)
        // These fixtures are active loans. Wait for the optional scheduling panel
        // above the report controls to finish its first layout before touching them.
        compose.waitUntil(30_000) { compose.onAllNodesWithTag("campus-appointment-picker").fetchSemanticsNodes().isNotEmpty() }
        tap("REPORT A PROBLEM")
        val form = hasTestTag("incident-report-$id")
        val next = hasText("NEXT →") and hasAnyAncestor(form)
        compose.waitUntil(30_000) { compose.onAllNodes(next).fetchSemanticsNodes().isNotEmpty() }
        scroll(next); compose.onNode(next).assertIsNotEnabled()
        tap(label, form); tap("NEXT →", form); await("STEP 2 — PHOTO EVIDENCE")
        if (media.isNotEmpty()) pickTwoPhotos()
        tap("NEXT →", form); await("STEP 3 — DESCRIBE IT")
        val description = "Synthetic native $type incident: isolated workflow evidence."
        field("WHAT HAPPENED, IN YOUR OWN WORDS", description, form)
        if (media.isNotEmpty()) {
            compose.activityRule.scenario.recreate(); await("STEP 3 — DESCRIBE IT")
            compose.onNode(hasSetTextAction() and hasText("WHAT HAPPENED, IN YOUR OWN WORDS")).assertTextContains(description)
            tap("← BACK", form); await("STEP 2 — PHOTO EVIDENCE")
            compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(PrivatePhotoLoaded, true)).fetchSemanticsNodes().size >= 2 }
            tap("NEXT →", form); await("STEP 3 — DESCRIBE IT")
        }
        tap("FILE THE REPORT →", form); await("[ REPORT FILED ]")
        val incident = runBlocking { repository.incidents(id).single { it.description == description } }
        assertEquals(type, incident.type); assertEquals("open", incident.status)
        if (media.isNotEmpty()) verifyEvidence(incident, media) else assertTrue(incident.photos.isEmpty())
        assertEquals(if (type == "damage") "disputed" else "active", runBlocking { repository.loan(id) }!!.status)
        if (media.isNotEmpty()) { scroll(hasText("[ REPORT FILED ]")); capture("hosted-incident-filed.png") }
        android.util.Log.i("BorrowBuddyQa", "Moderation: $type report persisted with ${incident.photos.size} evidence photos")
        return incident
    }
    private fun reviewEvidence(id: String) {
        val image = hasContentDescription("Open private evidence photo") and hasAnyAncestor(hasTestTag("incident-$id"))
        val ready = image and SemanticsMatcher.expectValue(PrivatePhotoLoaded, true)
        scroll(hasTestTag("incident-$id"))
        compose.waitUntil(30_000) { compose.onAllNodes(ready).fetchSemanticsNodes().isNotEmpty() }
        val selectedId = compose.onAllNodes(ready).fetchSemanticsNodes().first().id
        val selected = ready and SemanticsMatcher("Selected ready evidence thumbnail") { it.id == selectedId }
        scroll(selected)
        android.util.Log.i("BorrowBuddyQa", "Moderation: opening ready evidence node $selectedId")
        compose.onNode(selected).assertIsDisplayed().assertIsEnabled().performClick()
        try { await("[ PRIVATE EVIDENCE ]") }
        catch (failure: Throwable) {
            runCatching {
                val image = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
                try { context.filesDir.resolve("native-moderation-viewer-failure.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } }
                finally { image.recycle() }
            }
            throw failure
        }
        compose.waitUntil(30_000) { compose.onAllNodes(hasTestTag("private-evidence-full") and
            SemanticsMatcher.expectValue(PrivatePhotoLoaded, true)).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("CLOSE").performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithText("[ PRIVATE EVIDENCE ]").fetchSemanticsNodes().isEmpty() }
    }
    private fun fineScreen() { compose.onNodeWithContentDescription("Open account").performClick(); compose.waitUntil(30_000) { compose.onAllNodesWithTag("account-fines").fetchSemanticsNodes().isNotEmpty() }; compose.onNodeWithTag("account-fines").performScrollTo().performClick(); await("[ ACCOUNTABILITY LEDGER ]") }
    @Test fun nativeEvidenceReportsAdminDecisionsAndOfflineFineRecording() {
        val args = InstrumentationRegistry.getArguments()
        val email = args.getString("qaEmail"); val admin = args.getString("qaAdminEmail")
        val password = args.getString("qaPassword"); val loans = args.getString("qaLoanIds")?.split(',')
        assumeTrue("Three isolated active loans and admin required", listOf(email, admin, password).all { !it.isNullOrBlank() } && loans?.size == 3)
        repository = (context.applicationContext as BorrowBuddyApplication).repository
        val fixtureId = args.getString("qaBorrowerId") ?: error("Fixture borrower ID required")
        val media = (0..1).map { QaEvidence.create(context, "borrowbuddy-qa-moderation-$fixtureId-$it.png", it) }
        try {
            login(email!!, password!!)
            val incidents = listOf(
                report(loans!![0], "damage", "ITEM DAMAGED", media),
                report(loans[1], "late", "RETURNED LATE", emptyList()),
                report(loans[2], "other", "OTHER", emptyList())
            )
            logout(); login(admin!!, password); compose.onNodeWithText("[ ADMIN ]").performClick()
            await("MODERATION DESK"); reviewEvidence(incidents[0].id)
            incidents.forEachIndexed { index, incident ->
                android.util.Log.i("BorrowBuddyQa", "Moderation: reviewing ${incident.type}")
                val card = hasTestTag("incident-${incident.id}")
                field("RESOLUTION NOTE", "Synthetic QA decision for ${incident.type}.", card)
                if (index < 2) field("FINE (INR, OPTIONAL)", if (index == 0) "750" else "250", card)
                else { scroll(hasContentDescription("Decision: RESOLVED")); compose.onNodeWithContentDescription("Decision: RESOLVED").performClick(); compose.onNodeWithText("Rejected").performClick() }
                tap("RESOLVE", card)
                compose.waitUntil(30_000) { compose.onAllNodes(card).fetchSemanticsNodes().isEmpty() }
                assertEquals(if (index < 2) "resolved" else "rejected", runBlocking { repository.incidents(incident.loan_id).single { it.id == incident.id } }.status)
            }
            val borrowerId = fixtureId
            val fines = runBlocking { repository.fines(borrowerId).filter { it.loan_id in loans } }
            assertEquals(listOf(250, 750), fines.map { it.amount }.sorted())
            assertEquals("returned", runBlocking { repository.loan(loans[0]) }!!.status)
            logout(); login(email, password); fineScreen(); await("₹1,000")
            capture("hosted-fines-pending.png")
            fines.forEach { fine ->
                val pending = hasText("PENDING") and hasAnyAncestor(hasTestTag("fine-${fine.id}"))
                scroll(pending); compose.onNode(pending).assertIsDisplayed()
                val time = hasTestTag("fine-time-${fine.id}")
                scroll(hasTestTag("fine-loan-${fine.id}")); compose.onNode(time, useUnmergedTree = true).assertIsDisplayed().assert(hasText("AGO", substring = true) or hasText("JUST NOW", substring = true))
                val link = hasTestTag("fine-loan-${fine.id}")
                scroll(link); compose.onNode(link).assertIsDisplayed().assertHasClickAction().performClick()
                await("[ CUSTODY CHAIN ]")
                compose.onNodeWithText(requireNotNull(fine.loan?.item?.title).uppercase()).assertExists()
                device.pressBack(); await("[ ACCOUNTABILITY LEDGER ]"); await("₹1,000")
            }
            logout(); login(admin, password); compose.onNodeWithText("[ ADMIN ]").performClick(); await("MODERATION DESK")
            fines.sortedByDescending { it.amount }.forEachIndexed { index, fine ->
                val card = hasTestTag("fine-${fine.id}")
                tap(if (index == 0) "SETTLED" else "WAIVE", card)
                compose.waitUntil(30_000) { compose.onAllNodes(card).fetchSemanticsNodes().isEmpty() }
            }
            logout(); login(email, password); fineScreen(); await("₹0")
            for (fine in fines) {
                val status = if (fine.amount == 750) "SETTLED" else "WAIVED"
                val node = hasText(status) and hasAnyAncestor(hasTestTag("fine-${fine.id}"))
                scroll(node); compose.onNode(node).assertIsDisplayed()
            }
            assertEquals(0, runBlocking { repository.fines(borrowerId).filter { it.status == "pending" }.sumOf { it.amount } })
            logout()
        } finally {
            media.forEach { it.remove(context) }
            runBlocking { if (repository.client.auth.currentUserOrNull() != null) repository.signOut() }
        }
    }
}
