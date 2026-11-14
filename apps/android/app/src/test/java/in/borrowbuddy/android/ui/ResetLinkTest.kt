package `in`.borrowbuddy.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ResetLinkTest {
    @Test fun readsTheCode() {
        assertEquals(ResetLink.Code("a1b2-c3d4_e5"), parseResetLink("borrowbuddy://auth/reset?code=a1b2-c3d4_e5"))
    }

    @Test fun anErrorOrOddCodeMeansAskAgain() {
        listOf("borrowbuddy://auth/reset?error=link", "borrowbuddy://auth/reset",
            "borrowbuddy://auth/reset?code=", "borrowbuddy://auth/reset?code=%3Cscript%3E").forEach {
            assertEquals(it, ResetLink.Expired, parseResetLink(it))
        }
    }

    @Test fun ignoresEverythingElse() {
        listOf(null, "", "not a link", "https://auth/reset?code=abc", "borrowbuddy://evil/reset?code=abc",
            "borrowbuddy://auth/other?code=abc").forEach { assertNull(it, parseResetLink(it)) }
    }
}
