package `in`.borrowbuddy.android.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import `in`.borrowbuddy.android.domain.Loan
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.roundToInt

/** Words on the confirmation screen, worked out from who is looking at it. */
internal data class HandoverConfirmedCopy(
    val board: String, val headline: String, val body: String,
    val from: String, val to: String, val factLabel: String, val factValue: String,
)

internal fun handoverConfirmedCopy(kind: String, loan: Loan, viewerId: String): HandoverConfirmedCopy {
    val item = loan.item?.title?.trim()?.ifBlank { null } ?: "item"
    fun first(name: String?) = name.orEmpty().trim().substringBefore(' ').ifBlank { "the other student" }
    val due = runCatching { LocalDate.parse(loan.due_date).format(DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)) }.getOrDefault(loan.due_date)
    val viewerOwns = loan.owner_id == viewerId
    return if (kind == "return") HandoverConfirmedCopy(
        board = "RETURNED", headline = "RETURN CONFIRMED",
        body = if (viewerOwns) "Your $item is back with you. Rate ${first(loan.borrower?.full_name)} to close the loan."
            else "You've handed back the $item. Rate ${first(loan.owner?.full_name)} to close the loan.",
        from = shortName(loan.borrower?.full_name), to = shortName(loan.owner?.full_name), factLabel = "LOAN", factValue = "CLOSED")
    else HandoverConfirmedCopy(
        board = "PICKED UP", headline = "PICKUP CONFIRMED",
        body = if (viewerOwns) "${first(loan.borrower?.full_name)} has your $item now. It's due back $due."
            else "The $item is yours until $due. Enjoy it.",
        from = shortName(loan.owner?.full_name), to = shortName(loan.borrower?.full_name), factLabel = "DUE BACK", factValue = due.uppercase())
}

// One clock drives the whole sequence (milliseconds):
// the LED board powers on with a sweep → the check lights dot by dot (haptic) →
// the word lights column by column → headline → the receipt prints → DONE.
private const val CheckStart = 300f
private const val CheckDone = CheckStart + 26 * 32f + 110f
private const val WordStart = 1150f
private const val PrintStart = 1650f
private const val PrintLength = 900f
private const val SequenceEnd = 2800f

private fun window(time: Float, start: Float, length: Float) = ((time - start) / length).coerceIn(0f, 1f)
private val OutCubic = Easing { x -> val y = 1f - x; 1f - y * y * y }
private val LedHot = Color(0xffffd38a)

/** Full-screen moment after a handover is confirmed, on whichever phone sees it first. */
@Composable fun HandoverConfirmedOverlay(kind: String, loan: Loan, viewerId: String, dismiss: () -> Unit) {
    Dialog(dismiss, DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.Center) {
            HandoverConfirmedCard(kind, loan, viewerId, dismiss)
        }
    }
}

