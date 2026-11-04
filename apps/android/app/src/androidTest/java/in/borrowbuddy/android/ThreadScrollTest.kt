package `in`.borrowbuddy.android

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.ui.CargoTheme
import `in`.borrowbuddy.android.ui.ThreadScrollState
import `in`.borrowbuddy.android.ui.rememberThreadScroll
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

/** Exercises the actual chat scroll controller without hosted fixtures. */
class ThreadScrollTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    @Test fun latestMessageFollowsViewportChangesAndReadingHistoryIsPreserved() {
        assumeTrue("Opt-in isolated scroll regression", InstrumentationRegistry.getArguments().getString("qaThreadScroll") == "1")
        var count by mutableIntStateOf(100)
        var request by mutableIntStateOf(1)
        var height by mutableStateOf(360.dp)
        lateinit var controller: ThreadScrollState
        lateinit var scope: CoroutineScope
        val restoration = StateRestorationTester(compose)
        restoration.setContent {
            CargoTheme {
                controller = rememberThreadScroll(count, false, request)
                scope = rememberCoroutineScope()
                LazyColumn(Modifier.fillMaxWidth().height(height).testTag("thread-viewport"), state = controller.list) {
                    items((0 until count).toList(), key = { it }) { index ->
                        Text("Thread row $index", Modifier.fillMaxWidth().height(64.dp).testTag("thread-row-$index"))
                    }
                }
            }
        }
        fun latest(index: Int) {
            compose.onNodeWithTag("thread-row-$index").assertIsDisplayed()
            val row = compose.onNodeWithTag("thread-row-$index").fetchSemanticsNode().boundsInRoot
            val viewport = compose.onNodeWithTag("thread-viewport").fetchSemanticsNode().boundsInRoot
            assertTrue("The latest row must stay fully inside the message viewport", row.top >= viewport.top - 1 && row.bottom <= viewport.bottom + 1)
        }
        latest(99)
        // The keyboard can finish opening after the send effect has already run.
        compose.runOnIdle { count = 101; request++ }
        latest(100)
        for (next in listOf(280, 180, 240, 360)) {
            compose.runOnIdle { height = next.dp }
            latest(100)
        }
        compose.runOnIdle { controller.pauseFollowing(); scope.launch { controller.list.scrollToItem(0) } }
        compose.onNodeWithTag("thread-row-0").assertIsDisplayed()
        compose.runOnIdle { height = 180.dp }
        compose.onNodeWithTag("thread-row-0").assertIsDisplayed()
        restoration.emulateSavedInstanceStateRestore()
        compose.onNodeWithTag("thread-row-0").assertIsDisplayed()
        compose.runOnIdle { count = 102; request++ }
        latest(101)
    }
}
