package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

private data class BorrowLogbookData(val loans: List<Loan>, val requests: List<BorrowRequest>, val waitlist: List<WaitlistEntry>)

@Composable fun BorrowsScreen(repository: BorrowRepository, profile: Profile, openLoan: (String) -> Unit,
    openItem: (String) -> Unit, browse: () -> Unit) {
    val actions = rememberActions()
    val listState = rememberLazyListState()
    LoadScreen(profile.id, {
        BorrowLogbookData(repository.loans(profile.id), repository.outgoingRequests(profile.id), repository.waitlist(profile.id))
    }, refreshKey = actions.revision) { (allLoans, requests, waitlist) ->
        val borrowed = allLoans.filter { it.borrower_id == profile.id }
        val active = borrowed.filter { it.status in Rules.activeStatuses }
        val history = borrowed.filter { it.status !in Rules.activeStatuses }.take(6)
        val lending = allLoans.filter { it.owner_id == profile.id && it.status in Rules.activeStatuses }
        val pending = requests.filter { it.status == "pending" }
        val recent = requests.filter { it.status != "pending" }.take(6)
        val viewport = LocalWindowInfo.current.containerSize.width / LocalDensity.current.density
        val titleSize = (viewport * .06f).coerceIn(40f, 64f)
        val titleStyle = loanBody(40).copy(fontFamily = Cargo.Title, fontSize = titleSize.sp,
            lineHeight = (titleSize * 1.05f).sp, letterSpacing = (titleSize * .01f).sp)
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            LazyColumn(Modifier.widthIn(max = 1024.dp).fillMaxSize().imePadding().testTag("borrow-logbook"),
                state = listState,
                contentPadding = PaddingValues(horizontal = if (viewport >= 800) 40.dp else 16.dp, vertical = 32.dp)) {
                item(key = "heading") {
                    Text("[ LOGBOOK — BORROWED ]", style = loanMono(10), color = Cargo.Accent)
                    Text("MY BORROWS", Modifier.padding(top = 12.dp), style = titleStyle, color = Cargo.Ink)
                    ActionFeedback(actions)
                }
                item(key = "active-heading") { SectionHeading("[ ACTIVE LOANS ]", 40) }
                if (active.isEmpty()) item(key = "no-active") { EmptyLogbookRow("[ NOTHING BORROWED RIGHT NOW ]") }
                itemsIndexed(active, key = { _, loan -> "borrow-${loan.id}" }) { index, loan ->
                    if (index > 0) Spacer(Modifier.height(12.dp))
                    BorrowedLoanRow(loan, "FROM ${loan.owner?.full_name.orEmpty()} · ${loanDateRange(loan.start_date, loan.due_date)}", openLoan)
                }
                item(key = "requests-heading") { SectionHeading("[ YOUR REQUESTS ]", 56) }
                if (pending.isEmpty()) item(key = "no-pending") { EmptyLogbookRow("NO PENDING REQUESTS. REQUESTS AUTO-EXPIRE AFTER 48 HOURS.") }
                itemsIndexed(pending, key = { _, request -> "request-${request.id}" }) { index, request ->
                    if (index > 0) Spacer(Modifier.height(12.dp))
                    LogbookRow(Modifier.testTag("outgoing-request-${request.id}")) {
                        Column {
                            Text(request.item?.title.orEmpty().uppercase(), style = loanBody(15).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
                            Text("${loanDateRange(request.start_date, request.end_date)} · ASKED ${loanRelativeTime(request.created_at)}".uppercase(),
                                Modifier.padding(top = 4.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                        }
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                            RequestBadge(request.status)
                            CargoButton(if (actions.busy) "…" else "Cancel", { actions.run {
                                repository.rpc("cancel_request", buildJsonObject { put("p_request_id", request.id) })
                            } }, enabled = !actions.busy, secondary = true, modifier = Modifier.testTag("cancel-request-${request.id}"))
                        }
                    }
                }
                if (lending.isNotEmpty()) {
                    item(key = "lending-heading") { SectionHeading("[ YOUR ITEMS OUT ON LOAN ]", 56) }
                    itemsIndexed(lending, key = { _, loan -> "lending-${loan.id}" }) { index, loan ->
                        if (index > 0) Spacer(Modifier.height(12.dp))
                        BorrowedLoanRow(loan, "WITH ${loan.borrower?.full_name.orEmpty()} · DUE ${loanDateRange(loan.due_date, loan.due_date)}", openLoan)
                    }
                }
                if (waitlist.isNotEmpty()) {
                    item(key = "waitlist-heading") { SectionHeading("[ WAITING FOR THESE ]", 56) }
                    itemsIndexed(waitlist, key = { _, entry -> "waitlist-${entry.id}" }) { index, entry ->
                        if (index > 0) Spacer(Modifier.height(12.dp))
                        LogbookRow(Modifier.testTag("waitlist-${entry.id}")) {
                            Column {
                                Text((entry.item?.title ?: "Item").uppercase(), Modifier.clickable { openItem(entry.item_id) },
                                    style = loanBody(15).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
                                Text("${loanDateRange(entry.desired_start, entry.desired_end)} · ${if (entry.status == "notified") "DATES JUST OPENED UP" else "STILL BOOKED"}".uppercase(),
                                    Modifier.padding(top = 4.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                            }
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                                RequestBadge(entry.status, waitlist = true)
                                CargoButton(if (actions.busy) "…" else "Leave", { actions.run {
                                    repository.rpc("leave_waitlist", buildJsonObject { put("p_entry_id", entry.id) })
                                } }, enabled = !actions.busy, secondary = true, modifier = Modifier.testTag("leave-waitlist-${entry.id}"))
                            }
                        }
                    }
                }
                if (recent.isNotEmpty()) {
                    item(key = "recent") {
                        SectionHeading("[ RECENT REQUESTS ]", 56)
                        Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line)) {
                            recent.forEachIndexed { index, request ->
                                CompactLogbookRow("${request.item?.title.orEmpty()} · ${loanDateRange(request.start_date, request.end_date)}", index > 0) { RequestBadge(request.status) }
                            }
                        }
                    }
                }
                if (history.isNotEmpty()) item(key = "history") {
                    SectionHeading("[ HISTORY ]", 56)
                    Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line)) {
                        history.forEachIndexed { index, loan ->
                            CompactLogbookRow("${loan.item?.title.orEmpty()} · ${loanDateRange(loan.start_date, loan.due_date)}", index > 0,
                                Modifier.testTag("loan-${loan.id}").clickable { openLoan(loan.id) }) { LoanStatusBadge(loan.status) }
                        }
                    }
                }
                if (borrowed.isEmpty() && requests.isEmpty()) item(key = "empty-shelf") {
                    Column(Modifier.padding(top = 40.dp).fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line)
                        .padding(horizontal = 25.dp, vertical = 49.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(painterResource(R.drawable.ic_package_open), null, Modifier.size(28.dp), tint = Cargo.Accent)
                        Text("[ NO BORROWS ]", Modifier.padding(top = 16.dp), style = loanMono(10), color = Cargo.Accent)
                        Text("NO BORROWS YET", Modifier.padding(top = 12.dp), style = titleStyle, color = Cargo.Ink, textAlign = TextAlign.Center)
                        Text("REQUEST A PROJECTOR FOR MOVIE NIGHT, A CAMERA FOR A TRIP, A FAN FOR THE SUMMER.",
                            Modifier.padding(top = 12.dp).widthIn(max = 384.dp), style = loanBody(13), color = Cargo.Ink.copy(alpha = .6f), textAlign = TextAlign.Center)
                        CargoButton("Find something to borrow", browse, modifier = Modifier.padding(top = 32.dp).testTag("logbook-browse"))
                    }
                }
                item(key = "fine-policy") {
                    Column(Modifier.padding(top = 56.dp).fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(25.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(painterResource(R.drawable.ic_calendar_clock), null, Modifier.size(16.dp), tint = Cargo.Accent)
                            Text("[ OVERDUE LOANS ACCRUE A ₹20/DAY FINE, CAPPED AT ₹1,000 ]", style = loanMono(10), color = Cargo.Ink)
                        }
                        Text("FINES ARE TRACKED HERE AND SETTLED IN PERSON. BORROWBUDDY NEVER TAKES A CUT.", Modifier.padding(top = 8.dp),
                            style = loanBody(12), color = Cargo.Ink.copy(alpha = .5f))
                    }
                }
            }
        }
    }
}

