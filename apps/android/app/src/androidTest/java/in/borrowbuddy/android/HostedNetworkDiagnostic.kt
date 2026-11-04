package `in`.borrowbuddy.android

import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URI

/** Opt-in, fixture-free HTTPS diagnostic from the actual Android network stack. */
class HostedNetworkDiagnostic {
    @Test fun hostedAuthHealthOverAndroidHttps() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("qaNetworkCheck") == "1")
        val connection = URI(BuildConfig.SUPABASE_URL + "/auth/v1/health").toURL().openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 15_000; connection.readTimeout = 15_000
            connection.setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
            assertEquals("Android HTTPS auth health", 200, connection.responseCode)
        } finally { connection.disconnect() }
    }
}
