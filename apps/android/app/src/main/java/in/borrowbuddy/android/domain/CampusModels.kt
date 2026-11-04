package `in`.borrowbuddy.android.domain

import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Serializable data class CampusPost(
    val id: String, val owner_id: String, val kind: String, val title: String,
    val description: String, val category_id: String, val location: String,
    val pickup_location_id: String? = null, val found_on: String? = null,
    val condition: String? = null, val hold_hours: Int = 48, val images: List<String> = emptyList(),
    val status: String = "open", val created_at: String = "", val updated_at: String = "",
)
@Serializable data class CampusClaim(
    val id: String, val post_id: String, val claimant_id: String, val evidence: String,
    val status: String, val decision_note: String? = null, val reviewed_by: String? = null,
    val reviewed_at: String? = null, val created_at: String = "",
)
@Serializable data class CampusTransfer(
    val id: String, val post_id: String, val host_id: String, val recipient_id: String,
    val status: String, val claim_id: String? = null, val expires_at: String? = null,
    val completed_at: String? = null, val closed_reason: String? = null,
    val created_at: String = "", val host_read_at: String? = null, val recipient_read_at: String? = null,
) {
    fun active(now: Instant = Instant.now()) = status == "active" && (expires_at == null || now < Instant.parse(expires_at))
    fun readAt(user: String) = if (host_id == user) host_read_at else recipient_read_at
}
@Serializable data class CampusMessage(
    val id: String, val transfer_id: String, val sender_id: String, val client_id: String,
    val body: String, val created_at: String,
)
@Serializable data class CampusThreadHead(val transfer_id: String, val last_incoming_at: String? = null)
@Serializable data class CampusWindow(
    val day: Int? = null, val date: String? = null, val blocked: Boolean = false,
    val start: String? = null, val end: String? = null,
)
@Serializable data class CampusSchedule(
    val host_id: String, val pickup_location_id: String, val slot_minutes: Int = 30,
    val weekly: List<CampusWindow> = emptyList(), val exceptions: List<CampusWindow> = emptyList(),
)
@Serializable data class CampusSlot(val starts_at: String, val ends_at: String, val pickup_location_id: String)
@Serializable data class CampusAppointment(
    val id: String, val host_id: String, val recipient_id: String, val kind: String,
    val starts_at: String, val ends_at: String, val pickup_location_id: String, val status: String,
    val loan_id: String? = null, val transfer_id: String? = null,
)
@Serializable data class CampusCode(val id: String, val code: String, val expires_at: String)

/** Shared website contract. UI validation improves feedback; the transactional RPC remains authoritative. */
object CampusRules {
    val zone: ZoneId = ZoneId.of("Asia/Kolkata")
    fun today(): LocalDate = LocalDate.now(zone)
    fun date(value: String): String = Instant.parse(value).atZone(zone)
        .format(DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a", java.util.Locale.ENGLISH)) + " IST"
    fun windowError(windows: List<CampusWindow>, exceptions: Boolean = false): String? {
        if (windows.map { if (exceptions) it.date else it.day }.distinct().size != windows.size) return "Use one window per day."
        for (w in windows) {
            if (exceptions && runCatching { LocalDate.parse(w.date) }.isFailure) return "Choose a valid exception date."
            if (!exceptions && w.day !in 0..6) return "Choose a weekday."
            if (w.blocked && exceptions) continue
            val start = runCatching { java.time.LocalTime.parse(w.start) }.getOrNull()
            val end = runCatching { java.time.LocalTime.parse(w.end) }.getOrNull()
            if (start == null || end == null || start >= end) return "Each end time must follow its start time (HH:mm)."
        }
        return null
    }
    fun postError(title: String, description: String, location: String, images: List<String>, kind: String,
        found: String, notes: String, condition: String, hours: Int): String? = when {
        title.trim().length !in 3..100 -> "Use a title of 3–100 characters."
        description.trim().length !in 10..2000 -> "Describe the item in 10–2000 characters."
        location.trim().length !in 2..100 -> "Describe the campus location in 2–100 characters."
        images.size !in 1..6 -> "Add one to six photos."
        hours !in listOf(24, 48, 72) -> "Choose a 24-, 48- or 72-hour hold."
        kind == "found" && (runCatching { LocalDate.parse(found) <= today() }.getOrDefault(false).not() || notes.trim().length !in 5..2000) -> "Add a valid found date and private identifying notes (5–2000 characters)."
        kind == "giveaway" && condition !in listOf("new", "good", "fair", "worn") -> "Choose the condition."
        else -> null
    }
    fun mergeMessages(old: List<CampusMessage>, incoming: List<CampusMessage>) = (old + incoming)
        .associateBy { it.id }.values.sortedWith(compareBy<CampusMessage> { Instant.parse(it.created_at) }.thenBy { it.id })
}
