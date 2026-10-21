
## Pass 5 (desktop layout)
- user.css: new "DESKTOP LAYOUT (>= 1024px)" section. Page content, page headers and purchase bars are centred in a 1240px column via --mf-gutter, the mobile tab bar becomes a 640px centred bar, the quick-service row spreads across the column. Product grid is now auto-fill (was fixed 4 columns). Nothing applies below 1024px. Also drives home.html.
- rider.js / rider.css: the "No orders available" empty state now spans the whole 2/3-column grid (it sat in column one).
- Merchant and ambulance portals already had a sidebar desktop layout: no structural change.
- Not visually verified: admin.html (needs real multi-step admin login), real product data / product detail on desktop.

## Pass 6 (APK: logo, warning, permissions)
- android/ is now a complete Android Studio project: settings/build.gradle.kts, targetSdk 34, release signing via keystore.properties, README with keytool steps.
- Launcher icons (adaptive + legacy + round) and Play listing icon added. They are cut from a screenshot (slightly soft): replace with the real 512px logo via Image Asset.
- Previous manifest pointed to @mipmap/ic_launcher that did not exist -> no logo. Fixed.
- "Harmful app" is Play Protect's unknown-developer warning: sign with own key + publish on Play. See android/README.md.
- Not built or installed here (no Android SDK).
