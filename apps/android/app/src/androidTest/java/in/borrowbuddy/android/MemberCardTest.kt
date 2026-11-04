package `in`.borrowbuddy.android

import android.view.View
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.test.platform.app.InstrumentationRegistry
import `in`.borrowbuddy.android.domain.Profile
import `in`.borrowbuddy.android.graphics.MemberLanyardView
import `in`.borrowbuddy.android.ui.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class MemberCardTest {
    @get:Rule val compose=createAndroidComposeRule<ComponentActivity>()
    private fun find(view: View): MemberLanyardView? {
        if(view is MemberLanyardView) return view
        if(view is ViewGroup) for(index in 0 until view.childCount) find(view.getChildAt(index))?.let { return it }
        return null
    }
    private fun native(): MemberLanyardView {
        var view: MemberLanyardView?=null
        compose.runOnUiThread { view=find(compose.activity.window.decorView) }
        return requireNotNull(view)
    }
    private fun shell(command: String)=android.os.ParcelFileDescriptor.AutoCloseInputStream(
        InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand(command)).bufferedReader().use { it.readText().trim() }
    private fun snapshot(name: String,view: MemberLanyardView): IntArray {
        var bitmap: android.graphics.Bitmap?=null
        compose.runOnUiThread { bitmap=view.bitmap }
        val image=requireNotNull(bitmap)
        try {
            val pixels=IntArray(image.width*image.height); image.getPixels(pixels,0,image.width,0,0,image.width,image.height)
            val orange=pixels.count { android.graphics.Color.alpha(it)>128 && android.graphics.Color.red(it)>100 && android.graphics.Color.green(it)>50 && android.graphics.Color.blue(it)<70 }
            val blue=pixels.indices.filter { val color=pixels[it]; android.graphics.Color.alpha(color)>128 && android.graphics.Color.blue(color)>70 && android.graphics.Color.red(color)<60 }
            assertTrue("GPU must paint the personalized orange and blue artwork",orange>200 && blue.size>500)
            assertTrue("The blue printed header must be upright above the card center",blue.map { it/image.width }.average()<image.height*.55)
            val opaque=pixels.count { android.graphics.Color.alpha(it)>128 }
            assertTrue("UVs must preserve the dark printed card body",blue.size<opaque*.45)
            val lettering=pixels.indices.count { index -> val color=pixels[index]; val y=index/image.width
                y>image.height*.3 && y<image.height*.75 && android.graphics.Color.alpha(color)>128 &&
                    android.graphics.Color.red(color)>150 && android.graphics.Color.green(color)>150 && android.graphics.Color.blue(color)>150 }
            assertTrue("Personalized lettering must actually reach the GPU",lettering>500)
            InstrumentationRegistry.getInstrumentation().targetContext.filesDir.resolve("member-card-native-$name.png").outputStream().use { image.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it) }
            return pixels
        } finally { image.recycle() }
    }
    @Test fun studentsAndAdminsRenderFlipDragPauseAndReleaseNativeResources() {
        assumeTrue(InstrumentationRegistry.getArguments().getString("qaMemberCard")=="1")
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val launcher=context.packageManager.getApplicationIcon(context.packageName)
        assertTrue("Packaged launcher must be adaptive",launcher is android.graphics.drawable.AdaptiveIconDrawable)
        if(android.os.Build.VERSION.SDK_INT>=33) assertNotNull("Packaged themed icon",(launcher as android.graphics.drawable.AdaptiveIconDrawable).monochrome)
        var profile by mutableStateOf(Profile("a1111111-1111-4111-8111-111111111111",full_name="Mira Sharma",department="Computer Science",year_of_study=3,trust_score=87.6,verification_status="verified",created_at="2025-08-01T00:00:00Z"))
        var show by mutableStateOf(true)
        compose.setContent { CargoTheme { Column(Modifier.fillMaxSize().background(Cargo.Panel).padding(16.dp)) { if(show) MemberIdCard(profile) } } }
        val results=org.json.JSONArray()
        for(role in listOf("student","admin")) {
            if(role=="admin") compose.runOnIdle { profile=profile.copy(id="a2222222-2222-4222-8222-222222222222",full_name="Aditi Rao",is_admin=true) }
            compose.waitUntil(30_000) { compose.onAllNodes(SemanticsMatcher.expectValue(MemberCardReady,true) and SemanticsMatcher.expectValue(MemberCardRole,role)).fetchSemanticsNodes().isNotEmpty() }
            val art=`in`.borrowbuddy.android.graphics.MemberCardArtwork(context,profile)
            for(back in listOf(false,true)) {
                val bitmap=android.graphics.Bitmap.createBitmap(1024,1440,android.graphics.Bitmap.Config.ARGB_8888)
                try {
                    art.paintFace(android.graphics.Canvas(bitmap),back)
                    var paper=0;var amber=0
                    for(y in 96 until 176) for(x in 832 until 928) {
                        val color=bitmap.getPixel(x,y)
                        if(android.graphics.Color.red(color)>220 && android.graphics.Color.green(color)>220 && android.graphics.Color.blue(color)>200) paper++
                        if(android.graphics.Color.red(color)>200 && android.graphics.Color.green(color) in 100..200 && android.graphics.Color.blue(color)<20) amber++
                    }
                    assertTrue("Approved two-part logo must reach both $role card faces",paper>200 && amber>200)
                } finally {bitmap.recycle()}
            }
            val view=native(); val initial=view.renderedFrames
            compose.waitUntil(20_000) { view.renderedFrames>initial+180 }
            val front=snapshot(role,view)
            val location=IntArray(2); compose.runOnUiThread { view.getLocationOnScreen(location) }
            val x=location[0]+view.width*.5f; val y=location[1]+view.height*.57f
            val down=android.os.SystemClock.uptimeMillis()
            fun touch(action: Int,px: Float,py: Float) {
                val event=android.view.MotionEvent.obtain(down,android.os.SystemClock.uptimeMillis(),action,px,py,0)
                try { InstrumentationRegistry.getInstrumentation().sendPointerSync(event) } finally { event.recycle() }
            }
            touch(android.view.MotionEvent.ACTION_DOWN,x,y)
            assertTrue("Touch must hit the actual 3D card",view.isGrabbed)
            touch(android.view.MotionEvent.ACTION_MOVE,x+64,y-32)
            val dragging=view.renderedFrames; compose.waitUntil(5_000) { view.renderedFrames>dragging+5 }
            touch(android.view.MotionEvent.ACTION_UP,x+64,y-32); assertFalse(view.isGrabbed)
            compose.onNodeWithTag("member-card-flip").performClick()
            compose.waitUntil(5_000) { view.showingBack }
            compose.onNodeWithTag("member-id-card").assert(SemanticsMatcher.expectValue(MemberCardBack,true))
            compose.onNodeWithTag("member-card-flip").performClick(); compose.waitUntil(5_000) { !view.showingBack }
            val beforeBackground=view.renderedFrames
            compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
            val stopped=view.renderedFrames
            Thread.sleep(150); assertTrue("No frame loop may run in background",view.renderedFrames<=stopped+1)
            compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
            compose.waitUntil(5_000) { view.renderedFrames>beforeBackground+5 }
            if(role=="admin" && shell("getprop ro.kernel.qemu")=="1") {
                val original=shell("settings get global animator_duration_scale")
                check(original=="null" || Regex("[0-9]+(?:\\.[0-9]+)?").matches(original))
                try {
                    shell("settings put global animator_duration_scale 0")
                    compose.waitUntil(5_000) { view.reducedMotion }
                    var last=view.renderedFrames; var since=android.os.SystemClock.elapsedRealtime()
                    try { compose.waitUntil(30_000) {
                        val now=android.os.SystemClock.elapsedRealtime()
                        if(last!=view.renderedFrames) { last=view.renderedFrames; since=now }
                        now-since>400
                    } } catch(error: androidx.compose.ui.test.ComposeTimeoutException) {
                        val field=MemberLanyardView::class.java.getDeclaredField("motion").apply { isAccessible=true }
                        val motion=field.get(view) as `in`.borrowbuddy.android.graphics.LanyardPhysics
                        throw AssertionError("Reduced-motion frames did not stop: frames=${view.renderedFrames}, calm=${motion.calm}, grabbed=${view.isGrabbed}, reduced=${view.reducedMotion}",error)
                    }
                } finally {
                    if(original=="null") shell("settings delete global animator_duration_scale") else shell("settings put global animator_duration_scale $original")
                }
            }
            assertTrue(front.isNotEmpty())
            results.put(org.json.JSONObject().put("role",role).put("gpuArtwork",true).put("drag",true).put("flip",true).put("backgroundPaused",true).put("approvedLogoOnBothFaces",true))
        }
        val old=native(); compose.runOnIdle { show=false }
        compose.waitUntil(5_000) { !old.isAttachedToWindow }
        val frames=old.renderedFrames; Thread.sleep(150); assertEquals(frames,old.renderedFrames)
        InstrumentationRegistry.getInstrumentation().targetContext.filesDir.resolve("member-card-native-result.json").writeText(org.json.JSONObject().put("roles",results).put("detachedFramesStopped",true).put("adaptiveLauncherIcon",true).put("themedIcon",android.os.Build.VERSION.SDK_INT>=33)
            .put("reducedMotionEmulatorCheck",shell("getprop ro.kernel.qemu")=="1").toString(2))
    }
}
