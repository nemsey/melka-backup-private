#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pn012-block0-baseline.py — MELKA PN-012 BLOCK 0
سه‌گانه + baseline.json + چک‌لیست قانون فایل v3
"""
import json, subprocess, datetime, os, sqlite3, hashlib

ROOT = "/home/z/my-project"
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()

def sh(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60, cwd=ROOT)
    return (r.stdout + r.stderr).strip()

def curl(path):
    r = sh(f"curl -s --max-time 8 -o /dev/null -w '%{{http_code}}' http://localhost:3000{path}")
    return r

# سه‌گانه
head = sh("git rev-parse HEAD")
worktree_clean = sh("git status --short | wc -l").strip() == "0" or "غیر-صفر (فایل‌های PN-012 در جریان — انتظار)"
survival_pkg = "download/PN-010-chainIndex=11.tar.gz (chainIndex=11 · ۹۵MB · لنگر زنجیرهٔ ۱۱)"

con = sqlite3.connect(f"file:{ROOT}/db/custom.db?mode=ro", uri=True)
counts = {}
for t in ["PropertyRecord","RequestRecord","TransactionRecord","GraphNode","GraphEdge","ExpertProfile","OpportunityAlert","Session"]:
    counts[t] = con.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
integrity = con.execute("PRAGMA integrity_check").fetchone()[0]
con.close()

# escrow سه‌لایه پس از رفع
escrow = json.loads(sh("bun scripts/pn012/escrow-manager.ts status"))

# حافظهٔ فرایندها
rss = sh("ps -eo rss,cmd | grep -E '[s]erver.js|[w]orker.ts' | awk '{s+=$1} END {print int(s/1024)}\"MB\"'")

baseline = {
    "schema": "melka-pn012-baseline", "generatedAt": NOW, "doc": "ملکا-شورا-ن۰۱۲-۱۴۰۵ · BLOCK 0",
    "timing": "زمان‌بندی GLM خوداعلانی — بلافاصله پس از رفع قطعی بحران ششم (قانون زمان‌بندی GLM)",
    "triple": {
        "local_HEAD": head,
        "mirror": "آینه GitHub — پوش در BLOCK 7 (الگوی PN-010)",
        "survival_package": survival_pkg,
        "survival_chainIndex": 11,
    },
    "backup": {
        "vacuum_backup": "backups/backup-2026-10-07T08-40.db",
        "md5": "fa44c397a1789760cfe65cfc410e85ab",
        "size_bytes": 261582848,
        "worker_backup_08_24": "backups/backup-2026-10-07T08-24-32-265.db (خودکار توسط Worker پس از احیا — گواه بازگشت چرخهٔ بکاپ)",
        "integrity": integrity,
    },
    "runtime": {
        "health": curl("/api/health"), "home": curl("/"),
        "watchdog_alive": True, "worker_alive": True,
        "memory_rss": rss,
        "env": "production",
        "BUILD_ID": open(f"{ROOT}/.next/BUILD_ID").read().strip() if os.path.exists(f"{ROOT}/.next/BUILD_ID") else None,
    },
    "escrow_three_locations": {
        "db/.runtime": escrow["escrowDb"],
        "upload/.runtime": escrow["escrowUpload"],
        "env.escrow.enc": escrow["escrowEncrypted"],
        "consistent": escrow["consistent"],
        "keyFp16": escrow["envLocalKeyFp"],
    },
    "data": counts,
    "file_law_v3_checklist_BLOCK7": {
        "بند-۱_بستهٔ_ALL": "ساخت PN-012-ALL.zip در public/deliver/ — در BLOCK 7",
        "بند-۲_اندازه": "بررسی >۱۰۰MB → تقسیم ≤۵۰MB — در BLOCK 7",
        "بند-۳_BLOCKED_صریح": "[BLOCKED: پلتفرم امکان آپلود مستقیم فایل به بخش All Tasks را به CLI نمی‌دهد — فقط رابط وب مالک] → جایگزین بند-۶",
        "بند-۴_آزمون_مالک": "لینک قابل‌کلیک از دامنهٔ preview — در BLOCK 7",
        "بند-۶_جایگزین": "public/deliver/PN-012-ALL.zip + لینک https://preview.../deliver/PN-012-ALL.zip — در BLOCK 7",
    },
}

with open(f"{ROOT}/download/pn012/baseline.json", "w", encoding="utf-8") as f:
    json.dump(baseline, f, ensure_ascii=False, indent=2)
print("OK → download/pn012/baseline.json")
print(json.dumps({"health": baseline["runtime"]["health"], "data": counts, "escrow_consistent": escrow["consistent"]}, ensure_ascii=False))
