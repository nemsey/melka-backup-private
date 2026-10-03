"use client";

/**
 * بخش «هشدار فرصت + کارهای پس‌زمینه» — P6545/گام۱ (BLOCK 1.1 + 1.4)
 * ---------------------------------------------------------------------------
 * · هشدار فرصت: تطبیق آگهی↔درخواست با امتیاز ≥ ۰٫۷ (صفر اجرای خودکار)
 * · وضعیت کارهای پس‌زمینه: از DB (SyncJobState) — پایدار در برابر ری‌استارت
 * نمایش در کاشی «تنظیمات عمومی» (عین مصوبهٔ جلسه ۰۳۳).
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
}

const JOB_LABELS: Record<string, string> = {
  "catalog-listings": "همگام‌سازی کاتالوگ آگهی‌ها",
  "catalog-requests": "همگام‌سازی کاتالوگ درخواست‌ها",
  "catalog-enrich-listings": "غنی‌سازی آگهی‌ها",
  "catalog-enrich-requests": "غنی‌سازی درخواست‌ها",
  "main-sync": "همگام‌سازی اصلی ARM",
};

const STATUS_STYLES: Record<string, string> = {
  running: "bg-blue-500",
  done: "bg-emerald-600",
  failed: "bg-red-600",
  idle: "bg-slate-400",
  paused: "bg-amber-500",
};

export function OpportunityJobsSection() {
  const [alerts, setAlerts] = useState<AlertView[]>([]);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, j] = await Promise.all([
        api<{ ok: boolean; alerts: AlertView[] }>("/api/opportunity-alerts?limit=8"),
        api<{ ok: boolean; jobs: JobView[] }>("/api/sync/jobs"),
      ]);
      setAlerts(a.alerts ?? []);
      setJobs(j.jobs ?? []);
    } catch { /* صادقانه خالی */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
            <Button variant="outline" size="sm" onClick={load} className="gap-1"><RefreshCw className="size-3.5" /> بروزرسانی</Button>
          </div>
          <CardDescription>وضعیت کارهای همگام‌سازی و غنی‌سازی — ذخیره‌شده در دیتابیس؛ پس از ری‌استارت سرور از همان نقطه ادامه می‌یابد</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? <Skeleton className="h-20 w-full" /> : jobs.length === 0 ? (
            <p className="text-xs text-muted-foreground">هنوز کاری ثبت نشده — با نخستین تیک دیمن، وضعیت اینجا ظاهر می‌شود.</p>
          ) : jobs.map((j) => (
            <div key={j.jobId} className="space-y-1 rounded-lg border p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">{JOB_LABELS[j.jobId] ?? j.jobId}</p>
                <div className="flex items-center gap-1">
                  <Badge className={`text-[10px] ${STATUS_STYLES[j.status] ?? "bg-slate-400"} text-white`}>
                    {j.status === "running" ? "در اجرا" : j.status === "done" ? "کامل" : j.status === "failed" ? "خطا" : j.status}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">صفحهٔ {faDigits(j.lastCompletedPage)} از {faDigits(j.totalPages)} · ادامه از {faDigits(j.resumedFrom)}</span>
                </div>
              </div>
              <Progress value={j.progressPercent} className="h-1.5" />
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
