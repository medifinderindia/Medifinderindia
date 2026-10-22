# MediFinder Android APK build

## Automatic build (recommended)
1. Merge the Android build setup pull request into `main`.
2. Open the repository's **Actions** tab and select **Build MediFinder Android APK**.
3. Select **Run workflow** if no run started automatically.
4. Open a successful run, scroll to **Artifacts**, and download `medifinder-android-debug-apk`.
5. Extract the ZIP and install `app-debug.apk` on your Android phone.

The debug APK is for testing. It is not a Play Store release APK. A release build needs a private signing key and protected GitHub Actions secrets; never commit a keystore or passwords.

## Google sign-in configuration
- Google Cloud OAuth authorized redirect URI: `https://rnpbglinkpsikeszcjcl.supabase.co/auth/v1/callback`
- Supabase Auth URL configuration must allow `com.medifinderindia.app://auth-callback`
- Keep the OAuth callback scheme and Android application ID aligned. Do not change them independently.

This workflow does not modify Supabase data, secrets, or web app files. The GitHub Actions build must still complete successfully before an APK is considered verified.
