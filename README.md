# MediFinder Android wrapper (permissions)

Files: app/src/main/AndroidManifest.xml, res/xml/file_paths.xml, java/com/medifinder/india/MainActivity.kt
Gradle dependencies needed: androidx.appcompat:appcompat, androidx.activity:activity-ktx, androidx.core:core-ktx.
Set minSdk 24+, targetSdk 34+. Package name: change `com.medifinder.india` to your real applicationId.

If your APK is built with Capacitor / Cordova / PWABuilder / Median instead, do NOT use MainActivity.kt;
copy only the <uses-permission>/<uses-feature> lines from AndroidManifest.xml into your project's manifest.
