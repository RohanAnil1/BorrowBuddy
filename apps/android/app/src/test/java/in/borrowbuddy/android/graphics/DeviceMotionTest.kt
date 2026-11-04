package `in`.borrowbuddy.android.graphics

import org.junit.Assert.*
import org.junit.Test

class DeviceMotionTest {
    @Test fun bootSettlesAndDragHasBoundedInertia() {
        val motion = DeviceMotion()
        val initial = motion.frame(0f, false)
        assertEquals(2.7f, initial.x, .0001f)
        var pose = initial
        repeat(180) { pose = motion.frame(1f / 60, false) }
        assertEquals(0f, pose.x, .001f)
        assertEquals(1f, pose.scale, .001f)
        motion.beginDrag(); motion.drag(10_000f, 10_000f)
        repeat(90) { pose = motion.frame(1f / 60, false) }
        assertTrue(pose.ry <= .621f); assertTrue(pose.rx <= .201f)
        motion.endDrag()
        repeat(180) { pose = motion.frame(1f / 60, false) }
        assertTrue(pose.ry <= .7f)
    }
    @Test fun reducedMotionIsAnImmediatelyReadableStillFrame() {
        val pose = DeviceMotion().frame(.05f, true)
        assertEquals(0f, pose.x, 0f)
        assertEquals(1f, pose.scale, 0f)
        assertEquals(1.15f, pose.glow, 0f)
    }
}
