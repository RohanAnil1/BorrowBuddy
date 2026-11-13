package `in`.borrowbuddy.android.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.Gravity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.ActionParameters
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Column
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.RowScope
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.unit.ColorProvider
import `in`.borrowbuddy.android.MainActivity
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.domain.Rules
import java.time.ZonedDateTime

/**
 * "Boarding pass" home-screen widget in the Campus Cargo style: the next loan
 * due back with its countdown, pending requests, unread chats and fines, plus
 * shortcuts into the app. It renders the cached [WidgetSnapshot]; the network
 * is only touched by [WidgetSyncWorker].
 */
class CargoWidget : GlanceAppWidget() {
    /**
     * Responsive, not Exact: some launchers (ColorOS) report a landscape size
     * and draw that layout in portrait. The host picks the largest bucket that
     * fits, so LocalSize never overstates the space and text lanes stay safe.
     */
    override val sizeMode = SizeMode.Responsive(BUCKETS)

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val store = WidgetStore(context)
        provideContent {
            val view by remember(store) { store.changes() }.collectAsState(store.view())
            WidgetFrame(view.snapshot, view.renderedAt)
        }
    }

    companion object {
        val SMALL = DpSize(110.dp, 110.dp)
        val WIDE = DpSize(230.dp, 110.dp)
        val LARGE = DpSize(230.dp, 180.dp)
        private val BUCKETS = setOf(SMALL, DpSize(110.dp, 160.dp), DpSize(150.dp, 160.dp),
            WIDE, DpSize(270.dp, 110.dp), DpSize(230.dp, 140.dp), DpSize(270.dp, 140.dp), LARGE, DpSize(270.dp, 180.dp))
    }
}

open class CargoWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CargoWidget()

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        // Placed, restored after a reboot, or the app was updated.
        WidgetSync.schedule(context)
        WidgetSync.refreshNow(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        if (placedWidgets(context) == 0) WidgetSync.cancel(context)
    }

    companion object {
        fun placedWidgets(context: Context): Int {
            val manager = AppWidgetManager.getInstance(context)
            return listOf(CargoWidgetReceiver::class.java, CargoWidgetSmallReceiver::class.java, ParcelWidgetReceiver::class.java)
                .sumOf { manager.getAppWidgetIds(ComponentName(context, it)).size }
        }
    }
}

/** Same widget, listed separately in the picker so the 2x2 pass is one drag away. */
class CargoWidgetSmallReceiver : CargoWidgetReceiver()

class RefreshWidgetAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        WidgetSync.refreshNow(context)
    }
}

internal object Palette {
    val Canvas = Color(0xff003993)
    val Panel = Color.Black
    val Tile = Color(0xff161a24)
    val Ink = Color.White
    val Dim = Color(0xb3ffffff)
    val Faint = Color(0x80ffffff)
    val Accent = Color(0xffcb840e)
    val Warn = Color(0xffff9f00)
    val Ok = Color(0xff47d18a)
    val Late = Color(0xffff5a4a)
    fun tone(tone: DueTone) = when (tone) { DueTone.Calm -> Ok; DueTone.Soon -> Warn; DueTone.Late -> Late }
}

internal enum class Face(val font: Int) {
    Title(R.font.noto_condensed), Mono(R.font.noto_mono), Ticket(R.font.thermo), Body(R.font.gotham_medium),
}

/**
 * How wide text may run in the current section of the widget. Containers set
 * it from the widget's exact size so long titles ellipsize instead of spilling.
 */
internal val LocalLane = compositionLocalOf { 200.dp }

/**
 * Text in the app's own fonts. Launchers inflate widget views in a restricted
 * context where TextView refuses app fonts, so the text is typeset here and
 * shipped as an alpha-only bitmap, tinted to [color]. [text] doubles as the
 * image's content description.
 */
