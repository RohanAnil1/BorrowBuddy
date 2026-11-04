package `in`.borrowbuddy.android.graphics

import org.junit.Assert.*
import org.junit.Test

class ConveyorMotionTest {
    @Test fun scansMatchSourceBoundariesAndResetEachCycle() {
        assertEquals(10610, ConveyorMotion.cycleMs)
        var start = 1100.0
        repeat(4) { gate ->
            val scan = ConveyorMotion.at(start)
            assertEquals(gate, scan.activeGate)
            assertEquals(gate + 1, scan.stamps)
            assertEquals(ConveyorMotion.Phase.SCAN, scan.phases[gate])
            assertEquals(((ConveyorMotion.gateX[gate] - .5) * 12).toFloat(), scan.x, .0001f)
            val after = ConveyorMotion.at(start + 640)
            assertNull(after.activeGate)
            assertEquals(gate, after.lastActive)
            assertEquals(ConveyorMotion.Phase.AFTER, after.phases[gate])
            start += 640 + 1900
        }
        val cycle = ConveyorMotion.at(10610.0)
        assertEquals(1, cycle.cycle); assertEquals(1, cycle.crateIndex); assertEquals(0, cycle.stamps)
        assertEquals(0, ConveyorMotion.at(31830.0).crateIndex)
    }
    @Test fun travelEasesWakesAndFlipsCustody() {
        assertNull(ConveyorMotion.at(0.0).wakingGate)
        assertEquals(0, ConveyorMotion.at(900.0).wakingGate)
        val flipStart = 1100 + 640 + 1900 + 640
        assertEquals(0f, ConveyorMotion.at(flipStart + 1900 * .34).flipY, .0001f)
        assertEquals(Math.PI.toFloat(), ConveyorMotion.at(flipStart + 1900 * .60).flipY, .0001f)
        val backStart = flipStart + 1900 + 640
        assertEquals(0f, ConveyorMotion.at(backStart + 1900 * .55).flipY, .0001f)
        assertNotNull(ConveyorMotion.at(8720.0).trustAgeSeconds)
        assertNull(ConveyorMotion.at(10220.0).trustAgeSeconds)
    }
    @Test fun suspendedAndReducedMotionDoNotAdvanceTime() {
        val motion = ConveyorMotion()
        motion.advance(10.0, true, false)
        assertEquals(50.0, motion.elapsedMs, 0.0)
        motion.advance(1.0, false, false)
        val still = motion.advance(1.0, true, true)
        assertEquals(50.0, motion.elapsedMs, 0.0)
        assertEquals(1.5f, still.x, 0f); assertEquals(0f, still.flipY, 0f)
        assertEquals(List(4) { ConveyorMotion.Phase.STILL }, still.phases)
        assertEquals(3, still.stamps)
    }
}
