"use client";

/**
 * بخش «هشدار فرصت + کارهای پس‌زمینه» — P6545/گام۱ (BLOCK 1.1 + 1.4) · PN-083
 * ---------------------------------------------------------------------------
 * · هشدار فرصت: تطبیق آگهی↔درخواست با امتیاز ≥ ۰٫۷ (صفر اجرای خودکار)
 * · وضعیت کارهای پس‌زمینه: از DB (SyncJobState) — پایدار در برابر ری‌استارت
 *
 * PN-083 (هماهنگ‌ساز چهار فهرست — دستور مالک: «هماهنگی کامل … با بخش کارهای
 * پس‌زمینهٔ تنظیمات»):
 *   · چهار فهرست داشبورد ملک تبریز (M1 آگهی‌ها · M2 درخواست‌ها · M3 معاملات ·
 *     M4 مشاوران) حالا همین‌جا، در صدر فهرست، با همان حقیقتی که نوار داشبورد و
 *     دکمه‌های هر فهرست نشان می‌دهند نمایش می‌یابند (یک منبع: SyncJobState).
 *   · منبع آخرین اجرا (چرخهٔ خودکار / بروزرسانی دستی / درخواست فوری مالک)
 *     و خطای احتمالی، صادقانه زیر هر کار می‌آید.
 *   · پایش زندهٔ خودکار: حین اجرا هر ۱۵ ثانیه، در سکون هر ۶۰ ثانیه — دیگر
 *     «پیشرفت در جریان» پشت دکمهٔ رفرش دستی پنهان نمی‌ماند.
 * نمایش در کاشی «تنظیمات عمومی» (عین مصوبهٔ جلسهٔ ۰۳۳).
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { BellRing, HardDriveDownload, RefreshCw } from "lucide-react";
import { api } from "@/lib/client/api";
import { faDigits } from "@/lib/format";

interface AlertView {
  id: string;
  direction: "listing_to_request" | "request_to_listing";
  listingCode: string | null;
  requestId: string | null;
  matchScore: number;
  matchReasons: Array<{ factor: string; value: number }>;
  status: string;
  emittedAt: string;
}
interface JobView {
  jobId: string;
  jobKind: string;
  status: string;
  lastCompletedPage: number;
  resumedFrom: number;
  totalPages: number;
  progressPercent: number;
  updatedAt: string;
  detail: Record<string, unknown> | null;
}

/** PN-083 — چهار فهرست اول می‌آیند؛ سپس کارهای کاتالوک/غنی‌سازی/سینک اصلی */
const JOB_ORDER = [
  "list-m1-arm-listings",
  "list-m2-arm-requests",
  "list-m3-transactions",
  "list-m4-experts",
  "catalog-listings",
  "catalog-requests",
  "catalog-enrich-listings",
  "catalog-enrich-requests",
  "main-sync",
  "crm-sync",
];

const JOB_LABELS: Record<string, string> = {
  "list-m1-arm-listings": "فهرست آگهی‌ها (M1)",
  "list-m2-arm-requests": "فهرست درخواست‌ها (M2)",
  "list-m3-transactions": "فهرست معاملات (M3)",
  "list-m4-experts": "فهرست مشاوران (M4)",
  "catalog-listings": "همگام‌سازی کاتالوگ آگهی‌ها",
  "catalog-requests": "همگام‌سازی کاتالوگ درخواست‌ها",
  "catalog-enrich-listings": "غنی‌سازی آگهی‌ها",
  "catalog-enrich-requests": "غنی‌سازی درخواست‌ها",
  "main-sync": "همگام‌سازی اصلی ARM",
  "crm-sync": "همگام‌سازی پیوستهٔ CRM (خزانه)",
};

const STATUS_STYLES: Record<string, string> = {
  running: "bg-blue-500",
  done: "bg-emerald-600",
  failed: "bg-red-600",
  idle: "bg-slate-400",
  paused: "bg-amber-500",
};

const STATUS_FA: Record<string, string> = {
  running: "در اجرا",
  done: "کامل",
  failed: "خطا",
  idle: "آماده",
  paused: "مکث",
};

const SOURCE_FA: Record<string, string> = {
  auto: "چرخهٔ خودکار",
  manual: "بروزرسانی دستی",
  forced: "درخواست فوری مالک",
};

