package `in`.borrowbuddy.android.ui

import `in`.borrowbuddy.android.domain.Message
import `in`.borrowbuddy.android.domain.Profile
import org.junit.Assert.*
import org.junit.Test

class ChatHistoryTest {
    private fun row(id: String, time: String = "2026-10-15T10:00:00Z") = Message(id, "room", "sender", id, created_at = time)

    @Test fun overlappingTailAndRealtimeEchoKeepLoadedHistoryAndSender() {
        val sender = Profile(id = "sender", full_name = "Student")
        val history = (1..150).map { row(it.toString().padStart(3, '0')).copy(sender = sender) }
        val merged = mergeThreadMessages(history, history.takeLast(100).map { it.copy(sender = null) } + row("151"))
        assertEquals(151, merged.size)
        assertEquals("001", merged.first().id)
        assertEquals(sender, merged[149].sender)
        assertEquals(merged, mergeThreadMessages(merged, listOf(row("151"))))
    }

    @Test fun timestampOffsetsAndIdTiesHaveStableChronologicalOrder() {
        val rows = listOf(row("b", "2026-10-15T11:00:00+01:00"), row("a"), row("c", "2026-10-15T09:59:59Z"))
        assertEquals(listOf("c", "a", "b"), mergeThreadMessages(emptyList(), rows).map { it.id })
    }
}
