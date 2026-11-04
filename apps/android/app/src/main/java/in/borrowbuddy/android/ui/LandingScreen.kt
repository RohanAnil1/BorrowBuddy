package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.PickupLocation
import `in`.borrowbuddy.android.graphics.NativeDevice
import kotlinx.coroutines.launch

val fallbackSpots = listOf(
    PickupLocation("maggi-hotspot", "Maggi Hotspot", "Eatery counter in front of Block C1", xp = 38.8, yp = 44.4),
    PickupLocation("southern-stories", "Southern Stories", "Eatery counter in front of Block D1", xp = 38.8, yp = 41.3, map_label = "left"),
    PickupLocation("d5-stage", "D5 Stage", "Open-air stage in front of Block D5", xp = 37.5, yp = 35.7, map_label = "left"),
    PickupLocation("laundry", "Laundry", "Laundry drop between Blocks D4 and D2", xp = 42.0, yp = 36.6),
    PickupLocation("quench", "Quench", "Eatery counter in front of the Sports Complex", xp = 29.7, yp = 33.6, map_label = "left"),
)

@Composable fun LandingScreen(repository: BorrowRepository, signIn: () -> Unit) {
    var spots by remember { mutableStateOf(fallbackSpots) }
    LaunchedEffect(repository) {
        if (repository.configured) {
            try { repository.locations().filter { it.xp != null && it.yp != null }.takeIf { it.isNotEmpty() }?.let { spots = it } }
            catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (_: Exception) { /* Public landing retains its existing offline pickup fallback. */ }
        }
    }
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val conveyor = rememberSaveable(saver = `in`.borrowbuddy.android.graphics.ConveyorPlayback.Saver) { `in`.borrowbuddy.android.graphics.ConveyorPlayback() }
    val density = LocalDensity.current.density
    var viewportWidth by remember { mutableFloatStateOf(0f) }
    var viewportHeight by remember { mutableFloatStateOf(0f) }
    var viewportBounds by remember { mutableStateOf<androidx.compose.ui.geometry.Rect?>(null) }
    val opening = remember { MutableTransitionState(true) }
    LaunchedEffect(Unit) { kotlinx.coroutines.delay(1100); opening.targetState = false }
    val preloading = opening.currentState || opening.targetState || !opening.isIdle
    Box(Modifier.fillMaxSize().onSizeChanged { viewportHeight = it.height / density; viewportWidth = it.width / density }
        .onGloballyPositioned { viewportBounds = it.boundsInWindow() }) {
        LandingBackdrop()
        LazyColumn(Modifier.fillMaxSize().then(if (preloading) Modifier.clearAndSetSemantics {} else Modifier), state = list, contentPadding = PaddingValues(horizontal = 16.dp)) {
            item { StatusTicker(Modifier.requiredWidth(viewportWidth.dp), viewportBounds) }
            item {
                Column(Modifier.padding(vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
                    CargoLabel("[ BORROWBUDDY · CAMPUS LENDING SERVICE · BU ]", Cargo.Ink)
                    CargoLabel("[ BENNETT UNIVERSITY · EST. 2016 ]")
                    Text("THE CAMPUS", style = MaterialTheme.typography.displayLarge)
                    Text("LENDING NETWORK", style = MaterialTheme.typography.displayLarge, color = Cargo.Accent)
                    CargoBody("Borrow anything on campus — cameras, projectors, fans, board games — from verified Bennett students, handed over by QR, tracked end to end. You request, they accept, the loan moves. No group-chat chaos. No ghosting.", color = Cargo.Ink)
                    CargoButton("▶ Start borrowing", signIn)
                    CargoLabel("[ QR VERIFIED ]  [ SINGLE-USE CODES ]  [ TRUST SCORES ]")
                    NativeDevice(Modifier.fillMaxWidth().height(420.dp)) { DeviceStandIn() }
                }
            }
            item {
                BorrowQueue(conveyor, viewportWidth, viewportHeight) { LineStandIn() }
            }
            item {
                TagWall(Modifier.requiredWidth(viewportWidth.dp), viewportHeight, viewportBounds)
            }
            item {
                Column(Modifier.padding(top = 56.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
                    CargoTitle("▶ Where you pick up")
                    CargoBody("BorrowBuddy hands over at fixed campus spots — Maggi Hotspot by C1, Southern Stories by D1, the D5 stage, the laundry desk and Quench by the sports complex. Pick a point to trace the walk from the gate.", color = Cargo.Ink)
                    CampusBoard(spots, browse = { signIn() })
                }
            }
            item {
                Column(Modifier.padding(top = 56.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
                    CargoTitle("▶ Why it's safe")
                    CargoBody("Informal borrowing breaks at the worst moment: a phone returned scratched, a lens that never came back, a chat that went quiet. BorrowBuddy replaces the favour economy with real logistics — real availability calendars, double-booking refused by the database itself, and a custody chain that starts and ends with a QR scan. Deposits and fines settle between students. The platform keeps the ledger, never the money.", color = Cargo.Ink)
                    CargoButton("See how a loan moves", { scope.launch { list.animateScrollToItem(2) } }, secondary = true)
                    CargoPanel { CargoLabel("[ BORROWBUDDY · CUSTODY RECEIPT · NO. 0427 ]"); CargoBody("ITEM: SONY A7 III"); CargoLabel("ROUTE: BLOCK-C → LIB"); CargoBody("[ RETURNED ON TIME ]"); CargoLabel("TRUST SCORE 92 · VERIFIED STUDENT · 2/2 SCANS") }
                    listOf("Verified students only" to "Every ID is reviewed by the student admin team before borrowing or lending unlocks. Campus-only, always.", "QR handovers" to "Pickup and return both scan through single-use codes. Custody changes hands with a record, not a promise.", "Guaranteed accountability" to "Overdue fines, trust scores, dispute resolution. The system keeps the receipts so you never have to.").forEach { (title, body) -> CargoPanel { Text(title.uppercase(), style = MaterialTheme.typography.titleMedium); CargoBody(body) } }
                }
            }
            item {
                StatusTicker(Modifier.requiredWidth(viewportWidth.dp), viewportBounds)
            }
            item {
                CargoPanel {
                    CargoLabel("[ BORROWBUDDY ]", Cargo.Ink)
                    CargoBody("The campus lending network · Bennett University. Borrow what you need. Lend what you don't.")
                    CargoButton("How it works", { scope.launch { list.animateScrollToItem(2) } }, secondary = true)
                    CargoButton("Pickup spots", { scope.launch { list.animateScrollToItem(4) } }, secondary = true)
                    CargoButton("Sign in", signIn)
                }
            }
        }
        ShelfOpeningOverlay(opening)
    }
}

/** Native counterpart of the website's static GPU fallback. */
@Composable private fun DeviceStandIn() {
    Box(Modifier.fillMaxWidth().height(420.dp), contentAlignment = androidx.compose.ui.Alignment.Center) {
        Canvas(Modifier.width(290.dp).fillMaxHeight()) {
            drawRoundRect(Brush.linearGradient(listOf(Color(0xffc6cad1), Color(0xff5d626b))), cornerRadius = androidx.compose.ui.geometry.CornerRadius(36.dp.toPx()))
            drawRoundRect(Color(0xff101216), Offset(size.width * .19f, 18.dp.toPx()), Size(size.width * .62f, 18.dp.toPx()), androidx.compose.ui.geometry.CornerRadius(9.dp.toPx()))
            drawRoundRect(Color(0xff030711), Offset(20.dp.toPx(), 55.dp.toPx()), Size(size.width - 40.dp.toPx(), size.height - 80.dp.toPx()), androidx.compose.ui.geometry.CornerRadius(14.dp.toPx()))
            for (row in -12..12) for (column in -12..12) {
                val distance = row * row + column * column
                if (distance < 140) drawCircle(Cargo.Accent.copy(alpha = (.2f + .7f * (1 - distance / 140f)).coerceIn(0f, 1f)), 1.4.dp.toPx(), Offset(size.width / 2 + column * 8.dp.toPx(), size.height / 2 + row * 8.dp.toPx()))
            }
        }
        Image(painterResource(R.drawable.bu_shield), "Bennett University shield", Modifier.size(100.dp))
    }
}
/** Native counterpart of the website's four-station static GPU fallback. */
@Composable private fun LineStandIn() {
    Canvas(Modifier.fillMaxWidth().height(210.dp)) {
        val baseline = size.height * .8f
        drawRect(Cargo.Panel.copy(alpha = .6f), Offset(0f, baseline - 20.dp.toPx()), Size(size.width, 30.dp.toPx()))
        repeat(4) { gate ->
            val x = size.width * (.125f + gate * .25f)
            val half = size.width * .08f
            drawLine(Cargo.Ink.copy(alpha = .3f), Offset(x - half, baseline), Offset(x - half, baseline - 120.dp.toPx()), 3.dp.toPx())
            drawLine(Cargo.Ink.copy(alpha = .3f), Offset(x + half, baseline), Offset(x + half, baseline - 120.dp.toPx()), 3.dp.toPx())
            drawLine(Cargo.Ink.copy(alpha = .3f), Offset(x - half, baseline - 120.dp.toPx()), Offset(x + half, baseline - 120.dp.toPx()), 5.dp.toPx())
            drawCircle(Cargo.Accent, 6.dp.toPx(), Offset(x, baseline - 95.dp.toPx()))
        }
        drawRect(Color(0xff8a6a44), Offset(size.width * .13f, baseline - 85.dp.toPx()), Size(38.dp.toPx(), 65.dp.toPx()))
        drawRect(Cargo.Paper, Offset(size.width * .13f + 3.dp.toPx(), baseline - 60.dp.toPx()), Size(32.dp.toPx(), 25.dp.toPx()))
    }
}
