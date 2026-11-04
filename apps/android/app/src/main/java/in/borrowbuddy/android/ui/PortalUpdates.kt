package `in`.borrowbuddy.android.ui

import io.github.jan.supabase.realtime.realtime

import androidx.compose.runtime.*
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import `in`.borrowbuddy.android.data.BorrowRepository
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.first
import androidx.compose.ui.semantics.SemanticsPropertyKey

val LocalPortalRevision = compositionLocalOf { 0 }
val PortalConnected = SemanticsPropertyKey<Boolean>("PortalConnected")
val PortalEvents = SemanticsPropertyKey<Int>("PortalEvents")
val PortalRefreshes = SemanticsPropertyKey<Int>("PortalRefreshes")
val PortalNotificationEvents = SemanticsPropertyKey<Int>("PortalNotificationEvents")
val PortalMembershipEvents = SemanticsPropertyKey<Int>("PortalMembershipEvents")
val PortalNotificationCount = SemanticsPropertyKey<Int>("PortalNotificationCount")
val PortalUnreadChats = SemanticsPropertyKey<Int>("PortalUnreadChats")
val PortalPendingRequests = SemanticsPropertyKey<Int>("PortalPendingRequests")
val PortalPendingRequestEvents = SemanticsPropertyKey<Int>("PortalPendingRequestEvents")
val PortalDestination = SemanticsPropertyKey<String>("PortalDestination")
val PortalPreviousDestination = SemanticsPropertyKey<String>("PortalPreviousDestination")
class PortalUpdates {
    var revision by mutableIntStateOf(0); internal set
    var notifications by mutableIntStateOf(0); internal set
    var chats by mutableIntStateOf(0); internal set
    var pendingRequests by mutableIntStateOf(0); internal set
    var pendingRequestEvents by mutableIntStateOf(0); internal set
    var connected by mutableStateOf(false); internal set
    var events by mutableIntStateOf(0); internal set
    var refreshes by mutableIntStateOf(0); internal set
    var notificationEvents by mutableIntStateOf(0); internal set
    var membershipEvents by mutableIntStateOf(0); internal set
}

@OptIn(FlowPreview::class)
@Composable fun rememberPortalUpdates(repository: BorrowRepository, userId: String): PortalUpdates {
    val updates = remember(repository, userId) { PortalUpdates() }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    LaunchedEffect(repository, userId, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            repository.initialize()
            coroutineScope {
                val signals = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST)
                launch {
                    signals.debounce(250).collect {
                        try {
                            coroutineScope {
                                val notifications = async { repository.unreadNotifications(userId) }
                                val chats = async { repository.conversationSummaries(userId).count { it.unread } }
                                val pending = async { repository.pendingRequestCount(userId) }
                                updates.notifications = notifications.await(); updates.chats = chats.await()
                                updates.pendingRequests = pending.await()
                                updates.refreshes++
                            }
                        } catch (cancelled: CancellationException) { throw cancelled }
                        catch (_: Exception) { /* Keep last known badges; active refresh retries below. */ }
                        updates.revision++
                    }
                }
                launch { while (isActive) { signals.emit(Unit); delay(30_000) } }
                launch {
                    while (isActive) {
                        val channel = repository.client.channel("android-portal-$userId-${java.util.UUID.randomUUID()}") {
                            broadcast { replicationReady = true }
                        }
                        try {
                            coroutineScope {
                                val replicationReady = CompletableDeferred<Unit>()
                                launch(start = CoroutineStart.UNDISPATCHED) {
                                    channel.systemFlow().collect { payload ->
                                        if (payload.extension in setOf("system", "postgres_changes")) {
                                            if (payload.status == "ok") replicationReady.complete(Unit)
                                            else if (payload.status == "error")
                                                throw java.io.IOException("Portal replication is unavailable")
                                        }
                                    }
                                }
                                val changes = listOf(
                                    "notifications" to channel.postgresChangeFlow<PostgresAction>("public") { table = "notifications"; filter { eq("user_id", userId) } },
                                    "conversation_members" to channel.postgresChangeFlow<PostgresAction>("public") { table = "conversation_members"; filter { eq("user_id", userId) } }
                                ) + listOf("messages", "loans", "borrow_requests", "conversations", "fines", "incidents", "campus_transfers", "campus_appointments").map { name ->
                                    name to channel.postgresChangeFlow<PostgresAction>("public") { table = name }
                                }
                                // Register collectors before the IO dispatcher can send the channel join.
                                changes.forEach { (table, flow) -> launch(start = CoroutineStart.UNDISPATCHED) {
                                    flow.collect {
                                        updates.events++
                                        if (table == "notifications") updates.notificationEvents++
                                        if (table == "conversation_members") updates.membershipEvents++
                                        if (table == "borrow_requests") updates.pendingRequestEvents++
                                        signals.tryEmit(Unit)
                                    }
                                } }
                                withContext(Dispatchers.IO) { withTimeout(15_000) { channel.subscribe(blockUntilSubscribed = true) } }
                                // A channel join can precede the database listener. Refresh again
                                // once replication is ready so changes in that gap are recovered.
                                withTimeout(15_000) { replicationReady.await() }
                                updates.connected = true
                                signals.emit(Unit)
                                channel.status.first { it != RealtimeChannel.Status.SUBSCRIBED }
                                throw java.io.IOException("Portal channel disconnected")
                            }
                        } catch (timeout: TimeoutCancellationException) { /* Retry an unavailable subscription. */ }
                        catch (cancelled: CancellationException) { throw cancelled }
                        catch (_: Exception) { /* Polling remains active during reconnect. */ }
                        finally {
                            updates.connected = false
                            withContext(NonCancellable) {
                                // Auth logout may already have closed the shared websocket.
                                runCatching { withTimeoutOrNull(5_000) { channel.unsubscribe() } }
                                repository.client.realtime.removeChannel(channel)
                            }
                        }
                        delay(5_000)
                    }
                }
            }
        }
    }
    return updates
}
