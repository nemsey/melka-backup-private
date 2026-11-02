package com.melka.relay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * سرویس پیش‌زمینهٔ رلهٔ ملکا — حلقهٔ poll (فقط GET/POST امضاشده به سرور خودی).
 *
 *   poll (امضاشده) → وارسی امضای دوجهتهٔ سرور → whitelist میزبان → اجرا →
 *   result (امضاشده، body پایه۶۴) → تکرار
 *
 * قوانین (عین سرور و اسکریپت Termux):
 *   · صفر لاگ محتوا — در اعلان فقط شمارنده و کد وضعیت می‌نشیند
 *   · صفر auto_execute — گوشی فقط منتقل می‌کند؛ مقصد همیشه whitelist است
 *   · WakeLock جزئی برای بقا در خواب گوشی (MIUI: راهنمای بقا درون‌اپ)
 */
class RelayService : Service() {

    companion object {
        const val CHANNEL_ID = "melka_relay"
        const val NOTIFICATION_ID = 1001
        const val ACTION_STOP = "com.melka.relay.action.STOP"

        @Volatile
        var running = false
            private set

        @Volatile
        var lastCycleAt = 0L
            private set
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var loopThread: Thread? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
        startInForeground(getString(R.string.notif_starting))
        running = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        acquireWakeLock()
        if (loopThread?.isAlive != true) {
            loopThread = Thread { loop() }.also { it.start() }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        running = false
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
        super.onDestroy()
    }

    // ───────────────────────── حلقهٔ اصلی ─────────────────────────

    private fun loop() {
        val ctx = applicationContext
        var backoffMs = 5_000L
        while (true) {
            val creds = RelayPrefs.credentials(ctx)
            if (creds == null || !RelayPrefs.enabled(ctx)) {
                stopSelf()
                return
            }
            val client = PollClient(creds.serverUrl)
            try {
                acquireWakeLock() // تجدید قفل بیداری در هر چرخه (۱۰ دقیقه‌ای)
                val item = client.poll(creds.deviceId, creds.secret)
                lastCycleAt = System.currentTimeMillis()
                backoffMs = 5_000L
                if (item != null) {
                    handleItem(ctx, client, creds, item)
                }
            } catch (e: InterruptedException) {
                return
            } catch (e: Exception) {
                RelayPrefs.setLastEvent(ctx, "خطای شبکه — تلاش مجدد ${backoffMs / 1000} ثانیه دیگر")
                updateNotification()
                try {
                    Thread.sleep(backoffMs)
                } catch (ie: InterruptedException) {
                    return
                }
                backoffMs = (backoffMs * 2).coerceAtMost(60_000L)
            }
        }
    }

    private fun handleItem(ctx: android.content.Context, client: PollClient, creds: RelayPrefs.Creds, item: PollClient.RelayItem) {
        // دفاع دولایه ۲: وارسی امضای سرور پیش از اجرا (RELAY\nid\nmethod\nurl\nsha256(body)\nts)
        val expected = HmacSigner.itemSignature(
            creds.secret, item.id, item.method, item.url, item.body, item.ts.toString()
        )
        if (item.sig.isBlank() || !HmacSigner.constantTimeEquals(expected, item.sig.lowercase())) {
            // امضای نامعتبر — درخواست نادیده گرفته می‌شود (عین اسکریپت Termux)
            RelayPrefs.setLastEvent(ctx, "امضای سرور نامعتبر — درخواست نادیده گرفته شد")
            return
        }

        val exec = try {
            client.execute(item)
        } catch (e: Exception) {
            PollClient.ExecResult(0, null, null, "exec: ${e.message}")
        }

        try {
            client.reportResult(
                creds.deviceId, creds.secret, item.id,
                if (exec.httpStatus > 0) exec.httpStatus else null,
                exec.contentType, exec.bodyB64, exec.error
            )
        } catch (e: Exception) {
            // گزارش نتیجه ناموفق — آیتم سمت سرور با TTL منقضی می‌شود
        }

        if (exec.error == null) RelayPrefs.bumpServed(ctx) else RelayPrefs.bumpErrors(ctx)
        RelayPrefs.setLastStatus(ctx, if (exec.error == null) "${exec.httpStatus}" else "خطا")
        RelayPrefs.setLastEvent(
            ctx,
            if (exec.error == null) "آخرین درخواست: ${exec.httpStatus}" else "آخرین خطا: ${exec.error}"
        )
        updateNotification()
    }

    // ───────────────────────── اعلان ─────────────────────────

    private fun createChannel() {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notif_channel),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.notif_channel_desc)
            setShowBadge(false)
        }
        nm.createNotificationChannel(channel)
    }

    private fun startInForeground(text: String) {
        val notification = buildNotification(text)
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(text: String): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val ctx = applicationContext
        val (served, errors) = RelayPrefs.counters(ctx)
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_relay)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(text)
            .setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText("$text — ${getString(R.string.notif_stats, served, errors)}")
            )
            .setOngoing(true)
            .setContentIntent(open)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification() {
        val ctx = applicationContext
        val (served, errors) = RelayPrefs.counters(ctx)
        val text = "${getString(R.string.notif_active)} — ${getString(R.string.notif_stats, served, errors)}"
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, buildNotification(text))
    }

    // ───────────────────────── Wake Lock ─────────────────────────

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "melka:relay-loop").apply {
            setReferenceCounted(false)
            // تجدید خودکار در هر چرخه — بدون قفل دائمی بی‌پایان
            acquire(10 * 60 * 1000L)
        }
    }
}
