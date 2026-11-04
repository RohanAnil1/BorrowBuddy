package `in`.borrowbuddy.android.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.snapping.SnapPosition
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.interaction.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.*
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import kotlin.math.roundToInt

internal enum class DashboardTone(val label: String) {
    Info("[ PICKUP READY ]"), Active("[ RETURN ]"), Warn("[ DUE TODAY ]"), Danger("[ OVERDUE ]")
}
internal fun dashboardTone(loan: Loan, today: LocalDate): DashboardTone = when {
    loan.status == "overdue" || loan.due_date < today.toString() -> DashboardTone.Danger
    loan.due_date == today.toString() -> DashboardTone.Warn
    loan.status == "awaiting_pickup" -> DashboardTone.Info
    else -> DashboardTone.Active
}
internal fun dashboardGreeting(hour: Int) = when {
    hour < 5 -> "LATE SHIFT"; hour < 12 -> "GOOD MORNING"; hour < 17 -> "GOOD AFTERNOON"; else -> "GOOD EVENING"
}
val DashboardCategoryColumns = SemanticsPropertyKey<Int>("DashboardCategoryColumns")
val DashboardLoanCount = SemanticsPropertyKey<Int>("DashboardLoanCount")
val DashboardPulseAlpha = SemanticsPropertyKey<Float>("DashboardPulseAlpha")
private data class DashboardData(val loans: List<Loan>, val categories: List<Category>)

