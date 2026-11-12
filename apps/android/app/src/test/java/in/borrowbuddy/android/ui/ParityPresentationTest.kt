package `in`.borrowbuddy.android.ui

import `in`.borrowbuddy.android.domain.Item
import `in`.borrowbuddy.android.domain.ItemSort
import `in`.borrowbuddy.android.domain.Loan
import `in`.borrowbuddy.android.domain.ProfileStats
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class ParityPresentationTest {
    private val today = LocalDate.of(2026, 11, 13)
    private fun loan(id: String, borrower: String, status: String, due: String, start: String = "2026-11-10", maxDays: Int = 14) =
        Loan(id, "r-$id", "item", "owner", borrower, start, due, status,
            item = Item("item", "owner", "cat", "Tripod", max_loan_days = maxDays))

    @Test fun dueSoonCountsOnlyMyOpenBorrowsWithinTwoDaysOrOverdue() {
        val loans = listOf(
            loan("a", "me", "active", "2026-11-13"),          // due today
            loan("b", "me", "active", "2026-11-15"),          // in two days
            loan("c", "me", "active", "2026-11-16"),          // three days out
            loan("d", "me", "overdue", "2026-11-30"),         // flagged overdue
            loan("e", "me", "returned", "2026-11-12"),        // closed
            loan("f", "someone", "active", "2026-11-13"),     // I'm the owner
        )
        assertEquals(3, dueSoonCount(loans, "me", today))
    }

    @Test fun reputationLineCoversFirstTimersAndRatings() {
        assertEquals("New to lending", reputationLine(ProfileStats(0, 0, null), lender = true))
        assertEquals("First loan on BorrowBuddy", reputationLine(ProfileStats(0, 0, null), lender = false))
        assertEquals("1 completed loan · 5.0★ from 1 review", reputationLine(ProfileStats(1, 1, 5.0), lender = true))
        assertEquals("3 completed loans · 4.5★ from 2 reviews", reputationLine(ProfileStats(3, 2, 4.5), lender = false))
    }

    @Test fun extensionLimitIsTheItemsMaximumFromTheStartDate() {
        assertEquals(LocalDate.of(2026, 11, 16), extensionLimit(loan("a", "me", "active", "2026-11-12", start = "2026-11-10", maxDays = 7)))
        assertEquals(LocalDate.of(2026, 11, 10), extensionLimit(loan("b", "me", "active", "2026-11-10", start = "2026-11-10", maxDays = 1)))
    }

    @Test fun impactNumbersUseIndianGrouping() {
        assertEquals("₹0", impactNumber(0, money = true))
        assertEquals("₹1,25,000", impactNumber(125000, money = true))
        assertEquals("1,234", impactNumber(1234, money = false))
    }

    @Test fun sortKeysMatchTheWebQueryValues() {
        assertEquals(listOf("newest", "deposit_low", "trust"), ItemSort.entries.map { it.key })
    }
}

class IndianGroupingTest {
    @Test fun groupsLakhsAndCrores() {
        assertEquals("999", indianGroup(999))
        assertEquals("1,000", indianGroup(1000))
        assertEquals("12,34,567", indianGroup(1234567))
        assertEquals("1,00,00,000", indianGroup(10000000))
    }
}
