package `in`.borrowbuddy.android.data

import android.content.Context
import android.net.Uri
import `in`.borrowbuddy.android.BuildConfig
import `in`.borrowbuddy.android.domain.*
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.storage.Storage
import io.github.jan.supabase.storage.storage
import io.ktor.http.ContentType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.util.UUID
import kotlin.time.Duration.Companion.minutes

class BorrowRepository(private val context: Context) {
    val campus by lazy { CampusRepository(context, this) }
    val buddy by lazy { BuddyStore(context, this) }
    val configured = BuildConfig.SUPABASE_ANON_KEY.isNotBlank() && runCatching {
        val uri = java.net.URI(BuildConfig.SUPABASE_URL)
        uri.scheme == "https" || (BuildConfig.DEBUG && uri.scheme == "http" && uri.host in setOf("10.0.2.2", "127.0.0.1", "localhost"))
    }.getOrDefault(false)
    val client: SupabaseClient by lazy {
        check(configured) { "Supabase project configuration is missing." }
        createSupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY) {
            install(Auth) { sessionManager = SecureSessionManager(context) }
            install(Postgrest)
            install(Storage)
            install(Realtime)
        }
    }
    /** Profile columns any signed-in student may read. Keep in step with the grant in the private-profile migration. */
    private val publicProfileColumns = Columns.raw("id,full_name,department,year_of_study,avatar_path,verification_status,trust_score,is_admin,email_notifications,created_at,updated_at")
    private val itemColumns =Columns.raw("*,owner:profiles!items_owner_id_fkey(id,full_name,avatar_path,trust_score,verification_status),category:categories(*),pickup_location:pickup_locations(*)")
    private val loanColumns = Columns.raw("id,request_id,item_id,owner_id,borrower_id,start_date,due_date,returned_at,status,handover_token_expires_at,return_token_expires_at,handover_attempts,return_attempts,pickup_confirmed_at,return_confirmed_at,created_at,updated_at,item:items(*),owner:profiles!loans_owner_id_fkey(id,full_name,avatar_path,trust_score),borrower:profiles!loans_borrower_id_fkey(id,full_name,avatar_path,trust_score)")
    suspend fun initialize() { if (configured) client.auth.awaitInitialization() }
    suspend fun profile(): Profile? {
        if (!configured) return null
        // Android auth pauses auto refresh as Initializing in the background.
        // Resume must finish restoring the encrypted session before deciding signed-out.
        client.auth.awaitInitialization()
        val user = client.auth.currentUserOrNull() ?: return null
        val row = client.from("profiles").select(publicProfileColumns) { filter { eq("id", user.id) } }.decodeSingleOrNull<Profile>() ?: return null
        // Email, phone, ID path and the review note are private: only my_private_profile() serves them, and only your own.
        val own = rpc("my_private_profile").decodeList<PrivateProfileFields>().firstOrNull()
        return row.copy(email = own?.email ?: user.email.orEmpty(), phone = own?.phone,
            student_id_path = own?.student_id_path, verification_note = own?.verification_note)
    }
    suspend fun signIn(email: String, password: String) {
        Rules.validateEmail(email)?.let { error(it) }
        require(password.isNotBlank()) { "Enter your password." }
        client.auth.signInWith(Email) { this.email = email.trim().lowercase(); this.password = password }
    }
    suspend fun signUp(email: String, password: String, confirmation: String) {
        Rules.validateEmail(email)?.let { error(it) }
        Rules.validatePassword(password)?.let { error(it) }
        require(password == confirmation) { "Passwords don't match." }
        client.auth.signUpWith(Email) { this.email = email.trim().lowercase(); this.password = password }
        require(client.auth.currentUserOrNull() != null) { "Your Supabase project requires email confirmation. Confirm the email before signing in." }
    }
    suspend fun signOut() { client.auth.signOut() }
    suspend fun updateProfile(profile: Profile, name: String, phone: String, department: String, year: Int) {
        Rules.validateProfile(name, phone, department, year)?.let { error(it) }
        client.from("profiles").update(buildJsonObject {
            put("full_name", name.trim()); put("phone", phone.trim().takeIf { it.isNotBlank() }?.let(::JsonPrimitive) ?: JsonNull)
            put("department", department); put("year_of_study", year)
        }) { filter { eq("id", profile.id) } }
    }
    suspend fun submitStudentId(path: String) { rpc("submit_student_id", buildJsonObject { put("p_path", path) }) }
    suspend fun confirmHandover(loanId: String, token: String, kind: String) {
        require(Regex("^\\d{6}$").matches(token)) { "Enter the six-digit code." }
        require(kind in setOf("pickup", "return")) { "Invalid handover kind." }
        val result = rpc("confirm_handover_v2", buildJsonObject {
            put("p_loan_id", loanId); put("p_token", token); put("p_kind", kind)
        }).decodeAs<JsonObject>()
        check(result["ok"]?.jsonPrimitive?.booleanOrNull == true) {
            result["error"]?.jsonPrimitive?.contentOrNull ?: "Unable to confirm this code."
        }
    }
    suspend fun categories(): List<Category> = client.from("categories").selectRows { order("sort_order", Order.ASCENDING) }
    suspend fun locations(admin: Boolean = false): List<PickupLocation> = client.from("pickup_locations").select {
        if (!admin) filter { eq("is_active", true) }
        order("name", Order.ASCENDING)
    }.decodeList()
    /** One catalog page. Ask for one row more than you show to learn whether more exist. */
    suspend fun catalog(filters: CatalogFilters = CatalogFilters(), offset: Int = 0, limit: Int = 48): List<Item> {
        val busy = if (filters.from != null && filters.to != null) {
            val start = java.time.LocalDate.parse(filters.from)
            val end = java.time.LocalDate.parse(filters.to)
            require(end >= start) { "End date must follow start date." }
            rpc("get_busy_item_ids", buildJsonObject { put("p_start", filters.from); put("p_end", filters.to) }).decodeList<BusyItem>().map { it.item_id }
        } else emptyList()
        // Exclude bookings before the server limit, so later available items can fill the page.
        return client.from("items").select(itemColumns) {
            filter {
                eq("status", "available")
                if (busy.isNotEmpty()) notIn("id", busy)
                filters.categoryId?.let { eq("category_id", it) }
                filters.condition?.let { eq("condition", it) }
                filters.locationId?.let { eq("pickup_location_id", it) }
                val term = filters.query.replace(Regex("[%,()]"), " ").trim()
                if (term.isNotBlank()) or { ilike("title", "%$term%"); ilike("description", "%$term%") }
            }
            // Tie-break on newest, then id, so pages never shuffle between requests.
            when (filters.sort) {
                ItemSort.DepositLow -> order("deposit_amount", Order.ASCENDING)
                ItemSort.Trust -> order("owner(trust_score)", Order.DESCENDING)
                ItemSort.Newest -> Unit
            }
            order("created_at", Order.DESCENDING); order("id", Order.ASCENDING)
            range(offset.toLong(), (offset + limit - 1).toLong())
        }.decodeList<Item>()
    }
    suspend fun similarItems(item: Item, viewerId: String): List<Item> = client.from("items").select(itemColumns) {
        filter { eq("status", "available"); eq("category_id", item.category_id); neq("id", item.id); neq("owner_id", viewerId) }
        order("created_at", Order.DESCENDING); limit(6)
    }.decodeList()

    // Saved items (wishlist). Null ids mean saving is unavailable, so hearts hide.
    suspend fun savedItemIds(userId: String): Set<String>? = try {
        client.from("wishlist_items").select(Columns.raw("item_id")) { filter { eq("user_id", userId) } }
            .decodeList<JsonObject>().map { it.getValue("item_id").jsonPrimitive.content }.toSet()
    } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled } catch (_: Exception) { null }
    suspend fun setSaved(userId: String, itemId: String, saved: Boolean) {
        if (saved) client.from("wishlist_items").upsert(buildJsonObject { put("user_id", userId); put("item_id", itemId) }) {
            onConflict = "user_id,item_id"; ignoreDuplicates = true
        } else client.from("wishlist_items").delete { filter { eq("user_id", userId); eq("item_id", itemId) } }
    }
    suspend fun savedItems(userId: String): List<Item> = client.from("wishlist_items")
        .select(Columns.raw("created_at,item:items(*,owner:profiles!items_owner_id_fkey(id,full_name,avatar_path,trust_score,verification_status),category:categories(*),pickup_location:pickup_locations(*))")) {
            filter { eq("user_id", userId) }; order("created_at", Order.DESCENDING); limit(100)
        }.decodeList<SavedRow>().mapNotNull { it.item }

    // Loan extensions. A missing table reads as "no extensions".
    suspend fun extensions(loanId: String): List<LoanExtension> = try {
        client.from("loan_extensions").select { filter { eq("loan_id", loanId) }; order("created_at", Order.DESCENDING); limit(10) }.decodeList()
    } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled } catch (_: Exception) { emptyList() }
    suspend fun pendingExtensionLoanIds(loanIds: List<String>): Set<String> = if (loanIds.isEmpty()) emptySet() else try {
        client.from("loan_extensions").select(Columns.raw("loan_id")) { filter { eq("status", "pending"); isIn("loan_id", loanIds) } }
            .decodeList<JsonObject>().map { it.getValue("loan_id").jsonPrimitive.content }.toSet()
    } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled } catch (_: Exception) { emptySet() }
    suspend fun requestExtension(loanId: String, newDue: String, message: String) {
        require(message.length <= 300) { "Keep the note under 300 characters." }
        rpc("request_loan_extension", buildJsonObject {
            put("p_loan_id", loanId); put("p_new_due_date", newDue)
            put("p_message", message.trim().takeIf { it.isNotBlank() }?.let(::JsonPrimitive) ?: JsonNull)
        })
    }
    suspend fun respondExtension(extensionId: String, approve: Boolean) {
        rpc("respond_loan_extension", buildJsonObject { put("p_extension_id", extensionId); put("p_approve", approve) })
    }
    suspend fun cancelExtension(extensionId: String) { rpc("cancel_loan_extension", buildJsonObject { put("p_extension_id", extensionId) }) }

    // Impact, reputation and email.
    suspend fun impact(scope: String): ImpactStats? = try {
        rpc("get_impact_stats", buildJsonObject { put("p_scope", scope) }).decodeAs<ImpactStats>()
    } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled } catch (_: Exception) { null }
    /** Track record for trust hints; null when hidden or unavailable. */
    suspend fun reputation(userId: String): ProfileStats? = try { profileStats(userId) }
        catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled } catch (_: Exception) { null }
    suspend fun setEmailNotifications(userId: String, enabled: Boolean) {
        client.from("profiles").update(buildJsonObject { put("email_notifications", enabled) }) { filter { eq("id", userId) } }
    }
    suspend fun item(id: String): Item? = client.from("items").select(itemColumns) { filter { eq("id", id) } }.decodeSingleOrNull()
    suspend fun myItems(id: String): List<Item> = client.from("items").select(itemColumns) { filter { eq("owner_id", id) }; order("created_at", Order.DESCENDING) }.decodeList()
    suspend fun availability(id: String): List<AvailabilityWindow> = rpc("get_item_availability", buildJsonObject { put("p_item_id", id) }).decodeList()
    suspend fun loans(id: String): List<Loan> = coroutineScope {
        val borrowing = async {
            client.from("loans").selectRows<Loan>(loanColumns) {
                filter { eq("borrower_id", id) }; order("created_at", Order.DESCENDING); limit(60)
            }
        }
        val lending = async {
            client.from("loans").selectRows<Loan>(loanColumns) {
                filter { eq("owner_id", id) }; order("created_at", Order.DESCENDING); limit(60)
            }
        }
        (borrowing.await() + lending.await()).distinctBy { it.id }
            .sortedByDescending { java.time.Instant.parse(it.created_at) }
    }
    suspend fun loan(id: String): Loan? = client.from("loans").select(loanColumns) { filter { eq("id", id) } }.decodeSingleOrNull()
    suspend fun outgoingRequests(id: String): List<BorrowRequest> = client.from("borrow_requests").select(Columns.raw("*,item:items(*)")) { filter { eq("borrower_id", id) }; order("created_at", Order.DESCENDING); limit(60) }.decodeList()
    suspend fun incomingRequests(id: String): List<BorrowRequest> {
        val owned = myItems(id).map { it.id }
        if (owned.isEmpty()) return emptyList()
        return client.from("borrow_requests").select(Columns.raw("*,item:items(*),borrower:profiles!borrow_requests_borrower_id_fkey(id,full_name,trust_score,avatar_path)")) {
            filter { isIn("item_id", owned) }; order("created_at", Order.DESCENDING); limit(60)
        }.decodeList()
    }
    suspend fun pendingRequestCount(ownerId: String): Int {
        val owned = client.from("items").select(Columns.raw("id")) { filter { eq("owner_id", ownerId) } }
            .decodeList<JsonObject>().map { it.getValue("id").jsonPrimitive.content }
        if (owned.isEmpty()) return 0
        return (client.from("borrow_requests").select(Columns.raw("id")) {
            head = true; count(Count.EXACT); filter { isIn("item_id", owned); eq("status", "pending") }
        }.countOrNull() ?: 0).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    }
    suspend fun waitlist(id: String): List<WaitlistEntry> = client.from("waitlist_entries").select(Columns.raw("*,item:items(*)")) { filter { eq("user_id", id); isIn("status", listOf("waiting", "notified")) }; order("created_at", Order.DESCENDING) }.decodeList()
    suspend fun notifications(id: String): List<Notification> = client.from("notifications").select { filter { eq("user_id", id) }; order("created_at", Order.DESCENDING); limit(40) }.decodeList()
    suspend fun markNotificationsRead(id: String) = client.from("notifications").update(buildJsonObject { put("read_at", java.time.Instant.now().toString()) }) { filter { eq("user_id", id); exact("read_at", null) } }
    suspend fun fines(id: String? = null): List<Fine> = client.from("fines").select(Columns.raw("*,user:profiles!fines_user_id_fkey(id,full_name),loan:loans(*,item:items(*))")) {
        filter { if (id != null) eq("user_id", id) else eq("status", "pending") }
        order("created_at", if (id == null) Order.ASCENDING else Order.DESCENDING)
        if (id == null) limit(50)
    }.decodeList()
    suspend fun reviews(userId: String? = null, loanId: String? = null): List<Review> = client.from("reviews").select(Columns.raw("*,reviewer:profiles!reviews_reviewer_id_fkey(id,full_name,avatar_path)")) {
        filter { userId?.let { eq("reviewee_id", it) }; loanId?.let { eq("loan_id", it) } }; order("created_at", Order.DESCENDING)
        if (userId != null) limit(20)
    }.decodeList()
    suspend fun publicProfile(id: String): Profile? = client.from("profiles").select(Columns.raw("id,full_name,department,year_of_study,avatar_path,verification_status,trust_score,is_admin,created_at")) { filter { eq("id", id) } }.decodeSingleOrNull()
    suspend fun profileStats(id: String): ProfileStats = rpc("get_public_profile_stats", buildJsonObject { put("p_profile_id", id) }).decodeSingle()
    /** Member card stamps are decorative: any failure hides them instead of failing the screen. */
    suspend fun profileStamps(id: String): List<ProfileStamp>? = try {
        ProfileStamps.normalize(rpc("get_profile_stamps", buildJsonObject { put("p_profile_id", id) }).decodeList<ProfileStamp>())
    } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled } catch (_: Exception) { null }
    suspend fun profileListings(id: String): List<Item> = client.from("items").select(itemColumns) {
        filter { eq("owner_id", id); eq("status", "available") }; order("created_at", Order.DESCENDING); limit(12)
    }.decodeList()
    suspend fun conversations(): List<Conversation> = client.from("conversations").select { order("created_at", Order.DESCENDING) }.decodeList()
    suspend fun conversation(id: String): Conversation? = client.from("conversations").select { filter { eq("id", id) } }.decodeSingleOrNull()
    suspend fun conversationSummaries(userId: String): List<ConversationSummary> = coroutineScope {
        val channels = conversations()
        if (channels.isEmpty()) return@coroutineScope emptyList()
        val ids = channels.map { it.id }
        val members = async {
            client.from("conversation_members").select(Columns.raw("*,profile:profiles(id,full_name,avatar_path,trust_score)")) {
                filter { isIn("conversation_id", ids) }
            }.decodeList<ConversationMember>()
        }
        val recent = async {
            rpc("get_conversation_message_heads").decodeList<Message>()
        }
        val grouped = members.await().groupBy { it.conversation_id }
        val latest = recent.await().groupBy { it.conversation_id }.mapValues { it.value.first() }
        channels.map { channel ->
            val membership = grouped[channel.id].orEmpty()
            val message = latest[channel.id]
            val read = membership.find { it.user_id == userId }?.last_read_at
            ConversationSummary(channel, channel.title ?: membership.find { it.user_id != userId }?.profile?.full_name ?: "Loan chat",
                message, message != null && (read == null || java.time.Instant.parse(message.created_at) > java.time.Instant.parse(read)))
        }.sortedByDescending { it.latest?.created_at.orEmpty() }
    }
    suspend fun unreadNotifications(userId: String): Int = (client.from("notifications").select(Columns.raw("id")) {
        head = true; count(Count.EXACT); filter { eq("user_id", userId); exact("read_at", null) }
    }.countOrNull() ?: 0).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    suspend fun members(id: String): List<ConversationMember> = client.from("conversation_members").select(Columns.raw("*,profile:profiles(id,full_name,avatar_path,trust_score)")) { filter { eq("conversation_id", id) } }.decodeList()
    suspend fun messages(id: String, before: Message? = null, pageSize: Int = 100): List<Message> = client.from("messages").select(Columns.raw("*,sender:profiles!messages_sender_id_fkey(id,full_name,avatar_path)")) {
        filter {
            eq("conversation_id", id)
            before?.let { cursor -> or {
                lt("created_at", cursor.created_at)
                and { eq("created_at", cursor.created_at); lt("id", cursor.id) }
            } }
        }
        order("created_at", Order.DESCENDING); order("id", Order.DESCENDING); limit(pageSize.toLong())
    }.decodeList<Message>().reversed()
    suspend fun sendMessage(id: String, userId: String, text: String): Message {
        require(text.trim().length in 1..2000) { "Write a message of up to 2000 characters." }
        return client.from("messages").insert(buildJsonObject { put("conversation_id", id); put("sender_id", userId); put("body", text.trim()) }) {
            select(Columns.raw("*,sender:profiles!messages_sender_id_fkey(id,full_name,avatar_path)"))
        }.decodeSingle()
    }
    /** The verification queue with email and ID upload; the database refuses anyone who isn't an admin. */
    suspend fun pendingProfiles(): List<Profile> = rpc("admin_pending_profiles", buildJsonObject { put("p_limit", 50) }).decodeList()
    suspend fun incidents(loanId: String? = null): List<Incident> = client.from("incidents").select(Columns.raw("*,reporter:profiles!incidents_reporter_id_fkey(id,full_name),photos:incident_photos(*),loan:loans(*,item:items(*),owner:profiles!loans_owner_id_fkey(id,full_name),borrower:profiles!loans_borrower_id_fkey(id,full_name))")) {
        filter { if (loanId != null) eq("loan_id", loanId) else isIn("status", listOf("open", "under_review")) }; order("created_at", Order.ASCENDING)
    }.decodeList()
    suspend fun request(itemId: String, userId: String, start: String, end: String, message: String) {
        require(message.length <= 500) { "Message must be at most 500 characters." }
        client.from("borrow_requests").insert(buildJsonObject { put("item_id", itemId); put("borrower_id", userId); put("start_date", start); put("end_date", end); put("message", message.trim()) })
    }
    suspend fun saveItem(id: String?, userId: String, values: JsonObject): String {
        if (id != null) {
            client.from("items").update(values) { filter { eq("id", id); eq("owner_id", userId) } }
            return id
        }
        val data = JsonObject(values + mapOf("owner_id" to JsonPrimitive(userId), "status" to JsonPrimitive("available")))
        return client.from("items").insert(data) { select() }.decodeSingle<Item>().id
    }
    suspend fun setItemStatus(id: String, userId: String, status: String) {
        require(status in listOf("available", "paused", "retired"))
        client.from("items").update(buildJsonObject { put("status", status) }) { filter { eq("id", id); eq("owner_id", userId) } }
    }
    suspend fun deleteItem(id: String, userId: String) { client.from("items").delete { filter { eq("id", id); eq("owner_id", userId) } } }
    suspend fun rpc(name: String, params: JsonObject = buildJsonObject {}) = client.postgrest.rpc(name, params)
    fun publicImage(path: String?, bucket: String = "item-images"): String? = path?.let { "${BuildConfig.SUPABASE_URL}/storage/v1/object/public/$bucket/$it" }
    suspend fun privateImage(path: String, bucket: String): String = client.storage.from(bucket).createSignedUrl(path, 30.minutes)
    suspend fun upload(uri: Uri, bucket: String, userId: String): String = withContext(Dispatchers.IO) {
        val type = context.contentResolver.getType(uri) ?: error("Cannot determine file type.")
        val allowed = if (bucket == "student-ids") setOf("image/png", "image/jpeg") else setOf("image/png", "image/jpeg", "image/webp")
        require(type in allowed) { "Upload a PNG or JPG${if (bucket == "student-ids") "" else " or WebP"} image." }
        val bytes = context.contentResolver.openInputStream(uri)?.use { input ->
            val output = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(8192)
            val limit = 5 * 1024 * 1024
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                require(output.size() + count <= limit) { "Photo exceeds 5 MB." }
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        } ?: error("Cannot open selected image.")
        require(bytes.size <= 5 * 1024 * 1024) { "Photo exceeds 5 MB." }
        if (bucket == "student-ids") require(bytes.size >= 50 * 1024) { "Photo is too small. Retake your student ID photo." }
        val extension = when (type) { "image/png" -> "png"; "image/webp" -> "webp"; else -> "jpg" }
        val path = "$userId/${UUID.randomUUID()}.$extension"
        client.storage.from(bucket).upload(path, bytes) { upsert = false; contentType = ContentType.parse(type) }
        path
    }
    @kotlinx.serialization.Serializable private data class BusyItem(val item_id: String)
    @kotlinx.serialization.Serializable private data class SavedRow(val created_at: String = "", val item: Item? = null)
}