@Composable
internal fun CargoText(text: String, face: Face, sp: Float, color: Color, modifier: GlanceModifier = GlanceModifier,
    lines: Int = 1, gravity: Int = Gravity.START, spacing: Float = 0f) {
    if (text.isEmpty()) return
    val context = LocalContext.current
    val metrics = context.resources.displayMetrics
    val lane = (LocalLane.current.value * metrics.density).toInt().coerceAtLeast(1)
    val art = remember(text, face, sp, lines, gravity, spacing, lane) { TextArt.render(context, text, face, sp, lane, lines, gravity, spacing) }
    val alignment = when (gravity and Gravity.HORIZONTAL_GRAVITY_MASK) {
        Gravity.CENTER_HORIZONTAL -> Alignment.Center
        Gravity.END, Gravity.RIGHT -> Alignment.CenterEnd
        else -> Alignment.CenterStart
    }
    Box(modifier, contentAlignment = alignment) {
        // Wrap-content: drawn 1:1, and if a slot is ever narrower it scales down instead of clipping.
        Image(ImageProvider(art), text, contentScale = ContentScale.Fit, colorFilter = ColorFilter.tint(ColorProvider(color)))
    }
}

internal fun open(context: Context, route: String?): Action = actionStartActivity(
    Intent(context, MainActivity::class.java)
        .apply { route?.let { putExtra(WidgetRoutes.EXTRA, it) } }
        // Reuse the running app and deliver the route through onNewIntent.
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
)

@Composable
private fun WidgetFrame(snapshot: WidgetSnapshot, renderedAt: Long) {
    val size = LocalSize.current
    val now = ZonedDateTime.now(Rules.campusZone)
    val freshness = WidgetFormat.freshness(snapshot.syncedAt, snapshot.offline, maxOf(renderedAt, System.currentTimeMillis()))
    Box(GlanceModifier.fillMaxSize().appWidgetBackground().background(Palette.Canvas)
        .cornerRadius(android.R.dimen.system_app_widget_background_radius).padding(6.dp)) {
        if (size.width < CargoWidget.WIDE.width) SmallPass(snapshot, now, freshness)
        else WidePass(snapshot, now, freshness, tall = size.height >= CargoWidget.LARGE.height)
    }
}

// ---------------------------------------------------------------- wide 4x2 / 4x3

