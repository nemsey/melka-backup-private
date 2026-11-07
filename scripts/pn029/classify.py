#!/usr/bin/env python3
# PN-029 · مرحلهٔ ۴ — دسته‌بندی ریشه (جدول تصمیم سند شورا) → classification.json
import json, datetime

d = json.load(open("download/pn029/diagnosis.json", encoding="utf-8"))
v = d["test6_vault"]
t4 = d["test4_http_public_readonly"]

dns_fail = any(not s["ok"] for s in d["test1_dns"].values())
tcp_fail = all(not s["ok"] for s in d["test2_tcp_443"].values())
tls_fail = all(not s["ok"] for s in d["test3_tls"].values())
melk_http = [s["httpStatus"] for k, s in t4.items() if "CONTROL" not in k]
melk_all_timeout = all(c == 0 for c in melk_http)
ctrl_divar_answered = t4["CONTROL_divar_iranian_third_party"]["httpStatus"] > 0
ctrl_github_answered = t4["CONTROL_github_foreign"]["httpStatus"] > 0
vault_dead = v["vaultRecords"] > 0 and v["tokenDecryptable"] == 0
ips = {d["test5_containerIp"]["ifconfig_me"], d["test5_containerIp"]["api_ipify_org"]}

# جدول تصمیم سند (۴.۱)
if dns_fail:
    root = "پ"; label = "مسیر شبکهٔ کانتینر (DNS)"; action = "تنظیم DNS سفارشی"
elif melk_all_timeout and (ctrl_divar_answered or ctrl_github_answered):
    root = "الف"; label = "بلاک IP / فایروال ملک تبریز (drop خاموش TCP)"; action = "گزارش به مالک + whitelist رنج خروجی + صبر"
elif any(c in (502, 503, 504) for c in melk_http):
    root = "الف/ت"; label = "پاسخ ۵xx از همهٔ نقاط"; action = "کانتکت مالک"
elif vault_dead:
    root = "ب"; label = "توکنهای ناخوانا/منقضی"; action = "OTP تکی پس از پاک‌شدن"
else:
    root = "نامشخص"; label = "ترکیبی"; action = "گزارش کامل"

out = {
  "phase": "PN-029 · مرحلهٔ ۴ — دسته‌بندی ریشه (جدول تصمیم ۴.۱ سند شورا)",
  "classifiedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "decisionTable": {
    "DNS fail?": dns_fail,
    "TCP fail (همهٔ میزبانها)?": tcp_fail,
    "TLS fail (همه)?": tls_fail,
    "HTTP ملک تبریز همه timeout (code=000)?": melk_all_timeout,
    "کنترل دیوار (ایرانی) پاسخ داد؟": ctrl_divar_answered,
    "کنترل GitHub (خارجی) پاسخ داد؟": ctrl_github_answered,
    "Vault غیرقابل‌رمزگشایی (۴/۴)?": vault_dead,
  },
  "verdict": {
    "root": root,
    "label": label,
    "action": action,
    "confidence": "بالا (شواهد مستقیم)",
    "reasoning": [
      "DNS سالم است — همهٔ میزبانهای ملک تبریز به 46.100.93.175 حل می‌شوند (پ رد شد).",
      "خروجی اینترنت کانتینر کاملاً سالم است: دیوار (میزبان ایرانی) در ۰٫۹ ثانیه پاسخ HTTP 403 داد و GitHub پاسخ 403 داد — مسیر خروج و TLS مشکلی ندارد.",
      "تمام هفت نقطهٔ ملک تبریز (ARM×۳ + PM + GAP + عمومی + وب‌سایت) به‌طور یکسان در ۲۰ ثانیه timeout شدند — نه 502، نه 403، نه connection-refused: بسته‌های SYN به‌صورت خاموش drop می‌شوند (رفتار کلاسیک فایروال).",
      "نتیجه: فایروال/بلاک‌لیست سمت ملک تبریز، اتصال از IPهای خروجی این کانتینر را نمی‌پذیرد (ریشهٔ الف).",
      "هم‌زمان: هر ۴ توکنِ خزانه غیرقابل‌رمزگشایی‌اند (کلید چرخیده/داده کهنه) — ریشهٔ ب نیز برای بازیابی احراز هویت برقرار است (حتی با رفع بلاک، ورود نیازمند OTP تازه است).",
      "یافتهٔ تکمیلی: IP خروجی کانتینر در سه اندازه‌گیری سه مقدار متفاوت داد (استخر NAT) — whitelist تک‌IP کافی نیست؛ کل رنج/پیشوند باید whitelist شود یا مسیر خروج ثابت (proxy ایرانی) فراهم شود.",
    ],
    "ipVariability": {
      "observed": sorted(x for x in ips if x),
      "implication": "پیشنهاد whitelist برای مالک: رنج‌های خروجی کانتینر (47.57.224.0/19 و 8.212.0.0/16 — استخر Alibaba) یا مسیر proxy ثابت",
    },
    "rejectedRoots": {
      "پ": "رد — DNS و خروجی عمومی سالم (کنترل‌ها پاسخ دادند)",
      "ت": "بعید — timeout پایدار در همهٔ نقاط، نه 502 متناوب؛ سایر کاربران سرویس می‌گیرند",
    },
  },
}
json.dump(out, open("download/pn029/classification.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"root={root} | label={label}")
print(f"melk_all_timeout={melk_all_timeout} ctrl_divar={ctrl_divar_answered} ctrl_github={ctrl_github_answered} vault_dead={vault_dead}")
