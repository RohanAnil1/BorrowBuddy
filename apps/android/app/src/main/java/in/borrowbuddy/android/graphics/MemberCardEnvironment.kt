package `in`.borrowbuddy.android.graphics

import com.google.android.filament.Engine
import com.google.android.filament.Texture
import com.google.android.filament.utils.IBLPrefilterContext
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.*

/** The eight studio panels from React Bits buildEnvironment, sampled into HDR
 * cube faces and filtered by Filament for physically based metal reflections. */
internal fun memberCardEnvironment(engine: Engine): Texture {
    data class Panel(val intensity: Double,val position: LanyardVector,val width: Double,val height: Double,val angle: Double=0.0) {
        val normal=LanyardVector().copy(position).scale(-1.0).normalize()
        private val right=LanyardVector().cross(LanyardVector(0.0,1.0,0.0),normal).normalize()
        private val up=LanyardVector().cross(normal,right).normalize()
        val x=LanyardVector().copy(right).scale(cos(angle)).scaled(up,sin(angle))
        val y=LanyardVector().copy(up).scale(cos(angle)).scaled(right,-sin(angle))
    }
    val panels=listOf(
        Panel(2.6,LanyardVector(0.0,4.5,8.0),9.0,4.0),Panel(6.0,LanyardVector(-5.5,.5,7.0),.9,14.0),
        Panel(4.0,LanyardVector(5.0,-.5,8.0),.6,14.0),Panel(3.5,LanyardVector(0.0,-1.0,9.0),24.0,.35,PI/3),
        Panel(2.5,LanyardVector(1.0,2.5,9.0),24.0,.2,PI/3),Panel(1.4,LanyardVector(0.0,6.0,-6.0),12.0,4.0),
        Panel(.5,LanyardVector(0.0,-7.0,1.0),16.0,6.0),Panel(.9,LanyardVector(8.0,0.0,-2.0),4.0,10.0))
    val size=64; val pixels=ByteBuffer.allocateDirect(6*size*size*16).order(ByteOrder.nativeOrder()).asFloatBuffer()
    val ray=LanyardVector(); val relative=LanyardVector()
    for(face in 0..5) for(row in 0 until size) for(column in 0 until size) {
        val u=2.0*(column+.5)/size-1; val v=2.0*(row+.5)/size-1
        when(face) { 0->ray.set(1.0,-v,-u); 1->ray.set(-1.0,-v,u); 2->ray.set(u,1.0,v)
            3->ray.set(u,-1.0,-v); 4->ray.set(u,-v,1.0); else->ray.set(-u,-v,-1.0) }
        ray.normalize(); var nearest=Double.POSITIVE_INFINITY; var value=.035
        for(panel in panels) {
            val denominator=panel.normal.dot(ray); if(abs(denominator)<1e-9) continue
            val distance=panel.normal.dot(panel.position)/denominator
            if(distance<=0 || distance>=nearest) continue
            relative.copy(ray).scale(distance).sub(panel.position)
            if(abs(relative.dot(panel.x))<=panel.width/2 && abs(relative.dot(panel.y))<=panel.height/2) { nearest=distance; value=panel.intensity }
        }
        pixels.put(value.toFloat()).put(value.toFloat()).put(if(nearest.isFinite()) value.toFloat() else .04f).put(1f)
    }
    pixels.flip()
    val source=Texture.Builder().width(size).height(size).levels(255).sampler(Texture.Sampler.SAMPLER_CUBEMAP)
        .format(Texture.InternalFormat.RGBA16F).usage(Texture.Usage.DEFAULT or Texture.Usage.GEN_MIPMAPPABLE).build(engine)
    val filterContext=IBLPrefilterContext(engine); val filter=IBLPrefilterContext.SpecularFilter(filterContext)
    try {
        source.setImage(engine,0,0,0,0,size,size,6,Texture.PixelBufferDescriptor(pixels,Texture.Format.RGBA,Texture.Type.FLOAT))
        source.generateMipmaps(engine)
        return filter.run(source)
    } finally { filter.destroy(); filterContext.destroy(); engine.destroyTexture(source) }
}
