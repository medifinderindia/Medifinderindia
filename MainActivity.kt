package com.medifinder.india

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.view.View
import android.webkit.*
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File

/**
 * Hosts https://medifinderindia.com in a WebView and bridges the web permission prompts
 * (camera, microphone, location, file picker, notifications) to real Android permissions.
 * The site itself is unchanged: this is the same shared web code.
 */
class MainActivity : AppCompatActivity() {

    private val START_URL = "https://medifinderindia.com/"
    private val HOST = "medifinderindia.com"

    private lateinit var web: WebView

    // pending web requests waiting for an Android permission dialog
    private var pendingWebRequest: PermissionRequest? = null
    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var cameraPhotoUri: Uri? = null

    // ---- Android permission launchers -------------------------------------------------
    private val webPermLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val req = pendingWebRequest ?: return@registerForActivityResult
        pendingWebRequest = null
        val granted = mutableListOf<String>()
        for (res in req.resources) {
            when (res) {
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> if (result[Manifest.permission.CAMERA] == true) granted += res
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> if (result[Manifest.permission.RECORD_AUDIO] == true) granted += res
            }
        }
        if (granted.isEmpty()) req.deny() else req.grant(granted.toTypedArray())
    }

    private val geoLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val ok = result[Manifest.permission.ACCESS_FINE_LOCATION] == true || result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        pendingGeoCallback?.invoke(pendingGeoOrigin, ok, false)
        pendingGeoCallback = null; pendingGeoOrigin = null
    }

    private val notifLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* nothing to do */ }

    // camera permission needed before launching the camera for a file input
    private var afterCameraPermission: (() -> Unit)? = null
    private val cameraForPickerLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        val next = afterCameraPermission; afterCameraPermission = null
        next?.invoke() // open the picker either way; without camera permission it just won't offer the camera
    }

    private val chooserLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val cb = fileCallback ?: return@registerForActivityResult
        fileCallback = null
        var result: Array<Uri>? = null
        if (r.resultCode == Activity.RESULT_OK) {
            val data = r.data
            result = when {
                data?.clipData != null -> Array(data.clipData!!.itemCount) { i -> data.clipData!!.getItemAt(i).uri }
                data?.data != null -> arrayOf(data.data!!)
                cameraPhotoUri != null -> arrayOf(cameraPhotoUri!!)   // photo taken with the camera
                else -> null
            }
        }
        cb.onReceiveValue(result)
        cameraPhotoUri = null
    }

    // ---- Profile > "App settings" bridge ------------------------------------------------
    private var pendingBridgePerm: String? = null
    private val bridgeLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val key = pendingBridgePerm; pendingBridgePerm = null
        // Android stops showing the dialog after a refusal: send the user to Settings instead.
        if (key != null && result.values.none { it }) {
            val perms = permsFor(key)
            if (perms.none { shouldShowRequestPermissionRationale(it) }) openAppSettings()
        }
        pushRefresh()
    }

    private fun permsFor(key: String): List<String> = when (key) {
        "location" -> listOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        "camera" -> listOf(Manifest.permission.CAMERA)
        "microphone" -> listOf(Manifest.permission.RECORD_AUDIO)
        "notifications" -> if (Build.VERSION.SDK_INT >= 33) listOf(Manifest.permission.POST_NOTIFICATIONS) else emptyList()
        else -> emptyList()
    }

    private fun openAppSettings() {
        startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun pushRefresh() = runOnUiThread { web.evaluateJavascript("window.MFApp&&window.MFApp.refresh&&window.MFApp.refresh()", null) }

    /** Exposed to the page as window.MFAndroid. Only status / request / open-settings, no data access. */
    inner class Bridge {
        @JavascriptInterface
        fun status(): String {
            val o = JSONObject()
            fun g(ok: Boolean) = if (ok) "granted" else "denied"
            o.put("notifications", g(NotificationManagerCompat.from(this@MainActivity).areNotificationsEnabled()))
            o.put("location", g(has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION)))
            o.put("camera", g(has(Manifest.permission.CAMERA)))
            o.put("microphone", g(has(Manifest.permission.RECORD_AUDIO)))
            return o.toString()
        }

        @JavascriptInterface
        fun request(key: String) = runOnUiThread {
            val perms = permsFor(key)
            val granted = if (key == "notifications") NotificationManagerCompat.from(this@MainActivity).areNotificationsEnabled()
                          else perms.isNotEmpty() && perms.any { has(it) }
            when {
                granted -> openAppSettings()                       // already on: lets the user switch it off
                perms.isEmpty() -> openAppSettings()               // Android 12 and below: notifications are a Settings toggle
                else -> { pendingBridgePerm = key; bridgeLauncher.launch(perms.toTypedArray()) }
            }
        }

        @JavascriptInterface
        fun openSettings() = runOnUiThread { openAppSettings() }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)

        // Ask for notifications once on Android 13+ (the site's own prompt is also kept)
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false      // needed for camera / mic streams
            allowFileAccess = false
            allowContentAccess = true                      // content:// uris returned by the picker
            setGeolocationEnabled(true)
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT           // reuse cached CSS/JS/images between launches
            textZoom = 100                                 // phone font-size setting must not reflow the layout
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }
        // Smoother scrolling and no stretch glow at the edges
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.isVerticalScrollBarEnabled = false
        WebView.setWebContentsDebuggingEnabled(false)
        // The shared web code recognises the APK from this token and from window.MFAndroid.
        web.settings.userAgentString = web.settings.userAgentString + " MediFinderApp/1.0"
        web.addJavascriptInterface(Bridge(), "MFAndroid")
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest): Boolean {
                val u = req.url
                val scheme = u.scheme ?: return false
                // phone / mail / maps / WhatsApp links open the right app
                if (scheme in listOf("tel", "mailto", "sms", "geo", "intent", "whatsapp", "upi")) {
                    return try { startActivity(Intent(Intent.ACTION_VIEW, u)); true } catch (e: Exception) { true }
                }
                // keep our own site inside the app; open other sites (payment, Google sign-in
                // pages are allowed to stay in the WebView) in the browser
                val host = u.host ?: return false
                val inside = host == HOST || host.endsWith(".$HOST") || host.endsWith(".supabase.co") ||
                    host.endsWith("google.com") || host.endsWith("razorpay.com") || host.endsWith("openstreetmap.org")
                if (!inside) { startActivity(Intent(Intent.ACTION_VIEW, u)); return true }
                return false
            }
        }

        web.webChromeClient = object : WebChromeClient() {

            // getUserMedia: camera and microphone
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val need = mutableListOf<String>()
                    for (r in request.resources) {
                        if (r == PermissionRequest.RESOURCE_VIDEO_CAPTURE && !has(Manifest.permission.CAMERA)) need += Manifest.permission.CAMERA
                        if (r == PermissionRequest.RESOURCE_AUDIO_CAPTURE && !has(Manifest.permission.RECORD_AUDIO)) need += Manifest.permission.RECORD_AUDIO
                    }
                    if (need.isEmpty()) {
                        request.grant(request.resources.filter {
                            it == PermissionRequest.RESOURCE_VIDEO_CAPTURE || it == PermissionRequest.RESOURCE_AUDIO_CAPTURE
                        }.toTypedArray())
                    } else {
                        pendingWebRequest = request
                        webPermLauncher.launch(need.toTypedArray())
                    }
                }
            }

            // navigator.geolocation
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                if (has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                    callback.invoke(origin, true, false)
                } else {
                    pendingGeoOrigin = origin; pendingGeoCallback = callback
                    geoLauncher.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                }
            }

            // <input type="file"> (gallery, documents, "folder") and camera capture
            override fun onShowFileChooser(w: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = cb
                val open = {
                    val intents = mutableListOf<Intent>()
                    val wantsCamera = params.isCaptureEnabled || params.acceptTypes.any { it.startsWith("image") || it.isEmpty() }
                    if (wantsCamera && has(Manifest.permission.CAMERA)) cameraIntent()?.let { intents += it }
                    val pick = Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        val types = params.acceptTypes.filter { it.isNotBlank() }
                        type = if (types.size == 1) types[0] else "*/*"
                        if (types.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                    }
                    val chooser = Intent(Intent.ACTION_CHOOSER).apply {
                        putExtra(Intent.EXTRA_INTENT, pick)
                        putExtra(Intent.EXTRA_TITLE, "Choose a file")
                        if (intents.isNotEmpty()) putExtra(Intent.EXTRA_INITIAL_INTENTS, intents.toTypedArray())
                    }
                    try { chooserLauncher.launch(chooser) } catch (e: Exception) { fileCallback = null; cb.onReceiveValue(null) }
                }
                if (!has(Manifest.permission.CAMERA)) { afterCameraPermission = open; cameraForPickerLauncher.launch(Manifest.permission.CAMERA) } else open()
                return true
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) { pendingWebRequest = null }
        }

        // Downloads: receipts, PDFs
        web.setDownloadListener { url, ua, cd, mime, _ ->
            if (url.startsWith("http")) {
                val r = DownloadManager.Request(Uri.parse(url)).apply {
                    setMimeType(mime)
                    addRequestHeader("User-Agent", ua)
                    addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, cd, mime))
                }
                (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(r)
            }
        }

        if (savedInstanceState == null) web.loadUrl(START_URL) else web.restoreState(savedInstanceState)
    }

    private fun has(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED

    private fun cameraIntent(): Intent? {
        return try {
            val dir = File(cacheDir, "camera").apply { mkdirs() }
            val f = File.createTempFile("photo_", ".jpg", dir)
            cameraPhotoUri = FileProvider.getUriForFile(this, "$packageName.fileprovider", f)
            Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, cameraPhotoUri)
                addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            }
        } catch (e: Exception) { null }
    }

    override fun onResume() { super.onResume(); if (::web.isInitialized) pushRefresh() }

    @Deprecated("kept for simple back handling")
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() else super.onBackPressed() }

    override fun onSaveInstanceState(out: Bundle) { super.onSaveInstanceState(out); web.saveState(out) }
}
