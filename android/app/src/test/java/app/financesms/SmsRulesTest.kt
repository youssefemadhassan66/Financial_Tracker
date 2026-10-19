package app.financesms

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

class SmsRulesTest {

    @Test
    fun `sender list is trimmed, split on commas and de-duplicated`() {
        assertEquals(listOf("CIB", "TEST BANK"), SmsRules.parseSenderList(" CIB, TEST BANK ,, cib "))
    }

    @Test
    fun `only bank senders match, ignoring case`() {
        val banks = listOf("CIB")
        assertTrue(SmsRules.isBankSender("CIB", banks))
        assertTrue(SmsRules.isBankSender("cibeg", banks))
        assertFalse(SmsRules.isBankSender("+201000000000", banks))
        assertFalse(SmsRules.isBankSender("", banks))
    }

    @Test
    fun `an empty sender list forwards nothing`() {
        assertFalse(SmsRules.isBankSender("CIB", emptyList()))
        assertFalse(SmsRules.isBankSender("CIB", listOf(" ")))
    }

    @Test
    fun `received time keeps the time zone offset`() {
        val cairo = ZoneId.of("Africa/Cairo")
        // 2026-09-30 11:05 UTC = 14:05 in Cairo summer time (+03:00).
        assertEquals("2026-09-30T14:05:00+03:00", SmsRules.isoWithOffset(1790766300000, cairo))
        // A winter date uses +02:00.
        assertEquals("2026-01-15T12:00:00+02:00", SmsRules.isoWithOffset(1768471200000, cairo))
    }

    @Test
    fun `server address is cleaned or refused`() {
        assertEquals("http://192.168.1.20:3001", SmsRules.normalizeServerUrl(" 192.168.1.20:3001/ "))
        assertEquals("https://finance.example.com", SmsRules.normalizeServerUrl("https://finance.example.com"))
        assertNull(SmsRules.normalizeServerUrl(""))
        assertNull(SmsRules.normalizeServerUrl("ftp://example.com"))
        assertNull(SmsRules.normalizeServerUrl("http://"))
        assertNull(SmsRules.normalizeServerUrl("http://exa mple.com"))
    }

    @Test
    fun `ingest url and origin`() {
        assertEquals("http://192.168.1.20:3001/api/ingest/sms", SmsRules.ingestUrl("http://192.168.1.20:3001/"))
        assertEquals("http://192.168.1.20:3001", SmsRules.originOf("http://192.168.1.20:3001/dashboard?x=1"))
        assertEquals("https://a.example.com", SmsRules.originOf("HTTPS://A.example.com/x"))
        assertNull(SmsRules.originOf("javascript:alert(1)"))
    }

    @Test
    fun `server answers decide what happens to the message`() {
        assertEquals(SmsRules.Outcome.DELIVERED, SmsRules.classify(201))
        assertEquals(SmsRules.Outcome.DELIVERED, SmsRules.classify(200)) // duplicate
        assertEquals(SmsRules.Outcome.KEY_REJECTED, SmsRules.classify(401))
        assertEquals(SmsRules.Outcome.DROP, SmsRules.classify(400))
        assertEquals(SmsRules.Outcome.RETRY, SmsRules.classify(429))
        assertEquals(SmsRules.Outcome.RETRY, SmsRules.classify(503))
    }

    @Test
    fun `json body escapes quotes, backslashes and line breaks`() {
        val json = SmsRules.jsonBody("TEST BANK", "Paid \"EGP 10.00\"\nat TEST\\SHOP", "2026-09-30T14:05:00+03:00")
        assertEquals(
            "{\"sender\":\"TEST BANK\",\"body\":\"Paid \\\"EGP 10.00\\\"\\nat TEST\\\\SHOP\",\"receivedAt\":\"2026-09-30T14:05:00+03:00\"}",
            json,
        )
        assertEquals("\"a\\u0001b\"", SmsRules.jsonString("a" + 1.toChar() + "b"))
    }
}
