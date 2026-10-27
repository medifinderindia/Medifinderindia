package com.medifinderindia.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
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

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val filePickerRequest = 1001
    private val webPermissionRequestCode = 1002
    private val locationRequestCode = 1003
    private val notificationRequestCode = 1004
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
    @Volatile private var lastHttpUrl: String = homeUrl
    @Volatile private var showingOfflinePage: Boolean = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        // Pull-to-refresh is intentionally disabled. The WebView is the root view,
        // so downward swipes only scroll the page and never trigger a reload.
        setContentView(
            webView,
            android.view.ViewGroup.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.MATCH_PARENT
            )
        )

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.javaScriptCanOpenWindowsAutomatically = false
        webView.settings.setGeolocationEnabled(true)
        webView.addJavascriptInterface(MFAndroidBridge(), "MFAndroid")
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                val parsed = try { Uri.parse(url ?: "") } catch (_: Exception) { null }
                currentPageHost = parsed?.host
                if (parsed != null && (parsed.scheme == "https" || parsed.scheme == "http") &&
                    (parsed.host == "medifinderindia.com" || parsed.host == "www.medifinderindia.com")) {
                    lastHttpUrl = parsed.toString()
                    showingOfflinePage = false
                }
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                super.onReceivedError(view, request, error)
                if (!request.isForMainFrame) return
                val failed = request.url
                if (failed.scheme != "https" && failed.scheme != "http") return
                if (failed.host != "medifinderindia.com" && failed.host != "www.medifinderindia.com") return
                lastHttpUrl = failed.toString()
                showingOfflinePage = true
                val offlineHtml = """
                    <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
                    <style>body{margin:0;background:#f5f6fa;color:#202433;font:16px system-ui;display:flex;min-height:90vh;align-items:center;justify-content:center;text-align:center}
                    main{padding:30px;max-width:360px} .icon{font-size:54px}h2{font-size:23px;margin:16px 0 8px}p{color:#727887;line-height:1.5}
                    button{border:0;border-radius:14px;background:#d6334a;color:white;font-weight:700;font-size:16px;padding:14px 24px;margin-top:14px;box-shadow:0 6px 18px #d6334a33}</style></head>
                    <body><main><div class="icon">📶</div><h2>You’re offline</h2><p>MediFinder India couldn’t connect. Check your internet connection and try again.</p>
                    <button onclick="window.MFAndroid&&window.MFAndroid.retryLoad()">Try Again</button></main></body></html>
                """.trimIndent()
                view.post { view.loadDataWithBaseURL("https://www.medifinderindia.com/", offlineHtml, "text/html", "UTF-8", null) }
            }
            override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                super.doUpdateVisitedHistory(view, url, isReload)
                currentPageHost = try { Uri.parse(url ?: "").host } catch (_: Exception) { null }
            }
            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                currentPageHost = try { Uri.parse(url ?: "").host } catch (_: Exception) { null }
                val host = try { Uri.parse(url ?: "").host } catch (_: Exception) { null }
                if (host == "medifinderindia.com" || host == "www.medifinderindia.com") {
                    view.evaluateJavascript("window.MF_IS_APP=true;", null)
                    if (pendingOAuthJson != null && Uri.parse(url ?: "").path == "/auth.html") {
                        view.evaluateJavascript("window.MF_IS_APP=true; window.mfOnAppOAuth&&window.mfOnAppOAuth();", null)
                    }
                }
            }
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                val scheme = uri.scheme ?: return true
                if (scheme == "https" && (uri.host == "medifinderindia.com" || uri.host == "www.medifinderindia.com")) {
                    return false
                }
                if (scheme == "http" || scheme == "https" || scheme == "tel" || scheme == "mailto") {
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                        true
                    } catch (_: ActivityNotFoundException) {
                        Toast.makeText(this@MainActivity, "No app available to open this link", Toast.LENGTH_SHORT).show()
                        true
                    }
                }
                return true
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
                    startActivityForResult(fileChooserParams.createIntent(), filePickerRequest)
                    true
                } catch (_: ActivityNotFoundException) {
                    fileCallback = null
                    Toast.makeText(this@MainActivity, "No file picker available", Toast.LENGTH_SHORT).show()
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
                // Never grant geolocation to origins outside the HTTPS MediFinder website.
                if (!isTrustedOrigin(Uri.parse(origin))) {
                    callback.invoke(origin, false, false)
                    return
                }

                // Keep the callback alive across Android's asynchronous permission prompt.
                pendingGeoCallback?.invoke(pendingGeoOrigin, false, false)
                pendingGeoOrigin = origin
                pendingGeoCallback = callback

                if (hasLocationPermission()) {
                    continueGeolocationRequest()
                } else {
                    requestPermissions(
                        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                        locationRequestCode
                    )
                }
            }

            override fun onGeolocationPermissionsHidePrompt() {
                // WebView can hide its prompt while navigating away. Resolve any still-pending
                // request instead of leaving the JavaScript geolocation call hanging forever.
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
        } else if (savedInstanceState == null) webView.loadUrl(homeUrl) else webView.restoreState(savedInstanceState)
    }


    private inner class MFAndroidBridge {
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

        @JavascriptInterface
        fun retryLoad(): Boolean {
            if (!isOurPage()) return false
            runOnUiThread {
                showingOfflinePage = false
                webView.loadUrl(lastHttpUrl.ifBlank { homeUrl })
            }
            return true
        }

        @JavascriptInterface
        fun shareContent(title: String?, text: String?, url: String?): Boolean {
            if (!isOurPage()) return false
            val payload = listOf(text, url).filterNot { it.isNullOrBlank() }.joinToString("\\n")
            if (payload.isBlank()) return false
            runOnUiThread {
                try {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, title?.take(160) ?: "MediFinder India")
                        putExtra(Intent.EXTRA_TEXT, payload)
                    }
                    startActivity(Intent.createChooser(send, "Share with"))
                } catch (_: Exception) {
                    Toast.makeText(this@MainActivity, "Unable to open sharing apps", Toast.LENGTH_SHORT).show()
                }
            }
            return true
        }

        @JavascriptInterface
        fun openUpiPayment(url: String?): Boolean {
            if (!isOurPage() || url.isNullOrBlank()) return false
            val uri = try { Uri.parse(url) } catch (_: Exception) { return false }
            if (uri.scheme != "upi" || uri.host != "pay") return false
            return try {
                val intent = Intent(Intent.ACTION_VIEW, uri)
                if (intent.resolveActivity(packageManager) == null) {
                    Toast.makeText(this@MainActivity, "No UPI app found. Please use the QR Code option.", Toast.LENGTH_LONG).show()
                    false
                } else {
                    runOnUiThread { startActivity(Intent.createChooser(intent, "Pay with UPI")) }
                    true
                }
            } catch (_: Exception) { false }
        }

        @JavascriptInterface
        fun copyText(text: String?): Boolean {
            if (!isOurPage() || text.isNullOrEmpty()) return false
            runOnUiThread {
                try {
                    val clipboard = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    clipboard.setPrimaryClip(android.content.ClipData.newPlainText("MediFinder India", text))
                    Toast.makeText(this@MainActivity, "Copied to clipboard", Toast.LENGTH_SHORT).show()
                } catch (_: Exception) {
                    Toast.makeText(this@MainActivity, "Could not copy text", Toast.LENGTH_SHORT).show()
                }
            }
            return true
        }
    }

    private fun hasLocationPermission(): Boolean {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    private fun continueGeolocationRequest() {
        val origin = pendingGeoOrigin ?: return
        val callback = pendingGeoCallback ?: return
        if (!isTrustedOrigin(Uri.parse(origin)) || !hasLocationPermission()) {
            callback.invoke(origin, false, false)
            pendingGeoCallback = null
            pendingGeoOrigin = null
            return
        }

        val locationManager = getSystemService(LOCATION_SERVICE) as android.location.LocationManager
        val locationEnabled = try {
            locationManager.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) ||
                locationManager.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)
        } catch (_: Exception) {
            false
        }

        if (locationEnabled) {
            callback.invoke(origin, true, false)
            pendingGeoCallback = null
            pendingGeoOrigin = null
        } else {
            android.app.AlertDialog.Builder(this)
                .setTitle("Turn on location")
                .setMessage("MediFinder needs your device location to find nearby services. Turn on Location, then return to the app.")
                .setPositiveButton("Location settings") { _, _ ->
                    try {
                        startActivity(Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS))
                    } catch (_: Exception) {
                        Toast.makeText(this, "Please turn on Location in Settings", Toast.LENGTH_LONG).show()
                    }
                    // Keep the callback until the user returns; onResume will resolve it.
                }
                .setNegativeButton("Not now") { _, _ ->
                    pendingGeoCallback?.invoke(pendingGeoOrigin, false, false)
                    pendingGeoCallback = null
                    pendingGeoOrigin = null
                }
                .setOnCancelListener {
                    pendingGeoCallback?.invoke(pendingGeoOrigin, false, false)
                    pendingGeoCallback = null
                    pendingGeoOrigin = null
                }
                .show()
        }
    }

    override fun onResume() {
        super.onResume()
        // The user may have enabled Location in Android Settings while the web request was waiting.
        if (pendingGeoCallback != null && hasLocationPermission()) {
            continueGeolocationRequest()
        }
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
                if (hasLocationPermission()) {
                    continueGeolocationRequest()
                } else {
                    pendingGeoCallback?.invoke(pendingGeoOrigin, false, false)
                    pendingGeoCallback = null
                    pendingGeoOrigin = null
                    Toast.makeText(this, "Location permission is needed to find nearby services.", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    @Deprecated("Deprecated in Android API but supported for broad device compatibility")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == filePickerRequest) {
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
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        pendingWebPermission?.deny()
        webView.destroy()
        super.onDestroy()
    }
}
