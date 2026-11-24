package `in`.borrowbuddy.android.domain

import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

/** Rows shaped the way the normalized tables return them. */
class NormalizedRowsTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun loanHandoversComeFromTheirOwnRows() {
        val loan = json.decodeFromString<Loan>("""
            {"id":"l1","request_id":"r1","item_id":"i1","owner_id":"o1","borrower_id":"b1",
             "start_date":"2026-11-20","due_date":"2026-11-22","status":"active",
             "handovers":[
               {"kind":"pickup","expires_at":null,"attempts":0,"confirmed_at":"2026-11-20T10:00:00Z"},
               {"kind":"return","expires_at":"2026-11-22T10:15:00Z","attempts":2,"confirmed_at":null}]}
        """.trimIndent())
        assertEquals("2026-11-20T10:00:00Z", loan.pickup_confirmed_at)
        assertNull(loan.return_confirmed_at)
        assertEquals(2, loan.handover("return")?.attempts)
        assertEquals("2026-11-22T10:15:00Z", loan.handover("return")?.expires_at)
    }

    @Test fun aLoanWithoutHandoversYetHasNoConfirmations() {
        val loan = json.decodeFromString<Loan>("""
            {"id":"l1","request_id":"r1","item_id":"i1","owner_id":"o1","borrower_id":"b1",
             "start_date":"2026-11-20","due_date":"2026-11-22"}
        """.trimIndent())
        assertTrue(loan.handovers.isEmpty())
        assertNull(loan.pickup_confirmed_at)
        assertNull(loan.handover("pickup"))
    }

    @Test fun profileDepartmentNameAndIdArriveTogether() {
        val profile = json.decodeFromString<Profile>("""
            {"id":"p1","full_name":"Mira","department_id":"d1","department":"Computer Science"}
        """.trimIndent())
        assertEquals("d1", profile.department_id)
        assertEquals("Computer Science", profile.department)
    }

    @Test fun itemPhotosReadAsImagesInOrder() {
        val item = json.decodeFromString<Item>("""
            {"id":"i1","owner_id":"o1","category_id":"c1","title":"Tripod","images":["o1/a.jpg","o1/b.jpg"]}
        """.trimIndent())
        assertEquals(listOf("o1/a.jpg", "o1/b.jpg"), item.images)
    }
}
