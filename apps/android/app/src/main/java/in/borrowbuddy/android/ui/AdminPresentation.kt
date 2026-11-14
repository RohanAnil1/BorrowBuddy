package `in`.borrowbuddy.android.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.*
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.*
import coil3.compose.AsyncImage
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import kotlinx.serialization.json.*
import kotlin.math.roundToInt

internal data class AdminData(val profiles: List<Profile>, val incidents: List<Incident>, val fines: List<Fine>, val locations: List<PickupLocation>)
val AdminViewportWidth = SemanticsPropertyKey<Int>("AdminViewportWidth")
val AdminIncidentCount = SemanticsPropertyKey<Int>("AdminIncidentCount")
val AdminIncidentTotal = SemanticsPropertyKey<Int>("AdminIncidentTotal")
internal fun adminText(value: String) = value.replace(Regex("[\\t\\n\\r\\u000C ]+"), " ").trim(' ').uppercase()

internal val adminBetween = object : Arrangement.Horizontal {
    override val spacing = 16.dp
    override fun Density.arrange(totalSize: Int, sizes: IntArray, layoutDirection: LayoutDirection, outPositions: IntArray) {
        with(Arrangement.SpaceBetween) { arrange(totalSize, sizes, layoutDirection, outPositions) }
    }
}
internal enum class AdminActionStyle { Primary, Secondary, Danger }
@Composable internal fun AdminAction(text: String, click: () -> Unit, modifier: Modifier = Modifier,
    style: AdminActionStyle = AdminActionStyle.Primary, icon: Int? = null, enabled: Boolean = true,
    fontSize: Int = 13, verticalPadding: Dp = 10.dp, start: Boolean = false, rounded: Boolean = true, tracking: Float = .04f) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState(); val focused by interaction.collectIsFocusedAsState()
    val highlight = enabled && (hovered || focused)
    val duration = if (rememberReducedMotion()) 0 else 150
    val ink by animateColorAsState(if (style == AdminActionStyle.Danger) Cargo.Warn else if (style == AdminActionStyle.Secondary && highlight) Cargo.Accent else Cargo.Ink, tween(duration), label = "admin-action-ink")
    val line by animateColorAsState(if (style == AdminActionStyle.Danger) Cargo.Warn.copy(alpha = .6f) else if (highlight) Cargo.Accent else Cargo.Line, tween(duration), label = "admin-action-line")
    val background by animateColorAsState(if (style == AdminActionStyle.Primary) Cargo.Accent else if (style == AdminActionStyle.Danger && highlight) Cargo.Warn.copy(alpha = .1f) else Color.Transparent, tween(duration), label = "admin-action-background")
    val border = if (style == AdminActionStyle.Primary) 0.dp else 1.dp
    val shape = RoundedCornerShape(if (rounded) 8.dp else 0.dp)
    Row(modifier.alpha(if (!enabled) .6f else if (style == AdminActionStyle.Primary && highlight) .9f else 1f)
        .background(background, shape).then(if (border == 0.dp) Modifier else Modifier.border(border, line, shape))
        .hoverable(interaction).clickable(interaction, LocalIndication.current, enabled, role = Role.Button, onClick = click)
        .padding(horizontal = 16.dp + border, vertical = verticalPadding + border),
        horizontalArrangement = Arrangement.spacedBy(8.dp, if (start) Alignment.Start else Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
        icon?.let { Icon(painterResource(it), null, Modifier.size(16.dp), tint = ink) }
        Text(text.uppercase(), style = loanBody(fontSize).copy(fontFamily = Cargo.Strong, letterSpacing = (fontSize * tracking).sp), color = ink)
    }
}

