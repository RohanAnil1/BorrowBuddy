package `in`.borrowbuddy.android.domain

import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

data class MapPoint(val x: Double, val y: Double)
data class CampusRoute(val start: MapPoint, val control: MapPoint, val end: MapPoint)

/** The website's 1000 × 750 SVG coordinates, before display-size scaling. */
fun campusRoute(xp: Double, yp: Double): CampusRoute {
    val start = MapPoint(656.0, 318.0)
    val end = MapPoint(xp * 10, yp * 7.5)
    return CampusRoute(start, MapPoint((start.x + end.x) / 2,
        min(start.y, end.y) - max(70.0, abs(start.x - end.x) * .22)), end)
}

/** Pointer placement follows Math.round(percent * 10) / 10 in the source form. */
fun pinPercent(position: Float, extent: Float): Double {
    require(position.isFinite() && extent.isFinite() && extent > 0)
    return floor((position / extent * 100.0).coerceIn(0.0, 100.0) * 10 + .5) / 10
}
