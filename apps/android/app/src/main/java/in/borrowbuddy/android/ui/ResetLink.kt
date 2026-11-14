package `in`.borrowbuddy.android.ui

/** What a `borrowbuddy://auth/reset` link carries back from the reset email. */
sealed interface ResetLink {
    data class Code(val code: String) : ResetLink
    data object Expired : ResetLink
}

private val codeShape = Regex("^[\\w-]{1,200}$")

/** Null for anything that isn't a reset link; the activity is exported, so links are untrusted. */
internal fun parseResetLink(link: String?): ResetLink? {
    val uri = runCatching { java.net.URI(link ?: return null) }.getOrNull() ?: return null
    if (uri.scheme != "borrowbuddy" || uri.host != "auth" || uri.path != "/reset") return null
    val params = uri.rawQuery.orEmpty().split('&').mapNotNull {
        val (key, value) = it.split('=', limit = 2).takeIf { pair -> pair.size == 2 } ?: return@mapNotNull null
        key to java.net.URLDecoder.decode(value, Charsets.UTF_8.name())
    }.toMap()
    val code = params["code"]
    return if (code != null && codeShape.matches(code)) ResetLink.Code(code) else ResetLink.Expired
}
