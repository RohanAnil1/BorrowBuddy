package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.ui.semantics.*
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.repeatOnLifecycle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.CachePolicy
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import kotlinx.serialization.json.*
import java.time.Instant
import java.util.UUID

internal fun campusSection(kind: String) = if (kind == "found") "lost-found" else "giveaways"
internal fun campusPath(post: CampusPost) = "campus/${campusSection(post.kind)}/${post.id}"
internal fun campusData(id: String, reason: String? = null) = buildJsonObject { put("id", id); reason?.let { put("reason", it.trim()) } }

@Composable internal fun CampusPage(title: String, label: String = "CAMPUS COMMONS", open: (String) -> Unit,
    content: @Composable ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        Column(Modifier.widthIn(max = 1152.dp).fillMaxSize().imePadding().verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 28.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            CargoLabel("[ $label ]")
            Text(title.uppercase(), Modifier.semantics { heading() }, style = MaterialTheme.typography.displayLarge)
            CampusNav(open)
            content()
        }
    }
}
@Composable internal fun CampusNav(open: (String) -> Unit) {
    FlowRow(Modifier.testTag("campus-navigation"), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf("campus" to "Commons", "campus/lost-found" to "Lost & Found", "campus/giveaways" to "Giveaways",
            "campus/activity" to "My activity", "campus/handovers" to "Handovers").forEach { (path, label) ->
            CampusButton(label, { open(path) }, secondary = true)
        }
    }
}
@Composable internal fun CampusCopy(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier, style = MaterialTheme.typography.bodyLarge, color = Cargo.Ink.copy(alpha = .75f))
}
@Composable internal fun CampusSplit(primary: @Composable ColumnScope.() -> Unit, secondary: @Composable ColumnScope.() -> Unit) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        if (maxWidth >= 900.dp) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            Column(Modifier.weight(1.4f), verticalArrangement = Arrangement.spacedBy(20.dp), content = primary)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(20.dp), content = secondary)
        } else Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(20.dp)) { primary(); secondary() }
    }
}
@Composable internal fun CampusEmpty(title: String, body: String) { CargoPanel { CargoTitle(title); CampusCopy(body) } }

@Composable fun CampusHomeScreen(repository: BorrowRepository, profile: Profile, open: (String) -> Unit) {
    CampusPage("Good things find their way back.", open = open) {
        CampusCopy("Found it? Return it. Finished with it? Pass it on. A shared corner for your campus.")
        listOf(Triple("Lost & Found", "A careful check. A safe return. Send identifying details privately to campus admins.", "lost-found"),
            Triple("Semester Giveaway Shelf", "Free books, stationery and hostel essentials. Reserve only what you can collect in time.", "giveaways"),
            Triple("Handover hours", "Publish availability and book a campus pickup or return. Existing handover codes still work without a booking.", "handovers")).forEach { (title, body, route) ->
            CargoPanel(Modifier.clickable { open("campus/$route") }, padding = 24.dp) {
                CargoLabel("[ ${if (route == "giveaways") "PASS IT FORWARD" else if (route == "lost-found") "BACK TO ITS OWNER" else "LESS BACK-AND-FORTH"} ]")
                CargoTitle(title); CampusCopy(body); CampusButton("Explore →", { open("campus/$route") })
            }
        }
        if (profile.is_admin) CampusButton("Admin claim review", { open("campus/admin") }, secondary = true)
    }
}

