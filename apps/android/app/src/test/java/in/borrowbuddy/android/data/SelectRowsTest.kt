package `in`.borrowbuddy.android.data

import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.*
import kotlinx.coroutines.*
import kotlinx.serialization.Serializable
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class SelectRowsTest {
    @Serializable private data class Row(val id: Int)
    private fun client(engine: MockEngine)=createSupabaseClient("https://example.supabase.co","public-test-key") {
        httpEngine=engine; install(Postgrest)
    }
    @Test fun missingSuccessfulBodyRetriesTheSameGetAndPreservesFilters()= runBlocking {
        val requests=mutableListOf<String>()
        val engine=MockEngine { request ->
            assertEquals(HttpMethod.Get,request.method); requests.add(request.url.toString())
            respond(if(requests.size==1) "" else "[{\"id\":1}]",HttpStatusCode.OK,headersOf(HttpHeaders.ContentType,"application/json"))
        }
        val api=client(engine)
        try {
            val rows=api.from("loans").selectRows<Row>(Columns.raw("id")) { filter { eq("owner_id","viewer") }; order("created_at",Order.DESCENDING); limit(60) }
            assertEquals(listOf(Row(1)),rows); assertEquals(2,requests.size); assertEquals(requests[0],requests[1])
            assertTrue(requests[0].contains("owner_id=eq.viewer")); assertTrue(requests[0].contains("limit=60"))
        } finally { api.close() }
    }
    @Test fun legitimateEmptyArrayDoesNotRetry()= runBlocking {
        var requests=0
        val api=client(MockEngine { requests++; respond("[]",HttpStatusCode.OK,headersOf(HttpHeaders.ContentType,"application/json")) })
        try { assertTrue(api.from("loans").selectRows<Row>().isEmpty()); assertEquals(1,requests) } finally { api.close() }
    }
    @Test fun repeatedMissingBodyFailsRatherThanReturningNoLoans()= runBlocking {
        var requests=0
        val api=client(MockEngine { requests++; respond("",HttpStatusCode.OK,headersOf(HttpHeaders.ContentType,"application/json")) })
        try {
            try { api.from("loans").selectRows<Row>(); fail("Missing data cannot become an empty ledger") }
            catch(expected: IOException) { assertTrue(expected.message!!.contains("incomplete response")) }
            assertEquals(2,requests)
        } finally { api.close() }
    }
    @Test fun authorizationFailureAndMalformedNonemptyDataAreNotRetried()= runBlocking {
        for((status,body) in listOf(HttpStatusCode.Forbidden to "{\"code\":\"42501\",\"message\":\"denied\",\"details\":null,\"hint\":null}", HttpStatusCode.OK to "{\"unexpected\":true}")) {
            var requests=0
            val api=client(MockEngine { requests++; respond(body,status,headersOf(HttpHeaders.ContentType,"application/json")) })
            try {
                var failed=false
                try { api.from("loans").selectRows<Row>() } catch(expected: Exception) { failed=true }
                assertTrue("The original failure must propagate",failed); assertEquals(1,requests)
            } finally { api.close() }
        }
    }
    @Test fun leavingTheScreenCancelsRecovery()= runBlocking {
        var requests=0; val requested=CompletableDeferred<Unit>()
        val api=client(MockEngine { requests++; requested.complete(Unit); respond("",HttpStatusCode.OK,headersOf(HttpHeaders.ContentType,"application/json")) })
        try {
            val read=launch { api.from("loans").selectRows<Row>() }
            requested.await(); read.cancelAndJoin(); assertTrue(read.isCancelled); assertEquals(1,requests)
        } finally { api.close() }
    }
}
