package `in`.borrowbuddy.android.ui

import android.os.SystemClock
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.withInfiniteAnimationFrameNanos
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.em
import androidx.compose.ui.zIndex
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import `in`.borrowbuddy.android.graphics.TagPortraits
import `in`.borrowbuddy.android.graphics.TagWallMotion
import `in`.borrowbuddy.android.graphics.tagBarcodeWidths
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import kotlin.math.*

@Immutable data class LoanTag(val id: String, val status: String, val from: String, val to: String, val contents: String, val student: String, val seed: Int, val serials: List<String>)
val loanTags = listOf(
    LoanTag("mira", "BORROWED", "BLC", "LIB", "SONY A7 III + 2 BATTERIES", "MIRA K.", 3, listOf("8998040139", "2402691293")),
    LoanTag("dev", "DUE TODAY", "SAC", "HSA", "EPSON PROJECTOR + HDMI", "ISHAAN V.", 7, listOf("0101045216", "5726806664")),
    LoanTag("sana", "BORROWED", "LIB", "CAF", "JBL SPEAKER + CHARGER", "SANA P.", 11, listOf("2436315621", "9995052880")),
    LoanTag("rohan", "WAITLISTED", "HSD", "SAC", "CATAN + SEAFARERS EXP.", "ROHAN M.", 19, listOf("5850204654", "8486035723")),
    LoanTag("ishita", "RETURNED", "CAF", "BLA", "PRESTIGE HOTPLATE", "ISHITA T.", 23, listOf("5266472191", "1684402449")),
    LoanTag("kabir", "RETURNED", "LIB", "BLC", "50MM PRIME LENS", "KABIR J.", 29, listOf("1743529610", "6482097315")),
    LoanTag("neha", "BORROWED", "BLA", "LIB", "CASIO FX-991 CALCULATOR", "NEHA S.", 29, listOf("3391047582", "9027110563")),
    LoanTag("arjun", "DUE TODAY", "HSB", "CFT", "USHA TABLE FAN", "ARJUN D.", 31, listOf("4487291306", "7781549062")),
)
val ActiveLoanTag = SemanticsPropertyKey<Int>("ActiveLoanTag")
val LoanTagRunning = SemanticsPropertyKey<Boolean>("LoanTagRunning")

