package `in`.borrowbuddy.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.*
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.Profile
import kotlinx.serialization.json.*

private val incidentTypes = listOf(
    Triple("damage", "DAMAGE", "Item damaged"), Triple("lost", "LOST ITEM", "Item lost"),
    Triple("late", "LATE RETURN", "Returned late"), Triple("no_show", "NO-SHOW", "No-show at pickup"),
    Triple("other", "OTHER", "Other")
)

/** Website incident-form.tsx: type, evidence, description; source 220 ms wait-mode transition. */
@Composable fun IncidentPanel(repository: BorrowRepository, profile: Profile, loanId: String,
    actions: ScreenActions, filed: Boolean, onFiled: () -> Unit) {
    var expanded by rememberSaveable(loanId, profile.id) { mutableStateOf(false) }
    var step by rememberSaveable(loanId, profile.id) { mutableIntStateOf(0) }
    var type by rememberSaveable(loanId, profile.id) { mutableStateOf<String?>(null) }
    var description by rememberSaveable(loanId, profile.id) { mutableStateOf("") }
    var photos by rememberSaveable(loanId, profile.id) { mutableStateOf(arrayListOf<String>()) }
    var uploading by remember(loanId, profile.id) { mutableStateOf(false) }
    val reduced = rememberReducedMotion()
    val travel = with(LocalDensity.current) { 24.dp.roundToPx() }
    BackHandler(expanded && !filed && !actions.busy && !uploading) { if (step > 0) step-- else expanded = false }
    when {
        filed -> Column(Modifier.fillMaxWidth().border(1.dp, Cargo.Accent.copy(alpha = .4f))
            .background(Cargo.Accent.copy(alpha = .05f)).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            CargoLabel("[ REPORT FILED ]")
            CargoBody("Report filed. An admin will review it and both parties can add photos.")
        }
        !expanded -> CargoPanel(padding = 24.dp) {
            CargoLabel("[ SOMETHING WENT WRONG? ]", Cargo.Ink)
            CargoBody("Damage, a missing return, a no-show? File it with photos and an admin will review it.")
            CargoButton("Report a problem", { expanded = true }, secondary = true)
        }
        else -> Column(Modifier.fillMaxWidth().testTag("incident-report-$loanId").border(1.dp, Cargo.Warn.copy(alpha = .4f))
            .background(Cargo.Panel).padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            TicketTopBar()
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                CargoLabel("[ INCIDENT REPORT ]", Cargo.Ink)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    repeat(3) { index -> Box(Modifier.width(24.dp).height(4.dp).background(
                        if (index == step) Cargo.Accent else if (index < step) Cargo.Accent.copy(alpha = .4f) else Cargo.Ink.copy(alpha = .15f))) }
                }
            }
            AnimatedContent(step, transitionSpec = {
                if (reduced) EnterTransition.None togetherWith ExitTransition.None else {
                    val ease = CubicBezierEasing(.4f, 0f, .2f, 1f)
                    (fadeIn(tween(220, delayMillis = 220, easing = ease)) +
                        slideInHorizontally(tween(220, delayMillis = 220, easing = ease)) { travel }) togetherWith
                        (fadeOut(tween(220, easing = ease)) + slideOutHorizontally(tween(220, easing = ease)) { -travel })
                }
            }, label = "Incident report step") { current ->
                Column(Modifier.fillMaxWidth().heightIn(min = 320.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    when (current) {
                        0 -> {
                            CargoLabel("STEP 1 — WHAT HAPPENED?", Cargo.Ink.copy(alpha = .5f))
                            incidentTypes.forEach { (value, icon, title) ->
                                val selected = type == value
                                Column(Modifier.fillMaxWidth().border(1.dp, if (selected) Cargo.Accent else Cargo.Line)
                                    .background(if (selected) Cargo.Accent.copy(alpha = .1f) else Cargo.Panel)
                                    .selectable(selected, enabled = !actions.busy, role = Role.RadioButton) { type = value }.padding(16.dp)) {
                                    CargoLabel(icon, Cargo.Ink.copy(alpha = .4f))
                                    Text(title.uppercase(), style = TextStyle(fontFamily = Cargo.Strong, fontSize = 13.sp))
                                }
                            }
                        }
                        1 -> {
                            CargoLabel("STEP 2 — PHOTO EVIDENCE", Cargo.Ink.copy(alpha = .5f))
                            CargoBody("Photos make disputes resolve faster. Clear shots of the item and the problem.")
                            UploadField(repository, profile.id, "incident-photos", initial = photos, onUploadingChange = { uploading = it }) { photos = ArrayList(it) }
                        }
                        2 -> {
                            CargoLabel("STEP 3 — DESCRIBE IT", Cargo.Ink.copy(alpha = .5f))
                            CargoField("What happened, in your own words", description, { if (it.length <= 2000) description = it }, lines = 5)
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                CargoButton("← Back", { step-- }, enabled = step > 0 && !actions.busy && !uploading, secondary = true)
                if (step < 2) CargoButton("Next →", { step++ }, enabled = !actions.busy && !uploading && (step != 0 || type != null))
                else CargoButton(if (actions.busy) "Filing…" else "File the report →", {
                    actions.run {
                        require(type != null && description.trim().length in 10..2000)
                        repository.rpc("open_incident", buildJsonObject {
                            put("p_loan_id", loanId); put("p_type", type!!); put("p_description", description.trim())
                            put("p_photo_paths", JsonArray(photos.map(::JsonPrimitive)))
                        })
                        onFiled()
                    }
                }, enabled = !actions.busy && description.trim().length in 10..2000)
            }
        }
    }
}
