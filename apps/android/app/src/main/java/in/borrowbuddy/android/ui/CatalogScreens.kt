package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.core.tween
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import coil3.compose.AsyncImage
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import kotlinx.serialization.json.*
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.launch

@Composable fun ItemGallery(repository: BorrowRepository, images: List<String>, title: String) {
    val pager = rememberPagerState { images.size.coerceAtLeast(1) }
    val scope = rememberCoroutineScope()
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3).border(1.dp, Cargo.Line).background(Cargo.Panel)) {
            if (images.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CargoLabel("[ NO PHOTO ]", Cargo.Ink.copy(alpha = .4f)) }
            else HorizontalPager(pager, Modifier.fillMaxSize()) { index ->
                AsyncImage(repository.publicImage(images[index]), "$title, photo ${index + 1}", Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            }
            CargoLabel("PHOTO ${pager.currentPage + 1}/${images.size.coerceAtLeast(1)}", modifier = Modifier.padding(12.dp).background(Cargo.Panel).padding(horizontal = 8.dp, vertical = 4.dp))
        }
        if (images.size > 1) LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            itemsIndexed(images) { index, image ->
                Box(Modifier.size(80.dp).border(1.dp, if (pager.currentPage == index) Cargo.Accent else Cargo.Line)
                    .semantics { contentDescription = "Photo ${index + 1}" }
                    .clickable { scope.launch { pager.animateScrollToPage(index) } }) {
                    AsyncImage(repository.publicImage(image), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                }
            }
        }
    }
}

@Composable fun AvailabilityCalendar(windows: List<AvailabilityWindow>, maxDays: Int, start: String, end: String, onChange: (String, String) -> Unit) {
    var offset by rememberSaveable { mutableIntStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    val today = Rules.today()
    val month = YearMonth.from(today).plusMonths(offset.toLong())
    val blocked = remember(windows) { windows.map { LocalDate.parse(it.start_date) to LocalDate.parse(it.end_date) } }
    val blanks = month.atDay(1).dayOfWeek.value - 1
    val cells = List(blanks) { null } + (1..month.lengthOfMonth()).map { month.atDay(it) }
    CargoPanel {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            CargoButton("←", { offset-- }, enabled = offset > 0, secondary = true)
            CargoLabel(month.format(DateTimeFormatter.ofPattern("MMMM yyyy")), Cargo.Ink)
            CargoButton("→", { offset++ }, enabled = offset < 2, secondary = true)
        }
        Row { listOf("MO", "TU", "WE", "TH", "FR", "SA", "SU").forEach { day -> Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { CargoLabel(day, Cargo.Ink.copy(alpha = .4f)) } } }
        cells.chunked(7).forEach { week ->
            Row {
                repeat(7) { i ->
                    val date = week.getOrNull(i)
                    val value = date?.toString().orEmpty()
                    val unavailable = date == null || date < today || blocked.any { date >= it.first && date <= it.second }
                    val edge = value.isNotBlank() && (value == start || value == end)
                    val range = start.isNotBlank() && end.isNotBlank() && value >= start && value <= end
                    Box(Modifier.weight(1f).heightIn(min = 48.dp).background(if (edge) Cargo.Accent else if (range) Cargo.Accent.copy(alpha = .15f) else Cargo.Panel)
                        .semantics { contentDescription = if (date == null) "Empty calendar cell" else "Date $value${if (unavailable) ", unavailable" else ""}" }
                        .clickable(enabled = !unavailable) {
                            error = null
                            if (start.isBlank() || end.isNotBlank() || value < start) onChange(value, "")
                            else {
                                error = Rules.validateRange(LocalDate.parse(start), date!!, maxDays, windows)
                                if (error == null) onChange(start, value) else onChange(value, "")
                            }
                        }, contentAlignment = Alignment.Center) {
                        if (date != null) Text(date.dayOfMonth.toString(), color = if (unavailable) Cargo.Ink.copy(alpha = .25f) else Cargo.Ink)
                    }
                }
            }
        }
        CargoLabel(if (start.isBlank()) "[ PICK A START DATE ]" else if (end.isBlank()) "[ $start → PICK AN END DATE ]" else "[ $start → $end ]", Cargo.Ink.copy(alpha = .6f))
        CargoBody("Booked dates are unavailable. Longest loan: $maxDays days.")
        error?.let { CargoLabel("[ $it ]", Cargo.Warn) }
    }
}