@Composable fun CampusFeedScreen(repository: BorrowRepository, profile: Profile, kind: String, open: (String) -> Unit) {
    var query by rememberSaveable(kind) { mutableStateOf("") }
    var submitted by rememberSaveable(kind) { mutableStateOf("") }
    var status by rememberSaveable(kind) { mutableStateOf("open") }
    var category by rememberSaveable(kind) { mutableStateOf("") }
    var page by rememberSaveable(kind) { mutableIntStateOf(0) }
    var location by rememberSaveable(kind) { mutableStateOf("") }
    var locationFilter by rememberSaveable(kind) { mutableStateOf("") }
    var found by rememberSaveable(kind) { mutableStateOf("") }
    LoadScreen(listOf(kind, submitted, status, category, page, locationFilter, found), {
        repository.campus.postPage(kind, submitted, status, category, page = page, location = locationFilter, found = found) to repository.categories()
    }) { (result, categories) ->
        val posts = result.posts
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val columns = if (maxWidth >= 900.dp) 3 else if (maxWidth >= 600.dp) 2 else 1
            LazyVerticalGrid(GridCells.Fixed(columns), Modifier.fillMaxSize().testTag("campus-feed"), contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                item(span = { GridItemSpan(maxLineSpan) }) { Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    CargoLabel("[ CAMPUS COMMONS ]"); CargoTitle(if (kind == "found") "Lost & Found" else "Semester Giveaway Shelf")
                    CampusNav(open)
                    CampusButton(if (kind == "found") "Post a found item" else "Give something away", { open("campus/${campusSection(kind)}/new") })
                    CargoField("Search this board", query, { query = it.take(100) })
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        CampusButton("Search", { submitted = query; locationFilter = location; page = 0 })
                        CampusButton("Clear filters", { query = ""; submitted = ""; status = "open"; category = ""; location = ""; locationFilter = ""; found = ""; page = 0 }, secondary = true)
                    }
                    CargoChoice("Status", status, listOf("" to "All statuses", "open" to "Open", "reserved" to "Reserved", "completed" to "Completed")) { status = it; page = 0 }
                    CargoChoice("Category", category, listOf("" to "All categories") + categories.map { it.id to it.name }) { category = it; page = 0 }
                    CargoField("Approximate location", location, { location = it.take(100); page = 0 })
                    if (kind == "found") {
                        CampusDateField("Date found", found.ifBlank { "Any date" }) { found = it; page = 0 }
                        if (found.isNotBlank()) CampusButton("Clear found date", { found = ""; page = 0 }, secondary = true)
                    }
                    CargoLabel("${result.count} POSTS · PAGE ${page + 1}")
                } }
                if (posts.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) {
                    CampusEmpty("Nothing here yet", "Try another search or share the first item on this board.")
                }
                items(posts, key = { it.id }) { post -> CargoPanel(Modifier.testTag("campus-post-${post.id}").clickable { open(campusPath(post)) }, padding = 0.dp) {
                    CampusPhoto(repository, post.images.firstOrNull(), post.title, Modifier.fillMaxWidth().aspectRatio(4f / 3))
                    Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        StatusBadge(post.status); CargoTitle(post.title); CampusCopy(post.location)
                        CargoLabel(if (kind == "found") "FOUND ${post.found_on}" else "FREE · ${post.condition} · ${post.hold_hours}H HOLD")
                        CampusButton("View item →", { open(campusPath(post)) }, secondary = true)
                    }
                } }
                item(span = { GridItemSpan(maxLineSpan) }) { FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (page > 0) CampusButton("Previous page", { page-- }, secondary = true)
                    CargoLabel("PAGE ${page + 1}", modifier = Modifier.padding(16.dp))
                    if ((page + 1) * 24 < result.count) CampusButton("Next page", { page++ }, secondary = true)
                } }
            }
        }
    }
}

