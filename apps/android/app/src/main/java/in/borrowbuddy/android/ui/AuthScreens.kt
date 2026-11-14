package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.borrowbuddy.android.domain.Profile
import `in`.borrowbuddy.android.domain.Rules

private enum class AuthMode { SignIn, SignUp, Forgot }

@Composable fun AuthScreen(model: SessionViewModel, state: SessionState, back: () -> Unit) {
    var mode by rememberSaveable { mutableStateOf(if (state.resetNotice != null) AuthMode.Forgot else AuthMode.SignIn) }
    LaunchedEffect(state.resetNotice) { if (state.resetNotice != null) mode = AuthMode.Forgot }
    val signup = mode == AuthMode.SignUp
    var email by rememberSaveable { mutableStateOf("") }
    // Passwords stay in memory rather than the saved-state bundle.
    var password by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    var sentTo by rememberSaveable { mutableStateOf<String?>(null) }
    ScreenColumn {
        CargoButton("← BorrowBuddy", back, secondary = true)
        CargoTitle(when (mode) { AuthMode.SignUp -> "Get your campus pass"; AuthMode.Forgot -> "Locked out?"; AuthMode.SignIn -> "Welcome back" })
        if (mode == AuthMode.Forgot) CargoPanel {
            CargoLabel("[ RESET PASS · LINKS WORK ONCE ]")
            val sent = sentTo
            if (sent != null) {
                CargoLabel("[ CHECK YOUR INBOX ]", Cargo.Accent)
                CargoBody("If $sent has a BorrowBuddy pass, a reset link is on its way. Open it on this phone: it brings you back here to choose a new password. It works once and expires in an hour.")
                CargoBody("Nothing after a few minutes? Check spam, or send it again. Only the newest link works.")
                CargoButton("Send it again", { model.requestPasswordReset(sent) {} }, secondary = true, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
            } else {
                CargoBody("Enter your college email. We'll send a one-time link that opens BorrowBuddy so you can choose a new password.")
                CargoField("Bennett email", email, { email = it }, keyboard = KeyboardOptions(keyboardType = KeyboardType.Email))
                CargoButton("Email me a reset link", { model.requestPasswordReset(email) { sentTo = email.trim().lowercase() } },
                    enabled = !state.busy && model.repository.configured, modifier = Modifier.fillMaxWidth().testTag("auth-send-reset"))
            }
            (state.error ?: state.resetNotice.takeIf { sent == null })?.let { CargoLabel("[ $it ]", Cargo.Warn) }
            if (state.busy) CircularProgressIndicator(color = Cargo.Accent)
            TextButton({ mode = AuthMode.SignIn; sentTo = null }, Modifier.testTag("auth-back-to-sign-in")) { CargoLabel("← Back to sign in") }
        } else CargoPanel {
            CargoLabel("[ BENNETT UNIVERSITY · VERIFIED STUDENTS ONLY ]")
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                CargoButton("Sign in", { mode = AuthMode.SignIn }, secondary = signup)
                CargoButton("Sign up", { mode = AuthMode.SignUp }, secondary = !signup)
            }
            CargoField("Bennett email", email, { email = it }, keyboard = KeyboardOptions(keyboardType = KeyboardType.Email))
            CargoField("Password", password, { password = it }, keyboard = KeyboardOptions(keyboardType = KeyboardType.Password),
                transform = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
                trailing = { TextButton({ visible = !visible }) { CargoLabel(if (visible) "Hide" else "Show") } })
            if (!signup) TextButton({ mode = AuthMode.Forgot; sentTo = null }, Modifier.testTag("auth-forgot-password")) { CargoLabel("Forgot password?") }
            if (signup) CargoField("Repeat password", confirmation, { confirmation = it }, keyboard = KeyboardOptions(keyboardType = KeyboardType.Password), transform = PasswordVisualTransformation())
            state.error?.let { CargoLabel("[ $it ]", Cargo.Warn) }
            if (!model.repository.configured) CargoBody("The app's Supabase configuration is missing. Configure the project before using account features.")
            CargoButton(if (signup) "Create account" else "Sign in", { model.authenticate(signup, email, password, confirmation) }, enabled = !state.busy && model.repository.configured, modifier = Modifier.fillMaxWidth())
            if (state.busy) CircularProgressIndicator(color = Cargo.Accent)
            CargoBody("Use your @bennett.edu.in account. An admin reviews your student ID before the portal unlocks.")
        }
    }
}

