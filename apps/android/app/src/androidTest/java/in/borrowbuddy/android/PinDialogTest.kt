package `in`.borrowbuddy.android

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.espresso.Espresso
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.domain.PickupLocation
import `in`.borrowbuddy.android.domain.Profile
import `in`.borrowbuddy.android.ui.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

/** No database writes: exercise the actual admin lazy row, editor and dialog. */
class PinDialogTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private fun scroll(matcher: SemanticsMatcher) = compose.onNode(hasScrollAction() and
        SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)).performScrollToNode(matcher)

    @Test fun cancellationStaysIdleAfterEditingAndSavedStateRestoration() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("qaPinDialog")=="1")
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val repository=(context.applicationContext as BorrowBuddyApplication).repository
        val restoration=StateRestorationTester(compose)
        val pin=PickupLocation("qa-local-pin","Local confirmation pin",description="Dialog regression",xp=38.8,yp=44.4)
        var phase="initial"
        restoration.setContent {
            CargoTheme { Column(Modifier.fillMaxSize()) {
                PortalHeader(Profile("qa-local-admin",full_name="QA Admin",is_admin=true),"admin",0,0,{},{})
                val data=remember { AdminData(emptyList(),emptyList(),emptyList(),listOf(pin)) }
                AdminContent(data,repository,rememberActions()) {}
            } }
        }
        val row=hasTestTag("pin-${pin.id}")
        val remove=hasText("REMOVE") and hasAnyAncestor(row)
        fun open() { scroll(remove); compose.onNode(remove).assertIsDisplayed().performClick(); awaitDialogWindow(compose,compose.activity) }
        fun cancel() {
            compose.onNodeWithText("REMOVE PIN?").assertIsDisplayed()
            compose.onNode(hasText("KEEP PIN") and hasAnyAncestor(isDialog())).assertIsDisplayed().performClick()
            compose.onAllNodes(isDialog()).assertCountEquals(0)
            compose.onNode(row).assertExists()
        }
        try {
            repeat(5) { phase="cancel-before-edit-$it"; open(); cancel() }
            phase="focused-editor"
            val edit=hasText("[ EDIT PIN ]") and hasAnyAncestor(row)
            scroll(edit); compose.onNode(edit).performClick()
            val field=hasSetTextAction() and hasContentDescription("Name") and hasAnyAncestor(row)
            scroll(field); compose.onNode(field).performTextReplacement("Retained confirmation draft")
            Espresso.closeSoftKeyboard()
            repeat(5) { phase="cancel-after-edit-$it"; open(); cancel() }
            phase="restore-open-dialog"
            open(); restoration.emulateSavedInstanceStateRestore(); awaitDialogWindow(compose,compose.activity)
            cancel()
            scroll(field); compose.onNode(field).assertTextEquals("Retained confirmation draft")
            phase="back-dismissal"
            open(); Espresso.pressBack(); compose.onAllNodes(isDialog()).assertCountEquals(0)
            context.filesDir.resolve("pin-dialog-local-result.json").writeText(org.json.JSONObject()
                .put("cancelCycles",11).put("focusedDraftRetained",true).put("openDialogRestored",true)
                .put("backDismisses",true).put("normalComposeSynchronization",true).toString(2))
        } catch(failure: Throwable) {
            val screenshot=InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
            if(screenshot!=null) try { context.filesDir.resolve("pin-dialog-local-failure.png").outputStream().use {
                screenshot.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)
            } } finally { screenshot.recycle() }
            throw AssertionError("Pin dialog regression phase: $phase",failure)
        }
    }
}
