package app.financesms

import android.content.Context
import android.provider.Telephony

/**
 * Queues bank SMS already in the phone's inbox, so history from before the
 * app was installed reaches the server too. Duplicates are ignored there.
 */
object InboxImport {
    fun queueRecent(context: Context, days: Int): Int {
        val banks = Settings(context).bankSenders
        if (banks.isEmpty()) return 0
        val since = System.currentTimeMillis() - days * 24L * 60 * 60 * 1000
        var queued = 0
        context.contentResolver.query(
            Telephony.Sms.Inbox.CONTENT_URI,
            arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
            "${Telephony.Sms.DATE} >= ?",
            arrayOf(since.toString()),
            "${Telephony.Sms.DATE} ASC",
        )?.use { cursor ->
            val address = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
            val body = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
            val date = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
            while (cursor.moveToNext()) {
                val sender = cursor.getString(address).orEmpty()
                if (!SmsRules.isBankSender(sender, banks)) continue
                SmsQueue.enqueue(
                    context,
                    sender.take(SmsRules.MAX_SENDER),
                    cursor.getString(body).orEmpty(),
                    SmsRules.isoWithOffset(cursor.getLong(date)),
                )
                queued++
            }
        }
        return queued
    }
}
