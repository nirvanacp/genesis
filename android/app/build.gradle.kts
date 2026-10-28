import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

val workspaceRoot = rootProject.layout.projectDirectory.dir("..").asFile
val localSettings = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val configuredNode = localSettings.getProperty("genesis.node", "node")

abstract class GenesisBuild : DefaultTask() {
    @get:Input abstract val variant: Property<String>
    @get:Input abstract val nodeExecutable: Property<String>
    @get:Input abstract val cargoExecutable: Property<String>
    @get:Input abstract val sdkPath: Property<String>
    @get:Internal abstract val workspace: DirectoryProperty
    @get:OutputDirectory abstract val assetsDirectory: DirectoryProperty
    @get:OutputDirectory abstract val jniDirectory: DirectoryProperty
    @get:Inject abstract val execOperations: ExecOperations

    @TaskAction fun generate() {
        val result = try {
            execOperations.exec {
                isIgnoreExitValue = true
                workingDir(workspace.get().asFile)
                commandLine(nodeExecutable.get(), "tools/build.mjs", "--stage", "all", "--variant", variant.get(),
                    "--cargo", cargoExecutable.get(),
                    "--sdk", sdkPath.get())
            }
        } catch (error: org.gradle.process.internal.ExecException) {
            throw GradleException("Cannot start Node 24.15.0. Set genesis.node to its absolute executable path in android/local.properties.", error)
        }
        result.assertNormalExitValue()
    }
}

android {
    namespace = "app.nirvana.genesis"
    compileSdk = 37
    buildToolsVersion = "36.0.0"
    ndkVersion = "28.2.13676358"
    defaultConfig {
        applicationId = "app.nirvana.genesis"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildTypes {
        debug { isMinifyEnabled = false }
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    // Preserve the original Compose starter without compiling it into the Java host.
    sourceSets.getByName("main").java.setSrcDirs(listOf("src/main/java/app/nirvana/genesis"))
}

val genesisBuild = tasks.register("genesisBuild") {
    group = "build"
    description = "Build Genesis assets and native libraries for all application variants."
}
androidComponents {
    onVariants(selector().all()) { variant ->
        val suffix = variant.name.replaceFirstChar { it.uppercase() }
        val producer = tasks.register<GenesisBuild>("genesisBuild$suffix") {
            group = "build"
            this.variant.set(variant.name)
            nodeExecutable.set(configuredNode)
            cargoExecutable.set(localSettings.getProperty("genesis.cargo", "cargo"))
            sdkPath.set(localSettings.getProperty("sdk.dir")
                ?: providers.environmentVariable("ANDROID_HOME").orNull
                ?: providers.environmentVariable("ANDROID_SDK_ROOT").orNull ?: "")
            workspace.set(workspaceRoot)
            inputs.files(fileTree(workspaceRoot) {
                include("Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "package.json", "package-lock.json",
                    "tsconfig.base.json", ".nvmrc", "tools/**", "crates/contracts/**", "packages/**", "applets/**", "android/native/**")
                exclude("**/node_modules/**", "**/target/**")
            })
            assetsDirectory.set(layout.buildDirectory.dir("generated/genesis/${variant.name}/assets"))
            jniDirectory.set(layout.buildDirectory.dir("generated/genesis/${variant.name}/jniLibs"))
        }
        variant.sources.assets?.addGeneratedSourceDirectory(producer, GenesisBuild::assetsDirectory)
        variant.sources.jniLibs?.addGeneratedSourceDirectory(producer, GenesisBuild::jniDirectory)
        genesisBuild.configure { dependsOn(producer) }
    }
}

dependencies {
    implementation(libs.androidx.webkit)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}