@Composable
private fun WidePass(snapshot: WidgetSnapshot, now: ZonedDateTime, freshness: String, tall: Boolean) {
    val context = LocalContext.current
    val loan = snapshot.loan.takeIf { snapshot.state == WidgetState.Ready }
    val countdown = loan?.let { WidgetFormat.countdown(it, now) }
    val primary = open(context, loan?.let { WidgetRoutes.loan(it.id) } ?: if (snapshot.state == WidgetState.Ready) WidgetRoutes.DASHBOARD else null)
    val height = LocalSize.current.height
    val titleLines = if (tall) 2 else 1
    val stubWidth = if (tall) 104.dp else 86.dp
    val bodyLane = LocalSize.current.width - 12.dp - 12.dp - stubWidth - 20.dp
    Row(GlanceModifier.fillMaxSize()) {
        Column(GlanceModifier.defaultWeight().fillMaxHeight().background(ImageProvider(R.drawable.widget_ticket_start))
            .padding(start = 12.dp, end = 8.dp, top = 9.dp, bottom = 9.dp).clickable(primary)
            .semantics { contentDescription = describe(snapshot, countdown) }) {
            CompositionLocalProvider(LocalLane provides bodyLane) { when {
                snapshot.state == WidgetState.SignedOut -> Prompt("[ BOARDING CLOSED ]", "SIGN IN TO BOARD",
                    "Your next return, requests and chats will land here.", freshness, tall)
                snapshot.state == WidgetState.Unverified -> Prompt("[ VERIFICATION PENDING ]",
                    "ALMOST THERE${snapshot.firstName.takeIf { it.isNotBlank() }?.let { ", $it" }.orEmpty()}",
                    "Finish your student ID check in the app to start borrowing.", freshness, tall)
                loan == null || countdown == null -> {
                    Header("[ NO LOANS DUE ]", Palette.Accent)
                    Spacer(GlanceModifier.height(3.dp))
                    CargoText(if (snapshot.firstName.isBlank()) "ALL CLEAR" else "ALL CLEAR, ${snapshot.firstName}", Face.Title, if (tall) 26f else 19f, Palette.Ink, lines = titleLines)
                    CargoText("NOTHING TO RETURN OR COLLECT", Face.Mono, 9f, Palette.Dim)
                    Spacer(GlanceModifier.defaultWeight())
                    Tallies(snapshot, tall)
                }
                else -> {
                    Header(WidgetFormat.role(loan), Palette.Accent)
                    Spacer(GlanceModifier.height(3.dp))
                    CargoText(loan.title.uppercase(), Face.Title, if (tall) 26f else 19f, Palette.Ink, lines = titleLines)
                    CargoText(WidgetFormat.route(loan) + if (tall) "" else " · ${WidgetFormat.code(loan.id)}", Face.Mono, 9f, Palette.Dim)
                    if (tall) {
                        Spacer(GlanceModifier.height(6.dp))
                        CargoText(countdown.bracket, Face.Mono, 10f, Palette.tone(countdown.tone))
                        CargoText("${Rules.loanLabels[loan.status] ?: loan.status} · ${WidgetFormat.code(loan.id)}".uppercase(), Face.Mono, 9f, Palette.Faint)
                    }
                    Spacer(GlanceModifier.defaultWeight())
                    Tallies(snapshot, tall)
                }
            } }
        }
        Perforation(height)
        Column(GlanceModifier.width(stubWidth).fillMaxHeight().background(ImageProvider(R.drawable.widget_ticket_end))
            .padding(start = 6.dp, end = 10.dp, top = 9.dp, bottom = 9.dp), horizontalAlignment = Alignment.CenterHorizontally) {
          CompositionLocalProvider(LocalLane provides stubWidth - 16.dp) {
            if (loan != null && countdown != null) {
                Column(GlanceModifier.fillMaxWidth().defaultWeight().clickable(primary), horizontalAlignment = Alignment.CenterHorizontally) {
                    CargoText("DUE ${WidgetFormat.stamp(loan.dueDate)}", Face.Mono, 8f, Palette.Faint, GlanceModifier.fillMaxWidth(), gravity = Gravity.CENTER)
                    CargoText(countdown.figure, Face.Ticket, if (tall) 50f else 38f, Palette.tone(countdown.tone), GlanceModifier.fillMaxWidth(), gravity = Gravity.CENTER)
                    CargoText(countdown.unit, Face.Mono, 8f, Palette.tone(countdown.tone), GlanceModifier.fillMaxWidth(), gravity = Gravity.CENTER)
                }
            } else {
                Column(GlanceModifier.fillMaxWidth().defaultWeight().clickable(primary), horizontalAlignment = Alignment.CenterHorizontally,
                    verticalAlignment = Alignment.CenterVertically) {
                    Image(ImageProvider(R.drawable.widget_logo), null, GlanceModifier.size(if (tall) 40.dp else 30.dp, if (tall) 33.dp else 25.dp))
                    Spacer(GlanceModifier.height(5.dp))
                    CargoText("BORROWBUDDY", Face.Mono, 7f, Palette.Faint, GlanceModifier.fillMaxWidth(), gravity = Gravity.CENTER)
                }
            }
            if (snapshot.state == WidgetState.Ready) {
                CargoText(freshness, Face.Mono, 6.5f, Palette.Faint, GlanceModifier.fillMaxWidth()
                    .clickable(actionRunCallback<RefreshWidgetAction>()), gravity = Gravity.CENTER)
            }
            Spacer(GlanceModifier.height(4.dp))
            when (snapshot.state) {
                WidgetState.Ready -> Pill("BROWSE →", open(context, WidgetRoutes.BROWSE))
                WidgetState.Unverified -> Pill("OPEN APP →", open(context, null))
                WidgetState.SignedOut -> Pill("SIGN IN →", open(context, null))
            }
          }
        }
    }
}

@Composable
private fun Header(label: String, color: Color, freshness: String = "") {
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        val lane = LocalLane.current
        CompositionLocalProvider(LocalLane provides if (freshness.isEmpty()) lane else lane * .55f) {
            CargoText(label, Face.Mono, 9f, color, GlanceModifier.defaultWeight(), spacing = .04f)
        }
        if (freshness.isNotEmpty()) {
            CargoText(freshness, Face.Mono, 7f, Palette.Faint, GlanceModifier.clickable(actionRunCallback<RefreshWidgetAction>()), gravity = Gravity.END)
        }
    }
}

@Composable
private fun ColumnScope.Prompt(label: String, title: String, body: String, freshness: String, tall: Boolean) {
    Header(label, Palette.Warn, freshness.takeIf { it.startsWith("OFFLINE") }.orEmpty())
    Spacer(GlanceModifier.height(3.dp))
    CargoText(title, Face.Title, if (tall) 26f else 19f, Palette.Ink, lines = 2)
    Spacer(GlanceModifier.height(2.dp))
    CargoText(body, Face.Body, 10f, Palette.Dim, lines = if (tall) 3 else 2)
    Spacer(GlanceModifier.defaultWeight())
}

