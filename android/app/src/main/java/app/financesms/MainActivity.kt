package app.financesms

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/**
 * The Finance web app, full screen. Only pages from the server set in Phone
 * setup open here; any other link opens in the phone's browser.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var settings: Settings
    private lateinit var webView: WebView
    private lateinit var swipe: SwipeRefreshLayout
    private lateinit var errorView: View
    private var loadedServer: String? = null
    private var sentToFirstSetup = false

    /** True only while a page from the configured server is shown (checked by the JS bridge). */
    @Volatile private var trustedPage = false

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val pickFile = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        fileCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        settings = Settings(this)

        val root = findViewById<View>(R.id.root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        webView = findViewById(R.id.web)
        swipe = findViewById(R.id.swipe)
        errorView = findViewById(R.id.error)

        CookieManager.getInstance().setAcceptCookie(true)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            setSupportZoom(false)
            userAgentString = "$userAgentString FinanceAndroid/${BuildConfig.VERSION_NAME}"
        }
        webView.addJavascriptInterface(Bridge(), "FinanceAndroid")
        webView.webViewClient = Client()
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    pickFile.launch(params.createIntent())
                    true
                } catch (_: ActivityNotFoundException) {
                    fileCallback = null
                    false
                }
            }
        }

        swipe.setColorSchemeColors(getColor(R.color.brand))
        swipe.setOnChildScrollUpCallback { _, _ -> webView.scrollY > 0 }
        swipe.setOnRefreshListener { webView.reload() }

        findViewById<Button>(R.id.retry).setOnClickListener { load(force = true) }
        findViewById<Button>(R.id.open_setup).setOnClickListener { openSetup() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        SmsQueue.schedulePeriodic(this)
    }

    override fun onResume() {
        super.onResume()
        if (settings.serverUrl == null) {
            // First run sends the user to Phone setup. Coming back still
            // without an address means they backed out: close instead of looping.
            if (sentToFirstSetup) finish() else {
                sentToFirstSetup = true
                openSetup()
            }
            return
        }
        load(force = false)
        if (SmsQueue.waitingCount(this) > 0) SmsQueue.flushNow(this)
    }

    private fun load(force: Boolean) {
        val server = settings.serverUrl ?: return
        if (!force && server == loadedServer) return
        loadedServer = server
        errorView.visibility = View.GONE
        webView.visibility = View.VISIBLE
        webView.loadUrl("$server/dashboard")
    }

    private fun openSetup() = startActivity(Intent(this, SetupActivity::class.java))

    private fun isOwnPage(url: String?): Boolean {
        val server = settings.serverUrl ?: return false
        return url != null && SmsRules.originOf(url) == SmsRules.originOf(server)
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            if (isOwnPage(url)) return false
            try {
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
            } catch (_: ActivityNotFoundException) {
                // nothing can open it; stay on the page
            }
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            trustedPage = isOwnPage(url)
        }

        override fun onPageFinished(view: WebView, url: String?) {
            swipe.isRefreshing = false
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            swipe.isRefreshing = false
            loadedServer = null
            val server = settings.serverUrl.orEmpty()
            findViewById<TextView>(R.id.error_detail).text = getString(R.string.error_detail, server)
            webView.visibility = View.GONE
            errorView.visibility = View.VISIBLE
        }
    }

    /** Called from the Finance web app (Settings > Connect a phone). */
    private inner class Bridge {
        @JavascriptInterface
        fun isApp(): Boolean = true

        @JavascriptInterface
        fun hasDeviceKey(): Boolean = trustedPage && settings.hasDeviceKey && !settings.keyRejected

        /** Stores a new device key, encrypted. The web page never keeps it. */
        @JavascriptInterface
        fun saveDeviceKey(key: String): Boolean {
            if (!trustedPage || key.isBlank() || key.length > 512) return false
            settings.saveDeviceKey(key)
            SmsQueue.flushNow(applicationContext)
            return true
        }

        @JavascriptInterface
        fun openPhoneSetup() {
            if (trustedPage) runOnUiThread { openSetup() }
        }
    }
}
