package `in`.borrowbuddy.android.ui

import org.junit.Assert.*
import org.junit.Test
import kotlin.random.Random

class OfflineSignalHuntTest {
    @Test fun backoffDoublesToAThirtySecondCap() {
        assertEquals(listOf(5, 10, 20, 30, 30, 30), (0..5).map(::offlineBackoffSeconds))
        assertEquals(5, offlineBackoffSeconds(-1))
    }

    @Test fun antennaStrengthPeaksAtTheSweetSpot() {
        assertEquals(1f, antennaStrength(30f, 30f), 0f)
        assertEquals(.5f, antennaStrength(7.5f, 30f), 1e-4f)
        assertEquals(0f, antennaStrength(-30f, 30f), 0f)
    }

    @Test fun sweetSpotIsAlwaysAwayFromUprightAndReachable() {
        val random = Random(7)
        repeat(200) {
            val spot = pickSweetSpot(random)
            assertTrue(spot.toString(), abs(spot) in 18f..52f)
        }
    }

    private fun abs(value: Float) = kotlin.math.abs(value)

    private fun playing(): CatchGame = CatchGame(random = Random(1), autoSpawn = false).apply { resize(400f, 240f); start() }

    private fun CatchGame.runUntilSettled(reduced: Boolean = false, steps: Int = 400): List<CatchGame.Event> =
        (0 until steps).flatMap { step(1 / 60f, reduced) }.also { assertTrue(drops.isEmpty() || phase != CatchGame.Phase.Playing) }

    @Test fun cartCatchesAParcelThatFallsIntoIt() {
        val game = playing()
        game.spawn(dropX = game.cartX)
        val events = game.runUntilSettled()
        assertEquals(listOf(CatchGame.Event.Caught), events)
        assertEquals(1, game.score); assertEquals(CatchGame.LIVES, game.lives)
    }

    @Test fun threeMissesEndTheRoundAndKeepTheBest() {
        val game = CatchGame(best = 0, random = Random(1), autoSpawn = false).apply { resize(400f, 240f); start() }
        game.spawn(dropX = game.cartX); game.runUntilSettled()
        repeat(CatchGame.LIVES) { game.spawn(dropX = 380f); game.runUntilSettled() }
        assertEquals(CatchGame.Phase.Over, game.phase)
        assertEquals(0, game.lives)
        assertEquals(1, game.best)
    }

    @Test fun pausedRoundsDoNotAdvanceAndTheConnectionEndsThem() {
        val game = playing()
        game.spawn(dropX = 200f)
        game.pause()
        assertTrue(game.step(1f, reduced = false).isEmpty())
        assertEquals(-CatchGame.SIZE, game.drops.single().x, 0f)
        game.resume()
        assertTrue(game.endBack())
        assertEquals(CatchGame.Phase.Back, game.phase)
        game.start()
        assertEquals("A finished session cannot restart", CatchGame.Phase.Back, game.phase)
    }

    @Test fun reducedMotionSlowsTheConveyor() {
        val normal = playing().apply { spawn(dropX = 390f); step(1f, reduced = false) }
        val reduced = playing().apply { spawn(dropX = 390f); step(1f, reduced = true) }
        assertTrue(reduced.drops.single().x < normal.drops.single().x)
    }

    @Test fun keysMoveTheCartWithinBounds() {
        val game = playing()
        repeat(120) { game.step(1 / 60f, reduced = false, move = -1) }
        assertEquals(game.cartWidth / 2, game.cartX, 0f)
    }
}
