package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay

private const val GroupTitleMax = 80
private const val GroupDescriptionMax = 500

internal fun validateGroup(title: String, description: String) {
    require(title.trim().length in 1..GroupTitleMax) { "Give the group a name of up to $GroupTitleMax characters." }
    require(description.trim().length <= GroupDescriptionMax) { "Keep the description under $GroupDescriptionMax characters." }
}

@Composable private fun GroupVisibilityChoice(value: String, change: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("WHO CAN JOIN", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
        listOf("open" to "Open — any verified student can find, read, join and leave it.",
            "invite" to "Invite-only — hidden; only members you add can read and post.").forEach { (key, label) ->
            Row(Modifier.fillMaxWidth().selectable(value == key, role = Role.RadioButton) { change(key) }.padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RadioButton(value == key, null, colors = RadioButtonDefaults.colors(selectedColor = Cargo.Accent))
                Text(label, style = loanBody(13), color = Cargo.Ink)
            }
        }
    }
}

@Composable private fun GroupSettingsForm(initial: AdminGroup?, busy: Boolean, submitLabel: String,
    save: (title: String, description: String, visibility: String, archived: Boolean) -> Unit) {
    var title by rememberSaveable(initial?.id) { mutableStateOf(initial?.title.orEmpty()) }
    var description by rememberSaveable(initial?.id) { mutableStateOf(initial?.description.orEmpty()) }
    var visibility by rememberSaveable(initial?.id) { mutableStateOf(initial?.visibility ?: "open") }
    var archived by rememberSaveable(initial?.id) { mutableStateOf(initial?.archived_at != null) }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        AdminFieldLabel("NAME") { AdminInput("Group name", title, { title = it }, Modifier.fillMaxWidth().testTag("group-title"), "Photography club", GroupTitleMax) }
        AdminFieldLabel("DESCRIPTION (OPTIONAL)") { AdminInput("Group description", description, { description = it }, Modifier.fillMaxWidth().testTag("group-description"), "What the group is for", GroupDescriptionMax) }
        GroupVisibilityChoice(visibility) { visibility = it }
        if (initial != null) Row(Modifier.fillMaxWidth().toggleable(archived, role = Role.Checkbox) { archived = it }.padding(vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Checkbox(archived, null, colors = CheckboxDefaults.colors(checkedColor = Cargo.Accent))
            Text("Archived — members keep the history read-only; nobody can post or join.", style = loanBody(13), color = Cargo.Ink)
        }
        AdminAction(submitLabel, { save(title, description, visibility, archived) }, Modifier.testTag("group-save"), enabled = !busy)
    }
}

