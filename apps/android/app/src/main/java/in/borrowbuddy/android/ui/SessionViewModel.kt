package `in`.borrowbuddy.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import `in`.borrowbuddy.android.data.BorrowRepository
import `in`.borrowbuddy.android.domain.Profile
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SessionState(val initializing: Boolean = true, val profile: Profile? = null, val busy: Boolean = false, val error: String? = null)
class SessionViewModel(val repository: BorrowRepository) : ViewModel() {
    private val mutable = MutableStateFlow(SessionState())
    val state = mutable.asStateFlow()
    private val homeRequest = MutableStateFlow(0)
    val homeRequests = homeRequest.asStateFlow()
    fun openHome() { homeRequest.value++ }
    init { refresh(initialize = true) }
    fun refresh(initialize: Boolean = false) {
        viewModelScope.launch {
            try {
                if (initialize) repository.initialize()
                mutable.value = SessionState(initializing = false, profile = repository.profile())
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
            try { action(); mutable.value = SessionState(initializing = false, profile = repository.profile()) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) { mutable.value = mutable.value.copy(busy = false, error = friendlyError(failure)) }
        }
    }
    fun signOut() { perform { repository.signOut() } }
}
