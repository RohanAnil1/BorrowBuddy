package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.*
import kotlinx.serialization.json.*
import kotlinx.coroutines.async

@Composable fun AdminScreen(repository: BorrowRepository, profile: Profile, openLoan: (String) -> Unit, openGroups: () -> Unit = {}) {
    if (!profile.is_admin) { ScreenColumn { CargoLabel("[ ADMIN ACCESS REQUIRED ]", Cargo.Warn) }; return }
    val actions = rememberActions()
    LoadScreen(profile.id, { kotlinx.coroutines.coroutineScope {
        val profiles = async { repository.pendingProfiles() }; val incidents = async { repository.incidents() }
        val fines = async { repository.fines() }; val locations = async { repository.locations(admin = true) }
        AdminData(profiles.await(), incidents.await(), fines.await(), locations.await())
    } }, refreshKey = actions.revision) { data -> AdminContent(data, repository, actions, openGroups, openLoan) }
}
internal suspend fun savePin(repository: BorrowRepository, id: String?, name: String, description: String, x: Double, y: Double, label: String, active: Boolean) {
    require(name.trim().length in 3..60) { "Pin name must be 3–60 characters." }
    require(description.trim().length <= 200) { "Description must be at most 200 characters." }
    require(x.isFinite() && y.isFinite() && x in 0.0..100.0 && y in 0.0..100.0) { "Map coordinates must be numbers from 0 to 100." }
    require(label in setOf("left", "right")) { "Choose a label side." }
    repository.initialize()
    repository.rpc("admin_save_pickup_location", buildJsonObject {
        put("p_id", id?.let(::JsonPrimitive) ?: JsonNull); put("p_name", name.trim()); put("p_description", description.trim())
        put("p_xp", x); put("p_yp", y); put("p_map_label", label); put("p_is_active", active)
    })
}
