package `in`.borrowbuddy.android.smoke

import android.os.Bundle
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Black-box checks: no production class/method names survive into this test's calls.
 * It can instrument the real R8 output signed with the local QA debug certificate. */
class MinifiedAppTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val device get() = UiDevice.getInstance(instrumentation)
    private fun settled(node: UiObject2): UiObject2 {
        // The backdrop, ticker, carets and GPU card animate intentionally. Require
        // stable properties/bounds across the navigation transition, not frozen pixels.
        val result = node.waitForStable(stableTimeoutMs = 5_000, stableIntervalMs = 1_000, requireStableScreenshot = false)
        try { assertFalse("Native control must settle before interaction", result.isTimeout) }
        finally { result.screenshot?.recycle() }
        return node
    }
    private fun await(selector: BySelector) = settled(requireNotNull(device.wait(Until.findObject(selector), 30_000)) { "Expected native UI did not appear: $selector" })
    private fun reveal(text: String, last: Boolean = false): UiObject2 {
        repeat(10) {
            val matches = device.findObjects(By.text(text)).filter { it.visibleBounds.height() > 0 }
            (if (last) matches.lastOrNull() else matches.firstOrNull())?.let { node -> return settled(node) }
            // The outer scroll gutter leaves the interactive 3D card free to drag.
            device.swipe(8, device.displayHeight * 4 / 5, 8, device.displayHeight / 4, 30)
        }
        return await(By.text(text))
    }
    private fun cardSamples(bounds: android.graphics.Rect): IntArray {
        val image = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        try {
            return IntArray(3600) { index ->
                val x = (bounds.left + (index % 60 + .5f) * bounds.width() / 60).toInt().coerceIn(0, image.width - 1)
                val y = (bounds.top + (index / 60 + .5f) * bounds.height() / 60).toInt().coerceIn(0, image.height - 1)
                image.getPixel(x, y)
            }
        } finally { image.recycle() }
    }
    @Test fun optimizedAppAuthenticatesLoadsPublicProfileAnimatesCardAndSignsOut() {
        val args = InstrumentationRegistry.getArguments()
        assumeTrue("Opt-in signed minified QA build and isolated actor required", args.getString("qaMinifiedApp") == "1" && !args.getString("qaEmail").isNullOrBlank() && !args.getString("qaPassword").isNullOrBlank())
        val requireProcessDeath = args.getString("qaRequireProcessDeath") != "0"
        val context = instrumentation.targetContext
        val targetPackage = "in.borrowbuddy.android"
        val targetInfo = context.packageManager.getApplicationInfo(targetPackage, 0)
        assertFalse("This must exercise the release build", targetInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0)
        val launch = requireNotNull(context.packageManager.getLaunchIntentForPackage(targetPackage))
        try {
        context.startActivity(launch.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK))
        await(By.text("▶ START BORROWING")).click(); await(By.text("WELCOME BACK"))
        assertTrue(device.wait(Until.hasObject(By.clazz("android.widget.EditText")), 30_000))
        val fields = device.findObjects(By.clazz("android.widget.EditText")); assertEquals(2, fields.size)
        fields[0].text = args.getString("qaEmail")!!; fields[1].text = args.getString("qaPassword")!!
        // The source UI also has a selected SIGN IN tab above the submit button.
        reveal("SIGN IN", last = true).click()
        await(By.text("WHAT'S ON THE SHELF TODAY"))
        await(By.text("CAMPUS")).click(); await(By.text("GOOD THINGS FIND THEIR WAY BACK."))
        reveal("LOST & FOUND").click(); await(By.text("POST A FOUND ITEM"))
        await(By.text("CAMPUS")).click(); await(By.text("GOOD THINGS FIND THEIR WAY BACK."))
        reveal("GIVEAWAYS").click(); await(By.text("GIVE SOMETHING AWAY"))
        await(By.text("CAMPUS")).click(); await(By.text("GOOD THINGS FIND THEIR WAY BACK."))
        reveal("HANDOVERS").click(); await(By.text("MEET ON YOUR SCHEDULE."))
        await(By.text("BROWSE")).click(); await(By.text("WHAT'S ON THE SHELF TODAY"))
        await(By.text("CHAT")).click()
        assertTrue("The native chat list must open", device.wait(Until.hasObject(By.text("Messages")), 30_000))
        reveal("Android QA pickup coordination").click()
        await(By.text("Private loan channel"))
        // BasicTextField exposes its label as a child of the editable platform node.
        val composer = await(By.clazz("android.widget.EditText").hasDescendant(By.desc("Write a message")))
        composer.click()
        val unsent="Unsent process recovery draft"
        composer.text=unsent
        assertTrue(device.wait(Until.hasObject(By.clazz("android.widget.EditText").text(unsent)),10_000))
        val oldPid=device.executeShellCommand("pidof $targetPackage").trim()
        assertTrue("The original production process must exist",oldPid.matches(Regex("[0-9]+")))
        device.pressHome()
        assertTrue("Background the app before simulating system process reclamation",device.wait(Until.gone(By.pkg(targetPackage)),10_000))
        if (requireProcessDeath) {
            // Keep the task's saved state so the restart exercises system reclamation.
            device.executeShellCommand("am kill $targetPackage")
            val killedDeadline = android.os.SystemClock.uptimeMillis() + 10_000
            while (device.executeShellCommand("pidof $targetPackage").trim().isNotEmpty() && android.os.SystemClock.uptimeMillis() < killedDeadline)
                android.os.SystemClock.sleep(50)
            assertTrue("The app process must really die", device.executeShellCommand("pidof $targetPackage").trim().isEmpty())
        }
        val restore=requireNotNull(context.packageManager.getLaunchIntentForPackage(targetPackage))
        restore.flags=android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED
        context.startActivity(restore)
        await(By.text("Private loan channel"))
        val recovered=await(By.clazz("android.widget.EditText").text(unsent))
        assertEquals("The unsent original-case draft must survive restoring the task",unsent,recovered.text)
        val newPid=device.executeShellCommand("pidof $targetPackage").trim()
        assertTrue("The restored app process must exist", newPid.matches(Regex("[0-9]+")))
        val processDied = newPid != oldPid
        if (requireProcessDeath) assertTrue("Recovery must run in a different process", processDied)
        recovered.click(); recovered.text = "Optimized native chat message"
        assertTrue(device.wait(Until.hasObject(By.clazz("android.widget.EditText").text("Optimized native chat message")), 10_000))
        await(By.desc("Send message").enabled(true)).click()
        await(By.text("Optimized native chat message"))
        await(By.desc("Back to chats")).click(); await(By.text("Messages"))
        await(By.desc("Open account")).click(); await(By.text("[ CREW FILE ]"))
        reveal("VIEW PUBLIC PROFILE →").click(); await(By.text("COMPLETED LOANS"))
        val card = By.descContains("BorrowBuddy membership")
        repeat(5) {
            val bounds = device.findObject(card)?.visibleBounds
            if (bounds == null || bounds.height() < device.displayHeight / 2)
                device.swipe(8, device.displayHeight * 4 / 5, 8, device.displayHeight * 11 / 20, 30)
        }
        val bounds = await(card).visibleBounds
        assertTrue("The actual membership card must be visible", bounds.height() > device.displayHeight / 2)
        var before = cardSamples(bounds)
        val deadline = android.os.SystemClock.uptimeMillis() + 30_000
        var movingPairs = 0; var maxChanged = 0
        while (android.os.SystemClock.uptimeMillis() < deadline && movingPairs < 2) {
            Thread.sleep(250)
            val after = cardSamples(bounds)
            val changed = after.indices.count { after[it] != before[it] }
            maxChanged = maxOf(maxChanged, changed)
            movingPairs = if (changed > 10) movingPairs + 1 else 0
            before = after
        }
        assertEquals("Two consecutive changing frames must come from the card, not the static fallback", 2, movingPairs)
        // Back restores the account's previous (scrolled) reading position.
        device.pressBack(); await(By.text("VIEW PUBLIC PROFILE →")); reveal("SIGN OUT").click(); await(By.text("WELCOME BACK"))
        instrumentation.sendStatus(0, Bundle().apply { putString("qaMinifiedResult", JSONObject().put("debuggable", false).put("authenticated", true)
            .put("actualProcessDeath",processDied).put("sessionRestoredAfterResume",true).put("chatRouteRestoredAfterResume",true)
            .put("draftRestoredAfterResume",true).put("previousPid",oldPid).put("restoredPid",newPid)
            .put("catalogLoaded", true).put("campusRoutesLoaded", true).put("chatLoadedAndSent", true).put("publicProfileLoaded", true).put("animatedMembershipCard", true).put("consecutiveMovingFrames", movingPairs)
            .put("maxChangedCardSamples", maxChanged).put("signedOut", true).toString()) })
        } catch (failure: Throwable) {
            runCatching {
                val output = java.io.ByteArrayOutputStream(); device.dumpWindowHierarchy(output)
                val safe = output.toString("UTF-8").replace(Regex("<node\\b[^>]*password=\"true\"[^>]*>"), "<node password=\"true\" text=\"[PASSWORD REDACTED]\">")
                    .replace(args.getString("qaPassword")!!, "[QA PASSWORD REDACTED]").replace(args.getString("qaEmail")!!, "[QA EMAIL REDACTED]")
                    .replace(Regex("eyJ[A-Za-z0-9._-]+"), "[TOKEN REDACTED]")
                context.filesDir.resolve("minified-failure.xml").writeText(safe)
                instrumentation.uiAutomation.takeScreenshot()?.let { image ->
                    try { context.filesDir.resolve("minified-failure.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } }
                    finally { image.recycle() }
                }
            }
            throw failure
        }
    }
}