@Composable private fun HandoverConfirmedCard(kind: String, loan: Loan, viewerId: String, dismiss: () -> Unit) {
    val copy = remember(kind, loan, viewerId) { handoverConfirmedCopy(kind, loan, viewerId) }
    val logged = remember { LocalDateTime.now() }
    val clock = remember { Animatable(0f) }
    val reduced = rememberReducedMotion()
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(reduced) {
        if (reduced) { clock.snapTo(SequenceEnd); return@LaunchedEffect }
        clock.animateTo(CheckDone, tween((CheckDone - clock.value).roundToInt().coerceAtLeast(0), easing = LinearEasing))
        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        clock.animateTo(SequenceEnd, tween((SequenceEnd - CheckDone).roundToInt(), easing = LinearEasing))
    }
    val time = { clock.value }
    val shape = RoundedCornerShape(16.dp)
    Column(Modifier.widthIn(max = 400.dp).fillMaxWidth().testTag("handover-confirmed")
        .graphicsLayer {
            val enter = OutCubic.transform(window(clock.value, 0f, 360f))
            alpha = enter; scaleX = .94f + .06f * enter; scaleY = scaleX
        }
        .semantics { liveRegion = LiveRegionMode.Polite; paneTitle = copy.headline }
        .clip(shape).background(Cargo.Panel).border(1.dp, Cargo.Line, shape).padding(16.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("CUSTODY TRANSFER", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
            Text("LOGGED ${logged.format(DateTimeFormatter.ofPattern("HH:mm"))}", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
        }
        LedBoard(copy.board, time, Modifier.clearAndSetSemantics { contentDescription = copy.board.lowercase() })
        Text(copy.headline, Modifier.reveal(time, 1300f).padding(top = 20.dp).fillMaxWidth(), textAlign = TextAlign.Center,
            style = loanBody(30).copy(fontFamily = Cargo.Ticket, letterSpacing = 1.5.sp, lineHeight = 34.sp), color = Cargo.Ink)
        Text(copy.body, Modifier.reveal(time, 1400f).padding(top = 8.dp, start = 8.dp, end = 8.dp).fillMaxWidth(), textAlign = TextAlign.Center,
            style = loanBody(14).copy(lineHeight = 21.sp), color = Cargo.Ink.copy(alpha = .7f))
        Receipt(copy, loan, logged, time, Modifier.padding(top = 20.dp))
        DottedButton("DONE", dismiss, Modifier.reveal(time, 2450f).padding(top = 18.dp).testTag("handover-confirmed-done"))
    }
}

private fun Modifier.reveal(time: () -> Float, start: Float) = graphicsLayer {
    val shown = OutCubic.transform(window(time(), start, 380f))
    alpha = shown
    translationY = (1f - shown) * 12.dp.toPx()
}

/**
 * An amber LED dot-matrix panel. Every dot is drawn, unlit ones faintly, so it
 * reads as hardware. A scan sweep powers it on, the check lights in pen order,
 * then [word] lights column by column in the 5×7 font. Lit dots breathe gently.
 * With an empty [word] it shows the check alone.
 */
@Composable internal fun LedBoard(word: String, time: () -> Float, modifier: Modifier = Modifier) {
    val text = remember(word) { dotMatrix(word) }
    val textCols = text.firstOrNull()?.size ?: 0
    val checkOrder = remember { IntArray(11 * 8) { -1 }.also { grid -> checkDots.forEachIndexed { i, (c, r) -> grid[r * 11 + c] = i } } }
    val breathe = if (rememberReducedMotion()) remember { mutableFloatStateOf(1f) }
        else rememberInfiniteTransition(label = "led").animateFloat(.8f, 1f, infiniteRepeatable(tween(1400), RepeatMode.Reverse), label = "breathe")
    val cols = max(textCols + 6, 30)
    val rows = if (word.isBlank()) 12 else 22
    BoxWithConstraints(modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Color(0xff050505))
        .border(1.dp, Color(0xff1c1c1c), RoundedCornerShape(10.dp)).padding(10.dp)) {
        val cell = maxWidth / cols
        Canvas(Modifier.fillMaxWidth().height(cell * rows)) {
            val now = time()
            val step = size.width / cols
            val checkLeft = (cols - 11) / 2
            val textLeft = (cols - textCols) / 2
            val textTop = 2 + 8 + 3
            val sweep = now / 650f * (cols + 8) - 4
            for (r in 0 until rows) for (c in 0 until cols) {
                val center = Offset((c + .5f) * step, (r + .5f) * step)
                var level = 0f
                val cc = c - checkLeft; val cr = r - 2
                if (cc in 0 until 11 && cr in 0 until 8) checkOrder[cr * 11 + cc].takeIf { it >= 0 }?.let { level = window(now, CheckStart + it * 32f, 110f) }
                val tc = c - textLeft; val tr = r - textTop
                if (tr in 0 until DotRows && tc in 0 until textCols && text[tr][tc]) level = max(level, window(now, WordStart + tc * 12f, 90f))
                // Power-on: a band of flickering dots crosses the board once.
                val band = 1f - abs(c - sweep) / 2.5f
                val flicker = if (now < 900f && band > 0f && ((c * 73856093) xor (r * 19349663)) and 3 == 0) band * .6f else 0f
                drawCircle(Cargo.Accent.copy(alpha = .1f), step * .3f, center)
                val glow = max(level * breathe.value, flicker)
                if (glow > 0f) {
                    drawCircle(Cargo.Accent.copy(alpha = .2f * glow), step * .62f, center)
                    drawCircle(lerp(Cargo.Accent, LedHot, .4f * glow).copy(alpha = glow), step * .34f, center)
                }
            }
        }
    }
}

/**
 * A thermal receipt that feeds out of a slot in steps, like a real printer,
 * set in the dotted thermal font with dot leaders, dotted rules, a dot code
 * and a torn edge.
 */
@Composable private fun Receipt(copy: HandoverConfirmedCopy, loan: Loan, logged: LocalDateTime, time: () -> Float, modifier: Modifier) {
    Column(modifier.fillMaxWidth()) {
        // The printer slot.
        Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp))
            .background(Brush.verticalGradient(listOf(Color(0xff000000), Color(0xff2a2a2a)))))
        Column(Modifier.padding(horizontal = 10.dp).fillMaxWidth().clipToBounds()
            .layout { measurable, constraints ->
                val paper = measurable.measure(constraints)
                // Feed in 28 small jumps rather than a smooth slide.
                val fed = floor(OutCubic.transform(window(time(), PrintStart, PrintLength)) * 28f) / 28f
                val shown = (paper.height * fed).roundToInt()
                layout(paper.width, shown) { paper.place(0, shown - paper.height) }
            }
            .drawBehind {
                // Paper with a torn, saw-tooth bottom edge.
                val tooth = 8.dp.toPx(); val depth = 5.dp.toPx()
                val path = Path().apply {
                    moveTo(0f, 0f); lineTo(size.width, 0f); lineTo(size.width, size.height - depth)
                    var x = size.width; var down = true
                    while (x > 0f) { x = (x - tooth / 2f).coerceAtLeast(0f); lineTo(x, if (down) size.height else size.height - depth); down = !down }
                    close()
                }
                drawPath(path, Cargo.Paper)
            }
            .padding(start = 16.dp, end = 16.dp, top = 14.dp, bottom = 22.dp)) {
            Text("BORROWBUDDY", Modifier.fillMaxWidth(), textAlign = TextAlign.Center,
                style = loanBody(20).copy(fontFamily = Cargo.Ticket, letterSpacing = 2.sp), color = Color.Black)
            Text("CUSTODY RECEIPT · #${loan.id.take(4).uppercase()}", Modifier.fillMaxWidth().padding(top = 2.dp), textAlign = TextAlign.Center,
                style = loanMono(9), color = Color.Black.copy(alpha = .55f))
            DottedRule(Modifier.padding(vertical = 10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                ReceiptName("FROM", copy.from, Modifier.weight(1f))
                Text("›››", Modifier.padding(horizontal = 8.dp), style = loanBody(16).copy(fontFamily = Cargo.Ticket), color = Cargo.Accent)
                ReceiptName("TO", copy.to, Modifier.weight(1f), end = true)
            }
            DottedRule(Modifier.padding(vertical = 10.dp))
            ReceiptLine("ITEM", loan.item?.title.orEmpty().uppercase().ifBlank { "ITEM" })
            ReceiptLine(copy.factLabel, copy.factValue)
            ReceiptLine("LOGGED", logged.format(DateTimeFormatter.ofPattern("d MMM · HH:mm", Locale.ENGLISH)).uppercase())
            DottedRule(Modifier.padding(vertical = 10.dp))
            DotCode(loan.id, Modifier.fillMaxWidth().height(20.dp))
            Text("SCAN LOGGED · CUSTODY CHAIN UPDATED", Modifier.fillMaxWidth().padding(top = 8.dp), textAlign = TextAlign.Center,
                style = loanMono(8), color = Color.Black.copy(alpha = .5f))
        }
    }
}

