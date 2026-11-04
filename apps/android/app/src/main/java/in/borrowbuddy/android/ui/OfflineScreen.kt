package `in`.borrowbuddy.android.ui

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import `in`.borrowbuddy.android.BuildConfig
import `in`.borrowbuddy.android.data.CampusConnectionProbe
import io.ktor.client.engine.okhttp.OkHttp
import kotlinx.coroutines.*
import kotlin.math.cos
import kotlin.math.PI

internal fun connectionFailure(failure: Throwable): Boolean = generateSequence(failure) { it.cause }.any {
    it is java.io.IOException || it.javaClass.simpleName in setOf("UnresolvedAddressException", "HttpRequestTimeoutException", "ConnectTimeoutException")
}
private val campusConnectionProbe by lazy {
    CampusConnectionProbe(OkHttp.create(), BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY)
}
internal suspend fun checkCampusConnection(): Boolean = campusConnectionProbe.check()

/** A modal keeps the actual navigation tree and unsent drafts alive while preventing accidental actions. */
@Composable internal fun OfflineGate(onResume: () -> Unit, onHome: () -> Unit, content: @Composable () -> Unit) {
    val context = LocalContext.current.applicationContext
    val manager = remember(context) { context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager }
    fun hasNetwork(): Boolean = manager.activeNetwork?.let { network -> manager.getNetworkCapabilities(network)?.let {
        it.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && it.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_SUSPENDED)
    } } == true
    var offline by rememberSaveable { mutableStateOf(!hasNetwork()) }
    var connected by remember { mutableStateOf(hasNetwork()) }
    var restored by remember { mutableStateOf(false) }
    var checking by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    fun retry(resume: Boolean, detectOffline: Boolean = false) {
        if (checking) return
        checking = true
        scope.launch {
            try {
                restored = checkCampusConnection()
                if (!restored && detectOffline) offline = true
                if (restored && resume) { offline = false; onResume() }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { restored = false; if (detectOffline) offline = true }
            finally { checking = false }
        }
    }
    DisposableEffect(manager) {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { scope.launch { connected = true; if (offline) retry(false) } }
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) { scope.launch {
                connected = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_SUSPENDED)
                if (!connected) { offline = true; restored = false }
                else if (offline) retry(false)
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
    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (isActive) {
                connected = hasNetwork()
                if (!connected) { offline = true; restored = false }
                // An available network can still be waiting for DNS/route readiness.
                if (offline && connected && !restored) retry(false)
                delay(3000)
            }
        }
    }
    content()
    if (offline) Dialog(onDismissRequest = {}, properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false, dismissOnClickOutside = false)) {
        OfflineScreen(checking, restored, { retry(true) }, home = { onHome(); retry(true) })
    }
}

val OfflineMotionPaused = SemanticsPropertyKey<Boolean>("OfflineMotionPaused")
@Composable internal fun OfflineScreen(checking: Boolean = false, restored: Boolean = false, retry: () -> Unit, home: (() -> Unit)? = null) {
    var paused by rememberSaveable { mutableStateOf(false) }
    val reduced = rememberReducedMotion()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var elapsed by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(paused, reduced, lifecycle) {
        if (!paused && !reduced) lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            var last = 0L
            while (true) androidx.compose.animation.core.withInfiniteAnimationFrameNanos { frame ->
                if (last != 0L) elapsed = (elapsed + (frame - last).coerceAtMost(100_000_000L) / 1_000_000f) % 2400f
                last = frame
            }
        }
    }
    Box(Modifier.fillMaxSize().background(Cargo.Canvas).safeDrawingPadding().testTag("offline-screen")
        .semantics { paneTitle = if (restored) "Connection restored" else "Connection unavailable"; isTraversalGroup = true }, contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 1080.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CargoMark(Modifier.size(34.dp)); Text("BORROWBUDDY", style = loanMono(12), color = Cargo.Ink)
            }
            BoxWithConstraints(Modifier.fillMaxWidth().border(1.dp, Cargo.Ink.copy(alpha = .24f))) {
                val wide = maxWidth >= 700.dp
                @Composable fun Copy(modifier: Modifier) { Column(modifier.background(Cargo.Panel).padding(28.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    CargoLabel(if (restored) "[ CONNECTION RESTORED ]" else "[ SIGNAL LOST ]", Cargo.Warn)
                    val titleSize = if (wide) 80.sp else 56.sp
                    Column(Modifier.semantics(mergeDescendants = true) { heading() }) { Text("A LITTLE OUT", style = TextStyle(fontFamily = Cargo.Title, fontSize = titleSize, lineHeight = titleSize), color = Cargo.Paper)
                        Text("OF REACH.", style = TextStyle(fontFamily = Cargo.Title, fontSize = titleSize, lineHeight = titleSize), color = Cargo.Accent) }
                    CampusCopy("Your campus is still there. Your connection just took a detour. Reconnect to pick up where you left off.")
                    CampusButton(if (checking) "CHECKING CONNECTION…" else if (restored) "RESUME MY PAGE" else "TRY AGAIN", retry,
                        enabled = !checking, shape = RoundedCornerShape(0.dp))
                    home?.let { CampusButton("Campus home ↗", it, enabled = !checking, secondary = true) }
                    Text(if (checking) "Checking your connection…" else if (restored) "You’re back online. Resume when you’re ready." else "Check Wi-Fi or mobile data, then try again.",
                        Modifier.semantics { liveRegion = LiveRegionMode.Polite }, style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f))
                } }
                @Composable fun Art(modifier: Modifier) { Column(modifier.background(Cargo.Deep).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    CargoLabel("DISPATCH PAUSED · BB / — —", Cargo.Ink.copy(alpha = .5f))
                    OfflineCargo(Modifier.fillMaxWidth().heightIn(max = if (wide) 400.dp else 245.dp).aspectRatio(1.2f)
                        .semantics { this[OfflineMotionPaused] = paused || reduced }, if (reduced) 0f else elapsed)
                    if (!reduced) CampusButton(if (paused) "Play animation" else "Pause animation", { paused = !paused }, secondary = true,
                        modifier = Modifier.semantics { stateDescription = if (paused) "Animation paused" else "Animation playing" })
                    CargoLabel("ROUTE STATUS · AWAITING CONNECTION", Cargo.Ink.copy(alpha = .6f))
                    CargoLabel("DESTINATION · YOUR CAMPUS", Cargo.Ink.copy(alpha = .6f))
                } }
                if (wide) Row { Copy(Modifier.weight(1f)); Art(Modifier.weight(1f)) }
                else Column { Art(Modifier.fillMaxWidth()); Copy(Modifier.fillMaxWidth()) }
            }
            CargoLabel("[ GOOD THINGS FIND THEIR WAY BACK. ]", Cargo.Ink.copy(alpha = .6f))
            CargoLabel("LISTINGS · MESSAGES · HANDOVERS NEED A LIVE CONNECTION.", Cargo.Ink.copy(alpha = .6f))
        }
    }
}

