package `in`.borrowbuddy.android.ui

import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.unit.dp
import androidx.navigation.NavBackStackEntry
import kotlin.math.roundToInt

val PortalTickerCollapsed = SemanticsPropertyKey<Float>("PortalTickerCollapsed")

class PortalTickerState(val fraction: MutableFloatState, val connection: NestedScrollConnection)

/** The source ticker scrolls away before the sticky header and returns at page top. */
@Composable fun rememberPortalTicker(entry: NavBackStackEntry?): PortalTickerState {
    val height = with(LocalDensity.current) { 38.5.dp.toPx() }
    val fraction = remember(entry?.id) { mutableFloatStateOf(entry?.savedStateHandle?.get<Float>("portal-ticker") ?: 0f) }
    return remember(entry?.id, height) {
        fun move(delta: Float): Offset {
            val previous = fraction.floatValue * height
            val next = (previous - delta).coerceIn(0f, height)
            fraction.floatValue = next / height
            entry?.savedStateHandle?.set("portal-ticker", fraction.floatValue)
            return Offset(0f, previous - next)
        }
        PortalTickerState(fraction, object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset =
                if (available.y < 0f) move(available.y) else Offset.Zero
            override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset =
                if (available.y > 0f) move(available.y) else Offset.Zero
        })
    }
}

@Composable fun PortalTicker(state: PortalTickerState) {
    val full = with(LocalDensity.current) { 38.5.dp.roundToPx() }
    val collapsed = (state.fraction.floatValue * full).roundToInt().coerceIn(0, full)
    Layout(content = { StatusTicker(active = collapsed < full) }, modifier = Modifier.clipToBounds()) { children, constraints ->
        val child = children.single().measure(constraints.copy(minHeight = full, maxHeight = full))
        layout(child.width, full - collapsed) { child.place(0, -collapsed) }
    }
}
