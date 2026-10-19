plugins {
    id("com.android.application")
}

android {
    namespace = "app.financesms"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.financesms"
        minSdk = 26 // java.time and adaptive icons
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the debug key so it installs without a Play Store
            // account. Fine for a personal, sideloaded app.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.19.1")
    implementation("androidx.appcompat:appcompat:1.8.0")
    implementation("com.google.android.material:material:1.14.0")
    implementation("androidx.work:work-runtime-ktx:2.12.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.2.0")

    testImplementation("junit:junit:4.13.2")
}
