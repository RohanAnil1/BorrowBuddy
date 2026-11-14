package `in`.borrowbuddy.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.SystemBarStyle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewmodel.compose.viewModel
import `in`.borrowbuddy.android.ui.BorrowBuddyApp
import `in`.borrowbuddy.android.ui.CargoTheme
import `in`.borrowbuddy.android.ui.ResetLink
import `in`.borrowbuddy.android.ui.parseResetLink
import `in`.borrowbuddy.android.ui.SessionViewModel
import `in`.borrowbuddy.android.widget.WidgetRoutes
import `in`.borrowbuddy.android.widget.WidgetSync
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    /** A screen a home-screen widget asked for; the portal consumes it once signed in. */
    private val widgetRoute = MutableStateFlow<String?>(null)
    /** A link back from the password-reset email. */
    private val resetLink = MutableStateFlow<ResetLink?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        if (savedInstanceState == null) acceptRoute(intent)
        val repository = (application as BorrowBuddyApplication).repository
        setContent {
            CargoTheme {
                val model: SessionViewModel = viewModel(factory = object : ViewModelProvider.Factory {
                    @Suppress("UNCHECKED_CAST")
                    override fun <T : ViewModel> create(modelClass: Class<T>): T = SessionViewModel(repository) as T
                })
                BorrowBuddyApp(model, widgetRoute, resetLink)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        acceptRoute(intent)
    }

    override fun onStop() {
        super.onStop()
        // Leaving the app is when loans, requests or chats most likely changed.
        val context = applicationContext
        lifecycleScope.launch { WidgetSync.onAppLeft(context, (application as BorrowBuddyApplication).repository) }
    }

    /** Only allow-listed routes: the activity is exported, so extras are untrusted. */
    private fun acceptRoute(intent: Intent?) {
        WidgetRoutes.accept(intent?.getStringExtra(WidgetRoutes.EXTRA))?.let { widgetRoute.value = it }
        intent?.removeExtra(WidgetRoutes.EXTRA)
        parseResetLink(intent?.dataString)?.let { resetLink.value = it; intent?.data = null }
    }
}
