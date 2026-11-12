package `in`.borrowbuddy.android.ui

import android.content.Context
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * "Catch the parcels": parcels ride a conveyor, tip off at a random spot and fall;
 * the cart catches them. Plain model (dp units) so the rules are unit-testable.
 */
internal class CatchGame(best: Int = 0, private val random: Random = Random.Default, private val autoSpawn: Boolean = true) {
    enum class Phase { Ready, Playing, Paused, Over, Back }
    enum class Event { Caught, Missed, Over }
    class Drop(var x: Float, var y: Float, val dropX: Float) { var stage = 0; var t = 0f; var vy = 0f }

    var phase by mutableStateOf(Phase.Ready); private set
    var score by mutableIntStateOf(0); private set
    var lives by mutableIntStateOf(LIVES); private set
    var best by mutableIntStateOf(best); private set
    /** Bumped every step so the canvas redraws. */
    var tick by mutableLongStateOf(0L); private set
    val drops = mutableListOf<Drop>()
    var width = 320f; private set
    var height = 240f; private set
    var cartX = 160f; private set
    var cartWidth = 80f; private set
    var belt = 0f; private set
    private var spawnIn = 0f

    val floorY get() = height - 34f
    private val level get() = min(8, score / 5)

    fun resize(w: Float, h: Float) {
        if (w <= 0f || h <= 0f) return
        val ratio = if (width > 0f) w / width else 1f
        width = max(200f, w); height = max(160f, h)
        cartWidth = (width * .14f).coerceIn(68f, 96f)
        cartX = (cartX * ratio).coerceIn(cartWidth / 2, width - cartWidth / 2)
        tick++
    }
    fun start() {
        if (phase == Phase.Back) return
        score = 0; lives = LIVES; drops.clear(); spawnIn = .5f; phase = Phase.Playing; tick++
    }
    fun pause() { if (phase == Phase.Playing) phase = Phase.Paused }
    fun resume() { if (phase == Phase.Paused) phase = Phase.Playing }
    /** Connection is back: freeze the round. Returns true when a round was in progress. */
    fun endBack(): Boolean {
        val wasPlaying = phase == Phase.Playing || phase == Phase.Paused
        saveBest(); phase = Phase.Back; tick++
        return wasPlaying
    }
    /** Returns true when this score is a new best. */
    fun saveBest(): Boolean { if (score <= best) return false; best = score; return true }
    fun spawn(dropX: Float = 30f + random.nextFloat() * (width - 60f)) { drops += Drop(-SIZE, BELT - SIZE, dropX) }

    /** Advances [dt] seconds. [move] is -1/0/1 from keys; [target] is a pointer x to steer toward. */
    fun step(dt: Float, reduced: Boolean, move: Int = 0, target: Float? = null): List<Event> {
        if (phase != Phase.Playing || dt <= 0f) return emptyList()
        val events = mutableListOf<Event>()
        val pace = if (reduced) .6f else 1f
        val beltSpeed = (120f + level * 14f) * pace
        belt = (belt + beltSpeed * dt) % 24f
        if (move != 0) cartX += move * 620f * dt
        else if (target != null) cartX += (target - cartX) * min(1f, dt * 16f)
        cartX = cartX.coerceIn(cartWidth / 2, width - cartWidth / 2)
        if (autoSpawn) {
            spawnIn -= dt
            if (spawnIn <= 0f) { spawn(); spawnIn = max(.8f, 1.8f - level * .12f) / pace }
        }
        val top = floorY - 4f
        val maxSpeed = (210f + level * 22f) * pace
        val iterator = drops.iterator()
        while (iterator.hasNext()) {
            val drop = iterator.next()
            when (drop.stage) {
                0 -> { drop.x += beltSpeed * dt; if (drop.x >= drop.dropX) { drop.x = drop.dropX; drop.stage = 1; drop.t = 0f } }
                1 -> { drop.t += dt; if (drop.t >= if (reduced) .6f else .4f) { drop.stage = 2; drop.vy = 30f } }
                else -> {
                    val before = drop.y + SIZE
                    drop.vy = min(maxSpeed, drop.vy + 620f * pace * dt); drop.y += drop.vy * dt
                    if (before < top && drop.y + SIZE >= top && abs(drop.x - cartX) <= cartWidth / 2 + 2f) {
                        iterator.remove(); score++; events += Event.Caught
                    } else if (drop.y > height) {
                        iterator.remove(); lives--; events += Event.Missed
                        if (lives <= 0) { saveBest(); phase = Phase.Over; events += Event.Over; break }
                    }
                }
            }
        }
        tick++
        return events
    }

