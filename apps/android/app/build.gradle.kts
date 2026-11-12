import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

val localConfig = Properties().apply {
    rootProject.file("android.local.properties").takeIf { it.exists() }?.inputStream()?.use(::load)
}
fun setting(name: String): String = System.getenv(name) ?: localConfig.getProperty(name, "")
fun quoted(value: String) = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
val signing = Properties().apply {
    rootProject.file("keystore.properties").takeIf { it.exists() }?.inputStream()?.use(::load)
}

android {
    namespace = "in.borrowbuddy.android"
    compileSdk = 37
    defaultConfig {
        applicationId = "in.borrowbuddy.android"
        minSdk = 31
        targetSdk = 37
        versionCode = 3
        versionName = "0.3.0"
        testInstrumentationRunner = "in.borrowbuddy.android.BorrowBuddyQaRunner"
        // Ephemeral QA credentials are runner arguments only, never BuildConfig or APK assets.
        System.getenv("BORROWBUDDY_QA_EMAIL")?.let { testInstrumentationRunnerArguments["qaEmail"] = it }
        System.getenv("BORROWBUDDY_QA_PASSWORD")?.let { testInstrumentationRunnerArguments["qaPassword"] = it }
        System.getenv("BORROWBUDDY_QA_ITEM_ID")?.let { testInstrumentationRunnerArguments["qaItemId"] = it }
        System.getenv("BORROWBUDDY_QA_ITEM_TITLE")?.let { testInstrumentationRunnerArguments["qaItemTitle"] = it }
        buildConfigField("String", "SUPABASE_URL", quoted(setting("SUPABASE_URL")))
        buildConfigField("String", "SUPABASE_ANON_KEY", quoted(setting("SUPABASE_ANON_KEY")))
        // The web app that serves /api/assistant (Buddy). Release builds must set it.
        buildConfigField("String", "BORROWBUDDY_WEB_URL", quoted(setting("BORROWBUDDY_WEB_URL")))
    }
    signingConfigs {
        if (signing.isNotEmpty()) create("production") {
            storeFile = rootProject.file(signing.getProperty("storeFile"))
            storePassword = signing.getProperty("storePassword")
            keyAlias = signing.getProperty("keyAlias")
            keyPassword = signing.getProperty("keyPassword")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.findByName("production")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures { compose = true; buildConfig = true }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}
dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.tooling.preview)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.viewmodel)
    implementation(libs.lifecycle.runtime)
    implementation(libs.navigation.compose)
    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.auth)
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.storage)
    implementation(libs.supabase.realtime)
    implementation(libs.ktor.okhttp)
    implementation(libs.coil.compose)
    implementation(libs.coil.network)
    implementation(libs.filament)
    implementation(libs.filament.utils)
    implementation(libs.zxing)
    testImplementation(libs.junit)
    testImplementation(libs.ktor.mock)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.test)
    androidTestImplementation("androidx.test.espresso:espresso-core:3.7.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test:rules:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:monitor:1.8.0")
    androidTestImplementation("androidx.test.uiautomator:uiautomator:2.4.0")
    debugImplementation(libs.compose.tooling)
    debugImplementation(libs.compose.test.manifest)
}
