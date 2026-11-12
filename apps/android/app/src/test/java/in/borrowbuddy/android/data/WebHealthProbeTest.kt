package `in`.borrowbuddy.android.data

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class WebHealthProbeTest {
    @Test fun readsAppAndDataFlagsWithoutCredentials() = runBlocking {
        val probe = WebHealthProbe(MockEngine { request ->
            assertEquals("https://borrowbuddy.example/api/health", request.url.toString())
            assertEquals("no-store", request.headers[HttpHeaders.CacheControl])
            assertNull(request.headers[HttpHeaders.Authorization])
            respond("""{"app":true,"data":false}""", HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }, "https://borrowbuddy.example/")
        try { assertEquals(WebHealth(app = true, data = false), probe.check()) } finally { probe.close() }
    }

    @Test fun errorsRedirectsAndJunkAreNoAnswer() = runBlocking {
        val replies = listOf(
            HttpStatusCode.ServiceUnavailable to """{"app":true,"data":true}""",
            HttpStatusCode.Found to "",
            HttpStatusCode.OK to "<html>login</html>",
            HttpStatusCode.OK to """{"app":false,"data":true}""",
        )
        for ((status, body) in replies) {
            val probe = WebHealthProbe(MockEngine { respond(body, status, headersOf(HttpHeaders.Location, "/login")) }, "https://borrowbuddy.example")
            try { assertNull("$status $body", probe.check()) } finally { probe.close() }
        }
        val failing = WebHealthProbe(MockEngine { throw IOException("Route unavailable") }, "https://borrowbuddy.example")
        try { assertNull(failing.check()) } finally { failing.close() }
    }

    @Test fun deadlineBoundsAStalledRequest() = runBlocking {
        val probe = WebHealthProbe(MockEngine { awaitCancellation() }, "https://borrowbuddy.example", timeoutMillis = 50)
        try { assertNull(probe.check()) } finally { probe.close() }
    }
}
