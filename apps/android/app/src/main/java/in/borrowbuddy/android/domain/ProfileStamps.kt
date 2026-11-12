package `in`.borrowbuddy.android.domain

import kotlinx.serialization.Serializable

/** One row of `get_profile_stamps`: aggregate progress only. */
@Serializable
data class ProfileStamp(val key: String, val earned: Boolean = false, val progress: Int = 0, val goal: Int = 1)

/** Ink design for a member ID card stamp; mirrors the web catalog in apps/web/src/lib/stamps.ts. */
data class StampDesign(val label: String, val rim: String, val hint: String, val round: Boolean, val tilt: Float)

object ProfileStamps {
    val designs: Map<String, StampDesign> = linkedMapOf(
        "first_lend" to StampDesign("FIRST LEND", "LENT", "Lend an item and get it back.", true, -9f),
        "first_borrow" to StampDesign("FIRST BORROW", "BORROWED", "Borrow an item and return it.", true, 6f),
        "on_time_10" to StampDesign("ON TIME ×10", "RETURNS", "Return 10 loans by their due date.", false, -4f),
        "trusted_lender" to StampDesign("TRUSTED LENDER", "TRUST 85+", "Finish 5 lends with a trust score of 85+.", true, 8f),
        "five_star_streak" to StampDesign("5★ STREAK", "REVIEWS", "Get five 5-star reviews in a row.", false, 5f),
        "campus_helper" to StampDesign("CAMPUS HELPER", "LOST & FOUND", "Hand over a found item or a giveaway.", true, -6f),
    )

    /** Drop keys this build does not know, clamp progress, and keep catalog order. */
    fun normalize(rows: List<ProfileStamp>): List<ProfileStamp> {
        val byKey = rows.filter { it.key in designs }.associateBy { it.key }
        return designs.keys.mapNotNull { key ->
            byKey[key]?.let { row ->
                val goal = row.goal.coerceAtLeast(1)
                row.copy(goal = goal, progress = row.progress.coerceIn(0, goal))
            }
        }
    }

    /** Owners see every stamp (locked ones with hints); everyone else sees earned stamps only. */
    fun visible(stamps: List<ProfileStamp>, owner: Boolean) = if (owner) stamps else stamps.filter { it.earned }
}
