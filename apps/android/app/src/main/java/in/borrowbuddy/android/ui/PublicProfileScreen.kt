package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlin.math.roundToInt

val PublicProfileReviewCount = SemanticsPropertyKey<Int>("PublicProfileReviewCount")
val PublicProfileListingCount = SemanticsPropertyKey<Int>("PublicProfileListingCount")
val PublicProfileColumns = SemanticsPropertyKey<Int>("PublicProfileColumns")
val PublicProfileViewport = SemanticsPropertyKey<Int>("PublicProfileViewport")
private data class StudentData(val profile: Profile, val reviews: List<Review>, val items: List<Item>, val stats: ProfileStats, val stamps: List<ProfileStamp>?)
private fun profileText(value: String) = value.replace(Regex("[\\t\\n\\r\\u000C ]+"), " ").trim(' ').uppercase()
// FlowRow uses spacing to choose its wrap point and arrange to distribute each
// completed line. Keep both CSS gap and justify-between, including at 640dp.
private fun profileSpacedBetween(gap: Dp) = object : Arrangement.Horizontal {
    override val spacing = gap
    override fun Density.arrange(totalSize: Int, sizes: IntArray, layoutDirection: LayoutDirection, outPositions: IntArray) {
        with(Arrangement.SpaceBetween) { arrange(totalSize, sizes, layoutDirection, outPositions) }
    }
}
private val identityArrangement = profileSpacedBetween(24.dp)
private val reviewArrangement = profileSpacedBetween(12.dp)

