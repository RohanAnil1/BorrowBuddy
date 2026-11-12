package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.data.BuddyMood
import `in`.borrowbuddy.android.domain.Profile
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/** Empty state with Parcel standing in for the icon, matching the web EmptyState. */
@Composable fun ParcelEmpty(mood: BuddyMood, code: String, title: String, body: String, modifier: Modifier = Modifier,
    action: (@Composable () -> Unit)? = null) {
    Column(modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line).padding(horizontal = 20.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        ParcelMascot(mood, 76.dp, interactive = false, description = null)
        Text("[ $code ]", Modifier.padding(top = 6.dp), style = loanMono(10), color = Cargo.Accent)
        Text(title.uppercase(), style = loanBody(24).copy(fontFamily = Cargo.Title, lineHeight = 26.sp), color = Cargo.Ink, textAlign = TextAlign.Center)
        Text(body, Modifier.widthIn(max = 380.dp), style = loanBody(13).copy(lineHeight = 20.sp), color = Cargo.Ink.copy(alpha = .75f), textAlign = TextAlign.Center)
        if (action != null) Box(Modifier.padding(top = 12.dp)) { action() }
    }
}

/** Items the student saved for later. Un-saving removes the card right away. */
@Composable fun SavedScreen(repository: BorrowRepository, profile: Profile, open: (String) -> Unit, browse: () -> Unit) {
    LoadScreen(profile.id, { repository.savedItems(profile.id) }) { initial ->
        var items by remember(initial) { mutableStateOf(initial) }
        val scope = rememberCoroutineScope()
        val available = items.count { it.status == "available" }
        LazyColumn(Modifier.fillMaxSize().testTag("saved-scroll"), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item(key = "intro") {
                Column {
                    Text("[ SAVED FOR LATER ]", style = loanMono(10), color = Cargo.Accent)
                    Text("SAVED ITEMS", Modifier.padding(top = 8.dp), style = loanBody(40).copy(fontFamily = Cargo.Title, lineHeight = 42.sp), color = Cargo.Ink)
                    if (items.isNotEmpty()) Text("${items.size} SAVED · $available AVAILABLE NOW", Modifier.padding(top = 4.dp), style = loanMono(10), color = Cargo.Ink.copy(alpha = .5f))
                }
            }
            if (items.isEmpty()) item(key = "empty") {
                ParcelEmpty(BuddyMood.Idle, "NOTHING SAVED", "No saved items yet",
                    "Tap the heart on any item to keep it here. Handy for things you'll need later in the semester.") {
                    CargoButton("Browse the shelf", browse)
                }
            }
            items(items, key = { it.id }) { item ->
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    ItemCard(item, repository, open, saved = true, toggleSave = {
                        val before = items
                        items = items.filterNot { it.id == item.id }
                        scope.launch {
                            try { repository.setSaved(profile.id, item.id, false) }
                            catch (cancelled: CancellationException) { throw cancelled }
                            catch (_: Exception) { items = before }
                        }
                    })
                    if (item.status != "available") Text("[ NOT AVAILABLE RIGHT NOW ]", style = loanMono(9), color = Cargo.Ink.copy(alpha = .5f))
                }
            }
        }
    }
}

