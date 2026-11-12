package `in`.borrowbuddy.android.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import `in`.borrowbuddy.android.data.BuddyMood
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.random.Random

/** Parcel's palette (matches the web mascot). */
private object P {
    val Kraft = Color(0xffc98a4a); val KraftLight = Color(0xffdba066); val KraftShade = Color(0xffb2733a)
    val KraftDeep = Color(0xff9c6430); val Brown = Color(0xff5a3712); val Tape = Color(0xffefd7aa)
    val Visor = Color(0xff080b10); val Eye = Color(0xffff9f00); val Amber = Color(0xffcb840e)
    val Paper = Color(0xfff0f0f0); val Deep = Color(0xff021249); val Glint = Color(0xfffff4dc)
}

@Composable private fun InfiniteTransition.cycle(ms: Int): State<Float> =
    animateFloat(0f, 1f, infiniteRepeatable(tween(ms, easing = LinearEasing)), label = "cycle")

/**
 * Parcel — Buddy's mascot, drawn on a 120×120 grid so it stays crisp from a
 * 30dp reply avatar to a 210dp hero. Tap for a squash, drag to steer its eyes.
 */
@Composable fun ParcelMascot(mood: BuddyMood, size: Dp, modifier: Modifier = Modifier, peek: Boolean = false, interactive: Boolean = true, description: String? = null,
    /** Hold a still pose (a user's "pause animation" choice), exactly like reduced motion. */
    still: Boolean = false) {
    val reduced = rememberReducedMotion() || still
    val scope = rememberCoroutineScope()
    val time = rememberInfiniteTransition(label = "parcel")
    // Cycles always run (stable composition); with reduced motion their values are ignored.
    val bobCycle = time.cycle(when (mood) { BuddyMood.Talking -> 500; BuddyMood.Thinking -> 1600; BuddyMood.Sleepy, BuddyMood.Offline -> 3400; else -> 2600 }).takeUnless { reduced }
    val fast = time.cycle(420).takeUnless { reduced }
    val wave = time.cycle(1300).takeUnless { reduced }
    val scan = time.cycle(if (mood == BuddyMood.Thinking) 1100 else 3200).takeUnless { reduced }
    val pulse = time.cycle(900).takeUnless { reduced }
    val drift = time.cycle(2400).takeUnless { reduced }

    var blink by remember { mutableStateOf(false) }
    LaunchedEffect(reduced) {
        if (reduced) return@LaunchedEffect
        while (true) { delay(2600L + Random.nextLong(3400)); blink = true; delay(130); blink = false }
    }
    val eyeX = remember { Animatable(0f) }; val eyeY = remember { Animatable(0f) }
    var dragging by remember { mutableStateOf(false) }
    LaunchedEffect(reduced) {
        if (reduced) return@LaunchedEffect
        while (true) {
            delay(2200L + Random.nextLong(2600))
            if (!dragging) {
                val pick = Random.nextFloat()
                launch { eyeX.animateTo(if (pick < .33f) -3.5f else if (pick < .66f) 3.5f else 0f, spring(dampingRatio = .7f)) }
                launch { eyeY.animateTo(if (pick > .8f) -2f else .5f, spring(dampingRatio = .7f)) }
            }
        }
    }
    val squashX = remember { Animatable(1f) }; val squashY = remember { Animatable(1f) }
    fun boing() {
        if (reduced) return
        scope.launch { squashX.snapTo(1.14f); squashX.animateTo(1f, spring(dampingRatio = .35f, stiffness = 500f)) }
        scope.launch { squashY.snapTo(.84f); squashY.animateTo(1f, spring(dampingRatio = .35f, stiffness = 500f)) }
    }
    LaunchedEffect(mood) { if (mood == BuddyMood.Happy || mood == BuddyMood.Found || mood == BuddyMood.Wave) boing() }
    val lidTarget = when { mood == BuddyMood.Found -> 1f; peek || mood == BuddyMood.Wave || mood == BuddyMood.Happy -> .45f; mood == BuddyMood.Thinking -> .2f; else -> 0f }
    val lid by animateFloatAsState(lidTarget, spring(dampingRatio = .45f, stiffness = 260f), label = "lid")

    val gestures = if (!interactive) Modifier else Modifier
        .pointerInput(reduced) { detectTapGestures(onPress = { boing() }) }
        .pointerInput(reduced) {
            detectDragGestures(onDragStart = { dragging = true }, onDragEnd = { dragging = false; scope.launch { eyeX.animateTo(0f) }; scope.launch { eyeY.animateTo(0f) } },
                onDragCancel = { dragging = false }) { change, _ ->
                val cx = this.size.width / 2f; val cy = this.size.height * .53f
                val dx = change.position.x - cx; val dy = change.position.y - cy
                val d = hypot(dx, dy).coerceAtLeast(1f); val pull = (d / (this.size.width * .8f)).coerceAtMost(1f)
                scope.launch { eyeX.snapTo(dx / d * 4.2f * pull) }; scope.launch { eyeY.snapTo(dy / d * 3f * pull) }
            }
        }

    // Without a description the canvas has no semantics, so TalkBack skips it.
    val label = if (description != null) Modifier.semantics { contentDescription = description } else Modifier
    Canvas(modifier.size(size).then(gestures).then(label)) {
        val k = this.size.minDimension / 120f
        val bob = bobCycle?.value ?: 0f
        val wave01 = wave?.value ?: 0f
        val s = sin(bob * 2 * PI).toFloat()
        val (bodyY, bodyRot) = when (mood) {
            BuddyMood.Happy, BuddyMood.Found -> (-6f * kotlin.math.abs(sin(bob * 2 * PI)).toFloat()) to 0f
            BuddyMood.Thinking -> (-1.5f * s) to (2.5f * s)
            BuddyMood.Sleepy, BuddyMood.Offline -> (1f * s) to 0f
            BuddyMood.Talking -> (-2f * kotlin.math.abs(s)) to (-1f * s)
            else -> (-2.4f * (s + 1) / 2) to 0f
        }
        scale(k, k, pivot = Offset.Zero) {
            // contact shadow
            val shadowScale = 1f - .1f * (s + 1) / 2
            drawOval(P.Deep.copy(alpha = .5f), Offset(60 - 31 * shadowScale, 106.5f), Size(62 * shadowScale, 9f))

            translate(top = bodyY) {
                rotate(bodyRot, pivot = Offset(60f, 108f)) {
                    scale(squashX.value, squashY.value, pivot = Offset(60f, 108f)) {
                        drawBody(mood, lid, blink, eyeX.value, eyeY.value, wave01, fast?.value ?: .5f, scan?.value ?: .5f, pulse?.value ?: 1f, reduced)
                    }
                }
            }
            drawExtras(mood, drift?.value ?: .5f, reduced)
        }
    }
}

