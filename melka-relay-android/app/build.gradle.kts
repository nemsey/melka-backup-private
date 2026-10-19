plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.melka.relay"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.melka.relay"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        // زبان پیش‌فرض فارسی (values/strings.xml فارسی است)
        resourceConfigurations += listOf("fa")
    }

    signingConfigs {
        create("release") {
            // keystore محلی مالک — اسکریپت scripts/pn031d/android-build.sh می‌سازد
            // (PKCS12: رمز کلید = رمز فروشگاه — الزام قالب)
            storeFile = rootProject.file("melka-relay.jks")
            storePassword = "melka-relay-store"
            keyAlias = "melka-relay"
            keyPassword = "melka-relay-store"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
        debug {
            signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    // اسکنر QR (کتابخانهٔ ZXing journeyapps — پرکارآزموده)
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
}
