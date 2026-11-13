package `in`.borrowbuddy.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DotMatrixTest {
    private fun render(text: String) = dotMatrix(text).map { row -> row.joinToString("") { if (it) "#" else "." } }

    @Test fun lettersAreFiveWideWithOneColumnBetween() {
        val board = dotMatrix("PICKED UP")
        assertEquals(DotRows, board.size)
        assertEquals(9 * 6 - 1, board.first().size)
    }

    @Test fun drawsTheGlyphs() {
        assertEquals(listOf(
            "#...#..###.",
            "#...#...#..",
            "#...#...#..",
            "#####...#..",
            "#...#...#..",
            "#...#...#..",
            "#...#..###.",
        ), render("HI"))
    }

    @Test fun lowercaseAndUnknownCharactersAreSafe() {
        assertEquals(render("OK"), render("ok"))
        assertTrue(dotMatrix("?").all { row -> row.none { it } })
        assertEquals(0, dotMatrix("").first().size)
    }

    @Test fun theCheckFitsItsBoxAndIsDrawnInPenOrder() {
        assertTrue(checkDots.all { (c, r) -> c in 0 until 11 && r in 0 until 8 })
        assertEquals(checkDots.size, checkDots.distinct().size)
        assertEquals(0 to 3, checkDots.first())           // starts at the top of the short stroke
        assertTrue(checkDots.last().first == 10)          // ends at the tip of the long one
    }
}
