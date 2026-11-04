package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.*
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.*
import coil3.compose.AsyncImage
import `in`.borrowbuddy.android.R

/** Root layout's fixed photo, screen-blended batik and bottom vignette. */
val PortalBackdropReady = SemanticsPropertyKey<Boolean>("PortalBackdropReady")
@Composable fun PortalBackdrop() {
    var photo by remember { mutableStateOf(false) }
    var pattern by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxSize().semantics { this[PortalBackdropReady] = photo && pattern }) {
    AsyncImage(R.drawable.backdrop, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, onSuccess = { photo = true })
    AsyncImage(R.drawable.batik, null, Modifier.fillMaxSize().graphicsLayer {
        alpha = .5f; blendMode = BlendMode.Screen; compositingStrategy = CompositingStrategy.Offscreen
    }, contentScale = ContentScale.Crop, alignment = Alignment.TopEnd, onSuccess = { pattern = true })
    Canvas(Modifier.fillMaxSize()) {
        drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color(0xff020a28).copy(alpha = .5f)),
            startY = size.height * .62f, endY = size.height), Offset(0f, size.height * .62f), Size(size.width, size.height * .38f))
    }
    }
}
