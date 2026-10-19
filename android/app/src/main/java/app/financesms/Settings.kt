package app.financesms

import android.content.Context
import android.content.SharedPreferences

/** Everything the user set in Phone setup. Only the device key is secret, and it is stored encrypted. */
class Settings(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("finance", Context.MODE_PRIVATE)

    var serverUrl: String?
        get() = prefs.getString(KEY_SERVER, null)
        set(value) = prefs.edit().putString(KEY_SERVER, value).apply()

    var bankSenders: List<String>
        get() = SmsRules.parseSenderList(prefs.getString(KEY_SENDERS, DEFAULT_SENDERS) ?: "")
        set(value) = prefs.edit().putString(KEY_SENDERS, value.joinToString(", ")).apply()

    val hasDeviceKey: Boolean get() = prefs.contains(KEY_DEVICE_KEY)

    fun deviceKey(): String? = prefs.getString(KEY_DEVICE_KEY, null)?.let { SecretStore.decrypt(it) }

    fun saveDeviceKey(key: String) {
        prefs.edit().putString(KEY_DEVICE_KEY, SecretStore.encrypt(key.trim())).remove(KEY_KEY_REJECTED).apply()
    }

    fun clearDeviceKey() = prefs.edit().remove(KEY_DEVICE_KEY).apply()

    /** Set when the server refused the key (revoked): shown in Phone setup. */
    var keyRejected: Boolean
        get() = prefs.getBoolean(KEY_KEY_REJECTED, false)
        set(value) = prefs.edit().putBoolean(KEY_KEY_REJECTED, value).apply()

    var lastSentAt: Long
        get() = prefs.getLong(KEY_LAST_SENT, 0L)
        set(value) = prefs.edit().putLong(KEY_LAST_SENT, value).apply()

    var lastProblem: String?
        get() = prefs.getString(KEY_LAST_PROBLEM, null)
        set(value) = prefs.edit().putString(KEY_LAST_PROBLEM, value).apply()

    companion object {
        const val DEFAULT_SENDERS = "CIB"
        private const val KEY_SERVER = "server_url"
        private const val KEY_SENDERS = "bank_senders"
        private const val KEY_DEVICE_KEY = "device_key_enc"
        private const val KEY_KEY_REJECTED = "device_key_rejected"
        private const val KEY_LAST_SENT = "last_sent_at"
        private const val KEY_LAST_PROBLEM = "last_problem"
    }
}