@Composable fun StudentScreen(repository: BorrowRepository, id: String, openItem: (String) -> Unit) {
    LoadScreen(id, {
        val student = repository.publicProfile(id) ?: error("Student profile not found.")
        coroutineScope {
            val reviews = async { repository.reviews(userId = id) }
            val listings = async { repository.profileListings(id) }
            val stats = async { repository.profileStats(id) }
            val stamps = async { repository.profileStamps(id) }
            StudentData(student, reviews.await(), listings.await(), stats.await(), stamps.await())
        }
    }) { (student, reviews, listings, stats, stamps) ->
        val viewport = LocalWindowInfo.current.containerSize.width / LocalDensity.current.density
        val columns = if (viewport >= 1024) 3 else if (viewport >= 640) 2 else 1
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            LazyColumn(Modifier.widthIn(max = 1024.dp).fillMaxSize().testTag("public-profile").semantics {
                this[PublicProfileReviewCount] = reviews.size; this[PublicProfileListingCount] = listings.size
                this[PublicProfileColumns] = columns; this[PublicProfileViewport] = viewport.roundToInt()
            }, contentPadding = PaddingValues(horizontal = if (viewport >= 800) 40.dp else 16.dp, vertical = 32.dp)) {
                item("identity") { ProfileIdentity(student, stats, viewport >= 640) }
                item("member-card") { MemberIdCard(student, Modifier.padding(top = 32.dp), stamps) }
                item("reputation") {
                    FlowRow(Modifier.padding(top = 40.dp).fillMaxWidth().testTag("profile-reputation"), horizontalArrangement = Arrangement.SpaceBetween,
                        verticalArrangement = Arrangement.spacedBy(8.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                        Text("[ REPUTATION ]", style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f))
                        stats.rating_average?.let { average ->
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                                ProfileStars(average, 20)
                                Text("${profileRating(average)} FROM ${stats.review_count} ${if (stats.review_count == 1L) "REVIEW" else "REVIEWS"}",
                                    Modifier.testTag("profile-rating-summary"), style = loanMono(10), color = Cargo.Ink.copy(alpha = .6f))
                            }
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                }
                if (reviews.isEmpty()) item("no-reviews") {
                    Text("NO REVIEWS YET. REPUTATION BUILDS AFTER COMPLETED LOANS.",
                        Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(horizontal = 25.dp, vertical = 33.dp).testTag("profile-no-reviews"),
                        style = loanMono(10), textAlign = TextAlign.Center, color = Cargo.Ink.copy(alpha = .5f))
                }
                itemsIndexed(reviews, key = { _, review -> "review-${review.id}" }) { index, review ->
                    if (index > 0) Spacer(Modifier.height(12.dp))
                    ProfileReview(review)
                }
                item("listings-heading") {
                    Text("[ LISTINGS ]", Modifier.padding(top = 48.dp, bottom = 16.dp).testTag("profile-listings-heading"), style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f))
                }
                if (listings.isEmpty()) item("no-listings") {
                    Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(horizontal = 25.dp, vertical = 49.dp).testTag("profile-no-listings"),
                        horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(painterResource(R.drawable.ic_package_search), null, Modifier.size(28.dp), tint = Cargo.Accent)
                        Text("[ NO LISTINGS ]", Modifier.padding(top = 16.dp), style = loanMono(10), color = Cargo.Accent)
                        Text("NO ACTIVE LISTINGS", Modifier.padding(top = 12.dp), style = sourceDisplayTitleStyle(), color = Cargo.Ink, textAlign = TextAlign.Center, overflow = TextOverflow.Visible)
                        Text("NOTHING LISTED RIGHT NOW. CHECK BACK LATER.", Modifier.padding(top = 12.dp).widthIn(max = 384.dp),
                            style = loanBody(13), textAlign = TextAlign.Center, color = Cargo.Ink.copy(alpha = .6f))
                    }
                }
                itemsIndexed(listings.chunked(columns), key = { _, row -> "listing-${row.first().id}" }) { index, row ->
                    if (index > 0) Spacer(Modifier.height(16.dp))
                    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        row.forEach { item -> ItemCard(item, repository, openItem, Modifier.weight(1f).fillMaxHeight()) }
                        repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
                item("footer") {
                    Row(Modifier.padding(top = 40.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(painterResource(R.drawable.ic_map_pin), null, Modifier.size(14.dp), tint = Cargo.Ink.copy(alpha = .4f))
                        Text("HANDOVERS HAPPEN AT CAMPUS PICKUP SPOTS. AGREE ON ONE IN CHAT BEFORE YOU MEET.", style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
                    }
                }
            }
        }
    }
}

@Composable private fun ProfileIdentity(student: Profile, stats: ProfileStats, wide: Boolean) {
    FlowRow(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).testTag("profile-identity").padding(25.dp),
        horizontalArrangement = identityArrangement, verticalArrangement = Arrangement.spacedBy(24.dp)) {
        ProfileIdentityRow {
            Box(Modifier.size(64.dp).background(Color.Black).testTag("profile-avatar"), contentAlignment = Alignment.Center) {
                Text(student.full_name.ifEmpty { "?" }.take(1).uppercase(), style = loanBody(20).copy(fontFamily = Cargo.Title, lineHeight = 28.sp), color = Cargo.Ink)
            }
            Column {
                Text(profileText(student.full_name.ifEmpty { "Unnamed student" }), Modifier.fillMaxWidth().testTag("profile-name"), style = sourceDisplayTitleStyle(), color = Cargo.Ink, overflow = TextOverflow.Visible)
                Text(profileText(student.department ?: "Bennett University") + (student.year_of_study?.takeIf { it != 0 }?.let { " · YEAR $it" } ?: ""),
                    Modifier.padding(top = 4.dp), style = loanMono(10), color = Cargo.Ink.copy(alpha = .5f))
                FlowRow(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (student.verification_status == "verified") ProfileBadge("VERIFIED STUDENT", R.drawable.ic_shield_check, true)
                    ProfileBadge("JOINED ${loanRelativeTime(student.created_at)}", R.drawable.ic_calendar_check, false)
                }
            }
        }
        // Noto Sans Mono has 600/1000-em advances. CSS includes .08-em tracking
        // per character; reserve the source label's max-content grid tracks even
        // when Android's intrinsic paragraph width trims its edge tracking.
        val labelColumn = with(LocalDensity.current) { ("COMPLETED LOANS".length * 9f * (.6f + .08f)).sp.toDp() }
        Row(Modifier.widthIn(min = labelColumn * 2 + 24.dp).width(IntrinsicSize.Max).testTag("profile-stats"), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            Column(Modifier.weight(1f), horizontalAlignment = if (wide) Alignment.Start else Alignment.CenterHorizontally) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(painterResource(R.drawable.ic_star), null, Modifier.size(16.dp), tint = Cargo.Accent)
                    Text(student.trust_score.roundToInt().toString(), style = loanMono(24), color = Cargo.Accent)
                }
                Text("TRUST SCORE", Modifier.padding(top = 4.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
            }
            Column(Modifier.weight(1f), horizontalAlignment = if (wide) Alignment.Start else Alignment.CenterHorizontally) {
                Text(stats.completed_loans.toString(), Modifier.semantics { contentDescription = "${stats.completed_loans} completed loans" }, style = loanMono(24), color = Cargo.Ink)
                Text("COMPLETED LOANS", Modifier.padding(top = 4.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
            }
        }
    }
}

/** The source flex row shrinks both the 64px avatar and the text's max-content
 * basis proportionally. A fixed avatar plus weighted text changes phone wraps. */
@Composable private fun ProfileIdentityRow(content: @Composable () -> Unit) {
    Layout(content = content) { children, constraints ->
        val gap = 20.dp.roundToPx()
        val avatarBasis = 64.dp.roundToPx()
        val textBasis = children[1].maxIntrinsicWidth(Constraints.Infinity)
        val room = (constraints.maxWidth - gap).coerceAtLeast(0)
        val ratio = (room.toFloat() / (avatarBasis + textBasis).coerceAtLeast(1)).coerceAtMost(1f)
        val avatarWidth = (avatarBasis * ratio).roundToInt().coerceIn(0, room)
        val textWidth = minOf(textBasis, room - avatarWidth)
        val avatar = children[0].measure(Constraints.fixed(avatarWidth, avatarBasis))
        val text = children[1].measure(Constraints(minWidth = textWidth, maxWidth = textWidth, maxHeight = constraints.maxHeight))
        val height = maxOf(avatar.height, text.height)
        layout(avatar.width + gap + text.width, height) {
            avatar.placeRelative(0, (height - avatar.height) / 2)
            text.placeRelative(avatar.width + gap, (height - text.height) / 2)
        }
    }
}

@Composable private fun ProfileBadge(text: String, icon: Int, verified: Boolean) {
    val ink = if (verified) Cargo.Accent else Cargo.Ink.copy(alpha = .5f)
    Row(Modifier.background(if (verified) Cargo.Accent.copy(alpha = .15f) else Color.Transparent, CircleShape)
        .border(1.dp, if (verified) Cargo.Accent.copy(alpha = .6f) else Cargo.Line, CircleShape).padding(horizontal = 11.dp, vertical = 5.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(painterResource(icon), null, Modifier.size(12.dp), tint = ink)
        Text(text, style = loanMono(9), color = ink)
    }
}

@Composable private fun ProfileStars(value: Double, size: Int) {
    Row(Modifier.semantics(mergeDescendants = true) { contentDescription = "${profileRating(value)} out of 5" }, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        for (star in 1..5) Icon(painterResource(if (star <= value.roundToInt()) R.drawable.ic_star_filled else R.drawable.ic_star), null,
            Modifier.size(size.dp), tint = if (star <= value.roundToInt()) Cargo.Accent else Cargo.Ink.copy(alpha = .2f))
    }
}

@Composable private fun ProfileReview(review: Review) {
    Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(21.dp).testTag("profile-review-${review.id}")) {
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = reviewArrangement, verticalArrangement = Arrangement.spacedBy(12.dp), itemVerticalAlignment = Alignment.CenterVertically) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                Text(profileText(review.reviewer?.full_name ?: "A student"), style = loanMono(11), color = Cargo.Ink)
                Text(if (review.role == "as_owner") "LENT TO THEM" else "BORROWED FROM THEM", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
            }
            ProfileStars(review.rating.toDouble(), 14)
        }
        review.comment?.takeIf { it.isNotEmpty() }?.let { comment ->
            Text(profileText("“$comment”"), Modifier.padding(top = 12.dp).testTag("profile-comment-${review.id}"),
                style = loanBody(13), color = Cargo.Ink.copy(alpha = .6f))
        }
        Text(loanRelativeTime(review.created_at), Modifier.padding(top = 12.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
    }
}
