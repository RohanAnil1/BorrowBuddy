package `in`.borrowbuddy.android.graphics

import kotlin.math.*

/** The website device's boot, damped drag, inertia and idle equations in native units. */
class DeviceMotion {
    var dragging = false
        private set
    private var restY = .16f
    private var restX = -.05f
    private var targetY = restY
    private var targetX = restX
    private var currentY = restY
    private var currentX = restX
    private var velocityY = 0f
    private var glow = .4f
    private var elapsed = 0f

    data class Pose(val x: Float, val y: Float, val rx: Float, val ry: Float, val scale: Float, val glow: Float, val led: Float)
    fun beginDrag() { dragging = true; velocityY = 0f }
    /** Deltas are CSS-pixel equivalent dp units, preserving the web's sensitivity. */
    fun drag(dx: Float, dy: Float) {
        val step = dx * .006f
        restY = (restY + step).coerceIn(-.62f, .62f)
        restX = (restX + dy * .004f).coerceIn(-.3f, .2f)
        velocityY = step
        targetY = restY; targetX = restX
    }
    fun endDrag() { dragging = false }
    fun reset() { restY = .16f; restX = -.05f; targetY = restY; targetX = restX; velocityY = 0f }
    fun frame(deltaSeconds: Float, reduced: Boolean): Pose {
        if (reduced) return Pose(0f, 0f, -.05f, .16f, 1f, 1.15f, 1f)
        val dt = deltaSeconds.coerceIn(0f, .05f)
        // Three.js clamps damping delta, but its clock still follows real elapsed time.
        elapsed += deltaSeconds.coerceAtLeast(0f)
        if (!dragging && abs(velocityY) > .0004f) {
            restY = (restY + velocityY).coerceIn(-.62f, .62f)
            velocityY *= exp(-dt * 3.4f)
        }
        if (!dragging) {
            targetY = restY + sin(elapsed * .55f) * .07f
            targetX = restX + cos(elapsed * .42f) * .028f
        }
        currentY += (targetY - currentY) * min(1f, dt * 5.5f)
        currentX += (targetX - currentX) * min(1f, dt * 5.5f)
        val boot = ((elapsed - 1.35f) / 1.15f).coerceIn(0f, 1f)
        val e = 1f - (1f - boot).pow(3)
        val back = 1f + 2.70158f * (boot - 1f).pow(3) + 1.70158f * (boot - 1f).pow(2)
        val intensity = when {
            elapsed < 1.35f -> .03f
            elapsed < 1.73f -> if (sin((elapsed - 1.35f) * 85f) > 0) 2.1f else .1f
            else -> {
                glow += ((if (dragging) 1.9f else 1.15f) - glow) * min(1f, dt * 4f)
                glow + sin(elapsed * 2.2f) * .06f
            }
        }
        val led = when {
            elapsed < 1.35f -> 0f
            elapsed < 1.85f -> if (sin((elapsed - 1.35f) * 55f) > 0) 1f else .1f
            else -> .85f + sin(elapsed * 3.1f) * .15f
        }
        return Pose(2.7f * (1 - e), 1.5f + (sin(elapsed * .7f) * .05f - 1.5f) * e,
            .42f + (currentX - .42f) * e, .95f + (currentY - .95f) * e,
            .84f + .16f * min(back, 1.12f), intensity, led)
    }
}
