package `in`.borrowbuddy.android.ui

import android.app.DatePickerDialog
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import java.time.LocalDate
import java.time.Instant

private val campusJson = Json { ignoreUnknownKeys = true; encodeDefaults = true }
@Composable internal fun CampusDateField(label: String, value: String, select: (String) -> Unit) {
    val context = LocalContext.current
    val date = runCatching { LocalDate.parse(value) }.getOrDefault(CampusRules.today())
    CampusButton("$label: $value", {
        DatePickerDialog(context, { _, year, month, day -> select(LocalDate.of(year, month + 1, day).toString()) }, date.year, date.monthValue - 1, date.dayOfMonth).show()
    }, secondary = true)
}

private data class CampusHoursData(val schedule: CampusSchedule?, val locations: List<PickupLocation>, val appointments: List<CampusAppointment>)
@Composable fun CampusHandoversScreen(repository: BorrowRepository, profile: Profile, open: (String) -> Unit) {
    val actions = rememberActions()
    LoadScreen(profile.id, { CampusHoursData(repository.campus.schedule(profile.id), repository.locations(), repository.campus.appointments()) }, actions.revision) { data ->
        CampusPage("Meet on your schedule.", "HANDOVER HOURS · ASIA/KOLKATA", open) {
            CampusCopy("Publish hours for loan pickups and returns, approved found-item collections and reserved giveaways. Scheduling is optional. Existing codes and fine rules continue to apply.")
            CargoTitle("Your appointments")
            if (data.appointments.isEmpty()) CampusEmpty("No appointments yet", "Choose a published time from a loan or private collection.")
            data.appointments.forEach { appointment -> key(appointment.id) { CargoPanel {
                StatusBadge(appointment.status); CampusCopy("${appointment.kind.replaceFirstChar(Char::uppercase)} · ${CampusRules.date(appointment.starts_at)}")
                CampusCopy(data.locations.find { it.id == appointment.pickup_location_id }?.name ?: "Campus pickup spot")
                CampusButton("Open handover", { open(appointment.loan_id?.let { "loans/$it" } ?: "campus/collections/${appointment.transfer_id}") }, secondary = true)
                if (appointment.status == "booked") CampusConfirm("Cancel appointment", "Collection codes remain usable without a slot. This cancels only this appointment.", actions) {
                    repository.campus.action("cancel_appointment", campusData(appointment.id))
                }
            } } }
            CargoTitle("Publish your availability")
            CampusScheduleEditor(data.schedule, data.locations, actions) { values -> repository.campus.action("save_schedule", values) }
            ActionFeedback(actions)
        }
    }
}

@Composable internal fun CampusScheduleEditor(schedule: CampusSchedule?, locations: List<PickupLocation>, actions: ScreenActions, save: suspend (JsonObject) -> Unit) {
    var pickup by rememberSaveable(schedule?.host_id) { mutableStateOf(schedule?.pickup_location_id.orEmpty()) }
    var minutes by rememberSaveable(schedule?.host_id) { mutableIntStateOf(schedule?.slot_minutes ?: 30) }
    // Strings are Bundle-safe and retain unsaved weekly/exception edits across process recreation.
    var weeklyJson by rememberSaveable(schedule?.host_id) { mutableStateOf(campusJson.encodeToString(schedule?.weekly.orEmpty())) }
    var exceptionsJson by rememberSaveable(schedule?.host_id) { mutableStateOf(campusJson.encodeToString(schedule?.exceptions.orEmpty())) }
    val weekly = campusJson.decodeFromString<List<CampusWindow>>(weeklyJson)
    val exceptions = campusJson.decodeFromString<List<CampusWindow>>(exceptionsJson)
    var exceptionDate by rememberSaveable { mutableStateOf(CampusRules.today().toString()) }
    fun updateWeekly(day: Int, value: CampusWindow?) { weeklyJson = campusJson.encodeToString(weekly.filterNot { it.day == day } + listOfNotNull(value)) }
    fun updateException(date: String, value: CampusWindow?) { exceptionsJson = campusJson.encodeToString(exceptions.filterNot { it.date == date } + listOfNotNull(value)) }
    CargoPanel {
        CargoChoice("Pickup location", pickup, locations.map { it.id to it.name }) { pickup = it }
        CargoChoice("Appointment length", minutes.toString(), listOf(15, 30, 60).map { it.toString() to "$it minutes" }) { minutes = it.toInt() }
        listOf(1, 2, 3, 4, 5, 6, 0).forEach { day ->
            val name = listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")[day]
            val window = weekly.find { it.day == day }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                CampusButton("$name · ${if (window == null) "Unavailable" else "Available"}", {
                    updateWeekly(day, if (window == null) CampusWindow(day = day, start = "17:00", end = "19:00") else null)
                }, secondary = true)
                if (window != null) {
                    CargoField("$name start (HH:mm)", window.start.orEmpty(), { updateWeekly(day, window.copy(start = it.take(5))) })
                    CargoField("$name end (HH:mm)", window.end.orEmpty(), { updateWeekly(day, window.copy(end = it.take(5))) })
                }
            }
        }
        CargoTitle("Date exceptions")
        CampusCopy("A date exception replaces that day’s weekly hours. Existing appointments stay booked until explicitly cancelled.")
        CampusDateField("Exception date", exceptionDate) { exceptionDate = it }
        CampusButton("Add blocked date", { if (exceptions.none { it.date == exceptionDate }) updateException(exceptionDate, CampusWindow(date = exceptionDate, blocked = true, start = "17:00", end = "19:00")) }, secondary = true)
        exceptions.sortedBy { it.date }.forEach { window -> key(window.date) {
            CargoLabel(window.date.orEmpty())
            CampusButton(if (window.blocked) "Blocked · use replacement hours" else "Replacement hours · block date", { updateException(window.date!!, window.copy(blocked = !window.blocked)) }, secondary = true)
            if (!window.blocked) {
                CargoField("${window.date} start (HH:mm)", window.start.orEmpty(), { updateException(window.date!!, window.copy(start = it.take(5))) })
                CargoField("${window.date} end (HH:mm)", window.end.orEmpty(), { updateException(window.date!!, window.copy(end = it.take(5))) })
            }
            CampusButton("Remove exception ${window.date}", { updateException(window.date!!, null) }, secondary = true)
        } }
        CampusButton("Save my handover hours", { actions.run("Handover availability saved.") {
            require(pickup.isNotBlank()) { "Choose a campus pickup location." }
            CampusRules.windowError(weekly)?.let { error(it) }; CampusRules.windowError(exceptions, true)?.let { error(it) }
            save(buildJsonObject {
                put("pickup_location_id", pickup); put("slot_minutes", minutes)
                put("weekly", campusJson.encodeToJsonElement(weekly)); put("exceptions", campusJson.encodeToJsonElement(exceptions))
            })
        } }, enabled = !actions.busy)
    }
}

