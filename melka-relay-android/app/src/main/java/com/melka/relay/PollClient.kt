package com.melka.relay

import android.util.Base64
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * کلاینت HTTP رله — قرارداد عین روت‌های mobile-relay سرور ملکا:
 *
 *   GET  bootstrap?code=…&format=json  → {ok, deviceId, deviceSecret, serverUrl}
 *   POST poll    {"wait":20}           → 200 {ok, request:{id,method,url,headers,body,sig,ts}} | 204 خالی
 *   POST result  {id, httpStatus, contentType, bodyB64, error?}
 *
 * احراز سه‌هدری: X-Melka-Relay-Device · X-Melka-Timestamp · X-Melka-Signature
 */
class PollClient(private val serverUrl: String) {

    class RelayItem(
        val id: String,
        val method: String,
        val url: String,
        val headers: Map<String, String>,
        val body: String,
        val sig: String,
        val ts: Long
    )

    class ExecResult(
        val httpStatus: Int,
        val contentType: String?,
        val bodyB64: String?,
        val error: String?
    )

    class EnrollResult(
        val ok: Boolean,
        val deviceId: String = "",
        val secret: String = "",
        val serverUrl: String = "",
        val error: String? = null,
        val reason: String? = null
    )

    private fun open(path: String): HttpURLConnection {
        val conn = URL(serverUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        conn.instanceFollowRedirects = true
        return conn
    }

    private fun sign(
        deviceId: String, secret: String, method: String, path: String, body: String,
        conn: HttpURLConnection
    ) {
        val ts = System.currentTimeMillis().toString()
        val sig = HmacSigner.requestSignature(secret, method, path, body, ts)
        conn.setRequestProperty("X-Melka-Relay-Device", deviceId)
        conn.setRequestProperty("X-Melka-Timestamp", ts)
        conn.setRequestProperty("X-Melka-Signature", sig.lowercase())
    }

    private fun readText(conn: HttpURLConnection, status: Int): String {
        val stream = if (status in 200..399) conn.inputStream else conn.errorStream
        return stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
    }

    /** ثبت دستگاه با کد راه‌اندازی (شاخهٔ JSON اپ اندروید — PN-031-D) */
    fun enroll(code: String, baseUrl: String): EnrollResult {
        return try {
            val conn = open("/api/mobile-relay/bootstrap?code=${encode(code)}&format=json")
            conn.requestMethod = "GET"
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            val status = conn.responseCode
            val text = readText(conn, status)
            val obj = try { JSONObject(text) } catch (e: Exception) { JSONObject() }
            if (status == 200 && obj.optBoolean("ok")) {
                EnrollResult(
                    ok = true,
                    deviceId = obj.optString("deviceId"),
                    secret = obj.optString("deviceSecret"),
                    serverUrl = obj.optString("serverUrl", baseUrl)
                )
            } else {
                EnrollResult(
                    ok = false,
                    error = obj.optString("error", "پاسخ نامعتبر سرور (HTTP $status)"),
                    reason = obj.optString("reason")
                )
            }
        } catch (e: Exception) {
            EnrollResult(ok = false, error = "اتصال به سرور ممکن نشد: ${e.message}")
        }
    }

    /** ایستگاه long-poll — null یعنی صف خالی (204): بلافاصله poll بعدی */
    fun poll(deviceId: String, secret: String): RelayItem? {
        val path = "/api/mobile-relay/poll"
        val body = "{\"wait\":20}"
        val conn = open(path)
        conn.requestMethod = "POST"
        conn.connectTimeout = 15_000
        conn.readTimeout = 40_000 // long-poll تا ۲۵ ثانیه + حاشیهٔ شبکهٔ ایران
        conn.doOutput = true
        sign(deviceId, secret, "POST", path, body, conn)
        conn.setRequestProperty("Content-Type", "application/json")
        conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

        val status = conn.responseCode
        if (status == 204) return null
        if (status != 200) throw IOException("poll HTTP $status")
        val obj = JSONObject(readText(conn, status))
        if (!obj.optBoolean("ok")) throw IOException("poll: ok=false")
        val req = obj.getJSONObject("request")
        val headersJson = req.optJSONObject("headers")
        val headers = mutableMapOf<String, String>()
        if (headersJson != null) {
            val keys = headersJson.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                headers[k.lowercase()] = headersJson.optString(k)
            }
        }
        return RelayItem(
            id = req.getString("id"),
            method = req.optString("method", "GET").uppercase(),
            url = req.getString("url"),
            headers = headers,
            body = req.optString("body", ""),
            sig = req.optString("sig", ""),
            ts = req.optLong("ts", 0L)
        )
    }

    /** گزارش نتیجهٔ اجرا — bodyB64 = base64 بدنهٔ پاسخ (بدون newline) */
    fun reportResult(
        deviceId: String, secret: String,
        itemId: String, httpStatus: Int?, contentType: String?,
        bodyB64: String?, error: String?
    ): Boolean {
        val path = "/api/mobile-relay/result"
        val json = JSONObject().apply {
            put("id", itemId)
            httpStatus?.let { put("httpStatus", it) }
            contentType?.let { put("contentType", it) }
            bodyB64?.let { put("bodyB64", it) }
            error?.let { put("error", it) }
        }
        val body = json.toString()
        val conn = open(path)
        conn.requestMethod = "POST"
        conn.connectTimeout = 15_000
        conn.readTimeout = 30_000
        conn.doOutput = true
        sign(deviceId, secret, "POST", path, body, conn)
        conn.setRequestProperty("Content-Type", "application/json")
        conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        return conn.responseCode == 200
    }

    /**
     * اجرای درخواست عبوری از IP ایرانی گوشی.
     * دفاع در عمق سمت گوشی (عین اسکریپت Termux):
     *   ۱) فقط https و فقط زیردامنهٔ *.melketabriz.ir
     * هدرهای عبوری مجاز: authorization · content-type · accept
     */
    fun execute(item: RelayItem): ExecResult {
        val u = URL(item.url)
        if (u.protocol != "https" || !u.host.lowercase().endsWith(".melketabriz.ir")) {
            return ExecResult(0, null, null, "blocked: host not allowed")
        }
        val conn = u.openConnection() as HttpURLConnection
        conn.requestMethod = item.method
        conn.connectTimeout = 15_000
        conn.readTimeout = 25_000
        item.headers["authorization"]?.let { if (it.isNotBlank()) conn.setRequestProperty("Authorization", it) }
        item.headers["content-type"]?.let { if (it.isNotBlank()) conn.setRequestProperty("Content-Type", it) }
        item.headers["accept"]?.let { if (it.isNotBlank()) conn.setRequestProperty("Accept", it) }
        if (item.body.isNotEmpty() && item.method != "GET" && item.method != "HEAD") {
            conn.doOutput = true
            conn.outputStream.use { it.write(item.body.toByteArray(Charsets.UTF_8)) }
        }
        val code = try { conn.responseCode } catch (e: Exception) {
            return ExecResult(0, null, null, "exec: ${e.message}")
        }
        val stream = if (code in 200..399) conn.inputStream else conn.errorStream
        val bytes = stream?.use { it.readBytes() } ?: ByteArray(0)
        val b64 = if (bytes.isEmpty()) null else Base64.encodeToString(bytes, Base64.NO_WRAP)
        return ExecResult(code, conn.contentType, b64, null)
    }

    private fun encode(s: String): String =
        java.net.URLEncoder.encode(s, Charsets.UTF_8.name())
}
