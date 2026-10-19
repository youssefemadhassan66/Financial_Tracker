package app.financesms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * Called by Android for every incoming SMS. Long messages arrive in parts,
 * which are joined per sender. Only SMS from the user's bank senders are
 * queued; everything else is ignored and never leaves the phone.
 */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val banks = Settings(context).bankSenders
        val now = System.currentTimeMillis()

        parts.filterNotNull()
            .groupBy { it.originatingAddress.orEmpty() }
            .forEach { (sender, messages) ->
                if (!SmsRules.isBankSender(sender, banks)) return@forEach
                val body = messages.joinToString("") { it.messageBody.orEmpty() }
                val receivedAt = SmsRules.isoWithOffset(SmsRules.receivedAtMillis(messages.first().timestampMillis, now))
                SmsQueue.enqueue(context, sender.take(SmsRules.MAX_SENDER), body, receivedAt)
            }
    }
}
