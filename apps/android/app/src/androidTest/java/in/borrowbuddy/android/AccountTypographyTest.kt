package `in`.borrowbuddy.android

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.ui.CargoTheme
import `in`.borrowbuddy.android.ui.sourceDisplayTitleStyle
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

/** Browser-measured original font/CSS line boxes, independent of hosted data. */
class AccountTypographyTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    @Test fun titleLineBoxesMatchMeasuredWebsiteAtPhoneAndTabletWidths() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("qaAccountTypography") == "1")
        data class Case(val viewport: Float, val content: Int, val text: String, val height: Double, val lines: Int)
        val cases = listOf(
            Case(411f, 379, "ANDROID QA LEDGER STUDENT", 84.0, 2),
            Case(1024f, 688, "ANDROID QA LEDGER STUDENT", 129.0, 2),
            Case(411f, 379, "FINES", 42.0, 1),
            Case(1024f, 688, "FINES", 64.5, 1),
        )
        var current by mutableStateOf(cases.first())
        compose.setContent {
            CompositionLocalProvider(LocalDensity provides Density(1f, 1f)) {
                CargoTheme {
                    Text(current.text, Modifier.requiredWidth(current.content.dp).testTag("source-title"),
                        style = sourceDisplayTitleStyle(current.viewport), overflow = TextOverflow.Visible)
                }
            }
        }
        for (sample in cases) {
            compose.runOnIdle { current = sample }
            val layouts = mutableListOf<TextLayoutResult>()
            compose.onNodeWithTag("source-title").performSemanticsAction(SemanticsActions.GetTextLayoutResult) { it(layouts) }
            val actual = layouts.single()
            assertEquals("Source wrapping at ${sample.viewport}px", sample.lines, actual.lineCount)
            assertEquals("Source line-box height at ${sample.viewport}px", sample.height, actual.size.height.toDouble(), 2.0)
        }
    }
}
