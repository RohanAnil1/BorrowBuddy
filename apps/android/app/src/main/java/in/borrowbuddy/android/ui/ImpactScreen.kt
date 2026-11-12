package `in`.borrowbuddy.android.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.data.BuddyMood
import `in`.borrowbuddy.android.domain.ImpactCategory
import `in`.borrowbuddy.android.domain.ImpactStats
import `in`.borrowbuddy.android.domain.Profile
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

/** Indian digit grouping (1,25,000) done by hand, so it never depends on the device's locale data. */
internal fun indianGroup(value: Long): String {
    val digits = kotlin.math.abs(value).toString()
    val sign = if (value < 0) "-" else ""
    if (digits.length <= 3) return sign + digits
    val head = digits.dropLast(3)
    val pairs = head.reversed().chunked(2).joinToString(",").reversed()
    return "$sign$pairs,${digits.takeLast(3)}"
}
internal fun impactNumber(value: Long, money: Boolean) = if (money) "₹${indianGroup(value)}" else indianGroup(value)

/** Counts up once to its value; static under reduced motion. */
@Composable private fun CountUp(value: Long, money: Boolean, style: androidx.compose.ui.text.TextStyle, color: androidx.compose.ui.graphics.Color) {
    val reduced = rememberReducedMotion()
    val progress = remember { Animatable(if (reduced) 1f else 0f) }
    LaunchedEffect(value, reduced) {
        if (reduced) progress.snapTo(1f) else { progress.snapTo(0f); progress.animateTo(1f, tween(1100, easing = CubicBezierEasing(.16f, 1f, .3f, 1f))) }
    }
    Text(impactNumber((value * progress.value).toLong(), money), Modifier.semantics { contentDescription = impactNumber(value, money) }, style = style, color = color)
}

@Composable private fun StatTile(label: String, value: Long, hint: String, modifier: Modifier = Modifier, money: Boolean = false, hero: Boolean = false) {
    Column(modifier.fillMaxHeight().background(Cargo.Panel).border(1.dp, if (hero) Cargo.Accent.copy(alpha = .6f) else Cargo.Line).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label.uppercase(), style = loanMono(10), color = Cargo.Ink.copy(alpha = .7f))
        CountUp(value, money, loanBody(if (hero) 40 else 30).copy(fontFamily = Cargo.Title, lineHeight = (if (hero) 40 else 30).sp), if (hero) Cargo.Accent else Cargo.Ink)
        Text(hint, style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f))
    }
}

@Composable private fun TileRow(content: @Composable RowScope.() -> Unit) {
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp), content = content)
}

/**
 * Estimated savings per category: one series, so one colour and no legend,
 * value at the bar tip, loans and days on tap, and a table view.
 */
@Composable private fun CategoryBars(categories: List<ImpactCategory>) {
    var table by remember { mutableStateOf(false) }
    var active by remember { mutableStateOf<String?>(null) }
    val max = (categories.maxOfOrNull { it.saved } ?: 1L).coerceAtLeast(1L)
    Column(Modifier.fillMaxWidth().testTag("impact-categories").background(Cargo.Panel).border(1.dp, Cargo.Line).padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Estimated savings by category", Modifier.weight(1f), style = loanBody(13), color = Cargo.Ink.copy(alpha = .75f))
            Text(if (table) "SHOW CHART" else "SHOW AS TABLE", Modifier.clickable { table = !table }.padding(8.dp), style = loanMono(9), color = Cargo.Accent)
        }
        if (table) {
            Row(Modifier.fillMaxWidth()) {
                listOf("CATEGORY" to 2f, "LOANS" to 1f, "DAYS" to 1f, "SAVED" to 1.3f).forEach { (head, weight) ->
                    Text(head, Modifier.weight(weight), style = loanMono(9), color = Cargo.Ink.copy(alpha = .55f))
                }
            }
            categories.forEach { category ->
                Row(Modifier.fillMaxWidth().border(1.dp, Cargo.Line).padding(vertical = 8.dp, horizontal = 4.dp)) {
                    Text(category.name, Modifier.weight(2f), style = loanBody(12), color = Cargo.Ink)
                    Text(indianGroup(category.loans), Modifier.weight(1f), style = loanBody(12), color = Cargo.Ink)
                    Text(indianGroup(category.days), Modifier.weight(1f), style = loanBody(12), color = Cargo.Ink)
                    Text(impactNumber(category.saved, true), Modifier.weight(1.3f), style = loanBody(12), color = Cargo.Ink)
                }
            }
        } else categories.forEach { category ->
            val selected = active == category.slug
            Column(Modifier.fillMaxWidth().clickable { active = if (selected) null else category.slug }
                .semantics { contentDescription = "${category.name}: ${category.loans} loans, ${category.days} days, about ${impactNumber(category.saved, true)} saved" }) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(category.name, Modifier.width(110.dp), style = loanBody(12), color = Cargo.Ink.copy(alpha = .8f), maxLines = 1)
                    BoxWithConstraints(Modifier.weight(1f)) {
                        val track = maxWidth - 72.dp
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Box(Modifier.width(track * (category.saved.toFloat() / max).coerceAtLeast(.02f)).height(18.dp)
                                .background(Cargo.Accent.copy(alpha = if (active != null && !selected) .4f else 1f), RoundedCornerShape(topEnd = 4.dp, bottomEnd = 4.dp)))
                            Text(impactNumber(category.saved, true), style = loanBody(11), color = Cargo.Ink.copy(alpha = .8f))
                        }
                    }
                }
                if (selected) Text("${category.loans} ${if (category.loans == 1L) "loan" else "loans"} · ${category.days} ${if (category.days == 1L) "day" else "days"}",
                    Modifier.padding(start = 120.dp, top = 4.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .7f))
            }
        }
    }
}

