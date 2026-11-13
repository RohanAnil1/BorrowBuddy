package `in`.borrowbuddy.android.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import androidx.core.content.res.ResourcesCompat
import kotlin.math.ceil

/** Typesets widget text in the brand fonts (see [CargoText]). */
internal object TextArt {
    /** A vertical run of [count] round dots, [gap]px apart: the pass's tear line. */
    fun dots(diameterPx: Int, gapPx: Int, count: Int): Bitmap {
        val bitmap = Bitmap.createBitmap(diameterPx, count * diameterPx + (count - 1) * gapPx, Bitmap.Config.ALPHA_8)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val radius = diameterPx / 2f
        repeat(count) { canvas.drawCircle(radius, radius + it * (diameterPx + gapPx).toFloat(), radius, paint) }
        return bitmap
    }

    fun render(context: Context, text: String, face: Face, sp: Float, lanePx: Int, lines: Int, gravity: Int, spacing: Float): Bitmap {
        val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = ResourcesCompat.getFont(context, face.font)
            textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, context.resources.displayMetrics)
            letterSpacing = spacing
            color = Color.BLACK
        }
        val horizontal = gravity and Gravity.HORIZONTAL_GRAVITY_MASK
        val natural = ceil(Layout.getDesiredWidth(text, paint)).toInt() + 1
        // The bitmap hugs the text (the Box around it does the aligning). Size buckets understate the
        // real slot, so a single line may run past the lane and is scaled to fit on screen; only well
        // beyond it is it ellipsized. Wrapped text breaks at the lane.
        val width = minOf(natural, if (lines <= 1) lanePx * 17 / 10 else lanePx).coerceAtLeast(1)
        val align = when (horizontal) {
            Gravity.CENTER_HORIZONTAL -> Layout.Alignment.ALIGN_CENTER
            Gravity.END -> Layout.Alignment.ALIGN_OPPOSITE
            else -> Layout.Alignment.ALIGN_NORMAL
        }
        val layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
            .setAlignment(align).setMaxLines(lines.coerceAtLeast(1)).setEllipsize(TextUtils.TruncateAt.END)
            .setIncludePad(false).build()
        val bitmap = Bitmap.createBitmap(width, layout.height.coerceAtLeast(1), Bitmap.Config.ALPHA_8)
        layout.draw(Canvas(bitmap))
        return bitmap
    }
}
