#!/usr/bin/env python3
"""
P1-01c — مهاجرت بلوک‌های «شفافیت منبع داده» به اجزای مشترک
------------------------------------------------------
DataSourceWarning (معاملات/کارشناسان) + DataSourceAlert (شش صفحه دیگر)
+ حذف ۴ تعریف تکراری interface DataSourceInfo
"""

from pathlib import Path

ROOT = Path("/home/z/my-project/src/core/tiles/tiles")

# بلوک‌های کهربایی (هشدار + خط آخرین استخراج) — معاملات و کارشناسان
WARNING_BLOCK_TX = """      {/* شفافیت منبع داده */}
      {source && source.liveError && (
        <Card className="border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/30">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
            <div className="text-xs leading-relaxed space-y-1">
              <p className="font-bold">استخراج زنده از سامانه ملک تبریز در دسترس نیست</p>
              <p className="text-muted-foreground">
                {source.cached
                  ? "در حال حاضر داده‌های کش‌شده از آخرین استخراج موفق نمایش داده می‌شود."
                  : "هنوز هیچ داده‌ای از سامانه ملک تبریز استخراج نشده است."}{" "}
                {source.liveError}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {source && source.cached && !source.liveError && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Database className="w-3.5 h-3.5" aria-hidden />
          آخرین استخراج موفق از سامانه ملک تبریز: {source.lastSuccessAt ? faJalaliShort(source.lastSuccessAt) : "—"}
        </div>
      )}"""

WARNING_BLOCK_EX = WARNING_BLOCK_TX.replace(
    "هنوز هیچ داده‌ای از سامانه ملک تبریز استخراج نشده است.",
    "هنوز هیچ داده‌ای از سامانه استخراج نشده است.",
)

NEW_WARNING_TX = """      {/* شفافیت منبع داده */}
      <DataSourceWarning source={source} />"""

NEW_WARNING_EX = """      {/* شفافیت منبع داده */}
      <DataSourceWarning source={source} emptyText="هنوز هیچ داده‌ای از سامانه استخراج نشده است." />"""

# تعریف تکراری رابط (۴ نسخه)
DS_INTERFACE_FULL = """interface DataSourceInfo {
  real: boolean;
  cached: boolean;
  lastSuccessAt: string | null;
  lastSyncedAt: string | null;
  liveError: string | null;
  syncAttempts: number;
}"""

DS_INTERFACE_4 = """interface DataSourceInfo {
  real: boolean;
  cached: boolean;
  lastSuccessAt: string | null;
  liveError: string | null;
}"""

IMPORT_LINE = 'import { DataSourceAlert, DataSourceWarning, type DataSourceInfo } from "@/components/app/shared";'


def patch(path: Path, edits: list[tuple[str, str]], import_line: str = IMPORT_LINE) -> None:
    content = path.read_text()
    for old, new in edits:
        n = content.count(old)
        if n != 1:
            print(f"  ✗ {path.name}: الگو {n} بار (انتظار ۱): {old[:70]!r}")
            continue
        content = content.replace(old, new, 1)
    if import_line and import_line not in content:
        anchor = 'import { AgentPanel } from "@/components/app/AgentPanel";'
        if anchor not in content:
            anchor = 'import { KpiCard } from "@/components/app/shared";'
        assert anchor in content, f"{path.name}: آنکر import نیست"
        content = content.replace(anchor, anchor + "\n" + import_line, 1)
    path.write_text(content)
    print(f"  ✓ {path.name}")


# ===================== TransactionsPage =====================
patch(
    ROOT / "transactions/TransactionsPage.tsx",
    [
        (DS_INTERFACE_FULL + "\n\n", ""),
        (WARNING_BLOCK_TX, NEW_WARNING_TX),
    ],
)

# ===================== ExpertsPage =====================
patch(
    ROOT / "experts/ExpertsPage.tsx",
    [
        (DS_INTERFACE_4 + "\n\n", ""),
        (WARNING_BLOCK_EX, NEW_WARNING_EX),
    ],
)

# ===================== VisitsPage =====================
VISITS_ALERT = """      {/* شفافیت منبع داده */}
      {source && !source.cached && (
        <Alert>
          <Database aria-hidden />
          <AlertTitle>منبع داده</AlertTitle>
          <AlertDescription>
            داده واقعی از «سامانه مدیریت آگهی و درخواست» (آرم) استخراج می‌شود.
            {source.liveError ? ` آخرین خطا: ${source.liveError}` : " پس از ورود با کد پرسنلی و پیامک، همگام‌سازی خودکار انجام می‌شود."}
          </AlertDescription>
        </Alert>
      )}"""