private fun DrawScope.drawBody(mood: BuddyMood, lid: Float, blink: Boolean, ex: Float, ey: Float, wave: Float, fast: Float, scan: Float, pulse: Float, reduced: Boolean) {
    // feet
    drawRoundRect(P.Brown, Offset(38f, 99f), Size(13f, 9f), CornerRadius(4f))
    drawRoundRect(P.Brown, Offset(69f, 99f), Size(13f, 9f), CornerRadius(4f))
    // left arm
    val leftSwing = if (reduced) 0f else if (mood == BuddyMood.Confused) -18f * sin(wave * PI).toFloat() else 4f * sin(wave * 2 * PI).toFloat()
    rotate(leftSwing, pivot = Offset(26f, 72f)) {
        drawPath(Path().apply { moveTo(26f, 72f); quadraticTo(15f, 75f, 13f, 85f) }, P.KraftDeep, style = Stroke(6f, cap = StrokeCap.Round))
    }
    // right arm waves hello
    val rightSwing = when {
        reduced -> 0f
        mood == BuddyMood.Wave -> -38f * kotlin.math.abs(sin(wave * 2 * PI)).toFloat()
        mood == BuddyMood.Happy || mood == BuddyMood.Found -> -30f * kotlin.math.abs(sin(wave * PI)).toFloat()
        else -> -4f * (sin(wave * 2 * PI).toFloat() + 1) / 2
    }
    rotate(rightSwing, pivot = Offset(94f, 72f)) {
        drawPath(Path().apply { moveTo(94f, 72f); quadraticTo(105f, 70f, 108f, 60f) }, P.KraftDeep, style = Stroke(6f, cap = StrokeCap.Round))
        drawCircle(P.KraftDeep, 4f, Offset(108.5f, 59f))
    }
    // box body
    drawRoundRect(P.Kraft, Offset(24f, 38f), Size(72f, 64f), CornerRadius(9f))
    clipRect(24f, 38f, 96f, 102f) {
        drawRect(P.KraftShade, Offset(84f, 38f), Size(12f, 64f))
        drawRect(P.KraftShade.copy(alpha = .8f), Offset(24f, 94f), Size(72f, 8f))
        drawLine(P.KraftLight.copy(alpha = .35f), Offset(28f, 44f), Offset(28f, 92f), 2f, StrokeCap.Round)
        drawRect(P.Tape.copy(alpha = .92f), Offset(54f, 38f), Size(12f, 12f))
    }
    // this-side-up arrows
    listOf(31f, 38f).forEach { x ->
        val arrow = Path().apply { moveTo(x, 97f); lineTo(x, 90f); moveTo(x - 2.6f, 92.6f); lineTo(x, 90f); lineTo(x + 2.6f, 92.6f) }
        drawPath(arrow, P.Brown.copy(alpha = .75f), style = Stroke(1.6f, cap = StrokeCap.Round))
    }
    // barcode label
    drawRoundRect(P.Paper, Offset(69f, 88.5f), Size(19f, 9f), CornerRadius(1f))
    listOf(71.5f, 73.5f, 74.8f, 77f, 78.4f, 80.8f, 82f, 84.5f, 85.6f).forEach { x -> drawLine(P.Visor, Offset(x, 90.5f), Offset(x, 95.5f), 1f) }
    // lid flaps (hinged at the outer corners)
    rotate(-32f * lid, pivot = Offset(21f, 43f)) {
        translate(top = -3f * lid) { drawRoundRect(P.KraftLight, Offset(21f, 34f), Size(39f, 9f), CornerRadius(3f)) }
    }
    rotate(32f * lid, pivot = Offset(99f, 43f)) {
        translate(top = -3f * lid) { drawRoundRect(P.KraftLight, Offset(60f, 34f), Size(39f, 9f), CornerRadius(3f)) }
    }
    drawRect(P.Tape.copy(alpha = .92f), Offset(54f, 34f), Size(12f, 9f))
    // status LED
    val ledAlpha = when { mood == BuddyMood.Offline -> .15f; reduced -> 1f; mood == BuddyMood.Thinking -> .2f + .8f * (sin(fast * 2 * PI).toFloat() + 1) / 2; else -> .55f + .45f * pulse }
    drawCircle(if (mood == BuddyMood.Offline) Color(0xffff4d4d) else P.Eye, 1.8f, Offset(90f, 38.5f), alpha = ledAlpha)

    // scanner visor
    drawRoundRect(P.Visor, Offset(32f, 50f), Size(56f, 28f), CornerRadius(10f))
    clipRect(32f, 50f, 88f, 78f) {
        val scanY = 52f + 23f * (sin(scan * 2 * PI).toFloat() + 1) / 2
        drawRect(P.Eye.copy(alpha = if (mood == BuddyMood.Thinking) .55f else .16f), Offset(32f, scanY), Size(56f, 1.4f))
        if (mood == BuddyMood.Offline) listOf(Triple(36f, 56f, 6f), Triple(62f, 60f, 9f), Triple(44f, 70f, 5f), Triple(74f, 54f, 4f), Triple(52f, 74f, 7f))
            .forEachIndexed { i, (x, y, w) -> drawRect(P.Paper.copy(alpha = if (reduced) .12f else .3f * kotlin.math.abs(sin((fast + i * .17f) * 2 * PI)).toFloat()), Offset(x, y), Size(w, 1.2f)) }
        translate(ex, ey) { drawEyes(mood, blink, fast, reduced) }
    }
    drawPath(Path().apply { moveTo(37f, 55f); quadraticTo(40f, 52f, 46f, 52f) }, Color.White.copy(alpha = .18f), style = Stroke(2f, cap = StrokeCap.Round))
    // cheeks
    val cheek = if (mood == BuddyMood.Happy || mood == BuddyMood.Found || mood == BuddyMood.Wave) .55f else .3f
    drawOval(P.Eye.copy(alpha = cheek), Offset(29.5f, 81.7f), Size(8f, 4.6f))
    drawOval(P.Eye.copy(alpha = cheek), Offset(82.5f, 80.7f), Size(8f, 4.6f))
    drawMouth(mood, fast, reduced)
}