/** Requests, chats and fines as departure-board tiles; each opens its screen. */
@Composable
private fun Tallies(snapshot: WidgetSnapshot, tall: Boolean) {
    val context = LocalContext.current
    val tileLane = (LocalLane.current - 8.dp) / 3 - 12.dp
    Row(GlanceModifier.fillMaxWidth()) { CompositionLocalProvider(LocalLane provides tileLane) {
        Tally(if (tall) "REQUESTS" else "REQS", WidgetFormat.tally(snapshot.pendingRequests), snapshot.pendingRequests > 0,
            open(context, WidgetRoutes.REQUESTS), tall)
        Spacer(GlanceModifier.width(4.dp))
        Tally(if (tall) "UNREAD" else "CHATS", WidgetFormat.tally(snapshot.unreadChats), snapshot.unreadChats > 0,
            open(context, WidgetRoutes.CHATS), tall)
        Spacer(GlanceModifier.width(4.dp))
        Tally("FINES", if (snapshot.finesOwed > 0) WidgetFormat.compactRupees(snapshot.finesOwed) else "00", snapshot.finesOwed > 0,
            open(context, WidgetRoutes.FINES), tall)
    } }
}

@Composable
private fun RowScope.Tally(label: String, value: String, hot: Boolean, action: Action, tall: Boolean) {
    Column(GlanceModifier.defaultWeight().background(Palette.Tile).cornerRadius(6.dp)
        .padding(horizontal = 6.dp, vertical = if (tall) 5.dp else 3.dp).clickable(action)) {
        CargoText(label, Face.Mono, 7f, Palette.Faint)
        CargoText(value, Face.Title, if (tall) 17f else 14f, if (hot) Palette.Warn else Palette.Dim)
    }
}

@Composable
private fun Pill(label: String, action: Action) {
    Box(GlanceModifier.fillMaxWidth().height(24.dp).background(Palette.Accent).cornerRadius(6.dp).clickable(action),
        contentAlignment = Alignment.Center) {
        CargoText(label, Face.Mono, 9f, Palette.Panel, GlanceModifier.fillMaxWidth(), gravity = Gravity.CENTER)
    }
}

/** The tear line between body and stub: canvas-blue bites top and bottom, dots between. */
@Composable
private fun Perforation(height: Dp) {
    val dots = ((height.value - 40f) / 8f).toInt().coerceIn(3, 18)
    Column(GlanceModifier.width(12.dp).fillMaxHeight().background(Palette.Panel), horizontalAlignment = Alignment.CenterHorizontally) {
        Image(ImageProvider(R.drawable.widget_notch_top), null, GlanceModifier.size(12.dp, 6.dp))
        // One bitmap, not a Column of dots: Glance caps a Column at ten children.
        val context = LocalContext.current
        val density = context.resources.displayMetrics.density
        val art = remember(dots, density) { TextArt.dots((3 * density).toInt(), (5 * density).toInt(), dots) }
        Box(GlanceModifier.defaultWeight().fillMaxWidth(), contentAlignment = Alignment.Center) {
            Image(ImageProvider(art), null, colorFilter = ColorFilter.tint(ColorProvider(Color(0xff4a4a4a))))
        }
        Image(ImageProvider(R.drawable.widget_notch_bottom), null, GlanceModifier.size(12.dp, 6.dp))
    }
}

// ---------------------------------------------------------------- small 2x2

