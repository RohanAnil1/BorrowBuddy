package `in`.borrowbuddy.android.domain

import org.junit.Assert.*
import org.junit.Test

class RulesTest {
    @Test fun inclusiveDatesAndOverlapMatchDatabase() {
        val date = Rules.today().plusDays(1)
        assertEquals(1, Rules.dates(date, date).size)
        assertTrue(Rules.overlaps(date, date.plusDays(2), date.plusDays(2), date.plusDays(4)))
        assertFalse(Rules.overlaps(date, date.plusDays(1), date.plusDays(2), date.plusDays(4)))
        assertNotNull(Rules.validateRange(date, date.plusDays(3), 3, emptyList()))
        assertNotNull(Rules.validateRange(date, date.plusDays(2), 3, listOf(AvailabilityWindow(date.plusDays(2).toString(), date.plusDays(4).toString()))))
    }
    @Test fun campusEmailAndPasswordValidation() {
        assertNull(Rules.validateEmail("STUDENT@BENNETT.EDU.IN"))
        assertNotNull(Rules.validateEmail("student@bennett.edu.in.evil.test"))
        assertNotNull(Rules.validateEmail("student@gmail.com"))
        assertNull(Rules.validatePassword("borrow12"))
        assertNotNull(Rules.validatePassword("borrowbuddy"))
    }
    @Test fun custodyTransitionsAndFineCap() {
        assertTrue(Rules.canTransition("awaiting_pickup", "active"))
        assertFalse(Rules.canTransition("returned", "active"))
        assertFalse(Rules.canTransition("active", "cancelled"))
        assertEquals(60, Rules.fine(3))
        assertEquals(1000, Rules.fine(90))
    }
}
