package `in`.borrowbuddy.android.ui

import `in`.borrowbuddy.android.domain.Loan
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class DashboardPresentationTest {
    private val today = LocalDate.of(2026, 10, 16)
    private fun loan(status: String, due: String) = Loan("loan", "request", "item", "owner", "borrower", "2026-10-15", due, status)
    @Test fun overdueAndDueTodayTakePriorityOverPickupState() {
        assertEquals(DashboardTone.Danger, dashboardTone(loan("awaiting_pickup", "2026-10-15"), today))
        assertEquals(DashboardTone.Warn, dashboardTone(loan("awaiting_pickup", "2026-10-16"), today))
        assertEquals(DashboardTone.Info, dashboardTone(loan("awaiting_pickup", "2026-10-17"), today))
        assertEquals(DashboardTone.Danger, dashboardTone(loan("overdue", "2026-10-17"), today))
        assertEquals(DashboardTone.Active, dashboardTone(loan("return_pending", "2026-10-17"), today))
    }
    @Test fun greetingChangesAtTheSourceHourBoundaries() {
        listOf(0 to "LATE SHIFT", 4 to "LATE SHIFT", 5 to "GOOD MORNING", 11 to "GOOD MORNING",
            12 to "GOOD AFTERNOON", 16 to "GOOD AFTERNOON", 17 to "GOOD EVENING", 23 to "GOOD EVENING")
            .forEach { (hour, label) -> assertEquals(label, dashboardGreeting(hour)) }
    }
}