@Composable internal fun CampusPhoto(repository: BorrowRepository, path: String?, title: String, modifier: Modifier) {
    var url by remember(path) { mutableStateOf<String?>(null) }
    var error by remember(path) { mutableStateOf(false) }
    var retry by remember(path) { mutableIntStateOf(0) }
    val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(path, retry, lifecycle) {
        if (path != null) lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.STARTED) {
            while (true) {
                try { error = false; url = repository.campus.photoUrl(path) }
                catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
                catch (_: Exception) { error = true }
                kotlinx.coroutines.delay(4 * 60_000L)
            }
        }
    }
    Box(modifier.background(Cargo.Deep), contentAlignment = Alignment.Center) {
        if (error) CampusButton("Retry photo", { retry++ }, secondary = true)
        else if (url != null) AsyncImage(ImageRequest.Builder(LocalContext.current).data(url)
            .memoryCachePolicy(CachePolicy.DISABLED).diskCachePolicy(CachePolicy.DISABLED).build(), title,
            Modifier.fillMaxSize(), contentScale = ContentScale.Fit, onError = { error = true })
        else if (path != null) CircularProgressIndicator(Modifier.size(24.dp), color = Cargo.Accent)
    }
}

private data class CampusDetail(val post: CampusPost, val claims: List<CampusClaim>, val transfers: List<CampusTransfer>, val notes: String?, val owner: Profile?)
@Composable private fun CampusGallery(repository: BorrowRepository, post: CampusPost, selected: Int, select: (Int) -> Unit) {
    var expanded by rememberSaveable(post.id) { mutableStateOf(false) }
    val index = selected.coerceIn(0, (post.images.size - 1).coerceAtLeast(0))
    Box(Modifier.clickable(onClickLabel = "Open full-size photo") { expanded = true }) {
        CampusPhoto(repository, post.images.getOrNull(index), post.title, Modifier.fillMaxWidth().heightIn(max = 420.dp).aspectRatio(4f / 3))
    }
    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        itemsIndexed(post.images, key = { number, path -> "$number:$path" }) { number, path ->
            Box(Modifier.size(80.dp).border(2.dp, if (index == number) Cargo.Accent else Cargo.Line)
                .semantics { contentDescription = "Photo ${number + 1} of ${post.images.size}"; this.selected = index == number }
                .clickable { select(number) }) { CampusPhoto(repository, path, "", Modifier.fillMaxSize()) }
        }
    }
    if (expanded) Dialog(onDismissRequest = { expanded = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(Cargo.Panel).safeDrawingPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            CampusButton("Close gallery", { expanded = false }, secondary = true)
            CampusPhoto(repository, post.images.getOrNull(index), post.title, Modifier.fillMaxWidth().weight(1f))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CampusButton("Previous photo", { select((index - 1 + post.images.size) % post.images.size) }, enabled = post.images.size > 1, secondary = true)
                CargoLabel("${index + 1} / ${post.images.size}")
                CampusButton("Next photo", { select((index + 1) % post.images.size) }, enabled = post.images.size > 1, secondary = true)
            }
        }
    }
}
@Composable fun CampusPostScreen(repository: BorrowRepository, profile: Profile, id: String, open: (String) -> Unit) {
    val actions = rememberActions()
    var evidence by rememberSaveable(id) { mutableStateOf("") }
    var photo by rememberSaveable(id) { mutableIntStateOf(0) }
    LoadScreen(id, {
        val post = repository.campus.post(id) ?: error("Post unavailable.")
        CampusDetail(post, if (post.kind == "found") repository.campus.claims(post = id) else emptyList(), repository.campus.transfers(profile.id),
            if (post.kind == "found" && (post.owner_id == profile.id || profile.is_admin)) repository.campus.notes(id) else null, repository.publicProfile(post.owner_id))
    }, actions.revision) { data ->
        val post = data.post
        val own = post.owner_id == profile.id
        val mine = data.claims.filter { it.claimant_id == profile.id }
        val transfer = data.transfers.find { it.post_id == id && it.active() }
        CampusPage(post.title, if (post.kind == "found") "FOUND ON CAMPUS" else "FREE TO A GOOD HOME", open) {
            CampusCopy("${post.location} · ${data.owner?.full_name ?: "Campus member"}")
            CampusSplit(primary = {
            CampusGallery(repository, post, photo) { photo = it }
            CargoPanel {
                StatusBadge(post.status); CampusCopy(post.description)
                CargoLabel(if (post.kind == "found") "FOUND ${post.found_on}" else "${post.condition} · NO PAYMENT · NO RETURN REQUIRED")
            }
            }, secondary = {
            CargoPanel {
                CargoTitle(if (transfer != null) "Your collection is ready" else if (own) "Your campus post" else if (post.kind == "found") "Does this belong to you?" else "Make it yours. Pass it forward.")
                if (transfer != null) CampusButton("Open private collection →", { open("campus/collections/${transfer.id}") })
                else if (!own && post.status == "open" && post.kind == "giveaway") {
                    CampusCopy("The first eligible request reserves this giveaway for ${post.hold_hours} hours. Messaging or booking does not extend the hold.")
                    CampusCopy("If reserved now, collect by approximately ${CampusRules.date(Instant.now().plusSeconds(post.hold_hours * 3600L).toString())}. Your confirmed deadline appears after server success.")
                    CampusConfirm("Reserve this giveaway", "Reserve only if you can collect within ${post.hold_hours} hours.", actions, primary = true) {
                        val result = repository.campus.action("reserve", campusData(id))
                        open("campus/collections/${result.getValue("id").jsonPrimitive.content}")
                    }
                } else if (!own && post.status == "open" && post.kind == "found" && mine.none { it.status == "pending" }) {
                    CampusCopy("Only you and campus admins can read your evidence. Include contents, markings or details absent from the photos.")
                    CargoField("Private ownership details", evidence, { evidence = it.take(2000) }, lines = 5)
                    CampusButton("Send private ownership claim", { actions.run("Claim sent for review.") {
                        require(evidence.trim().length in 10..2000) { "Describe identifying details in 10–2000 characters." }
                        repository.campus.action("claim", buildJsonObject { put("id", id); put("evidence", evidence.trim()) }); evidence = ""
                    } }, enabled = !actions.busy)
                } else CampusCopy("Collection activity appears here when a claim is approved or a giveaway is reserved. Check My activity for updates.")
            }
            mine.forEach { claim -> CargoPanel {
                StatusBadge("Your claim · ${claim.status}"); CampusCopy(claim.evidence)
                claim.decision_note?.let { CampusCopy(it) }
                if (claim.status == "pending") CampusConfirm("Withdraw claim", "Remove this claim from the review queue?", actions) {
                    repository.campus.action("withdraw_claim", campusData(claim.id))
                }
            } }
            data.notes?.let { CargoPanel { CargoLabel("PRIVATE FINDER NOTES"); CampusCopy(it) } }
            if (own && post.status == "open") CampusButton("Edit post", { open("${campusPath(post)}/edit") }, secondary = true)
            if ((own || profile.is_admin) && post.status !in listOf("hidden", "completed"))
                CampusReasonAction(if (own) "Withdraw this post" else "Hide this post", "This removes the item from the board. Admin removal closes active collection access.", actions) { reason ->
                    repository.campus.action("hide_post", campusData(id, reason))
                }
            if (profile.is_admin) CampusButton("Admin claim review", { open("campus/admin") }, secondary = true)
            ActionFeedback(actions)
            })
        }
    }
}

