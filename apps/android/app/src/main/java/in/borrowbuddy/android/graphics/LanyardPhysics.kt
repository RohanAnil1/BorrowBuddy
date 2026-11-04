package `in`.borrowbuddy.android.graphics

import kotlin.math.*

/** Native port of the supplied React Bits rigid card / four-node strap solver. */
internal class LanyardVector(var x: Double = 0.0, var y: Double = 0.0, var z: Double = 0.0) {
    fun set(a: Double, b: Double, c: Double) = apply { x = a; y = b; z = c }
    fun copy(v: LanyardVector) = set(v.x, v.y, v.z)
    fun add(v: LanyardVector) = apply { x += v.x; y += v.y; z += v.z }
    fun sub(v: LanyardVector) = apply { x -= v.x; y -= v.y; z -= v.z }
    fun scaled(v: LanyardVector, scale: Double) = apply { x += v.x * scale; y += v.y * scale; z += v.z * scale }
    fun scale(value: Double) = apply { x *= value; y *= value; z *= value }
    fun dot(v: LanyardVector) = x * v.x + y * v.y + z * v.z
    fun lengthSq() = dot(this)
    fun length() = sqrt(lengthSq())
    fun normalize() = scale(1 / length().coerceAtLeast(1e-12))
    fun cross(a: LanyardVector, b: LanyardVector): LanyardVector {
        val nx = a.y * b.z - a.z * b.y; val ny = a.z * b.x - a.x * b.z; val nz = a.x * b.y - a.y * b.x
        return set(nx, ny, nz)
    }
    fun rotate(q: LanyardQuaternion): LanyardVector {
        val tx = 2 * (q.y * z - q.z * y); val ty = 2 * (q.z * x - q.x * z); val tz = 2 * (q.x * y - q.y * x)
        return set(x + q.w * tx + q.y * tz - q.z * ty, y + q.w * ty + q.z * tx - q.x * tz, z + q.w * tz + q.x * ty - q.y * tx)
    }
}
internal class LanyardQuaternion(var x: Double = 0.0, var y: Double = 0.0, var z: Double = 0.0, var w: Double = 1.0) {
    fun set(a: Double, b: Double, c: Double, d: Double) = apply { x = a; y = b; z = c; w = d }
    fun copy(q: LanyardQuaternion) = set(q.x, q.y, q.z, q.w)
    fun invert() = apply { x = -x; y = -y; z = -z }
    fun normalize(): LanyardQuaternion { val n = sqrt(x*x+y*y+z*z+w*w).coerceAtLeast(1e-12); return set(x/n,y/n,z/n,w/n) }
    fun multiply(a: LanyardQuaternion, b: LanyardQuaternion): LanyardQuaternion {
        val nx = a.x*b.w+a.w*b.x+a.y*b.z-a.z*b.y; val ny = a.y*b.w+a.w*b.y+a.z*b.x-a.x*b.z
        val nz = a.z*b.w+a.w*b.z+a.x*b.y-a.y*b.x; val nw = a.w*b.w-a.x*b.x-a.y*b.y-a.z*b.z
        return set(nx,ny,nz,nw)
    }
    fun rotate(v: LanyardVector): LanyardQuaternion {
        val qx=x; val qy=y; val qz=z; val qw=w
        return set(qx+.5*(v.x*qw+v.y*qz-v.z*qy), qy+.5*(v.y*qw+v.z*qx-v.x*qz),
            qz+.5*(v.z*qw+v.x*qy-v.y*qx), qw-.5*(v.x*qx+v.y*qy+v.z*qz)).normalize()
    }
}
internal class LanyardPhysics {
    val nodes = Array(5) { LanyardVector() }
    private val previous = Array(5) { LanyardVector() }
    private val velocities = Array(5) { LanyardVector() }
    private val lengths = DoubleArray(4)
    private val impulses = DoubleArray(4)
    val anchor = LanyardVector()
    val position = LanyardVector()
    val quaternion = LanyardQuaternion()
    private val previousPosition = LanyardVector()
    private val previousQuaternion = LanyardQuaternion()
    private val velocity = LanyardVector()
    private val angular = LanyardVector()
    private val inverseInertia = LanyardVector(12 / (2.25*2.25+.032*.032),12 / (1.6*1.6+.032*.032),12 / (1.6*1.6+2.25*2.25))
    private val a=LanyardVector(); private val b=LanyardVector(); private val c=LanyardVector(); private val d=LanyardVector()
    private val e=LanyardVector(); private val f=LanyardVector(); private val g=LanyardVector(); private val pin=LanyardVector()
    private val q=LanyardQuaternion(); private val r=LanyardQuaternion()
    private val grabLocal=LanyardVector(); private val grabRotation=LanyardQuaternion()
    private val grabFrom=LanyardVector(); private val grabTarget=LanyardVector()
    val hang = LanyardVector(0.0, 1.165, 0.0)
    var rest = .2; private set
    var grabbed = false; private set
    var back = false; private set
    private var turn=0.0; private var twist=0.0; private var twistRaw=0.0
    val twistAngle get()=twist
    var calm = 0.0; private set
    private var time = 0.0
    private var remainder = 0.0
    private var placed = false
    fun configure(viewHeight: Double, intro: Boolean) {
        anchor.set(0.0, viewHeight/2+.2, 0.0)
        rest = (viewHeight * .168 + .16) / 4
        nodes[0].copy(anchor); previous[0].copy(anchor)
        if (!placed) { reset(intro); placed = true }
    }
    private fun reset(intro: Boolean) {
        nodes[0].copy(anchor)
        for(i in 1..4) { nodes[i].copy(nodes[i-1]); if(intro) nodes[i].x+=rest else nodes[i].y-=rest }
        quaternion.set(0.0,0.0,if(intro) sin(PI/4) else 0.0,if(intro) cos(PI/4) else 1.0)
        a.copy(hang).rotate(quaternion); position.copy(nodes[4]).sub(a)
        previousPosition.copy(position); previousQuaternion.copy(quaternion); velocity.set(0.0,0.0,0.0); angular.set(0.0,0.0,0.0)
        for(i in 0..4) { previous[i].copy(nodes[i]); velocities[i].set(0.0,0.0,0.0) }
        lengths.fill(rest); turn=0.0; twist=0.0; twistRaw=0.0; calm=0.0; remainder=0.0
    }
    private fun inverse(vector: LanyardVector, out: LanyardVector): LanyardVector {
        r.copy(quaternion).invert(); out.copy(vector).rotate(r)
        out.set(out.x*inverseInertia.x,out.y*inverseInertia.y,out.z*inverseInertia.z)
        return out.rotate(quaternion)
    }
    private fun bodyWeight(offset: LanyardVector, normal: LanyardVector): Double {
        c.cross(offset,normal); return 1+c.dot(inverse(c,d))
    }
    private fun pushBody(offset: LanyardVector, impulse: LanyardVector) {
        position.add(impulse); quaternion.rotate(inverse(e.cross(offset,impulse),f))
    }
    private fun solveSegment(i: Int, h: Double) {
        val first=nodes[i]; val wa=if(i==0) 0.0 else 20.0; val last=i==3
        val second=if(last) { g.copy(hang).rotate(quaternion); b.copy(position).add(g) } else nodes[i+1]
        val normal=a.copy(second).sub(first); val length=normal.length(); val stretch=length-rest
        if(stretch<=0 || length<1e-9) return
        normal.scale(1/length); val wb=if(last) bodyWeight(g,normal) else 20.0
        val rate=(length-lengths[i])/h
        val tension=154*tanh(1600*stretch/154)+40*stretch+30.4*max(0.0,rate)
        val room=tension*h*h-impulses[i]; if(room<=0) return
        val lambda=min(stretch/(wa+wb),room); impulses[i]+=lambda
        if(wa!=0.0) first.scaled(normal,lambda*wa)
        if(last) pushBody(g,normal.scale(-lambda)) else second.scaled(normal,-lambda*wb)
    }
    fun beginGrab(worldX: Double, worldY: Double, worldZ: Double) {
        grabLocal.set(worldX,worldY,worldZ).sub(position).rotate(r.copy(quaternion).invert())
        grabRotation.copy(quaternion); grabFrom.set(worldX,worldY,worldZ); grabTarget.copy(grabFrom); grabbed=true; calm=0.0
    }
    fun drag(x: Double,y: Double,z: Double) { grabTarget.set(x,y,z); calm=0.0 }
    fun release() { grabbed=false }
    fun flip() {
        val direction=if(turn>0) -1.0 else 1.0
        turn=if(turn==0.0) PI*direction else 0.0; back=turn!=0.0
        angular.scaled(a.set(0.0,1.0,0.0).rotate(quaternion),9*direction); calm=0.0
    }
    fun frame(delta: Double, reducedMotion: Boolean) {
        if(!placed) return
        // Catch up bounded missed frames without changing the ~960 Hz solver.
        // A 1/30 cap slowed real time below 30 FPS and delayed reduced-motion sleep.
        // Lifecycle resume already resets the view's frame clock; cap long stalls.
        remainder+=delta.coerceIn(0.0,.1)
        val steps=floor(remainder*960+1e-9).toInt(); if(steps==0) return
        // Fixed h prevents equilibrium jitter from frame-dependent constraint
        // compliance. Preserve fractional time instead of varying the step size.
        val h=1.0/960; val dt=steps*h
        remainder=(remainder-dt).coerceAtLeast(0.0)
        time+=dt
        val breeze=if(reducedMotion) 0.0 else .18
        val windX=breeze*(sin(time*.53)*.7+sin(time*1.31+1.7)*.3)*3
        val windZ=breeze*sin(time*.37+.6)*2
        val nodeDrag=exp(-2*h); val linearDrag=exp(-(.25*16.0.pow(.65))*h); val angularDrag=exp(-(.5*12.0.pow(.65))*h)
        repeat(steps) { step ->
            for(i in 1..3) { val v=velocities[i]; v.y-=40*h; v.x+=windX*h; v.z+=windZ*h; previous[i].copy(nodes[i]); nodes[i].scaled(v,h) }
            previousPosition.copy(position); previousQuaternion.copy(quaternion)
            if(grabbed) {
                r.copy(quaternion).invert(); q.multiply(grabRotation,r)
                if(q.w<0) q.set(-q.x,-q.y,-q.z,-q.w)
                a.set(q.x,q.y,q.z).scale(80.0).scaled(angular,-6.0)
                angular.scaled(inverse(a,b),h)
            }
            val up=a.set(0.0,1.0,0.0).rotate(quaternion)
            val front=b.set(-up.x*up.z,-up.y*up.z,1-up.z*up.z)
            if(front.lengthSq()>1e-3) {
                val facing=d.set(0.0,0.0,1.0).rotate(quaternion)
                val raw=atan2(e.cross(front,facing).dot(up),front.dot(facing)); var turned=raw-twistRaw
                if(turned>PI) turned-=2*PI else if(turned< -PI) turned+=2*PI
                twist+=turned; twistRaw=raw
            }
            if(!grabbed) { val spin=angular.dot(up); angular.scaled(up,(30*(turn-twist)-3*spin)*h) }
            velocity.y-=40*h; velocity.x+=windX*.35*h; velocity.z+=windZ*.35*h
            position.scaled(velocity,h); quaternion.rotate(f.copy(angular).scale(h))
            impulses.fill(0.0)
            if(grabbed) pin.copy(grabFrom).scaled(a.copy(grabTarget).sub(grabFrom),(step+1.0)/steps)
            repeat(2) {
                for(i in 0..3) solveSegment(i,h)
                if(grabbed) {
                    g.copy(grabLocal).rotate(quaternion); a.copy(pin).sub(position).sub(g)
                    val distance=a.length()
                    if(distance>1e-9) { a.scale(1/distance); val lambda=distance/bodyWeight(g,a); pushBody(g,a.scale(lambda)) }
                }
            }
            for(i in 1..3) { val v=velocities[i].copy(nodes[i]).sub(previous[i]).scale(nodeDrag/h); v.scale(1/(1+.2*v.length()*h)) }
            velocity.copy(position).sub(previousPosition).scale(1/h)
            r.copy(previousQuaternion).invert(); q.multiply(quaternion,r)
            angular.set(q.x,q.y,q.z).scale(2/h*(if(q.w<0) -1 else 1))
            val normal=a.set(0.0,0.0,1.0).rotate(quaternion); val across=velocity.dot(normal)
            val along=b.copy(velocity).scaled(normal,-across); along.scale(1/(1+.15*along.length()*h))
            velocity.copy(along).scaled(normal,across/(1+.5*abs(across)*h)).scale(linearDrag)
            angular.scale(angularDrag/(1+.03*angular.length()*h))
            if(velocity.lengthSq()>3600) velocity.normalize().scale(60.0)
            if(angular.lengthSq()>1600) angular.normalize().scale(40.0)
            nodes[4].copy(hang).rotate(quaternion).add(position)
            for(i in 0..3) lengths[i]=a.copy(nodes[i]).sub(nodes[i+1]).length()
        }
        if(grabbed) grabFrom.copy(grabTarget)
        var energy=velocity.lengthSq()+angular.lengthSq()*.3
        for(i in 1..3) energy+=velocities[i].lengthSq()*.05
        calm=if(energy<2e-4) calm+dt else 0.0
        if(!position.x.isFinite() || !position.y.isFinite() || !quaternion.w.isFinite()) { grabbed=false; reset(false) }
    }
}
