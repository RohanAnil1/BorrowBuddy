package `in`.borrowbuddy.android

import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.ui.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

/** Real hosted data and production content, without the shell's unrelated height. */
class HostedChatPresentationTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private fun ready(tag: String) = compose.waitUntil(30_000) { compose.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
    private fun connected() = compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(ChatConnected, true)).fetchSemanticsNodes().isNotEmpty() }
    private fun capture(name: String) {
        compose.waitForIdle()
        val bitmap = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        try {
            assertPaintedSurface(bitmap)
            context.filesDir.resolve("native-chat-$name.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        } finally { bitmap.recycle() }
    }
    private fun height(tag: String) = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot.height / compose.activity.resources.displayMetrics.density
    private fun width(tag: String) = compose.onNodeWithTag(tag).fetchSemanticsNode().boundsInRoot.width / compose.activity.resources.displayMetrics.density
    private fun imeBottom(): Int {
        var value = 0
        compose.runOnUiThread { value = ViewCompat.getRootWindowInsets(compose.activity.window.decorView)?.getInsets(WindowInsetsCompat.Type.ime())?.bottom ?: 0 }
        return value
    }
    @Test fun originalChatLayoutTypographyComposerAndEmptyStates() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue(listOf("qaEmail", "qaPassword", "qaPrivateId", "qaCommunityId", "qaEmptyRoomId", "qaOwnerId", "qaLoanId", "qaChatSize").all { !args.getString(it).isNullOrBlank() })
        val repository = (context.applicationContext as BorrowBuddyApplication).repository
        val suffix = args.getString("qaChatSize")!!
        val source = args.getString("qaSourceLayout")?.let { JSONObject(String(android.util.Base64.decode(it, android.util.Base64.DEFAULT), Charsets.UTF_8)) }
        var room by mutableStateOf<String?>(null)
        var showEmptyList by mutableStateOf(false)
        var openedLoan: String? = null
        var openedProfile: String? = null
        val result = JSONObject().put("size", suffix)
        try {
            runBlocking { repository.signIn(args.getString("qaEmail")!!, args.getString("qaPassword")!!) }
            val profile = runBlocking { repository.profile()!! }
            compose.runOnUiThread { compose.activity.enableEdgeToEdge() }
            compose.setContent { CargoTheme { Box(Modifier.fillMaxSize()) {
                PortalBackdrop()
                Box(Modifier.fillMaxSize().safeDrawingPadding()) {
                    if (showEmptyList) ChatsContent(emptyList()) { room = it }
                    else if (room == null) ChatsScreen(repository, profile) { room = it }
                    else ChatScreen(repository, profile, room!!, { openedLoan = it }, { openedProfile = it }, { room = null })
                }
            } } }
            ready("chat-list")
            val privateTag = "conversation-${args.getString("qaPrivateId")!!}"
            compose.onNodeWithTag("chat-list").performScrollToNode(hasTestTag(privateTag))
            val title = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
            compose.onNodeWithTag("chat-list-title").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult) { it(title) }
            assertEquals(Cargo.Title, title.single().layoutInput.style.fontFamily)
            result.put("listWidthDp", width("chat-list")).put("listTitleHeightDp", height("chat-list-title"))
                .put("listIntroHeightDp", height("chat-list-intro")).put("conversationHeightDp", height(privateTag))
            if (source != null) {
                assertEquals("Source centered list width", source.getDouble("rootWidth"), width("chat-list").toDouble(), 1.2)
                assertEquals("Source display title", source.getDouble("titleHeight"), height("chat-list-title").toDouble(), 1.2)
                assertEquals("Source preview/label rows", source.getDouble("rowHeight"), height(privateTag).toDouble(), 2.5)
                assertEquals("Source intro wrapping", source.getDouble("introHeight"), height("chat-list-intro").toDouble(), 2.5)
            }
            capture("list-$suffix")
            compose.onNodeWithTag(privateTag).performClick(); ready("chat-thread-page"); connected()
            compose.onNodeWithTag("chat-send").assertIsNotEnabled()
            result.put("headerHeightDp", height("chat-thread-header")).put("composerHeightDp", height("chat-composer-panel"))
                .put("inputHeightDp", height("chat-composer")).put("sendSizeDp", width("chat-send"))
            assertEquals(36f, width("chat-back"), 1f)
            if (source != null) {
                assertEquals("Source private header line boxes", source.getDouble("headerHeight"), height("chat-thread-header").toDouble(), 2.0)
                assertEquals("Source composer", source.getDouble("composerHeight"), height("chat-composer-panel").toDouble(), 1.5)
                assertEquals("Source textarea", source.getDouble("inputHeight"), height("chat-composer").toDouble(), 1.5)
                assertEquals("Source send button", source.getDouble("sendSize"), width("chat-send").toDouble(), 1.0)
            }
            compose.onNodeWithTag("chat-loan-link").performClick(); assertEquals(args.getString("qaLoanId"), openedLoan)
            compose.onNodeWithContentDescription("Open counterparty profile").performClick(); assertEquals(args.getString("qaOwnerId"), openedProfile)
            val image = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
            try {
                for (mine in listOf(false, true)) {
                    val nodes = compose.onAllNodes(SemanticsMatcher.expectValue(ChatBubbleMine, mine)).fetchSemanticsNodes()
                    assertTrue("Both source bubble roles must be visible", nodes.isNotEmpty())
                    val node = nodes.last()
                    val tag = node.config[SemanticsProperties.TestTag]
                    val layouts = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
                    compose.onNodeWithTag(tag).performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult) { it(layouts) }
                    val input = layouts.single().layoutInput
                    assertEquals("Source inherited uppercase and normal whitespace", chatText(input.text.text), input.text.text)
                    val style = input.style
                    assertEquals(Cargo.Body, style.fontFamily); assertEquals(14f, style.fontSize.value, .01f); assertEquals(24f, style.lineHeight.value, .01f)
                    val bounds = node.boundsInWindow
                    val offset = (4 * compose.activity.resources.displayMetrics.density).toInt()
                    val pixel = image.getPixel(bounds.left.toInt() + offset, bounds.top.toInt() + offset)
                    val expected = (if (mine) Cargo.Accent else Color.Black).toArgb()
                    for (shift in listOf(0, 8, 16)) assertTrue("Source bubble pixels", kotlin.math.abs(((expected shr shift) and 255) - ((pixel shr shift) and 255)) <= 3)
                }
            } finally { image.recycle() }
            result.put("bothBubbleRolesAndOriginalFont", true).put("loanAndProfileCallbacks", true)
            capture("private-$suffix")
            val composer = compose.onNode(hasSetTextAction() and hasContentDescription("Write a message"))
            composer.performClick().performTextReplacement("Presentation draft")
            compose.waitUntil(15_000) { imeBottom() > 0 }
            val bottom = compose.onNodeWithTag("chat-composer-panel").fetchSemanticsNode().boundsInWindow.bottom
            val screenHeight = compose.activity.windowManager.currentWindowMetrics.bounds.height()
            assertTrue("The Android keyboard must not cover the composer", bottom <= screenHeight - imeBottom() + 2)
            compose.onNodeWithTag("chat-send").assertIsDisplayed().assertIsEnabled()
            composer.performTextReplacement("x".repeat(2001))
            assertEquals(2000, composer.fetchSemanticsNode().config[SemanticsProperties.EditableText].text.length)
            composer.performTextClearance(); compose.onNodeWithTag("chat-send").assertIsNotEnabled()
            androidx.test.espresso.Espresso.closeSoftKeyboard()
            compose.waitUntil(10_000) { imeBottom() == 0 }
            result.put("keyboardVisibleAndComposerAboveIme", true).put("maximum2000Characters", true)
            compose.onNodeWithContentDescription("Back to chats").performClick(); ready("chat-list")
            compose.runOnIdle { room = args.getString("qaEmptyRoomId")!! }
            connected(); ready("chat-empty-thread")
            compose.onNodeWithText("NOBODY HAS SAID ANYTHING YET. START THE CONVERSATION.").assertIsDisplayed()
            assertTrue(compose.onAllNodesWithTag("chat-loan-link").fetchSemanticsNodes().isEmpty())
            compose.onNodeWithText("OPEN TO ALL").assertIsDisplayed(); capture("empty-thread-$suffix")
            compose.runOnIdle { room = args.getString("qaCommunityId")!! }
            connected(); compose.onNodeWithText("COMMUNITY CHANNEL").assertIsDisplayed(); capture("community-$suffix")
            compose.runOnIdle { room = null; showEmptyList = true }
            ready("chat-empty-list"); compose.onNodeWithText("NO CONVERSATIONS YET").assertIsDisplayed(); capture("empty-list-$suffix")
            result.put("emptyThread", true).put("emptyList", true).put("community", true)
            context.filesDir.resolve("native-chat-presentation-$suffix.json").writeText(result.toString(2))
        } catch (failure: Throwable) {
            context.filesDir.resolve("native-chat-presentation-partial-$suffix.json").writeText(result.toString(2))
            runCatching { capture("presentation-failure-$suffix") }
            throw failure
        } finally { runBlocking { repository.signOut() } }
    }
}