    companion object { const val LIVES = 3; const val BELT = 34f; const val SIZE = 22f }
}

private const val BEST_PREFS = "borrowbuddy.offline"
private const val BEST_KEY = "catch_best"

@OptIn(ExperimentalLayoutApi::class)
@Composable internal fun CatchTheParcels(restored: Boolean, reduced: Boolean, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val prefs = remember(context) { context.applicationContext.getSharedPreferences(BEST_PREFS, Context.MODE_PRIVATE) }
    val game = remember { CatchGame(best = runCatching { prefs.getInt(BEST_KEY, 0) }.getOrDefault(0)) }
    fun persistBest() { runCatching { prefs.edit().putInt(BEST_KEY, game.best).apply() } }
    var left by remember { mutableStateOf(false) }
    var right by remember { mutableStateOf(false) }
    var target by remember { mutableStateOf<Float?>(null) }
    var focused by remember { mutableStateOf(false) }
    var announcement by remember { mutableStateOf("") }
    var wasPlayingAtReturn by remember { mutableStateOf(false) }
    val shake = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val screen = LocalDensity.current

    LaunchedEffect(restored) {
        if (restored && game.phase != CatchGame.Phase.Back) {
            wasPlayingAtReturn = game.endBack(); persistBest(); announcement = "You’re back online."
        }
    }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) game.pause() }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(game.phase, lifecycle) {
        if (game.phase != CatchGame.Phase.Playing) return@LaunchedEffect
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            var last = 0L
            while (isActive && game.phase == CatchGame.Phase.Playing) withFrameNanos { now ->
                val dt = if (last == 0L) 0f else min(.05f, (now - last) / 1_000_000_000f)
                last = now
                val events = game.step(dt, reduced, if (left == right) 0 else if (left) -1 else 1, target)
                if (CatchGame.Event.Missed in events && !reduced) scope.launch {
                    shake.snapTo(0f); shake.animateTo(1f, tween(300)); shake.snapTo(0f)
                }
                if (CatchGame.Event.Over in events) { persistBest(); announcement = "Round over. You caught ${game.score}." }
            }
        }
    }
    fun startOrResume() {
        if (game.phase == CatchGame.Phase.Paused) game.resume() else game.start()
        target = null; announcement = "Game started."
        runCatching { focus.requestFocus() }
    }
    fun togglePause() { if (game.phase == CatchGame.Phase.Playing) { game.pause(); announcement = "Game paused." } else if (game.phase == CatchGame.Phase.Paused) startOrResume() }

    Column(modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Ink.copy(alpha = .24f)).testTag("offline-game")) {
        FlowRow(Modifier.fillMaxWidth().padding(20.dp), horizontalArrangement = Arrangement.spacedBy(16.dp, Alignment.Start),
            verticalArrangement = Arrangement.spacedBy(12.dp), itemVerticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.padding(end = 12.dp)) {
                CargoLabel("WHILE YOU WAIT", Cargo.Warn)
                Text("CATCH THE PARCELS", Modifier.semantics { heading() }, style = TextStyle(fontFamily = Cargo.Title, fontSize = 34.sp, lineHeight = 36.sp), color = Cargo.Paper)
            }
            Text("SCORE ${game.score} · BEST ${game.best} · LIVES ${game.lives}", style = loanMono(11), color = Cargo.Ink.copy(alpha = .75f))
            if (game.phase == CatchGame.Phase.Playing || game.phase == CatchGame.Phase.Paused)
                CampusButton(if (game.phase == CatchGame.Phase.Paused) "Resume game" else "Pause game", ::togglePause, secondary = true)
        }
        Box(Modifier.fillMaxWidth().height(240.dp)) {
            Canvas(Modifier.fillMaxSize()
                .onSizeChanged { game.resize(it.width / screen.density, it.height / screen.density) }
                .graphicsLayer { translationX = if (shake.value == 0f) 0f else sin(shake.value * 20f) * (1f - shake.value) * 6.dp.toPx() }
                .focusRequester(focus).onFocusChanged { focused = it.isFocused; if (!it.isFocused) { left = false; right = false } }
                .focusable()
                .onPreviewKeyEvent { event ->
                    val down = event.type == KeyEventType.KeyDown
                    when (event.key) {
                        Key.DirectionLeft, Key.A -> { left = down; target = null; true }
                        Key.DirectionRight, Key.D -> { right = down; target = null; true }
                        Key.Spacebar, Key.P -> { if (down) when (game.phase) {
                            CatchGame.Phase.Playing, CatchGame.Phase.Paused -> togglePause()
                            CatchGame.Phase.Ready, CatchGame.Phase.Over -> if (event.key == Key.Spacebar) startOrResume()
                            else -> Unit
                        }; true }
                        Key.Enter, Key.NumPadEnter, Key.DirectionCenter -> {
                            if (down && game.phase != CatchGame.Phase.Playing && game.phase != CatchGame.Phase.Back) startOrResume()
                            game.phase != CatchGame.Phase.Back
                        }
                        else -> false
                    }
                }
                .pointerInput(Unit) { detectTapGestures(onPress = { if (game.phase == CatchGame.Phase.Playing) target = it.x / screen.density }) }
                .pointerInput(Unit) {
                    detectHorizontalDragGestures(onDragStart = { if (game.phase == CatchGame.Phase.Playing) target = it.x / screen.density }) { change, _ ->
                        if (game.phase == CatchGame.Phase.Playing) { target = change.position.x / screen.density; change.consume() }
                    }
                }
                .semantics {
                    contentDescription = "Catch the parcels game. Move the cart with the arrow keys or by dragging. Space pauses."
                    stateDescription = "Score ${game.score}, ${game.lives} lives"
                }
            ) {
                if (game.tick < 0) return@Canvas // read so every step redraws
                drawCatchGame(game, reduced, focused)
            }
            val phase = game.phase
            if (phase != CatchGame.Phase.Playing) Column(Modifier.matchParentSize().background(Cargo.Deep.copy(alpha = .86f)).padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterVertically)) {
                val (title, body) = when (phase) {
                    CatchGame.Phase.Paused -> "PAUSED" to "Score ${game.score}. Resume when you’re ready."
                    CatchGame.Phase.Over -> "ROUND OVER" to "You caught ${game.score} ${if (game.score == 1) "parcel" else "parcels"}. Best: ${game.best}."
                    CatchGame.Phase.Back -> "YOU’RE BACK!" to (if (wasPlayingAtReturn) "Final score ${game.score}. Taking you back…" else "Taking you back to your page…")
                    else -> "READY WHEN YOU ARE" to "Parcels roll off the conveyor. Watch the shadow and catch them in the cart. Three misses end the round."
                }
                Text(title, style = TextStyle(fontFamily = Cargo.Title, fontSize = 36.sp, lineHeight = 38.sp), color = Cargo.Paper, textAlign = TextAlign.Center)
                Text(body, style = loanBody(13), color = Cargo.Ink.copy(alpha = .75f), textAlign = TextAlign.Center)
                if (phase != CatchGame.Phase.Back) CampusButton(when (phase) { CatchGame.Phase.Paused -> "Resume"; CatchGame.Phase.Over -> "Play again"; else -> "Start game" },
                    ::startOrResume, shape = androidx.compose.foundation.shape.RoundedCornerShape(0.dp))
            }
        }
        CargoLabel("DRAG OR ← → / A D TO MOVE · SPACE OR P TO PAUSE", Cargo.Ink.copy(alpha = .55f), Modifier.padding(horizontal = 20.dp, vertical = 14.dp))
        Box(Modifier.size(0.dp).semantics { liveRegion = LiveRegionMode.Polite; contentDescription = announcement })
    }
}

