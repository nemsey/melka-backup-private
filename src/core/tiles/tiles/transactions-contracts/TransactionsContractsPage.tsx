"use client";

/**
 * کاشی «معاملات ملک تبریز» — P6.5-12 + P6546/گام سوم
 * ------------------------------------------------------
 * تک‌نما: فهرست معاملات با ستون‌های کامل + ایجنت مولتی‌بینش.
 *
 * P6546/گام سوم-۱ (رفع ریشه‌ای بروزرسانی معاملات):
 *   دکمهٔ بروزرسانی به مسیر «پس‌زمینه‌ای» /api/crm/transactions/sync منتقل شد —
 *   پاسخ فوری (صفر مهلت ۹۰ ثانیه)، پیشرفت مرحله‌به‌مرحله از SyncJobState،
 *   ادامه از checkpoint در صورت قطعی و پایش زنده در همین صفحه.
 *
 * P6546/گام پنجم-الف-۳ (ترتیب الزامی):
 *   بینش‌ها → جداول و نمودارها → جدول پوشش → بروزرسانی → فیلتر → فهرست
 *   (بخش بروزرسانی به‌عنوان prop به TransactionsTab منتقل شده است)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Server, CheckCircle2, AlertTriangle } from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { useTileFreshness } from "@/components/app/TileCard";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber, faDateTime, faDigits } from "@/lib/format";
import { TransactionsTab } from "./TransactionsTab";

/** پاسخ مسیر پس‌زمینه‌ای بروزرسانی معاملات (P6546/گام سوم-۱) */
interface TxSyncResponse {
  ok: boolean;
  started?: boolean;
  busy?: boolean;
  running?: boolean;
  message?: string;
  job?: {
    jobId: string;
    status: "idle" | "running" | "paused" | "done" | "failed";
    lastCompletedPage: number;
    totalPages: number;
    progressPercent: number;
    detail: Record<string, unknown> | null;
    updatedAt: string;
  } | null;
}

const STAGE_LABELS: Record<string, string> = {
  starting: "آغاز بروزرسانی",
  "main-sync": "همگام‌سازی گزارش تطابق معاملات و قراردادها",
  "tx-info-enrichment": "تکمیل جزئیات قراردادها (نوع، مبلغ، طرفین)",
  contracts: "دریافت کارگزاری‌های صادره",
  finalizing: "ثبت نهایی",
  done: "پایان موفق",
  aborted: "قطع شد — از همان نقطه ادامه می‌یابد",
};

