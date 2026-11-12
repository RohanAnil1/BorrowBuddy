package `in`.borrowbuddy.android.data

import `in`.borrowbuddy.android.BuildConfig
import io.github.jan.supabase.auth.auth
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.request.header
import io.ktor.client.request.preparePost
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsChannel
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.utils.io.readUTF8Line
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.json.*
import java.util.concurrent.TimeUnit

/** Wire events from /api/assistant (mirrors apps/web/src/lib/assistant/types.ts). */
sealed interface BuddyEvent {
    data class Meta(val mode: String) : BuddyEvent
    data class Text(val delta: String) : BuddyEvent
    data class Tool(val label: String) : BuddyEvent
    data class Card(val card: BuddyCard) : BuddyEvent
    data object Done : BuddyEvent
    data class Failed(val message: String, val retryAfterSeconds: Int? = null, val rateLimited: Boolean = false) : BuddyEvent
}

data class BuddyItem(val id: String, val title: String, val image: String?, val condition: String, val deposit: String, val spot: String?, val trust: Int)
data class BuddyLoan(val id: String, val title: String, val role: String, val statusLabel: String, val dueLabel: String, val tone: String)
data class BuddyRequest(val id: String, val itemId: String, val title: String, val direction: String, val status: String, val statusLabel: String, val dates: String)
data class BuddyFine(val id: String, val amount: String, val reason: String, val status: String, val itemTitle: String?)

sealed interface BuddyCard {
    data class Items(val title: String, val items: List<BuddyItem>) : BuddyCard
    data class Loans(val title: String, val loans: List<BuddyLoan>) : BuddyCard
    data class Requests(val title: String, val requests: List<BuddyRequest>) : BuddyCard
    data class Fines(val total: String, val fines: List<BuddyFine>) : BuddyCard
    data class Action(val label: String, val href: String, val description: String?, val request: Boolean) : BuddyCard
}

class BuddyClient(private val repository: BorrowRepository) {
    /** Debug builds reach the PC's dev server through `adb reverse tcp:3000 tcp:3000`. */
    val baseUrl: String = BuildConfig.BORROWBUDDY_WEB_URL.trimEnd('/').ifBlank { if (BuildConfig.DEBUG) "http://localhost:3000" else "" }
    val configured get() = baseUrl.isNotBlank()

    private val http by lazy {
        HttpClient(OkHttp) {
            expectSuccess = false
            engine { config { connectTimeout(10, TimeUnit.SECONDS); readTimeout(75, TimeUnit.SECONDS) } }
        }
    }

