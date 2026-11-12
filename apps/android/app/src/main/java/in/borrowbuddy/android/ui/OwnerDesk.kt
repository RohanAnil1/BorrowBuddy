package `in`.borrowbuddy.android.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.*
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.*
import kotlin.math.roundToInt

val OwnerPendingCount = SemanticsPropertyKey<Int>("OwnerPendingCount")
val OwnerListingsCount = SemanticsPropertyKey<Int>("OwnerListingsCount")
val OwnerRecentCount = SemanticsPropertyKey<Int>("OwnerRecentCount")
val OwnerCoverReady = SemanticsPropertyKey<Boolean>("OwnerCoverReady")
val OwnerViewportWidth = SemanticsPropertyKey<Int>("OwnerViewportWidth")
private fun ownerWebText(value: String) = value.replace(Regex("[\\t\\n\\r\\u000C ]+"), " ").trim(' ').uppercase()
private data class OwnerDeskData(val items: List<Item>, val requests: List<BorrowRequest>, val loans: List<Loan>)

@Composable fun MyItemsScreen(repository: BorrowRepository, profile: Profile, openItem: (String) -> Unit,
    openLoan: (String) -> Unit, edit: (String) -> Unit, create: () -> Unit, openUser: (String) -> Unit = {}) {
    val actions = rememberActions()
    val listState = rememberLazyListState()
    var deleteId by rememberSaveable(profile.id) { mutableStateOf<String?>(null) }
    var activeAction by remember { mutableStateOf<String?>(null) }
    val busy = actions.busy || activeAction != null
    fun submit(key: String, mutation: suspend () -> Unit) {
        if (actions.busy || activeAction != null) return
        activeAction = key
        actions.run { try { mutation() } finally { activeAction = null } }
    }
    if (deleteId != null) AlertDialog(onDismissRequest = { deleteId = null }, title = { CargoTitle("Delete listing?") },
        text = { CargoBody("A listing with loan history cannot be deleted. Pause it to hide it from the catalog.") },
        confirmButton = { TextButton({ val id = deleteId!!; deleteId = null; submit("delete-$id") { repository.deleteItem(id, profile.id) } },
            Modifier.testTag("owner-delete-confirm")) { CargoLabel("Delete", Cargo.Warn) } },
        dismissButton = { TextButton({ deleteId = null }) { CargoLabel("Keep listing") } })
    LoadScreen(profile.id, { coroutineScope {
        val items = async { repository.myItems(profile.id) }
        val requests = async { repository.incomingRequests(profile.id) }
        val loans = async { repository.loans(profile.id).filter { it.owner_id == profile.id } }
        OwnerDeskData(items.await(), requests.await(), loans.await())
    } }, refreshKey = actions.revision) { (items, requests, loans) ->
        val pending = requests.filter { it.status == "pending" }
        val recent = requests.filter { it.status != "pending" }.take(8)
        // One reputation lookup per distinct requester, after the desk renders.
        val records by produceState<Map<String, ProfileStats?>>(emptyMap(), pending.map { it.borrower_id }) {
            value = pending.map { it.borrower_id }.distinct().associateWith { repository.reputation(it) }
        }
        val viewport = LocalWindowInfo.current.containerSize.width / LocalDensity.current.density
        val titleSize = (viewport * .06f).coerceIn(40f, 64f)
        val titleStyle = loanBody(40).copy(fontFamily = Cargo.Title, fontSize = titleSize.sp,
            lineHeight = (titleSize * 1.05f).sp, letterSpacing = (titleSize * .01f).sp)
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            LazyColumn(Modifier.widthIn(max = 1152.dp).fillMaxSize().imePadding().testTag("owner-desk")
                .semantics { this[OwnerPendingCount] = pending.size; this[OwnerListingsCount] = items.size; this[OwnerRecentCount] = recent.size; this[OwnerViewportWidth] = viewport.roundToInt() },
                state = listState, contentPadding = PaddingValues(horizontal = if (viewport >= 800) 40.dp else 16.dp, vertical = 32.dp)) {
                item(key = "heading") {
                    FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
                        verticalArrangement = Arrangement.spacedBy(16.dp), itemVerticalAlignment = Alignment.Bottom) {
                        Column {
                            Text("[ LOGBOOK — LENDING ]", style = loanMono(10), color = Cargo.Accent)
                            Text("MY ITEMS", Modifier.padding(top = 12.dp), style = titleStyle, color = Cargo.Ink)
                        }
                        OwnerAction("List an item", create, icon = R.drawable.ic_plus_circle, size = 12, enabled = !busy)
                    }
                    actions.error?.let { error ->
                        Text("[ $error ]", Modifier.padding(top = 24.dp).fillMaxWidth().testTag("owner-action-error")
                            .background(Cargo.Warn.copy(alpha = .1f)).border(1.dp, Cargo.Warn.copy(alpha = .5f))
                            .padding(horizontal = 17.dp, vertical = 13.dp), style = loanMono(10).copy(lineHeight = 20.sp), color = Cargo.Warn)
                    }
                }
                item(key = "pending-heading") {
                    FlowRow(Modifier.padding(top = 40.dp, bottom = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp),
                        itemVerticalAlignment = Alignment.CenterVertically) {
                        Text("[ REQUESTS WAITING ON YOU ]", style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f))
                        if (pending.isNotEmpty()) Text(pending.size.toString(), Modifier.background(Cargo.Accent).padding(horizontal = 8.dp, vertical = 2.dp),
                            style = loanMono(10), color = Cargo.Ink)
                    }
                }
                if (pending.isEmpty()) item(key = "pending-empty") {
                    Text("NO PENDING REQUESTS. REQUESTS EXPIRE AUTOMATICALLY AFTER 48 HOURS.",
                        Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(horizontal = 25.dp, vertical = 33.dp),
                        style = loanMono(10), color = Cargo.Ink.copy(alpha = .5f), textAlign = TextAlign.Center)
                }
                itemsIndexed(pending, key = { _, request -> "request-${request.id}" }) { index, request ->
                    if (index > 0) Spacer(Modifier.height(12.dp))
                    OwnerRequest(request, busy, activeAction, records[request.borrower_id], { openUser(request.borrower_id) },
                        approve = { submit("approve-${request.id}") { repository.rpc("approve_request", buildJsonObject { put("p_request_id", request.id) }) } },
                        decline = { reason -> submit("decline-${request.id}") { repository.rpc("decline_request", buildJsonObject {
                            put("p_request_id", request.id); put("p_reason", reason.trim().takeIf { it.isNotEmpty() }?.let(::JsonPrimitive) ?: JsonNull)
                        }) } })
                }
                item(key = "listings-heading") { OwnerSection("[ YOUR LISTINGS ]") }
                if (items.isEmpty()) item(key = "no-listings") {
                    Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(horizontal = 25.dp, vertical = 49.dp),
                        horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(painterResource(R.drawable.ic_inbox), null, Modifier.size(28.dp), tint = Cargo.Accent)
                        Text("[ NO LISTINGS ]", Modifier.padding(top = 16.dp), style = loanMono(10), color = Cargo.Accent)
                        Text("NOTHING LISTED YET", Modifier.padding(top = 12.dp), style = titleStyle, textAlign = TextAlign.Center, color = Cargo.Ink)
                        Text("ANYTHING YOU OWN AND RARELY USE COULD BE EARNING TRUST ON CAMPUS.", Modifier.padding(top = 12.dp).widthIn(max = 384.dp),
                            style = loanBody(13), textAlign = TextAlign.Center, color = Cargo.Ink.copy(alpha = .6f))
                        Spacer(Modifier.height(32.dp))
                        OwnerAction("List your first item", create, icon = R.drawable.ic_plus_circle, size = 12)
                    }
                }
                itemsIndexed(items, key = { _, item -> "item-${item.id}" }) { index, item ->
                    if (index > 0) Spacer(Modifier.height(12.dp))
                    OwnerListing(repository, item, busy, activeAction,
                        open = { openItem(item.id) }, edit = { edit(item.id) }, delete = { deleteId = item.id },
                        toggle = { submit("status-${item.id}") { repository.setItemStatus(item.id, profile.id, if (item.status == "available") "paused" else "available") } })
                }
                if (recent.isNotEmpty()) item(key = "recent") {
                    OwnerSection("[ RECENT DECISIONS ]")
                    Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(1.dp)) {
                        recent.forEachIndexed { index, request ->
                            if (index > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(Cargo.Line))
                            FlowRow(Modifier.fillMaxWidth().testTag("owner-decision-${request.id}").padding(horizontal = 20.dp, vertical = 16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(12.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                                Text(ownerWebText("${request.borrower?.full_name.orEmpty()} · ${request.item?.title.orEmpty()} · ${loanDateRange(request.start_date, request.end_date)}"),
                                    style = loanBody(13).copy(lineBreak = LineBreak.Paragraph), color = Cargo.Ink.copy(alpha = .7f))
                                RequestBadge(request.status)
                            }
                        }
                    }
                }
                // Retain the existing native owner history below the source page sections.
                if (loans.isNotEmpty()) {
                    item(key = "loans-heading") { OwnerSection("[ LENDING LOGBOOK ]") }
                    itemsIndexed(loans, key = { _, loan -> "loan-${loan.id}" }) { index, loan ->
                        if (index > 0) Spacer(Modifier.height(12.dp))
                        LoanRow(loan, profile.id, openLoan)
                    }
                }
            }
        }
    }
}

