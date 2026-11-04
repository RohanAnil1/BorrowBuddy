package `in`.borrowbuddy.android.graphics

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.listSaver

/** Lives above LazyColumn items, so view recycling cannot restart the website's lending line. */
class ConveyorPlayback(elapsedMs: Double = 0.0, counts: List<Int> = List(4) { 0 }, private var lastGate: Int? = null) {
    val motion = ConveyorMotion(elapsedMs)
    val stations = Array(4) { StationMotion(it) }
    var counts by mutableStateOf(counts)
        private set
    init { require(counts.size == 4 && counts.all { it >= 0 } && (lastGate == null || lastGate in 0..3)) }
    fun record(pose: ConveyorMotion.Pose) {
        val gate = pose.activeGate ?: return
        if (gate != lastGate) {
            lastGate = gate
            counts = counts.mapIndexed { index, value -> if (index == gate) value + 1 else value }
        }
    }
    companion object {
        val Saver = listSaver<ConveyorPlayback, Number>(
            save = { listOf(it.motion.elapsedMs, it.counts[0], it.counts[1], it.counts[2], it.counts[3], it.lastGate ?: -1) },
            restore = { values -> ConveyorPlayback(values[0].toDouble(), (1..4).map { values[it].toInt() }, values[5].toInt().takeIf { it >= 0 }) }
        )
    }
}