@Composable private fun SectionHeading(text: String, top: Int) {
    Text(text, Modifier.padding(top = top.dp, bottom = 16.dp), style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f))
}
@Composable private fun EmptyLogbookRow(text: String) {
    Text(text, Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(horizontal = 25.dp, vertical = 33.dp),
        style = loanMono(10), color = Cargo.Ink.copy(alpha = .5f), textAlign = TextAlign.Center)
}
@Composable private fun LogbookRow(modifier: Modifier = Modifier, border: Color = Cargo.Line, content: @Composable FlowRowScope.() -> Unit) {
    FlowRow(modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, border).padding(21.dp),
        horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(16.dp),
        itemVerticalAlignment = Alignment.CenterVertically, content = content)
}
@Composable private fun BorrowedLoanRow(loan: Loan, subtitle: String, open: (String) -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val focused by interaction.collectIsFocusedAsState()
    LogbookRow(Modifier.testTag("loan-${loan.id}").clickable(interactionSource = interaction, indication = null) { open(loan.id) },
        border = if (hovered || focused) Cargo.Accent else Cargo.Line) {
        Column {
            Text(loan.item?.title.orEmpty().uppercase(), style = loanBody(15).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
            Text(subtitle.uppercase(), Modifier.padding(top = 4.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
        }
        LoanStatusBadge(loan.status)
    }
}
@Composable private fun CompactLogbookRow(text: String, divider: Boolean, modifier: Modifier = Modifier, badge: @Composable () -> Unit) {
    Column(modifier.fillMaxWidth()) {
        if (divider) Box(Modifier.fillMaxWidth().height(1.dp).background(Cargo.Line))
        FlowRow(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 16.dp), horizontalArrangement = Arrangement.SpaceBetween,
            verticalArrangement = Arrangement.spacedBy(12.dp), itemVerticalAlignment = Alignment.CenterVertically) {
            Text(text.uppercase(), style = loanBody(13), color = Cargo.Ink.copy(alpha = .7f))
            badge()
        }
    }
}
@Composable internal fun RequestBadge(status: String, waitlist: Boolean = false) {
    val (foreground, border, background) = when (status) {
        "pending", "waiting" -> Triple(Cargo.Ink, Cargo.Ink.copy(alpha = .5f), Color.Black)
        "approved", "notified" -> Triple(Cargo.Accent, Cargo.Accent.copy(alpha = .6f), Cargo.Accent.copy(alpha = .15f))
        "declined" -> Triple(Cargo.Warn, Cargo.Warn, Cargo.Warn.copy(alpha = .2f))
        "expired" -> Triple(Cargo.Warn, Cargo.Warn.copy(alpha = .5f), Cargo.Warn.copy(alpha = .1f))
        "cancelled" -> Triple(Cargo.Ink.copy(alpha = .5f), Cargo.Line, Color.Transparent)
        else -> Triple(Cargo.Ink.copy(alpha = .7f), Cargo.Line, Cargo.Panel)
    }
    Row(Modifier.background(background, CircleShape).border(1.dp, border, CircleShape).padding(horizontal = 10.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        if (waitlist) Icon(painterResource(R.drawable.ic_hourglass), null, Modifier.size(12.dp), tint = foreground)
        Text(status.uppercase(), style = loanMono(9), color = foreground)
    }
}
