package com.medifinderindia.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
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

class MainActivity : Activity() {
    private lateinit var webView: WebView
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
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.javaScriptCanOpenWindowsAutomatically = false
        webView.settings.setGeolocationEnabled(true)
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
                val granted = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                    checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                pendingGeoCallback?.invoke(pendingGeoOrigin, granted, false)
                pendingGeoCallback = null
                pendingGeoOrigin = null
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
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        fileCallback?.onReceiveValue(null)
        pendingWebPermission?.deny()
        webView.destroy()
        super.onDestroy()
    }
}
