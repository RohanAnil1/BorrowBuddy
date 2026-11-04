package `in`.borrowbuddy.android.domain

import org.junit.Assert.*
import org.junit.Test

class CampusMapGeometryTest {
    @Test fun routeMatchesSourceViewBoxWithMinimumAndDistanceBasedArcs() {
        val near = campusRoute(38.8, 44.4)
        assertEquals(656.0, near.start.x, .00001); assertEquals(318.0, near.start.y, .00001)
        assertEquals(522.0, near.control.x, .00001); assertEquals(248.0, near.control.y, .00001)
        assertEquals(388.0, near.end.x, .00001); assertEquals(333.0, near.end.y, .00001)
        val far = campusRoute(29.7, 33.6)
        assertEquals(476.5, far.control.x, .00001); assertEquals(173.02, far.control.y, .00001)
    }
    @Test fun pointerCoordinatesClampAndUseOneDecimalInPortraitAndWideMaps() {
        assertEquals(67.3, pinPercent(269.04f, 400f), .00001)
        assertEquals(67.3, pinPercent(538.08f, 800f), .00001)
        assertEquals(0.0, pinPercent(-100f, 400f), .00001)
        assertEquals(100.0, pinPercent(450f, 400f), .00001)
    }
}
