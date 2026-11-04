package `in`.borrowbuddy.android.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class ProfilePresentationTest {
    @Test fun ratingsMatchTheWebsiteNumberToFixedIncludingBinaryTies() {
        // Expected strings checked in the source website's JavaScript runtime.
        val source = listOf(4.05 to "4.0", 2.55 to "2.5", 4.25 to "4.3", 4.15 to "4.2", 3.95 to "4.0", 3.857142857142857 to "3.9", 5.0 to "5.0")
        source.forEach { (value, expected) -> assertEquals("Website rating $value", expected, profileRating(value)) }
    }
}
