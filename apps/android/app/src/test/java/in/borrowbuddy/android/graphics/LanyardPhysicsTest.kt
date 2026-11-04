package `in`.borrowbuddy.android.graphics

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs
import kotlin.math.sqrt

class LanyardPhysicsTest {
    @Test fun irregularMissedFramesDoNotKeepTheRestingCardAwake() {
        val motion=LanyardPhysics(); motion.configure(3.26087,true)
        val deltas=doubleArrayOf(.016666666,.033331488,.0500012,.0666643,.0166672,.1,.049999)
        repeat(200) { motion.frame(deltas[it%deltas.size],false) }
        motion.beginGrab(motion.position.x,motion.position.y,motion.position.z)
        motion.drag(motion.position.x+.25,motion.position.y+.1,motion.position.z)
        repeat(6) { motion.frame(deltas[it%deltas.size],false) }
        motion.release(); motion.flip(); motion.frame(.01666666,false); motion.flip()
        var elapsed=0.0; var index=0
        while(elapsed<30) { val dt=deltas[index++%deltas.size]; motion.frame(dt,true); elapsed+=dt }
        assertTrue("Irregular render intervals must not keep resetting sleep; calm=${motion.calm}",motion.calm>=1.2)
    }
    @Test fun missedFramesPreserveElapsedMotionAndSleepTiming() {
        fun simulate(fps: Int): LanyardPhysics {
            val motion=LanyardPhysics(); motion.configure(3.26087,true)
            repeat(fps*3) { motion.frame(1.0/fps,false) }
            motion.flip()
            repeat(fps*20) { motion.frame(1.0/fps,true) }
            return motion
        }
        val fast=simulate(60); val slow=simulate(10)
        assertTrue("Ten FPS must still reach reduced-motion sleep",slow.calm>=1.2)
        assertEquals("Missed frames must not stretch the simulation clock",fast.calm,slow.calm,.3)
        assertEquals(fast.position.x,slow.position.x,.01)
        assertEquals(fast.position.y,slow.position.y,.01)
    }
    @Test fun reducedMotionSleepsWithVariableFrameTiming() {
        val motion=LanyardPhysics(); motion.configure(3.26087,true)
        val deltas=doubleArrayOf(1.0/60,1.0/59,1.0/61,1.0/55,1.0/62)
        repeat(180) { motion.frame(deltas[it%deltas.size],false) }
        motion.flip(); repeat(30) { motion.frame(deltas[it%deltas.size],false) }; motion.flip()
        repeat(1800) { motion.frame(deltas[it%deltas.size],true) }
        assertTrue("Variable frame timing must allow reduced-motion sleep; calm=${motion.calm}",motion.calm>=1.2)
    }
    @Test fun hangingCardSettlesAndDragFlipRemainBounded() {
        val motion=LanyardPhysics(); motion.configure(3.26087,false)
        repeat(1200) { motion.frame(1.0/60,true) }
        assertEquals(0.0,motion.position.x,.01)
        assertEquals(motion.anchor.y-4*motion.rest-motion.hang.y,motion.position.y,.12)
        val settled=motion.position.x
        motion.beginGrab(motion.position.x,motion.position.y,motion.position.z)
        repeat(30) { index -> motion.drag(settled+index*.015,motion.position.y,0.0); motion.frame(1.0/60,true) }
        assertTrue(motion.grabbed); assertTrue(motion.position.x>settled+.2)
        motion.release(); assertFalse(motion.grabbed)
        motion.flip(); assertTrue(motion.back)
        repeat(1200) { motion.frame(1.0/60,true) }
        val q=motion.quaternion
        assertEquals(1.0,sqrt(q.x*q.x+q.y*q.y+q.z*q.z+q.w*q.w),1e-6)
        assertTrue(abs(q.y)>.95)
        assertTrue(motion.position.x.isFinite() && abs(motion.position.x)<3)
        motion.flip(); assertFalse(motion.back)
        repeat(1200) { motion.frame(1.0/60,true) }
        assertTrue(abs(q.w)>.95)
        assertTrue("Reduced-motion solver must reach its frame-loop sleep threshold; calm=${motion.calm}",motion.calm>=1.2)
    }
}