@Composable internal fun AdminInput(label: String, value: String, change: (String) -> Unit, modifier: Modifier = Modifier,
    placeholder: String = "", maximum: Int = Int.MAX_VALUE, onSubmit: (() -> Unit)? = null, keyboard: KeyboardType = KeyboardType.Text) {
    val interaction = remember { MutableInteractionSource() }; val focused by interaction.collectIsFocusedAsState()
    val border by animateColorAsState(if (focused) Cargo.Accent else Cargo.Line, tween(if (rememberReducedMotion()) 0 else 150), label = "admin-input-focus")
    val focus = LocalFocusManager.current
    BasicTextField(value, { change(it.take(maximum)) }, modifier.heightIn(min = 37.5.dp).background(Cargo.Panel, RoundedCornerShape(8.dp))
        .border(1.dp, border, RoundedCornerShape(8.dp)).semantics { contentDescription = label; if (maximum != Int.MAX_VALUE) maxTextLength = maximum },
        textStyle = loanBody(13).copy(color = Cargo.Ink), singleLine = true, interactionSource = interaction, cursorBrush = SolidColor(Cargo.Accent),
        keyboardOptions = KeyboardOptions(keyboardType = keyboard, imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { onSubmit?.invoke() ?: focus.clearFocus() }),
        decorationBox = { inner -> Box(Modifier.padding(horizontal = 13.dp, vertical = 9.dp)) {
            if (value.isEmpty()) Text(placeholder, maxLines = 1, softWrap = false, style = loanBody(13), color = Cargo.Ink.copy(alpha = .3f)); inner()
        } })
}

