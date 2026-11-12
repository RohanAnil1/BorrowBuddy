package `in`.borrowbuddy.android.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import `in`.borrowbuddy.android.BuildConfig
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.data.BuddyMood
import `in`.borrowbuddy.android.domain.Loan
import `in`.borrowbuddy.android.domain.Rules
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/** One of the four "Today" cards: a count, what it means, and where to clear it. */
data class TodayCard(val label: String, val value: String, val hint: String, val icon: Int, val hot: Boolean, val open: () -> Unit, val tag: String)

@Composable fun TodayStrip(cards: List<TodayCard>, columns: Int) {
    Column(Modifier.fillMaxWidth().testTag("dashboard-today"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        cards.chunked(columns).forEach { row ->
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { card ->
                    Column(Modifier.weight(1f).fillMaxHeight().testTag(card.tag).background(Cargo.Panel)
                        .border(1.dp, if (card.hot) Cargo.Accent.copy(alpha = .6f) else Cargo.Line).clickable(onClick = card.open)
                        .semantics { contentDescription = "${card.label}: ${card.value}. ${card.hint}" }.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text(card.label.uppercase(), style = loanMono(10), color = Cargo.Ink.copy(alpha = .75f))
                            Icon(painterResource(card.icon), null, Modifier.size(16.dp), tint = if (card.hot) Cargo.Accent else Cargo.Ink.copy(alpha = .5f))
                        }
                        Text(card.value, style = loanBody(32).copy(fontFamily = Cargo.Title, lineHeight = 32.sp), color = if (card.hot) Cargo.Accent else Cargo.Ink)
                        Text(card.hint, style = loanBody(12), color = Cargo.Ink.copy(alpha = .65f))
                    }
                }
                repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/** Parcel with one contextual line; tapping Parcel opens Buddy. */
@Composable fun ParcelGreeting(line: String, mood: BuddyMood, openBuddy: () -> Unit) {
    Row(Modifier.fillMaxWidth().testTag("dashboard-parcel"), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.clickable(onClick = openBuddy).semantics { contentDescription = "Ask Buddy" }) {
            ParcelMascot(mood, 84.dp, interactive = false, description = null)
        }
        Text(line, Modifier.padding(bottom = 24.dp).widthIn(max = 260.dp).background(Cargo.Paper, RoundedCornerShape(16.dp, 16.dp, 16.dp, 4.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp), style = loanBody(14).copy(lineHeight = 19.sp), color = Color.Black)
    }
}

private enum class PassTone { Calm, Soon, Late, Done }
private val passCalm = Color(0xff0b6b3a)
private val passSoon = Color(0xffb25e00)
private val passLate = Color(0xffc0261a)

/** Due at 23:59 campus time on the due date; minutes are enough precision. */
private fun countdown(loan: Loan, now: ZonedDateTime): Pair<String, PassTone> {
    if (loan.status in listOf("returned", "cancelled", "lost")) return "Closed" to PassTone.Done
    val due = LocalDate.parse(loan.due_date).atTime(23, 59).atZone(Rules.campusZone)
    val minutes = java.time.Duration.between(now, due).toMinutes()
    if (loan.status == "overdue" || minutes < 0) {
        val days = maxOf(1L, (-minutes + 1439) / 1440)
        return "${days}d overdue" to PassTone.Late
    }
    val hours = minutes / 60
    val days = hours / 24
    val text = when { days > 0 -> "${days}d ${hours % 24}h left"; hours > 0 -> "${hours}h left"; else -> "${maxOf(1L, minutes)}m left" }
    return text to (if (hours < 24) PassTone.Soon else PassTone.Calm)
}

private fun shortName(name: String?): String {
    val parts = name.orEmpty().trim().split(Regex("\\s+")).filter { it.isNotBlank() }
    return when { parts.isEmpty() -> "STUDENT"; parts.size == 1 -> parts[0]; else -> "${parts[0]} ${parts[1].first()}." }.uppercase()
}

private val passDate = DateTimeFormatter.ofPattern("d MMM", Locale.forLanguageTag("en-IN"))

/**
 * A loan as a thermal-paper boarding pass, matching the web card: route
 * (owner to borrower), item, perforation, gate, due date, live countdown and
 * a QR to the loan page.
 */
@Composable fun LoanBoardingPass(loan: Loan, viewerId: String, extensionPending: Boolean, open: (String) -> Unit) {
    var now by remember { mutableStateOf(ZonedDateTime.now(Rules.campusZone)) }
    LaunchedEffect(loan.id) { while (true) { delay(60_000); now = ZonedDateTime.now(Rules.campusZone) } }
    val (left, tone) = countdown(loan, now)
    val toneColor = when (tone) { PassTone.Calm -> passCalm; PassTone.Soon -> passSoon; PassTone.Late -> passLate; PassTone.Done -> Color.Black.copy(alpha = .5f) }
    val payload = "${BuildConfig.BORROWBUDDY_WEB_URL.trimEnd('/')}/loans/${loan.id}"
    var qr by remember(payload) { mutableStateOf<Bitmap?>(null) }
    LaunchedEffect(payload) {
        qr = withContext(Dispatchers.Default) {
            runCatching {
                val size = 168
                val matrix = MultiFormatWriter().encode(payload, BarcodeFormat.QR_CODE, size, size, mapOf(EncodeHintType.MARGIN to 0))
                val pixels = IntArray(size * size) { if (matrix[it % size, it / size]) android.graphics.Color.BLACK else android.graphics.Color.WHITE }
                Bitmap.createBitmap(pixels, size, size, Bitmap.Config.ARGB_8888)
            }.getOrNull()
        }
    }
    val code = loan.id.replace("-", "").take(6).uppercase()
    val status = statusLabel(loan.status)
    val ink = Color.Black
    val faint = Color.Black.copy(alpha = .5f)
    Column(Modifier.width(300.dp).testTag("dashboard-ticket-${loan.id}").clickable { open(loan.id) }
        .semantics { contentDescription = "Boarding pass for ${loan.item?.title.orEmpty()}, $status, due ${LocalDate.parse(loan.due_date).format(passDate)}, $left${if (extensionPending) ", extension pending" else ""}" }) {
        // Stub: route and item.
        Column(Modifier.fillMaxWidth().background(Cargo.Paper, RoundedCornerShape(topStart = 8.dp, topEnd = 8.dp)).padding(horizontal = 16.dp, vertical = 12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("BOARDING PASS", style = loanMono(9), color = faint); Text("BB-$code", style = loanMono(9), color = faint)
            }
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text("FROM", style = loanMono(9), color = faint)
                    Text(shortName(loan.owner?.full_name), style = loanBody(18).copy(fontFamily = Cargo.Ticket, lineHeight = 18.sp), color = ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text("✈", Modifier.padding(horizontal = 6.dp), style = loanBody(16), color = Cargo.Accent)
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                    Text("TO", style = loanMono(9), color = faint)
                    Text(shortName(loan.borrower?.full_name), style = loanBody(18).copy(fontFamily = Cargo.Ticket, lineHeight = 18.sp), color = ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Text(loan.item?.title.orEmpty().uppercase(), Modifier.padding(top = 10.dp), style = loanBody(14).copy(fontFamily = Cargo.Strong), color = ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        // Perforation: a dashed tear line with notches cut from both edges.
        Box(Modifier.fillMaxWidth().height(16.dp).drawBehind {
            val notch = 8.dp.toPx()
            drawRect(Cargo.Paper)
            drawCircle(Cargo.Canvas, notch, Offset(0f, size.height / 2))
            drawCircle(Cargo.Canvas, notch, Offset(size.width, size.height / 2))
            drawLine(Color.Black.copy(alpha = .2f), Offset(notch * 2, size.height / 2), Offset(size.width - notch * 2, size.height / 2), 2.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f)))
        })
        // Details.
        Row(Modifier.fillMaxWidth().background(Cargo.Paper, RoundedCornerShape(bottomStart = 8.dp, bottomEnd = 8.dp)).padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.weight(1f)) {
                        Text("GATE", style = loanMono(9), color = faint)
                        Text((loan.item?.pickup_location?.name ?: "In chat").uppercase(), style = loanBody(11).copy(fontFamily = Cargo.Strong), color = ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Column {
                        Text("DUE", style = loanMono(9), color = faint)
                        Text(LocalDate.parse(loan.due_date).format(passDate).uppercase(), style = loanBody(11).copy(fontFamily = Cargo.Strong), color = ink)
                    }
                }
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("STATUS", style = loanMono(9), color = faint)
                        if (extensionPending) Text(if (loan.owner_id == viewerId) "EXTENSION ASKED" else "EXTENSION PENDING",
                            Modifier.background(passSoon, RoundedCornerShape(2.dp)).padding(horizontal = 5.dp, vertical = 1.dp), style = loanMono(8), color = Color.White)
                    }
                    Text(status.uppercase(), style = loanBody(11).copy(fontFamily = Cargo.Strong), color = ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(left, style = loanMono(10), color = toneColor, maxLines = 1)
                }
            }
            Box(Modifier.size(64.dp).background(Color.White).padding(3.dp)) {
                qr?.let { Image(it.asImageBitmap(), null, Modifier.fillMaxSize()) } ?: Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = .05f)))
            }
        }
    }
}

private fun statusLabel(status: String) = when (status) {
    "awaiting_pickup" -> "Awaiting pickup"; "active" -> "Borrowed"; "return_pending" -> "Return pending"; "overdue" -> "Overdue"
    "disputed" -> "Disputed"; "returned" -> "Returned"; "cancelled" -> "Cancelled"; "lost" -> "Lost"
    else -> status.replace('_', ' ').replaceFirstChar { it.uppercase() }
}

/** A card linking to the Campus Impact screen. */
@Composable fun ImpactLinkCard(open: () -> Unit) {
    Row(Modifier.fillMaxWidth().testTag("dashboard-impact").background(Cargo.Panel).border(1.dp, Cargo.Line).clickable(onClick = open).padding(18.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(painterResource(R.drawable.ic_sprout), null, Modifier.size(20.dp), tint = Cargo.Accent)
        Column(Modifier.weight(1f)) {
            Text("CAMPUS IMPACT", style = loanBody(13).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
            Text("See what sharing has saved campus, and your part in it.", style = loanBody(12), color = Cargo.Ink.copy(alpha = .65f))
        }
        Text("→", style = loanBody(16), color = Cargo.Accent)
    }
}

