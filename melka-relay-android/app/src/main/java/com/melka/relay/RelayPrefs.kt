package com.melka.relay

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * ذخیرهٔ امن اعتبارنامهٔ دستگاه (EncryptedSharedPreferences — AES256).
 * راز دستگاه فقط در همین گوشی می‌نشیند؛ همان نقشی که فایل melka-relay.sh
 * در Termux داشت (chmod 600).
 */
object RelayPrefs {

    data class Creds(val serverUrl: String, val deviceId: String, val secret: String, val label: String)

    private const val FILE = "melka_relay_secure"
    private const val K_DEVICE_ID = "deviceId"
    private const val K_DEVICE_SECRET = "deviceSecret"
    private const val K_SERVER_URL = "serverUrl"
    private const val K_LABEL = "label"
    private const val K_ENABLED = "enabled"
    private const val K_SERVED = "served"
    private const val K_ERRORS = "errors"
    private const val K_LAST_STATUS = "lastStatus"
    private const val K_LAST_EVENT_AT = "lastEventAt"
    private const val K_LAST_EVENT_TEXT = "lastEventText"

    private fun prefs(ctx: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(ctx)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            ctx, FILE, masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun saveCredentials(ctx: Context, serverUrl: String, deviceId: String, secret: String, label: String) {
        prefs(ctx).edit()
            .putString(K_SERVER_URL, serverUrl.trim().trimEnd('/'))
            .putString(K_DEVICE_ID, deviceId)
            .putString(K_DEVICE_SECRET, secret)
            .putString(K_LABEL, label)
            .apply()
    }

    fun credentials(ctx: Context): Creds? {
        val p = prefs(ctx)
        val id = p.getString(K_DEVICE_ID, null) ?: return null
        val secret = p.getString(K_DEVICE_SECRET, null) ?: return null
        val url = p.getString(K_SERVER_URL, null) ?: return null
        if (id.isBlank() || secret.isBlank() || url.isBlank()) return null
        return Creds(url, id, secret, p.getString(K_LABEL, "") ?: "")
    }

    fun clearCredentials(ctx: Context) {
        prefs(ctx).edit().clear().apply()
    }

    fun enabled(ctx: Context): Boolean = prefs(ctx).getBoolean(K_ENABLED, false)

    fun setEnabled(ctx: Context, value: Boolean) {
        prefs(ctx).edit().putBoolean(K_ENABLED, value).apply()
    }

    fun counters(ctx: Context): Pair<Int, Int> {
        val p = prefs(ctx)
        return p.getInt(K_SERVED, 0) to p.getInt(K_ERRORS, 0)
    }

    fun bumpServed(ctx: Context) = bump(ctx, K_SERVED)

    fun bumpErrors(ctx: Context) = bump(ctx, K_ERRORS)

    private fun bump(ctx: Context, key: String) {
        prefs(ctx).edit().putInt(key, prefs(ctx).getInt(key, 0) + 1).apply()
    }

    fun lastStatus(ctx: Context): String = prefs(ctx).getString(K_LAST_STATUS, "—") ?: "—"

    fun setLastStatus(ctx: Context, status: String) {
        prefs(ctx).edit().putString(K_LAST_STATUS, status).apply()
    }

    fun lastEvent(ctx: Context): String = prefs(ctx).getString(K_LAST_EVENT_TEXT, "—") ?: "—"

    fun setLastEvent(ctx: Context, text: String) {
        prefs(ctx).edit()
            .putString(K_LAST_EVENT_TEXT, text)
            .putLong(K_LAST_EVENT_AT, System.currentTimeMillis())
            .apply()
    }
}
