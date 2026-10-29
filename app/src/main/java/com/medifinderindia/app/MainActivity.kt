package com.medifinderindia.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ImageView
import android.widget.TextView
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import androidx.browser.customtabs.CustomTabsIntent
import org.json.JSONObject
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import com.google.firebase.messaging.FirebaseMessaging

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var offlineView: View? = null
    private var lastGoodUrl: String = "https://www.medifinderindia.com/"
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val filePickerRequest = 1001
    private val webPermissionRequestCode = 1002
    private val locationRequestCode = 1003
    private val notificationRequestCode = 1004
    private var pendingCameraUri: Uri? = null
    private val cameraRequestCode = 1005
    private var pendingWebPermission: PermissionRequest? = null
    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null
    private val homeUrl = "https://www.medifinderindia.com/"
    private val oauthScheme = "com.medifinderindia.app"
    private val oauthHost = "auth-callback"
    private val supabaseHost = "rnpbglinkpsikeszcjcl.supabase.co"
    @Volatile private var pendingOAuthJson: String? = null
    // WebView.getUrl() may only be called on the UI thread, but @JavascriptInterface methods run on the
    // "JavaBridge" thread. The host is therefore cached here from WebViewClient callbacks (UI thread).
    @Volatile private var currentPageHost: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        webView.setBackgroundColor(Color.rgb(247, 248, 255))
        setContentView(webView, android.view.ViewGroup.LayoutParams(
            android.view.ViewGroup.LayoutParams.MATCH_PARENT,
            android.view.ViewGroup.LayoutParams.MATCH_PARENT
        ))

        // Configure WebView as the rendering surface of the Android app, not as a browser tab.
        // Keep native scrolling/touch physics and avoid accidental zoom/overscroll gestures.
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.javaScriptCanOpenWindowsAutomatically = false
        webView.settings.loadsImagesAutomatically = true
        webView.settings.mediaPlaybackRequiresUserGesture = true
        webView.settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
        webView.settings.textZoom = 100
        webView.settings.setSupportZoom(false)
        webView.settings.builtInZoomControls = false
        webView.settings.displayZoomControls = false
        webView.settings.setGeolocationEnabled(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            webView.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.settings.safeBrowsingEnabled = true
        }
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.scrollBarStyle = View.SCROLLBARS_INSIDE_OVERLAY
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.isFocusable = true
        webView.isFocusableInTouchMode = true
        window.statusBarColor = Color.rgb(247, 248, 255)
        window.navigationBarColor = Color.rgb(247, 248, 255)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            window.decorView.systemUiVisibility =
                window.decorView.systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        }
        webView.addJavascriptInterface(MFAndroidBridge(), "MFAndroid")
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                currentPageHost = try { Uri.parse(url ?: "").host } catch (_: Exception) { null }
            }
            override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                super.doUpdateVisitedHistory(view, url, isReload)
                currentPageHost = try { Uri.parse(url ?: "").host } catch (_: Exception) { null }
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                super.onReceivedError(view, request, error)
                if (request.isForMainFrame) {
                    val failed = request.url?.toString()
                    if (!failed.isNullOrBlank()) lastGoodUrl = failed
                    showOfflineScreen()
                }
            }
            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: android.webkit.WebResourceResponse) {
                super.onReceivedHttpError(view, request, errorResponse)
                // HTTP errors and failed subresources do not replace the whole app.
            }
            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                if (url != null && (url.startsWith("https://www.medifinderindia.com") || url.startsWith("https://medifinderindia.com"))) {
                    lastGoodUrl = url
                    hideOfflineScreen()
                }
                currentPageHost = try { Uri.parse(url ?: "").host } catch (_: Exception) { null }
                val host = try { Uri.parse(url ?: "").host } catch (_: Exception) { null }
                if (host == "medifinderindia.com" || host == "www.medifinderindia.com") {
                    view.evaluateJavascript("window.MF_IS_APP=true;", null)
                    // Register this installation's FCM token against the signed-in Supabase user.
                    // The website's own Supabase session is used; no service-role key enters the app.
                    view.evaluateJavascript(
                        """
                        (function(){
                          if (!window.MFAndroid || window.__mfFcmBridgeInstalled) return;
                          window.__mfFcmBridgeInstalled = true;
                          window.__mfRegisterAndroidFcmToken = async function(token) {
                            try {
                              if (!token || typeof supabaseClient === 'undefined' || !supabaseClient || !supabaseClient.auth) return;
                              var sessionResult = await supabaseClient.auth.getSession();
                              var session = sessionResult && sessionResult.data && sessionResult.data.session;
                              if (!session) return;
                              await supabaseClient.functions.invoke('register-android-fcm-token', { body: { token: token } });
                            } catch (e) { console.warn('MediFinder Android push token registration deferred:', e && e.message); }
                          };
                          window.MFAndroid.getFcmToken('__mfRegisterAndroidFcmToken');
                          if (typeof supabaseClient !== 'undefined' && supabaseClient && supabaseClient.auth) {
                            supabaseClient.auth.onAuthStateChange(function(event, session) {
                              if (session && window.MFAndroid) window.MFAndroid.getFcmToken('__mfRegisterAndroidFcmToken');
                            });
                          }
                        })();
                        """.trimIndent(), null
                    )
                    if (pendingOAuthJson != null && Uri.parse(url ?: "").path == "/auth.html") {
                        view.evaluateJavascript("window.MF_IS_APP=true; window.mfOnAppOAuth&&window.mfOnAppOAuth();", null)
                    }
                }
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return handleExternalUrl(request.url)
            }

            @Suppress("DEPRECATION")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                return handleExternalUrl(Uri.parse(url))
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                return try {
                    // Inputs explicitly marked capture (the Camera button) must launch the camera,
                    // not the generic document picker. Gallery/PDF inputs keep the system picker.
                    if (fileChooserParams.isCaptureEnabled && fileChooserParams.acceptTypes.any {
                            it.contains("image", ignoreCase = true)
                        }) {
                        val camera = Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE)
                        val dir = File(cacheDir, "camera").apply { mkdirs() }
                        val photo = File.createTempFile("medifinder_capture_", ".jpg", dir)
                        val uri = FileProvider.getUriForFile(
                            this@MainActivity, "$packageName.fileprovider", photo
                        )
                        pendingCameraUri = uri
                        camera.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, uri)
                        camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                        camera.clipData = android.content.ClipData.newUri(contentResolver, "Prescription photo", uri)
                        startActivityForResult(camera, cameraRequestCode)
                    } else {
                        startActivityForResult(fileChooserParams.createIntent(), filePickerRequest)
                    }
                    true
                } catch (_: Exception) {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = null
                    pendingCameraUri = null
                    Toast.makeText(this@MainActivity, "Could not open camera or file picker", Toast.LENGTH_SHORT).show()
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (!isTrustedOrigin(request.origin)) {
                        request.deny()
                        return@runOnUiThread
                    }
                    val needed = mutableListOf<String>()
                    for (resource in request.resources) {
                        when (resource) {
                            PermissionRequest.RESOURCE_VIDEO_CAPTURE -> needed.add(Manifest.permission.CAMERA)
                            PermissionRequest.RESOURCE_AUDIO_CAPTURE -> needed.add(Manifest.permission.RECORD_AUDIO)
                        }
                    }
                    if (needed.isEmpty()) {
                        request.deny()
                    } else if (needed.all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) {
                        request.grant(request.resources)
                    } else {
                        pendingWebPermission?.deny()
                        pendingWebPermission = request
                        requestPermissions(needed.distinct().toTypedArray(), webPermissionRequestCode)
                    }
                }
            }

            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                if (!isTrustedOrigin(Uri.parse(origin))) {
                    callback.invoke(origin, false, false)
                    return
                }
                pendingGeoCallback?.invoke(pendingGeoOrigin, false, false)
                pendingGeoOrigin = origin
                pendingGeoCallback = callback
                if (hasLocationPermission()) continueGeolocationRequest() else requestPermissions(
                    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                    locationRequestCode
                )
            }

            override fun onGeolocationPermissionsHidePrompt() {
                pendingGeoCallback?.invoke(pendingGeoOrigin, false, false)
                pendingGeoCallback = null
                pendingGeoOrigin = null
            }
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), notificationRequestCode)
        }
        val coldOAuth = parseOAuthIntent(intent)
        if (coldOAuth != null) {
            pendingOAuthJson = coldOAuth
            setIntent(Intent(Intent.ACTION_MAIN))
            webView.loadUrl("https://www.medifinderindia.com/auth.html?oauth=app")
        } else {
            // Restore the existing page/history after Activity recreation. Only open home when
            // Android has no usable WebView state; never reload the page just to redraw the UI.
            val restored = if (savedInstanceState != null) webView.restoreState(savedInstanceState) else null
            if (restored == null) webView.loadUrl(homeUrl)
        }
    }



    private fun handleExternalUrl(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase() ?: return true
        if (scheme == "https" && (uri.host == "medifinderindia.com" || uri.host == "www.medifinderindia.com")) {
            return false
        }
        // Payment providers commonly launch UPI apps through these custom schemes or intent:// URLs.
        if (scheme == "http" || scheme == "https" || scheme == "tel" || scheme == "mailto" ||
            scheme == "upi" || scheme == "upiintent" || scheme == "tez" || scheme == "phonepe" ||
            scheme == "paytmmp" || scheme == "bhim" || scheme == "gpay" || scheme == "intent") {
            return try {
                val intent = if (scheme == "intent") {
                    Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                } else {
                    Intent(Intent.ACTION_VIEW, uri)
                }
                startActivity(intent)
                true
            } catch (_: ActivityNotFoundException) {
                Toast.makeText(
                    this,
                    if (scheme in setOf("upi", "upiintent", "tez", "phonepe", "paytmmp", "bhim", "gpay", "intent"))
                        "No compatible UPI app found. Please use the QR Code option."
                    else "No app available to open this link",
                    Toast.LENGTH_LONG
                ).show()
                true
            } catch (_: Exception) {
                Toast.makeText(this, "Unable to open payment app. Please use the QR Code option.", Toast.LENGTH_LONG).show()
                true
            }
        }
        return true
    }

    private fun hasInternetConnection(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun showOfflineScreen() {
        runOnUiThread {
            if (isFinishing || offlineView != null) return@runOnUiThread
            val panel = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                setPadding(36, 40, 36, 40)
                setBackgroundColor(Color.rgb(247, 248, 255))
            }
            val illustration = ImageView(this).apply {
                setImageResource(R.drawable.illustration_no_connection)
                contentDescription = "No internet connection"
                scaleType = android.widget.ImageView.ScaleType.FIT_CENTER
                adjustViewBounds = true
            }
            val title = TextView(this).apply {
                text = "NO CONNECTION"
                gravity = Gravity.CENTER
                textSize = 24f
                setTextColor(Color.rgb(22, 32, 91))
                typeface = Typeface.DEFAULT_BOLD
                setPadding(0, 18, 0, 10)
            }
            val message = TextView(this).apply {
                text = "Please check your internet connection and try again."
                gravity = Gravity.CENTER
                textSize = 16f
                setTextColor(Color.rgb(91, 99, 125))
            }
            val retry = Button(this).apply {
                text = "Retry"
                isAllCaps = false
                setOnClickListener {
                    if (!hasInternetConnection()) {
                        Toast.makeText(this@MainActivity, "Internet is still unavailable. Please try again.", Toast.LENGTH_SHORT).show()
                    } else {
                        hideOfflineScreen()
                        webView.loadUrl(lastGoodUrl.ifBlank { homeUrl })
                    }
                }
            }
            panel.addView(illustration, LinearLayout.LayoutParams(-1, 440).apply { bottomMargin = 8 })
            panel.addView(title, LinearLayout.LayoutParams(-1, -2))
            panel.addView(message, LinearLayout.LayoutParams(-1, -2))
            panel.addView(retry, LinearLayout.LayoutParams(-2, -2).apply { topMargin = 24 })
            offlineView = panel
            setContentView(panel)
        }
    }

    private fun hideOfflineScreen() {
        runOnUiThread {
            if (offlineView != null) {
                offlineView = null
                if (::webView.isInitialized) setContentView(webView)
            }
        }
    }

    private inner class MFAndroidBridge {
        @JavascriptInterface
        fun shareContent(title: String?, text: String?, url: String?): Boolean {
            val parts = listOf(text?.trim().orEmpty(), url?.trim().orEmpty())
                .filter { it.isNotBlank() }
                .distinct()
            val shareText = parts.joinToString("\n")
            if (shareText.isBlank()) return false
            runOnUiThread {
                try {
                    val sendIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, shareText)
                    }
                    startActivity(Intent.createChooser(sendIntent, title?.takeIf { it.isNotBlank() } ?: "Share with"))
                } catch (_: Exception) {
                    Toast.makeText(this@MainActivity, "No sharing apps available", Toast.LENGTH_SHORT).show()
                }
            }
            return true
        }

        @JavascriptInterface
        fun copyText(value: String?): Boolean {
            val text = value.orEmpty()
            if (text.isBlank()) return false
            runOnUiThread {
                try {
                    val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    clipboard.setPrimaryClip(android.content.ClipData.newPlainText("MediFinder India link", text))
                    Toast.makeText(this@MainActivity, "Link copied to clipboard", Toast.LENGTH_SHORT).show()
                } catch (_: Exception) {
                    Toast.makeText(this@MainActivity, "Could not copy link", Toast.LENGTH_SHORT).show()
                }
            }
            return true
        }
        @JavascriptInterface
        fun getFcmToken(callbackName: String) {
            if (!callbackName.matches(Regex("[A-Za-z_$][A-Za-z0-9_$]*"))) return
            FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                val safeToken = JSONObject.quote(token)
                runOnUiThread {
                    if (::webView.isInitialized && !isFinishing) {
                        webView.evaluateJavascript("$callbackName($safeToken)", null)
                    }
                }
            }
        }

        @JavascriptInterface
        fun status(): String {
            val out = JSONObject()
            out.put("notifications", if (Build.VERSION.SDK_INT < 33 ||
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) "granted" else "denied")
            out.put("location", if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) "granted" else "denied")
            out.put("camera", if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) "granted" else "denied")
            out.put("microphone", if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) "granted" else "denied")
            return out.toString()
        }

        @JavascriptInterface
        fun request(key: String) {
            runOnUiThread {
                val permission = when (key) {
                    "notifications" -> if (Build.VERSION.SDK_INT >= 33) Manifest.permission.POST_NOTIFICATIONS else null
                    "location" -> if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                        checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) Manifest.permission.ACCESS_FINE_LOCATION else null
                    "camera" -> Manifest.permission.CAMERA
                    "microphone" -> Manifest.permission.RECORD_AUDIO
                    else -> null
                }
                if (permission == null) {
                    webView.evaluateJavascript("window.MFApp&&window.MFApp.refresh&&window.MFApp.refresh()", null)
                } else if (checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
                    webView.evaluateJavascript("window.MFApp&&window.MFApp.refresh&&window.MFApp.refresh()", null)
                } else {
                    val code = when (key) {
                        "notifications" -> notificationRequestCode
                        "location" -> locationRequestCode
                        else -> webPermissionRequestCode + 10
                    }
                    if (key == "location") {
                        pendingGeoOrigin = "https://www.medifinderindia.com"
                        requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), locationRequestCode)
                    } else {
                        requestPermissions(arrayOf(permission), code)
                    }
                }
            }
        }

        @JavascriptInterface
        fun openSettings() {
            runOnUiThread {
                try {
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
                } catch (_: Exception) {
                    Toast.makeText(this@MainActivity, "Could not open app settings", Toast.LENGTH_SHORT).show()
                }
            }
        }

        @JavascriptInterface
        fun openOAuth(url: String?): Boolean {
            if (url == null || !isOurPage()) return false
            val u = try { Uri.parse(url) } catch (_: Exception) { return false }
            if (u.scheme != "https" || u.host != supabaseHost ||
                u.path?.startsWith("/auth/v1/authorize") != true) return false
            val redirect = try { Uri.parse(u.getQueryParameter("redirect_to") ?: "") } catch (_: Exception) { Uri.EMPTY }
            if (redirect.scheme != oauthScheme || redirect.host != oauthHost) return false
            return try {
                runOnUiThread {
                    try {
                        CustomTabsIntent.Builder().build().launchUrl(this@MainActivity, u)
                    } catch (_: Exception) {
                        try {
                            startActivity(Intent(Intent.ACTION_VIEW, u))
                        } catch (_: Exception) {
                            Toast.makeText(this@MainActivity, "Could not open Google sign-in. Check your browser and try again.", Toast.LENGTH_LONG).show()
                        }
                    }
                }
                true
            } catch (_: Exception) { false }
        }

        @JavascriptInterface
        fun consumeOAuthResult(): String {
            if (!isOurPage()) return ""
            val result = pendingOAuthJson
            pendingOAuthJson = null
            return result ?: ""
        }
    }

    private fun hasLocationPermission(): Boolean =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun continueGeolocationRequest() {
        val origin = pendingGeoOrigin ?: return
        val callback = pendingGeoCallback ?: return
        if (!isTrustedOrigin(Uri.parse(origin)) || !hasLocationPermission()) {
            callback.invoke(origin, false, false); pendingGeoCallback = null; pendingGeoOrigin = null; return
        }
        val manager = getSystemService(LOCATION_SERVICE) as android.location.LocationManager
        val enabled = try {
            manager.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) ||
                manager.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)
        } catch (_: Exception) { false }
        if (enabled) {
            callback.invoke(origin, true, false); pendingGeoCallback = null; pendingGeoOrigin = null
        } else {
            android.app.AlertDialog.Builder(this)
                .setTitle("Turn on location")
                .setMessage("MediFinder needs your device location to find nearby services. Turn on Location, then return to the app.")
                .setPositiveButton("Location settings") { _, _ ->
                    try { startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)) }
                    catch (_: Exception) { Toast.makeText(this, "Please turn on Location in Settings", Toast.LENGTH_LONG).show() }
                }
                .setNegativeButton("Not now") { _, _ ->
                    pendingGeoCallback?.invoke(pendingGeoOrigin, false, false); pendingGeoCallback = null; pendingGeoOrigin = null
                }
                .setOnCancelListener {
                    pendingGeoCallback?.invoke(pendingGeoOrigin, false, false); pendingGeoCallback = null; pendingGeoOrigin = null
                }.show()
        }
    }

    override fun onResume() {
        super.onResume()
        if (pendingGeoCallback != null && hasLocationPermission()) continueGeolocationRequest()
    }

    private fun isOurPage(): Boolean {
        val host = currentPageHost
        return host == "medifinderindia.com" || host == "www.medifinderindia.com"
    }

    private fun parseOAuthIntent(i: Intent?): String? {
        val d = i?.data ?: return null
        if (i.action != Intent.ACTION_VIEW || d.scheme != oauthScheme || d.host != oauthHost) return null
        val fragmentParams = d.fragment?.let { Uri.parse("https://callback.invalid/?$it") }
        fun param(key: String): String? = d.getQueryParameter(key) ?: fragmentParams?.getQueryParameter(key)
        val result = JSONObject()
        val error = param("error")
        val code = param("code")
        when {
            error != null -> {
                result.put("error", error.take(64))
                result.put("description", (param("error_description") ?: "").take(300))
            }
            code != null && Regex("[A-Za-z0-9._~-]{8,256}").matches(code) -> result.put("code", code)
            else -> result.put("error", "invalid_callback")
        }
        return result.toString()
    }

    private fun handleOAuthIntent(i: Intent?) {
        val result = parseOAuthIntent(i) ?: return
        pendingOAuthJson = result
        setIntent(Intent(Intent.ACTION_MAIN))
        if (isOurPage() && Uri.parse(webView.url ?: "").path == "/auth.html") {
            webView.evaluateJavascript("window.MF_IS_APP=true; window.mfOnAppOAuth&&window.mfOnAppOAuth();", null)
        } else {
            webView.loadUrl("https://www.medifinderindia.com/auth.html?oauth=app")
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleOAuthIntent(intent)
    }

    private fun isTrustedOrigin(uri: Uri): Boolean {
        return uri.scheme == "https" && (uri.host == "medifinderindia.com" || uri.host == "www.medifinderindia.com")
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            webPermissionRequestCode -> {
                val request = pendingWebPermission
                pendingWebPermission = null
                if (request != null) {
                    val granted = permissions.isNotEmpty() && grantResults.isNotEmpty() &&
                        permissions.indices.all { grantResults.getOrNull(it) == PackageManager.PERMISSION_GRANTED }
                    if (granted && isTrustedOrigin(request.origin)) request.grant(request.resources) else request.deny()
                }
            }
            locationRequestCode -> {
                if (pendingGeoCallback != null) {
                    if (hasLocationPermission()) continueGeolocationRequest() else {
                        pendingGeoCallback?.invoke(pendingGeoOrigin, false, false)
                        pendingGeoCallback = null; pendingGeoOrigin = null
                        Toast.makeText(this, "Location permission is needed to find nearby services.", Toast.LENGTH_LONG).show()
                    }
                }
                webView.evaluateJavascript("window.MFApp&&window.MFApp.refresh&&window.MFApp.refresh()", null)
            }
            notificationRequestCode, webPermissionRequestCode + 10 -> {
                webView.evaluateJavascript("window.MFApp&&window.MFApp.refresh&&window.MFApp.refresh()", null)
            }
        }
    }

    @Deprecated("Deprecated in Android API but supported for broad device compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == cameraRequestCode) {
            // Some camera apps return the captured URI only through EXTRA_OUTPUT; others also
            // return a thumbnail/data URI. Prefer our full-resolution output file.
            val outputUri = pendingCameraUri
            val resultUri = if (resultCode == RESULT_OK) {
                val outputHasImage = outputUri?.let { uri ->
                    try {
                        contentResolver.openFileDescriptor(uri, "r")?.use { it.statSize > 0L } ?: false
                    } catch (_: Exception) { false }
                } ?: false
                if (outputHasImage) outputUri else data?.data
            } else null
            val callback = fileCallback
            fileCallback = null
            pendingCameraUri = null
            if (callback != null) {
                callback.onReceiveValue(resultUri?.let { arrayOf(it) })
            }
        } else if (requestCode == filePickerRequest) {
            val result = if (resultCode == RESULT_OK) WebChromeClient.FileChooserParams.parseResult(resultCode, data) else null
            fileCallback?.onReceiveValue(result)
            fileCallback = null
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (!::webView.isInitialized) {
            super.onBackPressed()
            return
        }

        val history = webView.copyBackForwardList()
        val currentIndex = history.currentIndex
        fun isAuthUrl(url: String): Boolean {
            val lower = url.lowercase()
            val path = runCatching { Uri.parse(url).path.orEmpty().lowercase() }.getOrDefault("")
            return path.contains("login") || path.contains("signin") ||
                path.contains("signup") || path.contains("auth") ||
                lower.contains("signin") || lower.contains("signup")
        }

        // Skip stale login/signup pages in WebView history after role-based login.
        for (index in currentIndex - 1 downTo 0) {
            val itemUrl = history.getItemAtIndex(index)?.url.orEmpty()
            if (itemUrl.isNotBlank() && !isAuthUrl(itemUrl)) {
                webView.goBackOrForward(index - currentIndex)
                return
            }
        }

        // No safe in-app history remains: close the app instead of returning to login.
        finish()
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        pendingWebPermission?.deny()
        webView.destroy()
        super.onDestroy()
    }
}
