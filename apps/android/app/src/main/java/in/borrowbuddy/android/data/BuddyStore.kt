package `in`.borrowbuddy.android.data

import android.content.Context
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import java.util.UUID

enum class BuddyMood { Idle, Wave, Thinking, Talking, Happy, Found, Confused, Sleepy, Offline }

data class BuddyMessage(
    val id: String = UUID.randomUUID().toString(),
    val user: Boolean,
    val text: String = "",
    val cards: List<BuddyCard> = emptyList(),
    val tools: List<String> = emptyList(),
    val streaming: Boolean = false,
    val error: String? = null,
    val errorMood: BuddyMood = BuddyMood.Confused,
)

data class BuddyConversation(val id: String, val title: String, val updatedAt: Long, val messages: List<BuddyMessage>)

data class BuddyState(
    val conversations: List<BuddyConversation> = emptyList(),
    val activeId: String? = null,
    val open: Boolean = false,
    val busy: Boolean = false,
    val mood: BuddyMood = BuddyMood.Idle,
    val quickMode: Boolean = false,
    val cooldownUntil: Long = 0,
) {
    val active get() = conversations.firstOrNull { it.id == activeId }
}

/**
 * One Buddy conversation store for the whole app, so the floating sheet and the
 * full Buddy screen stay in sync and a reply keeps streaming across navigation.
 * History is saved per student in app-private storage (excluded from backups).
 */
