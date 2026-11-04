package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.imageResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import `in`.borrowbuddy.android.R
import kotlin.math.max
import kotlin.math.roundToInt

/** Fixed photographic plate, screen-blended batik and bottom vignette from layout.tsx. */
@Composable fun LandingBackdrop() {
    Image(painterResource(R.drawable.backdrop), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
    val pattern = ImageBitmap.imageResource(R.drawable.batik)
    Canvas(Modifier.fillMaxSize()) {
        val cover = max(size.width / pattern.width, size.height / pattern.height)
        val width = (pattern.width * cover).roundToInt(); val height = (pattern.height * cover).roundToInt()
        drawImage(pattern, dstOffset = IntOffset((size.width - width).roundToInt(), 0), dstSize = IntSize(width, height), alpha = .5f, blendMode = BlendMode.Screen, filterQuality = FilterQuality.Low)
        drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color(0xff020a28).copy(alpha = .5f)), startY = size.height * .62f, endY = size.height), Offset(0f, size.height * .62f), Size(size.width, size.height * .38f))
    }
}