@Composable fun DashboardScreen(repository: BorrowRepository, profile: Profile, openLoan: (String) -> Unit,
    browse: (String?) -> Unit, borrows: () -> Unit) {
    LoadScreen(profile.id, { coroutineScope {
        val loans = async { repository.loans(profile.id) }; val categories = async { repository.categories() }
        DashboardData(loans.await(), categories.await())
    } }) { (loans, categories) ->
        val open = loans.filter { it.status in Rules.activeStatuses }
        val borrowing = open.filter { it.borrower_id == profile.id }
        val lending = open.filter { it.owner_id == profile.id }
        // Source concatenates borrowing then lending before its stable due-date sort.
        val ticker = (borrowing + lending).sortedBy { it.due_date }.take(8)
        val today = LocalDate.now(ZoneOffset.UTC)
        val viewport = LocalWindowInfo.current.containerSize.width / LocalDensity.current.density
        val columns = if (viewport >= 640) 4 else 2
        val titleSize = (viewport * .06f).coerceIn(40f, 64f)
        val reduced = rememberReducedMotion()
        var selectedLending by rememberSaveable { mutableStateOf(false) }
        var displayedLending by remember { mutableStateOf(selectedLending) }
        val opacity = remember { Animatable(1f) }
        val translation = remember { Animatable(0f) }
        val ease = remember { CubicBezierEasing(.4f, 0f, .2f, 1f) }
        LaunchedEffect(selectedLending, reduced) {
            if (reduced) {
                displayedLending = selectedLending; opacity.snapTo(1f); translation.snapTo(0f)
            } else if (displayedLending != selectedLending) {
                coroutineScope {
                    launch { opacity.animateTo(0f, tween(220, easing = ease)) }
                    launch { translation.animateTo(if (selectedLending) 16f else -16f, tween(220, easing = ease)) }
                }
                displayedLending = selectedLending
                translation.snapTo(if (selectedLending) -16f else 16f)
                coroutineScope {
                    launch { opacity.animateTo(1f, tween(220, easing = ease)) }
                    launch { translation.animateTo(0f, tween(220, easing = ease)) }
                }
            } else { opacity.animateTo(1f, tween(220, easing = ease)); translation.animateTo(0f, tween(220, easing = ease)) }
        }
        val rows = if (displayedLending) lending else borrowing
        val density = LocalDensity.current.density
        val motion = Modifier.graphicsLayer { alpha = opacity.value; translationX = translation.value * density }
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            LazyColumn(Modifier.widthIn(max = 1152.dp).fillMaxSize().testTag("dashboard-scroll")
                .semantics { this[DashboardCategoryColumns] = columns; this[DashboardLoanCount] = ticker.size },
                contentPadding = PaddingValues(horizontal = if (viewport >= 800) 40.dp else 16.dp, vertical = 32.dp)) {
                item(key = "intro") {
                    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                        verticalArrangement = Arrangement.spacedBy(16.dp), itemVerticalAlignment = Alignment.Bottom) {
                        Column {
                            Text("[ ${dashboardGreeting(LocalTime.now(Rules.campusZone).hour)} ]", style = loanMono(10), color = Cargo.Accent)
                            Text("${profile.full_name.substringBefore(' ')}'S LENDING DESK".uppercase(), Modifier.padding(top = 8.dp),
                                style = loanBody(40).copy(fontFamily = Cargo.Title, fontSize = titleSize.sp,
                                    lineHeight = (titleSize * 1.05f).sp, letterSpacing = (titleSize * .01f).sp), color = Cargo.Ink)
                        }
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("TRUST SCORE ${profile.trust_score.roundToInt()}", Modifier.background(Cargo.Accent.copy(alpha = .1f))
                                .border(1.dp, Cargo.Accent.copy(alpha = .6f)).padding(horizontal = 13.dp, vertical = 7.dp), style = loanMono(10), color = Cargo.Accent)
                            Text(if (profile.verification_status == "verified") "[ ID VERIFIED ]" else "[ ${profile.verification_status.uppercase()} ]",
                                Modifier.border(1.dp, Cargo.Line).padding(horizontal = 13.dp, vertical = 7.dp), style = loanMono(10), color = Cargo.Ink.copy(alpha = .6f))
                        }
                    }
                }
                item(key = "loans") {
                    Row(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("LOANS IN MOTION", style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f))
                        Text("FULL LOGBOOK →", Modifier.testTag("dashboard-logbook").clickable(onClick = borrows), style = loanMono(10), color = Cargo.Accent)
                    }
                    Spacer(Modifier.height(16.dp))
                    if (ticker.isEmpty()) Text("[ NOTHING MOVING RIGHT NOW — BROWSE THE CATALOG ]",
                        Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(horizontal = 17.dp, vertical = 21.dp),
                        style = loanMono(10), color = Cargo.Ink.copy(alpha = .5f))
                    else {
                        val tickerState = rememberLazyListState()
                        LazyRow(Modifier.testTag("dashboard-loan-ticker").fillMaxWidth().padding(bottom = 4.dp), state = tickerState,
                            flingBehavior = rememberSnapFlingBehavior(tickerState, snapPosition = SnapPosition.Start), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(ticker, key = { it.id }) { loan -> DashboardTicket(loan, profile.id, dashboardTone(loan, today), openLoan) }
                        }
                    }
                }
                item(key = "category-heading") { DashboardHeading("QUICK SEARCH") }
                itemsIndexed(categories.chunked(columns), key = { _, group -> "category-${group.first().id}" }) { index, group ->
                    Row(Modifier.fillMaxWidth().padding(top = if (index > 0) 12.dp else 0.dp).height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        group.forEach { category ->
                            val icon = when (category.icon) {
                                "laptop" -> R.drawable.ic_laptop; "camera" -> R.drawable.ic_camera; "gamepad" -> R.drawable.ic_gamepad
                                "dumbbell" -> R.drawable.ic_dumbbell; "book" -> R.drawable.ic_book; "wrench" -> R.drawable.ic_wrench
                                "fan" -> R.drawable.ic_fan; else -> R.drawable.ic_box
                            }
                            DashboardSurface(Modifier.weight(1f).fillMaxHeight().testTag("dashboard-category-${category.id}"), { browse(category.id) }, 17) {
                                Icon(painterResource(icon), null, Modifier.size(24.dp), tint = Cargo.Accent)
                                Text(category.name.uppercase(), Modifier.padding(top = 24.dp), style = loanMono(10), color = Cargo.Ink)
                            }
                        }
                        repeat(columns - group.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
                item(key = "movements-heading") { DashboardHeading("YOUR MOVEMENTS") }
                item(key = "tabs") {
                    val indicator by animateFloatAsState(if (selectedLending) 1f else 0f,
                        if (reduced) snap() else spring(dampingRatio = .8f, stiffness = 400f), label = "dashboard-tab-line")
                    BoxWithConstraints(Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth().padding(bottom = 1.dp)) {
                            listOf(false to "BORROWING (${borrowing.size})", true to "LENDING (${lending.size})").forEach { (value, text) ->
                                Box(Modifier.weight(1f).heightIn(min = 48.dp).selectable(selectedLending == value, role = Role.Tab, onClick = { selectedLending = value })
                                    .testTag(if (value) "dashboard-lending-tab" else "dashboard-borrowing-tab").padding(horizontal = 16.dp, vertical = 12.dp), contentAlignment = Alignment.Center) {
                                    Text(text, style = loanMono(11), color = if (selectedLending == value) Cargo.Accent else Cargo.Ink.copy(alpha = .5f))
                                }
                            }
                        }
                        Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(1.dp).background(Cargo.Line))
                        Box(Modifier.align(Alignment.BottomStart).offset { androidx.compose.ui.unit.IntOffset((maxWidth.toPx() * .5f * indicator).roundToInt(), 0) }
                            .width(maxWidth / 2).height(2.dp).background(Cargo.Accent))
                    }
                }
                if (rows.isEmpty()) item(key = "empty-movement-$displayedLending") {
                    Text("[ NOTHING HERE YET ]", motion.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line)
                        .padding(horizontal = 17.dp, vertical = 33.dp), style = loanMono(10), color = Cargo.Ink.copy(alpha = .5f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                }
                items(rows, key = { "movement-$displayedLending-${it.id}" }) { loan ->
                    DashboardMovementSurface(motion.testTag("dashboard-movement-${loan.id}"), { openLoan(loan.id) }) {
                        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(12.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                            Column {
                                Text(loan.item?.title.orEmpty().uppercase(), style = loanBody(14).copy(fontFamily = Cargo.Strong), color = Cargo.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("${if (displayedLending) "TO ${loan.borrower?.full_name.orEmpty()}" else "FROM ${loan.owner?.full_name.orEmpty()}"} · ${loanDateRange(loan.start_date, loan.due_date)}".uppercase(),
                                    Modifier.padding(top = 4.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                            }
                            LoanStatusBadge(loan.status)
                        }
                    }
                }
            }
        }
    }
}

@Composable private fun DashboardMovementSurface(modifier: Modifier, click: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val focused by interaction.collectIsFocusedAsState()
    val reduced = rememberReducedMotion()
    val fill by animateColorAsState(if (hovered || focused) Cargo.Ink.copy(alpha = .05f) else Color.Transparent,
        tween(if (reduced) 0 else 150), label = "movement-hover")
    Column(modifier.fillMaxWidth().background(fill).drawBehind {
        val stroke = 1.dp.toPx()
        drawLine(Cargo.Line, Offset(stroke / 2, 0f), Offset(stroke / 2, size.height), stroke)
        drawLine(Cargo.Line, Offset(size.width - stroke / 2, 0f), Offset(size.width - stroke / 2, size.height), stroke)
        drawLine(Cargo.Line, Offset(0f, size.height - stroke / 2), Offset(size.width, size.height - stroke / 2), stroke)
    }.clickable(interactionSource = interaction, indication = null, onClick = click)
        .padding(start = 17.dp, end = 17.dp, top = 16.dp, bottom = 17.dp), content = content)
}
@Composable private fun DashboardHeading(text: String) {
    Text(text, Modifier.padding(top = 40.dp, bottom = 16.dp), style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f))
}
@Composable private fun DashboardSurface(modifier: Modifier, click: () -> Unit, padding: Int, content: @Composable ColumnScope.() -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState(); val focused by interaction.collectIsFocusedAsState()
    val reduced = rememberReducedMotion()
    val border by animateColorAsState(if (hovered || focused) Cargo.Accent else Cargo.Line, tween(if (reduced) 0 else 150), label = "dashboard-hover")
    Column(modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, border)
        .clickable(interactionSource = interaction, indication = null, onClick = click).padding(padding.dp), content = content)
}
@Composable internal fun DashboardTicket(loan: Loan, viewer: String, tone: DashboardTone, open: (String) -> Unit) {
    val foreground = when (tone) { DashboardTone.Info -> Cargo.Ink; DashboardTone.Active -> Cargo.Accent; else -> Cargo.Warn }
    val border = when (tone) { DashboardTone.Info -> Cargo.Ink.copy(alpha = .5f); DashboardTone.Active -> Cargo.Accent.copy(alpha = .6f); DashboardTone.Warn -> Cargo.Warn.copy(alpha = .6f); DashboardTone.Danger -> Cargo.Warn }
    val fill = when (tone) { DashboardTone.Warn -> Cargo.Warn.copy(alpha = .1f); DashboardTone.Danger -> Cargo.Warn.copy(alpha = .2f); else -> Color.Transparent }
    var visible by remember { mutableStateOf(false) }
    val view = LocalView.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val reduced = rememberReducedMotion()
    val alpha = remember { mutableFloatStateOf(1f) }
    val elapsed = remember { floatArrayOf(0f) }
    LaunchedEffect(tone, visible, reduced, lifecycle) {
        if (tone != DashboardTone.Danger || reduced) alpha.floatValue = 1f
        else if (visible) lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            var previous = 0L
            val ease = CubicBezierEasing(.42f, 0f, .58f, 1f)
            while (true) withInfiniteAnimationFrameNanos { frame ->
                if (previous != 0L) elapsed[0] = (elapsed[0] + (frame - previous) / 1_000_000f) % 1600f
                previous = frame
                val phase = elapsed[0] / 800f
                alpha.floatValue = if (phase < 1f) 1f - .55f * ease.transform(phase) else .45f + .55f * ease.transform(phase - 1f)
            }
        }
    }
    DashboardSurface(Modifier.width(256.dp).testTag("dashboard-ticket-${loan.id}").onGloballyPositioned { coordinates ->
        val bounds = coordinates.boundsInWindow(); visible = bounds.bottom > 0 && bounds.top < view.rootView.height && bounds.right > 0 && bounds.left < view.rootView.width
    }, { open(loan.id) }, 17) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(loan.item?.title.orEmpty().uppercase(), Modifier.weight(1f), style = loanBody(13).copy(fontFamily = Cargo.Strong), maxLines = 1, overflow = TextOverflow.Ellipsis, color = Cargo.Ink)
            Text(tone.label, Modifier.semantics { this[DashboardPulseAlpha] = alpha.floatValue }.graphicsLayer { this.alpha = alpha.floatValue }
                .background(fill).border(1.dp, border).padding(horizontal = 7.dp, vertical = 3.dp), style = loanMono(8), color = foreground)
        }
        Text("${if (loan.borrower_id == viewer) "FROM ${loan.owner?.full_name.orEmpty()}" else "TO ${loan.borrower?.full_name.orEmpty()}"} · ${loanDateRange(loan.due_date, loan.due_date)}".uppercase(),
            Modifier.padding(top = 8.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
    }
}
