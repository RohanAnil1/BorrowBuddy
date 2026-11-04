package `in`.borrowbuddy.android

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.graphics.asAndroidBitmap
import `in`.borrowbuddy.android.ui.PortalBackdropReady
import `in`.borrowbuddy.android.ui.CatalogColumns
import `in`.borrowbuddy.android.ui.CatalogCoverReady
import `in`.borrowbuddy.android.ui.CatalogLoading
import `in`.borrowbuddy.android.ui.CatalogResultCount
import `in`.borrowbuddy.android.ui.CatalogFailed
import `in`.borrowbuddy.android.domain.Rules
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class HostedItemFlowTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private fun verticalScroll() = hasScrollAction() and SemanticsMatcher.keyIsDefined(SemanticsProperties.VerticalScrollAxisRange)
    private fun awaitCatalog(count: Int? = null) {
        compose.waitUntil(20_000) { compose.onAllNodes(SemanticsMatcher.expectValue(CatalogLoading, false)).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("catalog-scroll").assert(SemanticsMatcher.expectValue(CatalogFailed, false))
        if (count != null) compose.waitUntil(20_000) { compose.onAllNodes(SemanticsMatcher.expectValue(CatalogResultCount, count)).fetchSemanticsNodes().isNotEmpty() }
    }
    private fun assertNoMatches() {
        awaitCatalog(0)
        compose.onNode(verticalScroll()).performScrollToNode(hasText("[ NO MATCHES ]"))
        compose.onNodeWithText("[ NO MATCHES ]").assertIsDisplayed()
        compose.onNode(verticalScroll()).performScrollToNode(hasTestTag("catalog-clear"))
    }
    private fun capture(name: String, node: SemanticsNodeInteraction = compose.onRoot()) {
        val bitmap = node.captureToImage().asAndroidBitmap(); assertPaintedSurface(bitmap)
        java.io.File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir, "native-catalog-$name.png").outputStream().use {
            bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
        }
    }
    private fun cardMetrics(itemId: String, title: String) {
        val layouts = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
        compose.onNodeWithText(title.uppercase(), useUnmergedTree = true).performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult) { it(layouts) }
        val layout = layouts.single()
        val measurer = androidx.compose.ui.text.TextMeasurer(layout.layoutInput.fontFamilyResolver, layout.layoutInput.density, layout.layoutInput.layoutDirection)
        val wraps = org.json.JSONArray()
        for ((name, strategy) in listOf("simple" to androidx.compose.ui.text.style.LineBreak.Simple, "paragraph" to androidx.compose.ui.text.style.LineBreak.Paragraph, "heading" to androidx.compose.ui.text.style.LineBreak.Heading)) {
            for (width in listOf(270, 345)) {
                val result = measurer.measure(androidx.compose.ui.text.AnnotatedString(title.uppercase()), style = layout.layoutInput.style.copy(lineBreak = strategy),
                    constraints = androidx.compose.ui.unit.Constraints(maxWidth = (width * layout.layoutInput.density.density).toInt()))
                wraps.put(org.json.JSONObject().put("strategy", name).put("widthDp", width).put("lines", org.json.JSONArray((0 until result.lineCount).map {
                    title.uppercase().substring(result.getLineStart(it), result.getLineEnd(it, visibleEnd = true))
                })))
            }
        }
        val card = compose.onNodeWithTag("catalog-item-$itemId")
        val uncut = card.getUnclippedBoundsInRoot()
        val visible = card.fetchSemanticsNode().boundsInRoot
        val json = org.json.JSONObject().put("fontSize", layout.layoutInput.style.fontSize.toString())
            .put("fontWeight", layout.layoutInput.style.fontWeight.toString())
            .put("letterSpacing", layout.layoutInput.style.letterSpacing.toString()).put("lineBreak", layout.layoutInput.style.lineBreak.toString())
            .put("titleWidthPx", layout.size.width).put("titleMaxIntrinsicPx", layout.multiParagraph.intrinsics.maxIntrinsicWidth)
            .put("density", compose.activity.resources.displayMetrics.density).put("fontScale", compose.activity.resources.configuration.fontScale)
            .put("cardWidthDp", uncut.right.value - uncut.left.value).put("cardHeightDp", uncut.bottom.value - uncut.top.value).put("capturedHeightPx", card.fetchSemanticsNode().boundsInRoot.height)
            .put("cardTopDp", uncut.top.value).put("cardBottomDp", uncut.bottom.value).put("visibleTopPx", visible.top).put("visibleBottomPx", visible.bottom)
            .put("lines", org.json.JSONArray((0 until layout.lineCount).map { title.uppercase().substring(layout.getLineStart(it), layout.getLineEnd(it, visibleEnd = true)) }))
            .put("wraps", wraps)
        java.io.File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir, "native-catalog-metrics.json").writeText(json.toString(2))
        assertEquals("Visual evidence must include the entire card", (uncut.bottom.value - uncut.top.value) * compose.activity.resources.displayMetrics.density, visible.height, 1f)
    }
    private fun shell(command: String): String = android.os.ParcelFileDescriptor.AutoCloseInputStream(
        InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command)).bufferedReader().use { it.readText() }
    private fun captureProfile(name: String) {
        compose.waitForIdle()
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val image = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        try {
            assertPaintedSurface(image)
            instrumentation.targetContext.filesDir.resolve("native-catalog-$name.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        } finally { image.recycle() }
    }

    private fun checkWideWindow(itemId: String, title: String) {
        val size = Regex("Override size: (\\d+x\\d+)").find(shell("wm size"))?.groupValues?.get(1)
        val density = Regex("Override density: (\\d+)").find(shell("wm density"))?.groupValues?.get(1)
        try {
            shell("wm size 1024x768"); shell("wm density 160")
            compose.waitUntil(30_000) {
                compose.mainClock.advanceTimeByFrame()
                compose.onAllNodes(SemanticsMatcher.expectValue(CatalogColumns, 3)).fetchSemanticsNodes().isNotEmpty()
            }
            awaitCatalog()
            compose.onNode(verticalScroll()).performScrollToNode(hasTestTag("catalog-item-$itemId"))
            val card = compose.onNodeWithTag("catalog-item-$itemId")
            assertTrue("A 1024dp window must show 304dp source grid columns", card.fetchSemanticsNode().boundsInRoot.width in 300f..306f)
            card.assert(hasText("DEP ₹1,00,000"))
            val titleLayout = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
            compose.onNodeWithText(title.uppercase(), useUnmergedTree = true).performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult) { it(titleLayout) }
            assertEquals("The source fixture title occupies two lines at tablet card width", 2, titleLayout.single().lineCount)
            capture("wide")
        } finally {
            shell("wm size ${size ?: "reset"}"); shell("wm density ${density ?: "reset"}")
        }
        compose.waitUntil(30_000) {
            // Display configuration is delivered by WindowManager outside the
            // test clock; commit its new constraints before reading semantics.
            compose.mainClock.advanceTimeByFrame()
            compose.onAllNodes(SemanticsMatcher.expectValue(CatalogColumns, 1)).fetchSemanticsNodes().isNotEmpty()
        }
        awaitCatalog()
    }

    @Test fun catalogGalleryCalendarRequestAndCancellation() {
        val arguments = InstrumentationRegistry.getArguments()
        val email = arguments.getString("qaEmail")
        val password = arguments.getString("qaPassword")
        val itemId = arguments.getString("qaItemId")
        val title = arguments.getString("qaItemTitle")?.replace('_', ' ')
        assumeTrue("Isolated hosted item/account required", listOf(email, password, itemId, title).all { !it.isNullOrBlank() })
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val repository = (context.applicationContext as BorrowBuddyApplication).repository
        try {
            compose.waitUntil(20_000) { compose.onAllNodesWithText("▶ START BORROWING").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("▶ START BORROWING").performClick()
            compose.onNode(hasSetTextAction() and hasText("BENNETT EMAIL")).performTextInput(email!!)
            compose.onNode(hasSetTextAction() and hasText("PASSWORD")).performTextInput(password!!)
            compose.onAllNodesWithText("SIGN IN").onLast().performClick()
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("catalog-search").fetchSemanticsNodes().isNotEmpty() }
            compose.waitUntil(20_000) { compose.onAllNodes(SemanticsMatcher.expectValue(PortalBackdropReady, true)).fetchSemanticsNodes().isNotEmpty() }
            awaitCatalog()
            capture("browse")
            compose.onNodeWithTag("catalog-search").performTextInput(title!!)
            compose.waitUntil(20_000) { compose.onAllNodes(hasText("SEARCH") and isEnabled()).fetchSemanticsNodes().isNotEmpty() }
            compose.onNode(verticalScroll()).performScrollToNode(hasText("SEARCH", substring = false))
            compose.onNodeWithText("SEARCH").performClick()
            awaitCatalog()
            compose.onNode(verticalScroll()).performScrollToNode(hasTestTag("catalog-item-$itemId"))
            compose.onNodeWithTag("catalog-item-$itemId").assert(hasText(title.uppercase(), substring = true))
            val listing = runBlocking { repository.item(itemId!!)!! }
            val categoryName = listing.category!!.name
            compose.onNode(verticalScroll()).performScrollToNode(hasTestTag("catalog-search"))
            compose.onNodeWithTag("catalog-search").performTextReplacement("$title unsubmitted draft")
            compose.onNode(verticalScroll()).performScrollToNode(hasTestTag("catalog-category"))
            compose.onNodeWithTag("catalog-category").performClick()
            compose.onNodeWithText(categoryName, useUnmergedTree = true).performClick()
            val today = Rules.today()
            for (label in listOf("from", "to")) {
                compose.onNode(verticalScroll()).performScrollToNode(hasTestTag("catalog-date-$label"))
                compose.onNodeWithTag("catalog-date-$label").performClick()
                val monthName = today.month.getDisplayName(java.time.format.TextStyle.FULL, compose.activity.resources.configuration.locales[0])
                val dateNode = SemanticsMatcher("Calendar day $today") { node ->
                    node.config.getOrNull(SemanticsProperties.Text)?.any { value ->
                        val text = value.text
                        text.contains(monthName, ignoreCase = true) && text.contains(today.year.toString()) && Regex("\\b${today.dayOfMonth}\\b").containsMatchIn(text)
                    } == true
                }
                val dates = compose.onAllNodes(dateNode, useUnmergedTree = true)
                assertEquals("Calendar descriptions: ${compose.onAllNodes(isDialog()).onFirst().printToString()}", 1, dates.fetchSemanticsNodes().size)
                dates.onFirst().performClick()
                compose.onNodeWithText("APPLY").performClick()
                compose.onNodeWithTag("catalog-date-$label").assertContentDescriptionEquals("${label.uppercase()} date: $today")
            }
            compose.onNode(verticalScroll()).performScrollToNode(hasTestTag("catalog-category"))
            compose.activityRule.scenario.recreate()
            compose.waitUntil(30_000) { compose.onAllNodesWithTag("catalog-search").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("catalog-search").assertTextContains("$title unsubmitted draft")
            compose.onNodeWithTag("catalog-category").assertContentDescriptionEquals("Category: $categoryName")
            compose.onNodeWithTag("catalog-date-from").assertContentDescriptionEquals("FROM date: $today")
            compose.onNodeWithTag("catalog-date-to").assertContentDescriptionEquals("TO date: $today")
            awaitCatalog()
            capture("filtered")
            compose.onNode(verticalScroll()).performScrollToNode(hasTestTag("catalog-item-$itemId"))
            compose.onNodeWithTag("catalog-item-$itemId").assertIsDisplayed()
            compose.onNode(verticalScroll()).performScrollToNode(hasTestTag("catalog-condition"))
            compose.onNodeWithTag("catalog-condition").performClick()
            compose.onNodeWithText(Rules.conditions.entries.first { it.key != listing.condition }.value, useUnmergedTree = true).performClick()
            assertNoMatches()
            capture("empty")
            compose.onNodeWithTag("catalog-clear").performClick()
            compose.onNodeWithTag("catalog-search").assert(SemanticsMatcher.expectValue(SemanticsProperties.EditableText, androidx.compose.ui.text.AnnotatedString("")))
            compose.onNodeWithTag("catalog-category").assertContentDescriptionEquals("Category: All categories")
            compose.onNodeWithTag("catalog-date-from").assertContentDescriptionEquals("FROM date: not selected")
            compose.onNodeWithTag("catalog-date-to").assertContentDescriptionEquals("TO date: not selected")
            compose.onNodeWithTag("catalog-search").performTextInput(title)
            awaitCatalog()
            compose.onNodeWithText("SEARCH").performClick()
            awaitCatalog()
            val pickup = runBlocking { repository.locations().first() }
            compose.onNodeWithTag("catalog-location").performClick()
            compose.onNodeWithText(pickup.name, useUnmergedTree = true).performClick()
            assertNoMatches()
            compose.onNodeWithTag("catalog-clear").performClick()
            compose.onNodeWithTag("catalog-location").assertContentDescriptionEquals("Pickup: Any pickup spot")
            compose.onNodeWithTag("catalog-search").performTextInput(title)
            compose.waitUntil(20_000) { compose.onAllNodes(hasText("SEARCH") and isEnabled()).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("SEARCH").performClick()
            awaitCatalog()
            if (arguments.getString("qaAdaptiveWindow") == "1") checkWideWindow(itemId!!, title)
            compose.onNode(verticalScroll()).performScrollToNode(hasTestTag("catalog-item-$itemId"))
            compose.waitUntil(15_000) { compose.onAllNodes(hasTestTag("catalog-item-$itemId") and SemanticsMatcher.expectValue(CatalogCoverReady, true)).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("catalog-scroll").performScrollToIndex(1)
            compose.onNodeWithTag("catalog-item-$itemId").assert(hasText("DEP ₹1,00,000"))
            compose.onNodeWithTag("catalog-item-$itemId").assert(hasText("ISOLATED API WORKFLOW FIXTURE, AUTOMATICALLY REMOVED"))
            cardMetrics(requireNotNull(itemId), requireNotNull(title))
            capture("card", compose.onNodeWithTag("catalog-item-$itemId"))
            compose.onNodeWithText(title.uppercase()).performClick()
            compose.waitUntil(20_000) { compose.onAllNodesWithText("PHOTO 1/3").fetchSemanticsNodes().isNotEmpty() }
            compose.onNode(verticalScroll()).performScrollToNode(hasContentDescription("Photo 2"))
            compose.onNodeWithContentDescription("Photo 2").performClick()
            compose.waitUntil(5_000) { compose.onAllNodesWithText("PHOTO 2/3").fetchSemanticsNodes().isNotEmpty() }
            compose.onNode(verticalScroll()).performScrollToNode(hasText("ANDROID QA OWNER"))
            compose.onNodeWithText("ANDROID QA OWNER").performClick()
            compose.waitUntil(20_000) { compose.onAllNodesWithContentDescription("1 completed loans").fetchSemanticsNodes().isNotEmpty() }
            captureProfile("profile")
            compose.onNodeWithTag("public-profile").performScrollToNode(hasText("5.0 FROM 1 REVIEW"))
            compose.onNodeWithText("5.0 FROM 1 REVIEW").assertIsDisplayed()
            captureProfile("profile-reviews")
            compose.activityRule.scenario.recreate()
            compose.waitUntil(20_000) { compose.onAllNodesWithTag("public-profile").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithTag("public-profile").performScrollToNode(hasText("5.0 FROM 1 REVIEW"))
            compose.onNodeWithText("5.0 FROM 1 REVIEW").assertIsDisplayed()
            androidx.test.espresso.Espresso.pressBack()
            compose.waitUntil(20_000) { compose.onAllNodesWithText("[ DATES TAKEN? ]").fetchSemanticsNodes().isNotEmpty() }
            val start = Rules.today().plusDays(3).toString()
            val end = Rules.today().plusDays(4).toString()
            if (start.substring(0, 7) != Rules.today().toString().substring(0, 7)) {
                compose.onNode(verticalScroll()).performScrollToNode(hasText("→")); compose.onNodeWithText("→").performClick()
            }
            compose.onNode(verticalScroll()).performScrollToNode(hasContentDescription("Date $start"))
            compose.onNodeWithContentDescription("Date $start").performClick()
            if (end.substring(0, 7) != start.substring(0, 7)) compose.onNodeWithText("→").performClick()
            compose.onNode(verticalScroll()).performScrollToNode(hasContentDescription("Date $end"))
            compose.onNodeWithContentDescription("Date $end").performClick()
            compose.waitUntil(5_000) { compose.onAllNodesWithText("REQUEST TO BORROW", substring = true).fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("REQUEST TO BORROW", substring = true).performClick()
            compose.waitUntil(20_000) { compose.onAllNodesWithText("[ REQUEST DISPATCHED ]").fetchSemanticsNodes().isNotEmpty() }
            val userId = repository.client.auth.currentUserOrNull()!!.id
            val request = runBlocking { repository.outgoingRequests(userId).single { it.item_id == itemId && it.status == "pending" } }
            assertEquals(start, request.start_date); assertEquals(end, request.end_date)
            openBorrowLogbook(compose)
            compose.onNodeWithTag("borrow-logbook").performScrollToNode(hasTestTag("cancel-request-${request.id}"))
            compose.onNodeWithTag("cancel-request-${request.id}").performClick()
            compose.waitUntil(20_000) { compose.onAllNodesWithTag("borrow-logbook").fetchSemanticsNodes().isNotEmpty() &&
                compose.onAllNodesWithTag("cancel-request-${request.id}").fetchSemanticsNodes().isEmpty() }
            compose.onNodeWithTag("borrow-logbook").performScrollToNode(hasText("CANCELLED"))
            assertEquals("cancelled", runBlocking { repository.outgoingRequests(userId).single { it.id == request.id }.status })
        } finally {
            runCatching { capture("finished") }
            runBlocking { if (repository.client.auth.currentUserOrNull() != null) repository.signOut() }
        }
    }
}
