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
    @Test fun chatDesignFiltersSearchComposerAndEmptyStates() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue(listOf("qaEmail", "qaPassword", "qaPrivateId", "qaCommunityId", "qaEmptyRoomId", "qaOwnerId", "qaLoanId", "qaChatSize").all { !args.getString(it).isNullOrBlank() })
        val repository = (context.applicationContext as BorrowBuddyApplication).repository
        val suffix = args.getString("qaChatSize")!!
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
            val list = compose.onNodeWithTag("chat-list")
            val title = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
            compose.onNodeWithTag("chat-list-title").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult) { it(title) }
            assertEquals(Cargo.Strong, title.single().layoutInput.style.fontFamily)
            compose.onNodeWithText("Public").performClick()
            compose.onNodeWithText("Public").assertIsSelected()
            compose.onNodeWithTag(privateTag).assertDoesNotExist()
            compose.onNodeWithText("Private").performClick()
            compose.onNodeWithContentDescription("Search conversations").performTextReplacement("no conversation matches this")
            compose.onNodeWithText("No matching conversations").assertIsDisplayed()
            compose.onNodeWithContentDescription("Search conversations").performTextClearance()
            androidx.test.espresso.Espresso.closeSoftKeyboard()
            list.performScrollToNode(hasTestTag(privateTag))
            result.put("listWidthDp", width("chat-list")).put("listTitleHeightDp", height("chat-list-title"))
                .put("conversationHeightDp", height(privateTag)).put("filtersAndSearch", true)
            capture("list-$suffix")
            compose.onNodeWithTag(privateTag).performClick(); ready("chat-thread-page"); connected()
            compose.onNodeWithTag("chat-send").assertIsNotEnabled()
            result.put("headerHeightDp", height("chat-thread-header")).put("composerHeightDp", height("chat-composer-panel"))
                .put("inputHeightDp", height("chat-composer")).put("sendSizeDp", width("chat-send"))
            assertEquals(44f, width("chat-back"), 1f)
            compose.onNodeWithTag("chat-loan-link").performClick(); assertEquals(args.getString("qaLoanId"), openedLoan)
            compose.onNodeWithContentDescription("Open counterparty profile").performClick(); assertEquals(args.getString("qaOwnerId"), openedProfile)
            val messages = runBlocking { repository.messages(args.getString("qaPrivateId")!!) }
            for (mine in listOf(false, true)) {
                val message = messages.last { (it.sender_id == profile.id) == mine }
                compose.onNodeWithTag("chat-messages").performScrollToKey(message.id)
                val tag = "chat-bubble-${message.id}"
                val bubble = compose.onNodeWithTag(tag).assertIsDisplayed()
                    .assert(SemanticsMatcher.expectValue(ChatBubbleMine, mine))
                val image = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
                try {
                    val layouts = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
                    bubble.performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult) { it(layouts) }
                    val input = layouts.single().layoutInput
                    assertEquals("Messages retain original case and whitespace", message.body, input.text.text)
                    val style = input.style
                    assertEquals(Cargo.Body, style.fontFamily); assertEquals(14f, style.fontSize.value, .01f); assertEquals(22f, style.lineHeight.value, .01f)
                    val bounds = bubble.fetchSemanticsNode().boundsInWindow
                    val offset = (7 * compose.activity.resources.displayMetrics.density).toInt()
                    val pixel = image.getPixel(bounds.left.toInt() + offset, bounds.top.toInt() + offset)
                    val expected = (if (mine) Color(0xff333b48) else Color(0xff232832)).toArgb()
                    for (shift in listOf(0, 8, 16)) assertTrue("Bubble background pixels", kotlin.math.abs(((expected shr shift) and 255) - ((pixel shr shift) and 255)) <= 3)
                } finally { image.recycle() }
                if (mine) {
                    bubble.performClick()
                    compose.onNodeWithText("Copy message").assertIsDisplayed().performClick()
                    val clipboard = context.getSystemService(android.content.ClipboardManager::class.java)
                    assertEquals(message.body, clipboard.primaryClip?.getItemAt(0)?.text?.toString())
                    clipboard.clearPrimaryClip()
                }
            }
            result.put("bothBubbleRolesAndOriginalFont", true).put("loanAndProfileCallbacks", true)
            capture("private-$suffix")
            val composer = compose.onNode(hasSetTextAction() and hasContentDescription("Write a message"))
            compose.onNodeWithContentDescription("Find messages").performClick()
            compose.onNodeWithContentDescription("Search loaded messages").performTextReplacement("Android QA pickup coordination")
            compose.onNodeWithText("1 matching loaded messages").assertIsDisplayed()
            androidx.test.espresso.Espresso.closeSoftKeyboard()
            compose.onNodeWithContentDescription("Close search").performClick()
            compose.onNodeWithText("Plan pickup").performClick()
            composer.assertTextContains("When and where works for pickup?")
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
            compose.onNodeWithText("Start the conversation").assertIsDisplayed()
            assertTrue(compose.onAllNodesWithTag("chat-loan-link").fetchSemanticsNodes().isEmpty())
            compose.onNodeWithText("Community channel").assertIsDisplayed(); capture("empty-thread-$suffix")
            compose.runOnIdle { room = args.getString("qaCommunityId")!! }
            connected(); compose.onNodeWithText("Community channel").assertIsDisplayed(); capture("community-$suffix")
            compose.runOnIdle { room = null; showEmptyList = true }
            ready("chat-empty-list"); compose.onNodeWithText("No conversations yet").assertIsDisplayed(); capture("empty-list-$suffix")
            result.put("emptyThread", true).put("emptyList", true).put("community", true)
            context.filesDir.resolve("native-chat-presentation-$suffix.json").writeText(result.toString(2))
        } catch (failure: Throwable) {
            context.filesDir.resolve("native-chat-presentation-partial-$suffix.json").writeText(result.toString(2))
            runCatching { capture("presentation-failure-$suffix") }
            throw failure
        } finally { runBlocking { repository.signOut() } }
    }
}
