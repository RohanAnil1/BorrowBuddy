package `in`.borrowbuddy.android

import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.ui.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

/** Production admin content with normal hosted credentials and actual private files. */
class HostedAdminPresentationTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private fun stage(value: String) { context.filesDir.resolve("native-admin-stage.txt").writeText(value) }
    private fun ready(tag: String) = compose.waitUntil(30_000) { compose.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
    private fun scroll(matcher: SemanticsMatcher) = compose.onNodeWithTag("admin-desk").performScrollToNode(matcher)
    private fun height(tag: String) = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot.height / compose.activity.resources.displayMetrics.density
    private fun width(tag: String) = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot.width / compose.activity.resources.displayMetrics.density
    private fun capture(name: String) {
        compose.waitForIdle(); val image = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        try { assertPaintedSurface(image); context.filesDir.resolve("native-admin-$name.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } }
        finally { image.recycle() }
    }
    @Test fun originalAdminGeometryEvidenceDraftsWindowsAndEmptyStates() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue(listOf("qaEmail","qaPassword","qaPendingId","qaMissingId","qaIncidentId","qaFineId","qaPinId","qaSize").all { !args.getString(it).isNullOrBlank() })
        val repository = (context.applicationContext as BorrowBuddyApplication).repository
        val suffix = args.getString("qaSize")!!; val pending = args.getString("qaPendingId")!!; val incidentId = args.getString("qaIncidentId")!!
        val fineId = args.getString("qaFineId")!!; val pinId = args.getString("qaPinId")!!
        val source = args.getString("qaSourceLayout")?.let { JSONObject(String(android.util.Base64.decode(it, android.util.Base64.DEFAULT), Charsets.UTF_8)) }
        val result = JSONObject().put("size", suffix)
        try {
            stage("authenticate")
            runBlocking { repository.signIn(args.getString("qaEmail")!!, args.getString("qaPassword")!!) }
            val profile = runBlocking { repository.profile()!! }; assertTrue(profile.is_admin)
            val data = runBlocking { AdminData(repository.pendingProfiles(), repository.incidents(), repository.fines(), repository.locations(admin = true)) }
            assertEquals(32, data.incidents.size)
            var empty by mutableStateOf(false); var loan: String? = null
            compose.runOnUiThread { compose.activity.enableEdgeToEdge(SystemBarStyle.dark(android.graphics.Color.TRANSPARENT), SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)) }
            val restoration = StateRestorationTester(compose)
            restoration.setContent { CargoTheme { Box(Modifier.fillMaxSize()) {
                PortalBackdrop(); Box(Modifier.fillMaxSize().safeDrawingPadding()) {
                    key(empty) { AdminContent(if (empty) data.copy(profiles = emptyList(), incidents = emptyList(), fines = emptyList()) else data, repository, rememberActions()) { loan = it } }
                }
            } } }
            ready("admin-desk"); stage("heading")
            result.put("rootWidthDp", width("admin-desk")).put("titleHeightDp", height("admin-title"))
            if (source != null) {
                assertEquals("Source centered admin maximum", source.getJSONObject("root").getJSONObject("bounds").getDouble("width"), width("admin-desk").toDouble(), 1.2)
                assertEquals("Source display title", source.getJSONObject("heading").getJSONObject("bounds").getDouble("height"), height("admin-title").toDouble(), 1.2)
            }
            assertEquals(30, compose.onNodeWithTag("admin-desk").fetchSemanticsNode().config[AdminIncidentCount])
            scroll(hasTestTag("verification-$pending")); stage("verification")
            result.put("verificationHeightDp", height("verification-$pending"))
            if (source != null) assertEquals("Source verification wrapping", source.getJSONObject("verification").getJSONObject("bounds").getDouble("height"), height("verification-$pending").toDouble(), 5.0)
            val layouts = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
            compose.onNodeWithTag("admin-student-name-$pending").performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
            assertEquals(Cargo.Strong, layouts.single().layoutInput.style.fontFamily); assertEquals(15f, layouts.single().layoutInput.style.fontSize.value, .01f)
            val idLink = hasTestTag("admin-id-link-$pending")
            scroll(idLink); compose.waitUntil(20_000) { compose.onAllNodes(idLink and isEnabled()).fetchSemanticsNodes().isNotEmpty() }
            capture("verification-$suffix")
            compose.onNode(idLink).performClick(); ready("private-evidence-full")
            compose.waitUntil(30_000) { compose.onNodeWithTag("private-evidence-full").fetchSemanticsNode().config[PrivatePhotoLoaded] }
            compose.onNodeWithText("CLOSE").performClick()
            val reason = hasSetTextAction() and hasContentDescription("Rejection reason") and hasAnyAncestor(hasTestTag("verification-$pending"))
            scroll(reason); compose.onNode(reason).performTextReplacement("x".repeat(501)); assertEquals(500, compose.onNode(reason).fetchSemanticsNode().config[SemanticsProperties.EditableText].text.length)
            compose.onNode(reason).performTextReplacement("A clearer student ID is required.")
            androidx.test.espresso.Espresso.closeSoftKeyboard()
            val missing = hasText("[ NO STUDENT ID UPLOADED ]") and hasAnyAncestor(hasTestTag("verification-${args.getString("qaMissingId")!!}"))
            scroll(missing); compose.onNode(missing).assertIsDisplayed()
            val incident = data.incidents.single { it.id == incidentId }; val photo = incident.photos.single()
            stage("incident")
            scroll(hasTestTag("incident-$incidentId"))
            result.put("incidentHeightDp", height("incident-$incidentId"))
            if (source != null) assertEquals("Source incident form and text wrapping", source.getJSONObject("incident").getJSONObject("bounds").getDouble("height"), height("incident-$incidentId").toDouble(), 5.0)
            val photoTag = "admin-photo-${photo.id}"; scroll(hasTestTag(photoTag))
            compose.waitUntil(30_000) { compose.onNodeWithTag(photoTag).fetchSemanticsNode().config[PrivatePhotoLoaded] }
            assertEquals(96f, width(photoTag), 1f); assertEquals(96f, height(photoTag), 1f)
            capture("incident-$suffix")
            compose.onNodeWithTag(photoTag).performClick(); ready("private-evidence-full")
            compose.waitUntil(30_000) { compose.onNodeWithTag("private-evidence-full").fetchSemanticsNode().config[PrivatePhotoLoaded] }
            compose.onNodeWithText("CLOSE").performClick()
            val note = hasTestTag("admin-resolution-$incidentId"); scroll(note)
            assertEquals("Source single-line input, including a narrow placeholder", 37.5f, height("admin-resolution-$incidentId"), 1f)
            compose.onNode(note).performTextReplacement("Draft resolution retained across recreation.")
            androidx.test.espresso.Espresso.closeSoftKeyboard()
            restoration.emulateSavedInstanceStateRestore(); ready("admin-desk"); scroll(note)
            compose.onNode(note).assertTextContains("Draft resolution retained across recreation.")
            scroll(reason); compose.onNode(reason).assertTextContains("A clearer student ID is required.")
            scroll(note); compose.onNode(note).performTextReplacement("bad"); androidx.test.espresso.Espresso.closeSoftKeyboard()
            val resolve = hasText("RESOLVE") and hasAnyAncestor(hasTestTag("incident-$incidentId")); scroll(resolve); compose.onNode(resolve).performClick()
            compose.onNodeWithTag("admin-desk").performScrollToIndex(0); ready("admin-action-error")
            compose.onNodeWithTag("admin-action-error").assert(hasText("AT LEAST FIVE CHARACTERS", substring = true))
            assertEquals("open", runBlocking { repository.incidents().single { it.id == incidentId } }.status)
            val link = hasContentDescription("Open loan →") and hasAnyAncestor(hasTestTag("incident-$incidentId")); scroll(link); compose.onNode(link).performClick(); assertEquals(incident.loan_id, loan)
            stage("history")
            scroll(hasTestTag("admin-older-incidents")); compose.onNodeWithTag("admin-older-incidents").performClick()
            assertEquals(32, compose.onNodeWithTag("admin-desk").fetchSemanticsNode().config[AdminIncidentCount])
            stage("fines"); scroll(hasTestTag("fine-$fineId")); result.put("fineHeightDp", height("fine-$fineId"))
            if (source != null) assertEquals("Source fine row wrapping", source.getJSONObject("fine").getJSONObject("bounds").getDouble("height"), height("fine-$fineId").toDouble(), 4.0)
            capture("fine-$suffix")
            stage("pins"); scroll(hasTestTag("pin-$pinId")); val preview = "admin-pin-preview-$pinId"
            assertEquals(80f, width(preview), 1f); assertEquals(60f, height(preview), 1f); capture("pins-$suffix")
            val edit = hasText("[ EDIT PIN ]") and hasAnyAncestor(hasTestTag("pin-$pinId")); scroll(edit); compose.onNode(edit).performClick()
            val map = hasTestTag("pin-position") and hasAnyAncestor(hasTestTag("pin-editor-$pinId")); scroll(map)
            val mapImage = hasTestTag("campus-map-image") and hasAnyAncestor(hasTestTag("pin-editor-$pinId"))
            compose.waitUntil(30_000) { compose.onNode(mapImage).fetchSemanticsNode().config[CampusImageWidth] > 0 }
            val mapWidth = compose.onNode(map).fetchSemanticsNode().boundsInRoot.width / compose.activity.resources.displayMetrics.density
            assertTrue(mapWidth <= 449f); result.put("mapWidthDp", mapWidth); capture("pin-editor-$suffix")
            if (source != null) assertEquals("Source map editor width", source.getJSONObject("pinMap").getDouble("width"), mapWidth.toDouble(), 1.2)
            stage("empty"); compose.runOnIdle { empty = true }; ready("admin-desk")
            scroll(hasTestTag("admin-verification-empty")); compose.onNodeWithTag("admin-verification-empty").assertIsDisplayed()
            scroll(hasTestTag("admin-incidents-empty")); compose.onNodeWithText("NO OPEN INCIDENTS").assertIsDisplayed(); capture("empty-$suffix")
            result.put("emptyIncidentHeightDp", height("admin-incidents-empty"))
            scroll(hasTestTag("admin-fines-empty")); compose.onNodeWithText("NO PENDING FINES").assertIsDisplayed()
            result.put("emptyFineHeightDp", height("admin-fines-empty"))
            result.put("originalFonts", true).put("privateIdAndEvidenceDecoded", true).put("draftsRestored", true).put("rejectionMaximum500", true)
                .put("invalidResolutionRejectedWithoutMutation", true).put("loanCallback", true).put("sourceIncidentWindow", 30).put("olderIncidentsRetained", 32).put("emptyComponents", true)
            context.filesDir.resolve("native-admin-result-$suffix.json").writeText(result.toString(2)); stage("complete")
        } catch (failure: Throwable) { runCatching { capture("failure-$suffix") }; throw failure }
        finally { runBlocking { repository.signOut() } }
    }
}