private const val EL = 48f; private const val ER = 72f; private const val EY = 64f

private fun DrawScope.drawEyes(mood: BuddyMood, blink: Boolean, fast: Float, reduced: Boolean) {
    when (mood) {
        BuddyMood.Happy, BuddyMood.Wave -> listOf(EL, ER).forEach { x ->
            drawPath(Path().apply { moveTo(x - 5, EY + 2); quadraticTo(x, EY - 5, x + 5, EY + 2) }, P.Eye, style = Stroke(3.2f, cap = StrokeCap.Round))
        }
        BuddyMood.Thinking -> {
            listOf(EL, ER).forEach { x -> drawRoundRect(P.Eye, Offset(x - 4.5f, EY - 4), Size(9f, 4f), CornerRadius(2f)) }
            repeat(3) { i ->
                val a = if (reduced) 1f else .2f + .8f * kotlin.math.abs(sin((fast + i * .18f) * PI)).toFloat()
                drawCircle(P.Eye, 1.6f, Offset(54f + i * 6, EY + 6), alpha = a)
            }
        }
        BuddyMood.Confused -> {
            drawRoundRect(P.Eye, Offset(EL - 4, EY - 5.5f), Size(8f, 11f), CornerRadius(3f))
            drawRoundRect(P.Eye, Offset(ER - 4.5f, EY - 5), Size(9f, 5f), CornerRadius(2f))
        }
        BuddyMood.Sleepy -> listOf(EL, ER).forEach { x -> drawRoundRect(P.Eye, Offset(x - 5, EY + 1), Size(10f, 2.6f), CornerRadius(1.3f)) }
        BuddyMood.Offline -> listOf(EL, ER).forEach { x ->
            drawLine(P.Eye, Offset(x - 4, EY - 4), Offset(x + 4, EY + 4), 2.6f, StrokeCap.Round)
            drawLine(P.Eye, Offset(x + 4, EY - 4), Offset(x - 4, EY + 4), 2.6f, StrokeCap.Round)
        }
        else -> {
            val big = mood == BuddyMood.Found
            val w = if (big) 10f else 8f; val full = if (big) 13f else 11f
            val h = if (blink) full * .12f else full
            listOf(EL, ER).forEach { x ->
                drawRoundRect(P.Eye, Offset(x - w / 2, EY - h / 2), Size(w, h), CornerRadius(3f))
                if (!blink) drawRoundRect(P.Glint.copy(alpha = .85f), Offset(x - w / 2 + 1.6f, EY - h / 2 + 1.6f), Size(2.6f, 3f), CornerRadius(1f))
            }
        }
    }
}

