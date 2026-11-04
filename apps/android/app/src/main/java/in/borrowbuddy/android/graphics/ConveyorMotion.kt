package `in`.borrowbuddy.android.graphics

import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.sin

/** Native timeline of landing/line/timeline.ts and canvas.tsx. Time advances only while visible. */
class ConveyorMotion(initialElapsedMs: Double = 0.0) {
    data class Gate(val code: String, val label: String, val caption: String)
    data class Crate(val id: String, val name: String, val from: String, val to: String, val serial: String, val seed: Int)
    enum class Phase { IDLE, WAKE, SCAN, AFTER, STILL }
    data class Segment(val from: Double, val to: Double, val gate: Int?, val durationMs: Int)
    data class Pose(
        val x: Float, val y: Float, val rotationZ: Float, val flipY: Float,
        val phases: List<Phase>, val stamps: Int, val crateIndex: Int, val cycle: Int,
        val activeGate: Int?, val wakingGate: Int?, val lastActive: Int?,
        val scanLineY: Float?, val washTarget: Float, val trustAgeSeconds: Float?, val beltOffset: Float
    )

    init { require(initialElapsedMs >= 0 && initialElapsedMs.isFinite()) }
    var elapsedMs = initialElapsedMs
        private set

    fun advance(deltaSeconds: Double, running: Boolean, reduced: Boolean, span: Float = 12f): Pose {
        require(span > 0f && span.isFinite())
        if (running && !reduced) elapsedMs += deltaSeconds.coerceIn(0.0, .05) * 1000
        return at(elapsedMs, reduced, span)
    }

    companion object {
        val gates = listOf(
            Gate("G-01", "REQUESTED", "OWNER APPROVES"), Gate("G-02", "ACCEPTED", "DATES LOCKED IN"),
            Gate("G-03", "HANDED OVER", "QR SCAN · CUSTODY 2/2"), Gate("G-04", "RETURNED", "BACK ON THE SHELF")
        )
        val crates = listOf(
            Crate("sony", "SONY A7 III", "BLC", "LIB", "8998040139", 3),
            Crate("epson", "EPSON PROJECTOR", "SAC", "HSA", "0101045216", 7),
            Crate("jbl", "JBL SPEAKER", "LIB", "CAF", "2436315621", 11)
        )
        val gateX = listOf(.125, .375, .625, .875)
        val segments = buildList {
            add(Segment(-.16, gateX[0], null, 1100))
            gateX.forEachIndexed { index, position ->
                add(Segment(position, position, index, 640))
                if (index < 3) add(Segment(position, gateX[index + 1], null, 1900))
            }
            add(Segment(gateX.last(), 1.16, null, 1250))
        }
        val cycleMs = segments.sumOf { it.durationMs }
        const val rideY = 1.575f
        private fun clamp(value: Double) = value.coerceIn(0.0, 1.0)
        private fun ease(value: Double) = if (value < .5) 4 * value.pow(3) else 1 - (-2 * value + 2).pow(3) / 2

        fun at(timeMs: Double, reduced: Boolean = false, span: Float = 12f): Pose {
            require(timeMs >= 0 && timeMs.isFinite() && span > 0 && span.isFinite())
            if (reduced) return Pose(span * .125f, rideY, 0f, 0f, List(4) { Phase.STILL }, 3, 0, 0,
                null, null, null, null, 0f, null, 0f)
            val cycle = floor(timeMs / cycleMs).toInt()
            val inCycle = timeMs % cycleMs
            var start = 0.0
            val index = segments.indexOfFirst { segment ->
                if (inCycle < start + segment.durationMs) true else { start += segment.durationMs; false }
            }.coerceAtLeast(0)
            val segment = segments[index]
            val local = (inCycle - start) / segment.durationMs
            val fraction = if (segment.gate == null) segment.from + (segment.to - segment.from) * ease(local) else segment.from
            val flip = when {
                index < 4 -> 0.0
                index == 4 -> clamp((local - .34) / .26)
                index == 6 -> 1 - clamp((local - .25) / .3)
                index < 6 -> 1.0
                else -> 0.0
            }
            val active = segment.gate
            val waking = if (active == null && local > .7) gateX.indexOf(segment.to).takeIf { it >= 0 } else null
            val previous = segments.take(index).lastOrNull { it.gate != null }?.gate ?: if (cycle > 0) 3 else null
            val stamps = active?.plus(1) ?: if (index == 0) 0 else (previous?.plus(1) ?: 0)
            val seconds = timeMs / 1000
            val dwellAge = if (active != null) (inCycle - start) / 1000 else null
            val trustStart = segments.take(7).sumOf { it.durationMs }.toDouble()
            val trustAge = ((inCycle - trustStart) / 1000).takeIf { it in 0.0..<1.5 }
            return Pose(
                ((fraction - .5) * span).toFloat(), rideY + (sin(seconds * 1.7) * .035).toFloat(),
                (sin(seconds * 2.3) * .012).toFloat(), (flip * Math.PI).toFloat(),
                List(4) { gate -> when (gate) { active -> Phase.SCAN; waking -> Phase.WAKE; previous -> Phase.AFTER; else -> Phase.IDLE } },
                stamps, cycle % crates.size, cycle, active, waking, previous,
                dwellAge?.let { (.95 - clamp(it / .66) * 1.9).toFloat() },
                if (dwellAge != null) (.13 + sin(seconds * 30) * .04).toFloat() else 0f,
                trustAge?.toFloat(), (-seconds * (span * .25 / 1.9) / .6 % 1).toFloat()
            )
        }
    }
}
