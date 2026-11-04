package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.borrowbuddy.android.R

object Cargo {
    val Canvas = Color(0xff003993)
    val Deep = Color(0xff021249)
    val Panel = Color.Black
    val Line = Color(0xff1e1e1e)
    val Ink = Color.White
    val Accent = Color(0xffcb840e)
    val Warn = Color(0xffff9f00)
    val Paper = Color(0xfff0f0f0)
    val Ok = Color(0xff47d18a)
    val Body = FontFamily(Font(R.font.gotham_medium))
    val Strong = FontFamily(Font(R.font.gotham_bold))
    val Title = FontFamily(Font(R.font.noto_condensed))
    val Mono = FontFamily(Font(R.font.noto_mono))
    val Ticket = FontFamily(Font(R.font.thermo))
}

@Composable
fun CargoTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(primary = Cargo.Accent, onPrimary = Cargo.Ink,
            secondary = Cargo.Warn, background = Cargo.Canvas, onBackground = Cargo.Ink,
            surface = Cargo.Panel, onSurface = Cargo.Ink, outline = Cargo.Line,
            error = Cargo.Warn, onError = Cargo.Panel),
        typography = Typography(
            displayLarge = TextStyle(fontFamily = Cargo.Title, fontSize = 48.sp, lineHeight = 50.sp),
            headlineLarge = TextStyle(fontFamily = Cargo.Title, fontSize = 32.sp, lineHeight = 34.sp),
            headlineMedium = TextStyle(fontFamily = Cargo.Title, fontSize = 28.sp),
            titleMedium = TextStyle(fontFamily = Cargo.Strong, fontSize = 16.sp),
            bodyLarge = TextStyle(fontFamily = Cargo.Body, fontSize = 14.sp, lineHeight = 24.sp),
            bodyMedium = TextStyle(fontFamily = Cargo.Body, fontSize = 13.sp, lineHeight = 22.sp),
            labelLarge = TextStyle(fontFamily = Cargo.Mono, fontSize = 11.sp, letterSpacing = 0.8.sp),
            labelSmall = TextStyle(fontFamily = Cargo.Mono, fontSize = 9.sp, letterSpacing = 0.6.sp),
        ), content = content,
    )
}

@Composable fun CargoTitle(text: String, modifier: Modifier = Modifier) {
    Text(text.uppercase(), modifier.semantics { heading() }, style = MaterialTheme.typography.headlineLarge)
}
@Composable fun CargoLabel(text: String, color: Color = Cargo.Accent, modifier: Modifier = Modifier) {
    Text(text.uppercase(), modifier, color = color, style = MaterialTheme.typography.labelSmall)
}
@Composable fun CargoBody(text: String, modifier: Modifier = Modifier, color: Color = Cargo.Ink.copy(alpha = .6f)) {
    Text(text.uppercase(), modifier, color = color, style = MaterialTheme.typography.bodyMedium)
}
@Composable fun CargoPanel(modifier: Modifier = Modifier, padding: androidx.compose.ui.unit.Dp = 20.dp, spacing: androidx.compose.ui.unit.Dp = 12.dp, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().background(Cargo.Panel).border(1.dp, Cargo.Line)
        .padding(padding), verticalArrangement = Arrangement.spacedBy(spacing), content = content)
}
@Composable fun TicketTopBar() {
    Box(Modifier.fillMaxWidth().height(16.dp).border(2.dp, Cargo.Accent, RoundedCornerShape(2.dp)).padding(4.dp),
        contentAlignment = androidx.compose.ui.Alignment.Center) {
        Box(Modifier.fillMaxWidth().height(4.dp).background(Cargo.Accent, RoundedCornerShape(2.dp)))
    }
}
@Composable fun CargoButton(text: String, onClick: () -> Unit, enabled: Boolean = true, secondary: Boolean = false, modifier: Modifier = Modifier) {
    if (secondary) OutlinedButton(onClick, modifier.heightIn(min = 48.dp), enabled = enabled,
        shape = RoundedCornerShape(8.dp), border = androidx.compose.foundation.BorderStroke(1.dp, Cargo.Line)) {
        Text(text.uppercase(), style = MaterialTheme.typography.labelLarge)
    } else Button(onClick, modifier.heightIn(min = 48.dp), enabled = enabled, shape = RoundedCornerShape(8.dp)) {
        Text(text.uppercase(), style = MaterialTheme.typography.labelLarge)
    }
}
@Composable fun CargoField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier, lines: Int = 1, keyboard: androidx.compose.foundation.text.KeyboardOptions = androidx.compose.foundation.text.KeyboardOptions.Default, transform: androidx.compose.ui.text.input.VisualTransformation = androidx.compose.ui.text.input.VisualTransformation.None, trailing: @Composable (() -> Unit)? = null, keyboardActions: androidx.compose.foundation.text.KeyboardActions = androidx.compose.foundation.text.KeyboardActions.Default, singleLine: Boolean = lines == 1, maxLines: Int = Int.MAX_VALUE) {
    OutlinedTextField(value, onChange, modifier.fillMaxWidth(), label = { CargoLabel(label, Cargo.Ink.copy(alpha = .6f)) },
        singleLine = singleLine, minLines = lines, maxLines = maxLines, shape = RoundedCornerShape(8.dp), keyboardOptions = keyboard, keyboardActions = keyboardActions,
        visualTransformation = transform, trailingIcon = trailing, textStyle = TextStyle(fontFamily = Cargo.Body, fontSize = 14.sp),
        colors = OutlinedTextFieldDefaults.colors(focusedContainerColor = Cargo.Panel, unfocusedContainerColor = Cargo.Panel,
            focusedBorderColor = Cargo.Accent, unfocusedBorderColor = Cargo.Line))
}
@Composable fun StatusBadge(status: String) {
    val color = when (status) {
        "overdue", "lost", "rejected", "suspended", "disputed" -> Cargo.Warn
        "returned", "verified", "approved", "settled", "resolved" -> Cargo.Accent
        else -> Cargo.Ink.copy(alpha = .6f)
    }
    Text(status.replace('_', ' ').uppercase(), Modifier.border(1.dp, color.copy(alpha = .6f))
        .background(color.copy(alpha = .08f)).padding(horizontal = 10.dp, vertical = 6.dp),
        color = color, style = MaterialTheme.typography.labelSmall)
}
