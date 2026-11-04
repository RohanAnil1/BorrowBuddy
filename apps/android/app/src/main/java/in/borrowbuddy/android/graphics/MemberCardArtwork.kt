package `in`.borrowbuddy.android.graphics

import android.content.Context
import android.graphics.*
import androidx.core.content.res.ResourcesCompat
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.domain.Profile
import java.time.Instant
import java.time.ZoneOffset
import java.util.Locale
import kotlin.math.roundToInt

internal fun memberCode(id: String) = "BB-" + id.filter { it.isLetterOrDigit() }.take(8).uppercase(Locale.ROOT)

/** Same 1024 × 1440 artwork coordinates and original fonts as member-card-art.ts. */
internal class MemberCardArtwork(context: Context, val profile: Profile) {
    private val title = ResourcesCompat.getFont(context, R.font.noto_condensed)!!
    private val mono = ResourcesCompat.getFont(context, R.font.noto_mono)!!
    private val body = ResourcesCompat.getFont(context, R.font.gotham_medium)!!
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val ink = Color.rgb(244,241,232); private val accent = Color.rgb(255,159,0)
    private val muted = Color.rgb(156,166,181); private val blue = Color.rgb(0,57,147)
    private fun text(canvas: Canvas, value: String, x: Float, y: Float, size: Float, font: Typeface = mono, color: Int = ink) {
        paint.color=color; paint.typeface=font; paint.textSize=size; canvas.drawText(value,x,y,paint)
    }
    private fun rect(canvas: Canvas, x: Float,y: Float,w: Float,h: Float,color: Int) { paint.color=color; canvas.drawRect(x,y,x+w,y+h,paint) }
    private fun lines(canvas: Canvas, value: String, x: Float,y: Float,width: Float,size: Float,font: Typeface,lineHeight: Float,maxLines: Int,color: Int = ink) {
        paint.textSize=size; paint.typeface=font
        val rows=mutableListOf<String>(); var line=""
        for(word in value.trim().uppercase(Locale.ROOT).split(Regex("\\s+"))) {
            val next=if(line.isEmpty()) word else "$line $word"
            if(paint.measureText(next)>width && line.isNotEmpty()) { rows.add(line); line=word } else line=next
        }
        if(line.isNotEmpty()) rows.add(line)
        rows.take(maxLines).forEachIndexed { index,row ->
            var fitted=row; val clipped=index==maxLines-1 && rows.size>maxLines
            while(fitted.isNotEmpty() && paint.measureText(fitted+(if(clipped || fitted!=row) "…" else ""))>width) fitted=fitted.dropLast(1)
            text(canvas,fitted+(if(clipped || fitted!=row) "…" else ""),x,y+index*lineHeight,size,font,color)
        }
    }
    fun paintFace(canvas: Canvas, back: Boolean) {
        rect(canvas,0f,0f,1024f,1440f,Color.rgb(8,11,16)); rect(canvas,0f,0f,16f,1440f,accent); rect(canvas,16f,0f,1008f,250f,blue)
        text(canvas,"BORROWBUDDY",72f,193f,82f,title)
        BorrowBuddyBrand.draw(canvas,paint,816f,72f,128f,ink,accent)
        val role=if(profile.is_admin) "ADMIN" else "STUDENT"; val code=memberCode(profile.id)
        if(back) {
            text(canvas,"[ $role MEMBERSHIP ]",72f,310f,29f,mono,accent)
            lines(canvas,"GOOD THINGS GO AROUND.",72f,450f,880f,100f,title,108f,2)
            text(canvas,"TRUST SCORE",72f,714f,27f,mono,muted); text(canvas,profile.trust_score.roundToInt().toString(),72f,819f,100f,title,accent)
            text(canvas,"MEMBER SINCE",480f,714f,27f,mono,muted)
            val year=runCatching { Instant.parse(profile.created_at).atZone(ZoneOffset.UTC).year.toString() }.getOrDefault("—")
            text(canvas,year,480f,819f,100f,title)
            lines(canvas,"Handovers happen at campus pickup spots. Agree on one in chat before you meet.",72f,950f,880f,36f,body,52f,4,muted)
            text(canvas,"BORROWBUDDY MEMBERSHIP",72f,1240f,27f,mono,accent); text(canvas,code,72f,1300f,34f)
            text(canvas,"BENNETT UNIVERSITY · CAMPUS LENDING",72f,1362f,23f,mono,muted)
        } else {
            text(canvas,"[ CAMPUS LENDING CREW ]",72f,302f,28f,mono,accent)
            rect(canvas,72f,350f,220f,220f,blue)
            val name=profile.full_name.ifBlank { "BorrowBuddy member" }
            text(canvas,name.trim().take(1).uppercase(Locale.ROOT),125f,513f,150f,title)
            text(canvas,"MEMBER",336f,423f,26f,mono,muted); text(canvas,code,336f,478f,34f); text(canvas,role,336f,536f,28f,mono,accent)
            lines(canvas,name,72f,704f,880f,100f,title,108f,2)
            lines(canvas,profile.department ?: "Bennett University",72f,922f,880f,32f,body,42f,2,muted)
            profile.year_of_study?.let { if(it!=0) text(canvas,"YEAR $it",72f,1030f,29f,mono,muted) }
            rect(canvas,72f,1089f,880f,2f,Color.rgb(49,59,75))
            text(canvas,if(profile.verification_status=="verified") "[ ID VERIFIED ]" else "[ ${profile.verification_status.uppercase(Locale.ROOT)} ]",72f,1164f,30f,mono,accent)
            var x=72f
            for(character in code) for(bit in 0..3) { val width=3f+((character.code shr bit) and 1)*5; rect(canvas,x,1220f,width,76f,ink); x+=width+5 }
            text(canvas,"CAMPUS USE · LEND / BORROW / RETURN",72f,1362f,23f,mono,muted)
        }
    }
    fun faceBitmap(back: Boolean) = Bitmap.createBitmap(1024,1440,Bitmap.Config.ARGB_8888).also {
        val canvas=Canvas(it); canvas.translate(0f,1440f); canvas.scale(1f,-1f); paintFace(canvas,back)
    }
    fun strapBitmap() = Bitmap.createBitmap(1024,160,Bitmap.Config.ARGB_8888).also {
        val canvas=Canvas(it); rect(canvas,0f,0f,1024f,160f,accent); rect(canvas,0f,12f,1024f,5f,Color.rgb(8,11,16)); rect(canvas,0f,143f,1024f,5f,Color.rgb(8,11,16))
        text(canvas,"BORROWBUDDY  /  CAMPUS CREW  /",28f,102f,44f,mono,Color.rgb(8,11,16))
        BorrowBuddyBrand.draw(canvas,paint,868f,32f,96f,Color.rgb(8,11,16),Color.rgb(8,11,16))
    }
}
