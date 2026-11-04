"""Export approved canonical geometry into web icons and native vector resources."""
from pathlib import Path
import shutil
import io
import struct
from PIL import Image
from build_kit import BRAND, PROJECT, KIT, PALETTE

RES = PROJECT/'apps/android/app/src/main/res'
GRAPHICS = PROJECT/'apps/android/app/src/main/java/in/borrowbuddy/android/graphics'
WEB = PROJECT/'apps/web'
DIGITAL = KIT/'digital'


def write(relative, content):
    path=RES/relative
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(content,encoding='utf-8')


def export():
    paths=BRAND['paths']
    kotlin='''package `in`.borrowbuddy.android.graphics

import android.graphics.Canvas
import android.graphics.Paint
import androidx.core.graphics.PathParser
import androidx.core.graphics.withTranslation

/** Generated from packages/shared/src/brand.ts; run export_project_brand.py. */
internal object BorrowBuddyBrand {
    const val LEFT_PATH = "%s"
    const val RIGHT_PATH = "%s"
    private val left = requireNotNull(PathParser.createPathFromPathData(LEFT_PATH))
    private val right = requireNotNull(PathParser.createPathFromPathData(RIGHT_PATH))
    fun draw(canvas: Canvas, paint: Paint, x: Float, y: Float, size: Float, leftColor: Int, rightColor: Int) {
        canvas.withTranslation(x, y) {
            scale(size / 256f, size / 256f)
            paint.style = Paint.Style.FILL
            paint.color = leftColor; drawPath(left, paint)
            paint.color = rightColor; drawPath(right, paint)
        }
    }
}
''' % (paths['left'],paths['right'])
    (GRAPHICS/'BorrowBuddyBrand.kt').write_text(kotlin,encoding='utf-8')
    vector_start='<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="256" android:viewportHeight="256">'
    group='<group android:pivotX="128" android:pivotY="128" android:scaleX="0.6" android:scaleY="0.6">'
    colored=''.join(f'<path android:fillColor="{color}" android:pathData="{path}"/>' for color,path in [(PALETTE['paper'],paths['left']),(PALETTE['amber'],paths['right'])])
    mono=''.join(f'<path android:fillColor="#ffffff" android:pathData="{path}"/>' for path in paths.values())
    write('drawable/borrowbuddy_launcher_foreground.xml',vector_start+group+colored+'</group></vector>\n')
    write('drawable/borrowbuddy_launcher_monochrome.xml',vector_start+group+mono+'</group></vector>\n')
    write('values/brand.xml',f'<resources><color name="borrowbuddy_launcher_background">{PALETTE["navy"]}</color></resources>\n')
    # minSdk is 31: every supported device uses an adaptive icon. Android 13+
    # reads monochrome; earlier versions ignore that optional layer.
    icon='<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/borrowbuddy_launcher_background"/><foreground android:drawable="@drawable/borrowbuddy_launcher_foreground"/><monochrome android:drawable="@drawable/borrowbuddy_launcher_monochrome"/></adaptive-icon>\n'
    for name in ['ic_launcher','ic_launcher_round']:
        write(f'mipmap-anydpi/{name}.xml',icon)
        for version in [26,33]:
            (RES/f'mipmap-anydpi-v{version}/{name}.xml').unlink(missing_ok=True)
        (RES/f'mipmap-nodpi/{name}.png').unlink(missing_ok=True)
    for folder in ['mipmap-anydpi-v26','mipmap-anydpi-v33','mipmap-nodpi']:
        path=RES/folder
        if path.is_dir() and not any(path.iterdir()):
            path.rmdir()
    # Next's ICO decoder requires embedded PNGs to be RGBA, even when the SVG
    # tile is fully opaque. Chrome may otherwise optimize the PNGs to RGB.
    chunks=[]; entries=[]; offset=6+16*3
    for size in [16,32,48]:
        with Image.open(DIGITAL/f'favicon-{size}.png') as source:
            rgba=source.convert('RGBA')
            stream=io.BytesIO(); rgba.save(stream,format='PNG')
            png=stream.getvalue()
            assert png[25]==6, 'ICO PNG must use RGBA'
        entries.append(struct.pack('<BBBBHHII',size,size,0,0,1,32,len(png),offset))
        chunks.append(png); offset+=len(png)
    (DIGITAL/'favicon.ico').write_bytes(struct.pack('<HHH',0,1,3)+b''.join(entries)+b''.join(chunks))
    # These are rendered from SVG masters; original manifest routes/options stay intact.
    for name in ['icon-192.png','icon-512.png','maskable-512.png','apple-touch-icon.png','favicon.svg']:
        shutil.copyfile(DIGITAL/name, WEB/'public/icons'/name)
    shutil.copyfile(DIGITAL/'favicon.ico',WEB/'src/app/favicon.ico')
    (RES/'drawable-nodpi/app_icon.png').unlink(missing_ok=True)
    print('Exported shared mark: web icons, native paths, adaptive/round/themed launcher icons.')


if __name__=='__main__':
    export()
