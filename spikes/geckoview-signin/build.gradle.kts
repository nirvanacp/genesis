plugins {
    id("com.android.application") version "9.1.1"
}

android {
    namespace = "app.nirvana.genesis.spike.geckoview"
    compileSdk = 37
    buildToolsVersion = "36.0.0"
    defaultConfig {
        applicationId = "app.nirvana.genesis.spike.geckoview"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "spike"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // arm64 only: the spike runs on an arm64 phone or emulator.
    implementation("org.mozilla.geckoview:geckoview-arm64-v8a:160.0.20261104181552")
}
