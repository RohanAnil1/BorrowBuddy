package `in`.borrowbuddy.android.data

import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.Closeable

private fun probeClient(engine: HttpClientEngine, timeoutMillis: Long) = HttpClient(engine) {
    expectSuccess = false
    followRedirects = false
    install(HttpTimeout) {
        requestTimeoutMillis = timeoutMillis
        connectTimeoutMillis = timeoutMillis
        socketTimeoutMillis = timeoutMillis
    }
}

/** A bounded, cancellable service check, independent of saved user credentials. */
internal class CampusConnectionProbe(
    engine: HttpClientEngine,
    serviceUrl: String,
    private val publicKey: String,
    private val timeoutMillis: Long = 7_000,
) : Closeable {
    init { require(timeoutMillis > 0) }
    private val healthUrl = "${serviceUrl.trimEnd('/')}/auth/v1/health"
    private val client = probeClient(engine, timeoutMillis)

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

/** What the web app's public `GET /api/health` reports. */
internal data class WebHealth(val app: Boolean, val data: Boolean)

/** Asks the BorrowBuddy web app whether it (and its view of Supabase) is up. Null means no usable answer. */
internal class WebHealthProbe(
    engine: HttpClientEngine,
    baseUrl: String,
    private val timeoutMillis: Long = 7_000,
) : Closeable {
    init { require(timeoutMillis > 0) }
    private val healthUrl = "${baseUrl.trimEnd('/')}/api/health"
    private val client = probeClient(engine, timeoutMillis)

    suspend fun check(): WebHealth? = try {
        withTimeoutOrNull(timeoutMillis) {
            val response = client.get(healthUrl) {
                header(HttpHeaders.CacheControl, "no-store")
                header(HttpHeaders.Accept, "application/json")
            }
            if (response.status.value !in 200..299) null else parseWebHealth(response.bodyAsText())
        }
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }

    override fun close() = client.close()
}

internal fun parseWebHealth(body: String): WebHealth? = runCatching {
    val json = Json.parseToJsonElement(body).jsonObject
    WebHealth(json["app"]?.jsonPrimitive?.booleanOrNull == true, json["data"]?.jsonPrimitive?.booleanOrNull == true)
}.getOrNull()?.takeIf { it.app }
