package `in`.borrowbuddy.android.graphics

import org.junit.Assert.*
import org.junit.Test

class StationMotionTest {
    @Test fun scannerPushesCurtainsPulsesAndSweepsAfterStamp() {
        val station = StationMotion(0)
        station.frame(0.0, .016, ConveyorMotion.Phase.IDLE, false)
        val entry = station.frame(1.0, .016, ConveyorMotion.Phase.SCAN, false)
        assertEquals(0f, entry.beamAlpha, 0f)
        val scan = station.frame(1.2, .016, ConveyorMotion.Phase.SCAN, false)
        assertSame(entry, scan)
        assertEquals(1f, scan.beamAlpha, .0001f)
        assertTrue(scan.curtainZ.all { it in -.18f..0f })
        assertTrue(scan.curtainZ[0] < -.1f)
        assertTrue(scan.lampRgb[0] != scan.lampRgb[3] && scan.lampRgb[3] != scan.lampRgb[6])
        assertTrue(scan.sonarAlpha.all { it in 0f.. .75f })
        assertEquals(.95f, scan.lensAlpha, 0f)
        val after = station.frame(1.64, .016, ConveyorMotion.Phase.AFTER, false)
        assertEquals(0f, after.beamAlpha, 0f); assertEquals(0f, after.recoilY, 0f)
        assertTrue(after.ledRgb[1] > after.ledRgb[34]) // Green sweep begins at first LED.
        station.frame(2.6, .016, ConveyorMotion.Phase.AFTER, false)
        assertTrue(after.ledRgb.all { it.isFinite() && it >= 0f })
    }
    @Test fun chaseTravelsAndReducedMotionFreezesAllFrameBuffers() {
        val station = StationMotion(2)
        val first = station.frame(0.0, .016, ConveyorMotion.Phase.WAKE, false)
        val initial = first.ledRgb.copyOf()
        val moved = station.frame(.3, .016, ConveyorMotion.Phase.WAKE, false)
        assertFalse(initial.contentEquals(moved.ledRgb))
        val before = moved.ledRgb.copyOf(); val curtains = moved.curtainZ.copyOf()
        assertSame(moved, station.frame(100.0, .05, ConveyorMotion.Phase.STILL, true))
        assertArrayEquals(before, moved.ledRgb, 0f); assertArrayEquals(curtains, moved.curtainZ, 0f)
        val still = StationMotion(0).frame(0.0, 0.0, ConveyorMotion.Phase.STILL, true)
        assertTrue(still.curtainZ.all { it == 0f }); assertEquals(0f, still.beamAlpha, 0f)
    }
}
