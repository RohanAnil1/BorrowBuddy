package `in`.borrowbuddy.android.ui

import android.icu.text.NumberFormat
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.*
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.borrowbuddy.android.R
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import java.util.Locale
import kotlin.math.roundToInt

val LedgerFineCount = SemanticsPropertyKey<Int>("LedgerFineCount")
val LedgerOutstanding = SemanticsPropertyKey<Int>("LedgerOutstanding")
val AccountViewportWidth = SemanticsPropertyKey<Int>("AccountViewportWidth")
private fun accountWebText(value: String) = value.replace(Regex("[\\t\\n\\r\\u000C ]+"), " ").trim(' ').uppercase()
internal fun ledgerMoney(amount: Int): String = if (amount == 0) "NO DEPOSIT" else
    NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-IN")).apply { maximumFractionDigits = 0 }.format(amount)
@Composable private fun accountViewport() = LocalWindowInfo.current.containerSize.width / LocalDensity.current.density
@Composable internal fun sourceDisplayTitleStyle(viewport: Float = accountViewport()) = (viewport * .06f).coerceIn(40f, 64f).let { size ->
    loanBody(40).copy(fontFamily = Cargo.Title, fontSize = size.sp, lineHeight = (size * 1.05f).sp, letterSpacing = (size * .01f).sp,
        platformStyle = PlatformTextStyle(includeFontPadding = false),
        lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.Both, LineHeightStyle.Mode.Tight))
}
@Composable private fun SourceBadge(text: String, tone: String) {
    val (ink, border, background) = when (tone) {
        "success" -> Triple(Cargo.Accent, Cargo.Accent.copy(alpha = .6f), Cargo.Accent.copy(alpha = .15f))
        "danger" -> Triple(Cargo.Warn, Cargo.Warn, Cargo.Warn.copy(alpha = .2f))
        "warning" -> Triple(Cargo.Warn, Cargo.Warn.copy(alpha = .5f), Cargo.Warn.copy(alpha = .1f))
        "info" -> Triple(Cargo.Ink, Cargo.Ink.copy(alpha = .5f), Color.Black)
        else -> Triple(Cargo.Ink.copy(alpha = .5f), Cargo.Line, Color.Transparent)
    }
    Text(accountWebText(text), Modifier.background(background, CircleShape).border(1.dp, border, CircleShape)
        .padding(horizontal = 11.dp, vertical = 5.dp), style = loanMono(9), color = ink)
}