@Composable private fun OwnerSection(text: String) {
    Text(text, Modifier.padding(top = 56.dp, bottom = 16.dp), style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f))
}

@Composable private fun OwnerRequest(request: BorrowRequest, busy: Boolean, activeAction: String?, record: ProfileStats?, openProfile: () -> Unit,
    approve: () -> Unit, decline: (String) -> Unit) {
    var reason by rememberSaveable(request.id) { mutableStateOf("") }
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val reduced = rememberReducedMotion()
    val border by animateColorAsState(if (focused) Cargo.Accent else Cargo.Line, tween(if (reduced) 0 else 150), label = "Decline reason focus")
    val keyboard = LocalSoftwareKeyboardController.current
    val focus = LocalFocusManager.current
    val density = LocalDensity.current
    val viewport = LocalWindowInfo.current.containerSize.width / density.density
    val reasonWidth = if (viewport >= 800) 192.dp else (131 * density.fontScale + 34).dp
    FlowRow(Modifier.fillMaxWidth().testTag("incoming-request-${request.id}").background(Cargo.Panel).border(1.dp, Cargo.Line).padding(25.dp),
        horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(Modifier.widthIn(max = 576.dp)) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                Text(ownerWebText(request.borrower?.full_name.orEmpty()), Modifier.testTag("request-profile-${request.id}").clickable(onClick = openProfile)
                    .semantics { contentDescription = "Open ${request.borrower?.full_name.orEmpty()}'s profile" },
                    style = loanBody(15).copy(fontFamily = Cargo.Strong, textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline), color = Cargo.Ink)
                Text("TRUST ${(request.borrower?.trust_score ?: 0.0).roundToInt()}", style = loanMono(9), color = Cargo.Accent)
            }
            record?.let { Text(reputationLine(it, lender = false), Modifier.padding(top = 4.dp), style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f)) }
            Text(ownerWebText("${request.item?.title.orEmpty()} · ${loanDateRange(request.start_date, request.end_date)}"),
                Modifier.padding(top = 4.dp), style = loanMono(9).copy(lineBreak = LineBreak.Paragraph), color = Cargo.Ink.copy(alpha = .5f))
            request.message?.takeIf { it.isNotEmpty() }?.let { message ->
                Text(ownerWebText("“$message”"), Modifier.padding(top = 12.dp).fillMaxWidth().border(1.dp, Cargo.Line).background(Color.Black)
                    .padding(horizontal = 17.dp, vertical = 13.dp), style = loanBody(13), color = Cargo.Ink.copy(alpha = .7f))
            }
            Text("ASKED ${loanRelativeTime(request.created_at)}", Modifier.padding(top = 12.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
        }
        Column(Modifier.width(reasonWidth), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OwnerAction(if (activeAction == "approve-${request.id}") "APPROVING…" else "Approve", approve,
                icon = if (activeAction == "approve-${request.id}") null else R.drawable.ic_check, enabled = !busy)
            BasicTextField(reason, { if (it.length <= 300) reason = it },
                Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics { contentDescription = "Decline reason (optional)" }
                    .background(Color.Black, RoundedCornerShape(8.dp)).border(1.dp, border, RoundedCornerShape(8.dp)).padding(horizontal = 17.dp, vertical = 10.dp),
                enabled = !busy, singleLine = true, textStyle = loanBody(12).copy(color = Cargo.Ink), cursorBrush = SolidColor(Cargo.Accent),
                interactionSource = interaction, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { focus.clearFocus(); keyboard?.hide() }), decorationBox = { inner ->
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
                        if (reason.isEmpty()) Text("Reason (optional)", style = loanBody(12), color = Cargo.Ink.copy(alpha = .4f))
                        inner()
                    }
                })
            OwnerAction(if (activeAction == "decline-${request.id}") "DECLINING…" else "Decline", { focus.clearFocus(); keyboard?.hide(); decline(reason) },
                style = OwnerActionStyle.Danger, enabled = !busy)
        }
    }
}

