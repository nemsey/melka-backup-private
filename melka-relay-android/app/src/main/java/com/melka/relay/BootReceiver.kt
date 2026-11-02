package com.melka.relay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * شروع خودکار پس از بوت گوشی (BOOT_COMPLETED + QUICKBOOT_POWERON برای MIUI).
 * فقط وقتی مالک رله را «فعال» کرده و اعتبارنامه روی گوشی هست.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val bootActions = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON"
        )
        if (action !in bootActions) return

        if (RelayPrefs.enabled(context) && RelayPrefs.credentials(context) != null) {
            try {
                context.startForegroundService(Intent(context, RelayService::class.java))
            } catch (e: Exception) {
                // محدودیت OEM — SelfHealWorker هر ۱۵ دقیقه دوباره تلاش می‌کند
            }
        }
    }
}