VISITS_NEW = """      {/* شفافیت منبع داده */}
      <DataSourceAlert
        show={Boolean(source && !source.cached)}
        error={source?.liveError}
        fallback="پس از ورود با کد پرسنلی و پیامک، همگام‌سازی خودکار انجام می‌شود."
      >
        داده واقعی از «سامانه مدیریت آگهی و درخواست» (آرم) استخراج می‌شود.
      </DataSourceAlert>"""

patch(
    ROOT / "visits/VisitsPage.tsx",
    [
        (DS_INTERFACE_4 + "\n\n", ""),
        (VISITS_ALERT, VISITS_NEW),
    ],
)

# ===================== SupplyDemandPage =====================
SD_ALERT = VISITS_ALERT.replace(
    "داده واقعی از «سامانه مدیریت آگهی و درخواست» (آرم) استخراج می‌شود.",
    "گزارش واقعی از «سامانه مدیریت آگهی و درخواست» (آرم) استخراج می‌شود.",
)

SD_NEW = VISITS_NEW.replace(
    "داده واقعی از «سامانه مدیریت آگهی و درخواست» (آرم) استخراج می‌شود.",
    "گزارش واقعی از «سامانه مدیریت آگهی و درخواست» (آرم) استخراج می‌شود.",
)

patch(
    ROOT / "supply-demand/SupplyDemandPage.tsx",
    [
        (DS_INTERFACE_4 + "\n\n", ""),
        (SD_ALERT, SD_NEW),
    ],
)

# ===================== ContractsPage =====================
CONTRACTS_ALERT = """      {/* شفافیت منبع داده */}
      {data && !data.dataSource.cached && (
        <Alert>
          <Database aria-hidden />
          <AlertTitle>منبع داده</AlertTitle>
          <AlertDescription>
            صورت وضعیت‌ها (قراردادها) از «سامانه مدیریت آگهی و درخواست» (آرم) با توکن پرسنلی استخراج می‌شود.
            {data.dataSource.liveError ? ` آخرین خطا: ${data.dataSource.liveError}` : " پس از ورود با کد پرسنلی و پیامک، همگام‌سازی خودکار انجام می‌شود."}
          </AlertDescription>
        </Alert>
      )}"""

CONTRACTS_NEW = """      {/* شفافیت منبع داده */}
      <DataSourceAlert
        show={Boolean(data && !data.dataSource.cached)}
        error={data?.dataSource.liveError}
        fallback="پس از ورود با کد پرسنلی و پیامک، همگام‌سازی خودکار انجام می‌شود."
      >
        صورت وضعیت‌ها (قراردادها) از «سامانه مدیریت آگهی و درخواست» (آرم) با توکن پرسنلی استخراج می‌شود.
      </DataSourceAlert>"""

patch(
    ROOT / "contracts/ContractsPage.tsx",
    [
        (
            "  dataSource: { real: boolean; cached: boolean; lastSuccessAt: string | null; liveError: string | null };",
            "  dataSource: DataSourceInfo;",
        ),
        (CONTRACTS_ALERT, CONTRACTS_NEW),
    ],
)

# ===================== FinancePage =====================
FINANCE_ALERT = """      {/* شفافیت منبع داده */}
      {data && (data.dataSource.tariffLive || !data.dataSource.cached) && (
        <Alert>
          <Database aria-hidden />
          <AlertTitle>منبع داده</AlertTitle>
          <AlertDescription>
            {data.dataSource.tariffLive
              ? "تعرفه و نرخ‌نامه زنده از سامانه مالی ملک تبریز (اتحادیه مشاورین املاک) دریافت شده است."
              : "تعرفه زنده در دسترس نیست؛ محاسبه با قواعد رسمی نرخ‌نامه تبریز انجام می‌شود."}
            {data.dataSource.cached
              ? " تجمیع حق‌السهم از قراردادهای همگام‌شده محاسبه می‌شود."
              : " پس از ورود با کد پرسنلی، تجمیع حق‌السهم مشاوران و شعبه‌ها فعال می‌شود."}
            {data.dataSource.liveError ? ` آخرین خطا: ${data.dataSource.liveError}` : ""}
          </AlertDescription>
        </Alert>
      )}"""

FINANCE_NEW = """      {/* شفافیت منبع داده */}
      <DataSourceAlert show={Boolean(data && (data.dataSource.tariffLive || !data.dataSource.cached))} error={data?.dataSource.liveError}>
        {data?.dataSource.tariffLive
          ? "تعرفه و نرخ‌نامه زنده از سامانه مالی ملک تبریز (اتحادیه مشاورین املاک) دریافت شده است."
          : "تعرفه زنده در دسترس نیست؛ محاسبه با قواعد رسمی نرخ‌نامه تبریز انجام می‌شود."}
        {data?.dataSource.cached
          ? " تجمیع حق‌السهم از قراردادهای همگام‌شده محاسبه می‌شود."
          : " پس از ورود با کد پرسنلی، تجمیع حق‌السهم مشاوران و شعبه‌ها فعال می‌شود."}
      </DataSourceAlert>"""