@Composable private fun OwnerListing(repository: BorrowRepository, item: Item, busy: Boolean, activeAction: String?,
    open: () -> Unit, edit: () -> Unit, delete: () -> Unit, toggle: () -> Unit) {
    var coverReady by remember(item.id, item.images.firstOrNull()) { mutableStateOf(false) }
    val titleInteraction = remember { MutableInteractionSource() }
    val titleHovered by titleInteraction.collectIsHoveredAsState()
    val titleFocused by titleInteraction.collectIsFocusedAsState()
    val titleColor by animateColorAsState(if (titleHovered || titleFocused) Cargo.Accent else Cargo.Ink,
        tween(if (rememberReducedMotion()) 0 else 150), label = "Owner listing title")
    FlowRow(Modifier.fillMaxWidth().testTag("owner-item-${item.id}").background(Cargo.Panel).border(1.dp, Cargo.Line).padding(17.dp),
        horizontalArrangement = Arrangement.spacedBy(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp), itemVerticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.width(260.dp).weight(1f), horizontalArrangement = Arrangement.spacedBy(20.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(80.dp).testTag("owner-cover-${item.id}").semantics { this[OwnerCoverReady] = coverReady }
            .background(Color.Black).clickable(role = Role.Button, onClickLabel = "Open item photo") { open() }) {
            item.images.firstOrNull()?.let { path -> AsyncImage(repository.publicImage(path), item.title, Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop, onSuccess = { coverReady = true }, onError = { coverReady = false }) }
        }
        Column(Modifier.weight(1f)) {
            Text(ownerWebText(item.title), Modifier.fillMaxWidth().testTag("owner-title-${item.id}")
                .clickable(interactionSource = titleInteraction, indication = null, role = Role.Button, onClickLabel = "Open item") { open() },
                style = loanBody(15).copy(fontFamily = Cargo.Strong, lineBreak = LineBreak.Paragraph), color = titleColor)
            FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                val color = when (item.status) { "available" -> Cargo.Accent; "paused" -> Cargo.Warn; else -> Cargo.Ink.copy(alpha = .5f) }
                Text(item.status.uppercase(), Modifier.background(if (item.status == "available") color.copy(alpha = .15f) else if (item.status == "paused") color.copy(alpha = .1f) else Color.Transparent, CircleShape)
                    .border(1.dp, if (item.status in listOf("available", "paused")) color.copy(alpha = if (item.status == "available") .6f else .5f) else Cargo.Line, CircleShape)
                    .padding(horizontal = 10.dp, vertical = 4.dp), style = loanMono(9), color = color)
                Text(if (item.deposit_amount > 0) "${ledgerMoney(item.deposit_amount)} DEPOSIT" else "NO DEPOSIT", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
            }
        }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), itemVerticalAlignment = Alignment.CenterVertically) {
            val statusBusy = activeAction == "status-${item.id}"
            OwnerAction(if (statusBusy) "…" else if (item.status == "available") "Pause" else "Activate", toggle, OwnerActionStyle.Secondary,
                icon = if (statusBusy) null else if (item.status == "available") R.drawable.ic_pause else R.drawable.ic_play, enabled = !busy)
            OwnerAction("Edit", edit, OwnerActionStyle.Secondary, size = 12, enabled = !busy, hoverText = false)
            OwnerAction(if (activeAction == "delete-${item.id}") "…" else "Delete", delete, OwnerActionStyle.Danger,
                icon = if (activeAction == "delete-${item.id}") null else R.drawable.ic_trash, enabled = !busy)
        }
    }
}

