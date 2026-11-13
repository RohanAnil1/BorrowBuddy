package `in`.borrowbuddy.android.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowManager
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import `in`.borrowbuddy.android.R
import java.time.Duration
import java.time.Instant

/**
 * Reads a handover QR. Accepts the app's own payload ("bb:pickup:123456") for
 * the expected kind, or a bare six-digit code. Anything else is rejected, so
 * a pickup code can never confirm a return (the server checks again).
 */
internal fun parseHandoverQr(raw: String?, kind: String): HandoverScan {
    val value = raw?.trim().orEmpty()
    Regex("^\\d{6}$").matchEntire(value)?.let { return HandoverScan.Code(value) }
    val match = Regex("^bb:([a-z]+):(\\d{6})$").matchEntire(value) ?: return HandoverScan.NotOurs
    val (scannedKind, code) = match.destructured
    return if (scannedKind == kind) HandoverScan.Code(code) else HandoverScan.WrongKind(scannedKind)
}

internal sealed interface HandoverScan {
    data class Code(val code: String) : HandoverScan
    data class WrongKind(val kind: String) : HandoverScan
    data object NotOurs : HandoverScan
}

/** "789262" -> "789 262", easier to read out loud. */
internal fun groupedCode(code: String) = if (code.length == 6) "${code.take(3)} ${code.takeLast(3)}" else code

private fun Context.activity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.activity()
    else -> null
}

/** Full screen brightness while a QR is on screen, so the other phone reads it first try. */
@Composable fun KeepScreenBright() {
    val activity = LocalContext.current.activity() ?: return
    DisposableEffect(activity) {
        val window = activity.window
        val previous = window.attributes.screenBrightness
        window.attributes = window.attributes.apply { screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            window.attributes = window.attributes.apply { screenBrightness = previous }
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
}

/**
 * Opens Google's code scanner (camera UI from Play services, no camera
 * permission needed) and hands back the raw QR text.
 */
@Composable fun rememberQrScanner(onScanned: (String?) -> Unit, onUnavailable: (String) -> Unit): () -> Unit {
    val context = LocalContext.current
    val latest by rememberUpdatedState(onScanned)
    val failed by rememberUpdatedState(onUnavailable)
    val scanner = remember(context) {
        GmsBarcodeScanning.getClient(context, GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).enableAutoZoom().build())
    }
    // Play services downloads the scanner the first time any app asks; start that now, not on the first tap.
    LaunchedEffect(scanner) {
        runCatching { ModuleInstall.getClient(context).installModules(ModuleInstallRequest.newBuilder().addApi(scanner).build()) }
    }
    return remember(scanner) {
        {
            scanner.startScan()
                .addOnSuccessListener { barcode -> latest(barcode.rawValue) }
                .addOnFailureListener { error ->
                    val downloading = (error as? MlKitException)?.errorCode == MlKitException.UNAVAILABLE
                    failed(if (downloading) "Getting the scanner ready. Try again in a few seconds, or type the six digits."
                        else "The scanner isn't available on this phone. Type the six digits instead.")
                }
        }
    }
}

/**
 * The code holder's side: a paper "pass" with a big QR, the code grouped for
 * reading aloud, and a bar that drains as the 15 minutes run out. The screen
 * goes to full brightness while it's showing.
 */
@Composable fun HandoverPassCard(kind: String, code: String?, expires: Instant?, now: Instant, busy: Boolean, payloadPrefix: String = "bb:$kind:",
    codeTag: String = "handover-code", generate: () -> Unit) {
    val live = code != null && expires != null && now < expires
    val remaining = if (live) Duration.between(now, expires).seconds.coerceAtLeast(0) else 0
    val fraction by animateFloatAsState((remaining / 900f).coerceIn(0f, 1f), tween(900), label = "pass-time")
    val urgent = live && remaining < 120
    val title = when (kind) { "return" -> "RETURN PASS"; "collection" -> "COLLECTION PASS"; else -> "PICKUP PASS" }
    Column(Modifier.fillMaxWidth().testTag("handover-pass"), horizontalAlignment = Alignment.CenterHorizontally) {
        Column(Modifier.widthIn(max = 360.dp).fillMaxWidth().background(Cargo.Paper, RoundedCornerShape(12.dp)), horizontalAlignment = Alignment.CenterHorizontally) {
            // Header stripe: what this pass is, in cargo-tape colours.
            Row(Modifier.fillMaxWidth().background(Cargo.Accent, RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)).padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = loanMono(11), color = Color.Black)
                Text(if (live) "SINGLE USE" else "NO ACTIVE CODE", style = loanMono(9), color = Color.Black.copy(alpha = .7f))
            }
            if (live) {
                KeepScreenBright()
                Box(Modifier.padding(top = 20.dp)) { QrTile("$payloadPrefix$code") }
                Text(groupedCode(code!!), Modifier.padding(top = 18.dp).testTag(codeTag).semantics { contentDescription = "Code ${code.toList().joinToString(" ")}" },
                    style = loanBody(40).copy(fontFamily = Cargo.Ticket, letterSpacing = 6.sp, lineHeight = 40.sp), color = Color.Black)
                // Time left drains left to right; amber, then red in the last two minutes.
                Box(Modifier.padding(top = 14.dp).fillMaxWidth(.8f).height(6.dp).background(Color.Black.copy(alpha = .1f), RoundedCornerShape(3.dp))) {
                    Box(Modifier.fillMaxWidth(fraction).fillMaxHeight().background(if (urgent) Color(0xffc0261a) else Cargo.Accent, RoundedCornerShape(3.dp)))
                }
                Text(if (remaining >= 60) "${(remaining + 59) / 60} MIN LEFT" else "${remaining}S LEFT",
                    Modifier.padding(top = 6.dp).semantics { liveRegion = LiveRegionMode.Polite },
                    style = loanMono(10), color = if (urgent) Color(0xffc0261a) else Color.Black.copy(alpha = .6f))
                Row(Modifier.padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(painterResource(R.drawable.ic_sun), null, Modifier.size(14.dp), tint = Color.Black.copy(alpha = .5f))
                    Text("Screen brightened for scanning", style = loanBody(11), color = Color.Black.copy(alpha = .55f))
                }
            } else {
                Icon(painterResource(R.drawable.ic_scan), null, Modifier.padding(top = 28.dp).size(56.dp), tint = Color.Black.copy(alpha = .25f))
                Text(if (code == null) "Generate a code when you meet." else "That code expired. Make a fresh one.",
                    Modifier.padding(top = 10.dp, start = 16.dp, end = 16.dp), style = loanBody(13), color = Color.Black.copy(alpha = .7f), textAlign = TextAlign.Center)
            }
            // Perforation, then the action on the stub.
            Box(Modifier.padding(top = 20.dp).fillMaxWidth().height(2.dp).drawBehind {
                drawLine(Color.Black.copy(alpha = .18f), Offset(16.dp.toPx(), 0f), Offset(size.width - 16.dp.toPx(), 0f), 2.dp.toPx(),
                    pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(10f, 8f)), cap = StrokeCap.Round)
            })
            Text(if (code == null) "GENERATE CODE" else "NEW CODE", Modifier.padding(16.dp).fillMaxWidth().testTag("handover-generate")
                .background(Color.Black, RoundedCornerShape(8.dp)).clickable(enabled = !busy, onClick = generate).padding(vertical = 14.dp),
                style = loanBody(13).copy(fontFamily = Cargo.Strong), color = Cargo.Accent.copy(alpha = if (busy) .5f else 1f), textAlign = TextAlign.Center)
        }
    }
}