private fun DrawScope.drawMouth(mood: BuddyMood, fast: Float, reduced: Boolean) {
    when (mood) {
        BuddyMood.Talking -> {
            val ry = if (reduced) 2.6f else 1.2f + 2.2f * kotlin.math.abs(sin(fast * 2 * PI)).toFloat()
            drawOval(P.Brown, Offset(56f, 86.5f - ry), Size(8f, ry * 2))
        }
        BuddyMood.Happy, BuddyMood.Found, BuddyMood.Wave ->
            drawPath(Path().apply { moveTo(53.5f, 84.5f); quadraticTo(60f, 91.5f, 66.5f, 84.5f); close() }, P.Brown)
        BuddyMood.Confused -> drawPath(Path().apply { moveTo(54f, 87f); quadraticTo(57f, 84.5f, 60f, 87f); quadraticTo(63f, 89.5f, 66f, 87f) },
            P.Brown, style = Stroke(2.4f, cap = StrokeCap.Round))
        BuddyMood.Sleepy, BuddyMood.Offline -> drawOval(P.Brown, Offset(57.6f, 85.2f), Size(4.8f, 3.6f))
        BuddyMood.Thinking -> drawLine(P.Brown, Offset(56f, 87f), Offset(64f, 87f), 2.4f, StrokeCap.Round)
        else -> drawPath(Path().apply { moveTo(54.5f, 85f); quadraticTo(60f, 90f, 65.5f, 85f) }, P.Brown, style = Stroke(2.6f, cap = StrokeCap.Round))
    }
}

