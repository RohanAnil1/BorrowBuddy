package `in`.borrowbuddy.android.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.error
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import `in`.borrowbuddy.android.data.BorrowRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay

class ScreenActions(private val scope: kotlinx.coroutines.CoroutineScope) {
    var busy by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    var success by mutableStateOf<String?>(null); private set
    var revision by mutableIntStateOf(0); private set
    fun run(message: String? = null, refresh: Boolean = true, action: suspend () -> Unit) {
        if (busy) return
        scope.launch {
            busy = true; error = null; success = null
            try { action(); success = message; if (refresh) revision++ }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { error = friendlyError(failure) }
            finally { busy = false }
        }
    }
}
fun friendlyError(failure: Throwable): String = when (failure) {
    is java.io.IOException -> "Connection unavailable. Check your network and try again."
    else -> failure.message?.substringBefore("URL:")?.take(600) ?: "Something went wrong. Please try again."
}
@Composable fun rememberActions(): ScreenActions {
    val scope = rememberCoroutineScope()
    return remember(scope) { ScreenActions(scope) }
}
@Composable fun ActionFeedback(actions: ScreenActions) {
    actions.error?.let { message -> CargoLabel("[ $message ]", Cargo.Warn,
        Modifier.semantics { liveRegion = LiveRegionMode.Polite; error(message) }) }
    actions.success?.let { CargoLabel("[ $it ]", modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
    if (actions.busy) CircularProgressIndicator(Modifier.size(24.dp), color = Cargo.Accent, strokeWidth = 2.dp)
}

@Composable fun ScreenColumn(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp), content = content)
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable fun <T> LoadScreen(key: Any?, load: suspend () -> T, refreshKey: Any? = null, inline: Boolean = false, content: @Composable (T) -> Unit) {
    var data by remember(key) { mutableStateOf<T?>(null) }
    var pulling by remember(key) { mutableStateOf(false) }
    var error by remember(key) { mutableStateOf<String?>(null) }
    var offline by remember(key) { mutableStateOf(false) }
    var retry by remember(key) { mutableIntStateOf(0) }
    val portalRevision = LocalPortalRevision.current
    LaunchedEffect(key, retry, portalRevision, refreshKey) {
        error = null; offline = false
        try { data = load() }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) { if (data == null) { error = friendlyError(failure); offline = connectionFailure(failure) } }
        finally { pulling = false }
    }
    when {
        offline && !inline -> OfflineScreen(retry = { retry++ })
        error != null && inline -> CargoPanel { CargoLabel("[ CONNECTION UNAVAILABLE ]", Cargo.Warn); CampusCopy(error!!); CargoButton("Retry availability", { retry++ }) }
        error != null -> ScreenColumn {
            CargoPanel { CargoLabel("[ ROUTE UNAVAILABLE ]", Cargo.Warn); CargoBody(error!!); CargoButton("Try again", { retry++ }) }
        }
        data == null -> Column(Modifier.fillMaxWidth().padding(32.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            CargoLabel("[ LOADING THE SHELF ]"); CircularProgressIndicator(color = Cargo.Accent)
        }
        // Pull down to reload; Parcel thinks while the screen catches up.
        inline -> content(data!!)
        else -> {
            val pull = androidx.compose.material3.pulltorefresh.rememberPullToRefreshState()
            androidx.compose.material3.pulltorefresh.PullToRefreshBox(pulling, { pulling = true; retry++ }, Modifier.fillMaxSize().testTag("pull-refresh"), state = pull,
                indicator = {
                    androidx.compose.material3.pulltorefresh.PullToRefreshDefaults.Indicator(pull, pulling, Modifier.align(androidx.compose.ui.Alignment.TopCenter),
                        containerColor = Cargo.Panel, color = Cargo.Accent)
                }) { content(data!!) }
        }
    }
}

@Composable fun UploadField(repository: BorrowRepository, userId: String, bucket: String, initial: List<String> = emptyList(), max: Int = 6, onUploadingChange: (Boolean) -> Unit = {}, onPaths: (List<String>) -> Unit) {
    var paths by rememberSaveable { mutableStateOf(ArrayList(initial)) }
    val actions = rememberActions()
    fun uploadSelection(uris: List<Uri>) {
        if (uris.isEmpty()) return
        actions.run {
          onUploadingChange(true)
          try {
            // Upload sequentially to bound memory and retain successful photos if a later upload fails.
            var lastFailure: Exception? = null
            for (uri in uris.take((max - paths.size).coerceAtLeast(0))) {
                try {
                    val path = repository.upload(uri, bucket, userId)
                    paths = ArrayList(paths + path)
                    onPaths(paths)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    lastFailure = failure
                }
            }
            lastFailure?.let { throw it }
          } finally { onUploadingChange(false) }
        }
    }
    val singlePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        uploadSelection(listOfNotNull(uri))
    }
    val multiplePicker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(max.coerceAtLeast(2))) { uris ->
        uploadSelection(uris)
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        paths.forEach { path ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (bucket == "item-images") AsyncImage(repository.publicImage(path), "Uploaded photo", Modifier.size(80.dp))
                else PrivatePhoto(repository, bucket, path, Modifier.size(80.dp))
                CargoButton("Remove", { paths = ArrayList(paths.filterNot { it == path }); onPaths(paths) }, enabled = !actions.busy, secondary = true)
            }
        }
        CargoButton(if (max - paths.size > 1) "Add photos" else "Add photo", {
            val room = max - paths.size
            if (room > 1) multiplePicker.launch(PickVisualMediaRequest(
                mediaType = ActivityResultContracts.PickVisualMedia.ImageOnly, maxItems = room, isOrderedSelection = true
            )) else singlePicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        }, enabled = !actions.busy && paths.size < max, secondary = true)
        CargoLabel(if (bucket == "student-ids") "PNG/JPG · 50 KB–5 MB · REQUIRED" else "UP TO $max PHOTOS · FIRST PHOTO IS THE COVER", Cargo.Ink.copy(alpha = .5f))
        ActionFeedback(actions)
    }
}
val PrivatePhotoLoaded = SemanticsPropertyKey<Boolean>("PrivatePhotoLoaded")
@Composable fun PrivatePhoto(repository: BorrowRepository, bucket: String, path: String, modifier: Modifier = Modifier, label: String? = null, previewScale: ContentScale = ContentScale.Fit,
    labelContent: (@Composable (() -> Unit, Boolean) -> Unit)? = null) {
    var url by remember(bucket, path) { mutableStateOf<String?>(null) }
    var error by remember(bucket, path) { mutableStateOf(false) }
    var loaded by remember(url) { mutableStateOf(false) }
    var retry by remember(bucket, path) { mutableIntStateOf(0) }
    var expanded by rememberSaveable(bucket, path) { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(repository, bucket, path, retry, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                error = false
                try { url = repository.privateImage(path, bucket) }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { error = true }
                // Signed links live for 30 minutes. Refresh before expiration, and
                // immediately when returning from background, without a background timer.
                delay(25 * 60 * 1000L)
            }
        }
    }
    if (label != null) Column(modifier) {
        if (error) {
            CargoLabel("[ PHOTO UNAVAILABLE ]", Cargo.Warn)
            CargoButton("Retry photo", { retry++ }, secondary = true)
        } else if (labelContent != null) labelContent({ expanded = true }, url != null)
        else CargoButton(label, { expanded = true }, enabled = url != null, secondary = true)
    } else Box(modifier.semantics { this[PrivatePhotoLoaded] = loaded && !error }
        .clickable(enabled = loaded && !error) { expanded = true }, contentAlignment = Alignment.Center) {
        if (error) Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CargoLabel("[ PHOTO UNAVAILABLE ]", Cargo.Warn)
            CargoButton("Retry photo", { retry++ }, secondary = true)
        } else {
            url?.let { signed -> AsyncImage(signed, "Open private evidence photo", Modifier.fillMaxSize(),
                contentScale = previewScale, onSuccess = { loaded = true }, onError = { loaded = false; error = true }) }
            if (!loaded) CircularProgressIndicator(Modifier.size(24.dp), color = Cargo.Accent, strokeWidth = 2.dp)
        }
    }
    if (expanded && url != null) Dialog(
        onDismissRequest = { expanded = false },
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Column(Modifier.fillMaxSize().background(Cargo.Panel).safeDrawingPadding().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                CargoLabel("[ PRIVATE EVIDENCE ]")
                CargoButton("Close", { expanded = false }, secondary = true)
            }
            var fullLoaded by remember(url) { mutableStateOf(false) }
            Box(Modifier.fillMaxWidth().weight(1f).testTag("private-evidence-full")
                .semantics { this[PrivatePhotoLoaded] = fullLoaded && !error }, contentAlignment = Alignment.Center) {
                if (error) Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CargoLabel("[ PHOTO UNAVAILABLE ]", Cargo.Warn)
                    CargoButton("Retry photo", { retry++ }, secondary = true)
                } else {
                    AsyncImage(url, "Private evidence photo", Modifier.fillMaxSize(), contentScale = ContentScale.Fit,
                        onSuccess = { fullLoaded = true }, onError = { fullLoaded = false; error = true })
                    if (!fullLoaded) CircularProgressIndicator(Modifier.size(24.dp), color = Cargo.Accent, strokeWidth = 2.dp)
                }
            }
        }
    }
}
