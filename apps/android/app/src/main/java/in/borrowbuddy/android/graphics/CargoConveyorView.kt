package `in`.borrowbuddy.android.graphics

import android.content.Context
import android.graphics.Rect
import android.graphics.BitmapFactory
import android.opengl.Matrix
import android.os.Handler
import android.os.Looper
import android.view.Choreographer
import android.view.Surface
import android.view.TextureView
import com.google.android.filament.Camera
import com.google.android.filament.Colors
import com.google.android.filament.IndirectLight
import com.google.android.filament.MaterialInstance
import com.google.android.filament.Renderer
import com.google.android.filament.Texture
import com.google.android.filament.TextureSampler
import com.google.android.filament.android.TextureHelper
import com.google.android.filament.View
import com.google.android.filament.android.UiHelper
import com.google.android.filament.utils.ModelViewer
import com.google.android.filament.utils.Utils
import org.json.JSONArray
import java.nio.ByteBuffer
import kotlin.math.max
import kotlin.math.tan

/** Filament renders the exported website geometry; the lending timeline is native Kotlin. */
class CargoConveyorView(context: Context, private val span: Float, private val playback: ConveyorPlayback, private val onReady: () -> Unit,
    private val onFailure: () -> Unit) : TextureView(context), Choreographer.FrameCallback {
    private val choreographer = Choreographer.getInstance()
    private val handler = Handler(Looper.getMainLooper())
    private val motion = playback.motion
    private val visibleRect = Rect()
    private val matrix = FloatArray(16)
    private val entities = mutableMapOf<String, Int>()
    private val hidden = mutableSetOf<String>()
    private val originalTransforms = mutableMapOf<String, FloatArray>()
    private val materialCache = mutableMapOf<String, MaterialInstance>()
    private val originalColors = mutableMapOf<String, FloatArray>()
    private val stations = playback.stations
    private val beltUv = FloatArray(9).apply { this[0] = (span + 12f) / .6f; this[4] = 1f; this[8] = 1f }
    private var scanWash = 0f
    private val textureWorker = java.util.concurrent.Executors.newSingleThreadExecutor()
    private val requestedTextures = mutableMapOf<String, String>()
    private val ownedTextures = mutableMapOf<String, Texture>()
    private val sampler = TextureSampler(TextureSampler.MinFilter.LINEAR_MIPMAP_LINEAR, TextureSampler.MagFilter.LINEAR,
        TextureSampler.WrapMode.CLAMP_TO_EDGE).apply { setAnisotropy(4f) }
    private var pendingTextures = 0
    private var model: ModelViewer? = null
    private var ambient: IndirectLight? = null
    private val helper = UiHelper(UiHelper.ContextErrorPolicy.DONT_CHECK).apply { isOpaque = false }
    private var attached = false
    private var disposed = false
    private var ready = false
    private var materialsReady = false
    private var lastFrame = 0L
    private var lastState = ""
    private val probe = Runnable { schedule() }
    var renderedFrames = 0L
        private set
    var beltTextureOffset = 0f
        private set
    val playbackTimeMs get() = motion.elapsedMs
    val gateCounts get() = playback.counts
    var pose = ConveyorMotion.at(0.0)
        private set
    var resumed = true
        set(value) { field = value; lastFrame = 0; if (value) schedule() else stop() }
    var reducedMotion = false
        set(value) { if (field != value) { field = value; lastFrame = 0; lastState = ""; schedule() } }

    init { isOpaque = false; contentDescription = "Borrow queue: requested, accepted, handed over, returned." }
    override fun onAttachedToWindow() {
        super.onAttachedToWindow(); attached = true
        if (disposed) return
        if (model == null) try {
            Utils.init()
            val viewer = ModelViewer(this, engine = com.google.android.filament.Engine.create(com.google.android.filament.Engine.Backend.OPENGL), uiHelper = helper, manipulator = null)
            model = viewer
            val callbacks = helper.renderCallback!!
            helper.renderCallback = object : UiHelper.RendererCallback {
                override fun onNativeWindowChanged(surface: Surface) = callbacks.onNativeWindowChanged(surface)
                override fun onDetachedFromSurface() = callbacks.onDetachedFromSurface()
                override fun onResized(w: Int, h: Int) {
                    val bw = helper.desiredWidth.takeIf { it > 0 } ?: w
                    val bh = helper.desiredHeight.takeIf { it > 0 } ?: h
                    callbacks.onResized(bw, bh)
                    if (bw > 0 && bh > 0) camera(bw, bh)
                }
            }
            viewer.view.blendMode = View.BlendMode.TRANSLUCENT
            viewer.renderer.clearOptions = Renderer.ClearOptions().apply { clear = true; clearColor = doubleArrayOf(0.0, 0.0, 0.0, 0.0) }
            viewer.view.ambientOcclusionOptions = View.AmbientOcclusionOptions().apply { enabled = true }
            viewer.engine.lightManager.apply {
                val light = getInstance(viewer.light)
                setColor(light, 1f, .7f, .3f); setDirection(light, -.6f, -.7f, -.6f); setIntensity(light, 60_000f)
            }
            ambient = IndirectLight.Builder().irradiance(1, floatArrayOf(1f, .78f, .5f)).intensity(25_000f).build(viewer.engine)
            viewer.scene.indirectLight = ambient
            val stem = "models/conveyor/line-${span.toInt()}"
            val nodes = JSONArray(context.assets.open("$stem-nodes.json").bufferedReader().use { it.readText() })
            for (i in 0 until nodes.length()) {
                val node = nodes.getJSONObject(i)
                if (node.optJSONObject("extras")?.optBoolean("initiallyHidden") == true) hidden.add(node.getString("name"))
                node.optJSONObject("extras")?.optJSONArray("baseColor")?.let { rgba -> originalColors[node.getString("name")] = FloatArray(4) { rgba.getDouble(it).toFloat() } }
            }
            val bytes = context.assets.open("$stem.glb").use { it.readBytes() }
            viewer.loadModelGlb(ByteBuffer.allocateDirect(bytes.size).apply { put(bytes); rewind() })
            val asset = viewer.asset ?: error("Conveyor asset could not be loaded.")
            asset.entities.forEach { entity -> asset.getName(entity)?.let { name ->
                entities[name] = entity
                val instance = viewer.engine.transformManager.getInstance(entity)
                if (instance != 0) originalTransforms[name] = viewer.engine.transformManager.getTransform(instance, null)
            } }
            require(entities.containsKey("ParcelRoot") && entities.containsKey("ParcelFlip"))
            repeat(4) { index -> for (kind in listOf("sign", "plate")) requestedTextures["Station$index-$kind-idle"] = "$kind-${ConveyorMotion.gates[index].code}-idle" }
            requestedTextures["Parcel-front-sony-0"] = "front-sony-0"
            requestedTextures["Parcel-back-sony"] = "back-sony"
            hidden.forEach { show(it, false) }
            resize()
        } catch (failure: Exception) {
            if (`in`.borrowbuddy.android.BuildConfig.DEBUG) android.util.Log.e("CargoConveyor", "Renderer initialization failed", failure)
            onFailure(); return
        }
        schedule()
    }
    private fun camera(w: Int, h: Int) {
        val viewer = model ?: return
        val aspect = w.toDouble() / h
        val tangent = tan(Math.toRadians(26.0) / 2)
        val z = max((span + 2.6) / (2 * tangent * aspect), 8.6 / (2 * tangent)).coerceIn(13.0, 44.0)
        viewer.camera.setProjection(26.0, aspect, .1, 100.0, Camera.Fov.VERTICAL)
        viewer.camera.lookAt(0.0, 3.1, z, 0.0, 2.6, 0.0, 0.0, 1.0, 0.0)
    }
    private fun resize() {
        if (width <= 0 || height <= 0) return
        val scale = (1.75f / resources.displayMetrics.density).coerceAtMost(1f)
        helper.setDesiredSize((width * scale).toInt(), (height * scale).toInt())
        camera(helper.desiredWidth, helper.desiredHeight)
    }
    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) { super.onSizeChanged(w, h, oldw, oldh); if (!disposed) resize() }
    private fun show(name: String, visible: Boolean) {
        val viewer = model ?: return
        val entity = entities[name] ?: return
        val instance = viewer.engine.renderableManager.getInstance(entity)
        if (instance != 0) viewer.engine.renderableManager.setLayerMask(instance, 0xff, if (visible) 1 else 0)
    }
    private fun transform(name: String, update: (FloatArray) -> Unit) {
        val viewer = model ?: return
        val entity = entities[name] ?: return
        val original = originalTransforms[name] ?: return
        original.copyInto(matrix); update(matrix)
        viewer.engine.transformManager.setTransform(viewer.engine.transformManager.getInstance(entity), matrix)
    }
    private fun color(name: String, r: Float, g: Float, b: Float, alpha: Float = 1f) {
        materialCache[name]?.setParameter("baseColorFactor", Colors.RgbaType.LINEAR, r, g, b, alpha)
    }
    private fun alpha(name: String, opacity: Float) { originalColors[name]?.let { color(name, it[0], it[1], it[2], opacity) } }
    private fun image(name: String, path: String, emissive: Boolean = false) {
        if (requestedTextures[name] == path || disposed) return
        requestedTextures[name] = path; pendingTextures++
        textureWorker.execute {
            val bitmap = try {
                context.assets.open("models/conveyor/$path.png").use { BitmapFactory.decodeStream(it) }
            } catch (_: Exception) { null }
            handler.post {
                pendingTextures--
                val viewer = model
                if (disposed || viewer == null || requestedTextures[name] != path || bitmap == null) {
                    bitmap?.recycle(); return@post
                }
                val entity = entities[name] ?: run { bitmap.recycle(); return@post }
                val instance = viewer.engine.renderableManager.getInstance(entity)
                if (instance == 0) { bitmap.recycle(); return@post }
                var texture: Texture? = null
                var submitted = false
                try {
                    val replacement = Texture.Builder().width(bitmap.width).height(bitmap.height).levels(255)
                        .usage(Texture.Usage.SAMPLEABLE or Texture.Usage.GEN_MIPMAPPABLE or Texture.Usage.UPLOADABLE)
                        .sampler(Texture.Sampler.SAMPLER_2D).format(Texture.InternalFormat.SRGB8_A8).build(viewer.engine)
                    texture = replacement
                    TextureHelper.setBitmap(viewer.engine, replacement, 0, bitmap, handler, Runnable { bitmap.recycle() })
                    submitted = true
                    replacement.generateMipmaps(viewer.engine)
                    val material = viewer.engine.renderableManager.getMaterialInstanceAt(instance, 0)
                    material.setParameter("baseColorMap", replacement, sampler)
                    if (emissive) material.setParameter("emissiveMap", replacement, sampler)
                    ownedTextures.put(name, replacement)?.let { viewer.engine.destroyTexture(it) }
                    schedule()
                } catch (failure: Exception) {
                    if (!submitted) bitmap.recycle()
                    texture?.let { viewer.engine.destroyTexture(it) }
                    if (`in`.borrowbuddy.android.BuildConfig.DEBUG) android.util.Log.e("CargoConveyor", "Texture replacement failed", failure)
                    onFailure()
                }
            }
        }
    }
    private fun applyPose(p: ConveyorMotion.Pose, delta: Double) {
        transform("ParcelRoot") { Matrix.setIdentityM(it, 0); Matrix.translateM(it, 0, p.x, p.y, 0f); Matrix.rotateM(it, 0, Math.toDegrees(p.rotationZ.toDouble()).toFloat(), 0f, 0f, 1f) }
        transform("ParcelFlip") { Matrix.setIdentityM(it, 0); Matrix.rotateM(it, 0, Math.toDegrees(p.flipY.toDouble()).toFloat(), 0f, 1f, 0f) }
        val state = "${p.phases}-${p.crateIndex}-${p.stamps}"
        if (state != lastState) {
            lastState = state
            p.phases.forEachIndexed { index, phase ->
                for (kind in listOf("sign", "plate")) image("Station$index-$kind-idle", "$kind-${ConveyorMotion.gates[index].code}-${phase.name.lowercase()}")
            }
            val crate = ConveyorMotion.crates[p.crateIndex]
            image("Parcel-front-sony-0", "front-${crate.id}-${p.stamps}", true)
            image("Parcel-back-sony", "back-${crate.id}", true)
        }
        show("ParcelScanLine", p.scanLineY != null)
        p.scanLineY?.let { y -> transform("ParcelScanLine") { it[13] = y } }
        show("TrustChip", p.trustAgeSeconds != null)
        p.trustAgeSeconds?.let { age -> transform("TrustChip") { it[12] = p.x; it[13] = ConveyorMotion.rideY + 1.35f + age * .55f } }
        p.trustAgeSeconds?.let { age -> alpha("TrustChip", if (age < .15f) age / .15f else 1 - ((age - .8f) / .6f).coerceIn(0f, 1f)) }
        if (!reducedMotion) scanWash += (p.washTarget - scanWash) * (delta * 8).coerceIn(0.0, 1.0).toFloat()
        alpha("ParcelScanWash", scanWash)
        beltTextureOffset = p.beltOffset
        beltUv[2] = p.beltOffset // gltfio multiplies a row UV vector by its column-major mat3.
        materialCache["BeltSurface"]?.setParameter("baseColorUvMatrix", MaterialInstance.FloatElement.MAT3, beltUv, 0, 1)
        p.phases.forEachIndexed { index, phase ->
            val prefix = "Station$index"
            val f = stations[index].frame(motion.elapsedMs / 1000, delta, phase, reducedMotion)
            repeat(12) { led -> color("$prefix-ledMats-$led", f.ledRgb[led * 3], f.ledRgb[led * 3 + 1], f.ledRgb[led * 3 + 2]) }
            repeat(3) { lamp -> color("$prefix-lampMats-$lamp", f.lampRgb[lamp * 3], f.lampRgb[lamp * 3 + 1], f.lampRgb[lamp * 3 + 2]) }
            color("$prefix-ringMat", (StationMotion.HOT[0] * f.ringBrightness).toFloat(), (StationMotion.HOT[1] * f.ringBrightness).toFloat(), (StationMotion.HOT[2] * f.ringBrightness).toFloat())
            alpha("$prefix-lensMat", f.lensAlpha); alpha("$prefix-haloMat", f.haloAlpha); alpha("$prefix-poolMat", f.poolAlpha)
            repeat(2) { strobe -> alpha("$prefix-strobeMats-$strobe", f.strobeAlpha[strobe]) }
            repeat(8) { strip -> transform("$prefix-curtains-$strip") { Matrix.rotateM(it, 0, Math.toDegrees(f.curtainZ[strip].toDouble()).toFloat(), 0f, 0f, 1f) } }
            repeat(3) { ring ->
                val name = "$prefix-sonars-$ring"
                alpha(name, f.sonarAlpha[ring])
                transform(name) { Matrix.scaleM(it, 0, f.sonarScale[ring], f.sonarScale[ring], f.sonarScale[ring]) }
            }
            transform("$prefix-group") { it[13] = f.recoilY }
            for (name in listOf("beamCore", "beamEdgeL", "beamEdgeR", "beamSpotMat")) show("$prefix-$name", phase == ConveyorMotion.Phase.SCAN)
            alpha("$prefix-beamCore", f.beamAlpha); alpha("$prefix-beamEdgeL", f.beamAlpha * .5f); alpha("$prefix-beamEdgeR", f.beamAlpha * .5f)
            alpha("$prefix-beamSpotMat", f.beamSpotAlpha)
            transform("$prefix-beamSpotMat") { it[13] = f.beamSpotY }
        }
    }
    private fun visible() = isShown && getLocalVisibleRect(visibleRect) && visibleRect.height() >= height * .15f
    private fun initializeMaterials(): Boolean {
        val viewer = model ?: return false
        if (viewer.progress < 1f) return false
        val manager = viewer.engine.renderableManager
        val belt = entities["BeltSurface"] ?: error("Belt node missing")
        if (manager.getInstance(belt) == 0) return false
        entities.forEach { (name, entity) ->
            val instance = manager.getInstance(entity)
            if (instance != 0) materialCache[name] = manager.getMaterialInstanceAt(instance, 0)
        }
        // gltfio returns borrowed MaterialInstance wrappers without a Java Material object.
        // Setting the parameter validates it against the actual native shader.
        materialCache.getValue("BeltSurface").setParameter("baseColorUvMatrix", MaterialInstance.FloatElement.MAT3, beltUv, 0, 1)
        hidden.forEach { show(it, false) }
        materialsReady = true
        return true
    }
    private fun stop() { choreographer.removeFrameCallback(this); handler.removeCallbacks(probe); lastFrame = 0 }
    private fun schedule() {
        if (!attached || disposed || !resumed) return
        choreographer.removeFrameCallback(this); handler.removeCallbacks(probe)
        if (visible()) choreographer.postFrameCallback(this) else handler.postDelayed(probe, 500)
    }
    override fun doFrame(frameTimeNanos: Long) {
        if (!attached || disposed || !resumed) return
        if (!visible()) { lastFrame = 0; handler.postDelayed(probe, 500); return }
        val viewer = model ?: return
        if (!materialsReady) {
            viewer.render(frameTimeNanos) // Advances asynchronous gltfio resource creation.
            try {
                if (!initializeMaterials()) { choreographer.postFrameCallback(this); return }
            } catch (failure: Exception) {
                if (`in`.borrowbuddy.android.BuildConfig.DEBUG) android.util.Log.e("CargoConveyor", "Material setup failed", failure)
                onFailure(); return
            }
            lastFrame = frameTimeNanos
            choreographer.postFrameCallback(this)
            return
        }
        val dt = if (lastFrame == 0L) 0.0 else (frameTimeNanos - lastFrame) / 1_000_000_000.0
        lastFrame = frameTimeNanos
        pose = motion.advance(dt, true, reducedMotion, span); playback.record(pose); applyPose(pose, dt.coerceIn(0.0, .05))
        if (viewer.render(frameTimeNanos)) {
            renderedFrames++
            if (!ready && viewer.progress >= 1f && renderedFrames >= 5 && pendingTextures == 0) { ready = true; onReady() }
        }
        if (!reducedMotion || !ready) choreographer.postFrameCallback(this) else handler.postDelayed(probe, 500)
    }
    override fun onDetachedFromWindow() {
        attached = false; stop()
        if (!disposed) {
            disposed = true
            textureWorker.shutdownNow()
            model?.let { viewer ->
                ownedTextures.values.forEach { viewer.engine.destroyTexture(it) }; ownedTextures.clear()
                ambient?.let { viewer.scene.indirectLight = null; viewer.engine.destroyIndirectLight(it) }
            }
        }
        // ModelViewer's listener releases its own engine/model/surface once.
        super.onDetachedFromWindow()
    }
}
