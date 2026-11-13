package `in`.borrowbuddy.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HandoverScanTest {
    @Test fun acceptsOurPayloadForTheExpectedKind() {
        assertEquals(HandoverScan.Code("789262"), parseHandoverQr("bb:pickup:789262", "pickup"))
        assertEquals(HandoverScan.Code("004211"), parseHandoverQr("  bb:collection:004211 ", "collection"))
    }

    @Test fun acceptsABareSixDigitCode() {
        assertEquals(HandoverScan.Code("123456"), parseHandoverQr("123456", "return"))
    }

    @Test fun refusesTheOtherKindOfPass() {
        assertEquals(HandoverScan.WrongKind("pickup"), parseHandoverQr("bb:pickup:789262", "return"))
        assertEquals("That's a pickup code. Ask for their return pass.", scanProblem(HandoverScan.WrongKind("pickup"), "return"))
    }

    @Test fun refusesAnythingElse() {
        listOf(null, "", "https://borrow-buddy-web.vercel.app/loans/abc", "bb:pickup:12345", "bb:pickup:1234567", "bb:PICKUP:123456", "12345a")
            .forEach { assertEquals(it.toString(), HandoverScan.NotOurs, parseHandoverQr(it, "pickup")) }
        assertNull(scanProblem(HandoverScan.Code("123456"), "pickup"))
    }

    @Test fun groupsTheCodeForReadingAloud() {
        assertEquals("789 262", groupedCode("789262"))
        assertEquals("12345", groupedCode("12345"))
    }
}