@Composable fun FinesScreen(repository: BorrowRepository, profile: Profile, openLoan: (String) -> Unit) {
    val list = rememberLazyListState()
    LoadScreen(profile.id, { repository.fines(profile.id) }) { fines ->
        val outstanding = fines.filter { it.status == "pending" }.sumOf { it.amount }
        val viewport = accountViewport()
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            LazyColumn(Modifier.widthIn(max = 768.dp).fillMaxSize().testTag("fines-ledger").semantics {
                this[LedgerFineCount] = fines.size; this[LedgerOutstanding] = outstanding
                this[AccountViewportWidth] = viewport.roundToInt()
            }, state = list, contentPadding = PaddingValues(horizontal = if (viewport >= 800) 40.dp else 16.dp, vertical = 32.dp)) {
                item("heading") {
                    Text("[ ACCOUNTABILITY LEDGER ]", style = loanMono(10), color = Cargo.Accent)
                    Text("FINES", Modifier.padding(top = 12.dp), style = sourceDisplayTitleStyle(), color = Cargo.Ink, overflow = TextOverflow.Visible)
                    FlowRow(Modifier.padding(top = 24.dp).fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(25.dp).testTag("ledger-summary"),
                        horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                        Column {
                            Text("OUTSTANDING", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                            Text(ledgerMoney(outstanding), Modifier.padding(top = 4.dp).testTag("ledger-total"), style = sourceDisplayTitleStyle(), color = Cargo.Ink, overflow = TextOverflow.Visible)
                        }
                        Text("FINES ARE SETTLED IN PERSON (CASH OR UPI) AND MARKED OFF BY AN ADMIN. BORROWBUDDY NEVER TAKES A CUT, AND THE PLATFORM HOLDS NO MONEY.",
                            Modifier.widthIn(max = 384.dp), style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f))
                    }
                    Spacer(Modifier.height(32.dp))
                }
                if (fines.isEmpty()) item("empty") {
                    Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(horizontal = 25.dp, vertical = 49.dp).testTag("ledger-empty"),
                        horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(painterResource(R.drawable.ic_receipt), null, Modifier.size(28.dp), tint = Cargo.Accent)
                        Text("[ CLEAN LEDGER ]", Modifier.padding(top = 16.dp), style = loanMono(10), color = Cargo.Accent)
                        Text("NO FINES ON RECORD", Modifier.padding(top = 12.dp), style = sourceDisplayTitleStyle(), textAlign = TextAlign.Center, color = Cargo.Ink, overflow = TextOverflow.Visible)
                        Text("OVERDUE LOANS ACCRUE ₹20 PER DAY, CAPPED AT ₹1,000. RETURN ON TIME AND THIS PAGE STAYS EMPTY.",
                            Modifier.padding(top = 12.dp).widthIn(max = 384.dp), style = loanBody(13), textAlign = TextAlign.Center, color = Cargo.Ink.copy(alpha = .6f))
                    }
                }
                itemsIndexed(fines, key = { _, fine -> fine.id }) { index, fine ->
                    if (index > 0) Spacer(Modifier.height(12.dp))
                    FlowRow(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(21.dp).testTag("fine-${fine.id}"),
                        horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(16.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                        Column {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                                Text(ledgerMoney(fine.amount), style = loanBody(14).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
                                Text(accountWebText(fine.source), style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                            }
                            Text(accountWebText(fine.reason), Modifier.padding(top = 4.dp), style = loanBody(13).copy(lineBreak = LineBreak.Paragraph), color = Cargo.Ink.copy(alpha = .6f))
                            val loan = fine.loan
                            if (loan == null) Text(loanRelativeTime(fine.created_at), Modifier.padding(top = 8.dp).testTag("fine-time-${fine.id}"), style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
                            else {
                                val interactions = remember { MutableInteractionSource() }
                                val hover by interactions.collectIsHoveredAsState()
                                val focus by interactions.collectIsFocusedAsState()
                                val ink by animateColorAsState(if (hover || focus) Cargo.Accent else Cargo.Ink.copy(alpha = .4f), tween(if (rememberReducedMotion()) 0 else 150), label = "fine-link")
                                Box(Modifier.padding(top = 8.dp).heightIn(min = 48.dp).testTag("fine-loan-${fine.id}")
                                    .clickable(interactionSource = interactions, indication = null, role = Role.Button, onClickLabel = "Open related loan") { openLoan(loan.id) }.wrapContentHeight()) {
                                    Text(buildAnnotatedString {
                                        withStyle(SpanStyle(color = ink, textDecoration = if (hover || focus) TextDecoration.Underline else TextDecoration.None)) {
                                            append("${accountWebText(loan.item?.title ?: "Loan")} ·")
                                        }
                                        withStyle(SpanStyle(color = Cargo.Ink.copy(alpha = .4f))) { append(" ${loanRelativeTime(fine.created_at)}") }
                                    }, Modifier.testTag("fine-time-${fine.id}"), style = loanMono(9).copy(lineBreak = LineBreak.Paragraph))
                                }
                            }
                        }
                        SourceBadge(fine.status, when (fine.status) { "pending" -> "danger"; "waived" -> "muted"; else -> "success" })
                    }
                }
            }
        }
    }
}

@Composable fun AccountScreen(model: SessionViewModel, profile: Profile, publicProfile: () -> Unit, fines: () -> Unit, map: () -> Unit) {
    val actions = rememberActions()
    val session by model.state.collectAsState()
    var submitting by remember { mutableStateOf(false) }
    var signingOut by remember { mutableStateOf(false) }
    LaunchedEffect(session.error) { if (session.error != null) signingOut = false }
    val busy = actions.busy || submitting || signingOut || session.busy
    var name by rememberSaveable(profile.id) { mutableStateOf(profile.full_name) }
    var phone by rememberSaveable(profile.id) { mutableStateOf(profile.phone.orEmpty()) }
    var department by rememberSaveable(profile.id) { mutableStateOf(profile.department.orEmpty()) }
    var year by rememberSaveable(profile.id) { mutableIntStateOf(profile.year_of_study ?: 1) }
    val keyboard = LocalSoftwareKeyboardController.current
    val focus = LocalFocusManager.current
    fun saveDetails() {
        if (actions.busy || submitting || signingOut || session.busy) return
        submitting = true
        keyboard?.hide(); focus.clearFocus()
        actions.run("Profile updated.", refresh = false) {
            try { model.repository.updateProfile(profile, name, phone, department, year); model.refresh() }
            finally { submitting = false }
        }
    }
    // Stamps need a verified viewer; pending students see the card without them.
    LoadScreen(profile.id, { coroutineScope {
        val stamps = async { if (profile.verification_status == "verified") model.repository.profileStamps(profile.id) else null }
        model.repository.fines(profile.id).filter { it.status == "pending" }.sumOf { it.amount } to stamps.await()
    } }) { (outstanding, stamps) ->
        val viewport = accountViewport()
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 768.dp).fillMaxSize().imePadding().verticalScroll(rememberScrollState())
                .padding(horizontal = if (viewport >= 800) 40.dp else 16.dp, vertical = 32.dp).testTag("account-page")
                .semantics { this[AccountViewportWidth] = viewport.roundToInt() }) {
                Text("[ CREW FILE ]", style = loanMono(10), color = Cargo.Accent)
                Text(accountWebText(profile.full_name.ifBlank { "Your profile" }), Modifier.padding(top = 12.dp), style = sourceDisplayTitleStyle(), color = Cargo.Ink, overflow = TextOverflow.Visible)
                Text(profile.email.uppercase(), Modifier.padding(top = 8.dp), style = loanMono(10), color = Cargo.Ink.copy(alpha = .5f))
                FlowRow(Modifier.padding(top = 24.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                    SourceBadge(if (profile.verification_status == "verified") "Verified student" else profile.verification_status, if (profile.verification_status == "verified") "success" else "danger")
                    SourceBadge("Trust score ${profile.trust_score.roundToInt()}", "muted")
                    if (profile.is_admin) SourceBadge("Admin", "info")
                }
                MemberIdCard(profile, Modifier.padding(top = 32.dp), stamps, ownerStamps = true)
                val cards: @Composable RowScope.() -> Unit = {
                    AccountLink("[ FINES ]", if (outstanding > 0) "₹$outstanding OUTSTANDING" else "NOTHING OUTSTANDING", R.drawable.ic_receipt, fines, Modifier.weight(1f).testTag("account-fines"))
                    AccountLink("[ PICKUP MAP ]", "CAMPUS HANDOVER SPOTS", R.drawable.ic_map, map, Modifier.weight(1f).testTag("account-map"))
                }
                if (viewport >= 640) Row(Modifier.padding(top = 32.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), content = cards)
                else Column(Modifier.padding(top = 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    AccountLink("[ FINES ]", if (outstanding > 0) "₹$outstanding OUTSTANDING" else "NOTHING OUTSTANDING", R.drawable.ic_receipt, fines, Modifier.fillMaxWidth().testTag("account-fines"))
                    AccountLink("[ PICKUP MAP ]", "CAMPUS HANDOVER SPOTS", R.drawable.ic_map, map, Modifier.fillMaxWidth().testTag("account-map"))
                }
                Column(Modifier.padding(top = 32.dp).fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(25.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    Text("[ YOUR DETAILS ]", style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f))
                    if (viewport >= 640) {
                        Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                            AccountInput("FULL NAME", name, { if (it.length <= 80) name = it }, Modifier.weight(1f), busy = busy, onSubmit = ::saveDetails)
                            AccountInput("PHONE", phone, { if (it.length <= 10) phone = it }, Modifier.weight(1f), "10-digit mobile", KeyboardType.Phone, busy, ::saveDetails)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                            AccountChoice("DEPARTMENT", department, Rules.departments.map { it to it }, { department = it }, Modifier.weight(1f), busy)
                            AccountChoice("YEAR OF STUDY", year.toString(), ((1..5).toList() + listOf(year).filter { it > 5 }).map { it.toString() to "Year $it" }, { year = it.toInt() }, Modifier.weight(1f), busy)
                        }
                    } else {
                        AccountInput("FULL NAME", name, { if (it.length <= 80) name = it }, busy = busy, onSubmit = ::saveDetails)
                        AccountInput("PHONE", phone, { if (it.length <= 10) phone = it }, placeholder = "10-digit mobile", keyboard = KeyboardType.Phone, busy = busy, onSubmit = ::saveDetails)
                        AccountChoice("DEPARTMENT", department, Rules.departments.map { it to it }, { department = it }, busy = busy)
                        AccountChoice("YEAR OF STUDY", year.toString(), ((1..5).toList() + listOf(year).filter { it > 5 }).map { it.toString() to "Year $it" }, { year = it.toInt() }, busy = busy)
                    }
                    actions.error?.let { AccountNotice(it, false) }
                    actions.success?.let { AccountNotice(it, true) }
                    SourceSubmitButton(if (actions.busy || submitting) "Saving…" else "Save details", ::saveDetails, enabled = !busy)
                }
                session.error?.let { AccountNotice(it, false) }
                Box(Modifier.padding(top = 32.dp)) {
                    SourceSubmitButton(if (signingOut || session.busy) "Signing out…" else "Sign out", { if (!signingOut && !submitting && !actions.busy && !session.busy) { signingOut = true; model.signOut() } }, enabled = !busy, secondary = true, icon = R.drawable.ic_log_out)
                }
                // Preserve native public-profile access below the source account sections.
                Text("VIEW PUBLIC PROFILE →", Modifier.padding(top = 16.dp).heightIn(min = 48.dp).clickable(role = Role.Button, onClick = publicProfile).wrapContentHeight(), style = loanMono(10), color = Cargo.Accent)
            }
        }
    }
}