patch(
    ROOT / "finance-commission/FinancePage.tsx",
    [
        (
            "  dataSource: { real: boolean; cached: boolean; lastSuccessAt: string | null; liveError: string | null; tariffLive: boolean };",
            "  dataSource: DataSourceInfo & { tariffLive: boolean };",
        ),
        (FINANCE_ALERT, FINANCE_NEW),
    ],
)

# ===================== CustomerClubPage =====================
CLUB_ALERT = """      {/* شفافیت منبع داده */}
      {data && (data.dataSource.catalogsLive || !data.dataSource.cached) && (
        <Alert>
          <Database aria-hidden />
          <AlertTitle>منبع داده</AlertTitle>
          <AlertDescription>
            {data.dataSource.catalogsLive
              ? "فهرست‌های مرجع (شخصیت/شغل/نقش/جدیت) زنده از سامانه ARM دریافت می‌شوند."
              : "فهرست‌های مرجع در دسترس نیست؛ داده کش‌شده نمایش داده می‌شود."}
            {data.dataSource.cached
              ? " جامعه مشتریان از معاملات و قراردادهای همگام‌شده محاسبه می‌شود."
              : " پس از ورود با کد پرسنلی و پیامک، جامعه مشتریان از معاملات واقعی ساخته می‌شود."}
            {data.dataSource.liveError ? ` آخرین خطا: ${data.dataSource.liveError}` : ""}
          </AlertDescription>
        </Alert>
      )}"""

CLUB_NEW = """      {/* شفافیت منبع داده */}
      <DataSourceAlert show={Boolean(data && (data.dataSource.catalogsLive || !data.dataSource.cached))} error={data?.dataSource.liveError}>
        {data?.dataSource.catalogsLive
          ? "فهرست‌های مرجع (شخصیت/شغل/نقش/جدیت) زنده از سامانه ARM دریافت می‌شوند."
          : "فهرست‌های مرجع در دسترس نیست؛ داده کش‌شده نمایش داده می‌شود."}
        {data?.dataSource.cached
          ? " جامعه مشتریان از معاملات و قراردادهای همگام‌شده محاسبه می‌شود."
          : " پس از ورود با کد پرسنلی و پیامک، جامعه مشتریان از معاملات واقعی ساخته می‌شود."}
      </DataSourceAlert>"""

patch(
    ROOT / "customer-club/CustomerClubPage.tsx",
    [
        (
            "  dataSource: { real: boolean; cached: boolean; lastSuccessAt: string | null; liveError: string | null; catalogsLive: boolean };",
            "  dataSource: DataSourceInfo & { catalogsLive: boolean };",
        ),
        (CLUB_ALERT, CLUB_NEW),
    ],
)

# ===================== PriceIndexPage (شکل dataSource متفاوت — فقط رندر) =====================
PI_ALERT = """      {/* شفافیت منبع داده */}
      {data && (
        <Alert>
          <Database aria-hidden />
          <AlertTitle>منبع داده</AlertTitle>
          <AlertDescription>
            {data.dataSource.liveIndices
              ? "پیکربندی شاخص‌های رسمی زنده از سامانه ARM (مناطق تحت پوشش و مشخصات فنی) دریافت شده است."
              : "پیکربندی شاخص رسمی در دسترس نیست؛ آمار بر پایه داده بازار محاسبه می‌شود."}
            {" "}آمار منطقه‌ای از {faNumber(data.dataSource.marketSamples)} آگهی واقعی بازار (با منطقه تطبیق‌شده) محاسبه می‌شود.
            {data.dataSource.liveError ? ` آخرین خطا: ${data.dataSource.liveError}` : ""}
          </AlertDescription>
        </Alert>
      )}"""

PI_NEW = """      {/* شفافیت منبع داده */}
      <DataSourceAlert show={Boolean(data)} error={data?.dataSource.liveError}>
        {data?.dataSource.liveIndices
          ? "پیکربندی شاخص‌های رسمی زنده از سامانه ARM (مناطق تحت پوشش و مشخصات فنی) دریافت شده است."
          : "پیکربندی شاخص رسمی در دسترس نیست؛ آمار بر پایه داده بازار محاسبه می‌شود."}
        {" "}آمار منطقه‌ای از {faNumber(data?.dataSource.marketSamples ?? 0)} آگهی واقعی بازار (با منطقه تطبیق‌شده) محاسبه می‌شود.
      </DataSourceAlert>"""

patch(
    ROOT / "price-index/PriceIndexPage.tsx",
    [
        (PI_ALERT, PI_NEW),
    ],
    import_line='import { DataSourceAlert, type DataSourceInfo } from "@/components/app/shared";',
)

print("تمام — هشت صفحه به اجزای منبع داده مشترک مهاجرت یافتند")
