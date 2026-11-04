package `in`.borrowbuddy.android

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.PickupLocation
import `in`.borrowbuddy.android.ui.CampusImageWidth
import `in`.borrowbuddy.android.ui.CampusImageHeight
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class HostedPinTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private lateinit var repository: BorrowRepository
    private fun await(condition: () -> Boolean) = compose.waitUntil(30_000, condition)
    private fun shown(value: String) = compose.onAllNodesWithText(value).fetchSemanticsNodes().isNotEmpty()
    private fun scroll(matcher: SemanticsMatcher) = compose.onNode(hasScrollAction() and SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)).performScrollToNode(matcher)
    private fun matcher(text: String, ancestor: SemanticsMatcher? = null): SemanticsMatcher =
        if (ancestor == null) (hasText(text) or hasContentDescription(text, ignoreCase = true)) else (hasText(text) or hasContentDescription(text, ignoreCase = true)) and hasAnyAncestor(ancestor)
    private fun tap(text: String, ancestor: SemanticsMatcher? = null) {
        val node = matcher(text, ancestor)
        if (compose.onAllNodesWithTag("admin-desk").fetchSemanticsNodes().isNotEmpty()) scroll(node)
        await { compose.onAllNodes(node).fetchSemanticsNodes().isNotEmpty() }
        scroll(node); compose.onNode(node).assertIsDisplayed().assertIsEnabled().performClick()
    }
    private fun field(label: String, value: String, ancestor: SemanticsMatcher) {
        val node = hasSetTextAction() and matcher(label, ancestor)
        scroll(node); compose.onNode(node).performTextReplacement(value)
        androidx.test.espresso.Espresso.closeSoftKeyboard()
    }
    private fun login(email: String, password: String) {
        await { shown("WELCOME BACK") || shown("▶ START BORROWING") }
        if (shown("▶ START BORROWING")) compose.onNodeWithText("▶ START BORROWING").performClick()
        compose.onNode(hasSetTextAction() and hasText("BENNETT EMAIL")).performTextReplacement(email)
        compose.onNode(hasSetTextAction() and hasText("PASSWORD")).performTextReplacement(password)
        compose.onAllNodesWithText("SIGN IN").onLast().performClick(); await { shown("BROWSE") }
    }
    private fun logout() { compose.onNodeWithContentDescription("Open account").performClick(); tap("SIGN OUT"); await { shown("WELCOME BACK") } }
    private fun location(name: String): PickupLocation? = runBlocking { repository.locations(admin = true) }.find { it.name == name }
    private fun editor(id: String) {
        val parent = hasTestTag("pin-$id")
        awaitAdmin(); scroll(parent)
        if (compose.onAllNodes(hasTestTag("pin-editor-$id")).fetchSemanticsNodes().isEmpty()) tap("[ EDIT PIN ]", parent)
    }
    private fun awaitAdmin() = await { compose.onAllNodesWithTag("admin-desk").fetchSemanticsNodes().isNotEmpty() }
    private fun openAdmin() { compose.onNodeWithText("[ ADMIN ]").performClick(); awaitAdmin() }
    private fun choose(text: String, option: String, parent: SemanticsMatcher) {
        if (text.startsWith("VISIBILITY:")) {
            val node = hasContentDescription(text) and hasAnyAncestor(parent)
            scroll(node); compose.onNode(node).performClick()
        } else {
            val node = hasContentDescription("Label side: RIGHT OF THE PIN") and hasAnyAncestor(parent)
            scroll(node); compose.onNode(node).performClick(); compose.onNodeWithText("Left of the pin").performClick()
        }
    }
    private fun capture(name: String) {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val image = compose.onRoot().captureToImage().asAndroidBitmap()
        assertPaintedSurface(image)
        java.io.File(context.filesDir, name).outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test fun adminPinPlacementStudentVisibilityCatalogAndSafeDeletion() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Hosted pins require isolated fixtures", listOf("qaAdminEmail", "qaEmail", "qaPassword", "qaRunId", "qaPinItemId").all { !args.getString(it).isNullOrBlank() })
        val password = args.getString("qaPassword")!!; val admin = args.getString("qaAdminEmail")!!
        val student = args.getString("qaEmail")!!; val run = args.getString("qaRunId")!!
        val item = args.getString("qaPinItemId")!!
        val name = "Android QA pin $run"; val renamed = "Android QA pin updated $run"
        repository = (InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as BorrowBuddyApplication).repository
        try {
            login(admin, password); openAdmin()
            val new = hasTestTag("pin-editor-new")
            field("NAME", name, new); field("DESCRIPTION", "Synthetic QA pickup point", new)
            val position = hasTestTag("pin-position") and hasAnyAncestor(new)
            scroll(position)
            val photo = hasTestTag("campus-map-image") and hasAnyAncestor(new)
            await { compose.onNode(photo).fetchSemanticsNode().config[CampusImageWidth] > 0 }
            val image = compose.onNode(photo).fetchSemanticsNode()
            assertTrue("Map decoding must use the displayed size", image.config[CampusImageWidth] <= image.boundsInRoot.width * 2)
            assertEquals(4.0 / 3, image.config[CampusImageWidth].toDouble() / image.config[CampusImageHeight], .01)
            compose.onNode(position).performTouchInput { click(Offset(width * .673f, height * .276f)) }
            compose.onNode(hasSetTextAction() and matcher("X %", new)).assertTextContains("67.3")
            compose.onNode(hasSetTextAction() and matcher("Y %", new)).assertTextContains("27.6")
            scroll(position)
            compose.onNode(position).performTouchInput {
                swipe(Offset(width * .673f, height * .276f), Offset(width * .725f, height * .315f), 400)
            }
            compose.onNode(hasSetTextAction() and matcher("X %", new)).assertTextContains("72.5")
            compose.onNode(hasSetTextAction() and matcher("Y %", new)).assertTextContains("31.5")
            compose.activityRule.scenario.recreate(); await { compose.onAllNodesWithTag("admin-desk").fetchSemanticsNodes().isNotEmpty() }
            scroll(hasSetTextAction() and matcher("NAME", new))
            compose.onNode(hasSetTextAction() and matcher("NAME", new)).assertTextContains(name)
            compose.onNode(hasSetTextAction() and matcher("X %", new)).assertTextContains("72.5")
            field("X %", "101", new); tap("ADD PIN", new)
            await { shown("[ MAP COORDINATES MUST BE NUMBERS FROM 0 TO 100. ]") }
            assertNull(location(name))
            field("X %", "38.8", new); field("Y %", "44.4", new)
            tap("ADD PIN", new); await { location(name) != null }
            val id = location(name)!!.id
            compose.onNodeWithText("MAP").performClick()
            await { compose.onAllNodesWithTag("pickup-select-$id").fetchSemanticsNodes().isNotEmpty() }
            tap(name.uppercase(), hasTestTag("pickup-select-$id"))
            compose.onNode(matcher("0 ITEMS AVAILABLE", hasTestTag("pickup-details-$id"))).assertExists()
            openAdmin()
            runBlocking { repository.client.from("items").update(mapOf("pickup_location_id" to id)) { filter { eq("id", item) } } }
            editor(id); val edit = hasTestTag("pin-editor-$id")
            field("NAME", renamed, edit); field("X %", "29.7", edit); field("Y %", "33.6", edit)
            choose("LABEL SIDE: RIGHT", "LEFT", edit)
            choose("VISIBILITY: ON THE BOARD", "HIDDEN", edit)
            tap("SAVE PIN", edit); await { location(renamed)?.is_active == false }
            val hidden = location(renamed)!!
            assertEquals(29.7, hidden.xp!!, .0001); assertEquals(33.6, hidden.yp!!, .0001); assertEquals("left", hidden.map_label)
            logout(); login(student, password); compose.onNodeWithText("MAP").performClick()
            await { shown("PICKUP MAP") }
            assertFalse(runBlocking { repository.locations() }.any { it.id == id })
            assertTrue(runBlocking { repository.client.from("pickup_locations").select { filter { eq("id", id) } }.decodeList<PickupLocation>() }.isEmpty())
            assertTrue(compose.onAllNodesWithTag("pickup-select-$id").fetchSemanticsNodes().isEmpty())

            logout(); login(admin, password); openAdmin(); editor(id)
            choose("VISIBILITY: HIDDEN", "ON THE BOARD", edit); tap("SAVE PIN", edit)
            await { location(renamed)?.is_active == true }
            logout(); login(student, password); compose.onNodeWithText("MAP").performClick()
            await { compose.onAllNodesWithTag("pickup-select-$id").fetchSemanticsNodes().isNotEmpty() }
            tap(renamed.uppercase(), hasTestTag("pickup-select-$id"))
            val details = hasTestTag("pickup-details-$id")
            scroll(hasTestTag("campus-board"))
            val board = compose.onNodeWithTag("campus-board").fetchSemanticsNode().boundsInRoot
            val label = compose.onNodeWithTag("pickup-label-$id").fetchSemanticsNode().boundsInRoot
            assertTrue("Saved left label must render to the left of its pin", label.right < board.left + board.width * .297f)
            scroll(details); compose.onNode(details).assertExists()
            compose.onNode(matcher("1 ITEM AVAILABLE", details)).assertExists()
            compose.activityRule.scenario.recreate(); await { compose.onAllNodes(details).fetchSemanticsNodes().isNotEmpty() }
            scroll(hasTestTag("campus-board")); capture("native-map-route.png")
            scroll(details); capture("native-map-details.png")
            tap("CLOSE", details); assertTrue(compose.onAllNodes(details).fetchSemanticsNodes().isEmpty())
            tap(renamed.uppercase(), hasTestTag("pickup-select-$id"))
            scroll(hasTestTag("campus-board")); compose.onNodeWithTag("campus-board").performClick()
            assertTrue(compose.onAllNodes(details).fetchSemanticsNodes().isEmpty())
            tap(renamed.uppercase(), hasTestTag("pickup-select-$id"))
            tap("BROWSE ITEMS →", details)
            await { shown("ANDROID QA MAP SHELF $run".uppercase()) }
            scroll(hasText("ANDROID QA MAP SHELF $run".uppercase()))
            compose.onNodeWithText("ANDROID QA MAP SHELF $run".uppercase()).assertIsDisplayed()
            compose.onNodeWithText("MAP").performClick()
            await { compose.onAllNodesWithTag("pickup-shelf-$id").fetchSemanticsNodes().isNotEmpty() }
            scroll(hasTestTag("pickup-shelf-$id")); compose.onNodeWithTag("pickup-shelf-$id").performClick()
            await { shown("ANDROID QA MAP SHELF $run".uppercase()) }

            logout(); login(admin, password); openAdmin()
            val card = hasTestTag("pin-$id")
            tap("REMOVE", card); awaitDialogWindow(compose,compose.activity)
            compose.onNode(hasText("KEEP PIN") and hasAnyAncestor(isDialog())).assertIsDisplayed().performClick()
            compose.onAllNodes(isDialog()).assertCountEquals(0)
            assertNotNull(location(renamed))
            tap("REMOVE", card); compose.activityRule.scenario.recreate(); await { shown("REMOVE PIN?") }
            awaitDialogWindow(compose,compose.activity)
            compose.onAllNodesWithText("REMOVE").filter(hasAnyAncestor(isDialog())).onLast().performClick()
            await { location(renamed) == null }
            val listing = runBlocking { repository.item(item) }!!
            assertNull("Deleting the pin must preserve the item and clear its pickup reference", listing.pickup_location_id)
            capture("native-pin-deleted.png")
        } finally { runBlocking { repository.signOut() } }
    }
}
