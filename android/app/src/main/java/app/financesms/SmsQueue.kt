package app.financesms

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.TimeUnit

/** One bank SMS waiting to reach the server. */
data class PendingSms(val id: String, val sender: String, val body: String, val receivedAt: String)

/**
 * Bank SMS waiting to be sent, saved in the app's private storage so they
 * survive the phone being away from home Wi-Fi, the PC being off, or a reboot.
 */
class PendingStore(context: Context, fileName: String = "pending-sms.json") {
    private val file = File(context.applicationContext.filesDir, fileName)

    fun add(sender: String, body: String, receivedAt: String) = synchronized(LOCK) {
        write(read() + PendingSms(UUID.randomUUID().toString(), sender, body, receivedAt))
    }

    fun addAll(items: List<PendingSms>) = synchronized(LOCK) { write(read() + items) }

    /** Removes and returns everything (used to move skipped messages back to the queue). */
    fun takeAll(): List<PendingSms> = synchronized(LOCK) { read().also { write(emptyList()) } }

    fun first(): PendingSms? = synchronized(LOCK) { read().firstOrNull() }

    fun remove(id: String) = synchronized(LOCK) { write(read().filterNot { it.id == id }) }

    fun count(): Int = synchronized(LOCK) { read().size }

    private fun read(): List<PendingSms> {
        if (!file.exists()) return emptyList()
        return try {
            val array = JSONArray(file.readText())
            (0 until array.length()).map { i ->
                val o = array.getJSONObject(i)
                PendingSms(o.getString("id"), o.getString("sender"), o.getString("body"), o.getString("receivedAt"))
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun write(items: List<PendingSms>) {
        val array = JSONArray()
        items.forEach {
            array.put(JSONObject().put("id", it.id).put("sender", it.sender).put("body", it.body).put("receivedAt", it.receivedAt))
        }
        // Write then rename, so a crash mid-write never loses the queue.
        val tmp = File(file.parentFile, "${file.name}.tmp")
        tmp.writeText(array.toString())
        if (!tmp.renameTo(file)) {
            file.delete()
            tmp.renameTo(file)
        }
    }

    companion object {
        private val LOCK = Any()
    }
}

object SmsQueue {
    private const val FLUSH_NOW = "sms-flush"
    private const val FLUSH_PERIODIC = "sms-flush-periodic"

    fun enqueue(context: Context, sender: String, body: String, receivedAt: String) {
        PendingStore(context).add(sender, body, receivedAt)
        flushNow(context)
    }

    /** Try to send everything waiting, right away (replaces a delayed retry). */
    fun flushNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<FlushWorker>()
            .setConstraints(networkConstraint())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(FLUSH_NOW, ExistingWorkPolicy.REPLACE, request)
    }

    /** A safety net: every 15 minutes (Android's minimum), whatever is waiting is retried. */
    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<FlushWorker>(15, TimeUnit.MINUTES)
            .setConstraints(networkConstraint())
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(FLUSH_PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    fun waitingCount(context: Context): Int = PendingStore(context).count()

    /**
     * Messages the server refused are never deleted: they wait here, and the
     * user can send them again from Phone setup (for example after a fix).
     */
    fun skipped(context: Context) = PendingStore(context, "skipped-sms.json")

    fun retrySkipped(context: Context): Int {
        val items = skipped(context).takeAll()
        if (items.isNotEmpty()) {
            PendingStore(context).addAll(items)
            flushNow(context)
        }
        return items.size
    }

    private fun networkConstraint() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
}

class FlushWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val settings = Settings(applicationContext)
        val store = PendingStore(applicationContext)
        val server = settings.serverUrl ?: return Result.success() // not set up: the periodic run tries later
        val key = settings.deviceKey() ?: return Result.success()

        while (true) {
            val sms = store.first() ?: return Result.success()
            val status = try {
                post(SmsRules.ingestUrl(server), key, SmsRules.jsonBody(sms.sender, sms.body, sms.receivedAt))
            } catch (_: IOException) {
                settings.lastProblem = "Can't reach ${SmsRules.originOf(server) ?: server}. Will retry."
                return Result.retry()
            }
            when (SmsRules.classify(status)) {
                SmsRules.Outcome.DELIVERED -> {
                    store.remove(sms.id)
                    settings.lastSentAt = System.currentTimeMillis()
                    settings.lastProblem = null
                    settings.keyRejected = false
                }
                SmsRules.Outcome.DROP -> {
                    // Kept, not lost: Phone setup can send skipped messages again.
                    SmsQueue.skipped(applicationContext).addAll(listOf(sms))
                    store.remove(sms.id)
                    settings.lastProblem = "The server refused one message (HTTP $status). It was set aside; you can try it again."
                }
                SmsRules.Outcome.KEY_REJECTED -> {
                    // Messages stay queued until a new key is saved in Phone setup.
                    settings.keyRejected = true
                    settings.lastProblem = "The server refused this phone's key. Add a new key in Phone setup."
                    return Result.success()
                }
                SmsRules.Outcome.RETRY -> {
                    settings.lastProblem = "The server had a problem (HTTP $status). Will retry."
                    return Result.retry()
                }
            }
        }
    }

    private fun post(url: String, deviceKey: String, json: String): Int {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 15_000
            connection.readTimeout = 20_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.setRequestProperty("X-Device-Key", deviceKey)
            connection.outputStream.use { it.write(json.toByteArray(Charsets.UTF_8)) }
            return connection.responseCode
        } finally {
            connection.disconnect()
        }
    }
}
