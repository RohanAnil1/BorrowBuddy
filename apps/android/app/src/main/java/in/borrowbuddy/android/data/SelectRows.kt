package `in`.borrowbuddy.android.data

import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.PostgrestQueryBuilder
import io.github.jan.supabase.postgrest.query.request.SelectRequestBuilder
import kotlinx.coroutines.delay
import java.io.IOException
import java.util.logging.Logger

/** A successful GET must contain a JSON array, including `[]` for no rows.
 * A missing body is a transport failure, never an empty result. Retry it once;
 * this API cannot issue inserts, updates, deletes or business RPCs. */
internal suspend inline fun <reified T> PostgrestQueryBuilder.selectRows(
    columns: Columns = Columns.ALL,
    crossinline request: SelectRequestBuilder.() -> Unit = {},
): List<T> {
    repeat(2) { attempt ->
        val result = select(columns) {
            request()
            require(!head) { "Row reads require a response body." }
        }
        if (result.data.isNotBlank()) return result.decodeList<T>()
        // Never log bodies, query parameters, auth headers or account identifiers.
        Logger.getLogger("BorrowBuddyReads").warning("Empty SELECT response for $table; attempt ${attempt + 1}; content-type=${result.headers["Content-Type"]}; content-length=${result.headers["Content-Length"]}")
        if (attempt == 0) delay(150)
    }
    throw IOException("The server returned an incomplete response. Please try again.")
}
