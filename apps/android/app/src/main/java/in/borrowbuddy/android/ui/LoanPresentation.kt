package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.domain.Loan
import `in`.borrowbuddy.android.domain.Rules
import android.icu.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

private val lineBox = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None)
internal fun loanMono(size: Int) = TextStyle(fontFamily = Cargo.Mono, fontSize = size.sp,
    lineHeight = (size * 1.5).sp, letterSpacing = (size * .08).sp, lineHeightStyle = lineBox)
internal fun loanBody(size: Int) = TextStyle(fontFamily = Cargo.Body, fontSize = size.sp,
    lineHeight = (size * 1.5).sp, lineHeightStyle = lineBox)

internal fun loanDateRange(start: String, end: String): String {
    val formatter = DateTimeFormatter.ofPattern("d MMM uuuu", Locale.forLanguageTag("en-IN"))
    fun date(value: String) = runCatching { LocalDate.parse(value).format(formatter) }.getOrDefault(value)
    return if (start == end) date(start) else "${date(start)} - ${date(end)}"
}

internal fun loanRelativeTime(value: String, now: Instant = Instant.now()): String {
    val instant = runCatching { Instant.parse(value) }.getOrNull() ?: return value
    val minutes = ((now.toEpochMilli() - instant.toEpochMilli()) / 60_000.0).roundToInt()
    if (minutes < 1) return "JUST NOW"
    if (minutes < 60) return "${minutes}M AGO"
    val hours = (minutes / 60.0).roundToInt()
    if (hours < 24) return "${hours}H AGO"
    val days = (hours / 24.0).roundToInt()
    if (days < 7) return "${days}D AGO"
    return DateTimeFormatter.ofPattern("d MMM", Locale.forLanguageTag("en-IN"))
        .withZone(ZoneId.systemDefault()).format(instant).uppercase()
}

@Composable fun LoanStatusBadge(status: String) {
    val (foreground, border, background) = when (status) {
        "awaiting_pickup", "return_pending" -> Triple(Cargo.Ink, Cargo.Ink.copy(alpha = .5f), Color.Black)
        "active" -> Triple(Cargo.Accent, Cargo.Accent.copy(alpha = .6f), Cargo.Accent.copy(alpha = .15f))
        "returned" -> Triple(Cargo.Ink.copy(alpha = .5f), Cargo.Line, Color.Transparent)
        "overdue", "lost" -> Triple(Cargo.Warn, Cargo.Warn, Cargo.Warn.copy(alpha = .2f))
        "disputed" -> Triple(Cargo.Warn, Cargo.Warn.copy(alpha = .5f), Cargo.Warn.copy(alpha = .1f))
        else -> Triple(Cargo.Ink.copy(alpha = .7f), Cargo.Line, Cargo.Panel)
    }
    Text((Rules.loanLabels[status] ?: status.replace('_', ' ')).uppercase(),
        Modifier.background(background, CircleShape).border(1.dp, border, CircleShape)
            .padding(horizontal = 10.dp, vertical = 4.dp), color = foreground, style = loanMono(9))
}

@Composable internal fun LoanPage(content: @Composable ColumnScope.() -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = maxWidth >= 800.dp
        Box(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()), contentAlignment = Alignment.TopCenter) {
            Column(Modifier.widthIn(max = 896.dp).fillMaxWidth()
                .padding(horizontal = if (wide) 40.dp else 16.dp, vertical = 32.dp), content = content)
        }
    }
}

val LoanFactColumns = SemanticsPropertyKey<Int>("LoanFactColumns")
@Composable internal fun LoanFacts(loan: Loan, userId: String) {
    val other = if (loan.owner_id == userId) loan.borrower else loan.owner
    val deposit = remember(loan.item?.deposit_amount) {
        val amount = loan.item?.deposit_amount ?: 0
        if (amount == 0) "NO DEPOSIT" else NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-IN"))
            .apply { maximumFractionDigits = 0 }.format(amount)
    }
    val facts = listOf(
        Triple(R.drawable.ic_calendar_days, "DATES", loanDateRange(loan.start_date, loan.due_date)),
        Triple(R.drawable.ic_wallet, "DEPOSIT", deposit),
        Triple(R.drawable.ic_star, "COUNTERPARTY TRUST", (other?.trust_score?.roundToInt() ?: 70).toString()),
        Triple(R.drawable.ic_map_pin, "HANDOVER", "IN-APP 6-DIGIT CODE"),
    )
    Box(Modifier.fillMaxWidth().testTag("loan-facts")) {
        // Source breakpoints use the viewport, including the page's horizontal gutters.
        val viewport = androidx.compose.ui.platform.LocalWindowInfo.current.containerSize.width /
            androidx.compose.ui.platform.LocalDensity.current.density
        val columns = when { viewport >= 1024f -> 4; viewport >= 640f -> 2; else -> 1 }
        Column(Modifier.fillMaxWidth().semantics { this[LoanFactColumns] = columns }, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            facts.chunked(columns).forEach { group ->
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    group.forEach { (icon, label, value) ->
                        Column(Modifier.weight(1f).fillMaxHeight().testTag("loan-fact-$label").background(Cargo.Panel).border(1.dp, Cargo.Line).padding(21.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(painterResource(icon), null, Modifier.size(14.dp), tint = Cargo.Ink.copy(alpha = .5f))
                                Text(label, style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                            }
                            Text(value.uppercase(), Modifier.padding(top = 8.dp), style = loanBody(13).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
                        }
                    }
                }
            }
        }
    }
}

@Composable internal fun CustodyTimeline(loan: Loan) {
    data class Step(val label: String, val at: String?, val done: Boolean)
    val steps = listOf(
        Step("REQUESTED", loan.created_at, true),
        Step("APPROVED", loan.pickup_confirmed_at ?: loan.updated_at, loan.status != "awaiting_pickup"),
        Step("PICKED UP", loan.pickup_confirmed_at, loan.pickup_confirmed_at != null),
        Step("RETURNED", loan.returned_at, loan.returned_at != null),
    )
    CargoPanel(modifier = Modifier.testTag("custody-timeline"), padding = 24.dp, spacing = 20.dp) {
        Text("[ CUSTODY CHAIN ]", style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f))
        Column {
            steps.forEachIndexed { index, step ->
                Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min).testTag("custody-${step.label}")
                    .semantics { stateDescription = if (step.done) "Completed" else "Pending" }, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.width(12.dp).fillMaxHeight()) {
                        if (index < steps.lastIndex) Box(Modifier.align(Alignment.TopCenter).padding(top = 12.dp)
                            .width(2.dp).fillMaxHeight().background(if (step.done) Cargo.Accent.copy(alpha = .6f) else Cargo.Ink.copy(alpha = .15f)))
                        Box(Modifier.size(12.dp).background(if (step.done) Cargo.Accent else Color.Transparent, CircleShape)
                            .border(2.dp, if (step.done) Cargo.Accent else Cargo.Ink.copy(alpha = .3f), CircleShape))
                    }
                    Column(Modifier.weight(1f).padding(bottom = if (index < steps.lastIndex) 16.dp else 0.dp)) {
                        Text(step.label, style = loanMono(10), color = Cargo.Ink.copy(alpha = if (step.done) 1f else .4f))
                        if (step.done && !step.at.isNullOrBlank()) Text(loanRelativeTime(step.at), Modifier.padding(top = 4.dp),
                            style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
                    }
                }
            }
        }
    }
}
