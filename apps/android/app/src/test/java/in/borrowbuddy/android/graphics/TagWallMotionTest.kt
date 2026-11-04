package `in`.borrowbuddy.android.graphics

import org.junit.Assert.*
import org.junit.Test

class TagWallMotionTest {
    @Test fun interactionsPauseAutoAdvanceAndDragSnapsWithinBounds() {
        val wall = TagWallMotion()
        assertEquals(3, wall.active)
        wall.navigate(1, 1000)
        assertFalse(wall.advance(6999)); assertEquals(4, wall.active)
        assertTrue(wall.advance(7000)); assertEquals(5, wall.active)
        wall.beginDrag(8000); wall.endDrag(2 * 174.72f, 174.72f)
        assertEquals(3, wall.active)
        assertFalse(wall.select(6, 8100))
        wall.endDrag(10000f, 174.72f); assertEquals(0, wall.active)
        wall.navigate(-1, 9000); assertEquals(0, wall.active)
        wall.endDrag(-10000f, 174.72f); assertEquals(7, wall.active)
        assertTrue(wall.advance(15000)); assertEquals(0, wall.active)
    }
}
