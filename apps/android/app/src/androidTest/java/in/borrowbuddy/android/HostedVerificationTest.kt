package `in`.borrowbuddy.android

import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.provider.MediaStore
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.ui.PrivatePhotoLoaded
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.net.URL
import java.security.MessageDigest
import kotlin.random.Random

class HostedVerificationTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private lateinit var repository: BorrowRepository
    private val device get() = UiDevice.getInstance(instrumentation)
    private fun memory(stage: String) {
        val info = android.os.Debug.MemoryInfo()
        android.os.Debug.getMemoryInfo(info)
        android.util.Log.i("BorrowBuddyQa", "Verification memory $stage: PSS=${info.totalPss}KB " +
            "Java=${info.getMemoryStat("summary.java-heap")}KB Native=${info.getMemoryStat("summary.native-heap")}KB " +
            "Code=${info.getMemoryStat("summary.code")}KB Graphics=${info.getMemoryStat("summary.graphics")}KB")
    }
    private fun awaitText(text: String) = compose.waitUntil(30_000) {
        compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
    }
    private fun scrollTo(matcher: SemanticsMatcher) = compose.onNode(hasScrollAction() and
        SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)).performScrollToNode(matcher)
    private fun tap(text: String) {
        awaitText(text); scrollTo(hasText(text)); compose.onNodeWithText(text).assertIsDisplayed().assertIsEnabled().performClick()
    }
    private fun field(label: String, value: String, ancestor: SemanticsMatcher? = null) {
        var match = hasSetTextAction() and (hasText(label) or hasContentDescription(label, ignoreCase = true))
        if (ancestor != null) match = match and hasAnyAncestor(ancestor)
        scrollTo(match); compose.onNode(match).performTextReplacement(value)
        androidx.test.espresso.Espresso.closeSoftKeyboard()
    }
    private fun login(email: String, password: String, expected: String) {
        compose.waitUntil(30_000) { compose.onAllNodesWithText("WELCOME BACK").fetchSemanticsNodes().isNotEmpty() ||
            compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty() }
        if (compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty())
            compose.onNodeWithText("▶ START BORROWING").performClick()
        compose.onNode(hasSetTextAction() and hasText("BENNETT EMAIL")).performTextReplacement(email)
        compose.onNode(hasSetTextAction() and hasText("PASSWORD")).performTextReplacement(password)
        compose.onAllNodesWithText("SIGN IN").onLast().performClick()
        awaitText(expected)
    }
    private fun logout(portal: Boolean = false) {
        if (portal) compose.onNodeWithContentDescription("Open account").performClick()
        tap("SIGN OUT"); awaitText("WELCOME BACK")
    }
    private fun fixture(): ByteArray {
        val random = Random(1984)
        val pixels = IntArray(840 * 520) { Color.rgb(180 + random.nextInt(60), 180 + random.nextInt(60), 180 + random.nextInt(60)) }
        val bitmap = Bitmap.createBitmap(840, 520, Bitmap.Config.ARGB_8888)
        bitmap.setPixels(pixels, 0, 840, 0, 0, 840, 520)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.color = Color.WHITE; canvas.drawRect(35f, 35f, 805f, 485f, paint)
        paint.color = Color.rgb(0, 57, 147); canvas.drawRect(35f, 35f, 805f, 110f, paint)
        paint.color = Color.WHITE; paint.textSize = 38f; canvas.drawText("BORROWBUDDY QA", 65f, 85f, paint)
        paint.color = Color.BLACK; paint.textSize = 42f; canvas.drawText("SYNTHETIC STUDENT PASS", 65f, 210f, paint)
        paint.textSize = 24f; canvas.drawText("TEST IMAGE · NO STUDENT DOCUMENT", 65f, 280f, paint)
        paint.color = Color.rgb(203, 132, 14); canvas.drawRect(65f, 350f, 740f, 430f, paint)
        val bytes = ByteArrayOutputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it); it.toByteArray() }
        bitmap.recycle()
        assertTrue("Synthetic ID must pass the actual native upload size check", bytes.size in 50 * 1024..5 * 1024 * 1024)
        return bytes
    }
    private fun addMedia(bytes: ByteArray, studentId: String): Uri {
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, "borrowbuddy-qa-$studentId.png")
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/BorrowBuddyQA")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }) ?: error("Could not insert isolated picker fixture")
        try {
            resolver.openOutputStream(uri)!!.use { it.write(bytes) }
            resolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
            return uri
        } catch (failure: Throwable) { resolver.delete(uri, null, null); throw failure }
    }
    private fun pickImage() {
        tap("ADD PHOTO")
        assertTrue("Android photo picker must open", device.wait(Until.hasObject(By.pkg("com.google.android.photopicker")), 15_000))
        // The dedicated QA emulator's newest image is the synthetic image inserted above.
        val photo = device.wait(Until.findObject(By.descStartsWith("Photo taken")), 15_000)
            ?: error("Synthetic photo did not appear in the system picker")
        photo.click()
        compose.waitUntil(30_000) {
            compose.onAllNodes(SemanticsMatcher.expectValue(PrivatePhotoLoaded, true)).fetchSemanticsNodes().isNotEmpty()
        }
        android.util.Log.i("BorrowBuddyQa", "Verification: native picker upload and private preview loaded")
        memory("picker-return")
    }
    private fun assertStoredImage(path: String, expected: ByteArray) {
        val signed = runBlocking { repository.privateImage(path, "student-ids") }
        val connection = URL(signed).openConnection().apply { connectTimeout = 10_000; readTimeout = 10_000 }
        val received = connection.getInputStream().use { it.readBytes() }
        assertTrue("Picker must upload the selected synthetic image unchanged",
            MessageDigest.isEqual(MessageDigest.getInstance("SHA-256").digest(expected), MessageDigest.getInstance("SHA-256").digest(received)))
    }
    private fun adminCard(studentId: String) = hasTestTag("verification-$studentId")
    private fun adminTap(studentId: String, label: String) {
        val matcher = hasText(label) and hasAnyAncestor(adminCard(studentId))
        scrollTo(matcher); compose.onNode(matcher).assertIsDisplayed().assertIsEnabled().performClick()
    }
    private fun viewDocument(studentId: String) {
        val button = hasText("VIEW STUDENT ID") and hasAnyAncestor(adminCard(studentId))
        compose.waitUntil(30_000) { compose.onAllNodes(button).fetchSemanticsNodes().isNotEmpty() }
        scrollTo(button)
        compose.waitUntil(30_000) { compose.onAllNodes(button and isEnabled()).fetchSemanticsNodes().isNotEmpty() }
        compose.onNode(button).performClick()
        awaitText("[ PRIVATE EVIDENCE ]")
        compose.waitUntil(30_000) { compose.onAllNodes(hasTestTag("private-evidence-full") and
            SemanticsMatcher.expectValue(PrivatePhotoLoaded, true)).fetchSemanticsNodes().isNotEmpty() }
        val bitmap = compose.onNodeWithTag("private-evidence-full").captureToImage().asAndroidBitmap()
        val sample = bitmap.getPixel(bitmap.width / 2, bitmap.height / 2)
        assertTrue("Full-screen viewer must render actual document pixels", Color.red(sample) > 210 && Color.green(sample) > 210)
        context.filesDir.resolve("hosted-private-viewer.png").outputStream().use {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
        bitmap.recycle()
        memory("viewer-captured")
        compose.activityRule.scenario.recreate()
        awaitText("[ PRIVATE EVIDENCE ]")
        compose.waitUntil(30_000) { compose.onAllNodes(hasTestTag("private-evidence-full") and
            SemanticsMatcher.expectValue(PrivatePhotoLoaded, true)).fetchSemanticsNodes().isNotEmpty() }
        device.pressBack()
        compose.waitUntil(10_000) { compose.onAllNodesWithText("[ PRIVATE EVIDENCE ]").fetchSemanticsNodes().isEmpty() }
        android.util.Log.i("BorrowBuddyQa", "Verification: admin document rendering, rotation and back dismissal passed")
        memory("viewer-recreated")
    }
    @Test fun realPhotoPickerOnboardingAdminRejectionResubmissionAndApproval() {
        val args = InstrumentationRegistry.getArguments()
        val student = args.getString("qaStudentEmail"); val admin = args.getString("qaAdminEmail")
        val password = args.getString("qaPassword"); val studentId = args.getString("qaStudentId")
        assumeTrue("Isolated hosted student/admin required", listOf(student, admin, password, studentId).all { !it.isNullOrBlank() })
        repository = (context.applicationContext as BorrowBuddyApplication).repository
        val bytes = fixture()
        val uri = addMedia(bytes, studentId!!)
        try {
            login(student!!, password!!, "BOARD THE NETWORK")
            field("FULL NAME", "Android QA student")
            field("PHONE", "9876543210")
            pickImage()
            compose.activityRule.scenario.recreate()
            compose.onNode(hasSetTextAction() and hasText("FULL NAME")).assertTextContains("Android QA student")
            tap("SUBMIT FOR ADMIN APPROVAL →"); awaitText("YOUR ID IS IN THE QUEUE")
            compose.onNodeWithText("BROWSE").assertDoesNotExist()
            val pending = runBlocking { repository.profile() }!!
            assertEquals("pending", pending.verification_status)
            assertNotNull(pending.student_id_path)
            assertStoredImage(pending.student_id_path!!, bytes)
            logout()
            login(admin!!, password, "BROWSE"); compose.onNodeWithText("[ ADMIN ]").performClick()
            compose.waitUntil(30_000) { compose.onAllNodes(adminCard(studentId)).fetchSemanticsNodes().isNotEmpty() }
            viewDocument(studentId)
            field("REJECTION REASON", "Synthetic QA: please upload a clearer ID.", adminCard(studentId))
            adminTap(studentId, "REJECT")
            compose.waitUntil(30_000) { compose.onAllNodes(adminCard(studentId)).fetchSemanticsNodes().isEmpty() }
            logout(true)
            login(student, password, "NEEDS ANOTHER LOOK")
            awaitText("SYNTHETIC QA: PLEASE UPLOAD A CLEARER ID.")
            compose.onNodeWithText("BROWSE").assertDoesNotExist()
            pickImage(); tap("RESUBMIT STUDENT ID"); awaitText("YOUR ID IS IN THE QUEUE")
            val resubmitted = runBlocking { repository.profile() }!!
            assertEquals("pending", resubmitted.verification_status)
            assertNotEquals("Resubmission must store the new upload", pending.student_id_path, resubmitted.student_id_path)
            assertStoredImage(resubmitted.student_id_path!!, bytes)
            logout()
            login(admin, password, "BROWSE"); compose.onNodeWithText("[ ADMIN ]").performClick()
            compose.waitUntil(30_000) { compose.onAllNodes(adminCard(studentId)).fetchSemanticsNodes().isNotEmpty() }
            adminTap(studentId, "APPROVE")
            compose.waitUntil(30_000) { compose.onAllNodes(adminCard(studentId)).fetchSemanticsNodes().isEmpty() }
            logout(true)
            login(student, password, "BROWSE")
            assertEquals("verified", runBlocking { repository.profile() }!!.verification_status)
            compose.onNodeWithText("[ ADMIN ]").assertDoesNotExist()
            logout(true)
        } finally {
            context.contentResolver.delete(uri, null, null)
            runBlocking { if (repository.client.auth.currentUserOrNull() != null) repository.signOut() }
        }
    }
}
