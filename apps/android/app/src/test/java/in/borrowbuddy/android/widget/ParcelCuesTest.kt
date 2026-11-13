package `in`.borrowbuddy.android.widget

import `in`.borrowbuddy.android.data.BuddyMood
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

class ParcelCuesTest {
    private val now = ZonedDateTime.of(LocalDate.parse("2026-11-13").atTime(10, 0), ZoneId.of("Asia/Kolkata"))
    private val id = "7f3a21c4-0000-4000-8000-000000000000"
    private fun loan(due: String, lending: Boolean = false, status: String = "active") =
        WidgetLoan(id, "Canon EOS 1500D", due, status, lending, "PRIYA S.")
    private fun ready(loan: WidgetLoan? = null, requests: Int = 0, chats: Int = 0, fines: Int = 0, offline: Boolean = false) =
        WidgetSnapshot(WidgetState.Ready, "Asha", loan, pendingRequests = requests, unreadChats = chats, finesOwed = fines, syncedAt = 1, offline = offline)
    private fun cue(snapshot: WidgetSnapshot) = ParcelCues.cue(snapshot, now)

    @Test fun sleepsWhenSignedOutAndThinksWhileTheIdIsChecked() {
        assertEquals(ParcelCue(BuddyMood.Sleepy, "[ SIGNED OUT ]", "WAKE ME UP", "Sign in and I'll watch your loans.", DueTone.Soon, null),
            cue(WidgetSnapshot()))
        val pending = cue(WidgetSnapshot(WidgetState.Unverified, "Asha"))
        assertEquals(BuddyMood.Thinking, pending.mood)
        assertEquals("HANG TIGHT, ASHA", pending.headline)
        assertEquals(null, pending.route)
    }

    @Test fun overdueBeatsEverythingElse() {
        val late = cue(ready(loan("2026-11-12", status = "overdue"), requests = 3, fines = 40))
        assertEquals(BuddyMood.Confused, late.mood)
        assertEquals("[ OVERDUE 1 DAY ]", late.label)
        assertEquals("TIME TO RETURN IT", late.headline)
        assertEquals("Canon EOS 1500D · FROM PRIYA S.", late.detail)
        assertEquals(DueTone.Late, late.tone)
        assertEquals("loans/$id", late.route)
        assertEquals("IT'S NOT BACK YET", cue(ready(loan("2026-11-12", lending = true))).headline)
    }

    @Test fun aHandoverThatHasNotHappenedIsNotOverdue() {
        val pickup = cue(ready(loan("2026-11-12", status = "awaiting_pickup")))
        assertEquals(BuddyMood.Wave, pickup.mood)
        assertEquals("[ AWAITING PICKUP ]", pickup.label)
        assertEquals("GO PICK IT UP", pickup.headline)
        assertEquals(DueTone.Soon, pickup.tone)
        assertEquals("TIME TO HAND IT OVER", cue(ready(loan("2026-11-20", lending = true, status = "awaiting_pickup"))).headline)
        assertEquals(DueCountdown("--", "TO COLLECT", "[ AWAITING PICKUP ]", DueTone.Soon),
            WidgetFormat.countdown(loan("2026-11-12", status = "awaiting_pickup"), now))
        assertEquals("[ DUE IN 7 DAYS ]", WidgetFormat.countdown(loan("2026-11-20", status = "awaiting_pickup"), now)?.bracket)
    }

    @Test fun wavesWhenAReturnIsClose() {
        val soon = cue(ready(loan("2026-11-14"), chats = 2))
        assertEquals(BuddyMood.Wave, soon.mood)
        assertEquals("[ DUE TOMORROW ]", soon.label)
        assertEquals("HEADS UP!", soon.headline)
    }

    @Test fun finesThenNewsThenCalm() {
        val fine = cue(ready(loan("2026-11-20"), requests = 1, fines = 150000))
        assertEquals(BuddyMood.Confused, fine.mood)
        assertEquals("YOU OWE ₹1,50,000", fine.headline)
        assertEquals(WidgetRoutes.FINES, fine.route)

        val requests = cue(ready(loan("2026-11-20"), requests = 2, chats = 1))
        assertEquals(BuddyMood.Found, requests.mood)
        assertEquals("[ 03 NEW ]", requests.label)
        assertEquals("SOMEONE WANTS YOUR STUFF", requests.headline)
        assertEquals("02 REQ · 01 MSG", requests.detail)
        assertEquals(WidgetRoutes.REQUESTS, requests.route)
        assertEquals(WidgetRoutes.CHATS, cue(ready(chats = 1)).route)

        val calm = cue(ready(loan("2026-11-20")))
        assertEquals(BuddyMood.Idle, calm.mood)
        assertEquals("[ DUE IN 7 DAYS ]", calm.label)
        assertEquals("ALL ON TRACK", calm.headline)
    }

    @Test fun happyWhenNothingIsDue() {
        assertEquals(ParcelCue(BuddyMood.Happy, "[ ALL CLEAR ]", "ALL CLEAR, ASHA", "Find something to borrow.", DueTone.Calm, WidgetRoutes.BROWSE),
            cue(ready()))
    }

    @Test fun offlineKeepsTheMessageButShowsNoSignal() {
        val offline = cue(ready(loan("2026-11-12"), offline = true))
        assertEquals(BuddyMood.Offline, offline.mood)
        assertEquals("TIME TO RETURN IT", offline.headline)
        assertEquals(BuddyMood.Sleepy, cue(WidgetSnapshot(offline = true)).mood)
    }
}
