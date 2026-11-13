package `in`.borrowbuddy.android.widget

import `in`.borrowbuddy.android.data.BuddyMood
import `in`.borrowbuddy.android.domain.Fine
import `in`.borrowbuddy.android.domain.Loan
import `in`.borrowbuddy.android.domain.Rules
import kotlinx.serialization.Serializable
import java.time.Duration
import java.time.LocalDate
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

/** What the widget shows: who is signed in, and the last data it fetched. */
enum class WidgetState { SignedOut, Unverified, Ready }

/** The one loan the widget features: the next one due back. */
@Serializable
data class WidgetLoan(
    val id: String,
    val title: String,
    val dueDate: String,
    val status: String,
    val lending: Boolean,
    val counterpart: String = "",
)

/**
 * The last-known widget data. It is cached on disk so the widget renders
 * offline; countdowns are worked out from [WidgetLoan.dueDate] at draw time,
 * so they keep ticking without the network.
 */
@Serializable
data class WidgetSnapshot(
    val state: WidgetState = WidgetState.SignedOut,
    val firstName: String = "",
    val loan: WidgetLoan? = null,
    val openLoans: Int = 0,
    val pendingRequests: Int = 0,
    val unreadChats: Int = 0,
    val pendingFines: Int = 0,
    val finesOwed: Int = 0,
    /** Epoch millis of the last successful sync; 0 = never. */
    val syncedAt: Long = 0,
    /** The latest sync attempt failed, so the data is the last-known copy. */
    val offline: Boolean = false,
)

enum class DueTone { Calm, Soon, Late }

/** "02" + "DAYS LEFT" for the hero figure, "[ DUE IN 2 DAYS ]" for the bracket label. */
data class DueCountdown(val figure: String, val unit: String, val bracket: String, val tone: DueTone)

