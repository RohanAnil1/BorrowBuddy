package `in`.borrowbuddy.android.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

private val cssLineHeight = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None)
private fun normalText(value: String) = value.replace(Regex("[\\t\\n\\r\\u000C ]+"), " ").trim(' ').uppercase()
private fun mono(size: Int) = TextStyle(fontFamily = Cargo.Mono, fontSize = size.sp, lineHeight = (size * 1.5).sp, letterSpacing = (size * .08).sp, lineHeightStyle = cssLineHeight)
private fun body(size: Int) = TextStyle(fontFamily = Cargo.Body, fontSize = size.sp, lineHeight = (size * 1.5).sp, lineHeightStyle = cssLineHeight)
val CatalogColumns = SemanticsPropertyKey<Int>("CatalogColumns")
val CatalogCoverReady = SemanticsPropertyKey<Boolean>("CatalogCoverReady")
val CatalogLoading = SemanticsPropertyKey<Boolean>("CatalogLoading")
val CatalogResultCount = SemanticsPropertyKey<Int>("CatalogResultCount")
val CatalogFailed = SemanticsPropertyKey<Boolean>("CatalogFailed")

/** Pass `saved` and `toggleSave` to show the heart; leave them null where saving makes no sense. */
@Composable fun ItemCard(item: Item, repository: BorrowRepository, open: (String) -> Unit, modifier: Modifier = Modifier,
    saved: Boolean? = null, toggleSave: (() -> Unit)? = null) {
    val interaction = remember { MutableInteractionSource() }
    val hovered by interaction.collectIsHoveredAsState()
    val focused by interaction.collectIsFocusedAsState()
    val reduced = rememberReducedMotion()
    val scale by animateFloatAsState(if (hovered && !reduced) 1.03f else 1f, tween(if (reduced) 0 else 700), label = "source-cover-hover")
    var imageFailed by remember(item.images.firstOrNull()) { mutableStateOf(false) }
    var coverReady by remember(item.images.firstOrNull()) { mutableStateOf(false) }
    val deposit = remember(item.deposit_amount) { if (item.deposit_amount > 0) "DEP ${ledgerMoney(item.deposit_amount)}" else "NO DEPOSIT" }
    Column(modifier.fillMaxWidth().testTag("catalog-item-${item.id}").semantics { this[CatalogCoverReady] = coverReady }.background(Cargo.Panel)
        .border(1.dp, if (hovered || focused) Cargo.Accent else Cargo.Line)
        .clickable(interactionSource = interaction, indication = null) { open(item.id) }.padding(1.dp)) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3).clipToBounds().background(Cargo.Panel)) {
            if (item.images.isNotEmpty() && !imageFailed) AsyncImage(repository.publicImage(item.images.first()), item.title,
                Modifier.fillMaxSize().graphicsLayer { scaleX = scale; scaleY = scale }, contentScale = ContentScale.Crop, onError = { imageFailed = true }, onSuccess = { coverReady = true })
            else Icon(painterResource(R.drawable.ic_image_off), null, Modifier.align(Alignment.Center).size(32.dp), tint = Cargo.Ink.copy(alpha = .4f))
            Text((Rules.conditions[item.condition] ?: item.condition).uppercase(), Modifier.padding(12.dp).background(Cargo.Panel).padding(horizontal = 8.dp, vertical = 4.dp),
                color = Cargo.Accent, style = mono(9))
            if (saved != null && toggleSave != null) SaveHeart(saved, item.title, toggleSave, Modifier.align(Alignment.TopEnd).padding(8.dp))
        }
        Column(Modifier.padding(16.dp).fillMaxWidth()) {
            Text(normalText(item.title), style = TextStyle(fontFamily = Cargo.Strong, fontSize = 16.sp, lineHeight = 22.sp, lineHeightStyle = cssLineHeight, lineBreak = LineBreak.Paragraph), color = Cargo.Ink)
            Text(normalText(item.description), Modifier.padding(top = 4.dp), style = body(12).copy(lineHeight = 20.sp), color = Cargo.Ink.copy(alpha = .5f), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Row(Modifier.fillMaxWidth().padding(top = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("★", color = Cargo.Accent, style = mono(9))
                    Text((item.owner?.trust_score?.roundToInt() ?: 70).toString(), color = Cargo.Ink.copy(alpha = .5f), style = mono(9))
                }
                item.pickup_location?.let { spot ->
                    Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.End), verticalAlignment = Alignment.CenterVertically) {
                    Icon(painterResource(R.drawable.ic_map_pin), null, Modifier.size(12.dp), tint = Cargo.Ink.copy(alpha = .5f))
                    Text(spot.name.uppercase(), Modifier.weight(1f, fill = false), style = mono(9), color = Cargo.Ink.copy(alpha = .5f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            HorizontalDivider(Modifier.padding(top = 12.dp), color = Cargo.Line)
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(item.owner?.full_name.orEmpty().uppercase(), Modifier.weight(1f), style = mono(9), color = Cargo.Ink.copy(alpha = .5f))
                Text(deposit, style = mono(9), color = Cargo.Accent)
            }
        }
    }
}

@Composable fun CatalogScreen(repository: BorrowRepository, profile: Profile, locationId: String?, categoryId: String?, open: (String) -> Unit,
    listItem: () -> Unit, pending: Int, manage: () -> Unit, openSaved: () -> Unit = {}) {
    var query by rememberSaveable { mutableStateOf("") }
    var appliedQuery by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable(categoryId) { mutableStateOf(categoryId.orEmpty()) }
    var condition by rememberSaveable { mutableStateOf("") }
    var location by rememberSaveable(locationId) { mutableStateOf(locationId.orEmpty()) }
    var from by rememberSaveable { mutableStateOf("") }
    var to by rememberSaveable { mutableStateOf("") }
    var sortKey by rememberSaveable { mutableStateOf(ItemSort.Newest.key) }
    val sort = ItemSort.entries.firstOrNull { it.key == sortKey } ?: ItemSort.Newest
    val filters = CatalogFilters(appliedQuery, category.ifBlank { null }, condition.ifBlank { null }, location.ifBlank { null }, from.ifBlank { null }, to.ifBlank { null }, sort)
    // "Load more" re-reads every page so far; any filter change starts again from page 1.
    var page by rememberSaveable(filters) { mutableIntStateOf(1) }
    var hasMore by remember { mutableStateOf(false) }
    var savedIds by remember { mutableStateOf<Set<String>?>(null) }
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<Item>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableIntStateOf(0) }
    val revision = LocalPortalRevision.current
    LaunchedEffect(filters, revision, retry, page) {
        loading = true; error = null
        try {
            val shown = page * CatalogPageSize
            val rows = repository.catalog(filters, 0, shown + 1)
            hasMore = rows.size > shown && page < CatalogMaxPages
            items = rows.take(shown)
        }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { error = friendlyError(failure) }
        finally { loading = false }
    }
    LaunchedEffect(profile.id, revision) { savedIds = repository.savedItemIds(profile.id) }
    fun toggleSave(item: Item) {
        val current = savedIds ?: return
        val next = item.id !in current
        savedIds = if (next) current + item.id else current - item.id
        scope.launch {
            try { repository.setSaved(profile.id, item.id, next) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { savedIds = current } // roll back the optimistic flip
        }
    }
    LoadScreen(Unit, { repository.categories() to repository.locations() }) { (categories, locations) ->
        BoxWithConstraints(Modifier.fillMaxSize().imePadding()) {
            val wide = maxWidth >= 800.dp
            val horizontalIntro = maxWidth >= 640.dp
            val titleSize = (maxWidth.value * .06f).coerceIn(40f, 64f)
            val gutter = ((maxWidth - 1152.dp).coerceAtLeast(0.dp) / 2) + if (wide) 40.dp else 16.dp
            val columns = if (maxWidth >= 1024.dp) 3 else if (maxWidth >= 640.dp) 2 else 1
            LazyColumn(Modifier.fillMaxSize().testTag("catalog-scroll").semantics {
                this[CatalogColumns] = columns; this[CatalogLoading] = loading
                this[CatalogResultCount] = items.size; this[CatalogFailed] = error != null
            }, contentPadding = PaddingValues(horizontal = gutter, vertical = 32.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                item(key = "intro") {
                    Column {
                        CatalogIntro(profile, pending, titleSize, horizontalIntro, manage, savedIds?.size, openSaved)
                        Spacer(Modifier.height(32.dp))
                        CatalogFilters(query, { query = it }, { appliedQuery = query.trim() }, loading, categories, locations,
                            category, { category = it }, condition, { condition = it }, location, { location = it }, from, { from = it }, to, { to = it },
                            sortKey, { sortKey = it },
                            appliedQuery.isNotBlank() || sortKey != ItemSort.Newest.key || listOf(category, condition, location, from, to).any { it.isNotBlank() }) {
                            query = ""; appliedQuery = ""; category = ""; condition = ""; location = ""; from = ""; to = ""; sortKey = ItemSort.Newest.key
                        }
                        Spacer(Modifier.height(16.dp))
                    }
                }
                if (loading) item(key = "loading") { LinearProgressIndicator(Modifier.fillMaxWidth().semantics { contentDescription = "Updating catalog" }, color = Cargo.Accent, trackColor = Cargo.Line) }
                error?.let { problem -> item(key = "error") { CargoPanel { CargoBody(problem); CargoButton("Try again", { retry++ }) } } }
                if (!loading && error == null && items.isEmpty()) item(key = "empty") {
                    CatalogEmpty(appliedQuery.isNotBlank() || listOf(category, condition, location).any { it.isNotBlank() }, listItem)
                }
                items(items.chunked(columns), key = { row -> row.first().id }) { row ->
                    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        row.forEach { item ->
                            val mine = item.owner_id == profile.id
                            ItemCard(item, repository, open, Modifier.weight(1f).fillMaxHeight(),
                                saved = if (mine) null else savedIds?.contains(item.id), toggleSave = { toggleSave(item) })
                        }
                        repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
                if (items.isNotEmpty() && error == null) item(key = "more") {
                    Column(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("SHOWING ${items.size} ${if (items.size == 1) "ITEM" else "ITEMS"}", Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                            style = mono(10), color = Cargo.Ink.copy(alpha = .5f))
                        if (hasMore) Text("LOAD MORE", Modifier.testTag("catalog-load-more").border(1.dp, Cargo.Line, RoundedCornerShape(8.dp))
                            .clickable(enabled = !loading) { page += 1 }.padding(horizontal = 20.dp, vertical = 12.dp),
                            style = TextStyle(fontFamily = Cargo.Strong, fontSize = 12.sp), color = Cargo.Ink)
                    }
                }
            }
        }
    }
}

@Composable private fun CatalogIntro(profile: Profile, pending: Int, titleSize: Float, horizontal: Boolean, manage: () -> Unit,
    savedCount: Int?, openSaved: () -> Unit) {
    val heading: @Composable () -> Unit = {
        Text("[ CAMPUS CATALOG ]", style = mono(10), color = Cargo.Accent)
        Text("WHAT'S ON THE SHELF TODAY", Modifier.padding(top = 12.dp), color = Cargo.Ink,
            style = TextStyle(fontFamily = Cargo.Title, fontSize = titleSize.sp, lineHeight = (titleSize * 1.05f).sp, letterSpacing = (titleSize * .01f).sp, lineHeightStyle = cssLineHeight))
        Text("SIGNED IN AS ${profile.full_name.uppercase()} · TRUST SCORE ${profile.trust_score.roundToInt()}",
            Modifier.padding(top = 8.dp), color = Cargo.Ink.copy(alpha = .5f), style = mono(10))
    }
    val requests: @Composable () -> Unit = { FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (savedCount != null) Row(Modifier.testTag("catalog-saved").border(1.dp, Cargo.Line).clickable(onClick = openSaved)
            .padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(painterResource(if (savedCount > 0) R.drawable.ic_heart_filled else R.drawable.ic_heart), null, Modifier.size(14.dp),
                tint = if (savedCount > 0) Cargo.Accent else Cargo.Ink.copy(alpha = .75f))
            Text(if (savedCount > 0) "SAVED ($savedCount)" else "SAVED", style = mono(10), color = Cargo.Ink.copy(alpha = .75f))
        }
        if (pending > 0) Text("[ $pending REQUEST${if (pending == 1) "" else "S"} WAITING ON YOU ]",
            Modifier.testTag("catalog-pending-requests").border(1.dp, Cargo.Accent.copy(alpha = .6f))
                .background(Cargo.Accent.copy(alpha = .1f)).clickable(onClick = manage).padding(horizontal = 16.dp, vertical = 10.dp), style = mono(10), color = Cargo.Accent)
    } }
    if (horizontal) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(24.dp)) {
        Column(Modifier.weight(1f)) { heading() }; requests()
    } else Column(verticalArrangement = Arrangement.spacedBy(24.dp)) { Column { heading() }; requests() }
}

@Composable private fun CatalogFilters(query: String, changeQuery: (String) -> Unit, search: () -> Unit, loading: Boolean,
    categories: List<Category>, locations: List<PickupLocation>, category: String, selectCategory: (String) -> Unit,
    condition: String, selectCondition: (String) -> Unit, location: String, selectLocation: (String) -> Unit,
    from: String, selectFrom: (String) -> Unit, to: String, selectTo: (String) -> Unit, sort: String, selectSort: (String) -> Unit,
    hasFilters: Boolean, clear: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val focus = LocalFocusManager.current
        val keyboard = LocalSoftwareKeyboardController.current
        fun submit() { focus.clearFocus(); keyboard?.hide(); search() }
        val interaction = remember { MutableInteractionSource() }
        val focused by interaction.collectIsFocusedAsState()
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BasicTextField(query, changeQuery, Modifier.weight(1f).testTag("catalog-search").heightIn(min = 48.dp)
                .background(Cargo.Panel, RoundedCornerShape(8.dp)).border(1.dp, if (focused) Cargo.Accent else Cargo.Line, RoundedCornerShape(8.dp))
                .semantics { contentDescription = "Search projectors, cameras, fans" }, textStyle = body(14).copy(color = Cargo.Ink), singleLine = true,
                cursorBrush = SolidColor(Cargo.Accent), interactionSource = interaction, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { submit() }),
                decorationBox = { field -> Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Icon(painterResource(R.drawable.ic_search), null, Modifier.size(16.dp), tint = Cargo.Ink.copy(alpha = .4f))
                    Box(Modifier.weight(1f)) { if (query.isEmpty()) Text("Search projectors, cameras, fans…", style = body(14), color = Cargo.Ink.copy(alpha = .3f), maxLines = 1, overflow = TextOverflow.Clip); field() }
                } })
            Text("SEARCH", Modifier.background(Cargo.Accent.copy(alpha = if (loading) .6f else 1f), RoundedCornerShape(8.dp))
                .clickable(enabled = !loading, onClick = ::submit).padding(horizontal = 16.dp, vertical = 12.dp), color = Cargo.Ink,
                style = TextStyle(fontFamily = Cargo.Strong, fontSize = 12.sp, lineHeight = 18.sp))
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            CatalogSelect("category", "Category", category, listOf("" to "All categories") + categories.map { it.id to it.name }, selectCategory)
            CatalogSelect("condition", "Condition", condition, listOf("" to "Any condition") + Rules.conditions.toList(), selectCondition)
            CatalogSelect("location", "Pickup", location, listOf("" to "Any pickup spot") + locations.map { it.id to it.name }, selectLocation)
            CatalogDate("FROM", from, selectFrom)
            CatalogDate("TO", to, selectTo)
            CatalogSelect("sort", "Sort", sort, ItemSort.entries.map { it.key to it.label }, selectSort)
            if (hasFilters) Row(Modifier.testTag("catalog-clear").border(1.dp, Cargo.Line, RoundedCornerShape(8.dp)).clickable { focus.clearFocus(); keyboard?.hide(); clear() }.padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(painterResource(R.drawable.ic_x), null, Modifier.size(12.dp), tint = Cargo.Ink.copy(alpha = .5f))
                Text("CLEAR", style = mono(9), color = Cargo.Ink.copy(alpha = .5f))
            }
        }
    }
}

