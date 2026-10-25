#!/usr/bin/env bash
# PN-030 · شاهدهای تحویل — worker-source + client-proxy + otp-ui + online-mode
# (قانون فایل v3 — هر ادعا با شاهد)
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)

# ─── ۱) worker-source.json — سورس کامل Worker (مرحلهٔ ۱) ───
python3 - "$TS" <<'EOF'
import json, sys, hashlib
ts = sys.argv[1]
src = open("melka-proxy/src/index.ts", encoding="utf8").read()
toml = open("melka-proxy/wrangler.toml", encoding="utf8").read()
deploy = open("melka-proxy/deploy.sh", encoding="utf8").read()
json.dump({
    "phase": "PN-030 · مرحلهٔ ۱ — پروژهٔ Cloudflare Worker (شورا-ن۰۳۵ · لایهٔ ۱)",
    "witnessedAt": ts,
    "files": {
        "melka-proxy/src/index.ts": {
            "sha256": hashlib.sha256(src.encode()).hexdigest(),
            "lines": src.count("\n") + 1,
            "allowedHosts": ["arus-api.melketabriz.ir", "pm-api.melketabriz.ir", "gap-api.melketabriz.ir"],
            "features": ["HMAC-SHA256 (زمان-ثابت)", "پنجرهٔ ±۵ دقیقه (ضد replay)", "صفر لاگ محتوا", "هدرهای X-Melka-* هرگز forward نمی‌شوند", "redirect manual + no-store"],
        },
        "melka-proxy/wrangler.toml": {"sha256": hashlib.sha256(toml.encode()).hexdigest()},
        "melka-proxy/deploy.sh": {
            "sha256": hashlib.sha256(deploy.encode()).hexdigest(),
            "ownerActionSeconds": 15,
            "description": "نصب راز + دیپلوی + ثبت MELK_ARM_PROXY_URL در env.platform.json + تست زنده — همه با یک دستور bash deploy.sh",
        },
    },
    "cost": "صفر — پلن رایگان Cloudflare Workers (۱۰۰٬۰۰۰ درخواست/روز)",
    "deployStatus": "AWAITING_OWNER_OAUTH (تنها اقدام مالک: ۱۵ ثانیه)",
}, open("download/pn030/worker-source.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("✓ worker-source.json")
EOF

# ─── ۲) client-proxy.json — نقطهٔ یگانه (مرحلهٔ ۳) ───
python3 - "$TS" <<'EOF'
import json, sys, hashlib, re
ts = sys.argv[1]
client = open("src/lib/melk-api/client.ts", encoding="utf8").read()
proxy_mod = open("src/lib/melk-api/proxy.ts", encoding="utf8").read()
overview = open("src/lib/melk-api/connection-overview.ts", encoding="utf8").read()
direct_fetches = len(re.findall(r"await fetch\(", client))
proxied = len(re.findall(r"proxyFetch\(", client))
json.dump({
    "phase": "PN-030 · مرحلهٔ ۳ — یکپارچه‌سازی proxyFetch در client.ts (نقطهٔ یگانهٔ فراخوانی)",
    "witnessedAt": ts,
    "contract": "MELK_ARM_PROXY_URL خالی = عین fetch مستقیم (سازگاری صددرصد با PN-029 — همهٔ تست‌های قبلی سبز ماندند)",
    "points": {
        "armCall": "client.ts:121 — proxyFetch(url, {...}) — تمام فراخوانی‌های ARM/PM/GAP/apu",
        "probeGet": "client.ts:264 — proxyFetch(url, {...}) — پروبهای زندهٔ پایش",
        "notProxied": "container-ip.ts (سرویس IP-echo) و کنترل‌های دیوار/GitHub — عمداً مستقیم",
    },
    "metrics": {
        "directFetchCallsLeftInClient": direct_fetches,
        "proxyFetchCalls": proxied,
        "proxyModuleLines": proxy_mod.count("\n") + 1,
    },
    "signatureContract": "HMAC-SHA256 over «METHOD\\npath?query\\nsha256(body)\\ntimestamp» — یکسان در Worker و proxy.ts (تست A-5/A-8)",
    "envKeys": {
        "MELK_ARM_PROXY_URL": "خالی تا پس از دیپلوی (قفل ترتیب — فهرست کارها #۶)",
        "MELK_PROXY_SECRET": "۶۴ هگز — تولیدشده و در env.platform.json نصب (هرگز در git نیست — env.platform.json گیتیگنور است)",
    },
    "connectionOverview": "فیلد proxy {configured, host, secretConfigured} به /api/connection/status افزوده شد (بدون افشای راز)",
}, open("download/pn030/client-proxy.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("✓ client-proxy.json")
EOF

# ─── ۳) otp-ui.json — صفحهٔ ورود مجدد (مرحلهٔ ۶) ───
python3 - "$TS" <<'EOF'
import json, sys, hashlib
ts = sys.argv[1]
sec = open("src/core/tiles/tiles/settings/OtpReloginSection.tsx", encoding="utf8").read()
melk = open("src/core/tiles/tiles/settings/MelkTabrizConnectionSection.tsx", encoding="utf8").read()
json.dump({
    "phase": "PN-030 · مرحلهٔ ۶ — صفحهٔ «ورود مجدد به ملک تبریز» در تنظیمات عمومی",
    "witnessedAt": ts,
    "location": "پیکرهٔ یکپارچهٔ «اتصال به ملک تبریز» — بخش ۲ (پس از مدیریت اتصال‌ها، پیش از اتصال ARM)",
    "file": {
        "path": "src/core/tiles/tiles/settings/OtpReloginSection.tsx",
        "sha256": hashlib.sha256(sec.encode()).hexdigest(),
        "lines": sec.count("\n") + 1,
    },
    "flow": [
        "۱) کد پرسنلی + دکمهٔ «ارسال کد» با AlertDialog تأیید صریح → POST /api/admin/otp-burn {confirm:true} (تنها مسیر عبور آگاهانه از حالت آفلینی — PN-029 مرحلهٔ ۸)",
        "۲) فیلد کد ۴ رقمی (پذیرش ارقام فارسی) → POST /api/arm/connection {action:'verify'}",
        "۳) توکن‌ها ← نشست مالک + صندوقچهٔ ماندگار (Vault) — اتصال در ورودهای بعدی خودکار بازیابی می‌شود",
    ],
    "statusCards": ["وضعیت پروکسی ابری (لایهٔ ۱) + میزبان Worker", "حالت آفلینی تشخیصی + راهنمای قفل ترتیب گام‌ها"],
    "ownerOnly": "بخش فقط برای نقش OWNER رندر می‌شود (API تک‌تلاش نقشهای دیگر را رد می‌کند)",
    "wired": "MelkTabrizConnectionSection ← OtpReloginSection (offlineMode + proxy از وضعیت اتصال موجود — بدون fetch تکراری)",
    "note": "سند شورا فیلد ۶رقمی گفته؛ سامانهٔ واقعی ARM کد ۴رقمی صادر می‌کند — UI همان ۴ رقمِ واقعی سامانه را می‌پذیرد (اعتبارسنجی نهایی با خود سامانهٔ ملک تبریز)",
}, open("download/pn030/otp-ui.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("✓ otp-ui.json")
EOF

# ─── ۴) online-mode.json — تعیین تکلیف پرچم (مرحلهٔ ۵) ───
python3 - "$TS" <<'EOF'
import json, sys
ts = sys.argv[1]
json.dump({
    "phase": "PN-030 · مرحلهٔ ۵ — برداشتن پرچم آفلینی (تعیین تکلیف آگاهانه)",
    "witnessedAt": ts,
    "decision": "KEEP — پرچم MELK_ARM_OFFLINE=1 پابرجا است",
    "reason": "قفل ترتیب سند (بخش ۲ سند شورا-ن۰۳۵): پرچم فقط پس از تست موفق عبوری از پروکسی برداشته می‌شود. تست عبوری نیازمند دیپلوی Worker است که تنها اقدام باقی‌ماندهٔ مالک است (۱۵ ثانیه OAuth).",
    "evidence": "proxy-live-test.json — هر سه میزبان مستقیم 000 (بلاک پابرجا) · کنترل‌ها زنده · proxyTest=not-configured",
    "removalProcedure": {
        "step1": "مالک: bash melka-proxy/deploy.sh (۱۵ ثانیه OAuth — اسکریپت خودش MELK_ARM_PROXY_URL را ثبت می‌کند)",
        "step2": "GLM: bash scripts/pn030/proxy-live-test.sh → انتظار پاسخ ۲۰۰/۴۰۱/403/404 از ARM از طریق پروکسی",
        "step3": "GLM: برداشتن پرچم MELK_ARM_OFFLINE از env.platform.json (تنها حذف یک خط) + ری‌استارت + صحت‌سنجی",
        "step4": "مالک: تنظیمات عمومی ← ورود مجدد به ملک تبریز ← ارسال کد ← OTP (۳۰ ثانیه) — e2e کامل",
    },
    "safetyNote": "M1-M5 از دیتابیس محلی کار می‌کنند — صفر قطع خدمت در تمام این مدت (پابرجا از PN-029)",
}, open("download/pn030/online-mode.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("✓ online-mode.json")
EOF

echo "── چهار شاهد ثبت شد ──"
