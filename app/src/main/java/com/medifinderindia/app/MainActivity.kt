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

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.javaScriptCanOpenWindowsAutomatically = false
        webView.settings.setGeolocationEnabled(true)
        webView.addJavascriptInterface(MFAndroidBridge(), "MFAndroid")
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
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
                if (!isTrustedOrigin(Uri.parse(origin))) {
                    callback.invoke(origin, false, false)
                    return
                }
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                    checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false)
                } else {
                    pendingGeoOrigin = origin
                    pendingGeoCallback = callback
                    requestPermissions(
                        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                        locationRequestCode
                    )
                }
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
            // Only allow the project's own Supabase authorize endpoint. Do not reject
            // the URL based on redirect_to text: Android Uri decoding can normalize
            // custom-scheme redirects differently, which previously made the bridge
            // return false before the browser was opened.
            return try {
                runOnUiThread {
                    try {
                        CustomTabsIntent.Builder().build().launchUrl(this@MainActivity, u)
                    } catch (_: Exception) {
                        try {
                            startActivity(Intent(Intent.ACTION_VIEW, u))
                        } catch (_: Exception) {
                            Toast.makeText(this@MainActivity, "No browser available for Google sign-in.", Toast.LENGTH_LONG).show()
                        }
                    }
                }
                true
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun consumeOAuthResult(): String {
            if (!isOurPage()) return ""
            val result = pendingOAuthJson
            pendingOAuthJson = null
            return result ?: ""
        }
    }

    private fun isOurPage(): Boolean {
        val host = try { Uri.parse(webView.url ?: "").host } catch (_: Exception) { null }
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
                val granted = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                    checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                pendingGeoCallback?.invoke(pendingGeoOrigin, granted, false)
                pendingGeoCallback = null
                pendingGeoOrigin = null
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
