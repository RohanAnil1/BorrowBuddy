package `in`.borrowbuddy.android.domain

import `in`.borrowbuddy.android.data.checkedCampusResult
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class CampusRulesTest {
    @Test fun expiryBoundaryIsExclusiveAndTerminalStatesNeverReopen() {
        val deadline = Instant.parse("2026-10-27T12:00:00Z")
        val hold = CampusTransfer("transfer", "post", "host", "recipient", "active", expires_at = deadline.toString())
        assertTrue(hold.active(deadline.minusNanos(1))); assertFalse(hold.active(deadline)); assertFalse(hold.active(deadline.plusNanos(1)))
        for (status in listOf("completed", "cancelled", "expired")) assertFalse(hold.copy(status = status).active(deadline.minusSeconds(60)))
        assertTrue(hold.copy(expires_at = null).active(deadline.plusSeconds(3600)))
    }
    @Test fun badConfirmationResultCannotBecomeSuccessJustBecauseHttpSucceeded() {
        try { checkedCampusResult(buildJsonObject { put("ok", false); put("error", "Five attempts used. Generate a new code.") }); fail("Must reject failed confirmation") }
        catch (expected: IllegalStateException) { assertTrue(expected.message!!.contains("Five attempts")) }
        assertTrue(checkedCampusResult(buildJsonObject { put("ok", true); put("id", "transfer") }).getValue("ok").jsonPrimitive.boolean)
        assertEquals("transfer", checkedCampusResult(buildJsonObject { put("id", "transfer") }).getValue("id").jsonPrimitive.content)
    }
    @Test fun schedulesAllowBlockedOverridesButRejectDuplicateDaysAndReversedWindows() {
        assertNull(CampusRules.windowError(listOf(CampusWindow(day = 1, start = "17:00", end = "19:00"))))
        assertNull(CampusRules.windowError(listOf(CampusWindow(date = "2026-10-28", blocked = true)), true))
        assertNotNull(CampusRules.windowError(listOf(CampusWindow(day = 1, start = "19:00", end = "17:00"))))
        assertNotNull(CampusRules.windowError(listOf(CampusWindow(day = 0, start = "17:00", end = "19:00"), CampusWindow(day = 0, start = "18:00", end = "20:00"))))
        assertNotNull(CampusRules.windowError(listOf(CampusWindow(date = "invalid", blocked = true)), true))
    }
    @Test fun messageCatchupDeduplicatesWithoutChangingCaseNewlinesOrChronology() {
        val first = CampusMessage("a", "t", "u", "c", "Original Case\nSecond line", "2026-10-27T10:00:00Z")
        val second = first.copy(id = "b", client_id = "d", created_at = "2026-10-27T10:01:00Z")
        assertEquals(listOf(first, second), CampusRules.mergeMessages(listOf(second), listOf(first, second)))
        assertEquals("Original Case\nSecond line", CampusRules.mergeMessages(listOf(first), listOf(first)).single().body)
    }
    @Test fun postRulesRetainRequiredPhotosPrivateNotesAndAllHoldDurations() {
        for (hold in listOf(24, 48, 72)) assertNull(CampusRules.postError("Textbooks", "Three textbooks in good condition.", "Library", listOf("photo"), "giveaway", "", "", "good", hold))
        assertNotNull(CampusRules.postError("Wallet", "Found near the library desk.", "Library", emptyList(), "found", CampusRules.today().toString(), "Private mark", "", 48))
        assertNotNull(CampusRules.postError("Wallet", "Found near the library desk.", "Library", listOf("photo"), "found", CampusRules.today().toString(), "", "", 48))
        assertNotNull(CampusRules.postError("Wallet", "Found near the library desk.", "Library", listOf("photo"), "found", CampusRules.today().plusDays(1).toString(), "Private mark", "", 48))
        assertTrue(CampusRules.date("2026-10-27T20:00:00Z").contains("28 Oct 2026, 1:30 AM IST"))
    }
}
