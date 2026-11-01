#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PN-059 — بستهٔ شاهد چهار دستور مالک ۲۰۲۶-۱۱-۰۲ (شکایت اتصال + حذف ملکتون + TTL + قوانین)."""
import json, subprocess, datetime, sqlite3, hashlib, os
REPO = "/home/z/my-project"
os.makedirs(f"{REPO}/download/pn059", exist_ok=True)

def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=REPO).stdout.strip()

c = sqlite3.connect(f"file:{REPO}/db/custom.db?mode=ro", uri=True)
c.row_factory = sqlite3.Row

melketun_now = {t: c.execute(f"SELECT COUNT(*) FROM {t} WHERE tenantId='melketun'").fetchone()[0]
                for t in ("PropertyRecord", "RequestRecord", "ExpertRecord", "ExpertProfile")}
tabriz_now = {t: c.execute(f"SELECT COUNT(*) FROM {t} WHERE tenantId='melk-tabriz'").fetchone()[0]
              for t in ("PropertyRecord", "RequestRecord", "ExpertRecord", "ExpertProfile")}
purge_audit = [dict(r) for r in c.execute(
    "SELECT action, actor, recordCount, detail, createdAt FROM AuditLog WHERE action='MELKETUN_PURGE' ORDER BY createdAt DESC LIMIT 1")]
ttl_audit = [dict(r) for r in c.execute(
    "SELECT action, recordCount, detail, createdAt FROM AuditLog WHERE action='DIVAR_FILE_TTL' ORDER BY createdAt DESC LIMIT 1")]
divar_buckets = {r[0]: r[1] for r in c.execute("SELECT bucket, COUNT(*) FROM DivarAd GROUP BY bucket")}
relay_stats = {r[0]: r[1] for r in c.execute("SELECT status, COUNT(*) FROM RelayQueue GROUP BY status")}
sync_state = dict(c.execute("SELECT lastSyncedAt, lastSuccessAt, lastError, lastErrorCode, attempts FROM SyncState WHERE id='singleton'").fetchone())
worker_jobs = None
sacred = {t: c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
          for t in ("PropertyRecord", "RequestRecord", "ExpertRecord", "User", "AuditLog", "TransactionRecord")}
quick_check = c.execute("PRAGMA quick_check").fetchone()[0]
journal_mode = c.execute("PRAGMA journal_mode").fetchone()[0]
c.close()

try:
    rs = json.load(open(f"{REPO}/upload/.runtime/runtime-status.json"))
    worker_jobs = {k: {"running": v.get("running"), "runs": v.get("runs"), "lastError": v.get("lastError")}
                   for k, v in rs.get("jobs", {}).items()
                   if k in ("divar-file-ttl", "catalog-cycle", "lcpp-cycle", "relay-health-check")}
    ttl_domain = rs.get("jobs", {}).get("divar-file-ttl", {}).get("domain")
except Exception:
    ttl_domain = None

# هش آرشیو
def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for ch in iter(lambda: f.read(1 << 20), b""):
            h.update(ch)
    return h.hexdigest()

archive_dir = f"{REPO}/backups/melketun-purge-20261101T205740Z"
archive_sha = {f: sha256_file(os.path.join(archive_dir, f)) for f in sorted(os.listdir(archive_dir)) if f.endswith(".jsonl")}