@Composable private fun OfflineCargo(modifier: Modifier, elapsed: Float) {
    val paths = remember { listOf(
        "M44 258H376M66 280H354M96 300H324",
        "M52 221C52 170 101 140 148 140M272 140C321 140 368 170 368 221",
        "M208 87Q250 45 292 87", "M220 99Q250 69 280 99", "M233 111Q250 94 267 111",
        "M246 119l8 8m0-8-8 8", "m134 160 76-39 76 39v79l-76 39-76-39z",
        "m134 160 76 39 76-39M210 199v79M176 139l76 39v22l-16 8v-22l-76-39",
        "m232 233 30-15v19l-30 15z", "m153 192 32 16m-32-6 20 10",
        "M38 66h18m-9-9v18M355 286h18m-9-9v18"
    ).map { requireNotNull(androidx.core.graphics.PathParser.createPathFromPathData(it)).asComposePath() } }
    Canvas(modifier) {
        val scale = minOf(size.width / 420f, size.height / 350f)
        withTransform({ translate((size.width - 420 * scale) / 2, (size.height - 350 * scale) / 2); scale(scale, scale, Offset.Zero) }) {
            for (x in 10..410 step 20) for (y in 10..340 step 20) drawCircle(Cargo.Ink.copy(alpha = .12f), .7f, Offset(x.toFloat(), y.toFloat()))
            drawPath(paths[0], Cargo.Ink.copy(alpha = .15f), style = Stroke(1f))
            drawOval(Cargo.Ink.copy(alpha = .2f), Offset(97f, 237f), Size(226f, 42f), style = Stroke(1f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3f, 7f))))
            drawPath(paths[1], Cargo.Accent, style = Stroke(2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(5f, 9f), -56f * elapsed / 2400f)))
            for (index in 2..4) drawPath(paths[index], Cargo.Accent.copy(alpha = (.6 + .4 * cos((elapsed - (index - 2) * 300) / 2400 * 2 * PI)).toFloat()), style = Stroke(3f, cap = StrokeCap.Round))
            drawPath(paths[5], Cargo.Warn, style = Stroke(2f))
            translate(top = (-5 + 5 * cos(elapsed / 2400 * 2 * PI)).toFloat()) {
                drawPath(paths[6], Cargo.Deep); drawPath(paths[6], Cargo.Paper, style = Stroke(2f)); drawPath(paths[7], Cargo.Paper, style = Stroke(2f))
                drawPath(paths[8], Cargo.Accent); drawPath(paths[9], Cargo.Ink.copy(alpha = .45f), style = Stroke(2f))
            }
            drawCircle(Cargo.Paper, 5f, Offset(52f, 221f)); drawCircle(Cargo.Accent, 5f, Offset(368f, 221f)); drawPath(paths[10], Cargo.Ink.copy(alpha = .3f), style = Stroke(1f))
        }
    }
}