@Composable internal fun CampusConfirm(label: String, message: String, actions: ScreenActions, primary: Boolean = false, action: suspend () -> Unit) {
    var show by rememberSaveable(label) { mutableStateOf(false) }
    CampusButton(label, { show = true }, enabled = !actions.busy, secondary = !primary)
    if (show) Dialog(onDismissRequest = { if (!actions.busy) show = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding().padding(16.dp), contentAlignment = Alignment.Center) {
            val shape = RoundedCornerShape(8.dp)
            Column(Modifier.widthIn(max = 448.dp).fillMaxWidth().heightIn(max = maxHeight).clip(shape)
                .background(Cargo.Panel).border(1.dp, Cargo.Line, shape)
                .semantics { paneTitle = label; isTraversalGroup = true }.testTag("campus-confirmation")
                .verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                CargoTitle(label); CampusCopy(message)
                FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    CampusButton("Keep as is", { show = false }, secondary = true)
                    CampusButton("Confirm", { show = false; actions.run(action = action) }, enabled = !actions.busy)
                }
            }
        }
    }
}
@Composable internal fun CampusReasonAction(label: String, message: String, actions: ScreenActions, minimum: Int = 5, maximum: Int = 500, primary: Boolean = false, action: suspend (String) -> Unit) {
    var reason by rememberSaveable(label) { mutableStateOf("") }
    CargoPanel {
        CampusCopy(message); CargoField("${label} reason", reason, { reason = it.take(maximum) }, lines = 2)
        CampusConfirm(label, "$message\n\nReason: $reason", actions, primary = primary) {
            require(reason.trim().length in minimum..maximum) { "Enter a reason of $minimum–$maximum characters." }; action(reason.trim()); reason = ""
        }
    }
}

