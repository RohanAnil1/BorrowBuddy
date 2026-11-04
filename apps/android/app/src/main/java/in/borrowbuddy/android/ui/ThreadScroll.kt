package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.interaction.collectIsDraggedAsState
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import kotlinx.coroutines.flow.collectLatest

internal class ThreadScrollState(val list: LazyListState, val following: MutableState<Boolean>) {
    fun pauseFollowing() { following.value = false }
}

@Composable internal fun rememberThreadScroll(messageCount: Int, hasOlder: Boolean, request: Int): ThreadScrollState {
    val list = rememberLazyListState()
    val following = rememberSaveable { mutableStateOf(true) }
    var observedRequest by rememberSaveable { mutableIntStateOf(-1) }
    val dragged by list.interactionSource.collectIsDraggedAsState()
    LaunchedEffect(dragged) { if (dragged) following.value = false }
    LaunchedEffect(request) {
        if (request != observedRequest) {
            observedRequest = request
            following.value = true
        }
    }
    LaunchedEffect(list, request, messageCount, hasOlder, following.value) {
        if (!following.value || messageCount == 0) return@LaunchedEffect
        val expected = messageCount + if (hasOlder) 1 else 0
        // A send can finish before the new lazy item is measured, and the IME or
        // multiline composer can resize the viewport afterwards. Follow both.
        snapshotFlow { list.layoutInfo.totalItemsCount to list.layoutInfo.viewportSize.height }
            .collectLatest { (count, height) ->
                if (count >= expected && height > 0 && following.value) {
                    // The website uses scrollIntoView without smooth behavior.
                    list.scrollToItem(expected - 1)
                }
            }
    }
    return remember(list, following) { ThreadScrollState(list, following) }
}