@Composable fun TagWall(modifier: Modifier = Modifier, viewportHeightDp: Float = 0f, viewportBounds: androidx.compose.ui.geometry.Rect? = null) {
    var active by rememberSaveable { mutableIntStateOf(3) }
    val motion = remember { TagWallMotion(active) }
    var visible by remember { mutableStateOf(false) }
    var parallax by remember { mutableFloatStateOf(0f) }
    var drag by remember { mutableFloatStateOf(0f) }
    var seconds by remember { mutableDoubleStateOf(0.0) }
    val view = LocalView.current
    val density = LocalDensity.current.density
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var resumed by remember { mutableStateOf(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    val reduced = rememberReducedMotion()
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) resumed = true
            if (event == Lifecycle.Event.ON_PAUSE) resumed = false
        }
        lifecycle.addObserver(observer); onDispose { lifecycle.removeObserver(observer) }
    }
    val running = visible && resumed && !reduced
    LaunchedEffect(running) {
        if (running) while (isActive) { delay(1000); if (motion.advance(SystemClock.uptimeMillis())) active = motion.active }
    }
    LaunchedEffect(running) {
        if (running) {
            var last = 0L
            while (isActive) withInfiniteAnimationFrameNanos { frame ->
                if (last != 0L) seconds += ((frame - last) / 1e9).coerceAtMost(.05)
                last = frame
            }
        }
    }
    fun navigate(direction: Int) { motion.navigate(direction, SystemClock.uptimeMillis()); active = motion.active }
    val rowOffset by animateFloatAsState(-active * 336f * .52f, spring(dampingRatio = .745f, stiffness = 520f), label = "Tag wall glide")
    var headerHeight by remember { mutableFloatStateOf(158f) }
    val viewport = if (viewportHeightDp > 0) viewportHeightDp else LocalWindowInfo.current.containerSize.height / density
    val stageHeight = (viewport - headerHeight).coerceAtLeast(636f).dp
    Column(modifier.fillMaxWidth().onGloballyPositioned { coordinates ->
        val top = coordinates.localToWindow(Offset.Zero).y; val height = coordinates.size.height.toFloat()
        val viewportTop = viewportBounds?.top ?: 0f; val viewportBottom = viewportBounds?.bottom ?: view.rootView.height.toFloat()
        visible = height > 0 && (min(top + height, viewportBottom) - max(top, viewportTop)).coerceAtLeast(0f) / height >= .15f
        parallax = 60f - 120f * ((viewportBottom - top) / (viewportBottom - viewportTop + height)).coerceIn(0f, 1f)
    }) {
        Column(Modifier.fillMaxWidth().onSizeChanged { headerHeight = it.height / density }.padding(start = 16.dp, end = 16.dp, top = 32.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
            Text(buildAnnotatedString { withStyle(SpanStyle(color = Cargo.Accent)) { append("▶") }; appendInlineContent("arrow-gap", " "); append("LOANS IN PROGRESS") },
                inlineContent = mapOf("arrow-gap" to InlineTextContent(Placeholder(.35f.em, 1.em, PlaceholderVerticalAlign.TextCenter)) { Spacer(Modifier.fillMaxSize()) }),
                style = TextStyle(fontFamily = Cargo.Title, fontSize = 40.sp, lineHeight = 42.sp, letterSpacing = .4.sp, platformStyle = PlatformTextStyle(includeFontPadding = false)))
            TagText("LIVE FROM THE CAMPUS NETWORK —\nDRAG OR USE THE ARROWS. THE CENTER TAG IS THE ACTIVE LOAN.", 11f, Cargo.Mono, Cargo.Ink.copy(alpha = .5f), lineHeight = 20f, letterSpacing = .88f)
        }
        BoxWithConstraints(Modifier.fillMaxWidth().height(stageHeight).clipToBounds()
            .semantics { contentDescription = "Loan tag wall"; this[ActiveLoanTag] = active; this[LoanTagRunning] = running }
            .onPreviewKeyEvent { event ->
                if (event.type == KeyEventType.KeyDown && event.key in listOf(Key.DirectionLeft, Key.DirectionRight)) {
                    navigate(if (event.key == Key.DirectionLeft) -1 else 1); true
                } else false
            }.focusable()
            .pointerInput(density) {
                detectHorizontalDragGestures(onDragStart = { motion.beginDrag(SystemClock.uptimeMillis()); drag = 0f },
                    onDragEnd = { motion.endDrag(drag, 336f * .52f * density); active = motion.active; drag = 0f },
                    onDragCancel = { drag = 0f }, onHorizontalDrag = { change, amount -> change.consume(); drag += amount })
            }) {
            val wallWidth = maxWidth.value
            loanTags.forEachIndexed { index, loan ->
                val distance = index - active
                val scale by animateFloatAsState(max(.5f, 1f - abs(distance) * .16f), spring(.746f, 460f), label = "Tag scale")
                val opacity by animateFloatAsState(max(.24f, 1f - abs(distance) * .28f), spring(.746f, 460f), label = "Tag opacity")
                val rotation by animateFloatAsState(distance * -14f, spring(.746f, 460f), label = "Tag perspective")
                val y by animateFloatAsState(abs(distance) * 16f, spring(.746f, 460f), label = "Tag depth")
                val perspectiveScale = 1600f / (1600f + abs(distance) * 110f)
                val levitation = if (!reduced && distance == 0) (-4.5 * (1 - cos(seconds * 2 * PI / 5))).toFloat() else 0f
                val statusAlpha = if (reduced) 1f else (.8 + .2 * cos(seconds * 2 * PI / 2.6)).toFloat()
                LoanTagCard(loan, levitation, statusAlpha, Modifier.width(336.dp).zIndex(20f - abs(distance))
                    .graphicsLayer {
                        translationX = (wallWidth / 2 - 168 + index * 336f * .52f + if (reduced) -active * 336f * .52f else rowOffset) * density + drag + 12 * density
                        translationY = (48f + y + if (reduced) 0f else parallax) * density
                        scaleX = scale * perspectiveScale; scaleY = scale * perspectiveScale
                        alpha = opacity; rotationY = rotation; cameraDistance = 1600 * density
                    }.clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                        if (motion.select(index, SystemClock.uptimeMillis())) active = motion.active
                    })
            }
            Box(Modifier.align(Alignment.CenterStart).fillMaxHeight().width(32.dp).background(Brush.horizontalGradient(listOf(Cargo.Deep, Color.Transparent))))
            Box(Modifier.align(Alignment.CenterEnd).fillMaxHeight().width(32.dp).background(Brush.horizontalGradient(listOf(Color.Transparent, Cargo.Deep))))
            Row(Modifier.align(Alignment.BottomCenter).zIndex(30f).fillMaxWidth().padding(horizontal = 12.dp, vertical = (stageHeight.value * .07f - 8f).dp), horizontalArrangement = Arrangement.SpaceBetween) {
                TagArrow(false, active > 0) { navigate(-1) }
                TagArrow(true, active < loanTags.lastIndex) { navigate(1) }
            }
        }
    }
}

