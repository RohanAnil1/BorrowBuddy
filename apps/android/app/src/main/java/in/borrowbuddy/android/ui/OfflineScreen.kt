package `in`.borrowbuddy.android.ui

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.SystemClock
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.*
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import `in`.borrowbuddy.android.BuildConfig
import `in`.borrowbuddy.android.data.BuddyMood
import `in`.borrowbuddy.android.data.CampusConnectionProbe
import `in`.borrowbuddy.android.data.WebHealthProbe
import io.ktor.client.engine.okhttp.OkHttp
import kotlinx.coroutines.*
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.roundToInt
import kotlin.random.Random

internal fun connectionFailure(failure: Throwable): Boolean = generateSequence(failure) { it.cause }.any {
    it is java.io.IOException || it.javaClass.simpleName in setOf("UnresolvedAddressException", "HttpRequestTimeoutException", "ConnectTimeoutException")
}
private val campusConnectionProbe by lazy {
    CampusConnectionProbe(OkHttp.create(), BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY)
}
internal suspend fun checkCampusConnection(): Boolean = campusConnectionProbe.check()

/** Wait between automatic checks: 5 → 10 → 20 → 30 s, then 30 s. */
internal fun offlineBackoffSeconds(attempt: Int): Int = intArrayOf(5, 10, 20, 30)[attempt.coerceIn(0, 3)]
/** 1 when the antenna points at the sweet spot, fading to 0 at 45° away. */
internal fun antennaStrength(angle: Float, sweetSpot: Float): Float = (1f - abs(angle - sweetSpot) / 45f).coerceIn(0f, 1f)
internal fun pickSweetSpot(random: Random = Random.Default): Float {
    val spot = 18f + random.nextFloat() * 34f
    return if (random.nextBoolean()) -spot else spot
}

internal enum class CheckState { Waiting, Checking, Ok, Failed }
internal data class OfflineCheck(val state: CheckState = CheckState.Waiting, val label: String = "Waiting")
internal data class OfflineDiagnostics(val device: OfflineCheck = OfflineCheck(), val campus: OfflineCheck = OfflineCheck(), val data: OfflineCheck = OfflineCheck())
internal data class OfflineCountdown(val secondsLeft: Int, val progress: Float, val attempt: Int)