private data class CampusEditorData(val post: CampusPost?, val notes: String?, val categories: List<Category>, val locations: List<PickupLocation>)
@Composable fun CampusPostEditor(repository: BorrowRepository, profile: Profile, kind: String, existing: String?, open: (String) -> Unit) {
    val actions = rememberActions()
    val draftId = rememberSaveable(existing) { existing ?: UUID.randomUUID().toString() }
    LoadScreen(existing ?: draftId, {
        val post = existing?.let { repository.campus.post(it) ?: error("Post unavailable.") }
        check(post == null || post.owner_id == profile.id) { "Only the owner can edit this post." }
        CampusEditorData(post, if (kind == "found" && existing != null) repository.campus.notes(existing) else null, repository.categories(), repository.locations())
    }) { data ->
        var title by rememberSaveable(draftId) { mutableStateOf(data.post?.title.orEmpty()) }
        var description by rememberSaveable(draftId) { mutableStateOf(data.post?.description.orEmpty()) }
        var location by rememberSaveable(draftId) { mutableStateOf(data.post?.location.orEmpty()) }
        var category by rememberSaveable(draftId) { mutableStateOf(data.post?.category_id.orEmpty()) }
        var pickup by rememberSaveable(draftId) { mutableStateOf(data.post?.pickup_location_id.orEmpty()) }
        var found by rememberSaveable(draftId) { mutableStateOf(data.post?.found_on ?: CampusRules.today().toString()) }
        var notes by rememberSaveable(draftId) { mutableStateOf(data.notes.orEmpty()) }
        var condition by rememberSaveable(draftId) { mutableStateOf(data.post?.condition ?: "good") }
        var hours by rememberSaveable(draftId) { mutableIntStateOf(data.post?.hold_hours ?: 48) }
        var photos by rememberSaveable(draftId) { mutableStateOf<List<String>>(ArrayList(data.post?.images.orEmpty())) }
        val upload = rememberActions()
        fun uploadPhotos(uris: List<android.net.Uri>) {
            if (uris.isNotEmpty()) upload.run(refresh = false) {
                var failure: Exception? = null
                for (uri in uris.take(6 - photos.size)) try { photos = ArrayList(photos + repository.campus.upload(uri, profile.id, draftId)) }
                catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
                catch (error: Exception) { failure = error }
                failure?.let { throw it }
            }
        }
        val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(6), ::uploadPhotos)
        val singlePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uploadPhotos(listOfNotNull(uri)) }
        CampusPage(if (existing == null) "Share with campus" else "Edit campus post", open = open) {
            CargoPanel {
                CargoField("Title", title, { title = it.take(100) })
                CargoField("Description / bundle contents", description, { description = it.take(2000) }, lines = 5)
                CargoChoice("Category", category, data.categories.map { it.id to it.name }) { category = it }
                CargoField(if (kind == "found") "Approximate found location" else "Pickup information", location, { location = it.take(100) })
                CargoChoice("Campus pickup spot (optional)", pickup, listOf("" to "Coordinate in chat") + data.locations.map { it.id to it.name }) { pickup = it }
                if (kind == "found") {
                    CampusDateField("Found date", found) { found = it }
                    CampusCopy("Private finder notes are visible to you and admins. Keep identifying details out of the public description.")
                    CargoField("Private identifying notes", notes, { notes = it.take(2000) }, lines = 4)
                } else {
                    CargoChoice("Condition", condition, listOf("new", "good", "fair", "worn").map { it to it }) { condition = it }
                    CargoChoice("Reservation period", hours.toString(), listOf(24, 48, 72).map { it.toString() to "$it hours" }) { hours = it.toInt() }
                    CampusCopy("Free items only. Reservations are separate from loans, deposits, fines and borrowing reputation.")
                }
                photos.forEachIndexed { index, path -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    CampusPhoto(repository, path, "Upload ${index + 1}", Modifier.fillMaxWidth().height(160.dp))
                    CampusButton("Remove photo ${index + 1}", {
                        photos = ArrayList(photos.filterNot { it == path })
                        if (path !in data.post?.images.orEmpty()) upload.run(refresh = false) { repository.campus.discardPhoto(path) }
                    }, enabled = !upload.busy && !actions.busy, secondary = true)
                } }
                CampusButton("Add photos (${photos.size}/6)", {
                    val room = 6 - photos.size
                    if (room == 1) singlePicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                    else picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly, maxItems = room))
                },
                    enabled = !upload.busy && !actions.busy && photos.size < 6, secondary = true)
                CampusCopy("One to six photos. First photo is the cover. Photos are resized and identifying image metadata is removed.")
                ActionFeedback(upload)
                CampusButton(if (existing == null) "Publish post" else "Save post", { actions.run {
                    CampusRules.postError(title, description, location, photos, kind, found, notes, condition, hours)?.let { error(it) }
                    require(category.isNotBlank()) { "Choose a category." }
                    repository.campus.action("save_post", buildJsonObject {
                        put("id", draftId); put("kind", kind); put("title", title.trim()); put("description", description.trim()); put("category_id", category)
                        put("location", location.trim()); put("pickup_location_id", pickup.ifBlank { null }); put("hold_hours", hours)
                        put("found_on", if (kind == "found") found else null); put("condition", if (kind == "giveaway") condition else null)
                        put("identifying_notes", notes.trim()); put("images", JsonArray(photos.map(::JsonPrimitive)))
                    })
                    open("campus/${campusSection(kind)}/$draftId")
                } }, enabled = !actions.busy && !upload.busy)
                ActionFeedback(actions)
            }
        }
    }
}

