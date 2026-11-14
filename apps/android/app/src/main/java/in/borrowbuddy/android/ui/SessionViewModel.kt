package `in`.borrowbuddy.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.data.RESET_LINK_EXPIRED
import `in`.borrowbuddy.android.domain.Profile
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * [resetting]: signed in from a reset link, so the new-password screen comes first.
 * [resetNotice]: a reset link that didn't work; the sign-in screen opens on "Forgot password" with it.
 */
data class SessionState(val initializing: Boolean = true, val profile: Profile? = null, val busy: Boolean = false, val error: String? = null,
    val resetting: Boolean = false, val resetNotice: String? = null)
class SessionViewModel(val repository: BorrowRepository) : ViewModel() {
    private val mutable = MutableStateFlow(SessionState())
    val state = mutable.asStateFlow()
    private val homeRequest = MutableStateFlow(0)
    val homeRequests = homeRequest.asStateFlow()
    fun openHome() { homeRequest.value++ }
    init {
        refresh(initialize = true)
        // The session can end without the app asking: a revoked refresh token
        // (e.g. the profile was deleted) clears it. Leave the portal right away.
        if (repository.configured) viewModelScope.launch {
            repository.client.auth.sessionStatus.collect {
                if (it is SessionStatus.NotAuthenticated && mutable.value.profile != null)
                    mutable.value = SessionState(initializing = false)
            }
        }
    }
    fun refresh(initialize: Boolean = false) {
        viewModelScope.launch {
            try {
                if (initialize) repository.initialize()
                val profile = repository.profile()
                val current = mutable.value
                mutable.value = SessionState(initializing = false, profile = profile, resetting = current.resetting, resetNotice = current.resetNotice)
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { mutable.value = mutable.value.copy(initializing = false, busy = false, error = friendlyError(failure)) }
        }
    }
    fun authenticate(signup: Boolean, email: String, password: String, confirmation: String) {
        perform {
            if (signup) repository.signUp(email, password, confirmation) else repository.signIn(email, password)
        }
    }
    fun perform(action: suspend () -> Unit) {
        if (mutable.value.busy) return
        viewModelScope.launch {
            mutable.value = mutable.value.copy(busy = true, error = null)
            try { action(); mutable.value = SessionState(initializing = false, profile = repository.profile(), resetting = mutable.value.resetting) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { mutable.value = mutable.value.copy(busy = false, error = friendlyError(failure)) }
        }
    }
    fun signOut() { perform { repository.signOut() } }

    /** True once the email is on its way; errors land in [SessionState.error]. */
    fun requestPasswordReset(email: String, sent: () -> Unit) {
        mutable.value = mutable.value.copy(resetNotice = null)
        perform { repository.requestPasswordReset(email); sent() }
    }
    fun openResetLink(link: ResetLink) {
        when (link) {
            ResetLink.Expired -> mutable.value = mutable.value.copy(resetting = false, resetNotice = RESET_LINK_EXPIRED, error = null)
            is ResetLink.Code -> viewModelScope.launch {
                mutable.value = mutable.value.copy(busy = true, error = null, resetNotice = null)
                try {
                    repository.redeemResetCode(link.code)
                    mutable.value = SessionState(initializing = false, profile = repository.profile(), resetting = true)
                } catch (cancelled: CancellationException) { throw cancelled }
                catch (failure: Exception) { mutable.value = mutable.value.copy(initializing = false, busy = false, resetNotice = friendlyError(failure)) }
            }
        }
    }
    fun setNewPassword(password: String, confirmation: String) {
        perform { repository.setNewPassword(password, confirmation); mutable.value = mutable.value.copy(resetting = false) }
    }
    fun skipNewPassword() { mutable.value = mutable.value.copy(resetting = false, error = null) }
}
