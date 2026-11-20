import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

val workspaceRoot = rootProject.layout.projectDirectory.dir("..").asFile
// The applets directory named in genesis.workspace.json, relative to the workspace root or absolute.
val appletsDirectory = run {
    val config = groovy.json.JsonSlurper().parse(workspaceRoot.resolve("genesis.workspace.json")) as Map<*, *>
    workspaceRoot.resolve((config["applets"] as Map<*, *>)["directory"] as String)
}
val localSettings = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}
val configuredNode = localSettings.getProperty("genesis.node", "node")

// Release signing: each value comes from an environment variable, or else from a Gradle property
// such as one in ~/.gradle/gradle.properties, never from a file in the repository. Without all
// four, release builds stay unsigned.
fun signingValue(environment: String, property: String): String? =
    providers.environmentVariable(environment).orNull?.takeIf { it.isNotBlank() }
        ?: providers.gradleProperty(property).orNull?.takeIf { it.isNotBlank() }
val signingKeystore = signingValue("GENESIS_KEYSTORE_FILE", "genesis.keystore.file")
val signingKeystorePassword = signingValue("GENESIS_KEYSTORE_PASSWORD", "genesis.keystore.password")
val signingKeyAlias = signingValue("GENESIS_KEY_ALIAS", "genesis.key.alias")
val signingKeyPassword = signingValue("GENESIS_KEY_PASSWORD", "genesis.key.password")
val releaseSigned = listOf(signingKeystore, signingKeystorePassword, signingKeyAlias, signingKeyPassword).all { it != null }

abstract class GenesisBuild : DefaultTask() {
    @get:Input abstract val variant: Property<String>
    @get:Input abstract val nodeExecutable: Property<String>
    @get:Input abstract val cargoExecutable: Property<String>
    @get:Input abstract val sdkPath: Property<String>
    @get:Internal abstract val workspace: DirectoryProperty
    @get:OutputDirectory abstract val assetsDirectory: DirectoryProperty
    @get:OutputDirectory abstract val jniDirectory: DirectoryProperty
    /** App drawer entries of bundled applets: their labels, colors and icons. */
    @get:OutputDirectory abstract val resDirectory: DirectoryProperty
    /** The manifest overlay with their aliases. AGP chooses its location. */
    @get:OutputFile abstract val manifestFile: RegularFileProperty
    @get:Inject abstract val execOperations: ExecOperations

    @TaskAction fun generate() {
        val result = try {
            execOperations.exec {
                isIgnoreExitValue = true
                workingDir(workspace.get().asFile)
                commandLine(nodeExecutable.get(), "tools/build.mjs", "--stage", "all", "--variant", variant.get(),
                    "--cargo", cargoExecutable.get(),
                    "--sdk", sdkPath.get(),
                    "--manifest", manifestFile.get().asFile.absolutePath)
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
        applicationId = providers.gradleProperty("genesis.applicationId").getOrElse("app.nirvana.genesis")
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.2.0"
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    signingConfigs {
        if (releaseSigned) {
            create("release") {
                storeFile = file(signingKeystore!!)
                storePassword = signingKeystorePassword
                keyAlias = signingKeyAlias
                keyPassword = signingKeyPassword
            }
        }
    }
    buildTypes {
        debug { isMinifyEnabled = false }
        release {
            isMinifyEnabled = false
            if (releaseSigned) signingConfig = signingConfigs.getByName("release")
        }
        // The debuggable build for applet builders: the release's bundled applets and native
        // library under its own applicationId, so it installs beside the release app. It signs
        // with the release key when one is set, and with the debug key otherwise.
        create("developer") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            isDebuggable = true
            matchingFallbacks += "debug"
            if (releaseSigned) signingConfig = signingConfigs.getByName("release")
        }
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
                    "tsconfig.base.json", ".nvmrc", "tools/**", "crates/contracts/**", "let/packages/**", "let/package.json", "let/tsconfig.base.json", "genesis.workspace.json", "genesis.packages.json", "android/native/**")
                exclude("**/node_modules/**", "**/target/**")
            })
            // Release and developer builds bundle the published releases genesis.packages.json pins,
            // so only debug builds read applet and servelet source. A missing directory is an empty tree.
            if (variant.buildType == "debug") {
                inputs.files(fileTree(appletsDirectory) {
                    exclude("**/node_modules/**", "**/target/**", ".git/**")
                })
                inputs.files(fileTree(File(workspaceRoot, "servelets")) {
                    exclude("**/node_modules/**", "**/target/**", ".git/**", "**/dist/**")
                })
            }
            assetsDirectory.set(layout.buildDirectory.dir("generated/genesis/${variant.name}/assets"))
            jniDirectory.set(layout.buildDirectory.dir("generated/genesis/${variant.name}/jniLibs"))
            resDirectory.set(layout.buildDirectory.dir("generated/genesis/${variant.name}/res"))
        }
        variant.sources.assets?.addGeneratedSourceDirectory(producer, GenesisBuild::assetsDirectory)
        variant.sources.jniLibs?.addGeneratedSourceDirectory(producer, GenesisBuild::jniDirectory)
        variant.sources.res?.addGeneratedSourceDirectory(producer, GenesisBuild::resDirectory)
        variant.sources.manifests.addGeneratedManifestFile(producer, GenesisBuild::manifestFile)
        genesisBuild.configure { dependsOn(producer) }
    }
}

dependencies {
    implementation(libs.androidx.core)
    implementation(libs.androidx.webkit)
    implementation(libs.geckoview)
    implementation(libs.material)
    implementation(libs.androidx.work.runtime)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}
