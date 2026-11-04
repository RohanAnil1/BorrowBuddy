package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Website Campus controls: original amber/black primary and paper secondary labels. */
@Composable internal fun CampusButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, secondary: Boolean = false, shape: Shape = RoundedCornerShape(8.dp)) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val target = modifier.heightIn(min = 48.dp).drawWithContent {
        drawContent()
        if (focused) {
            val offset = 4.dp.toPx()
            drawRoundRect(Cargo.Accent, Offset(-offset, -offset), Size(size.width + offset * 2, size.height + offset * 2),
                CornerRadius(12.dp.toPx()), style = Stroke(2.dp.toPx()))
        }
    }
    val padding = PaddingValues(horizontal = 20.dp, vertical = 14.dp)
    @Composable fun Label() {
        Text(text.uppercase(), style = MaterialTheme.typography.labelLarge.copy(lineHeight = 16.5.sp), textAlign = TextAlign.Center)
    }
    if (secondary) OutlinedButton(onClick, target, enabled, shape = shape, border = BorderStroke(1.dp, Cargo.Line),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Cargo.Ink.copy(alpha = .8f)),
        contentPadding = padding, interactionSource = interaction) { Label() }
    else Button(onClick, target, enabled, shape = shape,
        colors = ButtonDefaults.buttonColors(containerColor = Cargo.Accent, contentColor = Cargo.Panel),
        contentPadding = padding, interactionSource = interaction) { Label() }
}