@Composable private fun TagText(text: String, size: Float, font: FontFamily = Cargo.Title, color: Color = Color.Black, modifier: Modifier = Modifier, lineHeight: Float = size * 1.05f, letterSpacing: Float = 0f) {
    Text(text, modifier, style = TextStyle(fontFamily = font, fontSize = size.sp, lineHeight = lineHeight.sp, letterSpacing = letterSpacing.sp, color = color, platformStyle = PlatformTextStyle(includeFontPadding = false), lineHeightStyle = androidx.compose.ui.text.style.LineHeightStyle(androidx.compose.ui.text.style.LineHeightStyle.Alignment.Center, androidx.compose.ui.text.style.LineHeightStyle.Trim.None)))
}
private fun Modifier.tagRule() = drawBehind { drawLine(Color.Black, Offset(0f, size.height - .5.dp.toPx()), Offset(size.width, size.height - .5.dp.toPx()), 1.dp.toPx()) }

@Composable private fun LoanTagCard(loan: LoanTag, levitation: Float, statusAlpha: Float, modifier: Modifier) {
    Column(modifier) {
        Column(Modifier.graphicsLayer { alpha = statusAlpha }) {
            TagText("STATUS:", 9f, Cargo.Mono, Cargo.Ink.copy(alpha = .6f), lineHeight = 9f, letterSpacing = .72f)
            Spacer(Modifier.height(4.dp)); TagText(loan.status, 16f, color = Cargo.Accent)
        }
        Spacer(Modifier.height(10.dp))
        Column(Modifier.fillMaxWidth().height(485.dp).graphicsLayer { translationY = levitation * density }
            .clip(RoundedCornerShape(8.dp)).background(Brush.verticalGradient(0f to Color.White, .58f to Cargo.Paper, 1f to Color(0xffe7e7e7)))
            .drawBehind { var y = 0f; while (y < size.height) { drawRect(Color.Black.copy(alpha = .018f), Offset(0f, y), Size(size.width, 1.dp.toPx())); y += 4.dp.toPx() } }) {
            Row(Modifier.fillMaxWidth().height(64.dp).background(Color.Black).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TagText("BB\nBU", 11f, color = Cargo.Paper)
                    Canvas(Modifier.size(24.dp).border(2.dp, Cargo.Paper.copy(alpha = .9f), CircleShape).padding(6.dp)) {
                        val unit = size.width / 12
                        for ((x, y) in listOf(0f to 0f, 7f to 0f, 0f to 7f)) drawRect(Cargo.Paper, Offset(x * unit, y * unit), Size(5 * unit, 5 * unit), style = androidx.compose.ui.graphics.drawscope.Stroke(unit))
                        drawRect(Cargo.Paper, Offset(7 * unit, 7 * unit), Size(2 * unit, 2 * unit)); drawRect(Cargo.Paper, Offset(10 * unit, 10 * unit), Size(2 * unit, 2 * unit))
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) { TagText("BORROWBUDDY", 11f, color = Cargo.Paper); CargoMark(Modifier.size(20.dp)) }
            }
            Column(Modifier.fillMaxWidth().tagRule().padding(start = 12.dp, end = 12.dp, top = 10.dp, bottom = 12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { TagText("Departing:", 9f, Cargo.Mono, Color.Black.copy(alpha = .6f), lineHeight = 13.5f); TagText("Destination:", 9f, Cargo.Mono, Color.Black.copy(alpha = .6f), lineHeight = 13.5f) }
                Spacer(Modifier.height(2.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    TagText(loan.from, 38.4f, lineHeight = 34.56f)
                    Canvas(Modifier.size(32.dp, 12.dp)) { scale(size.width / 64f, size.height / 24f, Offset.Zero) {
                        drawRect(Color.Black, Offset(0f, 10f), Size(54f, 4f)); drawPath(Path().apply { moveTo(53f, 2.5f); lineTo(63.5f, 12f); lineTo(53f, 21.5f); close() }, Color.Black)
                    } }
                    TagText(loan.to, 38.4f, lineHeight = 34.56f)
                }
            }
            Column(Modifier.fillMaxWidth().tagRule().padding(horizontal = 12.dp, vertical = 10.dp)) {
                TagText("Package Contents:", 9f, Cargo.Mono, Color.Black.copy(alpha = .6f), lineHeight = 13.5f); Spacer(Modifier.height(2.dp)); TagText(loan.contents, 21.6f, lineHeight = 27f)
            }
            Column(Modifier.fillMaxWidth().tagRule().padding(horizontal = 12.dp, vertical = 10.dp)) {
                TagText("For:", 9f, Cargo.Mono, Color.Black.copy(alpha = .6f), lineHeight = 13.5f); Spacer(Modifier.height(2.dp)); TagText(loan.student, 27.2f, lineHeight = 34f)
            }
            Row(Modifier.fillMaxWidth().weight(1f).padding(start = 12.dp, end = 12.dp, top = 10.dp, bottom = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                var portrait by remember(loan.seed) { mutableStateOf<ImageBitmap?>(null) }
                LaunchedEffect(loan.seed) { portrait = withContext(Dispatchers.Default) { TagPortraits.portrait(loan.seed).asImageBitmap() } }
                Box(Modifier.width(118.56.dp).aspectRatio(320f / 384).clip(RoundedCornerShape(2.dp)).background(Color(0xff0b1030))) { portrait?.let { Image(it, null, Modifier.fillMaxSize()) } }
                Column(Modifier.width(124.8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    loan.serials.forEachIndexed { index, serial -> Column {
                        val widths = remember(serial, index) { tagBarcodeWidths(serial.toLong(), if (index == 0) 40 else 34) }
                        Canvas(Modifier.fillMaxWidth().height(if (index == 0) 32.dp else 36.dp).clipToBounds()) {
                            var x = 0f; widths.forEach { bar -> drawRect(Color.Black, Offset(x, 0f), Size(bar.dp.toPx(), size.height)); x += (bar + 2).dp.toPx() }
                        }
                        Spacer(Modifier.height(4.dp)); Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { TagText(serial, 8f, Cargo.Mono, Color.Black.copy(alpha = .7f), lineHeight = 12f) }
                    } }
                }
            }
        }
    }
}

@Composable fun CargoMark(modifier: Modifier = Modifier) {
    val left = remember { androidx.compose.ui.graphics.vector.PathParser().parsePathString(`in`.borrowbuddy.android.graphics.BorrowBuddyBrand.LEFT_PATH).toPath() }
    val right = remember { androidx.compose.ui.graphics.vector.PathParser().parsePathString(`in`.borrowbuddy.android.graphics.BorrowBuddyBrand.RIGHT_PATH).toPath() }
    Canvas(modifier) { scale(size.width / 256, size.height / 256, Offset.Zero) {
        drawPath(left, Cargo.Paper); drawPath(right, Cargo.Accent)
    } }
}
@Composable private fun TagArrow(right: Boolean, enabled: Boolean, click: () -> Unit) {
    Box(Modifier.size(48.dp).semantics { contentDescription = if (right) "Next tag" else "Previous tag" }
        .clickable(enabled = enabled, onClick = click), contentAlignment = if (right) Alignment.CenterEnd else Alignment.CenterStart) {
        Canvas(Modifier.size(if (right) 40.dp else 44.dp, if (right) 28.57.dp else 31.43.dp).graphicsLayer { alpha = if (enabled) 1f else .3f; scaleX = if (right) -1f else 1f }) {
            scale(size.width / 63, size.height / 45, Offset.Zero) {
                drawRect(Color.White, Offset(9.7711f, 18.6372f), Size(52.6978f, 7.02489f))
                drawPath(Path().apply { moveTo(0f, 22.353f); lineTo(22.3577f, 0f); lineTo(27.326f, 4.967f); lineTo(9.936f, 22.353f); lineTo(27.326f, 39.739f); lineTo(22.3577f, 44.706f); close() }, Color.White)
            }
        }
    }
}
