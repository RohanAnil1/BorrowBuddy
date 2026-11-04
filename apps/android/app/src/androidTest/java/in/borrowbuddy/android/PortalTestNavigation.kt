package `in`.borrowbuddy.android

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.ComposeTestRule

internal fun openBorrowLogbook(compose: ComposeTestRule) {
    compose.onNodeWithTag("nav-dashboard").performClick()
    compose.waitUntil(30_000) { compose.onAllNodesWithTag("dashboard-logbook").fetchSemanticsNodes().isNotEmpty() }
    compose.onNode(hasScrollAction() and SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange))
        .performScrollToNode(hasTestTag("dashboard-logbook"))
    compose.onNodeWithTag("dashboard-logbook").performClick()
    compose.waitUntil(30_000) { compose.onAllNodesWithText("[ LOGBOOK — BORROWED ]").fetchSemanticsNodes().isNotEmpty() }
}