object WidgetFormat {
    private val stampFormat = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)

    /**
     * Counts down to the due date in campus time (Asia/Kolkata), by calendar
     * day; on the day itself, by hours then minutes until 23:59, the same
     * cut-off the loan boarding pass uses.
     */
    fun countdown(dueDate: LocalDate, status: String, now: ZonedDateTime): DueCountdown {
        val campusNow = now.withZoneSameInstant(Rules.campusZone)
        val days = ChronoUnit.DAYS.between(campusNow.toLocalDate(), dueDate)
        // Not handed over yet: past the end date nothing is "late", the pickup just never happened.
        if (status == "awaiting_pickup" && days < 0) return DueCountdown("--", "TO COLLECT", "[ AWAITING PICKUP ]", DueTone.Soon)
        if (status == "overdue" || days < 0) {
            val late = maxOf(1L, -days)
            return DueCountdown(pad(late), if (late == 1L) "DAY LATE" else "DAYS LATE",
                "[ OVERDUE ${plural(late, "DAY")} ]", DueTone.Late)
        }
        return when (days) {
            0L -> {
                val minutes = Duration.between(campusNow, dueDate.atTime(23, 59).atZone(Rules.campusZone)).toMinutes()
                val hours = minutes / 60
                if (hours >= 1) DueCountdown(pad(hours), if (hours == 1L) "HOUR LEFT" else "HOURS LEFT", "[ DUE TODAY ]", DueTone.Soon)
                else DueCountdown(pad(maxOf(1L, minutes)), "MIN LEFT", "[ DUE TODAY ]", DueTone.Soon)
            }
            1L -> DueCountdown("01", "DAY LEFT", "[ DUE TOMORROW ]", DueTone.Soon)
            else -> DueCountdown(pad(days), "DAYS LEFT", "[ DUE IN $days DAYS ]", if (days <= 2) DueTone.Soon else DueTone.Calm)
        }
    }

    fun countdown(loan: WidgetLoan, now: ZonedDateTime): DueCountdown? =
        runCatching { LocalDate.parse(loan.dueDate) }.getOrNull()?.let { countdown(it, loan.status, now) }

    /** Two-digit tallies, as on the app's departure boards: 0 -> "00", 7 -> "07", 120 -> "99+". */
    fun tally(count: Int): String = when {
        count <= 0 -> "00"
        count > 99 -> "99+"
        else -> count.toString().padStart(2, '0')
    }

    /** Indian grouping, no paise: 1500 -> "₹1,500". */
    fun rupees(amount: Int): String {
        // Lakh grouping by hand: the JVM's NumberFormat only repeats the last group size.
        val digits = amount.coerceAtLeast(0).toString()
        if (digits.length <= 3) return "₹$digits"
        val lead = digits.dropLast(3).reversed().chunked(2).joinToString(",").reversed()
        return "₹$lead,${digits.takeLast(3)}"
    }

    /** Fits a tile: 840 -> "₹840", 1500 -> "₹1.5K", 12000 -> "₹12K". */
    fun compactRupees(amount: Int): String = when {
        amount < 1000 -> rupees(amount)
        amount < 10_000 -> "₹" + (amount / 100).let { tenths -> if (tenths % 10 == 0) "${tenths / 10}K" else "${tenths / 10}.${tenths % 10}K" }
        else -> "₹${amount / 1000}K"
    }

    /** The 2x2 footer: up to two non-zero counts, most urgent first, else "NO NEW ACTIVITY". */
    fun smallTally(snapshot: WidgetSnapshot): String = listOfNotNull(
        snapshot.finesOwed.takeIf { it > 0 }?.let { "${compactRupees(it)} FINE" },
        snapshot.pendingRequests.takeIf { it > 0 }?.let { "${tally(it)} REQ" },
        snapshot.unreadChats.takeIf { it > 0 }?.let { "${tally(it)} MSG" },
    ).take(2).joinToString(" · ").ifEmpty { "NO NEW ACTIVITY" }

    /** "SYNCED NOW", "SYNCED 5M AGO", "OFFLINE · 3H AGO". */
    fun freshness(syncedAt: Long, offline: Boolean, nowMillis: Long): String {
        if (syncedAt <= 0) return if (offline) "OFFLINE · NOT SYNCED" else "NOT SYNCED"
        val minutes = ((nowMillis - syncedAt) / 60_000).coerceAtLeast(0)
        val age = when {
            minutes < 1 -> "NOW"
            minutes < 60 -> "${minutes}M AGO"
            minutes < 24 * 60 -> "${minutes / 60}H AGO"
            else -> "${minutes / (24 * 60)}D AGO"
        }
        return if (offline) "OFFLINE · $age" else "SYNCED $age"
    }

    /** "Priya Sharma" -> "PRIYA S."; blank -> "A STUDENT". */
    fun shortName(name: String?): String {
        val parts = name.orEmpty().trim().split(Regex("\\s+")).filter { it.isNotBlank() }
        return when {
            parts.isEmpty() -> "A STUDENT"
            parts.size == 1 -> parts[0]
            else -> "${parts[0]} ${parts[1].first()}."
        }.uppercase()
    }

    fun role(loan: WidgetLoan): String = if (loan.lending) "[ LENDING ]" else "[ BORROWING ]"
    fun route(loan: WidgetLoan): String = "${if (loan.lending) "TO" else "FROM"} ${loan.counterpart.ifBlank { "A STUDENT" }}"
    fun stamp(dueDate: String): String = runCatching { LocalDate.parse(dueDate).format(stampFormat).uppercase() }.getOrDefault(dueDate)
    /** Same six-character code the in-app boarding pass prints. */
    fun code(loanId: String): String = "BB-" + loanId.replace("-", "").take(6).uppercase()

    private fun pad(value: Long) = value.toString().padStart(2, '0')
    private fun plural(value: Long, unit: String) = "$value $unit${if (value == 1L) "" else "S"}"
}

object WidgetData {
    /**
     * The open loan due back first. Overdue loans lead; on the same due date,
     * borrowing beats lending, because returning is the student's own job.
     */
    fun nextLoan(loans: List<Loan>, viewerId: String): WidgetLoan? = loans
        .filter { it.status in Rules.activeStatuses && (it.borrower_id == viewerId || it.owner_id == viewerId) }
        .minWithOrNull(compareBy<Loan>({ it.status != "overdue" }, { it.due_date }, { it.borrower_id != viewerId }))
        ?.let { loan ->
            val lending = loan.borrower_id != viewerId
            WidgetLoan(loan.id, loan.item?.title?.trim().orEmpty().ifBlank { "Borrowed item" }, loan.due_date, loan.status, lending,
                WidgetFormat.shortName(if (lending) loan.borrower?.full_name else loan.owner?.full_name))
        }

    fun openLoans(loans: List<Loan>): Int = loans.count { it.status in Rules.activeStatuses }

    fun pendingFines(fines: List<Fine>): Pair<Int, Int> =
        fines.filter { it.status == "pending" }.let { pending -> pending.size to pending.sumOf { it.amount } }
}

/** Screens the widget may open. Anything else in a launch intent is ignored. */
/**
 * What Parcel says on the mascot widget: a mood for the drawing, a bracket
 * label, a short line in Parcel's voice, a detail line and where a tap goes.
 */
