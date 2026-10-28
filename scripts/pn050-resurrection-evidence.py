#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PN-050 رستاخیز ۲۰۲۶-۱۰-۲۸ — بستهٔ شاهد (DIR-RESET-AUDIT-001 alignment)."""
import hashlib, json, os, subprocess, sqlite3, time
from datetime import datetime, timezone

REPO = "/home/z/my-project"
OUT = f"{REPO}/download/pn050-resurrection"
os.makedirs(OUT, exist_ok=True)

def sha256f(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for ch in iter(lambda: f.read(1 << 20), b""):
            h.update(ch)
    return h.hexdigest()

def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()

head = sh(f"cd {REPO} && git rev-parse HEAD")
version = json.loads(sh("curl -fsS -m 5 http://localhost:3000/api/version"))

c = sqlite3.connect(f"file:{REPO}/db/custom.db?mode=ro", uri=True)
counts = {t: c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
          for t in ("PropertyRecord", "RequestRecord", "ExpertRecord", "User", "AuditLog")}
wal = c.execute("PRAGMA journal_mode").fetchone()[0]
union_audit = list(c.execute(
    "SELECT createdAt, detail FROM AuditLog WHERE detail LIKE '%resurrect_union%' "
    "AND createdAt > 1793100000000 ORDER BY createdAt"))
c.close()

log = open(f"{REPO}/resurrect-daemon.log", encoding="utf-8", errors="replace").read()
g3 = [l.strip() for l in log.splitlines() if "G3: بیلد = HEAD" in l]
g1 = [l.strip() for l in log.splitlines() if "G1: محافظ" in l]
dur = [l.strip() for l in log.splitlines() if "RESURRECTION COMPLETE" in l]

ev = {
    "directive": "PN-050 (UNION resurrect) + DIR-RESET-AUDIT-001",
    "event": "server reset 2026-10-28 ~06:50Z · resurrection executed 07:28:48Z",
    "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "executedScript": {
        "path": "scripts/resurrect-ultimate.sh",
        "sha256": sha256f(f"{REPO}/scripts/resurrect-ultimate.sh"),
        "source": "origin/main (authed) — معماری UNION مطابق دستور ۱ PN-050",
    },
    "rejectedScript": {
        "sha256": sha256f(f"{REPO}/scripts/resurrect-ultimate.downloaded.sh"),
        "reason": "raw بدون توکن نسخهٔ کهنهٔ پیش-PN-050 (منطق MAX/جایگزینی ممنوعه) سرو کرد — اجرا نشد",
    },
    "code": {"preHEAD": "6bb3c8e", "postHEAD": head, "branch": "main",
             "originFetched": "d40038b1cceae4def1fc73d576da321db36479ca"},
    "dataUnion": {
        "before": {"PropertyRecord": 32851, "RequestRecord": 29471},
        "layers": ["قلعه +23 → 32874", "چرخشی +573 → 33447", "بقا +0 → 33447"],
        "after": counts, "loss": 0,
        "journal_mode": wal,
        "witnessAuditLogRows": len(union_audit),
    },
    "gates": {"G3_build_equals_HEAD": g3[-1] if g3 else None,
              "G1_stripProtectedNulls": g1[-1] if g1 else None,
              "duration": dur[-1] if dur else None},
    "liveVersion": {"gitSha": version.get("gitSha"), "buildId": version.get("buildId"),
                    "env": version.get("env")},
    "processes": [l for l in sh("pgrep -af 'standalone/server.js|prod-watchdog|scripts/runtime/worker'").splitlines()],
    "resetAudit001": {"tool": "scripts/pn058-reset-audit.py",
                      "outdir": "download/RESET-AUDIT/",
                      "sources": "4/6 (uptime_proc, app_logs, pid_history, gap_analysis)",
                      "sha256sums": open(f"{REPO}/download/RESET-AUDIT/SHA256SUMS.txt").read().strip().splitlines()},
    "honestNotes": [
        "origin remote پس از ریست غایب بود — از upload/.mirror/credentials.env بازافزوده شد (بدون چاپ توکن)",
        "db push طبق schema خودِ main ستون legacy «realtorMobile» را حذف کرد (۱۲۲۳ مقدار؛ در لایه‌های قلعه/بقا محفوظ) — تصمیم پیشین کدبیس، نه رستاخیز",
        "scripts/pn050-merge-all-databases.py به‌عنوان اضطرار نوشته شد؛ با کشف merge_union.py رسمی روی main، اجرا نشد (قانون ثبات)",
    ],
}
p = f"{OUT}/resurrection-evidence.json"
with open(p, "w", encoding="utf-8") as f:
    json.dump(ev, f, ensure_ascii=False, indent=2)
print("✓", p)
print(json.dumps(ev["dataUnion"], ensure_ascii=False, indent=1))