export function TransactionsContractsPage({ settings, tenantId }: TilePageProps) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [job, setJob] = useState<TxSyncResponse["job"]>(null);
  // PN-020/گام اول-ج۲ — سیگنال پایان سنک برای بارگذاری خودکار فهرست
  // (ریشه‌یابی «تاخیر در بروزرسانی فهرست»: پیش از این پس از پایان کار پس‌زمینه،
  // فهرست خودش تازه نمی‌شد و مالک باید دستی رفرش می‌کرد)
  const [syncDoneSignal, setSyncDoneSignal] = useState(0);
  // P6530/گام ۳ (بند ۴.۲) — تاریخ و ساعت دقیق آخرین بروزرسانی داده‌های معاملات
  const freshness = useTileFreshness("transactions-contracts");
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLastUpdate = useCallback(async () => {
    try {
      const res = await api<{ dataSource?: { lastSuccessAt?: string | null } }>("/api/crm/transactions?limit=1");
      setLastSuccessAt(res.dataSource?.lastSuccessAt ?? null);
    } catch {
      setLastSuccessAt(null);
    }
  }, []);
  useEffect(() => {
    // بارگذاری اولیهٔ تاریخ آخرین بروزرسانی (غیرهمگام — بدون setState همگام در effect)
    const t = setTimeout(() => void loadLastUpdate(), 0);
    return () => clearTimeout(t);
  }, [loadLastUpdate]);

  /** پایش پیشرفت کار پس‌زمینه تا پایان (P6546/گام سوم-۱) */
  const pollJob = useCallback(
    (onDone: () => void) => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = setInterval(async () => {
        try {
          const res = await api<TxSyncResponse>("/api/crm/transactions/sync");
          setJob(res.job ?? null);
          if (res.job && res.job.status !== "running") {
            if (pollTimer.current) clearInterval(pollTimer.current);
            pollTimer.current = null;
            setSyncing(false);
            void loadLastUpdate();
            // PN-020/گام اول-ج۲ — فهرست بلافاصله پس از پایان موفق/توقف کار تازه می‌شود
            setSyncDoneSignal((n) => n + 1);
            toast({
              title: res.job.status === "done" ? "بروزرسانی معاملات کامل شد" : "بروزرسانی متوقف شد",
              description:
                res.job.status === "done"
                  ? "همهٔ مراحل (گزارش تطابق، جزئیات قراردادها، کارگزاری‌ها) با موفقیت انجام شد."
                  : "عملیات از همان نقطهٔ قطع‌شده ادامه می‌یابد — دوباره بروزرسانی را بزنید.",
              variant: res.job.status === "done" ? "default" : "destructive",
            });
            onDone();
          }
        } catch {
          /* پایش بهترین-تلاش — تایمر ادامه می‌یابد */
        }
      }, 3000);
    },
    [toast, loadLastUpdate]
  );

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  /** بروزرسانی از سامانه — اجرای پس‌زمینه‌ای فوری + پایش پیشرفت (P6546/گام سوم-۱) */
  const syncAll = async () => {
    setSyncing(true);
    try {
      const res = await api<TxSyncResponse>("/api/crm/transactions/sync", { method: "POST" });
      setJob(res.job ?? null);
      toast({
        title: res.busy ? "بروزرسانی در جریان است" : "بروزرسانی پس‌زمینه‌ای آغاز شد",
        description: res.message ?? "پیشرفت مرحله‌به‌مرحله همین‌جا نمایش داده می‌شود.",
      });
      if (res.running) {
        pollJob(() => undefined);
      } else {
        setSyncing(false);
      }
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "شروع بروزرسانی ناموفق", description: e.message, variant: "destructive" });
      setSyncing(false);
    }
  };

  const sortBy = String(settings.sortBy ?? "contractDate");
  const showCharts = settings.showCharts !== false;

  const stageLabel = job?.detail ? STAGE_LABELS[String(job.detail.stage ?? "")] ?? String(job.detail.stage ?? "") : null;
  const progress = job?.progressPercent ?? 0;

  /** بخش بروزرسانی — داخل TransactionsTab بین پوشش و فیلتر رندر می‌شود (ترتیب الزامی) */
  const updateSection = (
    <Card className="border-sec-m3-200 bg-sec-m3-50" id="m3-update-section">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Server className="w-5 h-5 shrink-0 text-sec-m3-700" aria-hidden />
            <div className="min-w-0">
              {/* PN-009 مرحله E (بند ۱۳ دستور): توضیحات زیر عنوان حذف شد — فقط عنوان + دکمه/وضعیت زنده */}
              <p className="text-sm font-bold">بروزرسانی معاملات از سامانه‌های ملک تبریز</p>
            </div>
          </div>
          <Button className="gap-2 shrink-0 bg-sec-m3-500 hover:bg-sec-m3-500/90 text-sec-m3-fg" onClick={() => void syncAll()} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
            بروزرسانی از سامانه
          </Button>
        </div>

        {/* پیشرفت زندهٔ کار پس‌زمینه (P6546/گام سوم-۱) */}
        {job && (
          <div className="rounded-lg border bg-card p-3 space-y-2" data-testid="m3-sync-progress">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold flex items-center gap-1.5">
                {job.status === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin text-sec-m3-700" aria-hidden /> : job.status === "done" ? <CheckCircle2 className="w-3.5 h-3.5 text-sec-m3-700" aria-hidden /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" aria-hidden />}
                {stageLabel ?? job.status}
              </span>
              <span className="tabular-nums font-bold">{faDigits(String(job.progressPercent))}٪</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-l from-sec-m3-700 to-sec-m3-500 transition-all duration-700" style={{ width: `${progress}%` }} />
            </div>
            {job.detail && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(job.detail)
                  .filter(([k, v]) => !["stage", "at", "finishedAt"].includes(k) && typeof v === "string")
                  .map(([k, v]) => (
                    <Badge key={k} variant="outline" className="gap-1 text-[10px]">
                      {k}: {String(v).slice(0, 50)}
                    </Badge>
                  ))}
              </div>
            )}
            {job.status === "running" && <p className="text-[10px] text-muted-foreground">مرحلهٔ {faNumber(job.lastCompletedPage)} از {faNumber(Math.max(job.totalPages, 4))} — می‌توانید همین حالا با فهرست کار کنید؛ بروزرسانی در پس‌زمینه ادامه دارد.</p>}
          </div>
        )}

        {/* P6530/گام ۳ (بند ۴.۲) — تاریخ و ساعت دقیق آخرین بروزرسانی */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs" id="m3-last-update">
          <div className="rounded-lg border bg-card p-2.5">
            <p className="text-muted-foreground">آخرین بروزرسانی موفق معاملات</p>
            <p className="font-bold mt-0.5">
              {lastSuccessAt || freshness?.lastUpdatedAt
                ? faDateTime((lastSuccessAt ?? freshness!.lastUpdatedAt) as string)
                : "هنوز انجام نشده"}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-2.5">
            <p className="text-muted-foreground">رکوردهای کش‌شدهٔ معاملات</p>
            <p className="font-bold mt-0.5 tabular-nums">{freshness ? faNumber(freshness.recordCount) : "—"}</p>
          </div>
          <div className="rounded-lg border bg-card p-2.5">
            <p className="text-muted-foreground">منبع داده</p>
            <p className="font-bold mt-0.5">{freshness?.sourceLabel ?? "سامانه ملک تبریز (ARM)"}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div data-negin="yaghut-banafsh" className="space-y-6">
      {/* نگین (PN-024) — میلهٔ گوهر yaghut-banafsh */}
      <div className="negin-bar" aria-hidden />
      {/* ایجنت هوشمند مولتی‌بینش */}
      <AgentPanel tileId="transactions-contracts" />

      {/* تک‌نمای فهرست معاملات — بخش بروزرسانی به‌عنوان prop (ترتیب الزامی: بینش‌ها → جداول → پوشش → بروزرسانی → فیلتر → فهرست) */}
      {/* PN-044/فاز ۴ — tenant این رندر به تک‌نما می‌رسد (داشبورد ملکتون فقط دادهٔ ملکتون) */}
      <TransactionsTab sortBy={sortBy} showCharts={showCharts} updateSection={updateSection} syncDoneSignal={syncDoneSignal} tenantId={tenantId} />
    </div>
  );
};


/** P6549 — خروجی پیش‌فرض برای بارگذاری تنبل (lazyPage) */
export default TransactionsContractsPage;
