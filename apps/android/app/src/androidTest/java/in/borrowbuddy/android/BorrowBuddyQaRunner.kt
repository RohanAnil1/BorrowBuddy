package `in`.borrowbuddy.android

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.view.autofill.AutofillManager
import androidx.test.runner.AndroidJUnitRunner

class BorrowBuddyQaRunner : AndroidJUnitRunner() {
    override fun callActivityOnCreate(activity: Activity, icicle: Bundle?) {
        super.callActivityOnCreate(activity, icicle)
        if (activity is MainActivity) {
            // Temporary test passwords must never reach a real device's password manager.
            activity.window.decorView.importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
            activity.getSystemService(AutofillManager::class.java)?.cancel()
        }
    }
}
