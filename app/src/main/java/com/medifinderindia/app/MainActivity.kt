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
        webView.webViewClient = object : WebViewClient() {
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
        if (savedInstanceState == null) webView.loadUrl(homeUrl) else webView.restoreState(savedInstanceState)
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