@Composable internal fun AdminChoice(label: String, value: String, options: List<Pair<String, String>>, change: (String) -> Unit,
    modifier: Modifier = Modifier) {
    var expanded by remember { mutableStateOf(false) }
    val display = options.firstOrNull { it.first == value }?.second.orEmpty()
    Box(modifier) {
        Row(Modifier.fillMaxWidth().height(35.dp).background(Cargo.Panel, RoundedCornerShape(8.dp)).border(1.dp, Cargo.Line, RoundedCornerShape(8.dp))
            .clickable(role = Role.DropdownList) { expanded = true }.semantics { contentDescription = "$label: ${display.uppercase()}" }
            .padding(horizontal = 13.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(display, Modifier.weight(1f), maxLines = 1, style = loanBody(13).copy(lineHeight = 17.sp), color = Cargo.Ink)
            Icon(painterResource(R.drawable.ic_chevron_down), null, Modifier.size(10.dp), tint = Cargo.Ink)
        }
        DropdownMenu(expanded, { expanded = false }) { options.forEach { (key, title) ->
            DropdownMenuItem(text = { Text(title, style = loanBody(13)) }, onClick = { change(key); expanded = false })
        } }
    }
}
@Composable internal fun AdminFieldLabel(text: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(text.uppercase(), style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f)); content()
    }
}
@Composable private fun AdminSection(text: String, count: Int = 0, warning: Boolean = false, intro: String? = null) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("[ $text ]", Modifier.testTag("admin-section-$text"), style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f))
            if (count > 0) Text(count.toString(), Modifier.background(if (warning) Cargo.Warn else Cargo.Accent).padding(horizontal = 8.dp, vertical = 2.dp),
                style = loanMono(10), color = if (warning) Color.Black else Cargo.Ink)
        }
        intro?.let { Text(it, Modifier.padding(top = 4.dp), style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f)) }
        Spacer(Modifier.height(16.dp))
    }
}
@Composable private fun AdminEmpty(title: String, code: String, body: String, icon: Int, tag: String) {
    Column(Modifier.fillMaxWidth().border(1.dp, Cargo.Line).background(Cargo.Panel).testTag(tag).padding(horizontal = 25.dp, vertical = 49.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(painterResource(icon), null, Modifier.size(28.dp), tint = Cargo.Accent)
        Text("[ $code ]", Modifier.padding(top = 16.dp), style = loanMono(10), color = Cargo.Accent)
        Text(title, Modifier.padding(top = 12.dp).testTag("$tag-title"), style = sourceDisplayTitleStyle(), color = Cargo.Ink, textAlign = TextAlign.Center)
        Text(body, Modifier.padding(top = 12.dp).widthIn(max = 384.dp), style = loanBody(13), color = Cargo.Ink.copy(alpha = .6f), textAlign = TextAlign.Center)
    }
}

@Composable internal fun AdminContent(data: AdminData, repository: BorrowRepository, actions: ScreenActions, openGroups: () -> Unit = {}, openLoan: (String) -> Unit) {
    val viewport = LocalWindowInfo.current.containerSize.width / LocalDensity.current.density
    var older by rememberSaveable { mutableStateOf(false) }
    // LazyColumn saves only currently visible item state across recreation. Keep
    // form providers above that boundary so an offscreen moderation/pin draft
    // survives the same lifecycle event as the visible form.
    val formState = rememberSaveableStateHolder()
    val incidents = if (older) data.incidents else data.incidents.take(30)
    Box(Modifier.fillMaxSize().imePadding(), contentAlignment = Alignment.TopCenter) {
        LazyColumn(Modifier.widthIn(max = 896.dp).fillMaxSize().testTag("admin-desk").semantics {
            this[AdminViewportWidth] = viewport.roundToInt(); this[AdminIncidentCount] = incidents.size; this[AdminIncidentTotal] = data.incidents.size
        }, contentPadding = PaddingValues(horizontal = if (viewport >= 800) 40.dp else 16.dp, vertical = 32.dp)) {
            item("header") {
                Text("[ CONTROL ROOM — ADMIN ONLY ]", style = loanMono(10), color = Cargo.Accent)
                Text("MODERATION DESK", Modifier.padding(top = 12.dp).testTag("admin-title"), style = sourceDisplayTitleStyle(), color = Cargo.Ink)
                AdminAction("Group chats — create, edit, members →", openGroups, Modifier.padding(top = 20.dp).testTag("admin-groups-link"),
                    AdminActionStyle.Secondary, fontSize = 11, start = true, rounded = false)
                actions.error?.let { Text("[ ${adminText(it)} ]", Modifier.padding(top = 24.dp).testTag("admin-action-error")
                    .fillMaxWidth().border(1.dp, Cargo.Warn.copy(alpha = .5f)).background(Cargo.Warn.copy(alpha = .1f)).padding(horizontal = 17.dp, vertical = 13.dp),
                    style = loanMono(10).copy(lineHeight = 20.sp), color = Cargo.Warn) }
                Spacer(Modifier.height(40.dp))
                AdminSection("VERIFICATION QUEUE", data.profiles.size, intro = "${data.profiles.size} STUDENT${if (data.profiles.size == 1) "" else "S"} WAITING FOR REVIEW.")
            }
            if (data.profiles.isEmpty()) item("verification-empty") {
                Text("QUEUE IS CLEAR. NEW SIGN-UPS LAND HERE WITH THEIR STUDENT ID.", Modifier.fillMaxWidth().border(1.dp, Cargo.Line).background(Cargo.Panel)
                    .padding(horizontal = 25.dp, vertical = 33.dp).testTag("admin-verification-empty"), style = loanMono(10), textAlign = TextAlign.Center, color = Cargo.Ink.copy(alpha = .5f))
            }
            itemsIndexed(data.profiles, key = { _, it -> "verification-${it.id}" }) { index, student ->
                if (index > 0) Spacer(Modifier.height(16.dp))
                formState.SaveableStateProvider("verification-${student.id}") { AdminVerification(student, viewport, repository, actions) }
            }
            item("incident-heading") { Spacer(Modifier.height(56.dp)); AdminSection("INCIDENT QUEUE", incidents.size, warning = true) }
            if (incidents.isEmpty()) item("incidents-empty") { AdminEmpty("NO OPEN INCIDENTS", "NO INCIDENTS", "DAMAGE, LOSS AND NO-SHOW REPORTS LAND HERE WITH PHOTOS FROM BOTH PARTIES.", R.drawable.ic_alert_triangle, "admin-incidents-empty") }
            itemsIndexed(incidents, key = { _, it -> "incident-${it.id}" }) { index, incident ->
                if (index > 0) Spacer(Modifier.height(16.dp))
                formState.SaveableStateProvider("incident-${incident.id}") { AdminIncident(incident, repository, actions, openLoan, viewport) }
            }
            if (!older && data.incidents.size > 30) item("older-incidents") { AdminAction("View older incidents", { older = true }, Modifier.padding(top = 16.dp).testTag("admin-older-incidents"), AdminActionStyle.Secondary) }
            item("fine-heading") { Spacer(Modifier.height(56.dp)); AdminSection("PENDING FINES", data.fines.size, warning = true) }
            if (data.fines.isEmpty()) item("fines-empty") { AdminEmpty("NO PENDING FINES", "NO FINES", "OVERDUE FINES AND INCIDENT FINES LAND HERE FOR YOU TO MARK SETTLED OR WAIVED.", R.drawable.ic_receipt, "admin-fines-empty") }
            itemsIndexed(data.fines, key = { _, it -> "fine-${it.id}" }) { index, fine ->
                if (index > 0) Spacer(Modifier.height(12.dp)); AdminFine(fine, repository, actions)
            }
            item("pin-heading") { Spacer(Modifier.height(56.dp)); AdminSection("CAMPUS PINS", data.locations.count { it.is_active && it.xp != null && it.yp != null },
                intro = "PINS WITH A MAP POSITION THAT ARE ON THE BOARD APPEAR ON THE LANDING WITHIN A MINUTE. DRAG THE DOT TO PLACE ONE.") }
            itemsIndexed(data.locations, key = { _, it -> "pin-${it.id}" }) { index, pin ->
                if (index > 0) Spacer(Modifier.height(12.dp))
                formState.SaveableStateProvider("pin-${pin.id}") { AdminPin(pin, repository, actions) }
            }
            item("add-pin") {
                Spacer(Modifier.height(12.dp))
                Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(21.dp).testTag("add-pin")) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(painterResource(R.drawable.ic_map_pin), null, Modifier.size(14.dp), tint = Cargo.Accent)
                        Text("[ ADD A PIN ]", style = loanMono(10), color = Cargo.Ink.copy(alpha = .6f))
                    }
                    Spacer(Modifier.height(16.dp))
                    formState.SaveableStateProvider("add-pin") { PinEditor(null, { name, description, x, y, label, active -> actions.run { savePin(repository, null, name, description, x, y, label, active) } }, actions.busy, sourceStyle = true) }
                }
                Row(Modifier.padding(top = 48.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(painterResource(R.drawable.ic_shield_check), null, Modifier.size(14.dp), tint = Cargo.Ink.copy(alpha = .4f))
                    Text("EVERY ADMIN ACTION HERE IS WRITTEN TO THE AUDIT LOG.", style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
                }
            }
        }
    }
}

