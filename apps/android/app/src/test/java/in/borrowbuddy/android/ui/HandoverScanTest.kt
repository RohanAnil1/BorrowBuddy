package `in`.borrowbuddy.android.ui

import `in`.borrowbuddy.android.domain.Item
import `in`.borrowbuddy.android.domain.Loan
import `in`.borrowbuddy.android.domain.Profile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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

    @Test fun aHandoverIsDoneOnlyWhenTheLoanMovesToTheNextStage() {
        listOf("active", "return_pending", "overdue").forEach { assertTrue(it, handoverDone("pickup", it)) }
        listOf("awaiting_pickup", "cancelled", "returned").forEach { assertFalse(it, handoverDone("pickup", it)) }
        assertTrue(handoverDone("return", "returned"))
        listOf("active", "overdue", "disputed").forEach { assertFalse(it, handoverDone("return", it)) }
        assertFalse(handoverDone("collection", "active"))
    }

    @Test fun theOtherPhoneCelebratesOnlyARealHandover() {
        assertEquals("pickup", handoverJustHappened("awaiting_pickup", "active"))
        assertEquals("return", handoverJustHappened("active", "returned"))
        assertEquals("return", handoverJustHappened("overdue", "returned"))
        assertNull(handoverJustHappened(null, "returned"))            // opened after the fact
        assertNull(handoverJustHappened("active", "active"))
        assertNull(handoverJustHappened("awaiting_pickup", "cancelled"))
        assertNull(handoverJustHappened("active", "overdue"))         // the due date passing is not a handover
    }

    @Test fun aScanThatEndsWithoutACodeSaysWhatToDo() {
        assertTrue(NoCodeRead.contains("try again") && NoCodeRead.contains("six digits"))
    }
}

class HandoverConfirmedCopyTest {
    private val loan = Loan("l", "r", "i", "owner", "borrower", "2026-11-13", "2026-11-14", "active",
        item = Item("i", "owner", "cat", "QA test item"),
        owner = Profile("owner", full_name = "Phone Demo"), borrower = Profile("borrower", full_name = "Rohan Anil"))

    @Test fun pickupSpeaksToEachSide() {
        val owner = handoverConfirmedCopy("pickup", loan, "owner")
        assertEquals("PICKED UP", owner.board)
        assertEquals("Rohan has your QA test item now. It's due back 14 Nov.", owner.body)
        assertEquals("PHONE D." to "ROHAN A.", owner.from to owner.to)
        assertEquals("DUE BACK" to "14 NOV", owner.factLabel to owner.factValue)
        assertEquals("The QA test item is yours until 14 Nov. Enjoy it.", handoverConfirmedCopy("pickup", loan, "borrower").body)
    }

    @Test fun returnRunsTheRouteBackwardsAndAsksForARating() {
        val borrower = handoverConfirmedCopy("return", loan, "borrower")
        assertEquals("RETURN CONFIRMED", borrower.headline)
        assertEquals("You've handed back the QA test item. Rate Phone to close the loan.", borrower.body)
        assertEquals("ROHAN A." to "PHONE D.", borrower.from to borrower.to)
        assertEquals("Your QA test item is back with you. Rate Rohan to close the loan.", handoverConfirmedCopy("return", loan, "owner").body)
    }
}