/** A modal keeps the actual navigation tree and unsent drafts alive while preventing accidental actions. */
@Composable internal fun OfflineGate(onResume: () -> Unit, onHome: () -> Unit, webBaseUrl: String = "", content: @Composable () -> Unit) {
    val context = LocalContext.current.applicationContext
    val manager = remember(context) { context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager }
    fun capabilities() = manager.activeNetwork?.let { manager.getNetworkCapabilities(it) }
    fun hasNetwork(): Boolean = capabilities()?.let {
        it.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && it.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_SUSPENDED)
    } == true
    fun deviceCheck() = when {
        !hasNetwork() -> OfflineCheck(CheckState.Failed, "Offline")
        capabilities()?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true -> OfflineCheck(CheckState.Ok, "Online")
        else -> OfflineCheck(CheckState.Failed, "No internet")
    }
    var offline by rememberSaveable { mutableStateOf(!hasNetwork()) }
    var connected by remember { mutableStateOf(hasNetwork()) }
    var restored by remember { mutableStateOf(false) }
    var checking by remember { mutableStateOf(false) }
    var diagnostics by remember { mutableStateOf(OfflineDiagnostics()) }
    var attempt by remember { mutableIntStateOf(0) }
    var delayMs by remember { mutableLongStateOf(0L) }
    var remainingMs by remember { mutableLongStateOf(0L) }
    val reduced = rememberReducedMotion()
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val webProbe = remember(webBaseUrl) { webBaseUrl.takeIf { it.isNotBlank() }?.let { WebHealthProbe(OkHttp.create(), it) } }
    DisposableEffect(webProbe) { onDispose { webProbe?.close() } }

    fun scheduleNext() { delayMs = offlineBackoffSeconds(attempt) * 1000L; remainingMs = delayMs; attempt++ }
    fun leave() { offline = false; attempt = 0; delayMs = 0L; remainingMs = 0L; onResume() }
    fun retry(resume: Boolean, detectOffline: Boolean = false) {
        if (checking) return
        checking = true
        if (offline) diagnostics = OfflineCheck(CheckState.Checking, "Checking…").let { OfflineDiagnostics(it, it, it) }
        scope.launch {
            var celebrate = false
            try {
                val (data, web) = coroutineScope {
                    val data = async { checkCampusConnection() }
                    val web = async { webProbe?.check() }
                    data.await() to web.await()
                }
                restored = data
                diagnostics = OfflineDiagnostics(deviceCheck(),
                    when { webProbe == null -> OfflineCheck(CheckState.Waiting, "Not set up"); web?.app == true -> OfflineCheck(CheckState.Ok, "Reachable"); else -> OfflineCheck(CheckState.Failed, "No answer") },
                    if (data) OfflineCheck(CheckState.Ok, "Reachable") else OfflineCheck(CheckState.Failed, "No answer"))
                if (!data && detectOffline) offline = true
                if (data && offline) { if (resume) leave() else celebrate = true }
                else if (offline) scheduleNext()
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { restored = false; if (detectOffline) offline = true; if (offline) scheduleNext() }
            finally { checking = false }
            // Parcel celebrates for a moment, then the original page comes back.
            if (celebrate) { delay(if (reduced) 800L else 2000L); if (offline && restored) leave() }
        }
    }
    DisposableEffect(manager) {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { scope.launch { connected = true; if (offline) { attempt = 0; retry(false) } } }
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) { scope.launch {
                connected = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_SUSPENDED)
                if (!connected) { offline = true; restored = false }
                else if (offline) { attempt = 0; retry(false) }
                else if (!capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) retry(false, detectOffline = true)
            } }
            override fun onBlockedStatusChanged(network: Network, blocked: Boolean) { scope.launch {
                if (blocked) { connected = false; offline = true; restored = false }
                else { connected = hasNetwork(); if (offline) retry(false) }
            } }
            override fun onLost(network: Network) { scope.launch { connected = hasNetwork(); if (!connected) { offline = true; restored = false } } }
        }
        manager.registerDefaultNetworkCallback(callback)
        onDispose { manager.unregisterNetworkCallback(callback) }
    }
    // Re-read foreground state as well as listening for callbacks: configuration
    // changes and modem suspension can otherwise leave a missed transition.
    // The backoff countdown only runs while the app is visible.
    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            var lastPoll = 0L
            var lastTick = SystemClock.elapsedRealtime()
            while (isActive) {
                val now = SystemClock.elapsedRealtime()
                val elapsed = now - lastTick; lastTick = now
                if (now - lastPoll >= if (offline) 1000L else 3000L) {
                    lastPoll = now
                    connected = hasNetwork()
                    if (!connected) { offline = true; restored = false }
                }
                if (offline && !checking && !restored) {
                    if (delayMs == 0L) retry(false)
                    else { remainingMs -= elapsed; if (remainingMs <= 0L) retry(false) }
                }
                delay(250)
            }
        }
    }
    content()
    if (offline) Dialog(onDismissRequest = {}, properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false)) {
        val countdown = if (checking || restored || delayMs == 0L) null
            else OfflineCountdown(((remainingMs.coerceAtLeast(0L) + 999) / 1000).toInt(), (1f - remainingMs.toFloat() / delayMs).coerceIn(0f, 1f), attempt)
        OfflineScreen(checking, restored, { retry(true) }, home = { onHome(); retry(true) }, diagnostics = diagnostics, countdown = countdown,
            onSignalLock = { retry(false) })
    }
}

val OfflineMotionPaused = SemanticsPropertyKey<Boolean>("OfflineMotionPaused")
private val Fail = Color(0xffff7a66)

