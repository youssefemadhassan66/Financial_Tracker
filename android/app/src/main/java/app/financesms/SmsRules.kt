package app.financesms

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Plain rules with no Android types, so they run in fast JVM unit tests.
 */
object SmsRules {

    /** Backend limits (API.md section 11). */
    const val MAX_SENDER = 64
    const val MAX_BODY = 2000

    /** "CIB, NBE ,  banque misr" -> ["CIB", "NBE", "banque misr"] */
    fun parseSenderList(text: String): List<String> =
        text.split(',', '\n').map { it.trim() }.filter { it.isNotEmpty() }.distinctBy { it.lowercase() }

    /**
     * Only SMS from the user's banks leave the phone. A sender matches when it
     * contains one of the names, ignoring case ("CIB" matches "CIB" and "CIBEG").
     * An empty list matches nothing: forwarding every SMS is never the default.
     */
    fun isBankSender(sender: String, banks: List<String>): Boolean {
        val s = sender.trim().lowercase()
        if (s.isEmpty()) return false
        return banks.any { it.isNotBlank() && s.contains(it.trim().lowercase()) }
    }

    /**
     * When the SMS arrived. The network's own timestamp is the best guess of
     * when the bank sent it, but some networks (and the emulator) stamp SMS in
     * the future, which the server refuses. Then the phone's clock wins.
     */
    fun receivedAtMillis(networkMillis: Long, phoneNowMillis: Long): Long =
        if (networkMillis <= 0 || networkMillis > phoneNowMillis) phoneNowMillis else networkMillis

    /** 1760000000000 -> "2025-10-09T11:53:20+03:00" in the phone's time zone. */
    fun isoWithOffset(epochMillis: Long, zone: ZoneId = ZoneId.systemDefault()): String =
        DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(
            Instant.ofEpochMilli(epochMillis).atZone(zone).toOffsetDateTime().withNano(0),
        )

    /**
     * Cleans what the user typed as the server address. Adds http:// when no
     * scheme is given and drops trailing slashes. Returns null when it is not
     * an http(s) address with a host.
     */
    fun normalizeServerUrl(input: String): String? {
        var url = input.trim()
        if (url.isEmpty()) return null
        if (!url.contains("://")) url = "http://$url"
        url = url.trimEnd('/')
        val match = Regex("^(https?)://([^/\\s?#]+)(/[^\\s?#]*)?$", RegexOption.IGNORE_CASE).matchEntire(url)
            ?: return null
        val host = match.groupValues[2]
        if (host.startsWith(":") || host.isEmpty()) return null
        return url
    }

    fun ingestUrl(serverUrl: String): String = "${serverUrl.trimEnd('/')}/api/ingest/sms"

    /** "http://192.168.1.20:3001/x" -> "http://192.168.1.20:3001" */
    fun originOf(url: String): String? {
        val match = Regex("^(https?://[^/?#]+)", RegexOption.IGNORE_CASE).find(url) ?: return null
        return match.groupValues[1].lowercase()
    }

    enum class Outcome { DELIVERED, RETRY, DROP, KEY_REJECTED }

    /** What to do after the server answered a forwarded SMS. */
    fun classify(httpStatus: Int): Outcome = when (httpStatus) {
        200, 201 -> Outcome.DELIVERED // 200 = duplicate, also done
        401, 403 -> Outcome.KEY_REJECTED // revoked or wrong key: retrying can't help
        408, 425, 429 -> Outcome.RETRY
        in 400..499 -> Outcome.DROP // the message itself was refused; retrying sends the same thing
        else -> Outcome.RETRY // 5xx, or anything unexpected
    }

    fun jsonBody(sender: String, body: String, receivedAt: String): String =
        "{\"sender\":${jsonString(sender)},\"body\":${jsonString(body)},\"receivedAt\":${jsonString(receivedAt)}}"

    fun jsonString(value: String): String {
        val out = StringBuilder(value.length + 2).append('"')
        for (c in value) {
            when (c) {
                '"' -> out.append("\\\"")
                '\\' -> out.append("\\\\")
                '\n' -> out.append("\\n")
                '\r' -> out.append("\\r")
                '\t' -> out.append("\\t")
                else -> if (c.code < 0x20) out.append(String.format("\\u%04x", c.code)) else out.append(c)
            }
        }
        return out.append('"').toString()
    }
}
