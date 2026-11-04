package `in`.borrowbuddy.android.domain

import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

object Rules {
    val campusZone: ZoneId = ZoneId.of("Asia/Kolkata")
    val activeStatuses = setOf("awaiting_pickup", "active", "return_pending", "overdue", "disputed")
    val blockingStatuses = activeStatuses + "lost"
    val loanTransitions = mapOf(
        "awaiting_pickup" to setOf("active", "cancelled", "disputed"),
        "active" to setOf("return_pending", "returned", "overdue", "disputed", "lost"),
        "return_pending" to setOf("returned", "overdue", "disputed", "lost"),
        "overdue" to setOf("return_pending", "returned", "disputed", "lost"),
        "disputed" to setOf("returned", "lost", "cancelled"),
    )
    val departments = listOf("Computer Science", "Electronics & Communication", "Mechanical Engineering", "Civil Engineering", "Biotechnology", "Business & Management", "Law", "Design", "Other")
    val conditions = linkedMapOf("new" to "Like new", "good" to "Good", "fair" to "Fair", "worn" to "Worn")
    val loanLabels = mapOf("awaiting_pickup" to "Awaiting pickup", "active" to "Borrowed", "return_pending" to "Return in progress", "returned" to "Returned", "overdue" to "Overdue", "disputed" to "Under dispute", "lost" to "Reported lost", "cancelled" to "Cancelled")
    fun today(): LocalDate = LocalDate.now(campusZone)
    fun dates(start: LocalDate, end: LocalDate): List<LocalDate> {
        require(!end.isBefore(start)) { "End date must be on or after the start date" }
        return (0..ChronoUnit.DAYS.between(start, end)).map(start::plusDays)
    }
    fun overlaps(aStart: LocalDate, aEnd: LocalDate, bStart: LocalDate, bEnd: LocalDate) = aStart <= bEnd && bStart <= aEnd
    fun validateRange(start: LocalDate, end: LocalDate, maxDays: Int, windows: List<AvailabilityWindow>): String? {
        if (start < today()) return "Pick a date from today onwards."
        if (end < start) return "End date must be on or after the start date."
        if (ChronoUnit.DAYS.between(start, end) + 1 > maxDays) return "This item can be borrowed for at most $maxDays days."
        if (windows.any { overlaps(start, end, LocalDate.parse(it.start_date), LocalDate.parse(it.end_date)) }) return "That range crosses dates the item is already booked for."
        return null
    }
    fun validateEmail(value: String): String? {
        val email = value.trim().lowercase()
        return if (Regex("^[^\\s@]+@bennett\\.edu\\.in$").matches(email)) null else "Use your Bennett email, ending in @bennett.edu.in."
    }
    fun validatePassword(value: String): String? = when {
        value.length < 8 -> "Use at least 8 characters."
        !value.any { it in 'a'..'z' || it in 'A'..'Z' } -> "Include at least one letter."
        !value.any { it in '0'..'9' } -> "Include at least one number."
        else -> null
    }
    fun validateProfile(name: String, phone: String, department: String, year: Int): String? = when {
        name.trim().length !in 2..80 -> "Enter your full name (2–80 characters)."
        phone.isNotBlank() && !Regex("^[6-9]\\d{9}$").matches(phone.trim()) -> "Enter a valid 10-digit mobile number."
        department.trim().length !in 2..80 -> "Select your department."
        year !in 1..6 -> "Choose a year from 1 to 6."
        else -> null
    }
    fun fine(days: Int) = (days.coerceAtLeast(0) * 20).coerceAtMost(1000)
    fun canTransition(from: String, to: String) = to in loanTransitions[from].orEmpty()
}
