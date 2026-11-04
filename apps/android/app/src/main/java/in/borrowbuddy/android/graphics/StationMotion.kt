package `in`.borrowbuddy.android.graphics

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin

/** Source station.tsx animation equations, with mutable buffers to avoid per-frame allocations. */
class StationMotion(private val index: Int) {
    class Frame {
        val ledRgb = FloatArray(36)
        val lampRgb = FloatArray(9)
        val curtainZ = FloatArray(8)
        val sonarScale = FloatArray(3) { 1f }
        val sonarAlpha = FloatArray(3)
        val strobeAlpha = FloatArray(2) { 1f }
        var ringBrightness = 1f
        var lensAlpha = .3f
        var haloAlpha = .12f
        var poolAlpha = .16f
        var beamAlpha = 0f
        var beamSpotAlpha = 0f
        var beamSpotY = 2.9f
        var recoilY = 0f
        var spotPower = 1.2f
    }
    private val frame = Frame()
    private var lastPhase: ConveyorMotion.Phase? = null
    private var phaseStart = 0.0

    init { initial() }
    private fun initial() {
        repeat(12) { color(frame.ledRgb, it, OFF, 1.0) }
        repeat(3) { color(frame.lampRgb, it, HOT, 1.0) }
    }
    fun frame(timeSeconds: Double, deltaSeconds: Double, phase: ConveyorMotion.Phase, reduced: Boolean): Frame {
        require(timeSeconds.isFinite() && timeSeconds >= 0 && deltaSeconds.isFinite())
        if (reduced) return frame
        val delta = deltaSeconds.coerceIn(0.0, .05)
        if (phase != lastPhase) { phaseStart = timeSeconds; lastPhase = phase }
        val age = timeSeconds - phaseStart
        val scan = phase == ConveyorMotion.Phase.SCAN
        val awake = scan || phase == ConveyorMotion.Phase.WAKE
        val lit = scan || phase == ConveyorMotion.Phase.STILL
        repeat(12) { i ->
            when (phase) {
                ConveyorMotion.Phase.WAKE, ConveyorMotion.Phase.SCAN -> {
                    val head = (timeSeconds * (if (scan) 9.0 else 3.4)) % 12
                    val distance = abs(((i - head + 18) % 12) - 6)
                    color(frame.ledRgb, i, HOT, clamp(1 - distance / (if (scan) 2.2 else 3.0)) + (if (scan) .35 else .12))
                }
                ConveyorMotion.Phase.AFTER -> if (age < .85) color(frame.ledRgb, i, if (i / 12.0 <= age / .85) GREEN else OFF, 1.0)
                    else color(frame.ledRgb, i, GREEN, .55 * (.8 + sin(timeSeconds * 1.1 + i * .4) * .2))
                else -> color(frame.ledRgb, i, GREEN, .55 * (.7 + sin(timeSeconds * 1.1 + i * .34) * .3))
            }
        }
        val pulse = .5 + .5 * sin(timeSeconds * 2.2 + index)
        frame.ringBrightness = (if (scan) 1.9 + sin(timeSeconds * 34) * .18 else if (awake) 1.1 + pulse * .35 else .42 + pulse * .12).toFloat()
        frame.lensAlpha = if (scan) .95f else if (awake) .6f else .3f
        frame.haloAlpha = if (scan) (.5 + sin(timeSeconds * 28) * .08).toFloat() else if (awake) .3f else .1f
        repeat(3) { i ->
            val chase = .5 + .5 * sin(timeSeconds * (if (scan) 10.0 else 2.4) - i * 1.1)
            color(frame.lampRgb, i, if (awake || lit) HOT else OFF, if (awake) .5 + chase * .9 else .35)
        }
        repeat(8) { i ->
            frame.curtainZ[i] = when (phase) {
                ConveyorMotion.Phase.SCAN -> (sin(clamp((age - i * .045) / .55) * Math.PI) * -.18).toFloat()
                ConveyorMotion.Phase.WAKE -> (sin(timeSeconds * 3 + i * 1.3) * .045).toFloat()
                else -> {
                    val target = sin(timeSeconds * .6 + i * .7) * .016
                    (frame.curtainZ[i] + (target - frame.curtainZ[i]) * (delta * 2.4).coerceAtMost(1.0)).toFloat()
                }
            }
        }
        repeat(3) { k ->
            val cycle = (timeSeconds * .85 + k / 3.0) % 1
            frame.sonarScale[k] = (.55 + cycle * 1.9).toFloat()
            frame.sonarAlpha[k] = if (awake) ((1 - cycle) * .75).toFloat() else 0f
        }
        val power = if (scan) 7.2 + sin(timeSeconds * 36) * .5 else if (awake) 2.6 else if (phase == ConveyorMotion.Phase.AFTER) 1.4 else .85
        frame.spotPower += ((power - frame.spotPower) * (delta * 4.5).coerceAtMost(1.0)).toFloat()
        val pool = if (scan) .8 + sin(timeSeconds * 22) * .1 else if (awake) .42 else if (phase == ConveyorMotion.Phase.AFTER) .22 else .16
        frame.poolAlpha += ((pool - frame.poolAlpha) * (delta * 4).coerceAtMost(1.0)).toFloat()
        repeat(2) { i -> frame.strobeAlpha[i] = if (scan) { if ((timeSeconds * 11 + i * .5) % 1 < .5) 1f else .12f } else .1f }
        frame.beamAlpha = if (scan) (clamp(age / .16) * (1 - clamp((age - .6) / .3))).toFloat() else 0f
        frame.beamSpotAlpha = if (!scan) 0f else if (age < .1) (age * 10).toFloat() else if (age > .75) clamp((.9 - age) / .15).toFloat() else .9f
        frame.beamSpotY = (2.9 - (if (scan) clamp(age / .78) else 0.0) * 2.3).toFloat()
        frame.recoilY = if (scan && age < .45) (exp(-age * 7) * sin(age * 46) * .035).toFloat() else 0f
        return frame
    }
    companion object {
        private fun clamp(value: Double) = value.coerceIn(0.0, 1.0)
        private fun linear(value: Int): Double { val s = value / 255.0; return if (s <= .04045) s / 12.92 else ((s + .055) / 1.055).pow(2.4) }
        val HOT = doubleArrayOf(1.9, linear(208) * 1.9, linear(138) * 1.9)
        private val GREEN = doubleArrayOf(linear(71), linear(209), linear(138))
        private val OFF = DoubleArray(3) { linear(43) }
        private fun color(buffer: FloatArray, index: Int, rgb: DoubleArray, brightness: Double) {
            repeat(3) { channel -> buffer[index * 3 + channel] = (rgb[channel] * brightness).toFloat() }
        }
    }
}