private val Kraft = Color(0xffc98a4a); private val KraftShade = Color(0xffb2733a); private val Tape = Color(0xffefd7aa)
private val Visor = Color(0xff080b10); private val Eye = Color(0xffff9f00)

private fun DrawScope.drawCatchGame(game: CatchGame, reduced: Boolean, focused: Boolean) {
    val k = density
    drawRect(Cargo.Deep)
    for (x in 10 until (size.width / k).toInt() step 20) for (y in 10 until (size.height / k).toInt() step 20)
        drawRect(Color.White.copy(alpha = .09f), Offset(x * k, y * k), Size(1.2f * k, 1.2f * k))
    val belt = CatchGame.BELT * k
    drawRect(Color.Black, Offset(0f, belt), Size(size.width, 10 * k))
    var x = -24f + game.belt
    while (x < size.width / k) { drawRect(Cargo.Accent.copy(alpha = .55f), Offset(x * k, belt + 3 * k), Size(10 * k, 4 * k)); x += 24f }
    drawRect(Color.White.copy(alpha = .25f), Offset(0f, belt), Size(size.width, k))
    val floor = game.floorY * k
    drawRect(Color.White.copy(alpha = .15f), Offset(0f, floor + 20 * k), Size(size.width, k))
    for (drop in game.drops) if (drop.stage > 0) {
        val near = ((drop.y - CatchGame.BELT) / (game.floorY - CatchGame.BELT)).coerceIn(0f, 1f)
        val w = (8f + near * 8f) * k
        drawOval(Color(0xffffaf30).copy(alpha = .25f + near * .35f), Offset(drop.x * k - w, floor + 15 * k), Size(w * 2, 6 * k))
    }
    val s = CatchGame.SIZE * k
    for (drop in game.drops) {
        val tilt = if (drop.stage == 1 && !reduced) sin(drop.t * 40f) * 8f else if (drop.stage == 2) 3f else 0f
        val left = drop.x * k - s / 2; val top = drop.y * k
        rotate(tilt, Offset(drop.x * k, top + s / 2)) {
            drawRect(Kraft, Offset(left, top), Size(s, s))
            drawRect(KraftShade, Offset(left + s - 5 * k, top), Size(5 * k, s))
            drawRect(Tape, Offset(drop.x * k - 3 * k, top), Size(6 * k, 6 * k))
            drawRect(Visor, Offset(left + 3 * k, top + 7 * k), Size(s - 6 * k, 8 * k))
            drawRect(Eye, Offset(drop.x * k - 5 * k, top + 9 * k), Size(3 * k, 4 * k))
            drawRect(Eye, Offset(drop.x * k + 2 * k, top + 9 * k), Size(3 * k, 4 * k))
        }
    }
    val cx = game.cartX * k; val w = game.cartWidth * k
    drawPath(Path().apply {
        moveTo(cx - w / 2, floor - 4 * k); lineTo(cx + w / 2, floor - 4 * k)
        lineTo(cx + w / 2 - 8 * k, floor + 12 * k); lineTo(cx - w / 2 + 8 * k, floor + 12 * k); close()
    }, Cargo.Accent)
    drawRect(Cargo.Paper, Offset(cx - w / 2 - 2 * k, floor - 6 * k), Size(w + 4 * k, 3 * k))
    drawRect(Visor, Offset(cx - 9 * k, floor + k), Size(18 * k, 5 * k))
    drawCircle(Cargo.Paper, 4 * k, Offset(cx - w / 2 + 14 * k, floor + 16 * k))
    drawCircle(Cargo.Paper, 4 * k, Offset(cx + w / 2 - 14 * k, floor + 16 * k))
    if (focused) drawRect(Cargo.Accent, style = Stroke(2 * k))
}