@Composable private fun AccountNotice(message: String, success: Boolean) {
    val color = if (success) Cargo.Accent else Cargo.Warn
    Text("[ ${accountWebText(message)} ]", Modifier.fillMaxWidth().background(color.copy(alpha = .1f)).border(1.dp, color.copy(alpha = .5f)).padding(horizontal = 16.dp, vertical = 12.dp), style = loanMono(10), color = color)
}
@Composable private fun AccountLink(title: String, detail: String, icon: Int, click: () -> Unit, modifier: Modifier) {
    val interactions = remember { MutableInteractionSource() }
    val hover by interactions.collectIsHoveredAsState(); val focused by interactions.collectIsFocusedAsState()
    val border by animateColorAsState(if (hover || focused) Cargo.Accent else Cargo.Line, tween(if (rememberReducedMotion()) 0 else 150), label = "account-link")
    Row(modifier.background(Cargo.Panel).border(1.dp, border).clickable(interactionSource = interactions, indication = null, role = Role.Button, onClickLabel = title, onClick = click).padding(21.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(painterResource(icon), null, Modifier.size(16.dp), tint = Cargo.Accent)
                Text(title, style = loanMono(11), color = Cargo.Ink)
            }
            Text(detail, Modifier.padding(top = 4.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
        }
        Text("OPEN →", style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
    }
}
@Composable private fun AccountInput(label: String, value: String, change: (String) -> Unit, modifier: Modifier = Modifier,
    placeholder: String = "", keyboard: KeyboardType = KeyboardType.Text, busy: Boolean = false, onSubmit: () -> Unit) {
    val interactions = remember { MutableInteractionSource() }; val focused by interactions.collectIsFocusedAsState()
    val border by animateColorAsState(if (focused) Cargo.Accent else Cargo.Line, tween(if (rememberReducedMotion()) 0 else 150), label = "account-field-focus")
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = loanMono(10), color = Cargo.Ink.copy(alpha = .5f))
        BasicTextField(value, change, Modifier.fillMaxWidth().heightIn(min = 48.dp).background(Color.Black, RoundedCornerShape(8.dp))
            .border(1.dp, border, RoundedCornerShape(8.dp)).padding(horizontal = 17.dp, vertical = 13.dp).semantics { contentDescription = label },
            enabled = !busy, textStyle = loanBody(14).copy(color = Cargo.Ink), cursorBrush = SolidColor(Cargo.Accent), singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = keyboard, imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { onSubmit() }), interactionSource = interactions,
            decorationBox = { input -> Box { if (value.isEmpty() && placeholder.isNotEmpty()) Text(placeholder, style = loanBody(14), color = Cargo.Ink.copy(alpha = .4f)); input() } })
    }
}
@Composable private fun AccountChoice(label: String, value: String, choices: List<Pair<String, String>>, change: (String) -> Unit, modifier: Modifier = Modifier, busy: Boolean = false) {
    var expanded by remember { mutableStateOf(false) }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = loanMono(10), color = Cargo.Ink.copy(alpha = .5f))
        Box {
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).background(Color.Black, RoundedCornerShape(8.dp)).border(1.dp, if (expanded) Cargo.Accent else Cargo.Line, RoundedCornerShape(8.dp))
                .clickable(enabled = !busy, role = Role.DropdownList, onClickLabel = label) { expanded = true }.semantics { contentDescription = label }.padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(choices.find { it.first == value }?.second ?: "Choose", Modifier.weight(1f), style = loanBody(14), color = Cargo.Ink)
                Icon(painterResource(R.drawable.ic_chevron_down), null, Modifier.size(14.dp), tint = Cargo.Ink)
            }
            DropdownMenu(expanded, { expanded = false }) {
                choices.forEach { (key, title) -> DropdownMenuItem(text = { Text(title, style = loanBody(14)) }, onClick = { change(key); expanded = false }) }
            }
        }
    }
}
@Composable internal fun SourceSubmitButton(text: String, click: () -> Unit, enabled: Boolean, secondary: Boolean = false, icon: Int? = null) {
    val interactions = remember { MutableInteractionSource() }; val hover by interactions.collectIsHoveredAsState(); val focus by interactions.collectIsFocusedAsState()
    val duration = if (rememberReducedMotion()) 0 else 150
    val alpha by animateFloatAsState(if (!enabled) .6f else if (!secondary && (hover || focus)) .9f else 1f, tween(duration), label = "account-button-opacity")
    val border by animateColorAsState(if (secondary && (hover || focus)) Cargo.Accent else if (secondary) Cargo.Line else Cargo.Accent, tween(duration), label = "account-button-border")
    val color by animateColorAsState(if (secondary) { if (hover || focus) Cargo.Accent else Cargo.Ink } else Cargo.Ink,
        tween(if (rememberReducedMotion()) 0 else 150), label = "account-button")
    Row(Modifier.heightIn(min = 48.dp).graphicsLayer { this.alpha = alpha }.background(if (secondary) Color.Transparent else Cargo.Accent, RoundedCornerShape(8.dp))
        .border(1.dp, border, RoundedCornerShape(8.dp))
        .clickable(interactionSource = interactions, indication = null, enabled = enabled, role = Role.Button, onClick = click).padding(horizontal = 16.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        icon?.let { Icon(painterResource(it), null, Modifier.size(16.dp), tint = color) }
        Text(text.uppercase(), style = loanBody(13).copy(fontFamily = Cargo.Strong, letterSpacing = .52.sp), color = color)
    }
}
