package com.melka.relay

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/**
 * رلهٔ ملکا — تک‌صفحهٔ فارسی (PN-031-D فاز ۲)
 *
 * جریان مالک: اسکن QR تنظیمات ملکا (یا ورود دستی کد) → نصب خودکار اعتبارنامه →
 * دکمهٔ «فعال» → اتصال دائمی. راهنمای بقا در MIUI و عیب‌یابی هم درون‌اپ است.
 */
class MainActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private val refresh = object : Runnable {
        override fun run() {
            refreshStatus()
            handler.postDelayed(this, 3000)
        }
    }

    private val scannerLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val text = result.data?.getStringExtra("scanned")
            if (result.resultCode == RESULT_OK && !text.isNullOrBlank()) {
                handleScannedText(text)
            }
        }

    private val notifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        askNotificationPermission()
        SelfHealWorker.schedule(this)

        findViewById<View>(R.id.btn_toggle).setOnClickListener { toggleRelay() }
        findViewById<View>(R.id.btn_scan).setOnClickListener { launchScanner() }
        findViewById<View>(R.id.btn_manual).setOnClickListener { showManualDialog() }
        findViewById<View>(R.id.btn_miui).setOnClickListener { showMiuiGuide() }
        findViewById<View>(R.id.btn_battery).setOnClickListener { requestBatteryExemption() }
        findViewById<View>(R.id.btn_disconnect).setOnClickListener { confirmDisconnect() }

        refreshStatus()
    }

    override fun onResume() {
        super.onResume()
        handler.post(refresh)
    }

    override fun onPause() {
        handler.removeCallbacks(refresh)
        super.onPause()
    }

    // ───────────────────────── وضعیت ─────────────────────────

    private fun refreshStatus() {
        val ctx = this
        val creds = RelayPrefs.credentials(ctx)
        val enabled = RelayPrefs.enabled(ctx)
        val (served, errors) = RelayPrefs.counters(ctx)

        val statusView = findViewById<TextView>(R.id.tv_status)
        val detailView = findViewById<TextView>(R.id.tv_detail)
        val idView = findViewById<TextView>(R.id.tv_device)
        val toggle = findViewById<TextView>(R.id.btn_toggle)
        val scanBtn = findViewById<TextView>(R.id.btn_scan)

        if (creds == null) {
            statusView.setText(R.string.status_not_setup)
            statusView.setTextColor(ContextCompat.getColor(ctx, R.color.amber))
            detailView.setText(R.string.status_not_setup_hint)
            idView.visibility = View.GONE
            toggle.visibility = View.GONE
            scanBtn.visibility = View.VISIBLE
            findViewById<View>(R.id.btn_disconnect).visibility = View.GONE
        } else {
            idView.visibility = View.VISIBLE
            idView.text = getString(R.string.device_line, creds.label.ifBlank { creds.deviceId })
            toggle.visibility = View.VISIBLE
            scanBtn.visibility = View.GONE
            findViewById<View>(R.id.btn_disconnect).visibility = View.VISIBLE

            if (!enabled) {
                statusView.setText(R.string.status_inactive)
                statusView.setTextColor(ContextCompat.getColor(ctx, R.color.amber))
                toggle.setText(R.string.btn_activate)
                detailView.text = getString(R.string.status_inactive_hint)
            } else if (RelayService.running) {
                val online = System.currentTimeMillis() - RelayService.lastCycleAt < 90_000
                statusView.setText(
                    if (online) R.string.status_online else R.string.status_connecting
                )
                statusView.setTextColor(
                    ContextCompat.getColor(
                        ctx, if (online) R.color.emerald else R.color.amber
                    )
                )
                toggle.setText(R.string.btn_deactivate)
                detailView.text = getString(
                    R.string.status_detail, served, errors, RelayPrefs.lastStatus(ctx)
                ) + "\n" + RelayPrefs.lastEvent(ctx)
            } else {
                statusView.setText(R.string.status_restarting)
                statusView.setTextColor(ContextCompat.getColor(ctx, R.color.amber))
                toggle.setText(R.string.btn_deactivate)
                detailView.setText(R.string.status_restarting_hint)
            }
        }
    }

    // ───────────────────────── فعال/غیرفعال ─────────────────────────

    private fun toggleRelay() {
        val ctx = this
        val creds = RelayPrefs.credentials(ctx) ?: return
        if (RelayPrefs.enabled(ctx)) {
            RelayPrefs.setEnabled(ctx, false)
            stopService(Intent(ctx, RelayService::class.java))
        } else {
            RelayPrefs.setEnabled(ctx, true)
            ContextCompat.startForegroundService(ctx, Intent(ctx, RelayService::class.java))
        }
        refreshStatus()
    }

    // ───────────────────────── راه‌اندازی با QR ─────────────────────────

    private fun launchScanner() {
        scannerLauncher.launch(Intent(this, QrScannerActivity::class.java))
    }

    /** استخراج کد و نشانی سرور از محتوای QR (دستور نصب Termux) */
    private fun handleScannedText(text: String) {
        val code = Regex("code=([A-Za-z0-9]+)").find(text)?.groupValues?.get(1)
        val server = Regex("(https://[A-Za-z0-9._:-]+)").find(text)?.groupValues?.get(1)
        if (code == null || server == null) {
            showInfo(getString(R.string.err_bad_qr))
            return
        }
        enroll(server, code)
    }

    // ───────────────────────── ورود دستی ─────────────────────────

    private fun showManualDialog() {
        val ctx = this
        val container = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 32, 48, 16)
        }
        val serverInput = EditText(ctx).apply {
            hint = getString(R.string.hint_server)
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            RelayPrefs.credentials(ctx)?.serverUrl?.let { setText(it) }
        }
        val codeInput = EditText(ctx).apply {
            hint = getString(R.string.hint_code)
            inputType = InputType.TYPE_CLASS_TEXT
        }
        container.addView(serverInput)
        container.addView(codeInput)

        AlertDialog.Builder(ctx)
            .setTitle(R.string.manual_title)
            .setView(container)
            .setPositiveButton(R.string.connect) { _, _ ->
                val server = serverInput.text.toString().trim()
                val code = codeInput.text.toString().trim()
                if (server.startsWith("http") && code.isNotEmpty()) {
                    enroll(server, code)
                } else {
                    showInfo(getString(R.string.err_bad_input))
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    // ───────────────────────── ثبت اعتبارنامه ─────────────────────────

    private fun enroll(server: String, code: String) {
        val ctx = this
        showInfo(getString(R.string.enrolling))
        Thread {
            val result = PollClient(server).enroll(code, server)
            runOnUiThread {
                if (result.ok) {
                    RelayPrefs.saveCredentials(
                        ctx, result.serverUrl.ifBlank { server },
                        result.deviceId, result.secret, result.deviceId
                    )
                    RelayPrefs.setEnabled(ctx, true)
                    ContextCompat.startForegroundService(ctx, Intent(ctx, RelayService::class.java))
                    showInfo(getString(R.string.enroll_ok))
                } else {
                    showInfo(result.error ?: getString(R.string.enroll_fail))
                }
                refreshStatus()
            }
        }.start()
    }

    private fun confirmDisconnect() {
        AlertDialog.Builder(this)
            .setTitle(R.string.disconnect_title)
            .setMessage(R.string.disconnect_message)
            .setPositiveButton(R.string.disconnect) { _, _ ->
                RelayPrefs.setEnabled(this, false)
                stopService(Intent(this, RelayService::class.java))
                RelayPrefs.clearCredentials(this)
                refreshStatus()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    // ───────────────────────── بقا در MIUI ─────────────────────────

    private fun showMiuiGuide() {
        AlertDialog.Builder(this)
            .setTitle(R.string.miui_title)
            .setMessage(getString(R.string.miui_steps))
            .setPositiveButton(R.string.open_miui_settings) { _, _ ->
                try {
                    startActivity(Intent().apply {
                    setClassName(
                        "com.miui.securitycenter",
                        "com.miui.powerkeeper.PowerSettings"
                    )
                    })
                } catch (e: Exception) {
                    openAppSettings()
                }
            }
            .setNegativeButton(R.string.close, null)
            .show()
    }

    private fun requestBatteryExemption() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (pm.isIgnoringBatteryOptimizations(packageName)) {
            showInfo(getString(R.string.battery_ok))
            return
        }
        try {
            startActivity(
                Intent(
                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:$packageName")
                )
            )
        } catch (e: Exception) {
            openAppSettings()
        }
    }

    private fun openAppSettings() {
        try {
            startActivity(
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:$packageName")
                )
            )
        } catch (e: Exception) {
            // تنظیمات در دسترس نیست
        }
    }

    // ───────────────────────── ابزار ─────────────────────────

    private fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun showInfo(message: String) {
        AlertDialog.Builder(this)
            .setTitle(R.string.app_name)
            .setMessage(message)
            .setPositiveButton(R.string.close, null)
            .show()
    }
}
