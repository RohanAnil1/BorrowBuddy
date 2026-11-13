package `in`.borrowbuddy.android

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import android.widget.FrameLayout
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.ExperimentalGlanceApi
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.compose
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.widget.CargoWidget
import `in`.borrowbuddy.android.widget.ParcelWidget
import `in`.borrowbuddy.android.widget.WidgetLoan
import `in`.borrowbuddy.android.widget.WidgetSnapshot
import `in`.borrowbuddy.android.widget.WidgetState
import `in`.borrowbuddy.android.widget.WidgetStore
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.time.LocalDate
import java.time.ZoneId

/**
 * Renders both home-screen widgets off-screen, at the picker's sizes and in
 * every Parcel mood, and saves PNGs to the app's external files
 * (`files/widget-renders`) for review. Sample data only; the cached widget
 * snapshot is restored afterwards.
 */
@OptIn(ExperimentalGlanceApi::class)
@RunWith(AndroidJUnit4::class)
class WidgetRenderTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val store = WidgetStore(context)
    private lateinit var saved: WidgetSnapshot
    private val out = File(context.getExternalFilesDir(null), "widget-renders").apply { deleteRecursively(); mkdirs() }

    private val today = LocalDate.now(ZoneId.of("Asia/Kolkata"))
    private fun loan(days: Long, lending: Boolean = false, status: String = "active") = WidgetLoan(
        "7f3a21c4-0000-4000-8000-000000000000", "Canon EOS 1500D", today.plusDays(days).toString(), status, lending, "PRIYA S.")
    private fun ready(loan: WidgetLoan? = null, requests: Int = 0, chats: Int = 0, fines: Int = 0, offline: Boolean = false) =
        WidgetSnapshot(WidgetState.Ready, "Asha", loan, openLoans = 2, pendingRequests = requests, unreadChats = chats,
            pendingFines = if (fines > 0) 1 else 0, finesOwed = fines,
            syncedAt = System.currentTimeMillis() - if (offline) 3 * 3_600_000L else 60_000L, offline = offline)

    private val scenarios = linkedMapOf(
        "signed-out" to WidgetSnapshot(syncedAt = System.currentTimeMillis()),
        "unverified" to WidgetSnapshot(WidgetState.Unverified, "Asha", syncedAt = System.currentTimeMillis()),
        "overdue" to ready(loan(-1, status = "overdue"), chats = 1),
        "due-soon" to ready(loan(1), requests = 2, chats = 1),
        "fine" to ready(loan(6), fines = 150),
        "news" to ready(loan(6), requests = 2, chats = 1),
        "on-track" to ready(loan(6)),
        "all-clear" to ready(),
        "offline" to ready(loan(2, lending = true), chats = 3, offline = true),
    )

    @Before fun keep() { saved = store.read() }
    @After fun restore() { store.write(saved) }

    @Test fun rendersParcelInEveryMood() {
        scenarios.forEach { (name, snapshot) ->
            render(ParcelWidget(), snapshot, DpSize(170.dp, 170.dp), "parcel-2x2-$name")
            render(ParcelWidget(), snapshot, DpSize(340.dp, 170.dp), "parcel-4x2-$name")
        }
    }

    @Test fun rendersBoardingPasses() {
        listOf("signed-out", "overdue", "due-soon", "all-clear", "offline").forEach { name ->
            val snapshot = scenarios.getValue(name)
            render(CargoWidget(), snapshot, DpSize(340.dp, 170.dp), "pass-4x2-$name")
            render(CargoWidget(), snapshot, DpSize(340.dp, 250.dp), "pass-4x3-$name")
            render(CargoWidget(), snapshot, DpSize(170.dp, 170.dp), "pass-2x2-$name")
        }
    }

    private fun render(widget: GlanceAppWidget, snapshot: WidgetSnapshot, size: DpSize, name: String) {
        store.write(snapshot)
        val views = runBlocking { widget.compose(context, size = size) }
        val density = context.resources.displayMetrics.density
        val width = (size.width.value * density).toInt()
        val height = (size.height.value * density).toInt()
        var bitmap: Bitmap? = null
        instrumentation.runOnMainSync {
            val host = FrameLayout(context)
            val view = views.apply(context, host)
            host.addView(view, FrameLayout.LayoutParams(width, height))
            host.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
            host.layout(0, 0, width, height)
            bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { host.draw(Canvas(it)) }
        }
        val file = File(out, "$name.png")
        file.outputStream().use { bitmap!!.compress(Bitmap.CompressFormat.PNG, 100, it) }
        assertTrue("$name rendered", file.length() > 0)
    }
}