@Composable private fun ReceiptName(label: String, value: String, modifier: Modifier, end: Boolean = false) {
    Column(modifier, horizontalAlignment = if (end) Alignment.End else Alignment.Start) {
        Text(label, style = loanMono(8), color = Color.Black.copy(alpha = .5f))
        Text(value, style = loanBody(17).copy(fontFamily = Cargo.Ticket, letterSpacing = 1.sp), color = Color.Black,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** "ITEM ........ QA TEST ITEM" with a dot leader between label and value. */
@Composable private fun ReceiptLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.Bottom) {
        Text(label, style = loanBody(14).copy(fontFamily = Cargo.Ticket, letterSpacing = 1.sp), color = Color.Black.copy(alpha = .6f))
        Canvas(Modifier.weight(1f).height(10.dp).padding(horizontal = 6.dp)) {
            var x = 0f
            while (x < size.width) { drawCircle(Color.Black.copy(alpha = .3f), 1.1.dp.toPx(), Offset(x, size.height * .8f)); x += 5.dp.toPx() }
        }
        Text(value, style = loanBody(14).copy(fontFamily = Cargo.Ticket, letterSpacing = 1.sp), color = Color.Black,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable private fun DottedRule(modifier: Modifier = Modifier) {
    Canvas(modifier.fillMaxWidth().height(3.dp)) {
        var x = 1.5.dp.toPx()
        while (x < size.width) { drawCircle(Color.Black.copy(alpha = .35f), 1.4.dp.toPx(), Offset(x, size.height / 2f)); x += 7.dp.toPx() }
    }
}

/** A dot "barcode": three-dot columns switched on by bits of the loan id. */
@Composable private fun DotCode(seed: String, modifier: Modifier) {
    val bits = remember(seed) { seed.filter(Char::isLetterOrDigit).map { it.digitToIntOrNull(16) ?: 7 } }
    Canvas(modifier) {
        val gap = 6.dp.toPx(); val radius = 2.dp.toPx()
        val columns = (size.width / gap).toInt()
        val left = (size.width - (columns - 1) * gap) / 2f
        for (i in 0 until columns) {
            val nibble = if (bits.isEmpty()) 5 else bits[i % bits.size] xor (i * 5)
            for (row in 0 until 3) if ((nibble shr row) and 1 == 1 || row == 1 && i % 4 == 0)
                drawCircle(Color.Black, radius, Offset(left + i * gap, size.height / 2f + (row - 1) * gap))
        }
    }
}

/** Amber button with a dotted inner border, labelled in the dot font. */
@Composable private fun DottedButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().heightIn(min = 54.dp).clip(RoundedCornerShape(10.dp)).background(Cargo.Accent)
        .clickable(onClickLabel = "Close", onClick = onClick)
        .drawBehind {
            val inset = 5.dp.toPx()
            drawRoundRect(Color.Black.copy(alpha = .55f), Offset(inset, inset), Size(size.width - inset * 2, size.height - inset * 2), CornerRadius(6.dp.toPx()),
                style = Stroke(2.2.dp.toPx(), cap = StrokeCap.Round, pathEffect = PathEffect.dashPathEffect(floatArrayOf(.1f, 6.dp.toPx()))))
        }, contentAlignment = Alignment.Center) {
        Text(label, style = loanBody(20).copy(fontFamily = Cargo.Ticket, letterSpacing = 3.sp), color = Color.Black)
    }
}
