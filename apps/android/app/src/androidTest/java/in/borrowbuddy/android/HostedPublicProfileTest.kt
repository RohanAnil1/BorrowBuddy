package `in`.borrowbuddy.android

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.ui.*
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

/** Real hosted reads through production content; the catalog test covers route/Back integration. */
class HostedPublicProfileTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private fun ready() = compose.waitUntil(30_000) { compose.onAllNodesWithTag("public-profile").fetchSemanticsNodes().isNotEmpty() }
    private fun scroll(tag: String) = compose.onNodeWithTag("public-profile").performScrollToNode(hasTestTag(tag))
    private fun capture(name: String) {
        compose.waitForIdle()
        val image = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        try {
            assertPaintedSurface(image)
            context.filesDir.resolve("native-profile-$name.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        } finally { image.recycle() }
    }
    @Test fun sourcePublicIdentityReputationListingsAndEmptyState() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Isolated public-profile fixtures required", listOf("qaEmail", "qaAdminEmail", "qaPassword", "qaStudentId", "qaEmptyId", "qaNewestItem", "qaNewestReview", "qaNullReview", "qaBlankReview", "qaExcludedReview", "qaExcludedItem").all { !args.getString(it).isNullOrBlank() })
        val repository = (context.applicationContext as BorrowBuddyApplication).repository
        val wide = args.getString("qaWide") == "1"
        val viewport = args.getString("qaViewport")?.toIntOrNull() ?: if (wide) 1024 else 411
        val suffix = args.getString("qaProfileSize") ?: if (wide) "wide" else "phone"
        val studentId = args.getString("qaStudentId")!!
        var profileId by mutableStateOf(studentId)
        var openedItem: String? = null
        try {
            runBlocking { repository.signIn(args.getString("qaEmail")!!, args.getString("qaPassword")!!) }
            val public = runBlocking { repository.publicProfile(studentId)!! }
            assertEquals("Public projection excludes email", "", public.email)
            assertNull(public.phone); assertNull(public.student_id_path); assertNull(public.verification_note)
            assertNull("An ordinary student cannot read an unverified profile", runBlocking { repository.publicProfile(args.getString("qaEmptyId")!!) })
            val reviews = runBlocking { repository.reviews(userId = studentId) }
            val listings = runBlocking { repository.profileListings(studentId) }
            val summary = runBlocking { repository.profileStats(studentId) }
            assertEquals(20, reviews.size); assertEquals(args.getString("qaNewestReview"), reviews.first().id)
            assertFalse(reviews.any { it.id == args.getString("qaExcludedReview") })
            assertEquals(21L, summary.review_count); assertEquals(21L, summary.completed_loans)
            assertEquals(81.0 / 21, summary.rating_average!!, .00001)
            assertEquals(12, listings.size); assertEquals(args.getString("qaNewestItem"), listings.first().id)
            assertFalse(listings.any { it.id == args.getString("qaExcludedItem") })
            assertTrue(listings.all { it.owner_id == studentId && it.status == "available" })
            assertEquals(reviews.map { it.created_at }.sortedDescending(), reviews.map { it.created_at })
            val restore = StateRestorationTester(compose)
            restore.setContent {
                CargoTheme {
                    Box(Modifier.fillMaxSize()) {
                        PortalBackdrop()
                        Box(Modifier.fillMaxSize().safeDrawingPadding()) { StudentScreen(repository, profileId) { openedItem = it } }
                    }
                }
            }
            ready()
            compose.onNodeWithTag("public-profile").assert(SemanticsMatcher.expectValue(PublicProfileReviewCount, 20))
                .assert(SemanticsMatcher.expectValue(PublicProfileListingCount, 12))
                .assert(SemanticsMatcher.expectValue(PublicProfileColumns, if (viewport >= 1024) 3 else if (viewport >= 640) 2 else 1))
            compose.onNodeWithText("MIRA SHARMA").assertIsDisplayed()
            compose.onNodeWithText("COMPUTER SCIENCE · YEAR 3").assertIsDisplayed()
            compose.onNodeWithText("VERIFIED STUDENT").assertIsDisplayed()
            compose.onNodeWithText("88", useUnmergedTree = true).assertIsDisplayed()
            compose.onNodeWithContentDescription("21 completed loans").assertIsDisplayed()
            val layouts = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
            compose.onNodeWithTag("profile-name").performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult) { it(layouts) }
            assertEquals((viewport * .06f).coerceIn(40f, 64f), layouts.single().layoutInput.style.fontSize.value, .05f)
            val density = compose.activity.resources.displayMetrics.density
            val titleHeight = compose.onNodeWithTag("profile-name").fetchSemanticsNode().boundsInRoot.height / density
            val identityHeight = compose.onNodeWithTag("profile-identity").fetchSemanticsNode().boundsInRoot.height / density
            val statsWidth = compose.onNodeWithTag("profile-stats").fetchSemanticsNode().boundsInRoot.width / density
            val avatarWidth = compose.onNodeWithTag("profile-avatar").fetchSemanticsNode().boundsInRoot.width / density
            for (label in listOf("TRUST SCORE", "COMPLETED LOANS")) {
                val labelLayouts = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
                compose.onNodeWithText(label).performSemanticsAction(androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult) { it(labelLayouts) }
                assertEquals("Source stats labels stay on one line", 1, labelLayouts.single().lineCount)
            }
            if (!wide) args.getString("qaPhoneTitleHeight")?.toFloatOrNull()?.let { expected -> assertEquals("Source/native title line boxes", expected, titleHeight, 1.1f) }
            args.getString("qaSourceStatsWidth")?.toFloatOrNull()?.let { expected -> assertEquals("Source/native equal-width stats columns", expected, statsWidth, 1.2f) }
            args.getString("qaSourceAvatarWidth")?.toFloatOrNull()?.let { expected -> assertEquals("Source/native flex avatar width", expected, avatarWidth, 1.5f) }
            args.getString("qaSourceIdentityHeight")?.toFloatOrNull()?.let { expected -> assertEquals("Source/native identity wrapping and height", expected, identityHeight, 2.5f) }
            capture("identity-$suffix")
            scroll("member-id-card"); compose.onNodeWithTag("member-id-card").assertExists()
            compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(MemberCardReady, true)).fetchSemanticsNodes().isNotEmpty() }
            capture("card-$suffix")
            scroll("profile-rating-summary"); compose.onNodeWithTag("profile-rating-summary").assertTextEquals("3.9 FROM 21 REVIEWS")
            scroll("profile-review-${args.getString("qaNewestReview")}")
            compose.onNodeWithText("LENT TO THEM").assertIsDisplayed()
            compose.onNodeWithTag("profile-comment-${args.getString("qaNewestReview")}").assertTextEquals("“RELIABLE EQUIPMENT”")
            capture("reviews-$suffix")
            for (key in listOf("qaNullReview", "qaBlankReview")) {
                scroll("profile-review-${args.getString(key)}")
                compose.onNodeWithTag("profile-comment-${args.getString(key)}").assertDoesNotExist()
            }
            if (!wide) {
                val anchor = "profile-review-${args.getString("qaBlankReview")}"
                val before = compose.onNodeWithTag(anchor).fetchSemanticsNode().boundsInRoot.top
                restore.emulateSavedInstanceStateRestore(); ready()
                compose.onNodeWithTag(anchor).assertIsDisplayed()
                assertEquals("Reading position survives saved-state restoration", before, compose.onNodeWithTag(anchor).fetchSemanticsNode().boundsInRoot.top, 2f)
            }
            val item = "catalog-item-${args.getString("qaNewestItem")}"
            scroll(item)
            val card = compose.onNodeWithTag(item)
            val width = card.fetchSemanticsNode().boundsInRoot.width / density
            assertEquals("Source listing column width", if (viewport >= 1024) 304f else if (viewport >= 640) 296f else compose.activity.resources.configuration.screenWidthDp - 32f, width, 1.2f)
            capture("listings-$suffix"); card.assertHasClickAction().performClick()
            assertEquals(args.getString("qaNewestItem"), openedItem)
            compose.runOnIdle { profileId = args.getString("qaEmptyId")!! }
            compose.waitUntil(30_000) { compose.onAllNodesWithText("[ ROUTE UNAVAILABLE ]").fetchSemanticsNodes().isNotEmpty() }
            runBlocking { repository.signOut(); repository.signIn(args.getString("qaAdminEmail")!!, args.getString("qaPassword")!!) }
            compose.onNodeWithText("TRY AGAIN").performClick(); ready()
            compose.onNodeWithTag("public-profile").assert(SemanticsMatcher.expectValue(PublicProfileReviewCount, 0)).assert(SemanticsMatcher.expectValue(PublicProfileListingCount, 0))
            compose.onNodeWithText("UNNAMED STUDENT").assertIsDisplayed()
            compose.onNodeWithText("BENNETT UNIVERSITY").assertIsDisplayed()
            compose.onNodeWithText("VERIFIED STUDENT").assertDoesNotExist()
            compose.onNodeWithText("COMPUTER SCIENCE · YEAR 3").assertDoesNotExist()
            scroll("profile-no-reviews"); compose.onNodeWithTag("profile-no-reviews").assertTextEquals("NO REVIEWS YET. REPUTATION BUILDS AFTER COMPLETED LOANS.")
            scroll("profile-no-listings"); compose.onNodeWithText("NO ACTIVE LISTINGS").assertIsDisplayed()
            capture("empty-$suffix")
            compose.runOnIdle { profileId = java.util.UUID.randomUUID().toString() }
            compose.waitUntil(30_000) { compose.onAllNodesWithText("[ ROUTE UNAVAILABLE ]").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("Student profile not found.", ignoreCase = true).assertExists()
            compose.onNodeWithText("TRY AGAIN").assertHasClickAction()
            context.filesDir.resolve("native-profile-result-$suffix.json").writeText(JSONObject().put("width", suffix).put("reviewWindow", reviews.size)
                .put("allReviewCount", summary.review_count).put("completedLoans", summary.completed_loans).put("availableListingWindow", listings.size)
                .put("titleHeightDp", titleHeight).put("identityHeightDp", identityHeight).put("statsWidthDp", statsWidth).put("avatarWidthDp", avatarWidth).put("listingWidthDp", width).put("privateFieldsExcluded", true)
                .put("nullAndEmptyCommentsOmitted", true).put("membershipCardRetained", true).put("membershipGpuReady", true).put("missingProfileRecoverable", true)
                .put("savedStateTested", !wide).put("listingCallback", true).toString(2))
        } finally {
            runCatching { capture("failure") }
            runBlocking { repository.signOut() }
        }
    }
}
