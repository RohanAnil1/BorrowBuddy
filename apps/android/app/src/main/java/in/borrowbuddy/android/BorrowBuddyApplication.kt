package `in`.borrowbuddy.android

import android.app.Application
import `in`.borrowbuddy.android.data.BorrowRepository

class BorrowBuddyApplication : Application() {
    val repository: BorrowRepository by lazy { BorrowRepository(applicationContext) }
}
