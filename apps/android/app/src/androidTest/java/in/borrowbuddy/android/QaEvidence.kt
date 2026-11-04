package `in`.borrowbuddy.android

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.provider.MediaStore
import java.io.ByteArrayOutputStream
import kotlin.random.Random

/** Synthetic gallery evidence; owns only the exact MediaStore URI it creates. */
class QaEvidence private constructor(val uri: Uri, val bytes: ByteArray) {
    fun remove(context: Context) { context.contentResolver.delete(uri, null, null) }
    companion object {
        fun create(context: Context, name: String, index: Int): QaEvidence {
            val random = Random(770 + index)
            val bitmap = Bitmap.createBitmap(840, 520, Bitmap.Config.ARGB_8888)
            val pixels = IntArray(840 * 520) { Color.rgb(180 + random.nextInt(60), 180 + random.nextInt(60), 180 + random.nextInt(60)) }
            bitmap.setPixels(pixels, 0, 840, 0, 0, 840, 520)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            val canvas = Canvas(bitmap)
            paint.color = Color.WHITE; canvas.drawRect(35f, 35f, 805f, 485f, paint)
            paint.color = if (index == 0) Color.rgb(0, 57, 147) else Color.rgb(203, 132, 14)
            canvas.drawRect(35f, 35f, 805f, 110f, paint)
            paint.color = Color.WHITE; paint.textSize = 38f; canvas.drawText("BORROWBUDDY QA · ${index + 1}", 65f, 85f, paint)
            paint.color = Color.BLACK; paint.textSize = 38f; canvas.drawText("SYNTHETIC INCIDENT EVIDENCE", 65f, 210f, paint)
            paint.textSize = 24f; canvas.drawText("TEST IMAGE · NO REAL INCIDENT", 65f, 280f, paint)
            val bytes = ByteArrayOutputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it); it.toByteArray() }
            bitmap.recycle()
            val resolver = context.contentResolver
            val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, ContentValues().apply {
                put(MediaStore.Images.Media.DISPLAY_NAME, name)
                put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/BorrowBuddyQA")
                put(MediaStore.Images.Media.IS_PENDING, 1)
                put(MediaStore.Images.Media.DATE_TAKEN, System.currentTimeMillis() + index * 1000L)
            }) ?: error("Cannot create isolated gallery evidence")
            try {
                resolver.openOutputStream(uri)!!.use { it.write(bytes) }
                resolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
                return QaEvidence(uri, bytes)
            } catch (failure: Throwable) { resolver.delete(uri, null, null); throw failure }
        }
    }
}
