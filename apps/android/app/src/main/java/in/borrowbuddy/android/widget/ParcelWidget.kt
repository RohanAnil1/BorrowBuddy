package `in`.borrowbuddy.android.widget

import android.content.Context
import android.graphics.Bitmap
import android.view.Gravity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
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
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.data.BuddyMood
import `in`.borrowbuddy.android.domain.Rules
import `in`.borrowbuddy.android.ui.drawParcelStill
import java.time.ZonedDateTime

/**
 * "Parcel" home-screen widget: the BorrowBuddy mascot standing on the campus
 * canvas with a speech bubble. Parcel's face follows your loans (asleep when
 * signed out, worried when something is overdue, waving when a return is
 * close, bursting with brackets when there's news, no-signal eyes offline);
 * the bubble says why. It reads the same cached [WidgetSnapshot] as the
 * boarding passes, so one [WidgetSyncWorker] keeps all of them fresh.
 */
class ParcelWidget : GlanceAppWidget() {
    // Responsive for the same reason as CargoWidget. Buckets understate the real slot a little,
    // hence the 1.15 on text lanes below.
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(110.dp, 110.dp), DpSize(110.dp, 150.dp), DpSize(150.dp, 150.dp),
        WIDE, DpSize(270.dp, 110.dp), DpSize(230.dp, 140.dp), DpSize(270.dp, 140.dp)))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val store = WidgetStore(context)
        provideContent {
            val view by remember(store) { store.changes() }.collectAsState(store.view())
            ParcelFrame(view.snapshot, view.renderedAt)
        }
    }

    companion object {
        /** At this width and up, Parcel stands beside the bubble instead of under it. */
        val WIDE = DpSize(230.dp, 110.dp)
    }
}

/** Listed as "Parcel" in the picker; scheduling and clean-up are shared with the passes. */
class ParcelWidgetReceiver : CargoWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ParcelWidget()
}

/** Parcel drawn into a square bitmap (Glance can't run Compose canvases). */
internal fun parcelBitmap(mood: BuddyMood, px: Int): Bitmap {
    val bitmap = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
    CanvasDrawScope().draw(Density(1f), LayoutDirection.Ltr, Canvas(bitmap.asImageBitmap()), Size(px.toFloat(), px.toFloat())) {
        drawParcelStill(mood)
    }
    return bitmap
}

@Composable
private fun ParcelFrame(snapshot: WidgetSnapshot, renderedAt: Long) {
    val context = LocalContext.current
    val size = LocalSize.current
    val cue = ParcelCues.cue(snapshot, ZonedDateTime.now(Rules.campusZone))
    val freshness = WidgetFormat.freshness(snapshot.syncedAt, snapshot.offline, maxOf(renderedAt, System.currentTimeMillis()))
    val wide = size.width >= ParcelWidget.WIDE.width
    Box(GlanceModifier.fillMaxSize().appWidgetBackground().background(Palette.Canvas)
        .cornerRadius(android.R.dimen.system_app_widget_background_radius).padding(8.dp)
        .clickable(open(context, cue.route))
        .semantics { contentDescription = "Parcel says: ${cue.headline.lowercase()}. ${cue.detail}" }) {
        if (wide) {
            val parcel = minOf(size.height - 16.dp, size.width * .4f)
            Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                Parcel(cue.mood, parcel, GlanceModifier.width(parcel).fillMaxHeight())
                Image(ImageProvider(R.drawable.widget_bubble_tail_start), null, GlanceModifier.size(7.dp, 14.dp))
                CompositionLocalProvider(LocalLane provides size.width * 1.15f - 16.dp - parcel - 7.dp - 22.dp) {
                    Bubble(cue, freshness, GlanceModifier.defaultWeight().fillMaxHeight(), compact = false)
                }
            }
        } else {
            Column(GlanceModifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                CompositionLocalProvider(LocalLane provides size.width * 1.15f - 16.dp - 18.dp) {
                    Bubble(cue, freshness, GlanceModifier.fillMaxWidth(), compact = true)
                }
                Image(ImageProvider(R.drawable.widget_bubble_tail_down), null, GlanceModifier.size(14.dp, 7.dp))
                // Launchers under-report height, so Parcel takes whatever is left and scales to fit.
                Parcel(cue.mood, minOf(size.width - 16.dp, 160.dp), GlanceModifier.fillMaxWidth().defaultWeight())
            }
        }
    }
}

@Composable
private fun Parcel(mood: BuddyMood, render: Dp, modifier: GlanceModifier) {
    val context = LocalContext.current
    val px = (render.value * context.resources.displayMetrics.density).toInt().coerceIn(48, 480)
    val bitmap = remember(mood, px) { parcelBitmap(mood, px) }
    Image(ImageProvider(bitmap), null, modifier, contentScale = ContentScale.Fit)
}

/** Parcel's speech bubble: bracket label, a line in Parcel's voice, then the detail. */
@Composable
private fun Bubble(cue: ParcelCue, freshness: String, modifier: GlanceModifier, compact: Boolean) {
    val toneColor = Palette.tone(cue.tone)
    Column(modifier.background(Palette.Panel).cornerRadius(12.dp)
        .padding(horizontal = if (compact) 9.dp else 11.dp, vertical = if (compact) 6.dp else 9.dp),
        verticalAlignment = if (compact) Alignment.Top else Alignment.CenterVertically) {
        if (compact) {
            CargoText(cue.label, Face.Mono, 7.5f, toneColor)
            Spacer(GlanceModifier.height(2.dp))
            CargoText(cue.headline, Face.Title, 15f, Palette.Ink, lines = 2)
        } else {
            CargoText(cue.label, Face.Mono, 8.5f, toneColor)
            Spacer(GlanceModifier.height(3.dp))
            CargoText(cue.headline, Face.Title, 20f, Palette.Ink, lines = 2)
            Spacer(GlanceModifier.height(2.dp))
            CargoText(cue.detail.uppercase(), Face.Mono, 8.5f, Palette.Dim, lines = 2)
            Spacer(GlanceModifier.height(5.dp))
            Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Image(ImageProvider(R.drawable.widget_logo), null, GlanceModifier.size(12.dp, 10.dp))
                Spacer(GlanceModifier.width(5.dp))
                CargoText(freshness, Face.Mono, 7f, Palette.Faint, GlanceModifier.defaultWeight()
                    .clickable(actionRunCallback<RefreshWidgetAction>()), gravity = Gravity.START)
            }
        }
    }
}
