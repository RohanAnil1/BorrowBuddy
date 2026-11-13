package `in`.borrowbuddy.android.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import io.github.jan.supabase.postgrest.from
import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.time.Instant

@Composable fun LoanRow(loan: Loan, userId: String, open: (String) -> Unit) {
    CargoPanel(Modifier.testTag("loan-${loan.id}")) {
        Text(loan.item?.title.orEmpty().uppercase(), style = MaterialTheme.typography.titleMedium)
        CargoBody(if (loan.owner_id == userId) "TO ${loan.borrower?.full_name.orEmpty()}" else "FROM ${loan.owner?.full_name.orEmpty()}")
        CargoLabel("${loan.start_date} → ${loan.due_date}", Cargo.Ink.copy(alpha = .6f))
        LoanStatusBadge(loan.status)
        CargoButton("Open loan →", { open(loan.id) }, secondary = true)
    }
}
private data class LoanData(val loan: Loan, val reviews: List<Review>, val incidents: List<Incident>, val conversation: Conversation?)
@Composable fun LoanScreen(repository: BorrowRepository, profile: Profile, id: String, logbook: (Boolean) -> Unit, chat: (String) -> Unit) {
    val actions = rememberActions()
    var confirmedHandover by rememberSaveable(id, profile.id) { mutableStateOf<String?>(null) }
    var incidentFiled by rememberSaveable(id, profile.id) { mutableStateOf(false) }
    var confirmCancel by rememberSaveable(id) { mutableStateOf(false) }
    LoadScreen(id to actions.revision, { LoanData(repository.loan(id) ?: error("Loan not found."), repository.reviews(loanId = id), repository.incidents(id), repository.conversations().find { it.loan_id == id }) }) { (loan, reviews, incidents, conversation) ->
        val owner = loan.owner_id == profile.id
        val mine = reviews.find { it.reviewer_id == profile.id }
        LoanPage {
            Text("← BACK TO THE LOGBOOK", Modifier.clickable { logbook(owner) }, style = loanMono(10), color = Cargo.Ink.copy(alpha = .5f))
            FlowRow(Modifier.fillMaxWidth().padding(top = 24.dp), horizontalArrangement = Arrangement.SpaceBetween,
                verticalArrangement = Arrangement.spacedBy(16.dp), itemVerticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Column {
                    val viewport = androidx.compose.ui.platform.LocalWindowInfo.current.containerSize.width /
                        androidx.compose.ui.platform.LocalDensity.current.density
                    val titleSize = (viewport * .06f).coerceIn(40f, 64f)
                    Text(loan.item?.title.orEmpty().uppercase(), style = androidx.compose.ui.text.TextStyle(
                        fontFamily = Cargo.Title, fontSize = titleSize.sp, lineHeight = (titleSize * 1.05f).sp, letterSpacing = (titleSize * .01f).sp,
                        lineHeightStyle = androidx.compose.ui.text.style.LineHeightStyle(androidx.compose.ui.text.style.LineHeightStyle.Alignment.Center, androidx.compose.ui.text.style.LineHeightStyle.Trim.None)))
                    Text((if (owner) "ON LOAN TO ${loan.borrower?.full_name.orEmpty()}" else "BORROWED FROM ${loan.owner?.full_name.orEmpty()}").uppercase(),
                        Modifier.padding(top = 8.dp), style = loanMono(10), color = Cargo.Ink.copy(alpha = .5f))
                }
                LoanStatusBadge(loan.status)
            }
            Spacer(Modifier.height(32.dp))
            LoanFacts(loan, profile.id)
            Spacer(Modifier.height(16.dp))
            LoanCalendarButtons(loan, profile.id)
            Spacer(Modifier.height(24.dp))
            Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
            ExtensionPanel(repository, profile, loan, actions)
            if (confirmedHandover == "pickup" && loan.status in listOf("active", "return_pending", "overdue"))
                HandoverSuccess("Pickup confirmed. The item is now on loan.")
            if (confirmedHandover == "return" && loan.status == "returned" && mine == null)
                HandoverSuccess("Return confirmed. Leave a rating for the other student.")
            if (loan.status == "awaiting_pickup") HandoverPanel(repository, loan, "pickup", show = !owner, actions) { confirmedHandover = it }
            if (loan.status in listOf("active", "return_pending", "overdue")) HandoverPanel(repository, loan, "return", show = owner, actions) { confirmedHandover = it }
            if (loan.status in listOf("awaiting_pickup", "active", "return_pending", "overdue"))
                CampusAppointmentPicker(repository, loan.owner_id, if (loan.status == "awaiting_pickup") "pickup" else "return", loan = loan.id)
            if (loan.status == "returned") Column(Modifier.fillMaxWidth().testTag("loan-returned-banner").background(Cargo.Accent.copy(alpha = .05f))
                .then(Modifier.border(1.dp, Cargo.Accent.copy(alpha = .4f))).padding(25.dp)) {
                Text("[ RETURNED ${loan.returned_at?.let { loanRelativeTime(it) }.orEmpty()} ]", style = loanMono(11), color = Cargo.Accent)
                Text((if (mine != null) "You already rated this loan." else "Rate the other student so their trust score reflects how it went.").uppercase(),
                    Modifier.padding(top = 12.dp), style = loanBody(13), color = Cargo.Ink.copy(alpha = .6f))
            }
            conversation?.let { channel -> CargoPanel(Modifier.clickable { chat(channel.id) }, padding = 24.dp, spacing = 0.dp) {
                FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Column(Modifier.widthIn(max = 640.dp)) {
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(androidx.compose.ui.res.painterResource(`in`.borrowbuddy.android.R.drawable.ic_message_square), null, Modifier.size(16.dp), tint = Cargo.Accent)
                    Text("[ LOAN CHANNEL ]", style = loanMono(11), color = Cargo.Ink)
                }
                Text("Agree on a pickup spot and time with ${if (owner) loan.borrower?.full_name.orEmpty() else loan.owner?.full_name.orEmpty()}.".uppercase(),
                    Modifier.padding(top = 8.dp), style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f))
                }
                Text("OPEN →", style = loanMono(10), color = Cargo.Accent)
                }
            } }
            if (loan.status == "returned" && mine == null) ReviewPanel(repository, profile, loan, actions)
            if (loan.status in listOf("active", "return_pending", "overdue", "disputed", "lost"))
                IncidentPanel(repository, profile, loan.id, actions, incidentFiled) { incidentFiled = true }
            if (incidents.isNotEmpty()) CargoPanel(padding = 24.dp, spacing = 16.dp) {
                Text("[ REPORTS ]", style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f))
                incidents.forEach { incident -> CargoPanel(padding = 16.dp, spacing = 8.dp) {
                    Text(incident.type.replace('_', ' ').uppercase(), style = loanBody(13).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
                    Text("BY ${incident.reporter?.full_name.orEmpty().ifBlank { "A PARTY" }}".uppercase(), style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                    CargoBody(incident.description)
                    incident.resolution_note?.let { CargoBody("ADMIN: $it", Modifier.border(1.dp, Cargo.Line).padding(horizontal = 12.dp, vertical = 8.dp)) }
                    Text(loanRelativeTime(incident.created_at), style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
                    StatusBadge(incident.status)
                } }
            }
            mine?.let { review -> CargoPanel(padding = 24.dp) {
                Text("[ YOUR RATING ]", style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f))
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(Modifier.semantics { contentDescription = "${review.rating} out of 5 stars" }, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        (1..5).forEach { star -> Icon(androidx.compose.ui.res.painterResource(if (star <= review.rating) `in`.borrowbuddy.android.R.drawable.ic_star_filled else `in`.borrowbuddy.android.R.drawable.ic_star),
                            null, Modifier.size(20.dp), tint = if (star <= review.rating) Cargo.Accent else Cargo.Ink.copy(alpha = .2f)) }
                    }
                    if (!review.comment.isNullOrBlank()) Text("“${review.comment}”".uppercase(), Modifier.weight(1f), style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f))
                }
            } }
            if (loan.status == "awaiting_pickup") CargoPanel(padding = 24.dp) {
                CargoLabel("[ ABORT DISPATCH? ]", Cargo.Ink)
                CargoBody(if (owner) "If the borrower doesn't show up, cancel the loan so others can book." else "You can cancel any time before pickup.")
                CargoButton("Cancel loan", { confirmCancel = true }, enabled = !actions.busy, secondary = true, modifier = Modifier.testTag("loan-cancel"))
                if (confirmCancel) AlertDialog(onDismissRequest = { confirmCancel = false }, title = { CargoTitle("Cancel this loan?") },
                    text = { CargoBody(if (owner) "The borrower will be notified and the dates open up for others." else "The owner will be notified. You'll need to request again if you change your mind.") },
                    confirmButton = { TextButton({ confirmCancel = false; actions.run { repository.rpc("cancel_loan", buildJsonObject { put("p_loan_id", id); put("p_reason", JsonNull) }) } },
                        Modifier.testTag("loan-cancel-confirm")) { CargoLabel("Cancel loan", Cargo.Warn) } },
                    dismissButton = { TextButton({ confirmCancel = false }) { CargoLabel("Keep it") } })
            }
            CustodyTimeline(loan)
            ActionFeedback(actions)
            }
        }
    }
}
@Composable private fun HandoverPanel(repository: BorrowRepository, loan: Loan, kind: String, show: Boolean, actions: ScreenActions, confirmed: (String) -> Unit) {
    var code by rememberSaveable(loan.id, kind) { mutableStateOf<String?>(null) }
    var token by rememberSaveable(loan.id, kind) { mutableStateOf("") }
    var expiresAt by rememberSaveable(loan.id, kind) { mutableStateOf<Long?>(null) }
    val expires = expiresAt?.let(Instant::ofEpochMilli)
    var now by remember { mutableStateOf(Instant.now()) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val focus = androidx.compose.ui.platform.LocalFocusManager.current
    val keyboardController = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    LaunchedEffect(expiresAt, lifecycle) {
        if (expires != null) lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            do { now = Instant.now(); if (now < expires) kotlinx.coroutines.delay(1000) } while (now < expires)
        }
    }
    var scanError by remember(loan.id, kind) { mutableStateOf<String?>(null) }
    fun confirm(entered: String) = actions.run("${kind.replaceFirstChar(Char::uppercase)} confirmed.") {
        repository.confirmHandover(loan.id, entered, kind)
        token = ""
        confirmed(kind)
    }
    // A good scan fills the code and confirms at once; a wrong QR explains itself.
    val scan = rememberQrScanner({ raw ->
        val result = parseHandoverQr(raw, kind)
        scanError = scanProblem(result, kind)
        if (result is HandoverScan.Code) { token = result.code; focus.clearFocus(); keyboardController?.hide(); confirm(result.code) }
    }, { scanError = it })
    CargoPanel {
        CargoLabel("[ ${kind.uppercase()} HANDOVER ]")
        if (show) {
            CargoBody("Show this pass to the other student. They scan the QR or type the code. It works once, for 15 minutes.")
            HandoverPassCard(kind, code, expires, now, actions.busy) { actions.run(refresh = false) {
                code = repository.rpc("generate_handover_token", buildJsonObject { put("p_loan_id", loan.id); put("p_kind", kind) }).decodeAs<String>()
                val refreshed = repository.loan(loan.id) ?: error("Loan is no longer available.")
                val serverExpiry = if (kind == "pickup") refreshed.handover_token_expires_at else refreshed.return_token_expires_at
                expiresAt = Instant.parse(serverExpiry ?: error("The code expiry could not be loaded. Generate a fresh code.")).toEpochMilli()
                now = Instant.now()
            } }
        } else {
            CargoBody("Ask for their $kind pass, then scan the QR on their phone.")
            HandoverConfirmCard(kind, token, { token = it; scanError = null }, actions.busy, scanError, scan, { confirm(token) })
        }
    }
}
@Composable internal fun QrTile(payload: String) {
    var bitmap by remember(payload) { mutableStateOf<Bitmap?>(null) }
    val ring = remember { mutableFloatStateOf(1f) }
    val ringClock = remember { floatArrayOf(0f) }
    val reduced = rememberReducedMotion()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(reduced, lifecycle) {
        if (reduced) ring.floatValue = 1f else lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            var previous = 0L
            val ease = androidx.compose.animation.core.CubicBezierEasing(.42f, 0f, .58f, 1f)
            while (true) {
                androidx.compose.animation.core.withInfiniteAnimationFrameNanos { frame ->
                    if (previous != 0L) ringClock[0] = (ringClock[0] + ((frame - previous) / 1_000_000f).coerceIn(0f, 64f)) % 2200f
                    previous = frame
                    val phase = ringClock[0] / 1100f
                    ring.floatValue = if (phase < 1f) 1f - .5f * ease.transform(phase)
                        else .5f + .5f * ease.transform(phase - 1f)
                }
            }
        }
    }
    LaunchedEffect(payload) {
        bitmap = withContext(Dispatchers.Default) {
            val matrix = MultiFormatWriter().encode(payload, BarcodeFormat.QR_CODE, 416, 416, mapOf(
                com.google.zxing.EncodeHintType.ERROR_CORRECTION to com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.M,
                com.google.zxing.EncodeHintType.MARGIN to 2
            ))
            val pixels = IntArray(416 * 416) { index -> if (matrix[index % 416, index / 416]) android.graphics.Color.BLACK else android.graphics.Color.WHITE }
            Bitmap.createBitmap(pixels, 416, 416, Bitmap.Config.ARGB_8888)
        }
    }
    bitmap?.let { Image(it.asImageBitmap(), "Single-use handover QR", Modifier.testTag("handover-qr").size(232.dp)
        .drawBehind {
            // Scanner-style corner brackets that breathe with the pulse.
            val inset = 8.dp.toPx(); val arm = 28.dp.toPx(); val stroke = 4.dp.toPx()
            val color = Cargo.Accent.copy(alpha = ring.floatValue)
            val l = -inset; val t = -inset; val r = size.width + inset; val b = size.height + inset
            fun corner(x: Float, y: Float, dx: Float, dy: Float) {
                drawLine(color, androidx.compose.ui.geometry.Offset(x, y), androidx.compose.ui.geometry.Offset(x + dx * arm, y), stroke, androidx.compose.ui.graphics.StrokeCap.Round)
                drawLine(color, androidx.compose.ui.geometry.Offset(x, y), androidx.compose.ui.geometry.Offset(x, y + dy * arm), stroke, androidx.compose.ui.graphics.StrokeCap.Round)
            }
            corner(l, t, 1f, 1f); corner(r, t, -1f, 1f); corner(l, b, 1f, -1f); corner(r, b, -1f, -1f)
        }.background(androidx.compose.ui.graphics.Color.White, androidx.compose.foundation.shape.RoundedCornerShape(8.dp)).padding(12.dp)) }
}
@Composable private fun ReviewPanel(repository: BorrowRepository, profile: Profile, loan: Loan, actions: ScreenActions) {
    var rating by rememberSaveable { mutableIntStateOf(0) }
    var comment by rememberSaveable { mutableStateOf("") }
    CargoPanel {
        CargoLabel("[ RATE THE OTHER STUDENT ]")
        Row { (1..5).forEach { number -> TextButton({ rating = number }, Modifier.semantics { contentDescription = "Rate $number stars" }) { Text(if (number <= rating) "★" else "☆", color = Cargo.Accent, fontSize = 26.sp) } } }
        CargoField("Comment (optional)", comment, { if (it.length <= 500) comment = it }, lines = 3)
        CargoButton("Submit rating", { actions.run("Your rating is on their profile.") {
            repository.client.from("reviews").insert(buildJsonObject {
                put("loan_id", loan.id); put("reviewer_id", profile.id)
                put("reviewee_id", if (loan.owner_id == profile.id) loan.borrower_id else loan.owner_id)
                put("role", if (loan.owner_id == profile.id) "as_owner" else "as_borrower"); put("rating", rating); put("comment", comment)
            })
        } }, enabled = !actions.busy && rating in 1..5)
    }
}
