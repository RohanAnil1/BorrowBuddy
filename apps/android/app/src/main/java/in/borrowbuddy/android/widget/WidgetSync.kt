package `in`.borrowbuddy.android.widget

import android.content.Context
import android.content.SharedPreferences
import androidx.glance.appwidget.updateAll
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import `in`.borrowbuddy.android.BorrowBuddyApplication
import `in`.borrowbuddy.android.data.BorrowRepository
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import java.util.concurrent.TimeUnit

/** A snapshot plus when it was last re-rendered, so countdowns move on even when the data doesn't. */
data class WidgetView(val snapshot: WidgetSnapshot, val renderedAt: Long)

/** Last-known widget data, in app-private storage (backups are off for this app). */
class WidgetStore(context: Context) {
    private val preferences = context.getSharedPreferences("cargo_widget", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }
    fun read(): WidgetSnapshot = preferences.getString(KEY, null)
        ?.let { runCatching { json.decodeFromString<WidgetSnapshot>(it) }.getOrNull() } ?: WidgetSnapshot()
    fun view() = WidgetView(read(), preferences.getLong(RENDERED, 0))
    fun write(snapshot: WidgetSnapshot, now: Long = System.currentTimeMillis()) {
        preferences.edit().putString(KEY, json.encodeToString(snapshot)).putLong(RENDERED, now).apply()
    }
    /** Emits on every write, so a running Glance session recomposes with the new data. */
    fun changes(): Flow<WidgetView> = callbackFlow {
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> trySend(view()) }
        preferences.registerOnSharedPreferenceChangeListener(listener)
        awaitClose { preferences.unregisterOnSharedPreferenceChangeListener(listener) }
    }.conflate()
    private companion object { const val KEY = "snapshot"; const val RENDERED = "rendered_at" }
}

/** Reads the widget's data through the app's one Supabase client, so the session is shared. */
class WidgetLoader(private val repository: BorrowRepository) {
    @OptIn(kotlin.time.ExperimentalTime::class)
    suspend fun load(now: Long = System.currentTimeMillis()): WidgetSnapshot {
        if (!repository.configured) return WidgetSnapshot(syncedAt = now)
        val auth = repository.client.auth
        // supabase-kt restores the saved session when the app comes to the
        // foreground. A worker in a background-only process restores it here.
        if (auth.sessionStatus.value is SessionStatus.Initializing) auth.loadFromStorage(autoRefresh = false)
        val session = auth.currentSessionOrNull() ?: return WidgetSnapshot(syncedAt = now)
        // Auto refresh is paused in the background; renew an expiring token once.
        if (session.expiresAt.toEpochMilliseconds() < now + 60_000) auth.refreshCurrentSession()
        val profile = repository.profile() ?: return WidgetSnapshot(syncedAt = now)
        val firstName = profile.full_name.trim().substringBefore(' ').uppercase()
        if (!profile.is_admin && profile.verification_status != "verified")
            return WidgetSnapshot(WidgetState.Unverified, firstName, syncedAt = now)
        return coroutineScope {
            val loans = async { repository.loans(profile.id) }
            val requests = async { repository.pendingRequestCount(profile.id) }
            val chats = async { repository.conversationSummaries(profile.id).count { it.unread } }
            val fines = async { WidgetData.pendingFines(repository.fines(profile.id)) }
            val all = loans.await()
            val (fineCount, owed) = fines.await()
            WidgetSnapshot(WidgetState.Ready, firstName, WidgetData.nextLoan(all, profile.id), WidgetData.openLoans(all),
                requests.await(), chats.await(), fineCount, owed, syncedAt = now)
        }
    }
}

class WidgetSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val context = applicationContext
        if (CargoWidgetReceiver.placedWidgets(context) == 0) return Result.success()
        val store = WidgetStore(context)
        val next = try {
            withTimeout(45_000) { WidgetLoader((context as BorrowBuddyApplication).repository).load() }
        } catch (timeout: TimeoutCancellationException) {
            store.read().copy(offline = true)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { store.read().copy(offline = true) }
        store.write(next)
        // Re-render either way: countdowns and the "synced" age move on offline too.
        WidgetSync.redraw(context)
        return Result.success()
    }
}

object WidgetSync {
    private const val PERIODIC = "cargo-widget-periodic"
    private const val NOW = "cargo-widget-now"

    /** Hourly, battery-friendly refresh while at least one widget is placed. */
    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<WidgetSyncWorker>(1, TimeUnit.HOURS, 20, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiresBatteryNotLow(true).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /** One refresh as soon as the network allows: widget placed, tapped, or the app left. */
    fun refreshNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<WidgetSyncWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, request)
    }

    /**
     * The app went to the background. A sign-out clears the widget at once,
     * even offline; otherwise fetch fresh data when the network allows.
     */
    suspend fun onAppLeft(context: Context, repository: BorrowRepository) {
        if (CargoWidgetReceiver.placedWidgets(context) == 0) return
        if (repository.configured && repository.client.auth.sessionStatus.value is SessionStatus.NotAuthenticated) {
            val store = WidgetStore(context)
            if (store.read().state != WidgetState.SignedOut) {
                store.write(WidgetSnapshot(syncedAt = System.currentTimeMillis()))
                WidgetSync.redraw(context)
            }
        }
        refreshNow(context)
    }

    /** Re-render every placed widget (boarding passes and Parcel) from the cache. */
    suspend fun redraw(context: Context) {
        CargoWidget().updateAll(context)
        ParcelWidget().updateAll(context)
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).run { cancelUniqueWork(PERIODIC); cancelUniqueWork(NOW) }
    }
}