@Composable
private fun SmallPass(snapshot: WidgetSnapshot, now: ZonedDateTime, freshness: String) {
    val context = LocalContext.current
    val loan = snapshot.loan.takeIf { snapshot.state == WidgetState.Ready }
    val countdown = loan?.let { WidgetFormat.countdown(it, now) }
    val target = loan?.let { WidgetRoutes.loan(it.id) } ?: if (snapshot.state == WidgetState.Ready) WidgetRoutes.DASHBOARD else null
    Column(GlanceModifier.fillMaxSize().background(ImageProvider(R.drawable.widget_ticket)).padding(horizontal = 10.dp, vertical = 9.dp)
        .clickable(open(context, target)).semantics { contentDescription = describe(snapshot, countdown) }) {
      CompositionLocalProvider(LocalLane provides LocalSize.current.width - 32.dp) {
        Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            val label = when {
                snapshot.state == WidgetState.SignedOut -> "[ SIGNED OUT ]"
                snapshot.state == WidgetState.Unverified -> "[ PENDING ]"
                loan == null -> "[ ALL CLEAR ]"
                else -> WidgetFormat.role(loan)
            }
            CargoText(label, Face.Mono, 8f, if (snapshot.state == WidgetState.Ready) Palette.Accent else Palette.Warn, GlanceModifier.defaultWeight())
            Image(ImageProvider(R.drawable.widget_logo), null, GlanceModifier.size(14.dp, 12.dp))
        }
        Spacer(GlanceModifier.height(4.dp))
        when {
            snapshot.state != WidgetState.Ready -> {
                CargoText(if (snapshot.state == WidgetState.SignedOut) "SIGN IN TO BOARD" else "FINISH SIGN-UP", Face.Title, 19f, Palette.Ink, lines = 2)
                Spacer(GlanceModifier.defaultWeight())
                Pill(if (snapshot.state == WidgetState.SignedOut) "SIGN IN →" else "OPEN APP →", open(context, null))
            }
            loan == null || countdown == null -> {
                CargoText("NOTHING DUE", Face.Title, 19f, Palette.Ink, lines = 2)
                CargoText(freshness, Face.Mono, 7f, Palette.Faint, GlanceModifier.clickable(actionRunCallback<RefreshWidgetAction>()))
                Spacer(GlanceModifier.defaultWeight())
                SmallFooter(snapshot)
            }
            else -> {
                Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    CargoText(countdown.figure, Face.Ticket, 34f, Palette.tone(countdown.tone))
                    Spacer(GlanceModifier.width(5.dp))
                    Column {
                        countdown.unit.split(' ').forEach { CargoText(it, Face.Mono, 8f, Palette.tone(countdown.tone)) }
                    }
                }
                CargoText(loan.title.uppercase(), Face.Title, 13f, Palette.Ink, lines = 1)
                Spacer(GlanceModifier.defaultWeight())
                SmallFooter(snapshot)
            }
        }
      }
    }
}

@Composable
private fun SmallFooter(snapshot: WidgetSnapshot) {
    val context = LocalContext.current
    Image(ImageProvider(R.drawable.widget_dash), null, GlanceModifier.fillMaxWidth().height(2.dp))
    Spacer(GlanceModifier.height(5.dp))
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        CompositionLocalProvider(LocalLane provides LocalLane.current - 30.dp) {
        CargoText(WidgetFormat.smallTally(snapshot), Face.Mono, 8f, if (snapshot.pendingRequests + snapshot.unreadChats + snapshot.pendingFines > 0) Palette.Warn else Palette.Dim,
            GlanceModifier.defaultWeight())
        }
        Box(GlanceModifier.size(24.dp).background(Palette.Accent).cornerRadius(12.dp).clickable(open(context, WidgetRoutes.BROWSE))
            .semantics { contentDescription = "Browse items" }, contentAlignment = Alignment.Center) {
            Image(ImageProvider(R.drawable.ic_search), null, GlanceModifier.size(13.dp), colorFilter = ColorFilter.tint(ColorProvider(Palette.Panel)))
        }
    }
}

private fun describe(snapshot: WidgetSnapshot, countdown: DueCountdown?): String = when (snapshot.state) {
    WidgetState.SignedOut -> "BorrowBuddy. Signed out. Open the app to sign in."
    WidgetState.Unverified -> "BorrowBuddy. Verification pending. Open the app to finish signing up."
    WidgetState.Ready -> buildString {
        val loan = snapshot.loan
        if (loan != null && countdown != null) append("${if (loan.lending) "Lending" else "Borrowing"} ${loan.title}, ${countdown.bracket.trim('[', ']', ' ').lowercase()}. ")
        else append("No loans due. ")
        append("${snapshot.pendingRequests} pending requests, ${snapshot.unreadChats} unread chats, ")
        append(if (snapshot.finesOwed > 0) "${WidgetFormat.rupees(snapshot.finesOwed)} in fines." else "no fines.")
    }
}
