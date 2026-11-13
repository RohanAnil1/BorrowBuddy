package `in`.borrowbuddy.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ForgotPasswordUrlTest {
    private val site = "https://borrow-buddy-web.vercel.app"

    @Test fun prefillsAValidBennettAddress() {
        assertEquals("$site/forgot-password?email=e23cseu0001%40bennett.edu.in",
            forgotPasswordUrl("$site/", "  E23CSEU0001@Bennett.edu.in "))
    }

    @Test fun leavesTheFieldEmptyForAnythingElse() {
        listOf("", "someone@gmail.com", "not an email").forEach {
            assertEquals(it, "$site/forgot-password", forgotPasswordUrl(site, it))
        }
    }

    @Test fun hidesTheLinkWithoutAWebAddress() {
        assertNull(forgotPasswordUrl("", "e23cseu0001@bennett.edu.in"))
        assertNull(forgotPasswordUrl("  ", ""))
    }
}
