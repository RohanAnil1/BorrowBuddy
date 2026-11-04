package `in`.borrowbuddy.android.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.net.Uri
import `in`.borrowbuddy.android.domain.*
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.storage.storage
import io.ktor.http.ContentType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.util.UUID
import kotlin.time.Duration.Companion.minutes

class CampusRepository(private val context: Context, val base: BorrowRepository) {
    private val client get() = base.client
    suspend fun action(action: String, data: JsonObject): JsonObject {
        val result = base.rpc("campus_api", buildJsonObject { put("p_action", action); put("p_data", data) }).decodeAs<JsonObject>()
        // A failed confirmation intentionally returns HTTP 200 so attempt counters commit.
        return checkedCampusResult(result)
    }
    suspend fun posts(kind: String? = null, query: String = "", status: String = "", category: String = "",
        owner: String? = null, page: Int = 0): List<CampusPost> = postPage(kind, query, status, category, owner, page).posts
    suspend fun postPage(kind: String? = null, query: String = "", status: String = "", category: String = "",
        owner: String? = null, page: Int = 0, location: String = "", found: String = ""): CampusPostPage {
      val result = client.from("campus_posts").select {
        count(Count.EXACT)
        filter {
            kind?.let { eq("kind", it) }; owner?.let { eq("owner_id", it) }
            if (status.isNotBlank()) eq("status", status)
            if (category.isNotBlank()) eq("category_id", category)
            val term = query.replace(Regex("[%,()]"), " ").trim()
            if (term.isNotBlank()) ilike("title", "%$term%")
            if (location.isNotBlank()) ilike("location", "%${location.replace(Regex("[%,()]"), " ").trim()}%")
            if (found.isNotBlank()) eq("found_on", found)
        }
        order("created_at", Order.DESCENDING); order("id", Order.ASCENDING)
        range(page * 24L, page * 24L + 23)
      }
      return CampusPostPage(result.decodeList(), (result.countOrNull() ?: 0).toInt())
    }
    suspend fun post(id: String): CampusPost? = client.from("campus_posts").select { filter { eq("id", id) } }.decodeSingleOrNull()
    suspend fun notes(id: String): String? = client.from("campus_post_notes").select { filter { eq("post_id", id) } }
        .decodeSingleOrNull<JsonObject>()?.get("identifying_notes")?.jsonPrimitive?.contentOrNull
    suspend fun claims(post: String? = null, claimant: String? = null, pending: Boolean = false): List<CampusClaim> = client.from("campus_claims").select {
        filter { post?.let { eq("post_id", it) }; claimant?.let { eq("claimant_id", it) }; if (pending) eq("status", "pending") }
        order("created_at", if (pending) Order.ASCENDING else Order.DESCENDING); limit(100)
    }.decodeList()
    suspend fun transfers(user: String): List<CampusTransfer> = client.from("campus_transfers").select {
        filter { or { eq("host_id", user); eq("recipient_id", user) } }; order("created_at", Order.DESCENDING); limit(100)
    }.decodeList()
    suspend fun transfer(id: String): CampusTransfer? = client.from("campus_transfers").select { filter { eq("id", id) } }.decodeSingleOrNull()
    suspend fun adminApprovals(): List<CampusTransfer> = client.from("campus_transfers").select {
        filter { eq("status", "active"); filterNot("claim_id", io.github.jan.supabase.postgrest.query.filter.FilterOperator.IS, "null") }; order("created_at", Order.ASCENDING); limit(100)
    }.decodeList()
    suspend fun heads(): List<CampusThreadHead> = base.rpc("campus_thread_heads").decodeList()
    suspend fun messages(id: String, before: CampusMessage? = null): List<CampusMessage> = client.from("campus_messages").select {
        filter {
            eq("transfer_id", id)
            before?.let { cursor -> or { lt("created_at", cursor.created_at); and { eq("created_at", cursor.created_at); lt("id", cursor.id) } } }
        }
        order("created_at", Order.DESCENDING); order("id", Order.DESCENDING); limit(50)
    }.decodeList<CampusMessage>().reversed()
    suspend fun schedule(host: String): CampusSchedule? = client.from("campus_schedules").select { filter { eq("host_id", host) } }.decodeSingleOrNull()
    suspend fun slots(host: String, date: String): List<CampusSlot> = base.rpc("campus_slots", buildJsonObject { put("p_host", host); put("p_date", date) }).decodeList()
    suspend fun appointments(loan: String? = null, transfer: String? = null): List<CampusAppointment> = client.from("campus_appointments").select {
        filter { loan?.let { eq("loan_id", it) }; transfer?.let { eq("transfer_id", it) } }
        order("starts_at", Order.DESCENDING); limit(100)
    }.decodeList()

    /** Native decoder applies EXIF orientation, bounds memory and strips metadata before upload. */
    suspend fun upload(uri: Uri, user: String, post: String): String = withContext(Dispatchers.IO) {
        require(context.contentResolver.getType(uri) in setOf("image/png", "image/jpeg", "image/webp")) { "Choose a PNG, JPG or WebP photo." }
        val bitmap = ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
            val scale = (1600f / maxOf(info.size.width, info.size.height)).coerceAtMost(1f)
            decoder.setTargetSize((info.size.width * scale).toInt().coerceAtLeast(1), (info.size.height * scale).toInt().coerceAtLeast(1))
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
        val bytes = try { java.io.ByteArrayOutputStream().use { output ->
            check(bitmap.compress(Bitmap.CompressFormat.WEBP_LOSSY, 86, output)) { "Could not prepare this photo." }
            output.toByteArray()
        } } finally { bitmap.recycle() }
        require(bytes.size <= 5 * 1024 * 1024) { "Photo exceeds 5 MB. Choose a smaller image." }
        val path = "$user/$post/${UUID.randomUUID()}.webp"
        client.storage.from("campus-photos").upload(path, bytes) { upsert = false; contentType = ContentType.parse("image/webp") }
        path
    }
    suspend fun discardPhoto(path: String) { client.storage.from("campus-photos").delete(listOf(path)) }
    suspend fun photoUrl(path: String): String = client.storage.from("campus-photos").createSignedUrl(path, 5.minutes)
}

data class CampusPostPage(val posts: List<CampusPost>, val count: Int)

internal fun checkedCampusResult(result: JsonObject): JsonObject {
    check(result["ok"]?.jsonPrimitive?.booleanOrNull != false) {
        result["error"]?.jsonPrimitive?.contentOrNull ?: "This action could not be completed."
    }
    return result
}