private data class ItemDetails(val item: Item, val windows: List<AvailabilityWindow>)
@Composable fun ItemScreen(repository: BorrowRepository, profile: Profile, id: String, edit: () -> Unit, owner: (String) -> Unit, manage: () -> Unit) {
    val actions = rememberActions()
    var start by rememberSaveable(id) { mutableStateOf("") }
    var end by rememberSaveable(id) { mutableStateOf("") }
    var message by rememberSaveable(id) { mutableStateOf("") }
    var sent by rememberSaveable(id) { mutableStateOf(false) }
    var dateState by remember(id) { mutableStateOf("idle") }
    LoadScreen(id to actions.revision, { ItemDetails(repository.item(id) ?: error("Item not found."), repository.availability(id)) }) { (item, windows) ->
        val isOwner = item.owner_id == profile.id
        LaunchedEffect(start, end, windows) {
            dateState = "idle"
            if (start.isNotBlank() && end.isNotBlank()) {
                if (Rules.validateRange(LocalDate.parse(start), LocalDate.parse(end), item.max_loan_days, windows) == null) {
                    dateState = "checking"; kotlinx.coroutines.delay(550); dateState = "ok"
                } else dateState = "fail"
            }
        }
        fun dispatch() { actions.run {
            Rules.validateRange(LocalDate.parse(start), LocalDate.parse(end), item.max_loan_days, windows)?.let { error(it) }
            repository.request(id, profile.id, start, end, message); sent = true
        } }
        Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f)) {
        ScreenColumn {
            ItemGallery(repository, item.images, item.title)
            CargoTitle(item.title); StatusBadge(item.status)
            CargoBody(item.description)
            CargoPanel {
                CargoLabel("${Rules.conditions[item.condition] ?: item.condition} · ${item.category?.name.orEmpty()}", Cargo.Ink.copy(alpha = .6f))
                CargoBody("DEPOSIT ₹${item.deposit_amount} · MAX LOAN ${item.max_loan_days} DAYS")
                CargoBody("PICKUP: ${item.pickup_location?.name ?: "Coordinate in chat"}")
            }
            CargoPanel {
                CargoLabel("[ OWNER ]")
                CargoButton(item.owner?.full_name ?: "Student profile", { owner(item.owner_id) }, secondary = true)
                CargoLabel("TRUST SCORE ${item.owner?.trust_score?.toInt() ?: 70}")
                item.owner?.let { StatusBadge(it.verification_status) }
                if (isOwner) { CargoButton("Edit listing", edit); CargoButton("Manage", manage, secondary = true) }
            }
            if (isOwner) CargoPanel { CargoLabel("[ YOUR LISTING ]"); CargoBody("Manage your listing from your items page.") }
            else if (sent) CargoPanel { CargoLabel("[ REQUEST DISPATCHED ]"); CargoBody("The owner has 48 hours to respond. You'll receive a notification either way.") }
            else {
                AvailabilityCalendar(windows, item.max_loan_days, start, end) { a, b -> start = a; end = b }
                if (dateState == "checking") CargoLabel("[ VERIFYING AVAILABILITY… ]", Cargo.Warn)
                if (dateState == "ok") CargoLabel("[ RANGE VERIFIED · READY TO DISPATCH ]")
                if (dateState == "fail") CargoLabel("[ CHOOSE AN AVAILABLE DATE RANGE ]", Cargo.Warn)
                CargoField("Message to owner", message, { if (it.length <= 500) message = it }, lines = 3)
                CargoPanel {
                    CargoLabel("[ DATES TAKEN? ]"); CargoBody("Join the waitlist. Get notified when your dates open up.")
                    CargoButton("Join waitlist", { actions.run("You're on the waitlist.") {
                        repository.rpc("join_waitlist", buildJsonObject { put("p_item_id", id); put("p_start", start); put("p_end", end) })
                    } }, enabled = !actions.busy && start.isNotBlank() && end.isNotBlank(), secondary = true)
                }
            }
            ActionFeedback(actions)
        }
        }
        AnimatedVisibility(!isOwner && !sent && dateState == "ok" && item.status == "available",
            enter = slideInVertically(tween(220)) { it } + fadeIn(tween(220)),
            exit = slideOutVertically(tween(220)) { it } + fadeOut(tween(220))) {
            Box(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).imePadding().padding(12.dp)) {
                CargoButton("Request to borrow · $start → $end", ::dispatch, enabled = !actions.busy, modifier = Modifier.fillMaxWidth())
            }
        }
        }
    }
}