private enum class OwnerActionStyle { Primary, Secondary, Danger }
@Composable private fun OwnerAction(text: String, click: () -> Unit, style: OwnerActionStyle = OwnerActionStyle.Primary,
    icon: Int? = null, size: Int = 13, enabled: Boolean = true, hoverText: Boolean = true) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val focused by interaction.collectIsFocusedAsState()
    val highlighted = enabled && (hovered || focused)
    val duration = if (rememberReducedMotion()) 0 else 150
    val foreground by animateColorAsState(when { style == OwnerActionStyle.Danger -> Cargo.Warn; style == OwnerActionStyle.Secondary && highlighted && hoverText -> Cargo.Accent; else -> Cargo.Ink }, tween(duration), label = "Owner action text")
    val border by animateColorAsState(when (style) { OwnerActionStyle.Primary -> Cargo.Accent; OwnerActionStyle.Danger -> Cargo.Warn.copy(alpha = .6f); OwnerActionStyle.Secondary -> if (highlighted) Cargo.Accent else Cargo.Line }, tween(duration), label = "Owner action border")
    val background by animateColorAsState(when { style == OwnerActionStyle.Primary -> Cargo.Accent; style == OwnerActionStyle.Danger && highlighted -> Cargo.Warn.copy(alpha = .1f); else -> Color.Transparent }, tween(duration), label = "Owner action background")
    val alpha by animateFloatAsState(if (!enabled) .6f else if (style == OwnerActionStyle.Primary && highlighted) .9f else 1f, tween(duration), label = "Owner action opacity")
    Row(Modifier.heightIn(min = 48.dp).graphicsLayer { this.alpha = alpha }.background(background, RoundedCornerShape(8.dp))
        .border(1.dp, border, RoundedCornerShape(8.dp)).clickable(interactionSource = interaction, indication = null, enabled = enabled, role = Role.Button, onClick = click)
        .padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        icon?.let { Icon(painterResource(it), null, Modifier.size(if (it in listOf(R.drawable.ic_pause, R.drawable.ic_play, R.drawable.ic_trash)) 14.dp else 16.dp), tint = foreground) }
        Text(text.uppercase(), style = loanBody(size).copy(fontFamily = Cargo.Strong, letterSpacing = (size * .04f).sp), color = foreground)
    }
}