@Composable fun AdminGroupsScreen(repository: BorrowRepository, profile: Profile, open: (String) -> Unit) {
    if (!profile.is_admin) { ScreenColumn { CargoLabel("[ ADMIN ACCESS REQUIRED ]", Cargo.Warn) }; return }
    val actions = rememberActions()
    LoadScreen(profile.id, { repository.adminGroups() }, refreshKey = actions.revision) { groups ->
        Box(Modifier.fillMaxSize().imePadding(), contentAlignment = Alignment.TopCenter) {
            LazyColumn(Modifier.widthIn(max = 896.dp).fillMaxSize().testTag("admin-groups"), contentPadding = PaddingValues(16.dp, 32.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item("header") {
                    Text("[ CONTROL ROOM — ADMIN ONLY ]", style = loanMono(10), color = Cargo.Accent)
                    Text("GROUP CHATS", Modifier.padding(top = 12.dp).semantics { heading() }, style = sourceDisplayTitleStyle(), color = Cargo.Ink)
                    Text("Campus-wide groups for clubs, hostels and courses. Open groups appear in every verified student’s Messages; invite-only groups only to the members you add.",
                        Modifier.padding(top = 8.dp), style = loanBody(13), color = Cargo.Ink.copy(alpha = .7f))
                    val active = groups.count { it.archived_at == null }
                    Text("[ GROUPS ]  $active ACTIVE · ${groups.size - active} ARCHIVED", Modifier.padding(top = 24.dp), style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f))
                    Spacer(Modifier.height(4.dp)); ActionFeedback(actions)
                }
                if (groups.isEmpty()) item("empty") {
                    Text("NO GROUPS YET. CREATE THE FIRST ONE BELOW.", Modifier.fillMaxWidth().border(1.dp, Cargo.Line).background(Cargo.Panel).padding(24.dp),
                        style = loanMono(10), color = Cargo.Ink.copy(alpha = .5f))
                }
                items(groups, key = { it.id }) { group ->
                    Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line)
                        .clickable(role = Role.Button) { open("admin/groups/${group.id}") }.padding(18.dp).testTag("admin-group-${group.id}")) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(group.title, Modifier.weight(1f, fill = false), style = loanBody(15).copy(fontFamily = Cargo.Strong), color = Cargo.Ink,
                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(if (group.archived_at != null) "ARCHIVED" else if (group.visibility == "invite") "INVITE-ONLY" else "OPEN",
                                Modifier.border(1.dp, Cargo.Line).padding(horizontal = 6.dp, vertical = 2.dp), style = loanMono(8),
                                color = if (group.visibility == "open" && group.archived_at == null) Cargo.Accent else Cargo.Ink.copy(alpha = .6f))
                        }
                        group.description?.let { Text(it, Modifier.padding(top = 4.dp), style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f), maxLines = 2, overflow = TextOverflow.Ellipsis) }
                        Text("${group.member_count} MEMBERS · ${group.message_count} MESSAGES · ${group.last_message_at?.let { "LAST ${loanRelativeTime(it)}" } ?: "NO MESSAGES"}",
                            Modifier.padding(top = 8.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                    }
                }
                item("create") {
                    Column(Modifier.fillMaxWidth().padding(top = 24.dp).background(Cargo.Panel).border(1.dp, Cargo.Line).padding(18.dp).testTag("admin-create-group")) {
                        Text("[ CREATE A GROUP ]", Modifier.padding(bottom = 14.dp), style = loanMono(10), color = Cargo.Ink.copy(alpha = .6f))
                        GroupSettingsForm(null, actions.busy, "Create group") { title, description, visibility, _ ->
                            actions.run("Group created.") {
                                validateGroup(title, description)
                                repository.initialize()
                                open("admin/groups/${repository.createGroup(title, description, visibility)}")
                            }
                        }
                        Text("YOU JOIN EVERY GROUP YOU CREATE. ADD MEMBERS ON THE GROUP’S PAGE.", Modifier.padding(top = 12.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
                    }
                }
            }
        }
    }
}

private data class AdminGroupData(val group: AdminGroup?, val members: List<GroupMember>)

