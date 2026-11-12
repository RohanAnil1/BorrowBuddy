package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import `in`.borrowbuddy.android.domain.Profile
import `in`.borrowbuddy.android.domain.ProfileStamp
import `in`.borrowbuddy.android.graphics.MemberCardArtwork
import `in`.borrowbuddy.android.graphics.MemberLanyardView
import `in`.borrowbuddy.android.graphics.memberCode

val MemberCardReady=SemanticsPropertyKey<Boolean>("MemberCardReady")
val MemberCardBack=SemanticsPropertyKey<Boolean>("MemberCardBack")
val MemberCardRole=SemanticsPropertyKey<String>("MemberCardRole")

/** [stamps] is null when they could not be loaded or the viewer is unverified: the panel is left out. */
@Composable fun MemberIdCard(profile: Profile, modifier: Modifier=Modifier, stamps: List<ProfileStamp>?=null, ownerStamps: Boolean=false) {
    val context=LocalContext.current
    val artwork=remember(profile) { MemberCardArtwork(context,profile) }
    var ready by remember(profile.id) { mutableStateOf(false) }
    var failed by remember(profile.id) { mutableStateOf(false) }
    var back by rememberSaveable(profile.id) { mutableStateOf(false) }
    var view by remember { mutableStateOf<MemberLanyardView?>(null) }
    val lifecycle=LocalLifecycleOwner.current.lifecycle; val reduced=rememberReducedMotion()
    val viewport=LocalWindowInfo.current.containerSize.width/LocalDensity.current.density
    val currentView=view
    DisposableEffect(lifecycle,currentView) {
        currentView?.resumed=lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
        val observer=LifecycleEventObserver { _,_ -> currentView?.resumed=lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer); currentView?.resumed=false }
    }
    Column(modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp,Cargo.Line).testTag("member-id-card").semantics {
        this[MemberCardReady]=ready; this[MemberCardBack]=back; this[MemberCardRole]=if(profile.is_admin) "admin" else "student"
        contentDescription="${profile.full_name}. ${if(profile.is_admin) "Admin" else "Student"} BorrowBuddy membership ${memberCode(profile.id)}. ${profile.department ?: "Bennett University"}. Verification ${profile.verification_status}."
    }) {
        FlowRow(Modifier.fillMaxWidth().padding(horizontal=21.dp,vertical=17.dp),horizontalArrangement=Arrangement.SpaceBetween,verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Text("[ CREW ID ]",style=loanMono(11),color=Cargo.Ink.copy(alpha=.6f))
            Text("${if(profile.is_admin) "ADMIN" else "STUDENT"} · ${memberCode(profile.id)}",style=loanMono(9),color=Cargo.Accent)
        }
        Box(Modifier.fillMaxWidth().border(1.dp,Cargo.Line)) {
            val stageHeight=if(viewport>=640) 560.dp else 480.dp
            Box(Modifier.fillMaxWidth().height(stageHeight)) {
                Canvas(Modifier.fillMaxSize().alpha(if(ready && !failed) 0f else 1f)) {
                    drawIntoCanvas { canvas ->
                        val targetHeight=minOf(size.height*.76f,size.width*.72f*1440/1024)
                        val scale=targetHeight/1440; val width=1024*scale
                        canvas.nativeCanvas.save(); canvas.nativeCanvas.translate((size.width-width)/2,(size.height-targetHeight)/2)
                        canvas.nativeCanvas.scale(scale,scale); artwork.paintFace(canvas.nativeCanvas,back); canvas.nativeCanvas.restore()
                    }
                }
                if(!failed) key(profile.id) { AndroidView(factory={ ctx ->
                    MemberLanyardView(ctx,profile,{ ready=true },{ failed=true; ready=false },{ back=it }).also {
                        view=it; it.reducedMotion=reduced; it.resumed=lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
                    }
                },update={ it.reducedMotion=reduced; it.updateProfile(profile); it.setBack(back) },modifier=Modifier.fillMaxSize()) }
            }
        }
        stamps?.let { MemberStamps(it, ownerStamps) }
        FlowRow(Modifier.fillMaxWidth().padding(horizontal=21.dp,vertical=12.dp),horizontalArrangement=Arrangement.SpaceBetween,
            verticalArrangement=Arrangement.spacedBy(8.dp),itemVerticalAlignment=Alignment.CenterVertically) {
            Text(if(ready) "DRAG TO SWING · TAP TO FLIP" else "YOUR BORROWBUDDY MEMBERSHIP",style=loanMono(9),color=Cargo.Ink.copy(alpha=.5f))
            Box(Modifier.heightIn(min=48.dp).clickable(role=Role.Button,onClickLabel=if(back) "Show front of ID card" else "Show back of ID card") {
                back=!back
            }.testTag("member-card-flip").padding(horizontal=12.dp,vertical=16.dp)) {
                Text("FLIP CARD ↻",style=loanMono(10),color=Cargo.Accent)
            }
        }
    }
}