/** Same picker for all three exchange types. Only committed server responses update the booked state. */
@Composable fun CampusAppointmentPicker(repository: BorrowRepository, host: String, kind: String, loan: String? = null, transfer: String? = null, expires: String? = null) {
    val actions = rememberActions()
    var date by rememberSaveable(loan, transfer, kind) { mutableStateOf(CampusRules.today().toString()) }
    var selected by rememberSaveable(loan, transfer, kind, date) { mutableStateOf<String?>(null) }
    LoadScreen(listOf(host, loan, transfer, kind, date), {
        Triple(repository.campus.appointments(loan, transfer), repository.campus.slots(host, date), repository.locations())
    }, actions.revision, inline = true) { (appointments, slots, locations) ->
        val current = appointments.find { it.kind == kind && it.status == "booked" }
        val eligible = slots.filter { expires == null || !Instant.parse(it.ends_at).isAfter(Instant.parse(expires)) }
        CargoPanel(Modifier.testTag("campus-appointment-picker")) {
            CargoLabel("[ OPTIONAL $kind APPOINTMENT ]")
            CampusCopy("Asia/Kolkata · next 30 days · one handover per appointment. You can also coordinate in chat and use your existing code.")
            if (current != null) {
                CampusCopy("Booked: ${CampusRules.date(current.starts_at)} – ${CampusRules.date(current.ends_at)}")
                CampusCopy(locations.find { it.id == current.pickup_location_id }?.name ?: "Campus spot")
                CampusConfirm("Cancel this appointment", "This releases the slot for both participants.", actions) { repository.campus.action("cancel_appointment", campusData(current.id)) }
            }
            CampusDateField("Appointment date", date) { chosen ->
                val parsed = LocalDate.parse(chosen)
                if (parsed >= CampusRules.today() && parsed <= CampusRules.today().plusDays(30)) { date = chosen; selected = null }
                else actions.run(refresh = false) { error("Choose a date within the next 30 days.") }
            }
            if (eligible.isEmpty()) CampusCopy("No available slots on this date. Try another day or agree on a time in chat.")
            else CargoChoice("Available time", selected.orEmpty(), eligible.map { it.starts_at to "${CampusRules.date(it.starts_at)} · ${locations.find { location -> location.id == it.pickup_location_id }?.name.orEmpty()}" }) { selected = it }
            if (expires != null) CampusCopy("Collection must finish before ${CampusRules.date(expires)}. Booking does not extend the hold.")
            CampusButton(if (current == null) "Book appointment" else "Reschedule appointment", { actions.run("Appointment confirmed.") {
                val start = selected ?: error("Choose an available time.")
                require(eligible.any { it.starts_at == start }) { "Choose an available time." }
                repository.campus.action("book", buildJsonObject {
                    loan?.let { put("loan_id", it) }; transfer?.let { put("transfer_id", it) }; put("kind", kind); put("starts_at", start)
                }); selected = null
            } }, enabled = !actions.busy && selected != null)
            ActionFeedback(actions)
        }
    }
}