private data class ListingData(val item: Item?, val categories: List<Category>, val locations: List<PickupLocation>)
@Composable fun ListingScreen(repository: BorrowRepository, profile: Profile, id: String?, saved: (String) -> Unit) {
    val actions = rememberActions()
    LoadScreen(id, { ListingData(id?.let { repository.item(it) ?: error("Item not found.") }, repository.categories(), repository.locations()) }) { data ->
        if (data.item != null && data.item.owner_id != profile.id) ScreenColumn { CargoBody("You can only edit your own listings.") }
        else {
            var title by rememberSaveable(id) { mutableStateOf(data.item?.title.orEmpty()) }
            var description by rememberSaveable(id) { mutableStateOf(data.item?.description.orEmpty()) }
            var category by rememberSaveable(id) { mutableStateOf(data.item?.category_id ?: data.categories.firstOrNull()?.id.orEmpty()) }
            var condition by rememberSaveable(id) { mutableStateOf(data.item?.condition ?: "good") }
            var deposit by rememberSaveable(id) { mutableStateOf((data.item?.deposit_amount ?: 0).toString()) }
            var maxDays by rememberSaveable(id) { mutableStateOf((data.item?.max_loan_days ?: 14).toString()) }
            var location by rememberSaveable(id) { mutableStateOf(data.item?.pickup_location_id.orEmpty()) }
            var images by rememberSaveable(id) { mutableStateOf(ArrayList(data.item?.images.orEmpty())) }
            ScreenColumn {
                CargoLabel("[ CAMPUS SHELF ]"); CargoTitle(if (id == null) "List an item" else "Edit listing")
                CargoPanel {
                    CargoField("Title", title, { if (it.length <= 100) title = it })
                    CargoField("Description", description, { if (it.length <= 2000) description = it }, lines = 4)
                    CargoChoice("Category", category, data.categories.map { it.id to it.name }, { category = it })
                    CargoChoice("Condition", condition, Rules.conditions.toList(), { condition = it })
                    CargoField("Deposit (INR)", deposit, { deposit = it }, keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
                    CargoField("Maximum loan days", maxDays, { maxDays = it }, keyboard = KeyboardOptions(keyboardType = KeyboardType.Number))
                    CargoChoice("Pickup spot", location, listOf("" to "Coordinate in chat") + data.locations.map { it.id to it.name }, { location = it })
                }
                CargoPanel { CargoLabel("[ PHOTOS ]"); UploadField(repository, profile.id, "item-images", initial = images) { images = ArrayList(it) } }
                ActionFeedback(actions)
                CargoButton("Save listing", { actions.run {
                    require(title.trim().length in 3..100) { "Give your item a title of 3–100 characters." }
                    require(description.trim().length in 10..2000) { "Describe the item in 10–2000 characters." }
                    require(category.isNotBlank()) { "Choose a category." }
                    val amount = deposit.toIntOrNull() ?: error("Enter a whole deposit amount.")
                    val days = maxDays.toIntOrNull() ?: error("Enter a whole number of days.")
                    require(amount in 0..100000) { "Deposit must be between ₹0 and ₹100000." }
                    require(days in 1..30) { "Maximum loan must be 1–30 days." }
                    require(images.size in 1..6) { "Add between 1 and 6 photos." }
                    saved(repository.saveItem(id, profile.id, buildJsonObject {
                        put("title", title.trim()); put("description", description.trim()); put("category_id", category)
                        put("condition", condition); put("deposit_amount", amount); put("max_loan_days", days)
                        put("pickup_location_id", location.takeIf { it.isNotBlank() }?.let(::JsonPrimitive) ?: JsonNull)
                        put("images", JsonArray(images.map(::JsonPrimitive)))
                    }))
                } }, enabled = !actions.busy, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}
