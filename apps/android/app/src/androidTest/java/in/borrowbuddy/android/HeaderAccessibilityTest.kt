package `in`.borrowbuddy.android

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.unit.dp
import androidx.core.graphics.ColorUtils
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.domain.Profile
import `in`.borrowbuddy.android.ui.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TestName

/** Source navigation order, actual touch regions, text layout and platform keyboard input. */
class HeaderAccessibilityTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    @get:Rule val name = TestName()
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val evidence = JSONObject()
    private val routes = listOf("dashboard", "home", "chat", "map", "campus", "my/items")
    private fun fixture(admin: Boolean) = Profile("a1111111-1111-4111-8111-111111111111", full_name = "Aditi Sharma", is_admin = admin, verification_status = "verified")
    @Composable private fun Host(admin: Boolean, route: String, pending: Int, section: (String) -> Unit, open: (String) -> Unit, notifications: Int = 123456) {
        CargoTheme { Surface(color = Cargo.Canvas, contentColor = Cargo.Ink) {
            Column(Modifier.fillMaxSize().safeDrawingPadding()) {
                PortalHeader(fixture(admin), route, notifications, pending, section, open)
                Box(Modifier.fillMaxWidth().weight(1f).testTag("header-body")) { Text("PAGE CONTENT REMAINS REACHABLE") }
            }
        } }
    }
    private fun layout(label: String): TextLayoutResult {
        val result = mutableListOf<TextLayoutResult>()
        compose.onNodeWithText(label, useUnmergedTree = true).performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(result) }
        return result.single()
    }
    private fun checkHeader(admin: Boolean) {
        val pending = if (admin) 99999 else 61
        var showCounts by mutableStateOf(true)
        compose.setContent { Host(admin, "campus/collections/example", if (showCounts) pending else 0, {}, {}, notifications = if (showCounts) 123456 else 0) }
        val problems = mutableListOf<String>()
        val density = compose.activity.resources.displayMetrics.density
        val targets = routes.map { "nav-$it" to compose.onNodeWithTag("nav-$it") } + listOf(
            "brand" to compose.onNodeWithContentDescription("BorrowBuddy — home"),
            "notifications" to compose.onNodeWithContentDescription("Notifications (123456 unread)"),
            "account" to compose.onNodeWithContentDescription("Open account")) +
            if (admin) listOf("admin" to compose.onNodeWithText("[ ADMIN ]")) else emptyList()
        val touchRegions = JSONArray()
        val header = compose.onNodeWithTag("portal-header").fetchSemanticsNode().boundsInRoot
        val nodes = targets.map { (label, interaction) ->
            interaction.assertIsDisplayed().assertHasClickAction()
            val node = interaction.fetchSemanticsNode()
            val rect = node.touchBoundsInRoot
            val expectedRole = if (label.startsWith("nav-")) Role.Tab else Role.Button
            if (node.config.getOrNull(SemanticsProperties.Role) != expectedRole) problems += "$label must expose $expectedRole"
            if (rect.width / density < 47.9f || rect.height / density < 47.9f) problems += "$label touch region is smaller than 48 dp"
            if (rect.left < header.left - 1 || rect.right > header.right + 1 || rect.top < header.top - 1 || rect.bottom > header.bottom + 1) problems += "$label extends beyond the header"
            touchRegions.put(JSONObject().put("label", label).put("widthDp", rect.width / density).put("heightDp", rect.height / density))
            label to rect
        }
        for (i in nodes.indices) for (j in i + 1 until nodes.size) {
            val a = nodes[i].second; val b = nodes[j].second
            if (minOf(a.right, b.right) - maxOf(a.left, b.left) > 1 && minOf(a.bottom, b.bottom) - maxOf(a.top, b.top) > 1)
                problems += "Touch regions overlap: ${nodes[i].first}/${nodes[j].first}"
        }
        val ordered = routes.sortedWith(compareBy<String> { compose.onNodeWithTag("nav-$it").fetchSemanticsNode().boundsInRoot.top }
            .thenBy { compose.onNodeWithTag("nav-$it").fetchSemanticsNode().boundsInRoot.left })
        if (ordered != routes) problems += "Navigation order must match the website: $routes, actual=$ordered"
        for (path in routes) compose.onNodeWithTag("nav-$path").assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, path == "campus"))
        val textChecks = JSONArray()
        for (label in listOf("BORROWBUDDY", "DASHBOARD", "BROWSE", "CHAT", "MAP", "CAMPUS", "MY ITEMS", "9+", pending.toString(), "AS") + if (admin) listOf("[ ADMIN ]") else emptyList()) {
            val text = layout(label)
            val fits = !text.didOverflowHeight && (0 until text.lineCount).all { !text.isLineEllipsized(it) && text.getLineRight(it) - text.getLineLeft(it) <= text.size.width + 1 } && text.getLineEnd(text.lineCount - 1) == label.length
            if (!fits) problems += "$label clips or loses characters at the system text scale"
            textChecks.put(JSONObject().put("label", label).put("complete", fits).put("lines", text.lineCount).put("fontSizeSp", text.layoutInput.style.fontSize.value))
        }
        val badgeContrast = ColorUtils.calculateContrast(layout("9+").layoutInput.style.color.toArgb(), Cargo.Accent.toArgb())
        if (badgeContrast < 4.5) problems += "Badge contrast must be at least 4.5:1 (actual $badgeContrast)"
        val pendingContrast = ColorUtils.calculateContrast(layout(pending.toString()).layoutInput.style.color.toArgb(), Cargo.Accent.toArgb())
        if (pendingContrast < 4.5) problems += "Pending badge contrast must be at least 4.5:1"
        val bell = compose.onNodeWithTag("notification-symbol", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        val badge = compose.onNodeWithTag("notification-badge-container", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        val overlap = ((minOf(bell.right, badge.right) - maxOf(bell.left, badge.left)).coerceAtLeast(0f) *
            (minOf(bell.bottom, badge.bottom) - maxOf(bell.top, badge.top)).coerceAtLeast(0f)) / (bell.width * bell.height)
        if (overlap > .2f) problems += "The unread badge must leave at least 80% of the bell unobscured (overlap=$overlap)"
        val bodyHeight = compose.onNodeWithTag("header-body").fetchSemanticsNode().boundsInRoot.height / density
        if (bodyHeight < 48) problems += "Header leaves less than 48 dp for page content"
        evidence.put("admin", admin).put("targets", touchRegions).put("text", textChecks).put("badgeContrast", badgeContrast).put("pendingContrast", pendingContrast).put("bellOverlapFraction", overlap)
            .put("bodyHeightDp", bodyHeight).put("problems", JSONArray(problems))
        assertTrue(problems.joinToString("\n"), problems.isEmpty())
        compose.runOnIdle { showCounts = false }
        compose.onNodeWithContentDescription("Notifications").assertExists()
        compose.onNodeWithTag("notifications-badge", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithTag("pending-requests-badge", useUnmergedTree = true).assertDoesNotExist()
        compose.runOnIdle { showCounts = true }
        compose.onNodeWithContentDescription("Notifications (123456 unread)").assertExists()
        evidence.put("zeroCountsAndRestoration", true)
    }
    @Test fun studentHeaderReflowsWithoutOverlappingTargets() = checkHeader(false)
    @Test fun adminHeaderReflowsWithoutClippedCounts() = checkHeader(true)
    @Test fun keyboardReachesEveryHeaderRouteAndControl() {
        val events = mutableListOf<String>()
        compose.setContent {
            var route by rememberSaveable { mutableStateOf("home") }
            Host(true, route, 61, { route = it; events += it }, { events += it })
        }
        val targets = routes.map { it to compose.onNodeWithTag("nav-$it") } + listOf(
            "admin" to compose.onNodeWithText("[ ADMIN ]"),
            "notifications" to compose.onNodeWithContentDescription("Notifications (123456 unread)"),
            "me" to compose.onNodeWithContentDescription("Open account"),
            "home" to compose.onNodeWithContentDescription("BorrowBuddy — home"))
        val focusEvidence = JSONArray()
        evidence.put("focusPaint", focusEvidence)
        for ((destination, interaction) in targets) {
            repeat(24) {
                if (interaction.fetchSemanticsNode().config.getOrNull(SemanticsProperties.Focused) != true) {
                    instrumentation.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_TAB); compose.waitForIdle()
                }
            }
            interaction.assertIsFocused()
            // Focus semantics update before the interaction collector's next draw.
            // Require the actual amber pixels, allowing that frame to be painted.
            val paint = JSONObject().put("destination", destination)
            focusEvidence.put(paint)
            var captures = 0
            compose.waitUntil(5_000) {
                val focused = interaction.captureToImage().asAndroidBitmap()
                try {
                    val pixel = focused.getPixel(focused.width / 2, 1)
                    paint.put("captures", ++captures).put("lastPixel", pixel)
                    android.graphics.Color.red(pixel) > 150 && android.graphics.Color.green(pixel) > 70 && android.graphics.Color.blue(pixel) < 50
                } finally { focused.recycle() }
            }
            val before = events.size
            instrumentation.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_ENTER); compose.waitForIdle()
            assertEquals(before + 1, events.size); assertEquals(destination, events.last())
            if (destination in routes) compose.onNodeWithTag("nav-$destination").assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, true))
        }
        evidence.put("keyboardDestinations", JSONArray(events))
    }
    @After fun exportEvidence() {
        evidence.put("systemFontScale", compose.activity.resources.configuration.fontScale).put("widthPixels", compose.activity.resources.displayMetrics.widthPixels)
        val root = instrumentation.targetContext.filesDir
        root.resolve("header-a11y-${name.methodName}.json").writeText(evidence.toString(2))
        val image = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        try { root.resolve("header-a11y-${name.methodName}.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } }
        finally { image.recycle() }
    }
}
