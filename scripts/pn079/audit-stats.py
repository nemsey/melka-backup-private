#!/usr/bin/env python3
"""PN-079 · حسابرسی فراجامع آمارهای اعلامی همهٔ بخش‌ها در برابر حقیقت DB
هر آماری که UI نمایش می‌دهد ← منبع API آن ← مقایسه با COUNT مستقیم DB."""
import sqlite3, json, datetime, subprocess, sys, time

TOK = open('/tmp/tok.txt').read().strip()
OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/z/my-project/download/PN-079/stats-audit-before.json'
BASE = 'http://localhost:3000'

def api(path, timeout=120):
    t0 = time.time()
    r = subprocess.run(['curl', '-s', '--compressed', '-m', str(timeout), f'{BASE}{path}',
                        '-H', f'Authorization: Bearer {TOK}'], capture_output=True, text=True)
    dt = time.time() - t0
    try:
        return json.loads(r.stdout), dt
    except Exception:
        return {"_error": r.stdout[:200]}, dt

def ts(ms):
    return datetime.datetime.fromtimestamp(ms / 1000).isoformat() if ms else None

audit = {"generatedAt": datetime.datetime.now().isoformat(), "sections": {}}

# ---------- الف) حقیقت DB ----------
con = sqlite3.connect('file:/home/z/my-project/db/custom.db?mode=ro', uri=True)
cur = con.cursor()
p_total = cur.execute("SELECT COUNT(*) FROM PropertyRecord WHERE tenantId='melk-tabriz'").fetchone()[0]
p_pend = cur.execute("SELECT COUNT(*) FROM PropertyRecord WHERE tenantId='melk-tabriz' AND extractionBatchId IS NULL").fetchone()[0]
r_total = cur.execute("SELECT COUNT(*) FROM RequestRecord WHERE tenantId='melk-tabriz'").fetchone()[0]
r_pend = cur.execute("SELECT COUNT(*) FROM RequestRecord WHERE tenantId='melk-tabriz' AND extractionBatchId IS NULL").fetchone()[0]
tx_total = cur.execute("SELECT COUNT(*) FROM TransactionRecord").fetchone()[0]
p_status_sum = cur.execute("SELECT COALESCE(SUM(c),0) FROM (SELECT COUNT(*) c FROM PropertyRecord WHERE tenantId='melk-tabriz' GROUP BY status)").fetchone()[0]
r_status_sum = cur.execute("SELECT COALESCE(SUM(c),0) FROM (SELECT COUNT(*) c FROM RequestRecord WHERE tenantId='melk-tabriz' GROUP BY status)").fetchone()[0]
ckpts = {r[0]: {"phase": r[1], "page": r[2], "pages": r[3], "totalAtSource": r[4],
                "updatedAt": ts(r[5]), "completedAt": ts(r[6])}
         for r in cur.execute("SELECT id, phase, lastCompletedPage, totalPages, totalAtSource, updatedAt, completedAt FROM SyncCheckpoint")}
con.close()

truth = {"PropertyRecord": p_total, "P_enrichment": {"total": p_total, "pending": p_pend, "complete": p_total - p_pend},
         "P_statusSum": p_status_sum,
         "RequestRecord": r_total, "R_enrichment": {"total": r_total, "pending": r_pend, "complete": r_total - r_pend},
         "R_statusSum": r_status_sum, "TransactionRecord": tx_total, "checkpoints": ckpts}
audit["db_truth"] = truth

# ---------- ب) کاشی آگهی ملک تبریز ----------
d, dt = api('/api/crm/arm-catalog/listings')
audit["sections"]["listings_tile"] = {
    "api_ms": round(dt * 1000),
    "kpi_total_shows": d.get("total"),
    "rows_returned": len(d.get("rows", [])),
    "limit_field": d.get("limit"),
    "enrichment": d.get("enrichment"),
    "statusCounts_total": d.get("statusCounts", {}).get("total"),
    "lastUpdate": d.get("lastUpdate"),
    "vs_truth": {"kpi_gap": p_total - (d.get("total") or 0),
                 "rows_gap": p_total - len(d.get("rows", [])),
                 "enrichment_gap": p_total - (d.get("enrichment") or {}).get("total", 0)},
    "verdict_kpi": "WRONG (capped)" if (d.get("total") or 0) < p_total else "OK",
}

# ---------- ج) کاشی فهرست درخواست ----------
d2, dt2 = api('/api/crm/arm-catalog/requests')
audit["sections"]["requests_tile"] = {
    "api_ms": round(dt2 * 1000),
    "kpi_total_shows": d2.get("total"),
    "rows_returned": len(d2.get("rows", [])),
    "enrichment": d2.get("enrichment"),
    "statusCounts_total": d2.get("statusCounts", {}).get("total"),
    "lastUpdate": d2.get("lastUpdate"),
    "vs_truth": {"kpi_gap": r_total - (d2.get("total") or 0),
                 "rows_gap": r_total - len(d2.get("rows", []))},
    "verdict_kpi": "WRONG (capped)" if (d2.get("total") or 0) < r_total else "OK",
}

# ---------- د) معاملات ----------
d3, dt3 = api('/api/crm/transactions')
audit["sections"]["transactions_tile"] = {
    "api_ms": round(dt3 * 1000),
    "total_shows": d3.get("total"),
    "rows_returned": len(d3.get("rows", [])),
    "vs_truth_gap": tx_total - (d3.get("total") or 0),
    "verdict": "OK" if (d3.get("total") or 0) == tx_total else ("CAPPED" if (d3.get("total") or 0) < tx_total else "?"),
}

# ---------- ه) باشگاه مشتریان ----------
d4, dt4 = api('/api/crm/customer-club')
cust = d4.get("customers", {})
audit["sections"]["customer_club"] = {
    "api_ms": round(dt4 * 1000),
    "total_shows": cust.get("total"),
    "rows_returned": len(cust.get("rows", [])),
    "rows_capped_at": 25000 if len(cust.get("rows", [])) == 25000 else None,
    "stats": cust.get("stats"),
}

# ---------- و) بخش بروزرسانی فهرست (چک‌پوینت) ----------
audit["sections"]["update_section"] = {
    "listings_checkpoint": ckpts.get("listings"),
    "requests_checkpoint": ckpts.get("requests"),
    "note": "totalAtSource = شمار منبع ARM در شروع چرخه (متجمع محلی همیشه ≥ منبع چون اسکن عمومی + چرخه‌های متعدد)",
}

json.dump(audit, open(OUT, 'w'), ensure_ascii=False, indent=2, default=str)
print(json.dumps({"db_truth": {"P": p_total, "R": r_total, "TX": tx_total},
                  "listings_kpi_shows": audit["sections"]["listings_tile"]["kpi_total_shows"],
                  "listings_verdict": audit["sections"]["listings_tile"]["verdict_kpi"],
                  "requests_kpi_shows": audit["sections"]["requests_tile"]["kpi_total_shows"],
                  "requests_verdict": audit["sections"]["requests_tile"]["verdict_kpi"],
                  "tx_shows": audit["sections"]["transactions_tile"]["total_shows"],
                  "club_total": audit["sections"]["customer_club"]["total_shows"]},
                 ensure_ascii=False, indent=1))