/**
 * The confirmer's side: one big "Scan their QR" button, and six digit boxes
 * for typing the code instead. A good scan confirms straight away.
 */
@Composable fun HandoverConfirmCard(kind: String, token: String, setToken: (String) -> Unit, busy: Boolean, scanError: String?,
    scan: () -> Unit, confirm: () -> Unit, confirmLabel: String = "Confirm $kind") {
    val focus = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    Column(Modifier.fillMaxWidth().testTag("handover-confirm"), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        ScanQrButton(busy, scan)
        scanError?.let { CargoLabel("[ $it ]", Cargo.Warn, Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.weight(1f).height(1.dp).background(Cargo.Line))
            Text("OR TYPE THE CODE", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
            Box(Modifier.weight(1f).height(1.dp).background(Cargo.Line))
        }
        BasicTextField(token, { value -> if (value.length <= 6 && value.all(Char::isDigit)) setToken(value) },
            Modifier.fillMaxWidth().testTag("handover-digits").semantics { contentDescription = "6-digit code" },
            enabled = !busy, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { focus.clearFocus(); keyboard?.hide() }),
            decorationBox = { _ ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)) {
                    repeat(6) { index ->
                        val char = token.getOrNull(index)
                        val active = index == token.length
                        Box(Modifier.weight(1f).widthIn(max = 52.dp).aspectRatio(.8f).background(Cargo.Panel, RoundedCornerShape(8.dp))
                            .border(if (active) 2.dp else 1.dp, if (active || char != null) Cargo.Accent else Cargo.Line, RoundedCornerShape(8.dp)),
                            contentAlignment = Alignment.Center) {
                            Text(char?.toString().orEmpty(), style = loanBody(24).copy(fontFamily = Cargo.Ticket), color = Cargo.Ink)
                        }
                        if (index == 2) Spacer(Modifier.width(6.dp))
                    }
                }
            })
        CargoButton(confirmLabel, confirm, enabled = !busy && token.length == 6, modifier = Modifier.fillMaxWidth().testTag("handover-confirm-button"))
    }
}

/** The big amber "Scan their QR" button. */
@Composable fun ScanQrButton(busy: Boolean, scan: () -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().heightIn(min = 64.dp).testTag("handover-scan").background(Cargo.Accent.copy(alpha = if (busy) .5f else 1f), RoundedCornerShape(12.dp))
        .clickable(enabled = !busy, onClick = scan).semantics { contentDescription = "Scan their QR code" }.padding(horizontal = 18.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.size(40.dp).background(Color.Black.copy(alpha = .15f), RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
            Icon(painterResource(R.drawable.ic_scan), null, Modifier.size(24.dp), tint = Color.Black)
        }
        Column(Modifier.weight(1f)) {
            Text("SCAN THEIR QR", style = loanBody(15).copy(fontFamily = Cargo.Strong), color = Color.Black)
            Text("Point at the pass on their phone", style = loanBody(12), color = Color.Black.copy(alpha = .7f))
        }
        Icon(painterResource(R.drawable.ic_camera), null, Modifier.size(20.dp), tint = Color.Black)
    }
}

/** Plain-language result of a scan, or null when it gave a usable code. */
internal fun scanProblem(result: HandoverScan, kind: String): String? = when (result) {
    is HandoverScan.Code -> null
    is HandoverScan.WrongKind -> "That's a ${result.kind} code. Ask for their $kind pass."
    HandoverScan.NotOurs -> "That QR isn't a BorrowBuddy handover code."
}
