package `in`.borrowbuddy.android.domain

import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

class ProfileStampsTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun decodesRpcRowsAndKeepsCatalogOrder() {
        val rows = json.decodeFromString<List<ProfileStamp>>("""[
            {"key":"campus_helper","earned":true,"progress":1,"goal":1},
            {"key":"first_lend","earned":false,"progress":0,"goal":1},
            {"key":"on_time_10","earned":false,"progress":7,"goal":10},
            {"key":"stamp_from_the_future","earned":true,"progress":1,"goal":1}
        ]""")
        val stamps = ProfileStamps.normalize(rows)
        assertEquals(listOf("first_lend", "on_time_10", "campus_helper"), stamps.map { it.key })
        assertEquals(7, stamps[1].progress)
        assertEquals(10, stamps[1].goal)
    }

    @Test fun clampsProgressIntoGoal() {
        val stamps = ProfileStamps.normalize(listOf(
            ProfileStamp("first_borrow", true, 9, 1),
            ProfileStamp("five_star_streak", false, -2, 0),
        ))
        assertEquals(1, stamps[0].progress)
        assertEquals(1, stamps[1].goal)
        assertEquals(0, stamps[1].progress)
    }

    @Test fun publicViewShowsEarnedOnly() {
        val stamps = listOf(ProfileStamp("first_lend", true, 1, 1), ProfileStamp("on_time_10", false, 3, 10))
        assertEquals(2, ProfileStamps.visible(stamps, owner = true).size)
        assertEquals(listOf("first_lend"), ProfileStamps.visible(stamps, owner = false).map { it.key })
    }

    @Test fun everyStampHasAHintAndSmallTilt() {
        assertEquals(6, ProfileStamps.designs.size)
        ProfileStamps.designs.values.forEach {
            assertTrue(it.hint.isNotBlank())
            assertTrue(it.tilt in -10f..10f)
        }
    }
}