@Composable internal fun OfflineScreen(checking: Boolean = false, restored: Boolean = false, retry: () -> Unit, home: (() -> Unit)? = null,
    diagnostics: OfflineDiagnostics? = null, countdown: OfflineCountdown? = null, onSignalLock: () -> Unit = retry) {
    var paused by rememberSaveable { mutableStateOf(false) }
    val reduced = rememberReducedMotion()
    val mood = when { restored -> BuddyMood.Happy; checking -> BuddyMood.Thinking; else -> BuddyMood.Offline }
    Box(Modifier.fillMaxSize().background(Cargo.Canvas).safeDrawingPadding().testTag("offline-screen")
        .semantics { paneTitle = if (restored) "Connection restored" else "Connection unavailable"; isTraversalGroup = true }, contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 1080.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CargoMark(Modifier.size(34.dp)); Text("BORROWBUDDY", style = loanMono(12), color = Cargo.Ink)
            }
            BoxWithConstraints(Modifier.fillMaxWidth().border(1.dp, Cargo.Ink.copy(alpha = .24f))) {
                val wide = maxWidth >= 700.dp
                @Composable fun Copy(modifier: Modifier) { Column(modifier.background(Cargo.Panel).padding(28.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                    CargoLabel(when { restored -> "[ CONNECTION RESTORED ]"; checking -> "[ CHECKING ]"; else -> "[ SIGNAL LOST ]" }, if (restored) Cargo.Ok else Cargo.Warn)
                    val titleSize = if (wide) 80.sp else 56.sp
                    Column(Modifier.semantics(mergeDescendants = true) { heading() }) {
                        Text(if (restored) "BACK ON" else "A LITTLE OUT", style = TextStyle(fontFamily = Cargo.Title, fontSize = titleSize, lineHeight = titleSize), color = Cargo.Paper)
                        Text(if (restored) "ROUTE." else "OF REACH.", style = TextStyle(fontFamily = Cargo.Title, fontSize = titleSize, lineHeight = titleSize), color = Cargo.Accent)
                    }
                    CampusCopy("Your campus is still there. Parcel is hunting for a signal, and we’ll take you straight back the moment it’s found.")
                    diagnostics?.let { DiagnosticsList(it) }
                    if (diagnostics != null) Countdown(countdown, checking, restored)
                    CampusButton(if (checking) "CHECKING CONNECTION…" else if (restored) "RESUME MY PAGE" else "TRY AGAIN", retry,
                        enabled = !checking, shape = RoundedCornerShape(0.dp))
                    home?.let { CampusButton("Campus home ↗", it, enabled = !checking, secondary = true) }
                    Text(if (checking) "Checking your connection…" else if (restored) "Back online, taking you back…" else "Check Wi-Fi or mobile data. We’ll keep trying automatically.",
                        Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f))
                    if (home != null) Text("Your unsent drafts are safe: this screen sits on top of your page, so anything you were typing is still there.",
                        Modifier.fillMaxWidth().border(1.dp, Cargo.Ink.copy(alpha = .2f)).padding(12.dp), style = loanBody(12), color = Cargo.Ink.copy(alpha = .75f))
                } }
                @Composable fun Art(modifier: Modifier) { Column(modifier.background(Cargo.Deep).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    SignalHunt(mood, still = paused || reduced, active = !restored, size = if (wide) 220.dp else 170.dp, onLock = onSignalLock, modifier = Modifier.fillMaxWidth())
                    if (!reduced) CampusButton(if (paused) "Play animation" else "Pause animation", { paused = !paused }, secondary = true,
                        modifier = Modifier.semantics { stateDescription = if (paused) "Animation paused" else "Animation playing" })
                    CargoLabel("ROUTE STATUS · ${if (restored) "BACK ON ROUTE" else "AWAITING CONNECTION"}", Cargo.Ink.copy(alpha = .6f))
                    CargoLabel("DESTINATION · YOUR PAGE", Cargo.Ink.copy(alpha = .6f))
                } }
                if (wide) Row(Modifier.height(IntrinsicSize.Max)) { Copy(Modifier.weight(1f).fillMaxHeight()); Art(Modifier.weight(1f).fillMaxHeight()) }
                else Column { Art(Modifier.fillMaxWidth()); Copy(Modifier.fillMaxWidth()) }
            }
            CatchTheParcels(restored, reduced)
            CargoLabel("[ GOOD THINGS FIND THEIR WAY BACK. ]", Cargo.Ink.copy(alpha = .6f))
            CargoLabel("LISTINGS · MESSAGES · HANDOVERS NEED A LIVE CONNECTION.", Cargo.Ink.copy(alpha = .6f))
        }
    }
}

