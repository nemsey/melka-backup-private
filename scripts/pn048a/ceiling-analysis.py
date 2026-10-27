#!/usr/bin/env python3
# ============================================================================
# ceiling-analysis.py — تحلیل سقف مجاز M7/M8 صرفاً از DB خودی (DIR-PN048A)
# ----------------------------------------------------------------------------
# صفر درخواست شبکه‌ای. منبع یگانه: db/custom.db (خواندن‌تنها).
# خروجی: download/PN048A/ceiling-analysis-ownscope.json
# فلسفه: سقف پوشش PII مالک/متقاضی بدون مجوز بهره‌بردار melketun.com فقط از
# دادهٔ خودی (scope حساب جاری) محاسبه می‌شود — نه از برداشت ثالث.
# ============================================================================
import json
import sqlite3
import datetime

OUT = "/home/z/my-project/download/PN048A/ceiling-analysis-ownscope.json"

conn = sqlite3.connect("file:/home/z/my-project/db/custom.db?mode=ro", uri=True)


def scalar(q, *a):
    try:
        return conn.execute(q, a).fetchone()[0]
    except Exception:
        return None


def filled(table, col, tenant):
    return scalar(
        f"SELECT COUNT(*) FROM {table} WHERE tenantId=? AND {col} IS NOT NULL AND {col} != ''",
        tenant,
    )


def seg(table, tenant):
    """توزیع رکوردها بر اساس منبع (rawSourceVersion) — پایهٔ provenance."""
    try:
        rows = conn.execute(
            f"SELECT rawSourceVersion, COUNT(*) FROM {table} WHERE tenantId=? GROUP BY 1 ORDER BY 2 DESC",
            (tenant,),
        ).fetchall()
        return {str(k): v for k, v in rows}
    except Exception:
        return {}


now = datetime.datetime.now(datetime.timezone.utc).isoformat()

# ─── M7: فهرست آگهی ملکتون (ستون مالک) ───
m7_total = scalar("SELECT COUNT(*) FROM PropertyRecord WHERE tenantId='melketun'")
m7_owner = filled("PropertyRecord", "rawOwnerName", "melketun")
m7_owner_mobile = filled("PropertyRecord", "rawOwnerMobile", "melketun")
m7_agency_name = filled("PropertyRecord", "ownerName", "melketun")
m7_owner_mobile_col = filled("PropertyRecord", "ownerMobile", "melketun")

# ─── M8: فهرست درخواست ملکتون (ستون متقاضی) ───
m8_total = scalar("SELECT COUNT(*) FROM RequestRecord WHERE tenantId='melketun'")
m8_customer = filled("RequestRecord", "rawCustomerName", "melketun")
m8_customer_mobile = filled("RequestRecord", "rawCustomerMobile", "melketun")
m8_customer_name_col = filled("RequestRecord", "customerName", "melketun")
m8_customer_mobile_col = filled("RequestRecord", "customerMobile", "melketun")

out = {
    "directive": "DIR-PN048A",
    "generatedAt": now,
    "method": "own-database-only (zero network requests; source=sqlite ro)",
    "M7_listings_melketun": {
        "total": m7_total,
        "rawOwnerName_filled": m7_owner,
        "rawOwnerMobile_filled": m7_owner_mobile,
        "ownerName_agency_filled": m7_agency_name,
        "ownerMobile_filled": m7_owner_mobile_col,
        "coverage_owner_column_pct": round((m7_owner or 0) * 100.0 / m7_total, 2) if m7_total else None,
        "source_segments": seg("PropertyRecord", "melketun"),
    },
    "M8_requests_melketun": {
        "total": m8_total,
        "rawCustomerName_filled": m8_customer,
        "rawCustomerMobile_filled": m8_customer_mobile,
        "customerName_filled": m8_customer_name_col,
        "customerMobile_filled": m8_customer_mobile_col,
        "coverage_customer_column_pct": round((m8_customer or 0) * 100.0 / m8_total, 2) if m8_total else None,
        "coverage_customerName_pct": round((m8_customer_name_col or 0) * 100.0 / m8_total, 2) if m8_total else None,
        "source_segments": seg("RequestRecord", "melketun"),
    },
    "context_tabriz_tenant": {
        "property_total": scalar("SELECT COUNT(*) FROM PropertyRecord WHERE tenantId='melk-tabriz'"),
        "request_total": scalar("SELECT COUNT(*) FROM RequestRecord WHERE tenantId='melk-tabriz'"),
    },
    "ceiling_analysis": {
        "current": {"M7_owner_pct": None, "M8_customer_pct": None},
        "achievable_authorized_with_current_account_scope": {
            "note": "حساب جاری (is_admin=0) فقط ~۵۰ آگهی/۱۹ درخواست خصوصی را می‌بیند؛ "
            "پوشش فعلی همین رکوردهای خودی را شامل می‌شود و سقفِ مجازِ فعلی عملاً رسیده است.",
            "M7_pct": None,
            "M8_pct": None,
        },
        "requires_operator_grant": "مابقی پوشش (تا سقف واقعی CRM) نیازمند مجوز کتبی بهره‌بردار "
        "melketun.com (ارتقای is_admin یا scope رسمی API) است — پیش از آن هیچ رقم قابل‌اعتمادی "
        "برای «achievable» قابل ادعا نیست (قانون ۰۲ و ۰۱: بدون شاهد، عدد نزن).",
        "honest_verdict": "سقف واقعی M7/M8 پشت دروازهٔ مجوز بهره‌بردار است، نه پشت بردارهای فنی. "
        "هر برداشت PII ثالث از CRM ملکتون بدون آن مجوز، خارج از دامنهٔ مجاز نقش جاری است — "
        "طبق تعریف خودِ دستور (بند ۱: «دامنهٔ مجاز نقش: داده‌هایی که نقش/حساب جاری مجاز به دیدن آن‌هاست»).",
    },
}

# پرکردن درصدها
out["ceiling_analysis"]["current"]["M7_owner_pct"] = out["M7_listings_melketun"]["coverage_owner_column_pct"]
out["ceiling_analysis"]["current"]["M8_customer_pct"] = out["M8_requests_melketun"]["coverage_customer_column_pct"]
out["ceiling_analysis"]["achievable_authorized_with_current_account_scope"]["M7_pct"] = out["M7_listings_melketun"]["coverage_owner_column_pct"]
out["ceiling_analysis"]["achievable_authorized_with_current_account_scope"]["M8_pct"] = out["M8_requests_melketun"]["coverage_customer_column_pct"]

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(json.dumps(out, ensure_ascii=False, indent=2))
