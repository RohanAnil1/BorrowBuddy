package `in`.borrowbuddy.android.graphics

import android.graphics.Canvas
import android.graphics.Paint
import androidx.core.graphics.PathParser
import androidx.core.graphics.withTranslation

/** Generated from packages/shared/src/brand.ts; run export_project_brand.py. */
internal object BorrowBuddyBrand {
    const val LEFT_PATH = "M32 48H96L116 68V104H88V80H64V176H88V152H116V208H64L32 176Z"
    const val RIGHT_PATH = "M224 208H160L140 188V152H168V176H192V80H168V104H140V48H192L224 80Z"
    private val left = requireNotNull(PathParser.createPathFromPathData(LEFT_PATH))
    private val right = requireNotNull(PathParser.createPathFromPathData(RIGHT_PATH))
    fun draw(canvas: Canvas, paint: Paint, x: Float, y: Float, size: Float, leftColor: Int, rightColor: Int) {
        canvas.withTranslation(x, y) {
            scale(size / 256f, size / 256f)
            paint.style = Paint.Style.FILL
            paint.color = leftColor; drawPath(left, paint)
            paint.color = rightColor; drawPath(right, paint)
        }
    }
}