private fun DrawScope.drawExtras(mood: BuddyMood, drift: Float, reduced: Boolean) {
    val float = if (reduced) 0f else -3f * sin(drift * 2 * PI).toFloat()
    when (mood) {
        BuddyMood.Found -> translate(top = float) {
            // Buddy Brackets burst out of the lid
            drawPath(Path().apply { moveTo(14f, 22f); lineTo(21f, 22f); lineTo(21f, 24.6f); lineTo(16.6f, 24.6f); lineTo(16.6f, 34.4f); lineTo(21f, 34.4f); lineTo(21f, 37f); lineTo(14f, 37f); close() }, P.Amber)
            drawPath(Path().apply { moveTo(106f, 22f); lineTo(99f, 22f); lineTo(99f, 24.6f); lineTo(103.4f, 24.6f); lineTo(103.4f, 34.4f); lineTo(99f, 34.4f); lineTo(99f, 37f); lineTo(106f, 37f); close() }, P.Amber)
            drawPath(Path().apply { moveTo(60f, 4f); lineTo(61.8f, 8.2f); lineTo(66f, 10f); lineTo(61.8f, 11.8f); lineTo(60f, 16f); lineTo(58.2f, 11.8f); lineTo(54f, 10f); lineTo(58.2f, 8.2f); close() }, P.Eye)
            drawCircle(P.Paper, 1.6f, Offset(36f, 14f)); drawCircle(P.Paper, 1.3f, Offset(86f, 12f))
        }
        BuddyMood.Confused -> rotate(if (reduced) 0f else 6f * sin(drift * 2 * PI).toFloat(), pivot = Offset(102f, 20f)) {
            // a question mark built from strokes
            translate(top = float) {
                drawPath(Path().apply { moveTo(97f, 15f); quadraticTo(97f, 9f, 103f, 9f); quadraticTo(109f, 9f, 109f, 15f); quadraticTo(109f, 19f, 103f, 21f); lineTo(103f, 25f) },
                    P.Paper, style = Stroke(3f, cap = StrokeCap.Round))
                drawCircle(P.Paper, 1.9f, Offset(103f, 30f))
            }
        }
        BuddyMood.Sleepy -> repeat(3) { i ->
            val p = if (reduced) .5f else (drift + i / 3f) % 1f
            val alpha = if (reduced) .8f else sin(p * PI).toFloat()
            val x = 94f + i * 5 + p * 12; val y = 34f - i * 7 - p * 20; val sz = 6f + i * 3
            // a "z" drawn as three strokes
            val z = Path().apply { moveTo(x, y); lineTo(x + sz, y); lineTo(x, y + sz); lineTo(x + sz, y + sz) }
            drawPath(z, P.Paper.copy(alpha = alpha.coerceIn(0f, 1f)), style = Stroke(1.8f, cap = StrokeCap.Round))
        }
        else -> Unit
    }
}