private data class CampusActivityData(val posts: List<CampusPost>, val claims: List<CampusClaim>, val transfers: List<CampusTransfer>, val heads: List<CampusThreadHead>)
@Composable fun CampusActivityScreen(repository: BorrowRepository, profile: Profile, open: (String) -> Unit) {
    LoadScreen(profile.id, { CampusActivityData(repository.campus.posts(owner = profile.id), repository.campus.claims(claimant = profile.id), repository.campus.transfers(profile.id), repository.campus.heads()) }) { data ->
        CampusPage("Your campus activity", open = open) {
            CargoTitle("Private collections")
            if (data.transfers.isEmpty()) CampusEmpty("No collections yet", "Approved claims and giveaway reservations open a private collection here.")
            data.transfers.forEach { transfer ->
                val head = data.heads.find { it.transfer_id == transfer.id }?.last_incoming_at
                val unread = head != null && (transfer.readAt(profile.id) == null || Instant.parse(head) > Instant.parse(transfer.readAt(profile.id)))
                CargoPanel(Modifier.testTag("campus-transfer-${transfer.id}")) {
                    StatusBadge(if (transfer.status == "active" && !transfer.active()) "expired" else transfer.status)
                    if (unread) CargoLabel("[ UNREAD COLLECTION MESSAGE ]")
                    transfer.expires_at?.let { CampusCopy("Collection deadline: ${CampusRules.date(it)}") }
                    CampusButton("Open private collection →", { open("campus/collections/${transfer.id}") })
                }
            }
            CargoTitle("Your ownership claims")
            data.claims.forEach { claim -> CargoPanel {
                StatusBadge(claim.status); CampusCopy(claim.evidence); claim.decision_note?.let { CampusCopy(it) }
                CampusButton("View found post", { open("campus/lost-found/${claim.post_id}") }, secondary = true)
            } }
            CargoTitle("Your posts")
            data.posts.forEach { post -> CargoPanel { CargoTitle(post.title); StatusBadge(post.status); CampusButton("View post", { open(campusPath(post)) }, secondary = true) } }
            if (profile.is_admin) CampusButton("Admin claim review", { open("campus/admin") }, secondary = true)
        }
    }
}

