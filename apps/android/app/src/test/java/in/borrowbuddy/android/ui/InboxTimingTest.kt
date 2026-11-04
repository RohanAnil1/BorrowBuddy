package `in`.borrowbuddy.android.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class InboxTimingTest {
    @Test fun sourceSixSecondSteppedBlinkUsesBothShortDips() {
        for (time in listOf(0f, 59f, 120f, 179f, 240f, 5999f, 6000f)) assertEquals(1f, inboxBlinkAt(time), 0f)
        for (time in listOf(60f, 119f, 180f, 239f, 6060f, 6180f)) assertEquals(.08f, inboxBlinkAt(time), 0f)
    }
}
