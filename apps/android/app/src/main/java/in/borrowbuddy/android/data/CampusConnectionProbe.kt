package `in`.borrowbuddy.android.data

import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.http.HttpHeaders
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeoutOrNull
import java.io.Closeable

/** A bounded, cancellable service check, independent of saved user credentials. */
internal class CampusConnectionProbe(
    engine: HttpClientEngine,
    serviceUrl: String,
    private val publicKey: String,
    private val timeoutMillis: Long = 7_000,
) : Closeable {
    init { require(timeoutMillis > 0) }
    private val healthUrl = "${serviceUrl.trimEnd('/')}/auth/v1/health"
    private val client = HttpClient(engine) {
        expectSuccess = false
        followRedirects = false
        install(HttpTimeout) {
            requestTimeoutMillis = timeoutMillis
            connectTimeoutMillis = timeoutMillis
            socketTimeoutMillis = timeoutMillis
        }
    }

    suspend fun check(): Boolean = try {
        // The coroutine deadline also bounds route/DNS readiness, rather than
        // leaving the offline gate's single-flight flag waiting on a blocking call.
        withTimeoutOrNull(timeoutMillis) {
            client.get(healthUrl) {
                header("apikey", publicKey)
                header(HttpHeaders.CacheControl, "no-store")
            }.status.value in 200..299
        } == true
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        false
    }

    override fun close() = client.close()
}
