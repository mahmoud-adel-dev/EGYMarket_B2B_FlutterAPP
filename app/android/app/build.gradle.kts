import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val isReleaseTask = gradle.startParameter.taskNames.any { it.contains("Release", ignoreCase = true) }
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

fun signingValue(propertyName: String, environmentName: String): String? =
    keystoreProperties.getProperty(propertyName)?.trim()?.takeIf { it.isNotEmpty() }
        ?: System.getenv(environmentName)?.trim()?.takeIf { it.isNotEmpty() }

val releaseStorePath = signingValue("storeFile", "SEALS_ANDROID_STORE_FILE")
val releaseStorePassword = signingValue("storePassword", "SEALS_ANDROID_STORE_PASSWORD")
val releaseKeyAlias = signingValue("keyAlias", "SEALS_ANDROID_KEY_ALIAS")
val releaseKeyPassword = signingValue("keyPassword", "SEALS_ANDROID_KEY_PASSWORD")
val releaseStoreFile = releaseStorePath?.let { file(it) }
val missingSigningValues = buildList {
    if (releaseStorePath == null) add("storeFile / SEALS_ANDROID_STORE_FILE")
    if (releaseStorePassword == null) add("storePassword / SEALS_ANDROID_STORE_PASSWORD")
    if (releaseKeyAlias == null) add("keyAlias / SEALS_ANDROID_KEY_ALIAS")
    if (releaseKeyPassword == null) add("keyPassword / SEALS_ANDROID_KEY_PASSWORD")
}
val hasReleaseSigning = missingSigningValues.isEmpty() && releaseStoreFile?.isFile == true

if (isReleaseTask && missingSigningValues.isNotEmpty()) {
    throw GradleException(
        "Missing Android release signing values: ${missingSigningValues.joinToString()}. " +
            "Copy android/key.properties.example to android/key.properties, or set the documented CI environment variables.",
    )
}
if (isReleaseTask && releaseStoreFile?.isFile != true) {
    throw GradleException(
        "Android release keystore was not found at: ${releaseStoreFile?.absolutePath ?: releaseStorePath}",
    )
}

android {
    namespace = "com.seals.b2b"
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.seals.b2b"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                keyAlias = requireNotNull(releaseKeyAlias)
                keyPassword = requireNotNull(releaseKeyPassword)
                storeFile = requireNotNull(releaseStoreFile)
                storePassword = requireNotNull(releaseStorePassword)
            }
        }
    }

    buildTypes {
        release {
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = true
            isShrinkResources = true
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
