package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Icon
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.zIndex
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.*
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.text.TextStyle
import kotlin.math.roundToInt
import coil3.compose.AsyncImage
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.json.*

val CampusImageWidth = SemanticsPropertyKey<Int>("CampusImageWidth")
val CampusImageHeight = SemanticsPropertyKey<Int>("CampusImageHeight")

@Composable private fun CampusMapImage(description: String, modifier: Modifier) {
    var decoded by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
    AsyncImage(R.drawable.campus_map, description, modifier.testTag("campus-map-image").semantics {
        this[CampusImageWidth] = decoded.width; this[CampusImageHeight] = decoded.height
    }, contentScale = ContentScale.Fit, onSuccess = { decoded = androidx.compose.ui.unit.IntSize(it.result.image.width, it.result.image.height) })
}

@Composable fun CampusBoard(spots: List<PickupLocation>, counts: Map<String, Int> = emptyMap(), appVariant: Boolean = false, browse: (String) -> Unit) {
    var activeId by rememberSaveable { mutableStateOf<String?>(null) }
    val active = spots.find { it.id == activeId }
    val wide = LocalWindowInfo.current.containerSize.width / LocalDensity.current.density >= 800f
    BackHandler(active != null) { activeId = null }
    Column(Modifier.onPreviewKeyEvent {
        if (active != null && it.type == KeyEventType.KeyDown && it.key == Key.Escape) { activeId = null; true } else false
    }, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3).border(1.dp, Cargo.Line).testTag("campus-board")
            .clickable(enabled = active != null) { activeId = null }) {
            CampusMapImage("Bennett University master plan", Modifier.fillMaxSize())
            Canvas(Modifier.fillMaxSize().background(if (active != null) Cargo.Panel.copy(alpha = .5f) else Color.Transparent)) {
                val gate = Offset(size.width * .656f, size.height * .424f)
                active?.let { spot ->
                    val route = campusRoute(spot.xp!!, spot.yp!!)
                    fun scale(point: MapPoint) = Offset((point.x / 1000 * size.width).toFloat(), (point.y / 750 * size.height).toFloat())
                    val control = scale(route.control); val point = scale(route.end)
                    val path = Path().apply { moveTo(gate.x, gate.y); quadraticTo(control.x, control.y, point.x, point.y) }
                    val unit = size.width / 1000
                    drawPath(path, Cargo.Accent.copy(alpha = .85f), style = Stroke(3.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(16 * unit, 12 * unit))))
                }
                val unit = size.width / 1000
                drawCircle(Color(0xff0c0906).copy(alpha = .6f), 13 * unit, gate)
                drawPath(Path().apply { moveTo(gate.x - 6 * unit, gate.y); lineTo(gate.x, gate.y - 6 * unit); lineTo(gate.x + 6 * unit, gate.y); lineTo(gate.x, gate.y + 6 * unit); close() }, Color(0xffffcf7a))
            }
            BoxWithConstraints(Modifier.fillMaxSize().clipToBounds()) {
                spots.filter { it.xp != null && it.yp != null }.forEach { spot ->
                    Box(Modifier.offset(x = maxWidth * (spot.xp!!.toFloat() / 100) - 12.dp, y = maxHeight * (spot.yp!!.toFloat() / 100) - 12.dp)
                        .size(24.dp).zIndex(if (activeId == spot.id) 1f else 0f).semantics { contentDescription = spot.name; selected = activeId == spot.id }
                        .clickable { activeId = if (activeId == spot.id) null else spot.id }, contentAlignment = Alignment.Center) {
                        Canvas(Modifier.size(12.dp)) { drawCircle(Cargo.Accent); drawCircle(Cargo.Paper, radius = size.minDimension / 5) }
                    }
                    if (wide || activeId == spot.id) {
                        var labelSize by remember(spot.id, spot.name) { mutableStateOf(IntSize.Zero) }
                        Text(spot.name.uppercase(), Modifier.testTag("pickup-label-${spot.id}").zIndex(if (activeId == spot.id) 1f else 0f).offset {
                            val centerX = maxWidth.toPx() * spot.xp.toFloat() / 100
                            val centerY = maxHeight.toPx() * spot.yp.toFloat() / 100
                            val gap = (if (wide) 20.dp else 18.dp).toPx()
                            IntOffset((centerX + if (spot.map_label == "left") -gap - labelSize.width else gap).roundToInt(),
                                (centerY - labelSize.height / 2f).roundToInt())
                        }.onSizeChanged { labelSize = it }.border(1.dp, Cargo.Accent.copy(alpha = .6f))
                            .background(Cargo.Panel.copy(alpha = .85f)).clickable { activeId = if (activeId == spot.id) null else spot.id }
                            .padding(horizontal = 8.dp, vertical = 4.dp), color = Color(0xffffcf7a),
                            style = TextStyle(fontFamily = Cargo.Mono, fontSize = 9.sp, lineHeight = 9.sp, letterSpacing = .72.sp),
                            softWrap = false, maxLines = 1)
                    }
                }
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            spots.forEach { spot -> Box(Modifier.testTag("pickup-select-${spot.id}").semantics { selected = activeId == spot.id }) {
                CargoButton(spot.name, { activeId = if (activeId == spot.id) null else spot.id }, secondary = activeId != spot.id)
            } }
        }
        active?.let { spot ->
            CargoPanel(Modifier.testTag("pickup-details-${spot.id}")) {
                val photo = spot.photo_path ?: when (spot.name.lowercase()) {
                    "maggi hotspot" -> "maggi_hotspot"
                    "southern stories" -> "southern_stories"
                    "d5 stage" -> "d5_stage"
                    "laundry" -> "laundry"
                    "quench" -> "quench"
                    else -> null
                }
                val resource = when (photo?.substringAfterLast('/')?.substringBeforeLast('.')?.replace('-', '_')) {
                    "maggi_hotspot" -> R.drawable.maggi_hotspot
                    "southern_stories" -> R.drawable.southern_stories
                    "d5_stage" -> R.drawable.d5_stage
                    "laundry" -> R.drawable.laundry
                    "quench" -> R.drawable.quench
                    else -> null
                }
                if (resource != null) AsyncImage(resource, spot.name, Modifier.fillMaxWidth().aspectRatio(3f / 4), contentScale = ContentScale.Crop)
                else if (photo?.startsWith("https://") == true) AsyncImage(photo, spot.name, Modifier.fillMaxWidth().aspectRatio(3f / 4), contentScale = ContentScale.Crop)
                CargoLabel("[ PICKUP POINT ]"); Text(spot.name.uppercase(), style = MaterialTheme.typography.titleMedium)
                CargoBody(spot.description.orEmpty())
                if (appVariant) { val count = counts[spot.id] ?: 0; CargoLabel("$count ${if (count == 1) "ITEM" else "ITEMS"} AVAILABLE") }
                CargoLabel("QUEUE OPEN")
                CargoButton(if (appVariant) "Browse items →" else "Open in catalog →", { browse(spot.id) }, secondary = true)
                Box(Modifier.semantics { contentDescription = "Close pickup details" }) { CargoButton("Close", { activeId = null }, secondary = true) }
            }
        }
        CargoLabel("PICKUP POINT · ROUTE FROM GATE 1", Cargo.Ink.copy(alpha = .5f))
    }
}
@Composable fun MapScreen(repository: BorrowRepository, browse: (String) -> Unit) {
    LoadScreen(Unit, {
        val locations = repository.locations().filter { it.xp != null && it.yp != null }
        val items = repository.client.from("items").select(Columns.raw("pickup_location_id")) { filter { eq("status", "available") } }.decodeList<JsonObject>()
        locations to items.mapNotNull { it["pickup_location_id"]?.jsonPrimitive?.contentOrNull }.groupingBy { it }.eachCount()
    }) { (spots, counts) -> ScreenColumn {
        CargoLabel("[ CAMPUS ROUTES ]"); CargoTitle("Pickup map")
        CargoBody("Choose a pickup point to trace the route from Gate 1 and browse its shelf.")
        if (spots.isEmpty()) CargoPanel { CargoBody("No pickup points mapped yet. A campus admin can place them on the board.") }
        else {
            CampusBoard(spots, counts, appVariant = true, browse)
            spots.forEach { spot -> Row(Modifier.fillMaxWidth().testTag("pickup-shelf-${spot.id}").border(1.dp, Cargo.Line).background(Cargo.Panel)
                .clickable { browse(spot.id) }.padding(20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(Modifier.weight(1f)) { CargoLabel(spot.name, Cargo.Ink); CargoBody(spot.description.orEmpty()) }
                val count = counts[spot.id] ?: 0; CargoLabel("$count ${if (count == 1) "ITEM" else "ITEMS"}")
            } }
        }
    } }
}

@Composable fun PinEditor(initial: PickupLocation?, onSave: (String, String, Double, Double, String, Boolean) -> Unit, busy: Boolean, sourceStyle: Boolean = false) {
    var name by rememberSaveable(initial?.id) { mutableStateOf(initial?.name.orEmpty()) }
    var description by rememberSaveable(initial?.id) { mutableStateOf(initial?.description.orEmpty()) }
    var xText by rememberSaveable(initial?.id) { mutableStateOf(initial?.xp?.toString() ?: "50") }
    var yText by rememberSaveable(initial?.id) { mutableStateOf(initial?.yp?.toString() ?: "42") }
    val x = xText.toFloatOrNull()?.takeIf { it.isFinite() }?.coerceIn(0f, 100f) ?: 50f
    val y = yText.toFloatOrNull()?.takeIf { it.isFinite() }?.coerceIn(0f, 100f) ?: 42f
    var label by rememberSaveable(initial?.id) { mutableStateOf(initial?.map_label ?: "right") }
    var active by rememberSaveable(initial?.id) { mutableStateOf(initial?.is_active ?: true) }
    var validation by rememberSaveable(initial?.id) { mutableStateOf<String?>(null) }
    val latestUpdate by rememberUpdatedState<(Offset, Float, Float) -> Unit>({ position, width, height ->
        xText = pinPercent(position.x, width).toString()
        yText = pinPercent(position.y, height).toString()
    })
    Column(Modifier.testTag("pin-editor-${initial?.id ?: "new"}"), verticalArrangement = Arrangement.spacedBy(if (sourceStyle) 20.dp else 12.dp)) {
        Column(Modifier.widthIn(max = if (sourceStyle) 448.dp else Dp.Unspecified)) {
        Box(Modifier.fillMaxWidth().aspectRatio(4f / 3).then(if (sourceStyle) Modifier.border(1.dp, Cargo.Line) else Modifier).testTag("pin-position").semantics {
            contentDescription = "Drag or tap to place the pin on the campus map"
            stateDescription = "X $xText percent, Y $yText percent"
        }.pointerInput(busy) {
            if (!busy) awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                down.consume(); latestUpdate(down.position, size.width.toFloat(), size.height.toFloat())
                do {
                    val change = awaitPointerEvent().changes.firstOrNull { it.id == down.id } ?: break
                    latestUpdate(change.position, size.width.toFloat(), size.height.toFloat()); change.consume()
                } while (change.pressed)
            }
        }) {
            CampusMapImage("Drag to place pickup pin", Modifier.fillMaxSize())
            Canvas(Modifier.fillMaxSize()) {
                val point = Offset(size.width * x / 100, size.height * y / 100)
                if (sourceStyle) { drawCircle(Color(0xFF0C0906), 6.dp.toPx(), point); drawCircle(Color(0xFFFFCF7A), 4.dp.toPx(), point) }
                else drawCircle(Cargo.Accent, 8.dp.toPx(), point)
            }
        }
        if (sourceStyle) Text("DRAG THE DOT TO PLACE THE PIN · ${"%.1f".format(java.util.Locale.ENGLISH, x)}% / ${"%.1f".format(java.util.Locale.ENGLISH, y)}%", Modifier.padding(top = 8.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
        else CargoLabel("DRAG THE DOT TO PLACE THE PIN — ${"%.1f".format(java.util.Locale.ENGLISH, x)}% / ${"%.1f".format(java.util.Locale.ENGLISH, y)}%", Cargo.Ink.copy(alpha = .4f))
        }
        if (sourceStyle) BoxWithConstraints(Modifier.fillMaxWidth()) {
            val availableWidth = maxWidth
            @Composable fun Name(modifier: Modifier) { Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) { Text("NAME", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f)); AdminInput("Name", name, { name = it }, Modifier.fillMaxWidth(), "e.g. Kathi Junction", 60) } }
            @Composable fun Coordinates() { Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AdminFieldLabel("X %") { AdminInput("X %", xText, { xText = it }, Modifier.width(96.dp), keyboard = KeyboardType.Decimal) }
                AdminFieldLabel("Y %") { AdminInput("Y %", yText, { yText = it }, Modifier.width(96.dp), keyboard = KeyboardType.Decimal) }
            } }
            @Composable fun Description(modifier: Modifier) { Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) { Text("DESCRIPTION", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f)); AdminInput("Description", description, { description = it }, Modifier.fillMaxWidth(), "Eatery counter in front of Block C1", 200) } }
            @Composable fun Labels() { AdminFieldLabel("LABEL SIDE") { AdminChoice("Label side", label, listOf("left" to "Left of the pin", "right" to "Right of the pin"), { label = it }, Modifier.width(134.dp)) } }
            @Composable fun Visibility() { Row(Modifier.padding(bottom = 10.dp).toggleable(active, role = Role.Checkbox, onValueChange = { active = it }).semantics { contentDescription = "VISIBILITY: ${if (active) "ON THE BOARD" else "HIDDEN"}" }, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(16.dp).background(if (active) Cargo.Accent else Cargo.Panel).border(1.dp, if (active) Cargo.Accent else Cargo.Line), contentAlignment = Alignment.Center) {
                    if (active) Icon(painterResource(R.drawable.ic_check), null, Modifier.size(12.dp), tint = Cargo.Ink)
                }
                Text("ON THE BOARD", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
            } }
            Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
                if (availableWidth >= 440.dp) Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Bottom) { Name(Modifier.weight(1f)); Coordinates() }
                else Column(verticalArrangement = Arrangement.spacedBy(12.dp)) { Name(Modifier.fillMaxWidth()); Coordinates() }
                if (availableWidth >= 480.dp) Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Bottom) { Description(Modifier.weight(1f)); Labels(); Visibility() }
                else Column(verticalArrangement = Arrangement.spacedBy(12.dp)) { Description(Modifier.fillMaxWidth()); Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Bottom) { Labels(); Visibility() } }
            }
        } else {
        CargoField("Name", name, { if (it.length <= 60) name = it })
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            CargoField("X %", xText, { xText = it }, Modifier.weight(1f), keyboard = KeyboardOptions(keyboardType = KeyboardType.Decimal))
            CargoField("Y %", yText, { yText = it }, Modifier.weight(1f), keyboard = KeyboardOptions(keyboardType = KeyboardType.Decimal))
        }
        CargoField("Description", description, { if (it.length <= 200) description = it }, lines = 2)
        CargoChoice("Label side", label, listOf("left" to "Left", "right" to "Right"), { label = it })
        CargoChoice("Visibility", active.toString(), listOf("true" to "On the board", "false" to "Hidden"), { active = it.toBoolean() })
        }
        validation?.let { CargoLabel("[ $it ]", Cargo.Warn) }
        val save = {
            val px = xText.toDoubleOrNull() ?: Double.NaN; val py = yText.toDoubleOrNull() ?: Double.NaN
            validation = when {
                name.trim().length !in 3..60 -> "Pin name must be 3–60 characters."
                !px.isFinite() || !py.isFinite() || px !in 0.0..100.0 || py !in 0.0..100.0 -> "Map coordinates must be numbers from 0 to 100."
                else -> null
            }
            if (validation == null) onSave(name, description, px, py, label, active)
        }
        if (sourceStyle) AdminAction(if (initial == null) "Add pin" else "Save pin", save, enabled = !busy)
        else CargoButton(if (initial == null) "Add pin" else "Save pin", save, enabled = !busy)
    }
}
