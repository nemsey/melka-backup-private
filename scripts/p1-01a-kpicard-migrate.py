#!/usr/bin/env python3
"""
P1-01a — مهاجرت کارت‌های KPI به کامپوننت مشترک KpiCard
------------------------------------------------------
جایگزینی بلوک‌های تکراری «Card > CardContent p-4 flex items-center gap-3»
با <KpiCard> در ۸ صفحه CRM — با تطبیق دقیق بایت‌به‌بایت و شمارش شاهد.
"""

import sys
from pathlib import Path

ROOT = Path("/home/z/my-project/src/core/tiles/tiles")


def patch(path: Path, edits: list[tuple[str, str]], must: list[str] = []) -> None:
    content = path.read_text()
    for old, new in edits:
        n = content.count(old)
        if n != 1:
            print(f"  ✗ {path.name}: الگو {n} بار یافت شد (انتظار ۱) — از این ویرایش صرف‌نظر: {old[:60]!r}")
            continue
        content = content.replace(old, new)
    path.write_text(content)
    ok = all(m in content for m in must)
    print(f"  {'✓' if ok else '⚠'} {path.name}")


# ===================== TransactionsPage (سبک div) =====================
tx = ROOT / "transactions/TransactionsPage.tsx"
patch(
    tx,
    [
        (
            """          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Calculator className="w-5 h-5 text-primary" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">تعداد کل معاملات</p>
                <p className="text-xl font-extrabold tabular-nums">{faNumber(summary.totalCount)}</p>
              </div>
            </CardContent>
          </Card>""",
            """          <KpiCard
            label="تعداد کل معاملات"
            value={faNumber(summary.totalCount)}
            icon={Calculator}
            iconAs="div"
            iconWrapperClassName="bg-primary/10"
            iconColorClassName="text-primary"
          />""",
        ),
        (
            """          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-950 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-teal-600 dark:text-teal-400" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">دارای رویداد</p>
                <p className="text-xl font-extrabold tabular-nums">{faNumber(summary.hasRequestEvent)}</p>
              </div>
            </CardContent>
          </Card>""",
            """          <KpiCard
            label="دارای رویداد"
            value={faNumber(summary.hasRequestEvent)}
            icon={TrendingUp}
            iconAs="div"
            iconWrapperClassName="bg-teal-100 dark:bg-teal-950"
            iconColorClassName="text-teal-600 dark:text-teal-400"
          />""",
        ),
        (
            """          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-amber-600" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">دارای آگهی پیشنهادی</p>
                <p className="text-xl font-extrabold tabular-nums">{faNumber(summary.hasSuggestedProperty)}</p>
              </div>
            </CardContent>
          </Card>""",
            """          <KpiCard
            label="دارای آگهی پیشنهادی"
            value={faNumber(summary.hasSuggestedProperty)}
            icon={Sparkles}
            iconAs="div"
            iconWrapperClassName="bg-amber-100 dark:bg-amber-950"
            iconColorClassName="text-amber-600"
          />""",
        ),
        (
            """          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-950 flex items-center justify-center shrink-0">
                <Percent className="w-5 h-5 text-teal-600 dark:text-teal-400" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">دارای هر دو</p>
                <p className="text-xl font-extrabold tabular-nums">{faNumber(summary.hasBoth)}</p>
              </div>
            </CardContent>
          </Card>""",
            """          <KpiCard
            label="دارای هر دو"
            value={faNumber(summary.hasBoth)}
            icon={Percent}
            iconAs="div"
            iconWrapperClassName="bg-teal-100 dark:bg-teal-950"
            iconColorClassName="text-teal-600 dark:text-teal-400"
          />""",
        ),
    ],
    must=['<KpiCard', 'label="دارای هر دو"'],
)

# ===================== ExpertsPage (سبک div — ۳ کارت اول) =====================
ex = ROOT / "experts/ExpertsPage.tsx"
ex_content = ex.read_text()

# کارت‌های ۱ و ۲ (کل کاربران / کاربران فعال) — ساختار div
edits_ex = []
for label, icon, bg, color, expr in [
    ("کل کاربران", "Users", "bg-primary/10", "text-primary", "faNumber(kpis.count)"),
    ("کاربران فعال", "UserCheck", "bg-teal-100 dark:bg-teal-950", "text-teal-600 dark:text-teal-400", "faNumber(kpis.active)"),
]:
    old = f"""          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl {bg} flex items-center justify-center shrink-0">
                <{icon} className="w-5 h-5 {color}" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-extrabold tabular-nums">{{{expr}}}</p>
              </div>
            </CardContent>
          </Card>"""
    new = f"""          <KpiCard
            label="{label}"
            value={{{expr}}}
            icon={{{icon}}}
            iconAs="div"
            iconWrapperClassName="{bg}"
            iconColorClassName="{color}"
          />"""
    edits_ex.append((old, new))
patch(ex, edits_ex, must=['<KpiCard'])

print("تمام — کارت‌های سبک div مهاجرت یافتند (کارت‌های شاخص کارشناس برتر جفت‌کاری ساختار متفاوت دارند و دست‌نخورده می‌مانند)")
