package `in`.borrowbuddy.android.graphics

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Shader
import android.widget.FrameLayout

/** Source opaque hall background, vignette and alpha mask around the live GPU layer. */
class ConveyorStageLayout(context: Context, val renderer: CargoConveyorView) : FrameLayout(context) {
    private val vignette = Paint(Paint.ANTI_ALIAS_FLAG)
    private val mask = Paint(Paint.ANTI_ALIAS_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
    init { addView(renderer, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)) }
    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w <= 0 || h <= 0) return
        mask.shader = LinearGradient(0f, 0f, 0f, h.toFloat(),
            intArrayOf(Color.TRANSPARENT, Color.BLACK, Color.BLACK, Color.TRANSPARENT),
            floatArrayOf(0f, .08f, .92f, 1f), Shader.TileMode.CLAMP)
        vignette.shader = RadialGradient(0f, 0f, 1f, intArrayOf(Color.TRANSPARENT, Color.argb(158, 0, 0, 0)),
            floatArrayOf(.52f, 1f), Shader.TileMode.CLAMP).apply {
            setLocalMatrix(Matrix().apply { setScale(w * 1.2f, h * .95f); postTranslate(w * .5f, h * .38f) })
        }
    }
    override fun dispatchDraw(canvas: Canvas) {
        val checkpoint = canvas.saveLayer(0f, 0f, width.toFloat(), height.toFloat(), null)
        try {
            canvas.drawColor(Color.rgb(11, 8, 5)) // canvas.tsx: <color attach="background" args={["#0b0805"]} />
            super.dispatchDraw(canvas)
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), vignette)
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), mask)
        } finally { canvas.restoreToCount(checkpoint) }
    }
}
