package com.melka.relay

import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * قرارداد رمزنگاری رلهٔ ملکا — عین سرور (src/lib/melk-api/relay.ts)
 *
 * امضای درخواست گوشی → سرور:  "METHOD\npath\nsha256(body)\nts"
 * امضای دوجهتهٔ آیتم صف:      "RELAY\nid\nmethod\nurl\nsha256(body)\nts"
 * الگوریتم: HMAC-SHA256 · خروجی هگز کوچک · پنجرهٔ زمانی ±۵ دقیقه (ts میلی‌ثانیه)
 */
object HmacSigner {

    fun sha256Hex(text: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(text.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    fun hmacSha256Hex(secret: String, message: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return mac.doFinal(message.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    /** امضای درخواست گوشی → سرور (poll/result) */
    fun requestSignature(
        secret: String, method: String, path: String, bodyText: String, tsMs: String
    ): String = hmacSha256Hex(secret, "$method\n$path\n${sha256Hex(bodyText)}\n$tsMs")

    /** امضای دوجهتهٔ سرور → گوشی (آیتم صف) — پیش از اجرا وارسی می‌شود */
    fun itemSignature(
        secret: String, id: String, method: String, url: String, body: String, tsMs: String
    ): String = hmacSha256Hex(secret, "RELAY\n$id\n$method\n$url\n${sha256Hex(body)}\n$tsMs")

    /** مقایسهٔ زمان-ثابت (بدون نشت بایت) */
    fun constantTimeEquals(a: String, b: String): Boolean {
        val ab = a.toByteArray(Charsets.UTF_8)
        val bb = b.toByteArray(Charsets.UTF_8)
        if (ab.size != bb.size) return false
        var diff = 0
        for (i in ab.indices) {
            val x = ab[i].toInt() and 0xFF
            val y = bb[i].toInt() and 0xFF
            diff = diff or (x xor y)
        }
        return diff == 0
    }
}