/** After a reset link signs you in: choose the new password before anything else. */
@Composable fun NewPasswordScreen(model: SessionViewModel, state: SessionState) {
    var password by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    ScreenColumn {
        CargoTitle("Choose a new password")
        CargoPanel {
            CargoLabel("[ RESET PASS${state.profile?.email?.takeIf { it.isNotBlank() }?.let { " · ${it.uppercase()}" }.orEmpty()} ]")
            CargoField("New password", password, { password = it }, keyboard = KeyboardOptions(keyboardType = KeyboardType.Password),
                transform = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
                trailing = { TextButton({ visible = !visible }) { CargoLabel(if (visible) "Hide" else "Show") } })
            CargoField("Repeat new password", confirmation, { confirmation = it }, keyboard = KeyboardOptions(keyboardType = KeyboardType.Password),
                transform = if (visible) VisualTransformation.None else PasswordVisualTransformation())
            CargoLabel("8+ CHARACTERS WITH AT LEAST ONE LETTER AND ONE NUMBER.", Cargo.Ink.copy(alpha = .4f))
            state.error?.let { CargoLabel("[ $it ]", Cargo.Warn) }
            CargoButton("Save new password", { model.setNewPassword(password, confirmation) }, enabled = !state.busy,
                modifier = Modifier.fillMaxWidth().testTag("reset-save-password"))
            if (state.busy) CircularProgressIndicator(color = Cargo.Accent)
            CargoBody("Saving signs you out on your other devices. You stay signed in here.")
            TextButton(model::skipNewPassword, enabled = !state.busy) { CargoLabel("Not now") }
        }
    }
}