data class ParcelCue(
    val mood: BuddyMood,
    val label: String,
    val headline: String,
    val detail: String,
    val tone: DueTone,
    /** A [WidgetRoutes] destination, or null for the app's start screen. */
    val route: String?,
)

object ParcelCues {
    /**
     * Most urgent first: signed out, unverified, a handover waiting, an overdue loan, one due
     * within two days, unpaid fines, new requests or chats, a loan on track, nothing at all.
     * An offline snapshot keeps its message but Parcel shows the no-signal face.
     */
    fun cue(snapshot: WidgetSnapshot, now: ZonedDateTime): ParcelCue {
        val name = snapshot.firstName.trim().uppercase()
        val cue = when (snapshot.state) {
            WidgetState.SignedOut -> return ParcelCue(BuddyMood.Sleepy, "[ SIGNED OUT ]", "WAKE ME UP",
                "Sign in and I'll watch your loans.", DueTone.Soon, null)
            WidgetState.Unverified -> return ParcelCue(BuddyMood.Thinking, "[ ID IN REVIEW ]",
                if (name.isEmpty()) "HANG TIGHT" else "HANG TIGHT, $name", "An admin is checking your student ID.", DueTone.Soon, null)
            WidgetState.Ready -> ready(snapshot, now, name)
        }
        return if (snapshot.offline) cue.copy(mood = BuddyMood.Offline) else cue
    }

    private fun ready(snapshot: WidgetSnapshot, now: ZonedDateTime, name: String): ParcelCue {
        val loan = snapshot.loan
        val countdown = loan?.let { WidgetFormat.countdown(it, now) }
        val news = snapshot.pendingRequests + snapshot.unreadChats
        return when {
            loan != null && countdown != null && loan.status == "awaiting_pickup" -> ParcelCue(BuddyMood.Wave, "[ AWAITING PICKUP ]",
                if (loan.lending) "TIME TO HAND IT OVER" else "GO PICK IT UP", "${loan.title} · ${WidgetFormat.route(loan)}",
                DueTone.Soon, WidgetRoutes.loan(loan.id))
            loan != null && countdown != null && countdown.tone == DueTone.Late -> ParcelCue(BuddyMood.Confused, countdown.bracket,
                if (loan.lending) "IT'S NOT BACK YET" else "TIME TO RETURN IT", "${loan.title} · ${WidgetFormat.route(loan)}",
                DueTone.Late, WidgetRoutes.loan(loan.id))
            loan != null && countdown != null && countdown.tone == DueTone.Soon -> ParcelCue(BuddyMood.Wave, countdown.bracket,
                if (loan.lending) "COMING BACK SOON" else "HEADS UP!", "${loan.title} · ${WidgetFormat.route(loan)}",
                DueTone.Soon, WidgetRoutes.loan(loan.id))
            snapshot.finesOwed > 0 -> ParcelCue(BuddyMood.Confused, "[ FINE DUE ]", "YOU OWE ${WidgetFormat.rupees(snapshot.finesOwed)}",
                "Settle it on the fines page.", DueTone.Late, WidgetRoutes.FINES)
            news > 0 -> ParcelCue(BuddyMood.Found, "[ ${WidgetFormat.tally(news)} NEW ]",
                if (snapshot.pendingRequests > 0) "SOMEONE WANTS YOUR STUFF" else "YOU'VE GOT MESSAGES",
                WidgetFormat.smallTally(snapshot), DueTone.Soon,
                if (snapshot.pendingRequests > 0) WidgetRoutes.REQUESTS else WidgetRoutes.CHATS)
            loan != null && countdown != null -> ParcelCue(BuddyMood.Idle, countdown.bracket, "ALL ON TRACK",
                "${loan.title} · ${WidgetFormat.route(loan)}", DueTone.Calm, WidgetRoutes.loan(loan.id))
            else -> ParcelCue(BuddyMood.Happy, "[ ALL CLEAR ]", if (name.isEmpty()) "NOTHING DUE" else "ALL CLEAR, $name",
                "Find something to borrow.", DueTone.Calm, WidgetRoutes.BROWSE)
        }
    }
}

object WidgetRoutes {
    const val EXTRA = "in.borrowbuddy.android.extra.ROUTE"
    const val BROWSE = "home"
    const val CHATS = "chat"
    const val REQUESTS = "my/items"
    const val FINES = "fines"
    const val DASHBOARD = "dashboard"
    fun loan(id: String) = "loans/$id"
    private val allowed = Regex("^(home|chat|my/items|fines|dashboard|loans/[0-9a-fA-F-]{36})$")
    fun accept(route: String?): String? = route?.takeIf { allowed.matches(it) }
}
