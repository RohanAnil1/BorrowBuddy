package `in`.borrowbuddy.android.ui

import java.math.BigDecimal
import java.math.RoundingMode

/** Number.toFixed(1) rounds the actual IEEE-754 value. Formatter's canonical
 * decimal conversion differs at values such as 4.05 (source displays 4.0). */
internal fun profileRating(value: Double): String = BigDecimal(value).setScale(1, RoundingMode.HALF_UP).toPlainString()