class BuddyStore(context: Context, repository: BorrowRepository) {
    private val client = BuddyClient(repository)
    private val prefs = context.getSharedPreferences("borrowbuddy.buddy", Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val mutable = MutableStateFlow(BuddyState())
    val state = mutable.asStateFlow()
    val configured get() = client.configured
    private var userId: String? = null
    private var job: Job? = null
    private var moodJob: Job? = null

    fun bind(user: String) {
        if (userId == user) return
        job?.cancel(); userId = user
        mutable.value = BuddyState(conversations = load(user)).let { it.copy(activeId = it.conversations.firstOrNull()?.id) }
    }

    fun setOpen(open: Boolean) {
        mutable.update { it.copy(open = open) }
        if (open && !mutable.value.busy) mood(BuddyMood.Wave, 1600)
    }
    fun poke(mood: BuddyMood, millis: Long = 1400) { if (!mutable.value.busy) mood(mood, millis) }
    fun newConversation() { stop(); mutable.update { it.copy(activeId = null) }; mood(BuddyMood.Wave, 1400); save() }
    fun select(id: String) { stop(); mutable.update { it.copy(activeId = id) }; save() }
    fun remove(id: String) {
        mutable.update { s -> s.copy(conversations = s.conversations.filterNot { it.id == id }, activeId = s.activeId.takeIf { it != id }) }; save()
    }
    fun stop() { job?.cancel(); job = null }

    fun retry(path: String) {
        val convo = mutable.value.active ?: return
        val last = convo.messages.lastOrNull { it.user } ?: return
        val cut = convo.messages.lastIndexOf(last)
        replace(convo.id) { it.copy(messages = it.messages.take(cut)) }
        send(last.text, path)
    }

    fun send(raw: String, path: String) {
        val text = raw.trim().take(1000)
        if (text.isEmpty() || mutable.value.busy) return
        if (System.currentTimeMillis() < mutable.value.cooldownUntil) { mood(BuddyMood.Sleepy); return }
        var convoId = mutable.value.activeId?.takeIf { id -> mutable.value.conversations.any { it.id == id } }
        if (convoId == null) {
            convoId = UUID.randomUUID().toString()
            val fresh = BuddyConversation(convoId, text.take(48), System.currentTimeMillis(), emptyList())
            mutable.update { it.copy(conversations = listOf(fresh) + it.conversations, activeId = convoId) }
        }
        val id = convoId
        val prior = mutable.value.conversations.first { it.id == id }.messages
        val history = (prior.filter { it.error == null && it.text.isNotBlank() }.map { (if (it.user) "user" else "assistant") to it.text } +
            ("user" to text)).takeLast(12)
        val reply = BuddyMessage(user = false, streaming = true)
        replace(id) { it.copy(updatedAt = System.currentTimeMillis(), messages = (it.messages + BuddyMessage(user = true, text = text) + reply).takeLast(60)) }
        mutable.update { it.copy(busy = true) }
        mood(BuddyMood.Thinking)

        job = scope.launch {
            var finished = false
            try {
                client.ask(history, path).collect { event ->
                    when (event) {
                        is BuddyEvent.Meta -> mutable.update { it.copy(quickMode = event.mode == "local") }
                        is BuddyEvent.Text -> {
                            if (mutable.value.mood != BuddyMood.Talking && mutable.value.mood != BuddyMood.Found) mood(BuddyMood.Talking)
                            message(id, reply.id) { it.copy(text = it.text + event.delta) }
                        }
                        is BuddyEvent.Tool -> { mood(BuddyMood.Thinking); message(id, reply.id) { it.copy(tools = it.tools + event.label) } }
                        is BuddyEvent.Card -> {
                            if (event.card is BuddyCard.Items || event.card is BuddyCard.Action) mood(BuddyMood.Found)
                            message(id, reply.id) { it.copy(cards = it.cards + event.card) }
                        }
                        BuddyEvent.Done -> { finished = true; message(id, reply.id) { it.copy(streaming = false) }; mood(BuddyMood.Happy, 1800) }
                        is BuddyEvent.Failed -> {
                            finished = true
                            if (event.rateLimited) {
                                val wait = (event.retryAfterSeconds ?: 60).coerceAtLeast(5)
                                mutable.update { it.copy(cooldownUntil = System.currentTimeMillis() + wait * 1000L) }
                                fail(id, reply.id, "${event.message} Try again in ${if (wait < 90) "${wait}s" else "${(wait + 59) / 60} min"}.", BuddyMood.Sleepy)
                            } else fail(id, reply.id, event.message, BuddyMood.Confused)
                        }
                    }
                }
                if (!finished) fail(id, reply.id, "The answer got cut off. Try again.", BuddyMood.Confused)
            } catch (cancelled: CancellationException) {
                message(id, reply.id) { if (it.text.isBlank()) it.copy(streaming = false, error = "Stopped.") else it.copy(streaming = false) }
                mood(BuddyMood.Idle)
            } catch (failure: Exception) {
                fail(id, reply.id, "Buddy can't reach the server. Check your connection and try again.", BuddyMood.Offline)
            } finally {
                mutable.update { it.copy(busy = false) }
                save()
            }
        }
    }

    private fun fail(convo: String, message: String, text: String, mood: BuddyMood) {
        message(convo, message) { it.copy(streaming = false, error = text, errorMood = mood) }
        mood(mood, if (mood == BuddyMood.Sleepy) 0 else 4200)
    }

    private fun mood(mood: BuddyMood, idleAfter: Long = 0) {
        moodJob?.cancel()
        mutable.update { it.copy(mood = mood) }
        if (idleAfter > 0) moodJob = scope.launch { delay(idleAfter); mutable.update { it.copy(mood = BuddyMood.Idle) } }
    }

    private fun replace(convo: String, update: (BuddyConversation) -> BuddyConversation) = mutable.update { s ->
        s.copy(conversations = s.conversations.map { if (it.id == convo) update(it) else it }.sortedByDescending { it.updatedAt })
    }
    private fun message(convo: String, message: String, update: (BuddyMessage) -> BuddyMessage) =
        replace(convo) { c -> c.copy(updatedAt = System.currentTimeMillis(), messages = c.messages.map { if (it.id == message) update(it) else it }) }

    /* Text and errors persist; cards are rebuilt by asking again. */
    private fun save() {
        val user = userId ?: return
        val json = buildJsonArray {
            mutable.value.conversations.take(20).forEach { c ->
                addJsonObject {
                    put("id", c.id); put("title", c.title); put("updatedAt", c.updatedAt)
                    putJsonArray("messages") {
                        c.messages.takeLast(60).filter { it.text.isNotBlank() }.forEach { m ->
                            addJsonObject { put("user", m.user); put("text", m.text) }
                        }
                    }
                }
            }
        }
        prefs.edit().putString("history.$user", json.toString()).apply()
    }

    private fun load(user: String): List<BuddyConversation> = runCatching {
        Json.parseToJsonElement(prefs.getString("history.$user", "[]")!!).jsonArray.map { element ->
            val c = element.jsonObject
            BuddyConversation(c["id"]!!.jsonPrimitive.content, c["title"]!!.jsonPrimitive.content, c["updatedAt"]!!.jsonPrimitive.long,
                c["messages"]!!.jsonArray.map { m -> BuddyMessage(user = m.jsonObject["user"]!!.jsonPrimitive.boolean, text = m.jsonObject["text"]!!.jsonPrimitive.content) })
        }
    }.getOrDefault(emptyList())
}
