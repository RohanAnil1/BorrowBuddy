package `in`.borrowbuddy.android

import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.input.key.Key
import androidx.lifecycle.Lifecycle
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.ui.*
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URI

/** Remote writes use a second normal password session, never the app's session or service role. */
class HostedChatTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun number(key: SemanticsPropertyKey<Int>) = compose.onNode(SemanticsMatcher.keyIsDefined(ChatConnected)).fetchSemanticsNode().config[key]
    private fun waitFor(timeout: Long = 30_000, condition: () -> Boolean) {
        try { compose.waitUntil(timeout, condition) }
        catch (failure: Throwable) {
            val state = compose.onAllNodes(SemanticsMatcher.keyIsDefined(ChatConnected)).fetchSemanticsNodes().firstOrNull()?.config
            android.util.Log.i("BorrowBuddyQa", "Chat timeout: connected=${state?.get(ChatConnected)}, count=${state?.get(ChatMessageCount)}, connections=${state?.get(ChatConnections)}, events=${state?.get(ChatEvents)}")
            android.util.Log.i("BorrowBuddyQa", "Chat screen: browse=${text("BROWSE")}, auth=${text("WELCOME BACK")}, landing=${text("▶ START BORROWING")}")
            runCatching {
                android.util.Log.i("BorrowBuddyQa", compose.onNodeWithContentDescription("Send message").printToString())
                android.util.Log.i("BorrowBuddyQa", compose.onNode(hasSetTextAction() and hasContentDescription("Write a message")).printToString())
                val bitmap = compose.onRoot().captureToImage()
                val pixels = IntArray(bitmap.width * bitmap.height); bitmap.readPixels(pixels)
                val native = android.graphics.Bitmap.createBitmap(pixels, bitmap.width, bitmap.height, android.graphics.Bitmap.Config.ARGB_8888)
                try {
                    java.io.File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir, "native-chat-timeout.png").outputStream().use {
                        native.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                    }
                } finally { native.recycle() }
            }
            throw failure
        }
    }
    private fun text(value: String) = compose.onAllNodesWithText(value).fetchSemanticsNodes().isNotEmpty()
    private fun message(value: String) = compose.onAllNodes(hasText(chatText(value)) and hasSetTextAction().not()).fetchSemanticsNodes().isNotEmpty()
    private fun connected() = compose.onAllNodes(SemanticsMatcher.expectValue(ChatConnected, true)).fetchSemanticsNodes().isNotEmpty()
    private fun incoming(body: String, previous: Int) {
        val deadline = System.nanoTime() + 12_000_000_000L
        while (System.nanoTime() < deadline) {
            compose.mainClock.advanceTimeByFrame()
            if (message(body) && number(ChatEvents) > previous) return
            Thread.sleep(50)
        }
        val state = compose.onNode(SemanticsMatcher.keyIsDefined(ChatConnected)).fetchSemanticsNode().config
        val diagnostic = JSONObject().put("connected", state[ChatConnected]).put("eventsBefore", previous)
            .put("eventsAfter", state[ChatEvents]).put("connections", state[ChatConnections])
            .put("messageCount", state[ChatMessageCount]).put("expectedMessageVisible", message(body))
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        context.filesDir.resolve("native-chat-realtime-timeout.json").writeText(diagnostic.toString(2))
        android.util.Log.i("BorrowBuddyQa", "Realtime deadline: $diagnostic")
        compose.onRoot().captureToImage().asAndroidBitmap().let { bitmap ->
            context.filesDir.resolve("native-chat-realtime-timeout.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        }
        fail("Incoming message must arrive through the filtered realtime stream within 12 seconds: $diagnostic")
    }

    @Test fun historyRealtimeLifecycleAndCommunityReadTracking() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Hosted chat requires isolated QA credentials and fixtures", listOf("qaEmail", "qaPassword", "qaOwnerEmail", "qaConversationId", "qaCommunityId", "qaEarliestId", "qaBorrowerId").all { !args.getString(it).isNullOrBlank() })
        val email = requireNotNull(args.getString("qaEmail"))
        val password = requireNotNull(args.getString("qaPassword"))
        val privateId = requireNotNull(args.getString("qaConversationId"))
        val communityId = requireNotNull(args.getString("qaCommunityId"))
        val earliestId = requireNotNull(args.getString("qaEarliestId"))
        val borrowerId = requireNotNull(args.getString("qaBorrowerId"))
        val actor = Actor(requireNotNull(args.getString("qaOwnerEmail")), password)
        val repository = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as BorrowBuddyApplication).repository
        try {
            waitFor { text("▶ START BORROWING") }
            compose.onNodeWithText("▶ START BORROWING").performClick()
            compose.onNode(hasSetTextAction() and hasText("BENNETT EMAIL")).performTextInput(email)
            compose.onNode(hasSetTextAction() and hasText("PASSWORD")).performTextInput(password)
            compose.onAllNodesWithText("SIGN IN").onLast().performClick()
            waitFor { compose.onAllNodesWithText("CHAT", substring = true).fetchSemanticsNodes().isNotEmpty() }
            compose.onNode(hasText("CHAT", substring = true) and hasClickAction()).performClick()
            waitFor { compose.onAllNodesWithTag("conversation-$privateId").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("conversation-$privateId").assert(hasText("ANDROID QA PICKUP COORDINATION", substring = true))
            compose.onNodeWithTag("conversation-$privateId").performClick()
            waitFor { connected() }
            assertEquals(100, number(ChatMessageCount))
            compose.onNodeWithTag("chat-messages").performScrollToIndex(0)
            compose.onNodeWithText("LOAD OLDER MESSAGES").performClick()
            waitFor { number(ChatMessageCount) == 131 }
            compose.onNodeWithTag("chat-messages").performScrollToKey(earliestId)
            compose.onNodeWithTag("message-$earliestId").assertIsDisplayed()
            compose.activityRule.scenario.recreate()
            waitFor { connected() && number(ChatMessageCount) == 131 }
            compose.onNodeWithTag("message-$earliestId").assertIsDisplayed()
            val composer = hasSetTextAction() and hasContentDescription("Write a message")
            compose.onNode(composer).performTextInput("  Native chat IME message  ")
            compose.onNode(composer).performImeAction()
            waitFor { message("Native chat IME message") }
            compose.onNode(composer).performTextInput("Native chat button\nsecond line")
            compose.onNodeWithContentDescription("Send message").performClick()
            waitFor { message("Native chat button\nsecond line") }
            compose.onNode(composer).performClick().performTextReplacement("Native keyboard first line")
            compose.onNode(composer).performKeyInput { keyDown(Key.ShiftLeft); pressKey(Key.Enter); keyUp(Key.ShiftLeft) }
            compose.onNode(composer).performTextInput("second line")
            compose.onNode(composer).assertTextContains("Native keyboard first line\nsecond line")
            compose.onNode(composer).performKeyInput { pressKey(Key.Enter) }
            waitFor { message("Native keyboard first line\nsecond line") }
            val persisted = actor.rows(privateId)
            assertEquals(1, (0 until persisted.length()).count { persisted.getJSONObject(it).getString("body") == "Native chat IME message" })
            assertEquals(1, (0 until persisted.length()).count { persisted.getJSONObject(it).getString("body") == "Native chat button\nsecond line" })
            assertEquals(1, (0 until persisted.length()).count { persisted.getJSONObject(it).getString("body") == "Native keyboard first line\nsecond line" })

            compose.mainClock.autoAdvance = false
            val events = number(ChatEvents)
            actor.send(communityId, "Wrong room must stay filtered")
            actor.send(privateId, "Remote owner realtime message")
            incoming("Remote owner realtime message", events)
            assertFalse(message("Wrong room must stay filtered"))
            assertEquals(135, number(ChatMessageCount))
            compose.mainClock.autoAdvance = true
            compose.onNode(composer).performTextInput("Unsent draft survives rotation")
            val connections = number(ChatConnections)
            compose.activityRule.scenario.recreate()
            waitFor { connected() && number(ChatConnections) > connections }
            waitFor { compose.onAllNodes(SemanticsMatcher.expectValue(PortalConnected, true)).fetchSemanticsNodes().isNotEmpty() }
            compose.onNode(composer).assertTextContains("Unsent draft survives rotation")
            assertEquals(135, number(ChatMessageCount))
            compose.onNodeWithTag("chat-messages").performScrollToKey(earliestId)
            compose.onNodeWithTag("message-$earliestId").assertIsDisplayed()

            compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
            val cursor = actor.cursor(privateId, borrowerId)
            actor.send(privateId, "Message while app is stopped")
            Thread.sleep(1_500)
            assertEquals("A stopped chat must not mark remote messages as read", cursor, actor.cursor(privateId, borrowerId))
            compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
            waitFor { connected() && number(ChatMessageCount) == 136 }
            compose.onNodeWithTag("chat-messages").performScrollToIndex(135)
            compose.onNodeWithText("MESSAGE WHILE APP IS STOPPED").assertIsDisplayed()
            compose.onNode(composer).assertTextContains("Unsent draft survives rotation")
            assertTrue(actor.cursor(privateId, borrowerId) != cursor)

            val rejoined = number(ChatConnections)
            runBlocking { repository.client.realtime.disconnect() }
            waitFor(45_000) { connected() && number(ChatConnections) > rejoined }
            waitFor { compose.onAllNodes(SemanticsMatcher.expectValue(PortalConnected, true)).fetchSemanticsNodes().isNotEmpty() }
            compose.mainClock.autoAdvance = false
            val afterReconnect = number(ChatEvents)
            actor.send(privateId, "Remote message after socket reconnect")
            incoming("Remote message after socket reconnect", afterReconnect)
            assertEquals(137, number(ChatMessageCount))
            compose.mainClock.autoAdvance = true

            compose.onNodeWithContentDescription("Back to chats").performClick()
            waitFor { compose.onAllNodesWithTag("conversation-$communityId").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("conversation-$communityId").performClick()
            waitFor { connected() }
            waitFor { repository.client.realtime.subscriptions.keys.count { it.contains("android-chat-") } == 1 }
            assertFalse(repository.client.realtime.subscriptions.keys.any { it.contains("android-chat-$privateId-") })
            compose.onNode(composer).performTextInput("Community message from native UI")
            compose.onNode(composer).assertTextContains("Community message from native UI")
            androidx.test.espresso.Espresso.closeSoftKeyboard()
            compose.waitForIdle()
            compose.onNodeWithContentDescription("Send message").assertIsEnabled().assertIsDisplayed().performClick()
            waitFor { message("Community message from native UI") }
            val communityRows = actor.rows(communityId)
            assertEquals(1, (0 until communityRows.length()).count { communityRows.getJSONObject(it).getString("body") == "Community message from native UI" })
            assertTrue("Opening a community channel creates only this reader's cursor", runBlocking { repository.members(communityId) }.any { it.user_id == borrowerId && it.last_read_at != null })
            waitFor { !runBlocking { repository.conversationSummaries(borrowerId) }.first { it.conversation.id == communityId }.unread }
            compose.onRoot().captureToImage().let { bitmap ->
                val file = java.io.File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir, "native-chat-community.png")
                val androidBitmap = android.graphics.Bitmap.createBitmap(bitmap.width, bitmap.height, android.graphics.Bitmap.Config.ARGB_8888)
                val pixels = IntArray(bitmap.width * bitmap.height)
                bitmap.readPixels(pixels); androidBitmap.setPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
                file.outputStream().use { androidBitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
                androidBitmap.recycle()
            }
        } finally { compose.mainClock.autoAdvance = true; runBlocking { repository.signOut() } }
    }

    private class Actor(email: String, password: String) {
        private var token = ""
        private val id: String
        init {
            val session = JSONObject(request("/auth/v1/token?grant_type=password", "POST", JSONObject().put("email", email).put("password", password)))
            token = session.getString("access_token"); id = session.getJSONObject("user").getString("id")
        }
        fun send(room: String, body: String) { request("/rest/v1/messages", "POST", JSONObject().put("conversation_id", room).put("sender_id", id).put("body", body)) }
        fun rows(room: String) = JSONArray(request("/rest/v1/messages?conversation_id=eq.$room&select=body", "GET"))
        fun cursor(room: String, user: String): String = JSONArray(request("/rest/v1/conversation_members?conversation_id=eq.$room&user_id=eq.$user&select=last_read_at", "GET")).getJSONObject(0).getString("last_read_at")
        private fun request(path: String, method: String, body: JSONObject? = null): String {
            val connection = URI(BuildConfig.SUPABASE_URL + path).toURL().openConnection() as HttpURLConnection
            try {
                connection.requestMethod = method; connection.connectTimeout = 15_000; connection.readTimeout = 15_000
                connection.setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
                connection.setRequestProperty("Authorization", "Bearer ${token.ifBlank { BuildConfig.SUPABASE_ANON_KEY }}")
                connection.setRequestProperty("Content-Type", "application/json")
                if (body != null) { connection.doOutput = true; connection.outputStream.use { it.write(body.toString().toByteArray()) } }
                assertTrue("Normal QA actor request failed (${connection.responseCode})", connection.responseCode in 200..299)
                return connection.inputStream.bufferedReader().use { it.readText() }
            } finally { connection.disconnect() }
        }
    }
}