@Composable private fun AdminVerification(student: Profile, viewport: Float, repository: BorrowRepository, actions: ScreenActions) {
    var note by rememberSaveable(student.id) { mutableStateOf("") }
    val approve = { actions.run { repository.rpc("admin_set_verification", buildJsonObject { put("p_profile_id", student.id); put("p_status", "verified"); put("p_note", JsonNull) }) } }
    val reject = { actions.run { repository.rpc("admin_set_verification", buildJsonObject { put("p_profile_id", student.id); put("p_status", "rejected"); put("p_note", note) }) } }
    @Composable fun Identity(modifier: Modifier) { Column(modifier.testTag("admin-identity-${student.id}")) {
        Text(adminText(student.full_name.ifBlank { "Unnamed student" }), Modifier.testTag("admin-student-name-${student.id}"), style = loanBody(15).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
        Text(student.email.uppercase(), Modifier.padding(top = 4.dp), style = loanMono(10), color = Cargo.Ink.copy(alpha = .5f))
        Text(adminText("${student.department ?: "No department"} · YEAR ${student.year_of_study ?: "NOT SET"}"), Modifier.padding(top = 4.dp), style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f))
        Text("SIGNED UP ${loanRelativeTime(student.created_at)}", Modifier.padding(top = 12.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
    } }
    @Composable fun Controls(modifier: Modifier) { Column(modifier, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        student.student_id_path?.let { path -> PrivatePhoto(repository, "student-ids", path, Modifier.fillMaxWidth(), label = "View student ID",
            labelContent = { click, enabled -> AdminAction("VIEW STUDENT ID", click, Modifier.fillMaxWidth().testTag("admin-id-link-${student.id}"), AdminActionStyle.Secondary, R.drawable.ic_external_link, enabled, 12, 12.dp, start = true, rounded = false, tracking = 0f) }) }
            ?: Text("[ NO STUDENT ID UPLOADED ]", Modifier.fillMaxWidth().border(1.dp, Cargo.Warn.copy(alpha = .5f)).background(Cargo.Warn.copy(alpha = .1f)).padding(horizontal = 17.dp, vertical = 13.dp), style = loanMono(9), color = Cargo.Warn)
        BoxWithConstraints {
            @Composable fun RejectForm() { Row(Modifier.widthIn(max = if (viewport < 640) 289.dp else 290.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                AdminInput("Rejection reason", note, { note = it }, Modifier.width(if (viewport < 640) 175.dp else 176.dp).testTag("admin-reason-${student.id}"), "Reason (sent to them)", 500, reject)
                AdminAction("Reject", reject, style = AdminActionStyle.Danger, icon = R.drawable.ic_x, enabled = !actions.busy)
            } }
            if (maxWidth >= 414.dp) Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                AdminAction("Approve", approve, style = AdminActionStyle.Primary, icon = R.drawable.ic_check, enabled = !actions.busy); RejectForm()
            } else Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                AdminAction("Approve", approve, icon = R.drawable.ic_check, enabled = !actions.busy); RejectForm()
            }
        }
    } }
    BoxWithConstraints(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).testTag("verification-${student.id}").padding(25.dp)) {
        if (viewport >= 800 && maxWidth >= 662.dp) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) { Identity(Modifier.width(224.dp)); Controls(Modifier.width(414.5.dp)) }
        else Column(verticalArrangement = Arrangement.spacedBy(24.dp)) { Identity(Modifier.fillMaxWidth()); Controls(Modifier.widthIn(max = 414.5.dp).fillMaxWidth()) }
    }
}