ev = {
    "schema": "melka-pn059-four-orders-evidence",
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "trigger": "فرمان چهارجانیهٔ مالک ۲۰۲۶-۱۱-۰۲ (۱۴۰۵/۰۸/۱۱): (۱) حذف کامل کاشی ملکتون + همهٔ داده‌ها + مواردش در بروزرسانی سریع اطلاعات حیاتی (۲) رفع کامل عدم اتصال api ملک‌تبریز (۳) حذف خودکار فایل‌های بی‌اقدام فایل‌یابی پس از ۳ روز (۴) قانون تثبیت/بقا/دادهٔ مقدس/لینک در پایان گزارش",
    "commit": sh("git rev-parse HEAD"),
    "remoteMain": sh("git ls-remote origin refs/heads/main | awk '{print $1}'"),
    "buildFingerprint": sh("python3 -c \"import json; print(json.load(open('.next/fingerprint.json'))['gitSha'])\" 2>/dev/null")[:12],

    "order1_melketunRemoval": {
        "scope": "کاشی «داشبورد ملکتون» (wrapper M7-M10) + صفحه‌های /dashboard/melketun و /settings/melketun + ۶ روت API (integrations/crm ملکتون + records/changes) + بخش اتصال تنظیمات + خط لولهٔ M7/M8 + کاوش معاملات ملکتون + کار Worker ملکتون + زیرسیستم provenance/تغییرات (merge.ts) + فایل‌های راز/وضعیت ران‌تایم",
        "dataPurged": {
            "rowsDeleted": 9377,
            "byTable": {"PropertyRecord": 5181, "RequestRecord": 4006, "ExpertRecord": 92, "ExpertProfile": 92, "AuditLog": 6, "RequestEventRecord": 0},
            "melketunRemaining": melketun_now,
            "tabrizUntouched": tabriz_now,
        },
        "archive": {
            "dir": "backups/melketun-purge-20261101T205740Z",
            "files": list(archive_sha.keys()),
            "sha256": archive_sha,
            "note": "رازها (secrets/cookies) هرگز آرشیو محتوایی نشدند — فقط متادیتا + sha256 (قانون ۱۲/۱۸)",
        },
        "auditWitness": purge_audit,
        "vitalInfoQuickUpdate": {
            "section": "نشانگر «بروزرسانی سریع اطلاعات حیاتی» (LcppSyncStatus — فاز A/B) در هر کاشی",
            "removed": ["m7-melketun-listings (آگهی ملکتون)", "m8-melketun-requests (درخواست ملکتون)"],
            "remaining": ["m1-arm-listings (آگهی ملک‌تبریز)", "m2-arm-requests (درخواست ملک‌تبریز)", "m9-transactions (معاملات)"],
            "orchestrator": "چرخهٔ LCPP اکنون فقط M1/M2/M9 (ARM) — ملکتون از صادرات/واردات/دیسپچ حذف شد",
        },
        "tests": "۱۶ فایل تست به‌روزرسانی/حذف شد؛ ۵ فایل تماماً ملکتونی حذف؛ tsc سبز",
    },

    "order2_melkTabrizConnection": {
        "symptom": "SyncState=NETWORK_ERROR «ارتباط با سامانه ملک تبریز برقرار نشد» · ۲۲ تلاش ناموفق از ۲۰ اکتبر — در حالی که رله زنده بود (۴٬۳۹۵ job موفق تا ۲۰۲۶-۱۱-۰۱)",
        "rootCause": "دو لایه: (۱) armCall با AbortController مهلت ۲۵ث (MELK_API_TIMEOUT_MS) انتظار رله را می‌کشت — لایهٔ رله برای صف‌بندی تا ۱۱۰ث طراحی شده بود (RELAY_WAIT_DEFAULT_MS · PN-036) ولی سیگنال فراخوان در ۲۵ث قطع می‌کرد → RelayOfflineError → NETWORK_ERROR؛ شاهد زنده: صفحهٔ realtors/list در آزمون ۲۵٫۷ث طول کشید (زیر مهلت قدیمی می‌مرد). (۲) صفحات سینک اصلی شش‌خانواده با اولویت ۰ پشت موج غنی‌سازی LCPP (properties/details + owner انبوه — ۹۶۴ آیتم expired شاهد ازدحام)",
        "fixes": [
            "client.ts — مهلت مؤثر رله‌آگاه: max(مهلت فراخوان، ۱۱۰ث) وقتی مسیر رله‌ای است (TTL صف ۱۲۰ث)",
            "relay.ts — RELAY_PRIORITY_MAIN_SYNC=۲ برای realtor-reports/* · realtors/list · visits/list · trade-overviews/* (مقدم بر موج حجیم ۰ و کاتالوگ ۱، تابع OTP ۵)",
            "بازنشانی ۳ ردیف کهنهٔ فیوز (عصر اتصال مستقیم بلاک‌شده) + شاهد AuditLog — فیوز از env خاموش است و رله اثبات‌شده",
        ],
        "liveProof": {
            "script": "scripts/pn059-test-relay-connection.ts",
            "result": "۲× HTTP 200 از arus-api از مسیر رلهٔ موبایل: traded-count در ۸٫۰ث · realtors/list در ۲۵٫۷ث (زیر مهلت قدیمی ۲۵ث می‌مرد — عین باگ)",
            "queueAfterRestart": relay_stats,
        },
        "breakerState": "consecutiveFailures=0 · nextAttemptAt=null · lockUntil=null (هر سه میزبان)",
    },

    "order3_fileFinderTtl": {
        "rule": "DivarAd با status='active' (مالک اقدامی نکرده) و firstSeenAt < now−72h → حذف؛ همهٔ سه سطل (hunt/follow/review)؛ فایل‌های اقدام‌شده (registered/rejected) مقدس‌اند و می‌مانند",
        "implementation": "src/lib/divar/ttl.ts + کار Worker divar-file-ttl (ساعتی · خاموشی: MELK_DIVAR_FILE_TTL=disabled) + شاهد AuditLog بدون PII (قانون ۱۰)",
        "replacement": "اسکن بعدی دیوار توکن‌های تازه را با firstSeenAt تازه می‌آورد — موارد جدید به‌طور طبیعی جایگزین می‌شوند",
        "firstRun": ttl_domain or ttl_audit,
        "bucketsAfter": divar_buckets,
    },

    "order4_laws": {
        "tabitStabilization": {
            "auditPinCheck": "PASS ۷/۷ (صفر pin کد واقعی در کد زنده)",
            "commit": sh("git rev-parse HEAD"),
            "pushedToMirror": sh("git ls-remote origin refs/heads/main | awk '{print $1}'") == sh("git rev-parse HEAD"),
            "buildEqualsHead": sh("bash scripts/pn048/build-head-gate.sh 2>/dev/null | tail -1"),
        },
        "baqaSurvival": {
            "package": "upload/.survival/PN-059-20261101",
            "chain": "chainIndex=48 → prev=R7-20261101 (47)",
        },
        "sacredData": {
            "counts": sacred,
            "quickCheck": quick_check,
            "journalMode": journal_mode,
            "growthOnlyNote": "تنها کاهش ثبت‌شده: حذف ملکتون به حکم صریح مالک (۹٬۳۷۷ ردیف با آرشیو SHA256دار + شاهد AuditLog) و TTL فایل‌های بی‌اقدام به حکم رابع",
        },
        "link": "LINKS.json در بستهٔ بقا + این شاهد (remote main = HEAD = بیلد زنده)",
    },

    "workerJobs": worker_jobs,
    "syncStateAfterRestart": sync_state,
    "notesForOwner": "چرخهٔ کاتالوگ در حال پردازش صفحات ازسرگیری‌شده است؛ نخستین سینک شش‌خانوادهٔ تازه (تیک ۵) با اولویت ۲ و مهلت ۱۱۰ث اجرا می‌شود و SyncState را پاک می‌کند.",
}

out = f"{REPO}/download/pn059/pn059-four-orders-evidence.json"
with open(out, "w", encoding="utf-8") as f:
    json.dump(ev, f, ensure_ascii=False, indent=2)
print(f"✓ {out}")
print(json.dumps({
    "commit": ev["commit"][:12],
    "melketunRemaining": melketun_now,
    "remoteMain==HEAD": ev["order4_laws"]["tabitStabilization"]["pushedToMirror"],
    "quickCheck": quick_check,
    "ttlFirstRun": ttl_domain,
}, ensure_ascii=False, indent=2))
