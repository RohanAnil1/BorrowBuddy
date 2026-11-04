package `in`.borrowbuddy.android

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.material3.Surface
import androidx.compose.ui.semantics.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.text.TextLayoutResult
import androidx.core.graphics.ColorUtils
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.domain.*
import `in`.borrowbuddy.android.ui.*
import kotlinx.serialization.json.*
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TestName

/** Production components, real system font scale and keyboard input; no hosted fixtures. */
class VisualAccessibilityTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    @get:Rule val name = TestName()
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val evidence = JSONObject()
    private fun key(code: Int) { instrumentation.sendKeyDownUpSync(code); compose.waitForIdle() }
    @Composable private fun Portal(content: @Composable () -> Unit) {
        CargoTheme { Surface(Modifier.fillMaxSize(), color = Cargo.Canvas, contentColor = Cargo.Ink) {
            Box(Modifier.fillMaxSize().safeDrawingPadding()) { PortalBackdrop(); content() }
        } }
    }
    private fun scroll(matcher: SemanticsMatcher) = compose.onNode(hasScrollAction() and
        SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)).performScrollToNode(matcher)
    private fun textLayout(text: String): TextLayoutResult {
        val layouts = mutableListOf<TextLayoutResult>()
        compose.onNodeWithText(text, useUnmergedTree = true).performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
        return layouts.single()
    }
    private fun legible(text: String) {
        val layout = textLayout(text)
        evidence.put(text.take(35), JSONObject().put("lines", layout.lineCount).put("overflow", layout.hasVisualOverflow)
            .put("widthOverflow", layout.didOverflowWidth).put("heightOverflow", layout.didOverflowHeight)
            .put("width", layout.size.width).put("height", layout.size.height).put("paragraphWidth", layout.multiParagraph.width)
            .put("maxLineRight", (0 until layout.lineCount).maxOf { layout.getLineRight(it) })
            .put("maxLineWidth", (0 until layout.lineCount).maxOf { layout.getLineRight(it) - layout.getLineLeft(it) })
            .put("lastLineBottom", layout.getLineBottom(layout.lineCount - 1)))
        // The cached paragraph can retain the wider parent constraints while size
        // reports the text's intrinsic box. Compare each line's span, independent
        // of its paragraph alignment origin, with one pixel of raster rounding.
        // Retain every character and reject ellipsis/vertical clipping at each scale.
        assertFalse("Text height must not clip: $text", layout.didOverflowHeight)
        for (line in 0 until layout.lineCount) {
            assertFalse("Text must never be ellipsized: $text", layout.isLineEllipsized(line))
            assertTrue("Line must fit its painted width: $text", layout.getLineRight(line) - layout.getLineLeft(line) <= layout.size.width + 1f)
        }
        assertEquals("Every character must remain in the layout: $text", text.length, layout.getLineEnd(layout.lineCount - 1))
    }
    private fun target(text: String) {
        scroll(hasText(text)); compose.onNodeWithText(text).assertIsDisplayed().assertHasClickAction()
        val bounds = compose.onNodeWithText(text).fetchSemanticsNode().boundsInRoot
        val density = compose.activity.resources.displayMetrics.density
        assertTrue("$text must retain a 48 dp target", bounds.width / density >= 47.9f && bounds.height / density >= 47.9f)
        legible(text)
    }
    @After fun exportActualScreen() {
        evidence.put("systemFontScale", compose.activity.resources.configuration.fontScale)
        evidence.put("widthPixels", compose.activity.resources.displayMetrics.widthPixels)
        val root = instrumentation.targetContext.filesDir
        root.resolve("parity-a11y-${name.methodName}.json").writeText(evidence.toString(2))
        val bitmap = instrumentation.uiAutomation.takeScreenshot()
        bitmap?.let { image -> try {
            root.resolve("parity-a11y-${name.methodName}.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        } finally { image.recycle() } }
    }

    @Test fun campusPrimaryContrastHeadingAndKeyboardFocus() {
        var committed = 0
        compose.setContent { Portal { CampusPage("A careful check. A safe return.", open = {}) {
            CampusConfirm("Reserve this giveaway", "Reserve only when you can collect before the deadline.", rememberActions(), primary = true) { committed++ }
        } } }
        scroll(hasText("RESERVE THIS GIVEAWAY"))
        val foreground = textLayout("RESERVE THIS GIVEAWAY").layoutInput.style.color
        assertTrue("Button must expose its actual resolved foreground", foreground != Color.Unspecified)
        val contrast = ColorUtils.calculateContrast(foreground.toArgb(), Cargo.Accent.toArgb())
        evidence.put("primaryContrast", contrast)
        assertTrue("Campus primary labels must meet 4.5:1 and retain source black-on-amber styling (actual $contrast)", contrast >= 4.5)
        compose.onNodeWithText("A CAREFUL CHECK. A SAFE RETURN.").assert(SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading))
        target("RESERVE THIS GIVEAWAY")
        // Tab must reach the production action; Enter opens the actual confirmation dialog.
        repeat(12) {
            if (compose.onNodeWithText("RESERVE THIS GIVEAWAY").fetchSemanticsNode().config.getOrNull(SemanticsProperties.Focused) != true)
                key(android.view.KeyEvent.KEYCODE_TAB)
        }
        compose.onNodeWithText("RESERVE THIS GIVEAWAY").assertIsFocused()
        key(android.view.KeyEvent.KEYCODE_ENTER)
        compose.onNodeWithText("CONFIRM").assertIsDisplayed()
        assertEquals("Opening a dialog must not reserve anything", 0, committed)
        compose.onNodeWithText("KEEP AS IS").performClick()
        compose.onNodeWithTag("campus-confirmation").assertDoesNotExist()
        assertEquals(0, committed)
    }

    @Test fun offlineLargeTextPauseStatusAndKeyboardRecovery() {
        var checking by mutableStateOf(false)
        var restored by mutableStateOf(false)
        var retries = 0
        var homes = 0
        compose.setContent { Portal { OfflineScreen(checking, restored, { retries++; checking = true }, { homes++ }) } }
        compose.onNodeWithTag("offline-screen").assert(SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, "Connection unavailable"))
        scroll(hasText("A LITTLE OUT")); legible("A LITTLE OUT"); legible("OF REACH.")
        compose.onNode(hasText("A LITTLE OUT") and SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)).assertExists()
        target("PAUSE ANIMATION"); compose.onNodeWithText("PAUSE ANIMATION").performClick()
        compose.onNodeWithText("PLAY ANIMATION").assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Animation paused"))
        target("TRY AGAIN"); target("CAMPUS HOME ↗")
        repeat(12) {
            if (compose.onNodeWithText("TRY AGAIN").fetchSemanticsNode().config.getOrNull(SemanticsProperties.Focused) != true)
                key(android.view.KeyEvent.KEYCODE_TAB)
        }
        compose.onNodeWithText("TRY AGAIN").assertIsFocused()
        key(android.view.KeyEvent.KEYCODE_ENTER)
        assertEquals(1, retries)
        compose.onNodeWithText("CHECKING CONNECTION…").assertIsNotEnabled()
        scroll(hasText("Checking your connection…"))
        compose.onNodeWithText("Checking your connection…").assert(SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite))
        compose.runOnIdle { checking = false; restored = true }
        compose.onNodeWithTag("offline-screen").assert(SemanticsMatcher.expectValue(SemanticsProperties.PaneTitle, "Connection restored"))
        target("RESUME MY PAGE"); compose.onNodeWithText("RESUME MY PAGE").performClick(); assertEquals(2, retries)
        compose.runOnIdle { checking = false }
        target("CAMPUS HOME ↗"); compose.onNodeWithText("CAMPUS HOME ↗").performClick(); assertEquals(1, homes)
    }

    @Test fun scheduleLargeTextValidationDraftAndSave() {
        val restoration = StateRestorationTester(compose)
        var saved: JsonObject? = null
        restoration.setContent { Portal { CampusPage("Meet on your schedule.", open = {}) {
            val actions = rememberActions()
            CampusScheduleEditor(CampusSchedule("host", "spot"), listOf(PickupLocation("spot", "Library reception and student services")), actions) { saved = it }
            ActionFeedback(actions)
        } } }
        target("MONDAY · UNAVAILABLE"); compose.onNodeWithText("MONDAY · UNAVAILABLE").performClick()
        val start = hasSetTextAction() and hasText("MONDAY START (HH:MM)")
        val end = hasSetTextAction() and hasText("MONDAY END (HH:MM)")
        scroll(start); compose.onNode(start).performTextReplacement("17:00")
        scroll(end); compose.onNode(end).performTextReplacement("16:00")
        androidx.test.espresso.Espresso.closeSoftKeyboard()
        target("SAVE MY HANDOVER HOURS"); compose.onNodeWithText("SAVE MY HANDOVER HOURS").performClick()
        compose.waitUntil(5_000) { compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.Error)).fetchSemanticsNodes().isNotEmpty() }
        assertNull("Invalid hours must not be submitted", saved)
        restoration.emulateSavedInstanceStateRestore()
        scroll(end); compose.onNode(end).assertTextContains("16:00").performTextReplacement("19:00")
        androidx.test.espresso.Espresso.closeSoftKeyboard()
        target("SAVE MY HANDOVER HOURS"); compose.onNodeWithText("SAVE MY HANDOVER HOURS").performClick()
        compose.waitUntil(5_000) { saved != null }
        assertEquals(30, saved!!.getValue("slot_minutes").jsonPrimitive.int)
        assertEquals("19:00", saved!!.getValue("weekly").jsonArray.single().jsonObject.getValue("end").jsonPrimitive.content)
        evidence.put("draftRestoredAndValidSave", true)
    }

    @Test fun confirmationKeepsBothActionsReachableAtLargeText() {
        var committed = 0
        val explanation = "This item is reserved for 48 hours. Only confirm if you can collect it at the campus pickup location before the deadline. Booking and messages do not extend the hold."
        compose.setContent { Portal { CampusPage("Careful campus collections", open = {}) {
            CampusConfirm("Reserve this giveaway", explanation, rememberActions(), primary = true) { committed++ }
        } } }
        scroll(hasText("RESERVE THIS GIVEAWAY")); compose.onNodeWithText("RESERVE THIS GIVEAWAY").performClick()
        legible(explanation)
        compose.onNodeWithTag("campus-confirmation").performScrollToNode(hasText("CONFIRM"))
        compose.onNodeWithText("CONFIRM").assertIsDisplayed().assertHasClickAction(); legible("CONFIRM")
        compose.onNodeWithTag("campus-confirmation").performScrollToNode(hasText("KEEP AS IS"))
        compose.onNodeWithText("KEEP AS IS").assertIsDisplayed().assertHasClickAction(); legible("KEEP AS IS")
        // Dialog window coordinates and physical screenshot coordinates have
        // different origins. Verify the painted panel in its own coordinates,
        // then wait for platform window events before taking the full-screen image.
        val surface = compose.onNodeWithTag("campus-confirmation").captureToImage().asAndroidBitmap()
        try {
            for ((x, y) in listOf(8 to surface.height / 2, surface.width - 9 to surface.height / 2, surface.width / 2 to 8)) {
                assertEquals("The source dialog panel must paint opaque black", android.graphics.Color.BLACK, surface.getPixel(x, y))
            }
        } finally { surface.recycle() }
        instrumentation.uiAutomation.waitForIdle(500, 5_000)
        val painted = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        try { instrumentation.targetContext.filesDir.resolve("parity-a11y-confirmation-open.png").outputStream().use {
            painted.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
        } } finally { painted.recycle() }
        evidence.put("opaqueDialogSurfaceAndPlatformIdle", true)
        compose.onNodeWithText("KEEP AS IS").performClick(); assertEquals(0, committed)
        compose.onNodeWithTag("campus-confirmation").assertDoesNotExist()
        compose.onNodeWithText("RESERVE THIS GIVEAWAY").performClick()
        compose.onNodeWithTag("campus-confirmation").performScrollToNode(hasText("CONFIRM"))
        compose.onNodeWithText("CONFIRM").performClick()
        compose.waitUntil(5_000) { committed == 1 }
        compose.onNodeWithTag("campus-confirmation").assertDoesNotExist()
    }
}