/** Campus Impact: what sharing saved, campus-wide and for this student. */
@Composable fun ImpactScreen(repository: BorrowRepository, profile: Profile, open: (String) -> Unit) {
    LoadScreen(profile.id, { coroutineScope {
        val campus = async { repository.impact("campus") }; val mine = async { repository.impact("me") }
        campus.await() to mine.await()
    } }) { (campus, mine) ->
        LazyColumn(Modifier.fillMaxSize().testTag("impact-scroll"), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item(key = "intro") {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
                    Column(Modifier.weight(1f)) {
                        Text("[ CAMPUS IMPACT ]", style = loanMono(10), color = Cargo.Accent)
                        Text("WHAT SHARING SAVED US", Modifier.padding(top = 8.dp), style = loanBody(36).copy(fontFamily = Cargo.Title, lineHeight = 38.sp), color = Cargo.Ink)
                        Text("Every borrow is something nobody had to buy or rent.", Modifier.padding(top = 8.dp), style = loanBody(13), color = Cargo.Ink.copy(alpha = .75f))
                    }
                    ParcelMascot(BuddyMood.Happy, 72.dp, interactive = false, description = null)
                }
            }
            if (campus == null || mine == null) {
                item(key = "unavailable") { ParcelEmpty(BuddyMood.Confused, "SIGNAL LOST", "Impact is warming up", "The impact numbers couldn't load right now. Pull to refresh in a minute.") }
                return@LazyColumn
            }
            item(key = "campus") { CampusTiles(campus) }
            if (campus.categories.isNotEmpty()) item(key = "bars") { CategoryBars(campus.categories) }
            item(key = "mine") { MyShare(profile, mine, open) }
            item(key = "footnote") {
                Text("How the estimate works: each completed loan counts its days out (pickup to return) times a rough daily rental value for its category. Only returned loans count. It's a ballpark, not an exact number.",
                    Modifier.padding(top = 8.dp), style = loanBody(12).copy(lineHeight = 18.sp), color = Cargo.Ink.copy(alpha = .55f))
            }
        }
    }
}

@Composable private fun CampusTiles(campus: ImpactStats) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("CAMPUS SO FAR", style = loanMono(11), color = Cargo.Ink.copy(alpha = .75f))
        Text(if (campus.completed_loans == 0L) "No loans have come back yet. The first one starts the count."
            else "${campus.completed_loans} completed ${if (campus.completed_loans == 1L) "loan" else "loans"} between ${campus.lenders} ${if (campus.lenders == 1L) "lender" else "lenders"} and ${campus.borrowers} ${if (campus.borrowers == 1L) "borrower" else "borrowers"}.",
            style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f))
        StatTile("Est. money saved", campus.money_saved, "Rental value of the days things were borrowed. An estimate, see below.", Modifier.fillMaxWidth(), money = true, hero = true)
        TileRow {
            StatTile("Completed loans", campus.completed_loans, "Returned and done", Modifier.weight(1f))
            StatTile("Borrow-days", campus.borrow_days, "Days items spent with a borrower", Modifier.weight(1f))
        }
        TileRow {
            StatTile("Items shared", campus.items_shared, "Different items lent out", Modifier.weight(1f))
            StatTile("Deposits kept safe", campus.deposits_returned, "Returned without damage or loss", Modifier.weight(1f), money = true)
        }
        if (campus.rehomed > 0) Text("Plus ${campus.rehomed} ${if (campus.rehomed == 1L) "thing" else "things"} found or given away through Campus.",
            style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f))
    }
}

@Composable private fun MyShare(profile: Profile, mine: ImpactStats, open: (String) -> Unit) {
    Column(Modifier.padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("${profile.full_name.substringBefore(' ').uppercase()}'S SHARE", style = loanMono(11), color = Cargo.Ink.copy(alpha = .75f))
        if (mine.completed_loans == 0L) ParcelEmpty(BuddyMood.Wave, "NO TALLY YET", "Your counter is at zero",
            "Your numbers start with your first returned loan, whether you lend or borrow.") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                CargoButton("List an item", { open("items/new") })
                CargoButton("Browse", { open("home") }, secondary = true)
            }
        } else {
            TileRow {
                StatTile("You saved", mine.borrowed_saved, "${mine.borrowed_loans} ${if (mine.borrowed_loans == 1L) "loan" else "loans"} borrowed", Modifier.weight(1f), money = true)
                StatTile("Days borrowed", mine.borrowed_days, "Days you had something you didn't buy", Modifier.weight(1f))
            }
            TileRow {
                StatTile("You saved others", mine.lent_saved, "${mine.lent_loans} ${if (mine.lent_loans == 1L) "loan" else "loans"} lent", Modifier.weight(1f), money = true)
                StatTile("Students helped", mine.students_helped, "Different students who borrowed from you", Modifier.weight(1f))
            }
        }
    }
}
