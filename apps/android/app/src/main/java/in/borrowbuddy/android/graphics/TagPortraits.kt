package `in`.borrowbuddy.android.graphics

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.LruCache
import kotlin.math.*

/** Native port of screen-art.ts paintDotBust, including its Mulberry32 sequence. */
object TagPortraits {
    private val cache = object : LruCache<Int, Bitmap>(4 * 1024 * 1024) {
        override fun sizeOf(key: Int, value: Bitmap) = value.byteCount
    }
    fun portrait(seed: Int): Bitmap = synchronized(cache) { cache[seed] ?: paint(seed).also { cache.put(seed, it) } }
    private fun paint(seed: Int): Bitmap {
        var state = seed * 7919 + 13
        fun random(): Double {
            state += 0x6D2B79F5
            var t = state
            t = (t xor (t ushr 15)) * (t or 1)
            t = t xor (t + (t xor (t ushr 7)) * (t or 61))
            return ((t xor (t ushr 14)).toLong() and 0xffffffffL) / 4294967296.0
        }
        val headW = 54 + random() * 16
        val tilt = (random() - .5) * .16
        val neckW = 22 + random() * 7
        val slope = .42 + random() * .22
        val shoulderLift = 150 + random() * 22
        val bitmap = Bitmap.createBitmap(320, 384, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        canvas.drawColor(Color.rgb(11, 16, 48))
        var y = 40.0
        while (y < 384) {
            var x = 20.0
            while (x < 300) {
                val dx = x - 160; val dy = y - 132
                val rx = dx * cos(tilt) + dy * sin(tilt)
                val ry = -dx * sin(tilt) + dy * cos(tilt)
                val head = rx * rx / (headW * headW) + ry * ry / (78 * 78) <= 1 && y < 202
                val neck = abs(dx) < neckW && y >= 194 && y < shoulderLift + 8
                val t = max(0.0, (y - shoulderLift) / (384 - shoulderLift))
                val shoulders = y >= shoulderLift && y <= 384 && abs(dx) < (30 + t * 118) * (1 - t.pow(slope) * .25)
                if (head || neck || shoulders) {
                    val edge = min(1.0, .35 + random() * .75)
                    paint.color = if (edge > .72) Color.rgb(255, 210, 122) else Color.rgb(203, 132, 14)
                    paint.alpha = ((.5 + random() * .5) * 255).roundToInt()
                    canvas.drawCircle((x + random() - .5).toFloat(), (y + random() - .5).toFloat(), 1.5f, paint)
                }
                x += 4.6
            }
            y += 4.6
        }
        paint.alpha = 255; paint.color = Color.rgb(5, 7, 14)
        canvas.drawCircle((160 - headW * .42).toFloat(), 126f, 5.2f, paint)
        canvas.drawCircle((160 + headW * .42).toFloat(), 126f, 5.2f, paint)
        paint.color = Color.argb(217, 240, 240, 240); paint.strokeWidth = 3f
        for ((cx, cy, sx, sy) in listOf(floatArrayOf(12f, 12f, 1f, 1f), floatArrayOf(308f, 12f, -1f, 1f), floatArrayOf(12f, 372f, 1f, -1f), floatArrayOf(308f, 372f, -1f, -1f))) {
            canvas.drawLine(cx + sx * 22, cy, cx, cy, paint)
            canvas.drawLine(cx, cy, cx, cy + sy * 22, paint)
        }
        return bitmap
    }
}

/** Keep JavaScript's floating point modulo behavior for the existing serial seeds. */
fun tagBarcodeWidths(seed: Long, count: Int): List<Float> {
    var state = (seed.toDouble() * 2654435761.0) % 4294967296.0
    if (state == 0.0) state = 1.0
    return List(count) {
        state = (state * 1103515245.0 + 12345.0) % 2147483648.0
        (1 + state % 4).toFloat()
    }
}
