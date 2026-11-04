package `in`.borrowbuddy.android.data

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class CampusConnectionProbeTest {
    @Test fun serviceHealthUsesOnlyPublicCredentialsAndBypassesCaches() = runBlocking {
        val probe = CampusConnectionProbe(MockEngine { request ->
            assertEquals("https://example.supabase.co/auth/v1/health", request.url.toString())
            assertEquals("public-test-key", request.headers["apikey"])
            assertEquals("no-store", request.headers[HttpHeaders.CacheControl])
            assertNull(request.headers[HttpHeaders.Authorization])
            respond("{}", HttpStatusCode.OK)
        }, "https://example.supabase.co/", "public-test-key")
        try { assertTrue(probe.check()) } finally { probe.close() }
    }

    @Test fun errorsAndRedirectsCannotDeclareRecovery() = runBlocking {
        for (status in listOf(HttpStatusCode.Unauthorized, HttpStatusCode.ServiceUnavailable, HttpStatusCode.Found)) {
            var calls = 0
            val probe = CampusConnectionProbe(MockEngine {
                calls++
                respond("unavailable", status, headersOf(HttpHeaders.Location, "https://portal.example/login"))
            }, "https://example.supabase.co", "public-test-key")
            try { assertFalse(probe.check()); assertEquals(1, calls) } finally { probe.close() }
        }
    }

    @Test fun failedTransportDoesNotPreventTheNextSuccessfulCheck() = runBlocking {
        var calls = 0
        val probe = CampusConnectionProbe(MockEngine {
            if (++calls == 1) throw IOException("Route unavailable")
            respond("{}", HttpStatusCode.OK)
        }, "https://example.supabase.co", "public-test-key")
        try { assertFalse(probe.check()); assertTrue(probe.check()); assertEquals(2, calls) } finally { probe.close() }
    }

    @Test fun deadlineCancelsStalledRequestAndPermitsRecovery() = runBlocking {
        var calls = 0
        val cancelled = CompletableDeferred<Unit>()
        val probe = CampusConnectionProbe(MockEngine {
            if (++calls == 1) try { awaitCancellation() } finally { cancelled.complete(Unit) }
            respond("{}", HttpStatusCode.OK)
        }, "https://example.supabase.co", "public-test-key", timeoutMillis = 1_000)
        try {
            withTimeout(4_000) { assertFalse(probe.check()); cancelled.await() }
            assertTrue(probe.check())
            assertEquals(2, calls)
        } finally { probe.close() }
    }

    @Test fun leavingTheScreenCancelsTheUnderlyingCheck() = runBlocking {
        val started = CompletableDeferred<Unit>()
        val cancelled = CompletableDeferred<Unit>()
        val probe = CampusConnectionProbe(MockEngine {
            started.complete(Unit)
            try { awaitCancellation() } finally { cancelled.complete(Unit) }
        }, "https://example.supabase.co", "public-test-key", timeoutMillis = 30_000)
        var returned: Boolean? = null
        try {
            val job = launch { returned = probe.check() }
            withTimeout(4_000) { started.await(); job.cancelAndJoin(); cancelled.await() }
            assertTrue(job.isCancelled)
            assertNull("Cancellation must propagate instead of returning a recovery result", returned)
        } finally { probe.close() }
    }
}
