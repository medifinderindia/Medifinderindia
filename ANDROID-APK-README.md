# MediFinder India Android app

The Android app currently opens the existing website at https://www.medifinderindia.com/ inside a WebView. It is an initial wrapper, not a fully native rewrite. Test all website-dependent features and healthcare workflows before release.

## Test APK

The GitHub Actions workflow always builds a debug APK for device testing. It is not the production Play Store upload.

## Google Play release bundle

Google Play expects a signed Android App Bundle (.aab) for a new app. The workflow creates the signed bundle only after the following GitHub Actions repository secrets are configured:

- `ANDROID_KEYSTORE_BASE64`: the release/upload keystore file encoded as Base64
- `ANDROID_KEYSTORE_PASSWORD`: keystore password
- `ANDROID_KEY_ALIAS`: key alias
- `ANDROID_KEY_PASSWORD`: key password

Never commit the keystore, passwords, or private keys to the repository. Keep a secure offline backup of the keystore and credentials. If the upload key is lost, release updates can become difficult; use Google Play App Signing when setting up the app.

After adding secrets, open Actions, choose **Build MediFinder India Android**, run it on `android-apk`, then download `medifinder-india-play-release-aab` from a successful run.

## Before publishing

- Test login, navigation, order, payment, prescription upload/file picker, and external links on real devices.
- Provide a publicly accessible privacy policy URL both in Play Console and within the app.
- Complete the Health apps declaration, Data safety, content rating, and all applicable policy declarations truthfully.
- Prepare store icon, screenshots, description, support contact, and account deletion flow if users can create accounts.
- New Google Play apps must target API 36 or higher as of August 31, 2026.
- Some new personal developer accounts must complete a closed test with at least 12 opted-in testers for 14 continuous days before requesting production access.

A successful build does not guarantee Google Play approval. The owner must complete Play Console setup and submit the app for review.
