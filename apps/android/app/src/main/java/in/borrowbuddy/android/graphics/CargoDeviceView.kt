package `in`.borrowbuddy.android.graphics

import android.content.Context
import android.graphics.Rect
import android.opengl.Matrix
import android.os.Handler
import android.os.Looper
import android.view.Choreographer
import android.view.MotionEvent
import android.view.Surface
import android.view.TextureView
import android.view.ViewConfiguration
import com.google.android.filament.Camera
import com.google.android.filament.Colors
import com.google.android.filament.EntityManager
import com.google.android.filament.Engine
import com.google.android.filament.IndirectLight
import com.google.android.filament.LightManager
import com.google.android.filament.Renderer
import com.google.android.filament.View
import com.google.android.filament.android.UiHelper
import com.google.android.filament.utils.ModelViewer
import com.google.android.filament.utils.Utils
import java.nio.ByteBuffer
import kotlin.math.abs

/** Transparent native Filament surface. No HTML, JavaScript or WebView runs in the app. */
class CargoDeviceView(context: Context, private val onReady: () -> Unit, private val onFailure: () -> Unit) : TextureView(context), Choreographer.FrameCallback {
    private val motion = DeviceMotion()
    private val choreographer = Choreographer.getInstance()
    private val handler = Handler(Looper.getMainLooper())
    private val visibleRect = Rect()
    private val transform = FloatArray(16)
    private val extraLights = mutableListOf<Int>()
    private var viewer: ModelViewer? = null
    private val surfaceHelper = UiHelper(UiHelper.ContextErrorPolicy.DONT_CHECK).apply { isOpaque = false }
    private var ambient: IndirectLight? = null
    private var attached = false
    private var disposed = false
    private var ready = false
    private var settledLogged = false
    var renderedFrames = 0L
        private set
    var bootSettled = false
        private set
    private var lastFrame = 0L
    private var viewportWidth = 0
    private var viewportHeight = 0
    private var root = 0
    private var screenEntity = 0
    private var ledEntity = 0
    private var downX = 0f
    private var downY = 0f
    private var previousX = 0f
    private var previousY = 0f
    private var horizontalDrag = false
    var resumed = true
        set(value) { field = value; if (value) schedule() else stop() }
    var reducedMotion = false
        set(value) { if (field != value) { field = value; lastFrame = 0; schedule() } }
    private val visibilityProbe = Runnable { schedule() }

