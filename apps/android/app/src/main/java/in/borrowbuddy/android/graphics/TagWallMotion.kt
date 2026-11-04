package `in`.borrowbuddy.android.graphics

import kotlin.math.roundToInt

/** The website's eight-tag selection, drag snapping and interaction pause contract. */
class TagWallMotion(initial: Int = 3, private val count: Int = 8) {
    var active = initial.coerceIn(0, count - 1); private set
    private var pauseUntil = 0L
    private var lastDrag = Long.MIN_VALUE
    fun select(index: Int, nowMs: Long): Boolean {
        if (lastDrag != Long.MIN_VALUE && nowMs - lastDrag < 300) return false
        active = index.coerceIn(0, count - 1); pauseUntil = nowMs + 6000
        return true
    }
    fun navigate(direction: Int, nowMs: Long) {
        active = (active + direction).coerceIn(0, count - 1); pauseUntil = nowMs + 6000
    }
    fun beginDrag(nowMs: Long) { lastDrag = nowMs; pauseUntil = nowMs + 6000 }
    fun endDrag(offsetPx: Float, spacingPx: Float) {
        require(spacingPx > 0)
        active = (active - offsetPx / spacingPx).roundToInt().coerceIn(0, count - 1)
    }
    fun advance(nowMs: Long): Boolean {
        if (nowMs < pauseUntil) return false
        active = (active + 1) % count
        return true
    }
}
