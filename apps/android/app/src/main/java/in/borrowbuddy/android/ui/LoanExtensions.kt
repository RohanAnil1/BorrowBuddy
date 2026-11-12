package `in`.borrowbuddy.android.ui

import android.content.ActivityNotFoundException
import android.content.Intent
import android.provider.CalendarContract
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

private val extensionDate = DateTimeFormatter.ofPattern("EEE, d MMM", Locale.forLanguageTag("en-IN"))
internal fun prettyLoanDate(iso: String): String = LocalDate.parse(iso).format(extensionDate)

/** The latest date the borrower can ask for: the item's max loan length from the start date. */
internal fun extensionLimit(loan: Loan): LocalDate =
    LocalDate.parse(loan.start_date).plusDays(((loan.item?.max_loan_days ?: 14) - 1).toLong())

/**
 * Loan extensions, mirroring the web panel: the borrower asks for more days
 * (or withdraws a pending ask), the owner approves or declines. The database
 * re-checks every rule; these limits are only a convenience.
 */
@Composable fun ExtensionPanel(repository: BorrowRepository, profile: Profile, loan: Loan, actions: ScreenActions) {
    val isOwner = loan.owner_id == profile.id
    val isBorrower = loan.borrower_id == profile.id
    if (!isOwner && !isBorrower) return // admins viewing someone else's loan
    val extensions by produceState<List<LoanExtension>?>(null, loan.id, actions.revision) { value = repository.extensions(loan.id) }
    val list = extensions ?: return
    val pending = list.firstOrNull { it.status == "pending" }
    val lastAnswered = list.firstOrNull { it.status != "pending" }
    val other = (if (isOwner) loan.borrower?.full_name else loan.owner?.full_name).orEmpty().substringBefore(' ').ifBlank { "them" }
    val canExtend = loan.status in listOf("awaiting_pickup", "active")

    when {
        pending != null && isOwner -> CargoPanel(Modifier.testTag("extension-decision").border(1.dp, Cargo.Accent.copy(alpha = .6f)), padding = 24.dp) {
            CargoLabel("[ ${other.uppercase()} WANTS MORE DAYS ]")
            val extra = ChronoUnit.DAYS.between(LocalDate.parse(pending.previous_due_date), LocalDate.parse(pending.new_due_date))
            CargoBody("Keep it until ${prettyLoanDate(pending.new_due_date)} instead of ${prettyLoanDate(pending.previous_due_date)} (+$extra ${if (extra == 1L) "day" else "days"}).", color = Cargo.Ink.copy(alpha = .85f))
            pending.message?.takeIf { it.isNotBlank() }?.let { CargoBody("“$it”", Modifier.border(1.dp, Cargo.Line).padding(12.dp)) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CargoButton("Approve", { actions.run("Approved. The new due date is set.") { repository.respondExtension(pending.id, true) } },
                    enabled = !actions.busy, modifier = Modifier.testTag("extension-approve"))
                CargoButton("Decline", { actions.run("Declined. The due date stays the same.") { repository.respondExtension(pending.id, false) } },
                    enabled = !actions.busy, secondary = true, modifier = Modifier.testTag("extension-decline"))
            }
        }
        pending != null -> CargoPanel(Modifier.testTag("extension-pending").border(1.dp, Cargo.Accent.copy(alpha = .4f)), padding = 24.dp) {
            CargoLabel("[ EXTENSION PENDING ]")
            CargoBody("You asked $other to keep it until ${prettyLoanDate(pending.new_due_date)}. Until they answer, it's still due ${prettyLoanDate(pending.previous_due_date)}.",
                color = Cargo.Ink.copy(alpha = .85f))
            CargoButton("Withdraw request", { actions.run("Request withdrawn.") { repository.cancelExtension(pending.id) } },
                enabled = !actions.busy, secondary = true, modifier = Modifier.testTag("extension-withdraw"))
        }
        isBorrower && canExtend -> ExtensionAsk(repository, loan, other, lastAnswered, actions)
        lastAnswered != null && lastAnswered.status != "cancelled" -> CargoPanel(padding = 24.dp) {
            CargoLabel("[ EXTENSION ]", Cargo.Ink.copy(alpha = .6f))
            CargoBody(if (lastAnswered.status == "approved") "Extended to ${prettyLoanDate(lastAnswered.new_due_date)}."
                else "A request for ${prettyLoanDate(lastAnswered.new_due_date)} was declined.")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun ExtensionAsk(repository: BorrowRepository, loan: Loan, other: String, lastAnswered: LoanExtension?, actions: ScreenActions) {
    val due = LocalDate.parse(loan.due_date)
    val min = due.plusDays(1)
    val max = extensionLimit(loan)
    var open by rememberSaveable(loan.id) { mutableStateOf(false) }
    var choice by rememberSaveable(loan.id) { mutableStateOf(min.toString()) }
    var note by rememberSaveable(loan.id) { mutableStateOf("") }
    var picking by remember { mutableStateOf(false) }
    CargoPanel(Modifier.testTag("extension-ask"), padding = 24.dp) {
        CargoLabel("[ NEED MORE DAYS? ]")
        if (min > max) { CargoBody("This loan is already at the item's ${loan.item?.max_loan_days ?: 14}-day maximum."); return@CargoPanel }
        CargoBody("Ask $other to keep it longer. Due now: ${prettyLoanDate(loan.due_date)}.")
        if (lastAnswered?.status == "declined") CargoBody("Your last request (${prettyLoanDate(lastAnswered.new_due_date)}) was declined.")
        if (!open) { CargoButton("Ask for more days", { open = true }, secondary = true, modifier = Modifier.testTag("extension-open")); return@CargoPanel }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(1L, 2L, 3L, 7L).map { due.plusDays(it) }.filter { it <= max }.forEach { date ->
                val selected = choice == date.toString()
                val extra = ChronoUnit.DAYS.between(due, date)
                Text("+$extra ${if (extra == 1L) "day" else "days"}", Modifier.testTag("extension-quick-$extra").heightIn(min = 40.dp)
                    .border(1.dp, if (selected) Cargo.Accent else Cargo.Line, RoundedCornerShape(50))
                    .background(if (selected) Cargo.Accent.copy(alpha = .15f) else androidx.compose.ui.graphics.Color.Transparent, RoundedCornerShape(50))
                    .semantics { this.selected = selected }.clickable { choice = date.toString() }.padding(horizontal = 14.dp, vertical = 10.dp),
                    style = loanBody(12), color = if (selected) Cargo.Accent else Cargo.Ink.copy(alpha = .8f))
            }
        }
        Row(Modifier.border(1.dp, Cargo.Line, RoundedCornerShape(8.dp)).clickable { picking = true }
            .semantics { contentDescription = "New due date: ${prettyLoanDate(choice)}" }.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("NEW DUE DATE", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
            Text(prettyLoanDate(choice), style = loanBody(14), color = Cargo.Ink)
            Icon(painterResource(R.drawable.ic_calendar), null, Modifier.size(14.dp), tint = Cargo.Ink)
        }
        CargoField("Note for $other (optional)", note, { if (it.length <= 300) note = it }, lines = 2)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CargoButton("Send request", { actions.run("Request sent. You'll get a notification when they answer.") {
                repository.requestExtension(loan.id, choice, note)
            } }, enabled = !actions.busy, modifier = Modifier.testTag("extension-send"))
            CargoButton("Cancel", { open = false }, secondary = true)
        }
    }
    if (picking) {
        val toMillis = { date: LocalDate -> date.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli() }
        val state = rememberDatePickerState(initialSelectedDateMillis = toMillis(LocalDate.parse(choice)),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean {
                    val date = Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate()
                    return date in min..max
                }
            })
        DatePickerDialog(onDismissRequest = { picking = false }, confirmButton = {
            TextButton({ state.selectedDateMillis?.let { choice = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString() }; picking = false }) { Text("APPLY") }
        }, dismissButton = { TextButton({ picking = false }) { Text("CANCEL") } }) { DatePicker(state) }
    }
}

/**
 * "Add to calendar" opens the phone's calendar app with the pickup or return
 * prefilled as an all-day event. Only the two people on the loan see it.
 */
@Composable fun LoanCalendarButtons(loan: Loan, viewerId: String) {
    if (loan.owner_id != viewerId && loan.borrower_id != viewerId) return
    if (loan.status !in listOf("awaiting_pickup", "active", "return_pending", "overdue")) return
    val context = LocalContext.current
    var failed by remember { mutableStateOf(false) }
    val owner = loan.owner_id == viewerId
    val title = loan.item?.title.orEmpty()
    val other = (if (owner) loan.borrower?.full_name else loan.owner?.full_name).orEmpty()
    fun add(date: String, eventTitle: String, description: String) {
        val start = LocalDate.parse(date).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
        val intent = Intent(Intent.ACTION_INSERT, CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.Events.TITLE, eventTitle)
            .putExtra(CalendarContract.Events.DESCRIPTION, description)
            .putExtra(CalendarContract.Events.EVENT_LOCATION, loan.item?.pickup_location?.name.orEmpty())
            .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, true)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start)
            // Calendar apps read an all-day end time as inclusive, so end on the same day.
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, start)
        try { context.startActivity(intent); failed = false } catch (_: ActivityNotFoundException) { failed = true }
    }
    FlowRow(Modifier.testTag("loan-calendar"), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (loan.status == "awaiting_pickup") CalendarChip("Add pickup to calendar") {
            add(loan.start_date, if (owner) "Hand over $title" else "Pick up $title",
                if (owner) "$other is collecting it. Confirm with the 6-digit code." else "Collect it from $other. Show your 6-digit code.")
        }
        CalendarChip("Add return to calendar") {
            add(loan.due_date, if (owner) "$title comes back" else "Return $title",
                if (owner) "$other returns it today." else "Due back to $other today. Late returns can lead to fines.")
        }
    }
    if (failed) CargoLabel("[ NO CALENDAR APP FOUND ]", Cargo.Warn)
}

@Composable private fun CalendarChip(label: String, click: () -> Unit) {
    Row(Modifier.heightIn(min = 44.dp).border(1.dp, Cargo.Line, RoundedCornerShape(8.dp)).clickable(onClick = click)
        .padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(painterResource(R.drawable.ic_calendar_check), null, Modifier.size(14.dp), tint = Cargo.Accent)
        Text(label.uppercase(), style = loanBody(11).copy(fontFamily = Cargo.Strong, fontSize = 11.sp), color = Cargo.Ink)
    }
}