@Composable private fun DiagnosticsList(diagnostics: OfflineDiagnostics) {
    Column(Modifier.fillMaxWidth()) {
        listOf(Triple("Your device", "WI-FI OR MOBILE DATA", diagnostics.device), Triple("Campus server", "BORROWBUDDY WEB APP", diagnostics.campus),
            Triple("Data service", "LISTINGS, LOANS, MESSAGES", diagnostics.data)).forEach { (name, detail, check) ->
            Row(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}
                .drawBehind { drawRect(Color.White.copy(alpha = .15f), size = Size(size.width, 1.dp.toPx())) }.padding(vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CheckDot(check.state)
                Column(Modifier.weight(1f)) {
                    Text(name, style = loanBody(14), color = Cargo.Ink.copy(alpha = .85f))
                    Text(detail, style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                }
                Text(check.label.uppercase(), style = loanMono(10), color = when (check.state) {
                    CheckState.Ok -> Cargo.Ok; CheckState.Failed -> Fail; CheckState.Checking -> Cargo.Warn; else -> Cargo.Ink.copy(alpha = .6f)
                })
            }
        }
    }
}

@Composable private fun CheckDot(state: CheckState) {
    Canvas(Modifier.size(16.dp)) {
        val r = size.minDimension / 2 - 1.dp.toPx(); val stroke = Stroke(1.5.dp.toPx(), cap = StrokeCap.Round)
        when (state) {
            CheckState.Ok -> {
                drawCircle(Cargo.Ok, r)
                drawPath(Path().apply { moveTo(size.width * .3f, size.height * .52f); lineTo(size.width * .45f, size.height * .66f); lineTo(size.width * .72f, size.height * .38f) },
                    Color.Black, style = stroke)
            }
            CheckState.Failed -> { drawCircle(Fail, r, style = stroke); drawLine(Fail, Offset(size.width * .32f, center.y), Offset(size.width * .68f, center.y), 1.5.dp.toPx()) }
            CheckState.Checking -> drawArc(Cargo.Accent, -90f, 270f, false, Offset(center.x - r, center.y - r), Size(r * 2, r * 2), style = stroke)
            CheckState.Waiting -> drawCircle(Color.White.copy(alpha = .4f), r, style = stroke)
        }
    }
}

@Composable private fun Countdown(countdown: OfflineCountdown?, checking: Boolean, restored: Boolean) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            CargoLabel(when { restored -> "CONNECTED"; checking -> "CHECKING NOW…"; countdown != null -> "NEXT CHECK IN ${countdown.secondsLeft}S"; else -> "STARTING CHECKS…" }, Cargo.Ink.copy(alpha = .6f))
            countdown?.let { CargoLabel("ATTEMPT ${it.attempt}", Cargo.Ink.copy(alpha = .6f)) }
        }
        val progress = when { restored -> 1f; else -> countdown?.progress ?: 0f }
        Box(Modifier.fillMaxWidth().height(3.dp).background(Color.White.copy(alpha = .12f))) {
            Box(Modifier.fillMaxWidth(progress).fillMaxHeight().background(Cargo.Accent))
        }
    }
}

/** Parcel with a draggable antenna: tilt it toward the hidden sweet spot to fill the signal lock. Purely playful. */
@Composable private fun SignalHunt(mood: BuddyMood, still: Boolean, active: Boolean, size: Dp, onLock: () -> Unit, modifier: Modifier) {
    var angle by rememberSaveable { mutableFloatStateOf(-8f) }
    var sweet by rememberSaveable { mutableFloatStateOf(pickSweetSpot()) }
    var lock by remember { mutableFloatStateOf(0f) }
    var hint by remember { mutableStateOf("Drag Parcel’s antenna, or focus it and use the arrow keys, to hunt for signal.") }
    var focused by remember { mutableStateOf(false) }
    val currentOnLock by rememberUpdatedState(onLock)
    val strength = antennaStrength(angle, sweet)
    val bars = (strength * 5).roundToInt()
    fun tilt(value: Float) {
        angle = value.coerceIn(-60f, 60f).roundToInt().toFloat()
        val lit = (antennaStrength(angle, sweet) * 5).roundToInt()
        hint = when { lit >= 4 -> "Strong signal! Hold it there to lock on."; lit >= 2 -> "Warmer… keep tilting."; else -> "Cold. Try tilting the other way." }
    }
    val locking = strength >= .8f
    LaunchedEffect(locking, active) {
        if (!active) { lock = 0f; return@LaunchedEffect }
        while (isActive) {
            delay(50)
            lock = (lock + if (antennaStrength(angle, sweet) >= .8f) 50f / 1300f else -50f / 1600f).coerceIn(0f, 1f)
            if (lock >= 1f) {
                lock = 0f; sweet = pickSweetSpot()
                hint = "Signal locked! Checking right now… The signal moved, hunt again."
                currentOnLock(); break
            }
            if (lock <= 0f && !locking) break
        }
    }
    val antennaAlpha by animateFloatAsState(if (mood == BuddyMood.Happy) 0f else 1f, label = "antenna")
    val side = if (angle == 0f) "upright" else "${abs(angle).toInt()}° ${if (angle < 0) "left" else "right"}"
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            CargoLabel("SIGNAL HUNT", Cargo.Ink.copy(alpha = .5f))
            CargoLabel("ANT / ${if (angle < 0) "−" else "+"}${abs(angle).toInt().toString().padStart(2, '0')}°", Cargo.Ink.copy(alpha = .5f))
        }
        Box(Modifier.width(size).height(size * 1.3f)
            .onFocusChanged { focused = it.isFocused }
            .focusable(active)
            .onKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onKeyEvent false
                when (event.key) {
                    Key.DirectionLeft, Key.DirectionDown -> { tilt(angle - 4f); true }
                    Key.DirectionRight, Key.DirectionUp -> { tilt(angle + 4f); true }
                    Key.MoveHome -> { tilt(-60f); true }
                    Key.MoveEnd -> { tilt(60f); true }
                    else -> false
                }
            }
            .pointerInput(active) {
                if (!active) return@pointerInput
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    val k = this.size.width / 120f
                    val pivot = Offset(60f * k, this.size.height - this.size.width + 36f * k)
                    // Only the space above the lid steers the antenna, so the rest still scrolls.
                    if (down.position.y > pivot.y) return@awaitEachGesture
                    fun angleAt(p: Offset) = Math.toDegrees(atan2((p.x - pivot.x).toDouble(), (pivot.y - p.y).toDouble())).toFloat()
                    down.consume(); tilt(angleAt(down.position))
                    while (true) {
                        val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id } ?: break
                        if (!change.pressed) break
                        tilt(angleAt(change.position)); change.consume()
                    }
                }
            }
            .semantics {
                contentDescription = "Parcel’s antenna. Tilt it to hunt for signal."
                stateDescription = "Tilted $side, signal $bars of 5 bars"
                progressBarRangeInfo = ProgressBarRangeInfo(angle, -60f..60f)
                if (active) setProgress { tilt(it); true }
                this[OfflineMotionPaused] = still
            }
        ) {
            Canvas(Modifier.matchParentSize()) { drawAntenna(angle, strength, antennaAlpha, focused) }
            ParcelMascot(mood, size, Modifier.align(Alignment.BottomCenter), interactive = false, still = still)
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(Modifier.height(22.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                for (bar in 0 until 5) Box(Modifier.width(5.dp).fillMaxHeight((bar + 1) / 5f).background(if (bar < bars) Cargo.Accent else Color.White.copy(alpha = .15f)))
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                CargoLabel("SIGNAL LOCK", Cargo.Ink.copy(alpha = .5f))
                Box(Modifier.fillMaxWidth().height(3.dp).background(Color.White.copy(alpha = .12f))) {
                    Box(Modifier.fillMaxWidth(lock).fillMaxHeight().background(Cargo.Accent))
                }
            }
        }
        CargoLabel(if (!active) "SIGNAL FOUND! PARCEL IS PACKING UP." else hint, Cargo.Ink.copy(alpha = .7f), Modifier.fillMaxWidth())
    }
}