private data class CampusReview(val claim: CampusClaim, val post: CampusPost?, val notes: String?, val person: Profile?)
@Composable fun CampusAdminScreen(repository: BorrowRepository, profile: Profile, open: (String) -> Unit) {
    if (!profile.is_admin) { CampusEmpty("Admins only", "An administrator must review ownership claims."); return }
    val actions = rememberActions()
    LoadScreen(profile.id, {
        val reviews = repository.campus.claims(pending = true).sortedBy { it.created_at }.map { claim ->
            CampusReview(claim, repository.campus.post(claim.post_id), repository.campus.notes(claim.post_id), repository.publicProfile(claim.claimant_id))
        }
        reviews to repository.campus.adminApprovals()
    }, actions.revision) { (reviews, approved) ->
        CampusPage("A careful check. A safe return.", "CAMPUS ADMIN REVIEW", open) {
            CampusCopy("Review private evidence against the finder’s notes. Finders cannot approve claimants.")
            if (reviews.isEmpty()) CampusEmpty("All claims reviewed", "New ownership claims will appear here.")
            reviews.forEach { review -> key(review.claim.id) { CargoPanel(Modifier.testTag("campus-review-${review.claim.id}")) {
                CargoLabel("FINDER’S RECORD"); review.post?.let { post ->
                    CampusPhoto(repository, post.images.firstOrNull(), post.title, Modifier.fillMaxWidth().height(240.dp))
                    CargoTitle(post.title); CampusCopy(post.description); CampusButton("Open post / moderate", { open(campusPath(post)) }, secondary = true)
                }
                CampusCopy(review.notes.orEmpty()); CargoLabel("PRIVATE OWNERSHIP CLAIM")
                CargoTitle(review.person?.full_name ?: "Campus member"); CampusCopy(review.claim.evidence)
                if (review.claim.claimant_id == profile.id) CampusCopy("Another admin must review your own claim.")
                else listOf("approve", "reject").forEach { decision ->
                    CampusReasonAction(if (decision == "approve") "Approve ownership" else "Reject claim", "Check the identifying details before deciding. Approval closes competing claims and opens private collection.", actions, maximum = 1000, primary = decision == "approve") { reason ->
                        repository.campus.action("review_claim", buildJsonObject { put("id", review.claim.id); put("decision", decision); put("reason", reason) })
                    }
                }
            } } }
            CargoTitle("Approved, awaiting collection")
            approved.forEach { transfer -> key(transfer.id) { CargoPanel {
                CampusButton("Open found post", { open("campus/lost-found/${transfer.post_id}") }, secondary = true)
                CampusReasonAction("Revoke uncompleted approval", "This closes collection access and releases the found item for new claims.", actions) { reason ->
                    repository.campus.action("revoke_claim", campusData(transfer.id, reason))
                }
            } } }
            ActionFeedback(actions)
        }
    }
}