export function OpportunityJobsSection() {
  const [alerts, setAlerts] = useState<AlertView[]>([]);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasRunning, setHasRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, j] = await Promise.all([
        api<{ ok: boolean; alerts: AlertView[] }>("/api/opportunity-alerts?limit=8"),
        api<{ ok: boolean; jobs: JobView[] }>("/api/sync/jobs"),
      ]);
      setAlerts(a.alerts ?? []);
      setJobs(j.jobs ?? []);
      setHasRunning((j.jobs ?? []).some((x) => x.status === "running"));
    } catch { /* صادقانه خالی */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // PN-083 — پایش زندهٔ خودکار: حین اجرا ۱۵s · سکون ۶۰s (پیشرفت پنهان نمی‌ماند)
  useEffect(() => {
    const t = setInterval(() => { void load(); }, hasRunning ? 15_000 : 60_000);
    return () => clearInterval(t);
  }, [load, hasRunning]);

  const sortedJobs = [...jobs].sort((a, b) => {
    const ia = JOB_ORDER.indexOf(a.jobId);
    const ib = JOB_ORDER.indexOf(b.jobId);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.jobId.localeCompare(b.jobId);
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BellRing className="w-5 h-5 text-amber-500" aria-hidden /> هشدار فرصت (تطبیق هوشمند)
          </CardTitle>
          <CardDescription>
            تطبیق آگهی‌های تازه با درخواست‌های فعال (و برعکس) با امتیاز ≥ ۰٫۷ — فقط هشدار؛ صفر اجرای خودکار
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? <Skeleton className="h-20 w-full" /> : alerts.length === 0 ? (
            <p className="text-xs text-muted-foreground">هیچ هشدار فعالی نیست — با ثبت آگهی یا درخواست تازه، تطبیق خودکار اجرا می‌شود.</p>
          ) : (
            <>
              {alerts.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">
                      {a.direction === "listing_to_request"
                        ? `ملک ${faDigits(a.listingCode ?? "")} ↔ درخواست فعال`
                        : `درخواست ↔ ملک ${faDigits(a.listingCode ?? "")}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {a.matchReasons.slice(0, 2).map((r) => `${r.factor}: ${faDigits(r.value.toFixed(2))}`).join(" · ")}
                    </p>
                  </div>
                  <Badge className="shrink-0 bg-amber-500 text-white">{faDigits(a.matchScore.toFixed(2))}</Badge>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground">{faDigits(alerts.length)} هشدار فعال — جزئیات کامل در کاشی «تطبیق هوشمند»</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <HardDriveDownload className="w-5 h-5 text-primary" aria-hidden /> کارهای پس‌زمینه (پایدار در برابر ری‌استارت)
            </CardTitle>
            <div className="flex items-center gap-2">
              {hasRunning ? (
                <span className="text-[10px] text-muted-foreground animate-pulse">پایش زنده (هر ۱۵ ثانیه)</span>
              ) : null}
              <Button variant="outline" size="sm" onClick={load} className="gap-1"><RefreshCw className="size-3.5" /> بروزرسانی</Button>
            </div>
          </div>
          <CardDescription>
            وضعیت بروزرسانی چهار فهرست داشبورد ملک تبریز (M1-M4) و کارهای همگام‌سازی/غنی‌سازی — ذخیره‌شده در دیتابیس؛ پس از ری‌استارت سرور از همان نقطه ادامه می‌یابد. همهٔ مسیرها (خودکار، دستی، فوری) زیر قفل هماهنگ‌ساز اجرا می‌شوند.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? <Skeleton className="h-20 w-full" /> : sortedJobs.length === 0 ? (
            <p className="text-xs text-muted-foreground">هنوز کاری ثبت نشده — با نخستین تیک دیمن، وضعیت اینجا ظاهر می‌شود.</p>
          ) : sortedJobs.map((j) => {
            const src = j.detail && typeof j.detail.source === "string" ? SOURCE_FA[j.detail.source] ?? null : null;
            const err = j.detail && typeof j.detail.error === "string" && j.detail.error ? j.detail.error : null;
            return (
              <div key={j.jobId} className="space-y-1 rounded-lg border p-2" data-testid={`settings-job-${j.jobId}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium">{JOB_LABELS[j.jobId] ?? j.jobId}</p>
                  <div className="flex items-center gap-1">
                    <Badge className={`text-[10px] ${STATUS_STYLES[j.status] ?? "bg-slate-400"} text-white`}>
                      {STATUS_FA[j.status] ?? j.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">صفحهٔ {faDigits(String(j.lastCompletedPage))} از {faDigits(String(j.totalPages))} · ادامه از {faDigits(String(j.resumedFrom))}</span>
                  </div>
                </div>
                <Progress value={j.progressPercent} className="h-1.5" />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                  {src ? <span>منبع آخرین اجرا: {src}</span> : null}
                  {j.updatedAt ? <span>آخرین تغییر: {new Date(j.updatedAt).toLocaleString("fa-IR")}</span> : null}
                  {err ? <span className="text-red-600 dark:text-red-400 truncate max-w-full">خطا: {err.slice(0, 80)}</span> : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
