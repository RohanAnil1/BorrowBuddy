package `in`.borrowbuddy.android.graphics

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.view.Choreographer
import android.view.MotionEvent
import android.view.Surface
import android.view.TextureView
import android.view.ViewConfiguration
import com.google.android.filament.*
import com.google.android.filament.android.TextureHelper
import com.google.android.filament.android.UiHelper
import com.google.android.filament.utils.ModelViewer
import com.google.android.filament.utils.Utils
import `in`.borrowbuddy.android.domain.Profile
import java.nio.ByteBuffer
import java.util.concurrent.Executors
import kotlin.math.*

/** Native Filament card, original exported geometry and Kotlin strap physics. */
class MemberLanyardView(context: Context, private var profile: Profile, private val onReady: () -> Unit,
    private val onFailure: () -> Unit, private val onFlip: (Boolean) -> Unit) : TextureView(context), Choreographer.FrameCallback {
    private val motion=LanyardPhysics()
    private val choreographer=Choreographer.getInstance(); private val handler=Handler(Looper.getMainLooper())
    private val helper=UiHelper(UiHelper.ContextErrorPolicy.DONT_CHECK).apply { isOpaque=false }
    private val visibleRect=Rect(); private val worker=Executors.newSingleThreadExecutor()
    private val textures=mutableListOf<Texture>(); private val entities=mutableMapOf<String,Int>()
    private val curve=Array(201) { LanyardVector() }; private val arc=DoubleArray(201)
    private val samples=Array(72) { LanyardVector() }; private val controls=mutableListOf<LanyardVector>()
    private val jointNames=Array(72) { "MemberBandJoint$it" }
    private val mouth=LanyardVector(); private val tuck=LanyardVector(); private val axis=LanyardVector()
    private val across=LanyardVector(); private val facing=LanyardVector(); private val tangent=LanyardVector()
    private val cameraVector=LanyardVector(); private val ghostStart=LanyardVector(); private val ghostEnd=LanyardVector()
    private val matrix=FloatArray(16); private val ray=LanyardVector(); private val hit=LanyardVector(); private val normal=LanyardVector()
    private val uvMatrix=FloatArray(9).apply { this[0]=1f; this[8]=1f }
    private val ribbonRight=LanyardVector()
    private var uvRepeat=Float.NaN
    private val inverse=LanyardQuaternion()
    private var model: ModelViewer?=null; private var ambient: IndirectLight?=null
    private var reflections: Texture?=null
    private var initializingEngine: Engine?=null
    private var attached=false; private var disposed=false; private var initialized=false; private var ready=false
    private var lastFrame=0L; private var imageGeneration=0; private var uploadedGeneration=0; private var pending=0
    private var viewportWidth=0; private var viewportHeight=0; private var viewHeight=3.26087; private var cameraZ=8.0
    private var downX=0f; private var downY=0f; private var downTime=0L; private var dragged=false; private var grabReach=0.0
    private val probe=Runnable { schedule() }
    var renderedFrames=0L; private set
    var resumed=true
        set(value) { field=value; lastFrame=0; if(value) schedule() else stop() }
    var reducedMotion=false
        set(value) { if(field!=value) { field=value; schedule() } }
    val showingBack get()=motion.back
    val isGrabbed get()=motion.grabbed
    init { isOpaque=false; isClickable=true; contentDescription="BorrowBuddy ID card for ${profile.full_name}. Drag to swing; tap to flip." }
    override fun onAttachedToWindow() {
        super.onAttachedToWindow(); attached=true
        if(disposed) return
        try {
            Utils.init()
            val engine=Engine.create(Engine.Backend.OPENGL)
            initializingEngine=engine
            // Build the temporary prefilter scene before ModelViewer owns its
            // camera/surface. Its helper camera teardown must precede the viewer.
            reflections=memberCardEnvironment(engine)
            val viewer=ModelViewer(this,engine=engine,uiHelper=helper,manipulator=null); model=viewer
            initializingEngine=null
            val callbacks=helper.renderCallback!!
            helper.renderCallback=object: UiHelper.RendererCallback {
                override fun onNativeWindowChanged(surface: Surface)=callbacks.onNativeWindowChanged(surface)
                override fun onDetachedFromSurface()=callbacks.onDetachedFromSurface()
                override fun onResized(w: Int,h: Int) { callbacks.onResized(helper.desiredWidth.takeIf { it>0 } ?: w,helper.desiredHeight.takeIf { it>0 } ?: h); configure() }
            }
            viewer.view.blendMode=View.BlendMode.TRANSLUCENT
            viewer.renderer.clearOptions=Renderer.ClearOptions().apply { clear=true; clearColor=doubleArrayOf(0.0,0.0,0.0,0.0) }
            viewer.view.ambientOcclusionOptions=View.AmbientOcclusionOptions().apply { enabled=true }
            val lights=viewer.engine.lightManager; lights.setDirection(lights.getInstance(viewer.light),2.5f,-4f,-6f); lights.setIntensity(lights.getInstance(viewer.light),90_000f)
            ambient=IndirectLight.Builder().reflections(reflections!!).irradiance(1,floatArrayOf(1f,1f,1f)).intensity(30_000f).build(viewer.engine)
            viewer.scene.indirectLight=ambient
            val bytes=context.assets.open("models/member-card.glb").use { it.readBytes() }
            viewer.loadModelGlb(ByteBuffer.allocateDirect(bytes.size).apply { put(bytes); rewind() })
            val asset=viewer.asset ?: error("Member card model missing")
            asset.entities.forEach { entity -> asset.getName(entity)?.let { entities[it]=entity } }
            require(entities.containsKey("MemberCardBody") && entities.containsKey("MemberBandJoint71"))
            configure(); schedule()
        } catch(error: Exception) {
            initializingEngine?.let { engine -> reflections?.let { engine.destroyTexture(it) }; reflections=null; engine.destroy() }
            initializingEngine=null; fail(error)
        }
    }
    private fun configure() {
        if(width<=0 || height<=0) return
        val viewer=model ?: return
        val ratio=width.toDouble()/height
        viewHeight=max(2.25/.69,(1.6/.72)/ratio); cameraZ=viewHeight/2/tan(Math.toRadians(12.0))
        viewer.camera.setProjection(24.0,ratio,.1,200.0,Camera.Fov.VERTICAL)
        viewer.camera.lookAt(0.0,0.0,cameraZ,0.0,0.0,0.0,0.0,1.0,0.0)
        motion.configure(viewHeight,!reducedMotion)
        val scale=(1.75f/resources.displayMetrics.density).coerceAtMost(1f)
        val w=(width*scale).roundToInt().coerceAtLeast(1); val h=(height*scale).roundToInt().coerceAtLeast(1)
        if(helper.desiredWidth!=w || helper.desiredHeight!=h) helper.setDesiredSize(w,h)
        viewportWidth=width; viewportHeight=height
    }
    override fun onSizeChanged(w: Int,h: Int,oldw: Int,oldh: Int) { super.onSizeChanged(w,h,oldw,oldh); if(!disposed) configure() }
    fun updateProfile(value: Profile) {
        if(value==profile) return
        profile=value; contentDescription="BorrowBuddy ID card for ${profile.full_name}. Drag to swing; tap to flip."
        if(initialized) uploadArtwork()
    }
    private fun material(name: String): MaterialInstance {
        val viewer=model!!; val instance=viewer.engine.renderableManager.getInstance(entities.getValue(name))
        return viewer.engine.renderableManager.getMaterialInstanceAt(instance,0)
    }
    private fun uploadArtwork() {
        val generation=++imageGeneration; val current=profile; pending++
        worker.execute {
            val images=runCatching {
                val art=MemberCardArtwork(context,current); val strap=art.strapBitmap()
                val rotated=Bitmap.createBitmap(160,1024,Bitmap.Config.ARGB_8888)
                Canvas(rotated).apply { translate(0f,1024f); scale(1f,-1f); translate(160f,0f); rotate(90f); drawBitmap(strap,0f,0f,null) }; strap.recycle()
                listOf(art.faceBitmap(false),art.faceBitmap(true),rotated)
            }
            handler.post {
                pending--
                val viewer=model
                if(disposed || viewer==null || generation!=imageGeneration) { images.getOrNull()?.forEach { it.recycle() }; return@post }
                try {
                    val bitmaps=images.getOrThrow(); val replacements=mutableListOf<Texture>()
                    try {
                        listOf("MemberCardFront","MemberCardBack","MemberBand").zip(bitmaps).forEach { (name,bitmap) ->
                            val texture=Texture.Builder().width(bitmap.width).height(bitmap.height).levels(255)
                                .usage(Texture.Usage.DEFAULT or Texture.Usage.GEN_MIPMAPPABLE).sampler(Texture.Sampler.SAMPLER_2D).format(Texture.InternalFormat.SRGB8_A8).build(viewer.engine)
                            replacements.add(texture)
                            TextureHelper.setBitmap(viewer.engine,texture,0,bitmap,handler) { bitmap.recycle() }
                            texture.generateMipmaps(viewer.engine)
                            val sampler=TextureSampler(TextureSampler.MinFilter.LINEAR_MIPMAP_LINEAR,TextureSampler.MagFilter.LINEAR,TextureSampler.WrapMode.CLAMP_TO_EDGE)
                            if(name=="MemberBand") sampler.setWrapModeT(TextureSampler.WrapMode.REPEAT)
                            sampler.setAnisotropy(4f); material(name).setParameter("baseColorMap",texture,sampler)
                        }
                        textures.forEach { viewer.engine.destroyTexture(it) }; textures.clear(); textures.addAll(replacements)
                        uploadedGeneration=generation
                    } catch(error: Exception) { replacements.forEach { viewer.engine.destroyTexture(it) }; bitmaps.filterNot { it.isRecycled }.forEach { it.recycle() }; throw error }
                    schedule()
                } catch(error: Exception) { fail(error) }
            }
        }
    }
    private fun pose(name: String, p: LanyardVector, q: LanyardQuaternion) {
        val x=q.x; val y=q.y; val z=q.z; val w=q.w
        matrix[0]=(1-2*(y*y+z*z)).toFloat(); matrix[1]=(2*(x*y+z*w)).toFloat(); matrix[2]=(2*(x*z-y*w)).toFloat(); matrix[3]=0f
        matrix[4]=(2*(x*y-z*w)).toFloat(); matrix[5]=(1-2*(x*x+z*z)).toFloat(); matrix[6]=(2*(y*z+x*w)).toFloat(); matrix[7]=0f
        matrix[8]=(2*(x*z+y*w)).toFloat(); matrix[9]=(2*(y*z-x*w)).toFloat(); matrix[10]=(1-2*(x*x+y*y)).toFloat(); matrix[11]=0f
        matrix[12]=p.x.toFloat(); matrix[13]=p.y.toFloat(); matrix[14]=p.z.toFloat(); matrix[15]=1f
        transform(name)
    }
    private fun basis(name: String,p: LanyardVector,right: LanyardVector,up: LanyardVector,front: LanyardVector) {
        matrix[0]=right.x.toFloat(); matrix[1]=right.y.toFloat(); matrix[2]=right.z.toFloat(); matrix[3]=0f
        matrix[4]=up.x.toFloat(); matrix[5]=up.y.toFloat(); matrix[6]=up.z.toFloat(); matrix[7]=0f
        matrix[8]=front.x.toFloat(); matrix[9]=front.y.toFloat(); matrix[10]=front.z.toFloat(); matrix[11]=0f
        matrix[12]=p.x.toFloat(); matrix[13]=p.y.toFloat(); matrix[14]=p.z.toFloat(); matrix[15]=1f; transform(name)
    }
    private fun transform(name: String) { model!!.engine.transformManager.let { it.setTransform(it.getInstance(entities.getValue(name)),matrix) } }
    private fun point(t: Double,out: LanyardVector) {
        val scaled=t*(controls.size-1); val i=min(floor(scaled).toInt(),controls.size-2); val u=scaled-i
        val p1=controls[i]; val p2=controls[i+1]
        val p0=if(i==0) ghostStart.copy(p1).scale(2.0).sub(p2) else controls[i-1]
        val p3=if(i+2>=controls.size) ghostEnd.copy(p2).scale(2.0).sub(p1) else controls[i+2]
        fun distance(a: LanyardVector,b: LanyardVector)=sqrt(sqrt((a.x-b.x).pow(2)+(a.y-b.y).pow(2)+(a.z-b.z).pow(2)))
        val dt1=distance(p1,p2).let { if(it<1e-4) 1.0 else it }
        val dt0=distance(p0,p1).let { if(it<1e-4) dt1 else it }; val dt2=distance(p2,p3).let { if(it<1e-4) dt1 else it }
        fun component(a: Double,b: Double,c: Double,d: Double): Double {
            val t1=((b-a)/dt0-(c-a)/(dt0+dt1)+(c-b)/dt1)*dt1
            val t2=((c-b)/dt1-(d-b)/(dt1+dt2)+(d-c)/dt2)*dt1
            return b+t1*u+(-3*b+3*c-2*t1-t2)*u*u+(2*b-2*c+t1+t2)*u*u*u
        }
        out.set(component(p0.x,p1.x,p2.x,p3.x),component(p0.y,p1.y,p2.y,p3.y),component(p0.z,p1.z,p2.z,p3.z))
    }
    private fun updateBand() {
        val hang=motion.nodes[4]; var guide=3
        fun distance(a: LanyardVector,b: LanyardVector)=sqrt((a.x-b.x).pow(2)+(a.y-b.y).pow(2)+(a.z-b.z).pow(2))
        while(guide>0 && distance(motion.nodes[guide],hang)<.236*1.1) guide--
        axis.copy(motion.nodes[guide]).sub(hang)
        if(axis.lengthSq()<1e-8) axis.set(0.0,1.0,0.0).rotate(motion.quaternion)
        axis.normalize(); mouth.copy(hang).scaled(axis,.236); tuck.copy(hang).scaled(axis,.0885)
        controls.clear(); for(i in 0..guide) controls.add(motion.nodes[i]); controls.add(mouth); controls.add(tuck)
        arc[0]=0.0; point(0.0,curve[0])
        for(i in 1..200) { point(i/200.0,curve[i]); arc[i]=arc[i-1]+distance(curve[i],curve[i-1]) }
        for(i in 0..71) {
            val target=arc[200]*i/71; var index=arc.binarySearch(target)
            if(index<0) index=(-index-2).coerceIn(0,199)
            val fraction=if(index>=200 || arc[index+1]==arc[index]) 0.0 else (target-arc[index])/(arc[index+1]-arc[index])
            point((index+fraction)/200,samples[i])
        }
        val held=1-distance(mouth,tuck)/arc[200].coerceAtLeast(.001)
        val widthScale=1/max(1.0,arc[200]/(motion.rest*4)).pow(.35)
        for(i in 0..71) {
            tangent.copy(samples[min(71,i+1)]).sub(samples[max(0,i-1)]).normalize()
            cameraVector.set(0.0,0.0,cameraZ).sub(samples[i]).normalize(); across.cross(cameraVector,tangent).normalize()
            facing.cross(tangent,across).normalize()
            val angle=-motion.twistAngle*min(1.0,i/71.0/held.coerceAtLeast(.001)).pow(1.3)
            across.scale(cos(angle)).scaled(facing,sin(angle)); facing.cross(tangent,across).normalize()
            axis.copy(tangent).scale(-1.0); ribbonRight.copy(across).scale(widthScale)
            basis(jointNames[i],samples[i],ribbonRight,axis,facing)
        }
        axis.copy(mouth).sub(hang).normalize(); across.scaled(axis,-across.dot(axis)).normalize(); facing.cross(across,axis).normalize()
        basis("MemberClasp",hang,across,axis,facing)
        val repeat=(motion.rest*4/(.234*6.4)/3).toFloat()
        if(repeat!=uvRepeat) {
            uvRepeat=repeat; uvMatrix[4]=repeat
            material("MemberBand").setParameter("baseColorUvMatrix",MaterialInstance.FloatElement.MAT3,uvMatrix,0,1)
        }
        model?.animator?.updateBoneMatrices()
    }
    private fun visible()=getGlobalVisibleRect(visibleRect) && visibleRect.height()>height*.05f
    private fun stop() { choreographer.removeFrameCallback(this); handler.removeCallbacks(probe); lastFrame=0 }
    private fun schedule() {
        if(!attached || disposed || !resumed || model==null) return
        choreographer.removeFrameCallback(this); handler.removeCallbacks(probe)
        if(visible()) choreographer.postFrameCallback(this) else handler.postDelayed(probe,300)
    }
    override fun doFrame(frameTimeNanos: Long) {
        if(!attached || disposed || !resumed) return
        if(!visible()) { lastFrame=0; handler.postDelayed(probe,300); return }
        val viewer=model ?: return
        try {
            if(width!=viewportWidth || height!=viewportHeight) configure()
            if(!initialized) {
                viewer.render(frameTimeNanos)
                if(viewer.progress<1f) { choreographer.postFrameCallback(this); return }
                initialized=true; uploadArtwork()
            }
            val dt=if(lastFrame==0L) 1.0/60 else (frameTimeNanos-lastFrame)/1_000_000_000.0; lastFrame=frameTimeNanos
            motion.frame(dt,reducedMotion); pose("MemberCardBody",motion.position,motion.quaternion); updateBand()
            if(viewer.render(frameTimeNanos)) {
                renderedFrames++
                if(!ready && uploadedGeneration>0 && pending==0 && renderedFrames>3) { ready=true; onReady() }
            }
            if(!reducedMotion || motion.grabbed || motion.calm<1.2 || !ready) choreographer.postFrameCallback(this)
            else lastFrame=0 // Waking a sleeping card must not integrate its idle time.
        } catch(error: Exception) { fail(error) }
    }
    private fun fail(error: Exception) {
        stop(); if(`in`.borrowbuddy.android.BuildConfig.DEBUG) android.util.Log.e("MemberLanyard","Native member card unavailable",error)
        onFailure()
    }
    private fun cast(x: Float,y: Float): LanyardVector {
        val worldX=(x/width*2-1)*viewHeight*width/height/2; val worldY=(1-y/height*2)*viewHeight/2
        return ray.set(worldX,worldY,-cameraZ).normalize()
    }
    fun setBack(value: Boolean) { if(motion.back!=value) { motion.flip(); onFlip(motion.back); schedule() } }
    override fun performClick(): Boolean { super.performClick(); motion.flip(); onFlip(motion.back); schedule(); return true }
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if(!ready || disposed) return false
        when(event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                cast(event.x,event.y); normal.set(0.0,0.0,1.0).rotate(motion.quaternion)
                val denominator=normal.dot(ray); if(abs(denominator)<1e-8) return false
                grabReach=(motion.position.x*normal.x+motion.position.y*normal.y+(motion.position.z-cameraZ)*normal.z)/denominator
                if(grabReach<=0) return false
                hit.set(0.0,0.0,cameraZ).scaled(ray,grabReach)
                normal.copy(hit).sub(motion.position).rotate(inverse.copy(motion.quaternion).invert())
                if(abs(normal.x)>.8 || abs(normal.y)>1.125) return false
                downX=event.x; downY=event.y; downTime=event.eventTime; dragged=false
                motion.beginGrab(hit.x,hit.y,hit.z); parent.requestDisallowInterceptTouchEvent(true); schedule(); return true
            }
            MotionEvent.ACTION_MOVE -> {
                if(!motion.grabbed) return false
                if(hypot(event.x-downX,event.y-downY)>ViewConfiguration.get(context).scaledTouchSlop) dragged=true
                hit.set(0.0,0.0,cameraZ).scaled(cast(event.x,event.y),grabReach); motion.drag(hit.x,hit.y,hit.z); schedule(); return true
            }
            MotionEvent.ACTION_UP,MotionEvent.ACTION_CANCEL,MotionEvent.ACTION_POINTER_DOWN -> {
                if(!motion.grabbed) return false
                motion.release(); parent.requestDisallowInterceptTouchEvent(false)
                if(!dragged && event.actionMasked==MotionEvent.ACTION_UP && event.eventTime-downTime<450) performClick()
                schedule(); return true
            }
        }
        return false
    }
    override fun onDetachedFromWindow() {
        attached=false; stop(); motion.release()
        if(!disposed) {
            disposed=true; worker.shutdownNow()
            model?.let { viewer ->
                viewer.engine.flushAndWait(); textures.forEach { viewer.engine.destroyTexture(it) }; textures.clear()
                ambient?.let { viewer.scene.indirectLight=null; viewer.engine.destroyIndirectLight(it) }
                reflections?.let { viewer.engine.destroyTexture(it) }
            }
        }
        super.onDetachedFromWindow()
    }
}