    init {
        isOpaque = false
        contentDescription = "BorrowBuddy cargo device. Drag horizontally to inspect its metal body."
    }
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        attached = true
        if (disposed) return
        if (viewer == null) {
            try {
                Utils.init()
                val model = ModelViewer(this, engine = Engine.create(Engine.Backend.OPENGL), uiHelper = surfaceHelper, manipulator = null)
                viewer = model
                val callbacks = surfaceHelper.renderCallback!!
                surfaceHelper.renderCallback = object : UiHelper.RendererCallback {
                    override fun onNativeWindowChanged(surface: Surface) { callbacks.onNativeWindowChanged(surface) }
                    override fun onDetachedFromSurface() { callbacks.onDetachedFromSurface() }
                    override fun onResized(w: Int, h: Int) {
                        val bufferWidth = surfaceHelper.desiredWidth.takeIf { it > 0 } ?: w
                        val bufferHeight = surfaceHelper.desiredHeight.takeIf { it > 0 } ?: h
                        callbacks.onResized(bufferWidth, bufferHeight)
                        if (bufferWidth > 0 && bufferHeight > 0) model.camera.setProjection(30.0, bufferWidth.toDouble() / bufferHeight, .1, 100.0, Camera.Fov.VERTICAL)
                    }
                }
                model.view.blendMode = View.BlendMode.TRANSLUCENT
                model.renderer.clearOptions = Renderer.ClearOptions().apply { clear = true; clearColor = doubleArrayOf(0.0, 0.0, 0.0, 0.0) }
                model.view.ambientOcclusionOptions = View.AmbientOcclusionOptions().apply { enabled = true }
                model.camera.lookAt(0.0, .1, 7.4, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0)
                val lights = model.engine.lightManager
                lights.setDirection(lights.getInstance(model.light), 0f, -.5f, -1f)
                lights.setIntensity(lights.getInstance(model.light), 100_000f)
                ambient = IndirectLight.Builder().irradiance(1, floatArrayOf(.7f, .8f, 1f)).intensity(35_000f).build(model.engine)
                model.scene.indirectLight = ambient
                studioLight(.55f, .69f, 1f, 50_000f, 1f, -.1f, -1f)
                studioLight(1f, .35f, .01f, 30_000f, -1f, -.2f, -1f)
                val bytes = context.assets.open("models/cargo-device.glb").use { it.readBytes() }
                model.loadModelGlb(ByteBuffer.allocateDirect(bytes.size).apply { put(bytes); rewind() })
                val asset = model.asset ?: error("The cargo device model could not be loaded.")
                root = asset.entities.firstOrNull { asset.getName(it) == "CargoDeviceRoot" } ?: error("Device root missing.")
                screenEntity = asset.entities.firstOrNull { asset.getName(it) == "CargoScreen" } ?: 0
                ledEntity = asset.entities.firstOrNull { asset.getName(it) == "StatusLed" } ?: 0
                val scale = (1.75f / resources.displayMetrics.density).coerceAtMost(1f)
                if (width > 0 && height > 0) surfaceHelper.setDesiredSize((width * scale).toInt(), (height * scale).toInt())
            } catch (_: Exception) {
                onFailure()
                return
            }
        }
        schedule()
    }
    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w > 0 && h > 0 && !disposed) {
            // Match the website's 1.75 DPR cap instead of allocating full-density render targets.
            val scale = (1.75f / resources.displayMetrics.density).coerceAtMost(1f)
            surfaceHelper.setDesiredSize((w * scale).toInt().coerceAtLeast(1), (h * scale).toInt().coerceAtLeast(1))
        }
    }
    private fun studioLight(r: Float, g: Float, b: Float, intensity: Float, dx: Float, dy: Float, dz: Float) {
        val model = viewer ?: return
        val entity = EntityManager.get().create()
        LightManager.Builder(LightManager.Type.DIRECTIONAL).color(r, g, b).intensity(intensity)
            .direction(dx, dy, dz).castShadows(false).build(model.engine, entity)
        model.scene.addEntity(entity); extraLights.add(entity)
    }
    private fun schedule() {
        if (!attached || disposed || !resumed || viewer == null) return
        handler.removeCallbacks(visibilityProbe)
        choreographer.removeFrameCallback(this)
        choreographer.postFrameCallback(this)
    }
    private fun stop() {
        choreographer.removeFrameCallback(this)
        handler.removeCallbacks(visibilityProbe)
        lastFrame = 0L
    }
    override fun doFrame(frameTimeNanos: Long) {
        if (!attached || disposed || !resumed) return
        val model = viewer ?: return
        if (!getGlobalVisibleRect(visibleRect) || visibleRect.height() < height * .05f) {
            lastFrame = 0L
            handler.postDelayed(visibilityProbe, 150)
            return
        }
        val dt = if (lastFrame == 0L) 1f / 60 else (frameTimeNanos - lastFrame) / 1_000_000_000f
        lastFrame = frameTimeNanos
        if (width > 0 && height > 0 && (viewportWidth != width || viewportHeight != height)) {
            viewportWidth = width; viewportHeight = height
            model.camera.setProjection(30.0, width.toDouble() / height, .1, 100.0, Camera.Fov.VERTICAL)
        }
        val pose = motion.frame(dt, reducedMotion)
        bootSettled = pose.x == 0f
        if (!settledLogged && pose.x == 0f && `in`.borrowbuddy.android.BuildConfig.DEBUG) {
            settledLogged = true
            android.util.Log.d("CargoDevice", "boot settled at scale=${pose.scale} rotation=${pose.rx},${pose.ry}")
        }
        Matrix.setIdentityM(transform, 0)
        Matrix.translateM(transform, 0, pose.x, pose.y, 0f)
        Matrix.rotateM(transform, 0, Math.toDegrees(pose.ry.toDouble()).toFloat(), 0f, 1f, 0f)
        Matrix.rotateM(transform, 0, Math.toDegrees(pose.rx.toDouble()).toFloat(), 1f, 0f, 0f)
        Matrix.scaleM(transform, 0, pose.scale, pose.scale, pose.scale)
        model.engine.transformManager.setTransform(model.engine.transformManager.getInstance(root), transform)
        if (screenEntity != 0) {
            val material = model.engine.renderableManager.getMaterialInstanceAt(model.engine.renderableManager.getInstance(screenEntity), 0)
            material.setParameter("emissiveFactor", Colors.RgbType.LINEAR, pose.glow, pose.glow, pose.glow)
        }
        if (ledEntity != 0) {
            val material = model.engine.renderableManager.getMaterialInstanceAt(model.engine.renderableManager.getInstance(ledEntity), 0)
            material.setParameter("baseColorFactor", Colors.RgbaType.LINEAR, 1f * pose.led, .35f * pose.led, .01f * pose.led, 1f)
        }
        val rendered = model.render(frameTimeNanos)
        if (rendered) renderedFrames++
        if (rendered && model.progress >= 1f && !ready) {
            ready = true
            if (`in`.borrowbuddy.android.BuildConfig.DEBUG) android.util.Log.d("CargoDevice", "camera=${model.camera.getPosition(null).contentToString()} viewport=${model.view.viewport.width}x${model.view.viewport.height} screenWorld=${model.engine.transformManager.getWorldTransform(model.engine.transformManager.getInstance(screenEntity), null).contentToString()} projection=${model.camera.getProjectionMatrix(null).contentToString()}")
            onReady()
        }
        if (!reducedMotion || !ready) choreographer.postFrameCallback(this)
        else handler.postDelayed(visibilityProbe, 500)
    }
    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (disposed || reducedMotion) return false
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.x; previousX = event.x; downY = event.y; previousY = event.y
                horizontalDrag = false; return true
            }
            MotionEvent.ACTION_MOVE -> {
                val slop = ViewConfiguration.get(context).scaledTouchSlop
                if (!horizontalDrag && abs(event.x - downX) > slop && abs(event.x - downX) >= abs(event.y - downY)) {
                    horizontalDrag = true; motion.beginDrag(); parent.requestDisallowInterceptTouchEvent(true)
                }
                if (horizontalDrag) motion.drag((event.x - previousX) / resources.displayMetrics.density, (event.y - previousY) / resources.displayMetrics.density)
                previousX = event.x; previousY = event.y
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                motion.endDrag(); parent.requestDisallowInterceptTouchEvent(false)
                if (!horizontalDrag && event.actionMasked == MotionEvent.ACTION_UP) performClick()
                horizontalDrag = false; return true
            }
        }
        return super.onTouchEvent(event)
    }
    override fun performClick(): Boolean { super.performClick(); return true }
    override fun onDetachedFromWindow() {
        if (`in`.borrowbuddy.android.BuildConfig.DEBUG) android.util.Log.d("CargoDevice", "surface detached; releasing native resources")
        attached = false; stop()
        if (!disposed) {
            viewer?.let { model ->
                extraLights.forEach { model.scene.removeEntities(intArrayOf(it)); model.engine.destroyEntity(it); EntityManager.get().destroy(it) }
                ambient?.let { model.scene.indirectLight = null; model.engine.destroyIndirectLight(it) }
            }
            disposed = true
        }
        // ModelViewer's own detach listener destroys its model, engine and GPU resources exactly once.
        super.onDetachedFromWindow()
    }
}