@Composable fun AdminGroupScreen(repository: BorrowRepository, profile: Profile, id: String, open: (String) -> Unit, back: () -> Unit) {
    if (!profile.is_admin) { ScreenColumn { CargoLabel("[ ADMIN ACCESS REQUIRED ]", Cargo.Warn) }; return }
    val actions = rememberActions()
    var query by rememberSaveable { mutableStateOf("") }
    var results by remember { mutableStateOf<List<Profile>?>(null) }
    var deleting by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(query, actions.revision) {
        if (query.trim().length < 2) { results = null; return@LaunchedEffect }
        delay(300)
        results = try { repository.searchStudents(query) } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled } catch (_: Exception) { emptyList() }
    }
    LoadScreen(id, { coroutineScope {
        val groups = async { repository.adminGroups() }; val members = async { repository.groupMembers(id) }
        AdminGroupData(groups.await().firstOrNull { it.id == id }, members.await())
    } }, refreshKey = actions.revision) { data ->
        val group = data.group ?: run { ScreenColumn { CargoLabel("[ GROUP NOT FOUND ]", Cargo.Warn) }; return@LoadScreen }
        if (deleting) AlertDialog(onDismissRequest = { deleting = false }, title = { CargoTitle("Delete this group?") },
            text = { CargoBody("“${group.title}” and its ${group.message_count} messages will be deleted for all ${group.member_count} members. This can’t be undone. To keep the history, archive it instead.") },
            confirmButton = { TextButton({ deleting = false; actions.run(refresh = false) { repository.deleteGroup(group.id); back() } }) { CargoLabel("Delete group", Cargo.Warn) } },
            dismissButton = { TextButton({ deleting = false }) { CargoLabel("Keep it") } })
        val memberIds = data.members.mapTo(hashSetOf()) { it.user_id }
        Box(Modifier.fillMaxSize().imePadding(), contentAlignment = Alignment.TopCenter) {
            LazyColumn(Modifier.widthIn(max = 896.dp).fillMaxSize().testTag("admin-group-page"), contentPadding = PaddingValues(16.dp, 32.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item("header") {
                    Text("[ GROUP — ${if (group.visibility == "invite") "INVITE-ONLY" else "OPEN"}${if (group.archived_at != null) " · ARCHIVED" else ""} ]", style = loanMono(10), color = Cargo.Accent)
                    Text(group.title, Modifier.padding(top = 12.dp).semantics { heading() }, style = loanBody(28).copy(fontFamily = Cargo.Strong), color = Cargo.Ink)
                    Text("${group.member_count} MEMBERS · ${group.message_count} MESSAGES", Modifier.padding(top = 6.dp), style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                    AdminAction("Open chat", { open("chat/${group.id}") }, Modifier.padding(top = 12.dp), AdminActionStyle.Secondary)
                    Spacer(Modifier.height(8.dp)); ActionFeedback(actions)
                }
                item("settings") {
                    Column(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(18.dp)) {
                        Text("[ SETTINGS ]", Modifier.padding(bottom = 14.dp), style = loanMono(10), color = Cargo.Ink.copy(alpha = .6f))
                        GroupSettingsForm(group, actions.busy, "Save changes") { title, description, visibility, archived ->
                            actions.run("Group saved.") { validateGroup(title, description); repository.updateGroup(group.id, title, description, visibility, archived) }
                        }
                    }
                }
                item("members-heading") { Text("[ MEMBERS ]  ${data.members.size}", Modifier.padding(top = 16.dp), style = loanMono(11), color = Cargo.Ink.copy(alpha = .6f)) }
                if (data.members.isEmpty()) item("no-members") { Text("Nobody is in this group yet.", style = loanBody(13), color = Cargo.Ink.copy(alpha = .6f)) }
                items(data.members, key = { "member-${it.user_id}" }) { member ->
                    Row(Modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Column(Modifier.weight(1f).clickable(role = Role.Button) { open("users/${member.user_id}") }) {
                            Text(member.full_name.ifBlank { "Campus member" }, style = loanBody(13), color = Cargo.Ink)
                            Text("${if (member.is_admin) "ADMIN · " else ""}JOINED ${loanRelativeTime(member.joined_at)}", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                        }
                        AdminAction("Remove", { actions.run("Member removed.") { repository.removeGroupMember(group.id, member.user_id) } },
                            style = AdminActionStyle.Danger, enabled = !actions.busy, fontSize = 11, verticalPadding = 6.dp)
                    }
                }
                item("add") {
                    Column(Modifier.fillMaxWidth().padding(top = 6.dp).background(Cargo.Panel).border(1.dp, Cargo.Line).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("[ ADD A VERIFIED STUDENT ]", style = loanMono(10), color = Cargo.Ink.copy(alpha = .6f))
                        AdminInput("Search students by name", query, { query = it }, Modifier.fillMaxWidth().testTag("group-member-search"), "Search by name", 60)
                        results?.let { found ->
                            val candidates = found.filter { it.id !in memberIds }
                            if (candidates.isEmpty()) Text("No verified students match who aren’t already members.", style = loanBody(12), color = Cargo.Ink.copy(alpha = .6f))
                            candidates.forEach { student ->
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Column(Modifier.weight(1f)) {
                                        Text(student.full_name, style = loanBody(13), color = Cargo.Ink)
                                        Text(listOfNotNull(student.department, student.year_of_study?.let { "Year $it" }).joinToString(" · "), style = loanBody(11), color = Cargo.Ink.copy(alpha = .5f))
                                    }
                                    AdminAction("Add", { actions.run("Member added.") { repository.addGroupMember(group.id, student.id) } },
                                        style = AdminActionStyle.Secondary, enabled = !actions.busy, fontSize = 11, verticalPadding = 6.dp)
                                }
                            }
                        }
                        Text("ADDED STUDENTS GET A NOTIFICATION. IN AN OPEN GROUP, A REMOVED STUDENT CAN JOIN AGAIN — MAKE IT INVITE-ONLY TO KEEP SOMEONE OUT.",
                            style = loanMono(9), color = Cargo.Ink.copy(alpha = .4f))
                    }
                }
                item("delete") {
                    Column(Modifier.fillMaxWidth().padding(top = 24.dp).border(1.dp, Cargo.Warn.copy(alpha = .4f)).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("[ DELETE GROUP ]", style = loanMono(10), color = Cargo.Warn)
                        Text("Deletes the group and every message in it for everyone.", style = loanBody(13), color = Cargo.Ink.copy(alpha = .7f))
                        AdminAction("Delete group", { deleting = true }, style = AdminActionStyle.Danger, enabled = !actions.busy)
                    }
                }
            }
        }
    }
}
