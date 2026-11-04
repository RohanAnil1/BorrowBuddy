package `in`.borrowbuddy.android.domain

import kotlinx.serialization.Serializable

@Serializable
data class Profile(
    val id: String,
    val full_name: String = "",
    val email: String = "",
    val phone: String? = null,
    val department: String? = null,
    val year_of_study: Int? = null,
    val avatar_path: String? = null,
    val student_id_path: String? = null,
    val verification_status: String = "pending",
    val verification_note: String? = null,
    val trust_score: Double = 70.0,
    val is_admin: Boolean = false,
    val created_at: String = "",
    val updated_at: String = "",
)

@Serializable
data class Category(val id: String, val name: String, val slug: String = "", val icon: String = "box", val sort_order: Int = 0)

@Serializable
data class ProfileStats(val completed_loans: Long, val review_count: Long, val rating_average: Double? = null)

@Serializable
data class PickupLocation(
    val id: String, val name: String, val description: String? = null,
    val lat: Double? = null, val lng: Double? = null, val photo_path: String? = null,
    val is_active: Boolean = true, val xp: Double? = null, val yp: Double? = null,
    val map_label: String = "right",
)

@Serializable
data class Item(
    val id: String, val owner_id: String, val category_id: String,
    val title: String, val description: String = "", val condition: String = "good",
    val images: List<String> = emptyList(), val deposit_amount: Int = 0,
    val max_loan_days: Int = 14, val pickup_location_id: String? = null,
    val status: String = "available", val created_at: String = "", val updated_at: String = "",
    val owner: Profile? = null, val category: Category? = null, val pickup_location: PickupLocation? = null,
)

@Serializable
data class BorrowRequest(
    val id: String, val item_id: String, val borrower_id: String,
    val start_date: String, val end_date: String, val message: String? = null,
    val status: String = "pending", val decline_reason: String? = null,
    val expires_at: String? = null, val created_at: String = "", val responded_at: String? = null,
    val item: Item? = null, val borrower: Profile? = null,
)

@Serializable
data class Loan(
    val id: String, val request_id: String, val item_id: String, val owner_id: String,
    val borrower_id: String, val start_date: String, val due_date: String,
    val status: String = "awaiting_pickup", val returned_at: String? = null,
    val pickup_confirmed_at: String? = null, val return_confirmed_at: String? = null,
    val handover_token_expires_at: String? = null, val return_token_expires_at: String? = null,
    val handover_attempts: Int = 0, val return_attempts: Int = 0,
    val created_at: String = "", val updated_at: String = "",
    val item: Item? = null, val owner: Profile? = null, val borrower: Profile? = null,
)

@Serializable
data class AvailabilityWindow(val start_date: String, val end_date: String, val kind: String = "loan")

@Serializable
data class WaitlistEntry(
    val id: String, val item_id: String, val user_id: String,
    val desired_start: String, val desired_end: String, val status: String = "waiting",
    val created_at: String = "", val item: Item? = null,
)

@Serializable
data class Conversation(val id: String, val type: String, val loan_id: String? = null, val title: String? = null, val created_at: String = "")

@Serializable
data class ConversationMember(val conversation_id: String, val user_id: String, val last_read_at: String? = null, val profile: Profile? = null)

data class ConversationSummary(val conversation: Conversation, val title: String, val latest: Message?, val unread: Boolean)

@Serializable
data class Message(
    val id: String, val conversation_id: String, val sender_id: String,
    val body: String = "", val image_path: String? = null, val created_at: String = "",
    val sender: Profile? = null,
)

@Serializable
data class Review(
    val id: String, val loan_id: String, val reviewer_id: String, val reviewee_id: String,
    val role: String, val rating: Int, val comment: String? = null, val created_at: String = "",
    val reviewer: Profile? = null,
)

@Serializable
data class IncidentPhoto(val id: String, val incident_id: String, val path: String, val phase: String = "after")

@Serializable
data class Incident(
    val id: String, val loan_id: String, val reporter_id: String, val type: String,
    val description: String, val status: String = "open", val resolution_note: String? = null,
    val created_at: String = "", val reporter: Profile? = null,
    val photos: List<IncidentPhoto> = emptyList(), val loan: Loan? = null,
)

@Serializable
data class Fine(
    val id: String, val loan_id: String, val user_id: String, val amount: Int,
    val source: String, val reason: String, val status: String = "pending",
    val created_at: String = "", val user: Profile? = null, val loan: Loan? = null,
)

@Serializable
data class Notification(
    val id: String, val user_id: String, val type: String, val title: String,
    val body: String = "", val payload: Map<String, kotlinx.serialization.json.JsonElement> = emptyMap(),
    val read_at: String? = null, val created_at: String = "",
)

data class CatalogFilters(
    val query: String = "", val categoryId: String? = null, val condition: String? = null,
    val locationId: String? = null, val from: String? = null, val to: String? = null,
)
