package `in`.borrowbuddy.android.ui

/**
 * A 5×7 dot-matrix font, drawn dot by dot on Canvas so headlines read like an
 * LED departure board. Each glyph is seven rows of five cells; '#' is lit.
 */
private val glyphs: Map<Char, List<String>> = mapOf(
    'A' to listOf(".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
    'B' to listOf("####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."),
    'C' to listOf(".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."),
    'D' to listOf("####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."),
    'E' to listOf("#####", "#....", "#....", "####.", "#....", "#....", "#####"),
    'F' to listOf("#####", "#....", "#....", "####.", "#....", "#....", "#...."),
    'G' to listOf(".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"),
    'H' to listOf("#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
    'I' to listOf(".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."),
    'J' to listOf("..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."),
    'K' to listOf("#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"),
    'L' to listOf("#....", "#....", "#....", "#....", "#....", "#....", "#####"),
    'M' to listOf("#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"),
    'N' to listOf("#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"),
    'O' to listOf(".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
    'P' to listOf("####.", "#...#", "#...#", "####.", "#....", "#....", "#...."),
    'Q' to listOf(".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"),
    'R' to listOf("####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"),
    'S' to listOf(".####", "#....", "#....", ".###.", "....#", "....#", "####."),
    'T' to listOf("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."),
    'U' to listOf("#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
    'V' to listOf("#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."),
    'W' to listOf("#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."),
    'X' to listOf("#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"),
    'Y' to listOf("#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."),
    'Z' to listOf("#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"),
    '0' to listOf(".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."),
    '1' to listOf("..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."),
    '2' to listOf(".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"),
    '3' to listOf("####.", "....#", "....#", ".###.", "....#", "....#", "####."),
    '4' to listOf("...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."),
    '5' to listOf("#####", "#....", "####.", "....#", "....#", "#...#", ".###."),
    '6' to listOf("..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."),
    '7' to listOf("#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."),
    '8' to listOf(".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."),
    '9' to listOf(".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."),
    ' ' to List(7) { "....." },
)

const val DotRows = 7

/** Lit cells for [text] as rows × columns, one blank column between letters. Unknown characters render blank. */
internal fun dotMatrix(text: String): List<BooleanArray> {
    val letters = text.uppercase().map { glyphs[it] ?: glyphs.getValue(' ') }
    val width = (letters.size * 6 - 1).coerceAtLeast(0)
    return List(DotRows) { row ->
        BooleanArray(width).also { cells ->
            letters.forEachIndexed { index, glyph -> glyph[row].forEachIndexed { col, c -> if (c == '#') cells[index * 6 + col] = true } }
        }
    }
}

/**
 * A two-dot-thick check mark inside an 11×8 box, listed in the order a pen
 * would draw it: down the short stroke, then up the long one.
 */
internal val checkDots: List<Pair<Int, Int>> = buildList {
    val short = listOf(0 to 3, 1 to 4, 2 to 5, 3 to 6)
    val long = listOf(4 to 6, 5 to 5, 6 to 4, 7 to 3, 8 to 2, 9 to 1, 10 to 0)
    (short + long).forEach { (col, row) ->
        add(col to row)
        if (row + 1 <= 7) add(col to row + 1)
    }
}.distinct()
