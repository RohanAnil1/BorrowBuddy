plugins { alias(libs.plugins.android.test) }

android {
    namespace = "in.borrowbuddy.android.smoke"
    compileSdk = 37
    targetProjectPath = ":app"
    // AndroidX's macrobenchmark/test-module pattern: own process and runtime,
    // driving the unmodified minified app through public Android UI only.
    experimentalProperties["android.experimental.self-instrumenting"] = true
    defaultConfig {
        minSdk = 31
        targetSdk = 37
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildTypes { maybeCreate("release").apply {
        isDebuggable = true
        signingConfig = signingConfigs.getByName("debug")
    } }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
androidComponents { beforeVariants(selector().all()) { it.enable = it.buildType == "release" } }

dependencies {
    implementation(libs.junit)
    implementation("androidx.test:runner:1.7.0")
    implementation("androidx.test.uiautomator:uiautomator:2.4.0")
}
