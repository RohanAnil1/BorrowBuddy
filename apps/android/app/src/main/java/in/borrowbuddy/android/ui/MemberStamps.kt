package `in`.borrowbuddy.android.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.tween
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.borrowbuddy.android.domain.ProfileStamp
import `in`.borrowbuddy.android.domain.ProfileStamps
import kotlinx.coroutines.delay
import kotlin.random.Random

val MemberStampsEarned = SemanticsPropertyKey<Int>("MemberStampsEarned")
private enum class StampPhase { Static, Armed, Pressed }

/**
 * Achievement stamps inked onto the member ID card. Owners see every stamp,
 * locked ones greyed with a short hint; other students see earned ones only.
 * Earned stamps press in once when scrolled into view, never with reduced
 * motion, and not when they were already on screen at first layout.
 */
@Composable fun MemberStamps(stamps: List<ProfileStamp>, owner: Boolean) {
    val reduced = rememberReducedMotion()
    val earned = stamps.count { it.earned }
    val shown = ProfileStamps.visible(stamps, owner)
    var phase by remember(stamps) { mutableStateOf<StampPhase?>(null) }
    val windowHeight = LocalWindowInfo.current.containerSize.height
    val viewport = LocalWindowInfo.current.containerSize.width / LocalDensity.current.density
    val columns = if (viewport >= 640) 3 else 2
    Column(Modifier.fillMaxWidth().border(1.dp, Cargo.Line).padding(horizontal = 21.dp, vertical = 21.dp).testTag("member-stamps")
        .semantics { this[MemberStampsEarned] = earned }
        .onGloballyPositioned { coordinates ->
            val bounds = coordinates.boundsInWindow()
            val onScreen = bounds.top < windowHeight && bounds.bottom > 0f
            phase = when (phase) {
                null -> if (reduced || earned == 0 || onScreen) StampPhase.Static else StampPhase.Armed
                StampPhase.Armed -> if (bounds.top < windowHeight * .8f && bounds.bottom > 0f) StampPhase.Pressed else StampPhase.Armed
                else -> phase
            }
        }) {
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, itemVerticalAlignment = Alignment.CenterVertically) {
            Text("[ STAMPS ]", style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f))
            Text(if (owner) "$earned / ${stamps.size} EARNED" else if (earned > 0) "$earned EARNED" else "", style = loanMono(9), color = Cargo.Accent)
        }
        if (shown.isEmpty()) {
            Text("NO STAMPS YET. THEY ARRIVE WITH COMPLETED LOANS AND HANDOVERS.", Modifier.padding(top = 16.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
        } else {
            Column(Modifier.padding(top = 20.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
                shown.chunked(columns).forEachIndexed { row, items ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items.forEachIndexed { column, stamp ->
                            Stamp(stamp, row * columns + column, phase ?: StampPhase.Static, owner, Modifier.weight(1f))
                        }
                        repeat(columns - items.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }
    }
}

@Composable private fun Stamp(stamp: ProfileStamp, index: Int, phase: StampPhase, showHint: Boolean, modifier: Modifier) {
    val design = ProfileStamps.designs.getValue(stamp.key)
    val ink = if (stamp.earned) Cargo.Accent else Cargo.Ink.copy(alpha = .3f)
    val scale = remember(stamp.key) { Animatable(1f) }
    val alpha = remember(stamp.key) { Animatable(1f) }
    LaunchedEffect(phase, stamp.earned) {
        if (!stamp.earned) return@LaunchedEffect
        when (phase) {
            StampPhase.Armed -> { alpha.snapTo(0f); scale.snapTo(1.45f) }
            StampPhase.Pressed -> {
                delay(index * 110L)
                alpha.animateTo(1f, tween(250))
                scale.animateTo(1f, keyframes { durationMillis = 420; 0.94f at 250 })
            }
            StampPhase.Static -> { alpha.snapTo(1f); scale.snapTo(1f) }
        }
    }
    val shape = if (design.round) CircleShape else RoundedCornerShape(6.dp)
    val description = if (stamp.earned) "${design.label} stamp earned" else "${design.label} stamp locked, ${stamp.progress} of ${stamp.goal}. ${design.hint}"
    Column(modifier.testTag("member-stamp-${stamp.key}").semantics(mergeDescendants = true) {
        contentDescription = description; stateDescription = if (stamp.earned) "Earned" else "Locked"
    }, horizontalAlignment = Alignment.CenterHorizontally) {
        val size = if (design.round) Modifier.size(96.dp) else Modifier.size(width = 112.dp, height = 80.dp)
        Box(size
            .graphicsLayer {
                scaleX = scale.value; scaleY = scale.value; this.alpha = alpha.value
                rotationZ = if (stamp.earned) design.tilt else 0f
                compositingStrategy = CompositingStrategy.Offscreen
            }
            .then(if (stamp.earned) Modifier.inkSpeckle(stamp.key) else Modifier)
            .then(if (stamp.earned) Modifier.border(2.dp, ink, shape) else Modifier.dashedOutline(ink, design.round, 2.dp))
            .padding(4.dp)
            .then(if (stamp.earned) Modifier.border(1.dp, ink.copy(alpha = .7f), shape) else Modifier.dashedOutline(Cargo.Ink.copy(alpha = .15f), design.round, 1.dp)),
            contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.padding(horizontal = 4.dp)) {
                Text(design.rim, style = loanMono(7).copy(lineHeight = 8.sp), color = ink, textAlign = TextAlign.Center)
                Text(design.label, style = TextStyle(fontFamily = Cargo.Title, fontSize = 15.sp, lineHeight = 15.sp), color = ink, textAlign = TextAlign.Center)
                Text(if (stamp.earned) "★ EARNED ★" else "${stamp.progress} / ${stamp.goal}", style = loanMono(7).copy(lineHeight = 8.sp), color = ink, textAlign = TextAlign.Center)
            }
        }
        if (showHint && !stamp.earned) {
            Text(design.hint.uppercase(), Modifier.padding(top = 12.dp).widthIn(max = 140.dp), style = loanMono(8).copy(lineHeight = 12.sp),
                color = Cargo.Ink.copy(alpha = .45f), textAlign = TextAlign.Center)
        }
    }
}

private fun Modifier.dashedOutline(color: Color, round: Boolean, width: androidx.compose.ui.unit.Dp) = drawBehind {
    val stroke = Stroke(width.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx())))
    val inset = width.toPx() / 2
    if (round) drawCircle(color, radius = size.minDimension / 2 - inset, style = stroke)
    else drawRoundRect(color, topLeft = Offset(inset, inset), size = androidx.compose.ui.geometry.Size(size.width - inset * 2, size.height - inset * 2),
        cornerRadius = CornerRadius(6.dp.toPx()), style = stroke)
}

/** Knock small deterministic gaps out of the ink so it reads as a rubber stamp. */
private fun Modifier.inkSpeckle(seed: String) = drawWithContent {
    drawContent()
    val random = Random(seed.hashCode())
    repeat(70) {
        drawCircle(Color.Black, radius = (0.6f + random.nextFloat() * 1.4f) * density,
            center = Offset(random.nextFloat() * size.width, random.nextFloat() * size.height), blendMode = BlendMode.DstOut)
    }
}
