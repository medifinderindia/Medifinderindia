# MediFinder India Android APK

This Android app wraps the existing MediFinder India website in an Android WebView. It keeps the web service as the source of truth and supports JavaScript, local web storage, Android back navigation, and file selection for website upload forms.

## Build an APK with GitHub Actions

1. Open the repository's **Actions** tab.
2. Select **Build MediFinder India APK**.
3. Select **Run workflow** on branch `android-apk` (or push a change to that branch).
4. Wait for the workflow to finish successfully.
5. Open the successful run and download the `medifinder-india-debug-apk` artifact.
6. Extract the ZIP; it contains `app-debug.apk`. Transfer it to your Android phone and install it. Android may ask you to allow installs from that source.

## Build locally

Install JDK 17 and Android SDK, then run:

```bash
gradle assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/app-debug.apk`.

## Important

This is a **debug APK**, intended for testing, not a Play Store release. It loads `https://www.medifinderindia.com/`; most service behavior remains dependent on the website and its backend. Test sign-in, medicine orders, payments, prescription upload, and all healthcare flows on a test account before distributing. A signed release build and privacy/security review are still required before public release.