@Composable private fun AdminIncident(incident: Incident, repository: BorrowRepository, actions: ScreenActions, openLoan: (String) -> Unit, viewport: Float) {
    var decision by rememberSaveable(incident.id) { mutableStateOf("resolved") }; var note by rememberSaveable(incident.id) { mutableStateOf("") }
    var amount by rememberSaveable(incident.id) { mutableStateOf("") }; var fineUser by rememberSaveable(incident.id) { mutableStateOf(incident.loan?.borrower_id.orEmpty()) }
    val resolve = { actions.run {
        require(note.trim().length in 5..2000) { "Add a resolution note of at least five characters." }
        val fine = amount.takeIf { it.isNotBlank() }?.let { it.toIntOrNull() ?: error("Enter a whole fine amount.") }
        require(fine == null || fine in 0..100000) { "Fine must be ₹0–₹100000." }
        repository.rpc("resolve_incident", buildJsonObject { put("p_incident_id", incident.id); put("p_decision", decision); put("p_resolution_note", note.trim()); put("p_fine_amount", fine?.let(::JsonPrimitive) ?: JsonNull); put("p_fine_user_id", fineUser.takeIf { it.isNotBlank() }?.let(::JsonPrimitive) ?: JsonNull) })
    } }
    Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Warn.copy(alpha = .4f)).testTag("incident-${incident.id}").padding(25.dp)) {
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = adminBetween, verticalArrangement = Arrangement.spacedBy(16.dp), itemVerticalAlignment = Alignment.Top) {
            Column(Modifier.widthIn(max = 672.dp)) {
                Text(buildAnnotatedString { append(adminText(incident.type.replace('_', ' '))); append("  ")
                    withStyle(SpanStyle(fontFamily = Cargo.Mono, fontSize = 9.sp, letterSpacing = .72.sp, color = Cargo.Ink.copy(alpha = .5f))) {
                        append(adminText("${incident.loan?.item?.title ?: "LOAN"} · REPORTED BY ${incident.reporter?.full_name ?: "A PARTY"}")) }
                }, style = loanBody(15).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
                Text(adminText(incident.description), Modifier.padding(top = 8.dp).testTag("admin-incident-body-${incident.id}"), style = loanBody(13), color = Cargo.Ink.copy(alpha = .6f))
                Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("${loanRelativeTime(incident.created_at)} · LOAN ", style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
                    Text(incident.loan_id.take(8).uppercase(), Modifier.clickable { openLoan(incident.loan_id) }.semantics { contentDescription = "Open loan →" }, style = loanMono(9), color = Cargo.Accent)
                }
            }
            Text(adminText(incident.status.replace('_', ' ')), Modifier.background(Cargo.Warn.copy(alpha = .1f), CircleShape).border(1.dp, Cargo.Warn.copy(alpha = .5f), CircleShape).padding(horizontal = 11.dp, vertical = 5.dp), style = loanMono(9), color = Cargo.Warn)
        }
        if (incident.photos.isNotEmpty()) FlowRow(Modifier.padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            incident.photos.forEach { PrivatePhoto(repository, "incident-photos", it.path, Modifier.size(96.dp).border(1.dp, Cargo.Line).testTag("admin-photo-${it.id}"), previewScale = ContentScale.Crop) }
        }
        Column(Modifier.padding(top = 20.dp).fillMaxWidth()) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(Cargo.Line)); Spacer(Modifier.height(20.dp))
            BoxWithConstraints {
                val includeUser = viewport >= 640 && maxWidth >= 673.dp
                val userWidth = 170.dp
                @Composable fun Who() { AdminFieldLabel("FINE CHARGED TO") { AdminChoice("Fine charged to", fineUser,
                    incident.loan?.let { listOf(it.borrower_id to (it.borrower?.full_name ?: "Borrower"), it.owner_id to (it.owner?.full_name ?: "Owner")) } ?: emptyList(), { fineUser = it }, Modifier.width(userWidth)) } }
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Bottom) {
                        AdminFieldLabel("DECISION") { AdminChoice("Decision", decision, listOf("resolved" to "Resolved", "rejected" to "Rejected"), { decision = it }, Modifier.width(99.dp)) }
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("RESOLUTION NOTE", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                            AdminInput("Resolution note", note, { note = it }, Modifier.fillMaxWidth().testTag("admin-resolution-${incident.id}"), "What did you decide, and why?", 2000, resolve)
                        }
                        AdminFieldLabel("FINE (INR)") { AdminInput("Fine (INR, optional)", amount, { amount = it }, Modifier.width(112.dp), "0", keyboard = KeyboardType.Number) }
                        if (includeUser) Who()
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Bottom) { if (!includeUser) Who(); AdminAction("Resolve", resolve, enabled = !actions.busy) }
                }
            }
        }
    }
}

