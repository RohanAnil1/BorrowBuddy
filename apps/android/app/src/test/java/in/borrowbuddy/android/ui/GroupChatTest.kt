package `in`.borrowbuddy.android.ui

import `in`.borrowbuddy.android.domain.ChatInboxRow
import `in`.borrowbuddy.android.domain.Message
import `in`.borrowbuddy.android.domain.MessageReactions
import `in`.borrowbuddy.android.domain.Profile
import `in`.borrowbuddy.android.domain.toSummary
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class GroupChatTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun reactionsToggleOnAndOffLikeTheServer() {
        val thumbs = MessageReactions.first()
        val on = toggledReactions(emptyMap(), thumbs, "me")
        assertEquals(mapOf(thumbs to listOf("me")), on)
        val shared = toggledReactions(mapOf(thumbs to listOf("you")), thumbs, "me")
        assertEquals(listOf("you", "me"), shared[thumbs])
        assertEquals(mapOf(thumbs to listOf("you")), toggledReactions(shared, thumbs, "me"))
        assertTrue(toggledReactions(on, thumbs, "me").isEmpty())
    }

    @Test fun reactionSetMatchesTheDatabaseWhitelist() {
        assertEquals(listOf("👍", "❤️", "😂", "😮", "😢", "🙏", "🎉"), MessageReactions)
    }

    @Test fun editsDeletesAndReactionsReplaceTheLoadedRowButKeepItsSender() {
        val sender = Profile(id = "s", full_name = "Asha Rao")
        val original = Message("1", "room", "s", "hello", created_at = "2026-11-15T10:00:00Z", sender = sender)
        val edited = original.copy(body = "hello again", edited_at = "2026-11-15T10:01:00Z", sender = null)
        val merged = mergeThreadMessages(listOf(original), listOf(edited))
        assertEquals("hello again", merged.single().body)
        assertEquals(sender, merged.single().sender)
        val deleted = mergeThreadMessages(merged, listOf(edited.copy(body = "", deleted_at = "2026-11-15T10:02:00Z", sender = null)))
        assertNotNull(deleted.single().deleted_at)
        assertEquals(sender, deleted.single().sender)
    }

    @Test fun realtimeRowsDecodeWithAndWithoutTheNewColumns() {
        val old = json.decodeFromString(Message.serializer(), """{"id":"1","conversation_id":"c","sender_id":"s","body":"hi","created_at":"2026-11-15T10:00:00Z"}""")
        assertTrue(old.reactions.isEmpty()); assertNull(old.reply_to_id)
        val new = json.decodeFromString(Message.serializer(), """{"id":"2","conversation_id":"c","sender_id":"s","body":"yo","created_at":"2026-11-15T10:00:00Z",
            "reply_to_id":"1","edited_at":null,"deleted_at":null,"reactions":{"🎉":["a","b"]}}""")
        assertEquals("1", new.reply_to_id); assertEquals(listOf("a", "b"), new.reactions["🎉"])
    }

    @Test fun inboxRowsBecomeSummariesWithCountsAndPreviews() {
        val group = ChatInboxRow("g", "community", title = "Photography club", visibility = "open", is_member = true, member_count = 12,
            unread_count = 4, last_message_id = "m", last_message_body = "Shoot at 5?", last_message_sender_id = "x",
            last_message_sender_name = "Asha Rao", last_message_at = "2026-11-15T10:00:00Z").toSummary("me")
        assertTrue(group.unread); assertEquals(4, group.unreadCount); assertEquals(12, group.memberCount)
        assertEquals("Asha: Shoot at 5?", chatPreview(group))

        val mine = ChatInboxRow("g", "community", title = "Club", last_message_id = "m", last_message_body = "Done",
            last_message_sender_id = "me", last_message_at = "2026-11-15T10:00:00Z").toSummary("me")
        assertEquals("You: Done", chatPreview(mine))

        val joinable = ChatInboxRow("o", "community", title = "Hostel B", visibility = "open", is_member = false, member_count = 1).toSummary("me")
        assertFalse(joinable.isMember); assertFalse(joinable.unread)
        assertEquals("Open group · 1 member", chatPreview(joinable))

        val loan = ChatInboxRow("l", "private", loan_id = "loan", counterpart_name = "Ravi K", last_message_id = "m", last_message_body = "",
            last_message_deleted = true, last_message_sender_id = "x", last_message_at = "2026-11-15T10:00:00Z").toSummary("me")
        assertEquals("Ravi K", loan.title); assertNull(loan.memberCount)
        assertEquals("Message deleted", chatPreview(loan))
    }

    @Test fun groupKindsAndQuotes() {
        assertEquals("Invite-only group · 3 members", groupKind("invite", false, 3))
        assertEquals("Archived group", groupKind("open", true, null))
        assertEquals("Earlier message" to "", quotePreview(null, "me"))
        val quoted = Message("1", "c", "me", "line one\n  line two", created_at = "2026-11-15T10:00:00Z")
        assertEquals("You" to "line one line two", quotePreview(quoted, "me"))
        assertEquals("Message deleted", quotePreview(quoted.copy(body = "", deleted_at = "x"), "me").second)
    }

    @Test fun groupStateDecidesWhoCanPostOrJoin() {
        assertTrue(ChatUiState(community = true, isMember = true).canPost)
        assertFalse(ChatUiState(community = true, isMember = true, archived = true).canPost)
        assertTrue(ChatUiState(community = true, isMember = false).canJoin)
        assertFalse(ChatUiState(community = true, isMember = false, archived = true).canJoin)
        assertTrue(ChatUiState(community = false).canPost)
    }
}