    fun ask(history: List<Pair<String, String>>, path: String): Flow<BuddyEvent> = flow {
        val token = repository.client.auth.currentAccessTokenOrNull()
            ?: run { emit(BuddyEvent.Failed("Sign in again to talk to Buddy.")); return@flow }
        val body = buildJsonObject {
            putJsonArray("messages") { history.forEach { (role, content) -> addJsonObject { put("role", role); put("content", content) } } }
            put("path", path)
        }
        http.preparePost("$baseUrl/api/assistant") {
            header("Authorization", "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody(body.toString())
        }.execute { response ->
            if (response.status.value !in 200..299) {
                val error = runCatching { Json.parseToJsonElement(response.bodyAsText()).jsonObject }.getOrNull()
                val message = error?.get("error")?.jsonPrimitive?.contentOrNull ?: "Buddy couldn't answer that. Try again."
                val retry = error?.get("retryAfter")?.jsonPrimitive?.intOrNull
                emit(BuddyEvent.Failed(message, retry, response.status.value == 429))
                return@execute
            }
            val channel = response.bodyAsChannel()
            var finished = false
            while (true) {
                val line = channel.readUTF8Line() ?: break
                if (line.isBlank()) continue
                val event = runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() ?: continue
                when (event.str("type")) {
                    "meta" -> emit(BuddyEvent.Meta(event.str("mode") ?: "ai"))
                    "text" -> emit(BuddyEvent.Text(event.str("delta").orEmpty()))
                    "tool" -> emit(BuddyEvent.Tool(event.str("label").orEmpty()))
                    "card" -> event["card"]?.jsonObject?.let(::parseCard)?.let { emit(BuddyEvent.Card(it)) }
                    "error" -> { finished = true; emit(BuddyEvent.Failed(event.str("message") ?: "Buddy lost the signal. Try again.")) }
                    "done" -> { finished = true; emit(BuddyEvent.Done) }
                }
            }
            if (!finished) emit(BuddyEvent.Failed("The answer got cut off. Try again."))
        }
    }

    private fun JsonObject.str(key: String) = this[key]?.jsonPrimitive?.contentOrNull
    private fun JsonObject.list(key: String) = this[key]?.jsonArray?.map { it.jsonObject }.orEmpty()

    private fun parseCard(card: JsonObject): BuddyCard? = when (card.str("kind")) {
        "items" -> BuddyCard.Items(card.str("title").orEmpty(), card.list("items").map {
            BuddyItem(it.str("id").orEmpty(), it.str("title").orEmpty(), it.str("image"), it.str("condition").orEmpty(),
                it.str("deposit").orEmpty(), it.str("spot"), it["trust"]?.jsonPrimitive?.intOrNull ?: 0)
        })
        "loans" -> BuddyCard.Loans(card.str("title").orEmpty(), card.list("loans").map {
            BuddyLoan(it.str("id").orEmpty(), it.str("title").orEmpty(), it.str("role").orEmpty(), it.str("statusLabel").orEmpty(),
                it.str("dueLabel").orEmpty(), it.str("tone") ?: "ok")
        })
        "requests" -> BuddyCard.Requests(card.str("title").orEmpty(), card.list("requests").map {
            BuddyRequest(it.str("id").orEmpty(), it.str("itemId").orEmpty(), it.str("title").orEmpty(), it.str("direction").orEmpty(),
                it.str("status").orEmpty(), it.str("statusLabel").orEmpty(), it.str("dates").orEmpty())
        })
        "fines" -> BuddyCard.Fines(card.str("total") ?: "₹0", card.list("fines").map {
            BuddyFine(it.str("id").orEmpty(), it.str("amount").orEmpty(), it.str("reason").orEmpty(), it.str("status").orEmpty(), it.str("itemTitle"))
        })
        "action" -> BuddyCard.Action(card.str("label").orEmpty(), card.str("href") ?: return null, card.str("description"), card.str("variant") == "request")
        else -> null
    }
}

/**
 * Maps a web path from an action card to this app's navigation route. Only
 * known destinations are allowed; anything else returns null and is ignored.
 */
fun buddyRoute(href: String): String? {
    val path = href.substringBefore('?').trim('/')
    val query = href.substringAfter('?', "").split('&').mapNotNull { pair ->
        pair.split('=', limit = 2).takeIf { it.size == 2 }?.let { it[0] to java.net.URLDecoder.decode(it[1], "UTF-8") }
    }.toMap()
    val uuid = Regex("^[0-9a-fA-F-]{36}$")
    val date = Regex("^\\d{4}-\\d{2}-\\d{2}$")
    return when {
        path == "home" -> query["category"]?.takeIf(uuid::matches)?.let { "home?category=$it" } ?: "home"
        path in setOf("dashboard", "my/borrows", "my/items", "items/new", "fines", "map", "chat", "campus", "campus/lost-found",
            "campus/giveaways", "campus/activity", "campus/handovers", "notifications", "me", "my/saved", "impact") -> path
        path.startsWith("items/") && uuid.matches(path.removePrefix("items/")) -> {
            val start = query["start"]?.takeIf(date::matches); val end = query["end"]?.takeIf(date::matches)
            if (start != null && end != null) "$path?start=$start&end=$end" else path
        }
        path.startsWith("loans/") && uuid.matches(path.removePrefix("loans/")) -> path
        path.startsWith("users/") && uuid.matches(path.removePrefix("users/")) -> path
        else -> null
    }
}