@Composable private fun AdminFine(fine: Fine, repository: BorrowRepository, actions: ScreenActions) {
    FlowRow(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).testTag("fine-${fine.id}").padding(21.dp),
        horizontalArrangement = adminBetween, verticalArrangement = Arrangement.spacedBy(16.dp), itemVerticalAlignment = Alignment.CenterVertically) {
        Column {
            Text(adminText("${fine.user?.full_name ?: "Student"} · ${ledgerMoney(fine.amount)}"), Modifier.testTag("admin-fine-title-${fine.id}"), style = loanBody(13).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
            Text(adminText(fine.reason), Modifier.padding(top = 4.dp), style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f))
            Text("${fine.source.uppercase()} · ${loanRelativeTime(fine.created_at)}", Modifier.padding(top = 4.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AdminAction("Settled", { actions.run { repository.rpc("settle_fine", buildJsonObject { put("p_fine_id", fine.id); put("p_action", "settle") }) } }, enabled = !actions.busy, icon = R.drawable.ic_check)
            AdminAction("Waive", { actions.run { repository.rpc("settle_fine", buildJsonObject { put("p_fine_id", fine.id); put("p_action", "waive") }) } }, style = AdminActionStyle.Secondary, enabled = !actions.busy)
        }
    }
}

@Composable private fun AdminPin(pin: PickupLocation, repository: BorrowRepository, actions: ScreenActions) {
    var expanded by rememberSaveable(pin.id) { mutableStateOf(false) }; var deleting by rememberSaveable(pin.id) { mutableStateOf(false) }
    if (deleting) AlertDialog(onDismissRequest = { deleting = false }, title = { CargoTitle("Remove pin?") }, text = { CargoBody("Listings using this pickup point will need to coordinate pickup in chat.") },
        confirmButton = { TextButton({ deleting = false; actions.run { repository.rpc("admin_delete_pickup_location", buildJsonObject { put("p_id", pin.id) }) } }) { CargoLabel("Remove", Cargo.Warn) } }, dismissButton = { TextButton({ deleting = false }) { CargoLabel("Keep pin") } })
    Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).testTag("pin-${pin.id}")) {
        FlowRow(Modifier.fillMaxWidth().padding(21.dp), horizontalArrangement = adminBetween, verticalArrangement = Arrangement.spacedBy(16.dp), itemVerticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.widthIn(max = 640.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(80.dp, 60.dp).border(1.dp, Cargo.Line).testTag("admin-pin-preview-${pin.id}"), contentAlignment = Alignment.Center) {
                    if (pin.xp != null && pin.yp != null) {
                        AsyncImage(R.drawable.campus_map, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        Canvas(Modifier.fillMaxSize()) { val point = androidx.compose.ui.geometry.Offset(size.width * pin.xp.toFloat() / 100, size.height * pin.yp.toFloat() / 100)
                            drawCircle(Color(0xFF0C0906), 4.dp.toPx(), point); drawCircle(Color(0xFFFFCF7A), 3.dp.toPx(), point) }
                    } else Text("NO MAP", style = loanMono(8), color = Cargo.Ink.copy(alpha = .4f))
                }
                Column(Modifier.weight(1f, fill = false)) {
                    Text(adminText(pin.name), style = loanBody(13).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
                    Text(adminText(pin.description ?: "No description"), Modifier.padding(top = 4.dp), style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f))
                    Text((if (pin.xp != null && pin.yp != null) "MAP ${"%.1f".format(java.util.Locale.ENGLISH, pin.xp)}% / ${"%.1f".format(java.util.Locale.ENGLISH, pin.yp)}% · LABEL ${pin.map_label.uppercase()}" else "NO MAP POSITION") + " · " + if (pin.is_active) "ON THE BOARD" else "HIDDEN",
                        Modifier.padding(top = 4.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
                }
            }
            AdminAction("Remove", { deleting = true }, style = AdminActionStyle.Danger, enabled = !actions.busy)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Cargo.Line))
        Row(Modifier.fillMaxWidth().clickable(role = Role.Button) { expanded = !expanded }.semantics { stateDescription = if (expanded) "Expanded" else "Collapsed" }.padding(horizontal = 20.dp, vertical = 12.dp)) {
            Text(if (expanded) "▾ " else "▸ ", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
            Text("[ EDIT PIN ]", Modifier.semantics { contentDescription = "Edit pin" }, style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
        }
        if (expanded) { Box(Modifier.fillMaxWidth().height(1.dp).background(Cargo.Line)); Box(Modifier.padding(start = 21.dp, end = 21.dp, top = 20.dp, bottom = 21.dp)) {
            PinEditor(pin, { name, description, x, y, label, active -> actions.run { savePin(repository, pin.id, name, description, x, y, label, active) } }, actions.busy, sourceStyle = true)
        } }
    }
}
