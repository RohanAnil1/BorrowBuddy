package `in`.borrowbuddy.android.widget

import `in`.borrowbuddy.android.domain.Fine
import `in`.borrowbuddy.android.domain.Item
import `in`.borrowbuddy.android.domain.Loan
import `in`.borrowbuddy.android.domain.Profile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

class WidgetModelTest {
    private val campus = ZoneId.of("Asia/Kolkata")
    private fun at(date: String, hour: Int, minute: Int = 0) = ZonedDateTime.of(LocalDate.parse(date).atTime(hour, minute), campus)
    private fun due(date: String, status: String = "active", now: ZonedDateTime) = WidgetFormat.countdown(LocalDate.parse(date), status, now)

    @Test fun countsWholeCampusDaysAhead() {
        assertEquals(DueCountdown("05", "DAYS LEFT", "[ DUE IN 5 DAYS ]", DueTone.Calm), due("2026-11-18", now = at("2026-11-13", 9)))
        assertEquals(DueCountdown("02", "DAYS LEFT", "[ DUE IN 2 DAYS ]", DueTone.Soon), due("2026-11-15", now = at("2026-11-13", 23, 50)))
        assertEquals(DueCountdown("01", "DAY LEFT", "[ DUE TOMORROW ]", DueTone.Soon), due("2026-11-14", now = at("2026-11-13", 0, 5)))
    }

    @Test fun dueTodayCountsHoursThenMinutesToCampusMidnight() {
        assertEquals(DueCountdown("14", "HOURS LEFT", "[ DUE TODAY ]", DueTone.Soon), due("2026-11-13", now = at("2026-11-13", 9, 30)))
        assertEquals("HOUR LEFT", due("2026-11-13", now = at("2026-11-13", 22, 30)).unit)
        assertEquals(DueCountdown("44", "MIN LEFT", "[ DUE TODAY ]", DueTone.Soon), due("2026-11-13", now = at("2026-11-13", 23, 15)))
        assertEquals("01", due("2026-11-13", now = at("2026-11-13", 23, 59)).figure)
    }

    @Test fun usesCampusDateEvenWhenThePhoneIsElsewhere() {
        // 20:00 UTC on the 13th is already 01:30 on the 14th in Kolkata.
        val utcEvening = ZonedDateTime.of(LocalDate.parse("2026-11-13").atTime(20, 0), ZoneId.of("UTC"))
        assertEquals("[ DUE TODAY ]", due("2026-11-14", now = utcEvening).bracket)
    }

    @Test fun overdueCountsDaysLateAndTrustsTheServerStatus() {
        assertEquals(DueCountdown("01", "DAY LATE", "[ OVERDUE 1 DAY ]", DueTone.Late), due("2026-11-12", now = at("2026-11-13", 8)))
        assertEquals(DueCountdown("03", "DAYS LATE", "[ OVERDUE 3 DAYS ]", DueTone.Late), due("2026-11-10", now = at("2026-11-13", 8)))
        assertEquals(DueTone.Late, due("2026-11-13", status = "overdue", now = at("2026-11-13", 8)).tone)
    }

    @Test fun badDueDateGivesNoCountdown() {
        assertNull(WidgetFormat.countdown(WidgetLoan("l", "Lamp", "soon", "active", false), at("2026-11-13", 8)))
    }

    @Test fun talliesAndMoney() {
        assertEquals(listOf("00", "00", "07", "42", "99", "99+"), listOf(-1, 0, 7, 42, 99, 120).map(WidgetFormat::tally))
        assertEquals("₹0", WidgetFormat.rupees(-5))
        assertEquals("₹1,50,000", WidgetFormat.rupees(150_000))
        assertEquals(listOf("₹840", "₹1K", "₹1.5K", "₹9.9K", "₹12K"), listOf(840, 1000, 1500, 9_950, 12_400).map(WidgetFormat::compactRupees))
    }

    @Test fun freshnessLabels() {
        val now = 1_000_000_000_000L
        assertEquals("NOT SYNCED", WidgetFormat.freshness(0, false, now))
        assertEquals("SYNCED NOW", WidgetFormat.freshness(now - 30_000, false, now))
        assertEquals("SYNCED 5M AGO", WidgetFormat.freshness(now - 5 * 60_000, false, now))
        assertEquals("OFFLINE · 3H AGO", WidgetFormat.freshness(now - 3 * 3_600_000, true, now))
        assertEquals("SYNCED 2D AGO", WidgetFormat.freshness(now - 49 * 3_600_000L, false, now))
        assertEquals("SYNCED NOW", WidgetFormat.freshness(now + 60_000, false, now))
    }

