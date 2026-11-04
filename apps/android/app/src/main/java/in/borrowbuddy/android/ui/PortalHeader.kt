package `in`.borrowbuddy.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.constrainWidth
import androidx.compose.ui.unit.constrainHeight
import `in`.borrowbuddy.android.R
import `in`.borrowbuddy.android.domain.Profile

/** Source header geometry/branding, with 48dp notification/account touch targets. */
@Composable fun PortalHeader(profile: Profile, route: String, notifications: Int, pending: Int,
    section: (String) -> Unit, open: (String) -> Unit) {
    val density = LocalDensity.current
    val wide = LocalWindowInfo.current.containerSize.width / density.density / density.fontScale.coerceAtLeast(1f) >= 800f
    Box(Modifier.fillMaxWidth().background(Cargo.Panel).drawBehind {
        drawLine(Cargo.Line, Offset(0f, size.height - .5.dp.toPx()), Offset(size.width, size.height - .5.dp.toPx()), 1.dp.toPx())
    }.testTag("portal-header"), contentAlignment = Alignment.TopCenter) {
        Column(Modifier.widthIn(max = 1152.dp).fillMaxWidth().padding(horizontal = if (wide) 40.dp else 16.dp).padding(top = 12.dp, bottom = 6.dp)) {
            if (wide) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                PortalBrand { section("home") }
                Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { PortalNavigation(route, pending, Modifier, true, section) }
                PortalControls(profile, notifications, open)
            } else {
                FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    PortalBrand { section("home") }; PortalControls(profile, notifications, open)
                }
                PortalNavigation(route, pending, Modifier.fillMaxWidth().offset(x = (-4).dp), false, section)
            }
        }
    }
}

@Composable private fun PortalBrand(click: () -> Unit) {
    Row(Modifier.heightIn(min = 48.dp).semantics { contentDescription = "BorrowBuddy — home" }
        .headerAction(click), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        CargoMark(Modifier.size(32.dp))
        Text("BORROWBUDDY", style = TextStyle(fontFamily = Cargo.Mono, fontSize = 12.sp, lineHeight = 18.sp, letterSpacing = .96.sp), color = Cargo.Ink)
    }
}

@Composable private fun PortalNavigation(route: String, pending: Int, modifier: Modifier, wide: Boolean, section: (String) -> Unit) {
    FlowRow(modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        listOf("dashboard" to "Dashboard", "home" to "Browse", "chat" to "Chat", "map" to "Map", "campus" to "Campus", "my/items" to "My items").forEach { (path, label) ->
            val interaction = remember { MutableInteractionSource() }
            val hovered by interaction.collectIsHoveredAsState()
            val focused by interaction.collectIsFocusedAsState()
            val active = route == path || path == "campus" && route.startsWith("campus/")
            Row(Modifier.testTag("nav-$path").heightIn(min = 48.dp).semantics {
                if (path == "my/items" && pending > 0) contentDescription = "My items, $pending pending requests"
            }.border(2.dp, if (focused) Cargo.Accent else Color.Transparent, RoundedCornerShape(8.dp))
                .background(if (hovered) Cargo.Ink.copy(alpha = .05f) else Color.Transparent, RoundedCornerShape(8.dp))
                .selectable(active, interactionSource = interaction, indication = null, role = Role.Tab) { section(path) }
                .padding(horizontal = if (wide) 16.dp else 12.dp, vertical = if (wide) 8.dp else 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(label.uppercase(), style = TextStyle(fontFamily = Cargo.Body, fontSize = 13.sp, lineHeight = 19.5.sp), color = Cargo.Ink.copy(alpha = if (hovered || focused) 1f else .6f))
                if (path == "my/items" && pending > 0) Text(pending.toString(), Modifier.testTag("pending-requests-badge")
                    .background(Cargo.Accent).padding(horizontal = 6.dp, vertical = 2.dp),
                    color = Cargo.Panel, style = TextStyle(fontFamily = Cargo.Mono, fontSize = 9.sp, lineHeight = 13.5.sp, letterSpacing = .72.sp))
            }
        }
    }
}

@Composable private fun PortalControls(profile: Profile, notifications: Int, open: (String) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (profile.is_admin) Text("[ ADMIN ]", Modifier.heightIn(min = 48.dp).headerAction { open("admin") }.wrapContentHeight().padding(horizontal = 4.dp),
            style = TextStyle(fontFamily = Cargo.Mono, fontSize = 10.sp), color = Cargo.Ink.copy(alpha = .5f))
        Box(Modifier.height(48.dp).widthIn(min = 48.dp).testTag("notifications-control").semantics {
            contentDescription = if (notifications > 0) "Notifications ($notifications unread)" else "Notifications"
        }.headerAction { open("notifications") }, contentAlignment = Alignment.Center) {
            Layout(content = {
                Box(Modifier.size(36.dp).border(1.dp, Cargo.Line, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
                    Icon(painterResource(R.drawable.ic_bell), null, Modifier.size(16.dp).testTag("notification-symbol"), tint = Cargo.Ink.copy(alpha = .6f))
                }
                if (notifications > 0) Box(Modifier.defaultMinSize(minWidth = 16.dp, minHeight = 16.dp)
                    .testTag("notification-badge-container").background(Cargo.Accent).padding(2.dp), contentAlignment = Alignment.Center) {
                    Text(if (notifications > 9) "9+" else notifications.toString(), Modifier.testTag("notifications-badge"), color = Cargo.Panel, maxLines = 1,
                        style = TextStyle(fontFamily = Cargo.Mono, fontSize = 8.sp, lineHeight = 12.sp, letterSpacing = .64.sp))
                }
            }) { children, constraints ->
                val icon = children.first().measure(Constraints.fixed(36.dp.roundToPx(), 36.dp.roundToPx()))
                val badge = children.getOrNull(1)?.measure(constraints.copy(minWidth = 0, minHeight = 0))
                // Keep the original icon/16dp badge geometry at normal text size.
                // Larger text grows upwards and reserves trailing hit space.
                val width = constraints.constrainWidth(maxOf(48.dp.roundToPx(), 32.dp.roundToPx() + (badge?.width ?: 0)))
                layout(width, constraints.constrainHeight(48.dp.roundToPx())) {
                    icon.placeRelative(6.dp.roundToPx(), 6.dp.roundToPx())
                    badge?.placeRelative(30.dp.roundToPx(), 18.dp.roundToPx() - badge.height)
                }
            }
        }
        val initials = (profile.full_name.ifBlank { profile.email }).split(' ').filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1).uppercase() }
        Box(Modifier.size(48.dp).semantics { contentDescription = "Open account" }.headerAction { open("me") }, contentAlignment = Alignment.Center) {
            Text(initials, color = Cargo.Ink, style = TextStyle(fontFamily = Cargo.Title, fontSize = 14.sp, lineHeight = 20.sp))
        }
    }
}

/** Keep the existing press indication and add a visible keyboard outline. */
@Composable private fun Modifier.headerAction(click: () -> Unit): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    return border(2.dp, if (focused) Cargo.Accent else Color.Transparent, RoundedCornerShape(8.dp))
        .clickable(interactionSource = interaction, indication = LocalIndication.current, role = Role.Button, onClick = click)
}
