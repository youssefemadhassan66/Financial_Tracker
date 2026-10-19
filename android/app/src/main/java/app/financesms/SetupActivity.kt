package app.financesms

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings as AndroidSettings
import android.text.format.DateUtils
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/** Server address, phone key, bank senders, SMS permission and queue status. */
class SetupActivity : AppCompatActivity() {
    private lateinit var settings: Settings
    private lateinit var serverInput: TextInputEditText
    private lateinit var serverLayout: TextInputLayout
    private lateinit var sendersInput: TextInputEditText
    private lateinit var keyInput: TextInputEditText

    private val askSms = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { refresh() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_setup)
        settings = Settings(this)
        setSupportActionBar(findViewById(R.id.toolbar))
        supportActionBar?.setDisplayHomeAsUpEnabled(settings.serverUrl != null)

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.setup_root)) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        serverLayout = findViewById(R.id.server_layout)
        serverInput = findViewById(R.id.server)
        sendersInput = findViewById(R.id.senders)
        keyInput = findViewById(R.id.key)

        serverInput.setText(settings.serverUrl ?: "")
        sendersInput.setText(settings.bankSenders.joinToString(", "))

        findViewById<Button>(R.id.test_server).setOnClickListener { testServer() }
        findViewById<Button>(R.id.save_key).setOnClickListener { saveKey() }
        findViewById<Button>(R.id.remove_key).setOnClickListener {
            settings.clearDeviceKey()
            refresh()
        }
        findViewById<Button>(R.id.allow_sms).setOnClickListener { requestSms() }
        findViewById<Button>(R.id.app_settings).setOnClickListener {
            startActivity(Intent(AndroidSettings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
        }
        findViewById<Button>(R.id.send_now).setOnClickListener {
            SmsQueue.flushNow(this)
            Toast.makeText(this, R.string.sending, Toast.LENGTH_SHORT).show()
        }
        findViewById<Button>(R.id.retry_skipped).setOnClickListener {
            SmsQueue.retrySkipped(this)
            Toast.makeText(this, R.string.sending, Toast.LENGTH_SHORT).show()
            refresh()
        }
        findViewById<Button>(R.id.import_inbox).setOnClickListener { importInbox() }
        findViewById<Button>(R.id.done).setOnClickListener { if (saveForm()) finish() }
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    override fun onSupportNavigateUp(): Boolean {
        if (saveForm()) finish()
        return true
    }

    private fun saveForm(): Boolean {
        val url = SmsRules.normalizeServerUrl(serverInput.text?.toString().orEmpty())
        if (url == null) {
            serverLayout.error = getString(R.string.server_invalid)
            return false
        }
        serverLayout.error = null
        settings.serverUrl = url
        settings.bankSenders = SmsRules.parseSenderList(sendersInput.text?.toString().orEmpty())
        SmsQueue.flushNow(this)
        return true
    }

    private fun testServer() {
        val url = SmsRules.normalizeServerUrl(serverInput.text?.toString().orEmpty())
        if (url == null) {
            serverLayout.error = getString(R.string.server_invalid)
            return
        }
        serverLayout.error = null
        serverLayout.helperText = getString(R.string.server_testing)
        thread {
            val ok = try {
                val c = URL("$url/login").openConnection() as HttpURLConnection
                c.connectTimeout = 8_000
                c.readTimeout = 8_000
                val code = c.responseCode
                c.disconnect()
                code in 200..499
            } catch (_: Exception) {
                false
            }
            runOnUiThread {
                serverLayout.helperText = getString(if (ok) R.string.server_ok else R.string.server_fail)
            }
        }
    }

    private fun saveKey() {
        val key = keyInput.text?.toString()?.trim().orEmpty()
        if (key.isEmpty()) return
        settings.saveDeviceKey(key)
        keyInput.setText("")
        SmsQueue.flushNow(this)
        refresh()
    }

    private fun hasSmsPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED

    private fun requestSms() {
        askSms.launch(arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS))
    }

    private fun importInbox() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            requestSms()
            return
        }
        if (!saveForm()) return
        thread {
            val n = InboxImport.queueRecent(this, 30)
            runOnUiThread {
                Toast.makeText(this, resources.getQuantityString(R.plurals.imported, n, n), Toast.LENGTH_LONG).show()
                refresh()
            }
        }
    }

    private fun refresh() {
        val keyStatus = findViewById<TextView>(R.id.key_status)
        keyStatus.text = getString(
            when {
                !settings.hasDeviceKey -> R.string.key_missing
                settings.keyRejected -> R.string.key_rejected
                else -> R.string.key_saved
            },
        )
        findViewById<View>(R.id.remove_key).visibility = if (settings.hasDeviceKey) View.VISIBLE else View.GONE

        val smsOk = hasSmsPermission()
        findViewById<TextView>(R.id.sms_status).text = getString(if (smsOk) R.string.sms_allowed else R.string.sms_not_allowed)
        findViewById<View>(R.id.allow_sms).visibility = if (smsOk) View.GONE else View.VISIBLE
        findViewById<View>(R.id.restricted_help).visibility = if (smsOk) View.GONE else View.VISIBLE

        val waiting = SmsQueue.waitingCount(this)
        val skipped = SmsQueue.skipped(this).count()
        val last = settings.lastSentAt
        val lines = mutableListOf(resources.getQuantityString(R.plurals.waiting, waiting, waiting))
        if (skipped > 0) lines += resources.getQuantityString(R.plurals.skipped, skipped, skipped)
        findViewById<View>(R.id.retry_skipped).visibility = if (skipped > 0) View.VISIBLE else View.GONE
        lines += if (last > 0) {
            getString(R.string.last_sent, DateUtils.getRelativeTimeSpanString(last).toString())
        } else {
            getString(R.string.never_sent)
        }
        settings.lastProblem?.let { lines += it }
        findViewById<TextView>(R.id.queue_status).text = lines.joinToString("\n")
    }
}