@Composable private fun CatalogSelect(tag: String, label: String, value: String, choices: List<Pair<String, String>>, select: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val focus = LocalFocusManager.current
    val measure = rememberTextMeasurer()
    val density = LocalDensity.current
    val width = remember(choices, density) { (choices.maxOf { measure.measure(it.second, body(13)).size.width } / density.density).dp + 48.dp }.coerceAtMost(240.dp)
    Box {
        Row(Modifier.testTag("catalog-$tag").width(width).background(Cargo.Panel, RoundedCornerShape(8.dp))
            .border(1.dp, Cargo.Line, RoundedCornerShape(8.dp)).semantics { contentDescription = "$label: ${choices.find { it.first == value }?.second.orEmpty()}" }
            .clickable { focus.clearFocus(); expanded = true }.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(choices.find { it.first == value }?.second.orEmpty(), Modifier.weight(1f), style = body(13), color = Cargo.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Icon(painterResource(R.drawable.ic_chevron_down), null, Modifier.size(12.dp), tint = Cargo.Ink)
        }
        DropdownMenu(expanded, { expanded = false }, containerColor = Cargo.Panel) {
            choices.forEach { (id, name) -> DropdownMenuItem(text = { Text(name, color = Cargo.Ink, style = body(13)) },
                modifier = Modifier.semantics { selected = id == value }, onClick = { expanded = false; select(id) }) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun CatalogDate(label: String, value: String, select: (String) -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    val focus = LocalFocusManager.current
    Row(Modifier.testTag("catalog-date-${label.lowercase()}").background(Cargo.Panel, RoundedCornerShape(8.dp)).border(1.dp, Cargo.Line, RoundedCornerShape(8.dp))
        .semantics { contentDescription = "$label date: ${value.ifBlank { "not selected" }}" }.clickable { focus.clearFocus(); open = true }.padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = mono(9), color = Cargo.Ink.copy(alpha = .4f))
        Text(if (value.isBlank()) "dd-mm-yyyy" else LocalDate.parse(value).format(DateTimeFormatter.ofPattern("dd-MM-yyyy")), style = body(13), color = Cargo.Ink)
        Icon(painterResource(R.drawable.ic_calendar), null, Modifier.size(14.dp), tint = Cargo.Ink)
    }
    if (open) {
        val picker = rememberDatePickerState(initialSelectedDateMillis = value.takeIf { it.isNotBlank() }?.let { LocalDate.parse(it).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli() })
        DatePickerDialog(onDismissRequest = { open = false }, confirmButton = { TextButton({ picker.selectedDateMillis?.let { select(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString()) }; open = false }, enabled = picker.selectedDateMillis != null) { Text("APPLY") } },
            dismissButton = { Row { TextButton({ select(""); open = false }) { Text("CLEAR DATE") }; TextButton({ open = false }) { Text("CANCEL") } } }) {
            DatePicker(picker, title = { Text("$label DATE", Modifier.padding(24.dp), style = mono(12)) })
        }
    }
}

@Composable private fun CatalogEmpty(filtered: Boolean, listItem: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(horizontal = 24.dp, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(painterResource(R.drawable.ic_package_search), null, Modifier.size(28.dp), tint = Cargo.Accent)
        Text(if (filtered) "[ NO MATCHES ]" else "[ EMPTY SHELF ]", Modifier.padding(top = 16.dp), style = mono(10), color = Cargo.Accent)
        Text(if (filtered) "NO MATCHES ON THIS ROUTE" else "THE SHELVES ARE EMPTY", Modifier.padding(top = 12.dp), style = TextStyle(fontFamily = Cargo.Title, fontSize = 40.sp, lineHeight = 42.sp), color = Cargo.Ink, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Text(if (filtered) "TRY CLEARING A FILTER OR WIDENING YOUR DATES — OR BE THE FIRST TO LIST SOMETHING LIKE THIS." else "NOTHING LISTED YET. BE THE FIRST TO PUT SOMETHING ON THE SHELF.",
            Modifier.padding(top = 12.dp).widthIn(max = 384.dp), style = body(13).copy(lineHeight = 24.sp), color = Cargo.Ink.copy(alpha = .6f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Row(Modifier.padding(top = 32.dp).background(Cargo.Accent, RoundedCornerShape(8.dp)).clickable(onClick = listItem).padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(painterResource(R.drawable.ic_plus_circle), null, Modifier.size(16.dp), tint = Cargo.Ink)
            Text("LIST AN ITEM", style = TextStyle(fontFamily = Cargo.Strong, fontSize = 12.sp), color = Cargo.Ink)
        }
    }
}


internal const val CatalogPageSize = 24
internal const val CatalogMaxPages = 20

/** Heart toggle for saving an item; a 48dp target with a short pop when saved. */
@Composable fun SaveHeart(saved: Boolean, title: String, toggle: () -> Unit, modifier: Modifier = Modifier, inline: Boolean = false) {
    val reduced = rememberReducedMotion()
    val pop = remember { androidx.compose.animation.core.Animatable(1f) }
    LaunchedEffect(saved) {
        if (saved && !reduced) { pop.snapTo(1.3f); pop.animateTo(1f, tween(300)) } else pop.snapTo(1f)
    }
    val label = if (saved) "Remove $title from saved" else "Save $title for later"
    if (inline) Row(modifier.testTag("item-save").border(1.dp, Cargo.Line, RoundedCornerShape(8.dp)).semantics { contentDescription = label; this.selected = saved }
        .clickable(onClick = toggle).padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(painterResource(if (saved) R.drawable.ic_heart_filled else R.drawable.ic_heart), null, Modifier.size(18.dp).graphicsLayer { scaleX = pop.value; scaleY = pop.value },
            tint = if (saved) Cargo.Accent else Cargo.Ink)
        Text(if (saved) "SAVED" else "SAVE", style = TextStyle(fontFamily = Cargo.Strong, fontSize = 11.sp), color = Cargo.Ink)
    } else Box(modifier.size(48.dp).semantics { contentDescription = label; this.selected = saved }.clickable(onClick = toggle), contentAlignment = Alignment.Center) {
        Box(Modifier.size(38.dp).background(Color.Black.copy(alpha = .7f), RoundedCornerShape(50)), contentAlignment = Alignment.Center) {
            Icon(painterResource(if (saved) R.drawable.ic_heart_filled else R.drawable.ic_heart), null,
                Modifier.size(18.dp).graphicsLayer { scaleX = pop.value; scaleY = pop.value }, tint = if (saved) Cargo.Accent else Cargo.Ink)
        }
    }
}
