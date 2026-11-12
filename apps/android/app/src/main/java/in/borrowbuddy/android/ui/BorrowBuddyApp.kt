package `in`.borrowbuddy.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import `in`.borrowbuddy.android.domain.Profile

@Composable fun BorrowBuddyApp(model: SessionViewModel) {
    val state by model.state.collectAsStateWithLifecycle()
    var authenticating by rememberSaveable { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, model) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) model.refresh() }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    OfflineGate(onResume = { model.refresh() }, onHome = model::openHome) {
    Surface(Modifier.fillMaxSize(), color = Cargo.Canvas) {
        Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
            val profile = state.profile
            when {
                state.initializing -> OpeningShelf()
                profile == null -> {
                    BackHandler(authenticating) { authenticating = false }
                    if (authenticating) AuthScreen(model, state) { authenticating = false }
                    else LandingScreen(model.repository) { authenticating = true }
                }
                !profile.is_admin && (profile.full_name.isBlank() ||
                    (profile.verification_status == "pending" && profile.student_id_path.isNullOrBlank())) -> OnboardingScreen(model, state, profile)
                profile.verification_status != "verified" -> PendingScreen(model, state, profile)
                else -> key(profile.id) { CampusPortal(model, profile) }
            }
        }
    }
    }
}

@Composable private fun CampusPortal(model: SessionViewModel, profile: Profile) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route.orEmpty().substringBefore('?')
    val chatKeyboardOpen = (route == "chat" || route == "chat/{id}") && WindowInsets.ime.getBottom(LocalDensity.current) > 0
    fun open(path: String) { nav.navigate(path) { launchSingleTop = true } }
    fun section(path: String) {
        nav.navigate(path) {
            // Anchor to the complete route pattern, including its optional filters.
            popUpTo("home?spot={spot}&category={category}") { inclusive = path == "home" }
            launchSingleTop = true
        }
    }
    val homeRequest by model.homeRequests.collectAsStateWithLifecycle()
    LaunchedEffect(homeRequest) { if (homeRequest > 0) section("home") }
    val repository = model.repository
    val updates = rememberPortalUpdates(repository, profile.id)
    val ticker = rememberPortalTicker(entry)
    Box(Modifier.fillMaxSize()) {
    PortalBackdrop()
    Column(Modifier.fillMaxSize().nestedScroll(ticker.connection).semantics {
        this[PortalConnected] = updates.connected; this[PortalEvents] = updates.events; this[PortalRefreshes] = updates.refreshes
        this[PortalNotificationEvents] = updates.notificationEvents; this[PortalMembershipEvents] = updates.membershipEvents
        this[PortalNotificationCount] = updates.notifications; this[PortalUnreadChats] = updates.chats
        this[PortalPendingRequests] = updates.pendingRequests; this[PortalPendingRequestEvents] = updates.pendingRequestEvents
        this[PortalTickerCollapsed] = ticker.fraction.floatValue
        this[PortalDestination] = route
        this[PortalPreviousDestination] = nav.previousBackStackEntry?.destination?.route.orEmpty()
    }) {
        // Leave space for messages and the composer above the software keyboard.
        if (!chatKeyboardOpen) {
            PortalTicker(ticker)
            PortalHeader(profile, route, updates.notifications, updates.pendingRequests, ::section, ::open)
        }
        CompositionLocalProvider(LocalPortalRevision provides updates.revision) {
        NavHost(nav, startDestination = "home", modifier = Modifier.weight(1f)) {
            composable("home?spot={spot}&category={category}", arguments = listOf(navArgument("spot") { type = NavType.StringType; nullable = true; defaultValue = null }, navArgument("category") { type = NavType.StringType; nullable = true; defaultValue = null })) { backStack ->
                CatalogScreen(repository, profile, backStack.arguments?.getString("spot"), backStack.arguments?.getString("category"), { open("items/$it") }, { open("items/new") }, updates.pendingRequests, { open("my/items") })
            }
            composable("dashboard") { DashboardScreen(repository, profile, { open("loans/$it") }, { category -> open(if (category == null) "home" else "home?category=$category") }, { open("my/borrows") }) }
            composable("items/new") { ListingScreen(repository, profile, null) { open("items/$it") } }
            composable("items/{id}") { backStack ->
                val id = backStack.arguments!!.getString("id")!!
                ItemScreen(repository, profile, id, { open("items/$id/edit") }, { open("users/$it") }, { open("my/items") })
            }
            composable("items/{id}/edit") { backStack -> ListingScreen(repository, profile, backStack.arguments!!.getString("id")) { open("items/$it") } }
            composable("my/borrows") { BorrowsScreen(repository, profile, { open("loans/$it") }, { open("items/$it") }, { section("home") }) }
            composable("my/items") { MyItemsScreen(repository, profile, { open("items/$it") }, { open("loans/$it") }, { open("items/$it/edit") }, { open("items/new") }) }
            composable("loans/{id}") { backStack -> LoanScreen(repository, profile, backStack.arguments!!.getString("id")!!,
                logbook = { owner -> section(if (owner) "my/items" else "my/borrows") }, chat = { open("chat/$it") }) }
            composable("notifications") { NotificationsScreen(repository, profile, ::open) }
            composable("me") { AccountScreen(model, profile, { open("users/${profile.id}") }, { open("fines") }, { open("map") }) }
            composable("users/{id}") { backStack -> StudentScreen(repository, backStack.arguments!!.getString("id")!!) { open("items/$it") } }
            composable("fines") { FinesScreen(repository, profile) { open("loans/$it") } }
            composable("chat") { ChatsScreen(repository, profile) { open("chat/$it") } }
            composable("chat/{id}") { backStack -> ChatScreen(repository, profile, backStack.arguments!!.getString("id")!!,
                { open("loans/$it") }, { open("users/$it") }, { if (!nav.popBackStack("chat", false)) section("chat") }) }
            composable("map") { MapScreen(repository) { open("home?spot=$it") } }
            composable("campus") { CampusHomeScreen(repository, profile, ::open) }
            composable("campus/activity") { CampusActivityScreen(repository, profile, ::open) }
            composable("campus/handovers") { CampusHandoversScreen(repository, profile, ::open) }
            composable("campus/admin") { CampusAdminScreen(repository, profile, ::open) }
            composable("campus/collections/{id}") { backStack -> CampusCollectionScreen(repository, profile, backStack.arguments!!.getString("id")!!, ::open) }
            listOf("lost-found" to "found", "giveaways" to "giveaway").forEach { (section, kind) ->
                composable("campus/$section") { CampusFeedScreen(repository, profile, kind, ::open) }
                composable("campus/$section/new") { CampusPostEditor(repository, profile, kind, null, ::open) }
                composable("campus/$section/{id}/edit") { backStack -> CampusPostEditor(repository, profile, kind, backStack.arguments!!.getString("id")!!, ::open) }
                composable("campus/$section/{id}") { backStack -> CampusPostScreen(repository, profile, backStack.arguments!!.getString("id")!!, ::open) }
            }
            composable("admin") { AdminScreen(repository, profile) { open("loans/$it") } }
        }
        }
    }
    }
}
