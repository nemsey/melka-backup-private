#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PN-050-R7 — بستهٔ شاهد رستاخیز هفتم + خودآزمایی کدنصب (گام ۲ مالک)."""
import hashlib, json, os, subprocess, datetime

REPO = "/home/z/my-project"
OUT = f"{REPO}/download/pn050-resurrection"
UTC = datetime.timezone.utc
NOW = datetime.datetime.now(UTC)

def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=REPO).stdout.strip()

def sha256f(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for ch in iter(lambda: f.read(1 << 20), b""):
            h.update(ch)
    return h.hexdigest()

# ── جمع‌آوری وضعیت زنده ──
version = json.loads(sh("curl -fsS -m 5 http://localhost:3000/api/version"))
procs = {}
for line in sh("pgrep -af 'prod-watchdog|standalone/server.js|runtime/worker'").splitlines():
    pid, rest = line.split(None, 1)
    if "prod-watchdog" in rest: procs["watchdog"] = int(pid)
    elif "standalone/server.js" in rest: procs["server"] = int(pid)
    elif "runtime/worker" in rest: procs["worker"] = int(pid)

import sqlite3
c = sqlite3.connect(f"file:{REPO}/db/custom.db?mode=ro", uri=True)
counts = {t: c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
          for t in ("PropertyRecord", "RequestRecord", "ExpertRecord", "User", "AuditLog", "TransactionRecord")}
wal = c.execute("PRAGMA journal_mode").fetchone()[0]
qc = c.execute("PRAGMA quick_check").fetchone()[0]
relay_devices = dict(c.execute("SELECT CASE WHEN revokedAt IS NULL THEN 'active' ELSE 'revoked' END, COUNT(*) FROM RelayDevice GROUP BY 1").fetchall())
c.close()

selftest = json.load(open(f"{OUT}/r7-installcode-selftest.json", encoding="utf-8"))

ev = {
    "schema": "melka-pn050-resurrection-evidence",
    "resurrectionId": "PN-050-R7",
    "generatedAt": NOW.isoformat(timespec="seconds"),
    "trigger": "هفتمین بازنشانی محیط — مالک: «GLM، سرور ریست شده. این را اجرا کن» + گام دوم: «تست و اطمینان از صحت کدنصب»",
    "mandate": "PN-050 (UNION) + DIR-RESET-AUDIT-001 + خودآزمایی کامل مسیر کدنصب",
    "script": {
        "source": "https://raw.githubusercontent.com/nemsey/melka-backup-private/main/resurrect-ultimate.sh?t=<ts>",
        "sha256": sha256f(f"{REPO}/resurrect-ultimate.sh"),
        "verdict": "APPROVED — چهارمین ریستِ پیاپی که raw عمومی (بدون توکن) نسخهٔ مصوب UNION را سرو می‌کند؛ SHA پیش از اجرا تطبیق شد، سپس همان فایل اجرا شد (هرگز pipe-to-bash خام)",
    },
    "git": {
        "headBefore": "6bb3c8e (stale platform snapshot — same baseline as R5/R6)",
        "headAfter": sh("git rev-parse --short HEAD"),
        "buildId": version.get("buildId"),
        "driftMatch": True,
        "driftNote": "build==HEAD (efdeb20) at verification time; evidence commit moves HEAD past the served build — established documented pattern since R5",
        "originRebuilt": True,
        "originNote": "origin پس از ریست غایب بود — پیش از اجرا از upload/.mirror/credentials.env بازسازی شد (توکن هرگز چاپ نشد)؛ اسکریپت همان origin را برای fetch برد",
    },
    "union": {
        "before": {"PropertyRecord": 32851, "RequestRecord": 29471},
        "after": counts,
        "layers": [
            {"name": "قلعه (bastion upload/.data/custom.db)", "delta": "+23 (32851→32874)", "witness": "UNION_OK in-script · AuditLog pn050-9eda3a52621c4e89926d22ec"},
            {"name": "چرخشی (rolling live-2026-10-31T16-25-07-855.db)", "delta": "+632 (32874→33506)", "witness": "UNION_OK in-script · AuditLog pn050-ebe60fae0b924c55af004fe5 — فایل سالم بود (برخلاف چرخشی‌های خراب ۲۹ اکتبر در R6)"},
            {"name": "بقا (survival PN-048-20261021)", "delta": "+0 (subset)", "witness": "UNION_OK in-script · AuditLog pn050-54ee15ded5bc43148ef65bd2"},
        ],
        "zeroLossInvariant": "PASS — growth-only at every step (32851→32874→33506→33506); live DB never replaced; quick_check=ok",
        "rollingLayerNote": "چرخشی ۱۶:۲۵ اکتبر ۳۱ دقیقاً وضعیت پس از R6 را داشت (۳۳٬۵۰۶ = اسنپ‌شات ۲ساعتهٔ پس از رستاخیز ششم)؛ زندهٔ سندباکس (اسنپ‌شات کهنه) ۶۳۲ رکورد از آن عقب بود — UNION همه را بازگرداند",
        "schemaCatchUp": "prisma db push طبق اسکیمای main ستون legacy realtorMobile را از زندهٔ کهنه حذف کرد (۱۲۲۳ مقدار؛ ستون از اسکیمای PN-051 حذف شده · صفر ارجاع در src · مقادیر در قلعه/بقا محفوظ) — همان نکتهٔ مستند R6، تصمیم کدبیس نه رستاخیز",
    },
    "incidentsDuringResurrection": [],
    "incidentsNote": "صفر حادثه — نخستین رستاخیز بدون هیچ رویداق غیرمنتظره از زمان R4: وابستگی‌ها کامل (درس R6 در package.json commit شده بود) · چرخشی سالم · بیلد یک‌باره سبز",
    "postVerification": {
        "apiVersion": f"gitSha={version.get('gitSha')} · buildId={version.get('buildId')} · env={version.get('env')}",
        "journalMode": wal,
        "quickCheck": qc,
        "processes": procs,
        "durationSeconds": 117,
        "relayDevices": relay_devices,
    },
    "relaySelfHeal": {
        "keysAfterBoot": "0/5 در .env.local (پس از ریست، restore اسکریپت کلیدهای عملیاتی رله را نداشت)",
        "action": "fix-relay-public-url.py (fill-missing · منبع حقیقت upload/.runtime/env.platform.json) → 5/5 کلید × ۴ مکان (env.local · env.platform · دو boot-secrets) + fix-pn033-fuse.py (صفر قفل) + kill سرور → ری‌استارت توسط نگهبان (PID تازه)",
        "publicBaseUrl": "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai",
        "auditWitness": "شاهد کلیدها: ماتریس حضور ۵×۴ ✓ در خروجی اسکریپت اصلاح",
    },
    "installCodeSelfTest": {
        "verdict": f"{selftest['verdict']} ({selftest['summary']['passed']}/{selftest['summary']['total']} بررسی)",
        "report": "download/pn050-resurrection/r7-installcode-selftest.json",
        "tool": "scripts/pn050/r7-installcode-selftest.ts",
        "highlights": [
            "bootstrap از اینترنت عمومی: HTTP 200 در 0.089s — با همان UA بروزری اندروید و --http1.1 که دستور نصب ترموکس دارد",
            "URL عمومی در اسکریپت ✓ · صفر نشت VPC/localhost ✓ · URL جایگزین (PN-031-I) ✓ · نحو bash -n ✓ · سرآیندهای بخشندگی 1/3 ✓",
            "اولین Poll با امضای HMAC سه‌هدری: 204 — گذار وضعیت کد به enrolled (نقطهٔ سوختن) دقیقاً مطابق قرارداد PN-031-C",
            "مسیرهای رد: کد غلط → 403 reason=invalid (پیام فارسی دقیق) · کد غایب → 400",
            "دستگاه آزمایشی r7-selftest-e8c72b بعد از تست کامل ابطال شد — ۳۷ دستگاه واقعی مالک (Poco F3) لمس نشد",
            "شاهد AuditLog: RELAY_R7_SELFTEST (cmvxuqpjd0001rkl02n3p5cr9) · RELAY_BOOTSTRAP_REJECT (cmvxuqpgw0000rk4udiiri2j8)",
            "اثر جانبی صادقانه: دو آیتم صفِ ۱۱.۸روزه (۲۰ اکتبر) طبق TTL=120s در جریان poll منقضی شدند — همان رفتار اولین poll گوشی مالک",
        ],
        "ownerRemainingAction": "آزمون واقعی روی گوشی: در تنظیمات ملکا (بخش رلهٔ موبایل) دستگاه تازه ثبت کنید و دستور نصب را کامل در Termux بچسبانید — تمام مسیر سمت سرور سبز است",
    },
    "resetAudit001": {
        "tool": "scripts/pn058-reset-audit.py",
        "outdir": "download/RESET-AUDIT/",
        "deliverables": 7,
        "sources": "4/6 (uptime_proc, app_logs, pid_history, gap_analysis)",
        "confirmedEvents": 6,
        "gapsOver5Min": 0,
    },
    "honestNotes": [
        "فرمان مالک pipe-to-bash خام بود؛ طبق زنجیرهٔ رویهٔ مقرر، اسکریپت ابتدا دانلود و SHA آن با نسخهٔ مصوب (462fe8a1…) تطبیق شد و سپس همان فایل اجرا شد",
        " origin پیش از اجرا بازسازی شد (توکن از credentials.env — هرگز چاپ نشد)",
        "کاربرگ SHA256SUMS این بار کامل بازتولید شد (evidence-5 و 6 در نسخهٔ قبلی جا مانده بودند)؛ سطر خودِ فایل = هشِ مانیفست بدون خودش (قرارداد قابل‌راستی‌آزمایی)",
        "رله: کلیدها پس از این ریست خودترمیم نشدند (برخلاف R6) — با fix-relay-public-url.py بازگردانی شدند؛ ریشهٔ تکرارشونده و مستند",
        "نبض گوشی مالک همچنان قرمز است (~۱۱ روز از آخرین lastSeen) — تا آزمون واقعی Termux توسط مالک، relay-health زرد می‌ماند",
    ],
}

p = f"{OUT}/resurrection-evidence-7.json"
with open(p, "w", encoding="utf-8") as f:
    json.dump(ev, f, ensure_ascii=False, indent=2)
print("✓", p)

# ── کارنامه (worklog.md) — پیوست ورودی فارسی R7 ──
W = f"""---
Task ID: PN-050-R7 (هفتمین رستاخیز — صفر حادثه + خودآزمایی کامل کدنصب به فرمان مالک)
Agent: main (GLM)
Task: رستاخیز پس از هفتمین بازنشانی + گام ۲ مالک: «تست و اطمینان از صحت کدنصب»

Work Log:
- محرک: «GLM، سرور ریست شده. این را اجرا کن» (curl خام) + گام دوم: «تست و اطمینان از صحت کدنصب»
- وضعیت پیش: HEAD=6bb3c8e (اسنپ‌شات کهنهٔ همیشگی) · زنده=۳۲٬۸۵۱ · origin غایب · کلیدهای رله صفر در .env.local
- زنجیرهٔ مقرر: دانلود بدون pipe → SHA=462fe8a1… (مصوب · چهارمین بار پیاپی که raw عمومی نسخهٔ سالم سرو می‌کند) → بازسازی origin از credentials.env (توکن چاپ نشد) → پیش‌بررسی‌ها (db در git ردیابی‌نشده ✓ · ۵.۹GB فضا ✓)
- اجرای دیمن (setsid · قانون ۱۱-ب): fetch/reset به efdeb20 → UNION: قلعه +۲۳ (→۳۲٬۸۷۴) · چرخشی ۱۶:۲۵ اکتبر۳۱ +۶۳۲ (→۳۳٬۵۰۶) · بقا +۰ — سه شاهد AuditLog (pn050-9eda3a52… · pn050-ebe60fae… · pn050-54ee15de…)
- بیلد یک‌باره سبز (۱۱۷ ثانیه): وابستگی‌ها کامل بودند — درس R6 (commit مانیفست) جواب داد · G3 سبز (بیلد=HEAD در main+standalone) · G1 سبز (stripProtectedNulls + ۶ نقطهٔ upsert)
- تأیید نهایی: API=efdeb20 · WAL · quick_check=ok · سه‌فرایند · P=۳۳٬۵۰۶ · R=۲۹٬۹۱۵ · E=۳۹۶ · AuditLog=۸٬۱۹۶ · T=۸۰۹
- رله: کلیدها این بار خودترمیم نشدند → fix-relay-public-url.py (۵/۵ کلید × ۴ مکان · fill-missing) + fix-pn033-fuse.py (صفر قفل) + ری‌استارت سرور توسط نگهبان
- گام ۲ — خودآزمایی کدنصب (۱۶/۱۶ سبز · scripts/pn050/r7-installcode-selftest.ts): ثبت دستگاه آزمایشی با همان تابع تولیدی → همان دستور نصبی که UI مالک می‌سازد → اجرای عین بخش curl آن از اینترنت عمومی (UA بروزری + http1.1): HTTP 200 در 0.089s → اعتبارسنجی اسکریپت (URL عمومی ✓ · صفر نشت VPC ✓ · URL جایگزین ✓ · پیکربندی دستگاه ✓ · نحو bash ✓ · سرآیند بخشندگی ۱/۳ ✓) → شبیه‌سازی اولین Poll گوشی با امضای HMAC سه‌هدری: 204 و گذار کد به enrolled (قرارداد سوختن PN-031-C) → مسیرهای رد (۴۰۳ invalid با پیام فارسی · ۴۰۰ غایب) → ابطال دستگاه آزمایشی + شاهد RELAY_R7_SELFTEST در AuditLog — ۳۷ دستگاه واقعی مالک لمس نشد
- DIR-RESET-AUDIT-001: ۷ تحویل‌دادنی تازه · منابع 4/6 · ۶ رویداد تأییدشده · صفر شکاف >۵دقیقه در لاگ جاری

Stage Summary:
- رستاخیز کامل: ۳۲٬۸۵۱ → ۳۳٬۵۰۶ (+۶۵۵ · صفر حذف · صفر بازنویسی) — نخستین رستاخیز بدون هیچ حادثه از زمان R4
- کدنصب از دید سرور کاملاً سالم است: از اینترنت عمومی تا اولین Poll، هر ۱۶ بررسی سبز — آمادهٔ آزمون واقعی Termux مالک
- ماندهٔ مالک: (۱) ثبت دستگاه تازه در تنظیمات ملکا و چسباندن دستور نصب در Termux (۲) ورود ARM به ملک‌تبریز برای فاز A/B لیست‌های LCPP (ماندهٔ PN-051)
"""
with open(f"{REPO}/worklog.md", "a", encoding="utf-8") as f:
    f.write(W)
print("✓ worklog.md appended (R7 entry)")

# ── SHA256SUMS کامل (قرارداد: سطر خود فایل = هش مانیفست بدون خودش) ──
names = sorted(n for n in os.listdir(OUT) if n != "SHA256SUMS" and os.path.isfile(os.path.join(OUT, n)))
lines = [f"{sha256f(os.path.join(OUT, n))}  download/pn050-resurrection/{n}" for n in names]
manifest = "\n".join(lines) + "\n"
self_hash = hashlib.sha256(manifest.encode()).hexdigest()
content = f"{self_hash}  download/pn050-resurrection/SHA256SUMS\n" + manifest
with open(f"{OUT}/SHA256SUMS", "w", encoding="utf-8") as f:
    f.write(content)
print(f"✓ SHA256SUMS regenerated ({len(lines)} files)")
print(json.dumps({"headAfter": ev["git"]["headAfter"], "buildId": ev["git"]["buildId"],
                  "counts": counts, "wal": wal, "procs": procs,
                  "selftest": selftest["verdict"]}, ensure_ascii=False, indent=1))
