package com.melka.relay

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * خودترمیمی (Self-heal) — هر ۱۵ دقیقه: اگر رله «فعال» است اما سرویس مرده،
 * دوباره راه‌اندازی می‌شود (MIUI گاهی سرویس را می‌کشد).
 * اگر اندروید اجازهٔ شروع از پس‌زمینه نداد، اعلان «برای فعال‌سازی لمس کنید» می‌فرستد.
 */
class SelfHealWorker(appContext: Context, params: androidx.work.WorkerParameters) :
    CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        if (!RelayPrefs.enabled(ctx) || RelayPrefs.credentials(ctx) == null) {
            return Result.success()
        }
        if (RelayService.running) return Result.success()

        return try {
            ctx.startForegroundService(Intent(ctx, RelayService::class.java))
            Result.success()
        } catch (e: Exception) {
            notifyTapToActivate(ctx)
            Result.success()
        }
    }

    private fun notifyTapToActivate(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        if (nm.getNotificationChannel(RelayService.CHANNEL_ID) == null) return
        val open = PendingIntent.getActivity(
            ctx, 0, Intent(ctx, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(ctx, RelayService.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_relay)
            .setContentTitle(ctx.getString(R.string.app_name))
            .setContentText(ctx.getString(R.string.notif_tap_to_activate))
            .setAutoCancel(true)
            .setContentIntent(open)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
        try {
            nm.notify(2002, notification)
        } catch (e: SecurityException) {
            // مجوز اعلان داده نشده — بی‌صدا رد شو (راهنمای درون‌اپ)
        }
    }

    companion object {
        private const val WORK_NAME = "melka-relay-selfheal"

        fun schedule(ctx: Context) {
            val request = PeriodicWorkRequestBuilder<SelfHealWorker>(15, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request
            )
        }
    }
}