    @Test fun namesCodesAndStamps() {
        assertEquals("PRIYA S.", WidgetFormat.shortName("  Priya   Sharma Rao "))
        assertEquals("ARJUN", WidgetFormat.shortName("Arjun"))
        assertEquals("A STUDENT", WidgetFormat.shortName(null))
        assertEquals("BB-7F3A21", WidgetFormat.code("7f3a21c4-0000-4000-8000-000000000000"))
        assertEquals("15 NOV", WidgetFormat.stamp("2026-11-15"))
        val lending = WidgetLoan("l", "Lamp", "2026-11-15", "active", lending = true, counterpart = "RIYA K.")
        assertEquals("[ LENDING ]", WidgetFormat.role(lending))
        assertEquals("TO RIYA K.", WidgetFormat.route(lending))
        assertEquals("FROM A STUDENT", WidgetFormat.route(lending.copy(lending = false, counterpart = "")))
    }

    @Test fun smallFooterShowsTheTwoMostUrgentCounts() {
        assertEquals("NO NEW ACTIVITY", WidgetFormat.smallTally(WidgetSnapshot()))
        assertEquals("02 REQ · 01 MSG", WidgetFormat.smallTally(WidgetSnapshot(pendingRequests = 2, unreadChats = 1)))
        assertEquals("₹40 FINE · 02 REQ", WidgetFormat.smallTally(WidgetSnapshot(pendingRequests = 2, unreadChats = 1, finesOwed = 40)))
    }

    private val me = "me"
    private fun loan(id: String, due: String, status: String = "active", borrower: String = me, owner: String = "them") =
        Loan(id = id, request_id = "r$id", item_id = "i$id", owner_id = owner, borrower_id = borrower, start_date = "2026-11-01",
            due_date = due, status = status, item = Item(id = "i$id", owner_id = owner, category_id = "c", title = "Item $id"),
            owner = Profile(owner, full_name = "Owner Person"), borrower = Profile(borrower, full_name = "Borrow Er"))

    @Test fun nextLoanIsTheOpenOneDueFirst() {
        val loans = listOf(
            loan("a", "2026-11-20"),
            loan("b", "2026-11-14", status = "returned"),
            loan("c", "2026-11-16", borrower = "them", owner = me),
            loan("d", "2026-11-18", status = "awaiting_pickup"),
        )
        val next = WidgetData.nextLoan(loans, me)!!
        assertEquals("c", next.id)
        assertEquals(true, next.lending)
        assertEquals("BORROW E.", next.counterpart)
        assertEquals(3, WidgetData.openLoans(loans))
    }

    @Test fun overdueLeadsAndBorrowingWinsATie() {
        assertEquals("o", WidgetData.nextLoan(listOf(loan("a", "2026-11-01"), loan("o", "2026-11-09", status = "overdue")), me)!!.id)
        val tie = listOf(loan("lend", "2026-11-15", borrower = "them", owner = me), loan("borrow", "2026-11-15"))
        val next = WidgetData.nextLoan(tie, me)!!
        assertEquals("borrow", next.id)
        assertEquals("OWNER P.", next.counterpart)
        assertEquals("Item borrow", next.title)
    }

    @Test fun noOpenLoansMeansNothingFeatured() {
        assertNull(WidgetData.nextLoan(listOf(loan("x", "2026-11-15", status = "cancelled")), me))
        assertNull(WidgetData.nextLoan(listOf(loan("y", "2026-11-15", borrower = "a", owner = "b")), me))
    }

    @Test fun onlyPendingFinesCount() {
        val fines = listOf(
            Fine("1", "l", me, 40, "late", "Late", "pending"),
            Fine("2", "l", me, 60, "late", "Late", "pending"),
            Fine("3", "l", me, 500, "damage", "Damage", "paid"),
        )
        assertEquals(2 to 100, WidgetData.pendingFines(fines))
    }

    @Test fun routesAreAllowListed() {
        val id = "7f3a21c4-0000-4000-8000-000000000000"
        assertEquals("loans/$id", WidgetRoutes.accept(WidgetRoutes.loan(id)))
        listOf("home", "chat", "my/items", "fines", "dashboard").forEach { assertEquals(it, WidgetRoutes.accept(it)) }
        listOf(null, "", "admin", "loans/../admin", "loans/x", "home?spot=evil", "users/$id").forEach { assertNull(it, WidgetRoutes.accept(it)) }
    }
}