private fun DrawScope.drawAntenna(angle: Float, strength: Float, alpha: Float, focused: Boolean) {
    if (alpha <= 0f) return
    val k = size.width / 120f
    val top = size.height - size.width
    fun g(x: Float, y: Float) = Offset(x * k, top + y * k)
    rotate(angle, g(60f, 36f)) {
        drawLine(Color(0xff5a3712).copy(alpha = alpha), g(60f, 37f), g(60f, 14f), 2.6f * k, StrokeCap.Round)
        drawLine(Color(0xffdba066).copy(alpha = alpha), g(57.4f, 27f), g(62.6f, 27f), 1.6f * k, StrokeCap.Round)
        drawLine(Color(0xffdba066).copy(alpha = alpha), g(58.2f, 21f), g(61.8f, 21f), 1.6f * k, StrokeCap.Round)
        val wave = Stroke(1.8f * k, cap = StrokeCap.Round)
        if (strength > .35f) drawPath(Path().apply { moveTo(g(53.5f, 4.5f).x, g(53.5f, 4.5f).y); quadraticTo(g(60f, -1.5f).x, g(60f, -1.5f).y, g(66.5f, 4.5f).x, g(66.5f, 4.5f).y) },
            Color(0xffffaf30).copy(alpha = alpha * (strength * 1.2f).coerceAtMost(1f)), style = wave)
        if (strength > .7f) drawPath(Path().apply { moveTo(g(49.5f, .5f).x, g(49.5f, .5f).y); quadraticTo(g(60f, -9f).x, g(60f, -9f).y, g(70.5f, .5f).x, g(70.5f, .5f).y) },
            Color(0xffffaf30).copy(alpha = alpha * strength), style = wave)
        if (focused) drawCircle(Cargo.Paper.copy(alpha = alpha), 9f * k, g(60f, 10.5f),
            style = Stroke(1.3f * k, pathEffect = PathEffect.dashPathEffect(floatArrayOf(2f * k, 2.4f * k))))
        drawCircle(Cargo.Accent.copy(alpha = alpha), 4.6f * k, g(60f, 10.5f))
        drawCircle(Color(0xff5a3712).copy(alpha = alpha), 4.6f * k, g(60f, 10.5f), style = Stroke(1.2f * k))
        drawCircle(Color(0xfffff4dc).copy(alpha = alpha * .8f), 1.3f * k, g(58.6f, 9.1f))
    }
}