private class ProfileDraft(name: String, phone: String, department: String, year: Int) {
    var name by mutableStateOf(name)
    var phone by mutableStateOf(phone)
    var department by mutableStateOf(department)
    var year by mutableIntStateOf(year)
}
@Composable private fun rememberProfileDraft(profile: Profile): ProfileDraft = rememberSaveable(profile.id,
    saver = listSaver(save = { listOf(it.name, it.phone, it.department, it.year.toString()) },
        restore = { ProfileDraft(it[0], it[1], it[2], it[3].toInt()) })) {
    ProfileDraft(profile.full_name, profile.phone.orEmpty(), profile.department ?: Rules.departments.first(), profile.year_of_study ?: 1)
}
@Composable private fun ProfileInputs(draft: ProfileDraft, phoneLabel: String = "Phone (optional)") {
    CargoField("Full name", draft.name, { if (it.length <= 80) draft.name = it })
    CargoField(phoneLabel, draft.phone, { if (it.length <= 10) draft.phone = it }, keyboard = KeyboardOptions(keyboardType = KeyboardType.Phone))
    CargoChoice("Department", draft.department, Rules.departments.map { it to it }, { draft.department = it })
    CargoChoice("Year of study", draft.year.toString(), (1..6).map { it.toString() to "Year $it" }, { draft.year = it.toInt() })
}
@Composable fun ProfileFields(profile: Profile, onSave: (String, String, String, Int) -> Unit, busy: Boolean, content: @Composable ColumnScope.() -> Unit = {}) {
    val draft = rememberProfileDraft(profile)
    CargoPanel {
        ProfileInputs(draft)
        content()
        CargoButton("Save and continue", { onSave(draft.name, draft.phone, draft.department, draft.year) }, enabled = !busy, modifier = Modifier.fillMaxWidth())
    }
}
@Composable fun CargoChoice(label: String, value: String, options: List<Pair<String, String>>, onSelect: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton({ expanded = true }, Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
            CargoBody("$label: ${options.find { it.first == value }?.second ?: "Choose"}", color = Cargo.Ink)
        }
        DropdownMenu(expanded, { expanded = false }) {
            options.forEach { (id, title) -> DropdownMenuItem(text = { CargoBody(title, color = Cargo.Ink) }, onClick = { onSelect(id); expanded = false }) }
        }
    }
}
@Composable fun OnboardingScreen(model: SessionViewModel, state: SessionState, profile: Profile) {
    var path by rememberSaveable(profile.id) { mutableStateOf(profile.student_id_path.orEmpty()) }
    val draft = rememberProfileDraft(profile)
    val needsId = profile.verification_status != "verified"
    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 48.dp),
        horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
      Column(Modifier.widthIn(max = 672.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(24.dp)) {
        CargoLabel("[ REGISTRATION · STEP 1 OF 2 ]"); CargoTitle("Board the network")
        CargoBody("Two minutes now saves a lot of awkwardness later. Tell us who you are and upload your student ID — a campus admin approves it before the portal unlocks.")
        CargoPanel(padding = 24.dp, spacing = 20.dp) {
            TicketTopBar()
            Text("WHO ARE YOU?", style = androidx.compose.ui.text.TextStyle(fontFamily = Cargo.Title, fontSize = 20.sp))
            ProfileInputs(draft, "Phone")
        }
        if (needsId) CargoPanel(padding = 24.dp, spacing = 20.dp) {
            Text("STUDENT ID · REQUIRED", style = androidx.compose.ui.text.TextStyle(fontFamily = Cargo.Title, fontSize = 20.sp))
            CargoBody("Upload a clear PNG or JPG photo of your Bennett University ID. A campus admin reviews it — the portal and your profile unlock only after approval.")
            UploadField(model.repository, profile.id, "student-ids", initial = listOfNotNull(path.takeIf { it.isNotBlank() }), max = 1) { path = it.firstOrNull().orEmpty() }
            CargoLabel("FRONT OF CARD · ALL 4 CORNERS VISIBLE · NO SCREENSHOTS · PNG OR JPG · UNDER 5MB. STORED PRIVATELY — ONLY YOU AND CAMPUS ADMINS CAN SEE IT.", Cargo.Ink.copy(alpha = .4f))
        }
        state.error?.let { CargoLabel("[ $it ]", Cargo.Warn) }
        CargoButton(if (state.busy) "Submitting…" else if (needsId) "Submit for admin approval →" else "Save my details →", {
            model.perform {
                require(!needsId || path.isNotBlank()) { "Upload a PNG or JPG photo of your student ID first." }
                model.repository.updateProfile(profile, draft.name, draft.phone, draft.department, draft.year)
                if (needsId) model.repository.submitStudentId(path)
            }
        }, enabled = !state.busy && (!needsId || path.isNotBlank()))
        CargoLabel(if (!needsId) "YOUR ACCOUNT IS ALREADY VERIFIED." else if (path.isNotBlank()) "REPLACE THE PHOTO ANY TIME BEFORE APPROVAL." else "UPLOAD YOUR STUDENT ID TO CONTINUE.", Cargo.Ink.copy(alpha = .4f))
        CargoButton("Sign out", model::signOut, secondary = true, enabled = !state.busy)
      }
    }
}
@Composable fun PendingScreen(model: SessionViewModel, state: SessionState, profile: Profile) {
    var path by rememberSaveable { mutableStateOf("") }
    val rejected = profile.verification_status == "rejected"
    val suspended = profile.verification_status == "suspended"
    ScreenColumn {
        CargoPanel {
            CargoLabel(if (suspended) "[ ACCESS SUSPENDED ]" else if (rejected) "[ VERIFICATION FAILED ]" else "[ IN THE REVIEW QUEUE ]")
            CargoTitle(if (suspended) "Account on hold" else if (rejected) "Needs another look" else "Your ID is in the queue")
            CargoBody(profile.verification_note ?: if (suspended) "Contact the campus admin team to resolve this account hold." else "A campus admin reviews every student ID. The portal and your profile unlock when approved.")
            StatusBadge(profile.verification_status)
            if (rejected) {
                UploadField(model.repository, profile.id, "student-ids", max = 1) { path = it.firstOrNull().orEmpty() }
                CargoButton("Resubmit student ID", { model.perform { require(path.isNotBlank()) { "Upload a photo first." }; model.repository.submitStudentId(path) } }, enabled = !state.busy && path.isNotBlank())
            }
            state.error?.let { CargoLabel("[ $it ]", Cargo.Warn) }
            CargoButton("Refresh status", model::refresh, enabled = !state.busy)
            CargoButton("Sign out", model::signOut, enabled = !state.busy, secondary = true)
        }
    }
}
