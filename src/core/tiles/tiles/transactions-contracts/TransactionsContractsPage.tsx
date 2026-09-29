"use client";

/**
 * کاشی «معاملات ملک تبریز» — P6.5-12
 * ------------------------------------------------------
 * تک‌نما (حذف تب‌های «قراردادها و اسناد» و «مالی و کمیسیون» — دستور مرحلهٔ قبل):
 * فهرست معاملات با ستون‌های کامل: کد ملک/مالک · درخواست/درخواست‌دهنده ·
 * نوع قرارداد · هولوگرام · مبلغ (جداکنندهٔ «،») · فایل قرارداد · حق‌السهم با درصد.
 * ایجنت مولتی‌بینش بالای صفحه + دکمهٔ «بروزرسانی از سامانه» (نکتهٔ ۳).
 * دادهٔ قراردادها/مالی در پایگاه ماندگار است (قانون دادهٔ مقدس — حذف نما ≠ حذف داده).
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Server, CheckCircle2, AlertTriangle, History } from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { useTileFreshness } from "@/components/app/TileCard";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber, faDateTime } from "@/lib/format";
import { TransactionsTab } from "./TransactionsTab";

interface SyncAllResponse {
  ok: boolean;
  busy?: boolean;
  message?: string;
  main: { ok: boolean; transactions?: number; experts?: number; contracts?: number; error?: string | null };
  listings: { ok: boolean; fetched?: number; totalAtSource?: number; errorCode?: string; checkpoint?: { lastCompletedPage: number; totalPages: number; phase: string }; resumedFromPage?: number };
  requests: { ok: boolean; fetched?: number; totalAtSource?: number; errorCode?: string; checkpoint?: { lastCompletedPage: number; totalPages: number; phase: string }; resumedFromPage?: number };
  enrichListings: { enriched?: number; remaining?: number } | null;
  enrichRequests: { enriched?: number; remaining?: number } | null;
}

export function TransactionsContractsPage({ settings }: TilePageProps) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncAllResponse | null>(null);
  // P6530/گام ۳ (بند ۴.۲) — تاریخ و ساعت دقیق آخرین بروزرسانی داده‌های معاملات
  const freshness = useTileFreshness("transactions-contracts");
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);
  const loadLastUpdate = useCallback(async () => {
    try {
      const res = await api<{ dataSource?: { lastSuccessAt?: string | null } }>("/api/crm/transactions?limit=1");
      setLastSuccessAt(res.dataSource?.lastSuccessAt ?? null);
    } catch {
      setLastSuccessAt(null);
    }
  }, []);
  useEffect(() => {
    void loadLastUpdate();
  }, [loadLastUpdate]);

  const sortBy = String(settings.sortBy ?? "contractDate");
  const showCharts = settings.showCharts !== false;

  /** بروزرسانی از سامانه — انتقال کامل همهٔ منابع (نکتهٔ ۳) */
  const syncAll = async () => {
    setSyncing(true);
    try {
      const res = await api<SyncAllResponse>("/api/sync/all", { method: "POST" });
      void loadLastUpdate(); // تازه‌سازی تاریخ دقیق پس از بروزرسانی
      if (res.busy) {
        toast({ title: "انتقال در حال اجراست", description: res.message ?? "پس از پایان اجرای جاری دوباره بزنید." });
        return;
      }
      setLastSync(res);
      const parts: string[] = [];
      if (res.main?.ok) {
        parts.push(`گزارش تطابق: ${faNumber(res.main.transactions ?? 0)} معامله و ${faNumber(res.main.experts ?? 0)} کارشناس`);
      }
      if (res.listings?.ok) {
        parts.push(`آگهی‌ها: ${faNumber(res.listings.fetched ?? 0)} ردیف تازه${res.listings.checkpoint ? ` (صفحهٔ ${faNumber(res.listings.checkpoint.lastCompletedPage)} از ${faNumber(res.listings.checkpoint.totalPages)})` : ""}`);
      }
      if (res.requests?.ok) {
        parts.push(`درخواست‌ها: ${faNumber(res.requests.fetched ?? 0)} ردیف تازه${res.requests.checkpoint ? ` (صفحهٔ ${faNumber(res.requests.checkpoint.lastCompletedPage)} از ${faNumber(res.requests.checkpoint.totalPages)})` : ""}`);
      }
      const enriched = (res.enrichListings?.enriched ?? 0) + (res.enrichRequests?.enriched ?? 0);
      if (enriched > 0) parts.push(`${faNumber(enriched)} ردیف غنی‌سازی تماس`);
      toast({
        title: "انتقال اطلاعات انجام شد",
        description: parts.length > 0 ? parts.join(" · ") : "خلاصه‌ای برای گزارش نیست — جزئیات در شاهد انتقال.",
      });
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "انتقال اطلاعات ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ایجنت هوشمند مولتی‌بینش */}
      <AgentPanel tileId="transactions-contracts" />

      {/* بخش بروزرسانی معاملات (گام ۳ بند ۴) — زنجیرهٔ ARM و PM + تاریخ دقیق + ادامه از نقطهٔ قطع */}
      <Card className="border-sec-m3-200 bg-sec-m3-50" id="m3-update-section">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              <Server className="w-5 h-5 shrink-0 mt-0.5 text-sec-m3-700" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-relaxed">
                  بروزرسانی معاملات از سامانه‌های ملک تبریز — گزارش تطابق معاملات، قراردادها، آگهی‌ها و درخواست‌های ARM با زنجیرهٔ عین خود سامانه‌های ARM و PM در یک اجرا
                </p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  دریافت با «ازسرگیری» انجام می‌شود: در صورت قطعی، ادامه از همان صفحه‌ای است که متوقف شد — نه از ابتدا.
                </p>
              </div>
            </div>
            <Button className="gap-2 shrink-0 bg-sec-m3-500 hover:bg-sec-m3-500/90 text-sec-m3-fg" onClick={() => void syncAll()} disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
              بروزرسانی از سامانه
            </Button>
          </div>

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

          {lastSync && (
            <div className="flex flex-wrap items-center gap-1.5">
              {lastSync.main?.ok ? (
                <Badge variant="outline" className="gap-1 text-[10px] text-teal-700 dark:text-teal-300 border-teal-500/30">
                  <CheckCircle2 className="w-3 h-3" aria-hidden /> معاملات و قراردادها ✓
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-[10px] text-amber-700 dark:text-amber-300 border-amber-500/30">
                  <AlertTriangle className="w-3 h-3" aria-hidden /> معاملات: {lastSync.main?.error?.slice(0, 40) ?? "خطا"}
                </Badge>
              )}
              {lastSync.requests?.checkpoint && (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  درخواست‌ها: {faNumber(lastSync.requests.checkpoint.lastCompletedPage)}/{faNumber(lastSync.requests.checkpoint.totalPages)} صفحه
                </Badge>
              )}
              {lastSync.listings?.checkpoint && (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  آگهی‌ها: {faNumber(lastSync.listings.checkpoint.lastCompletedPage)}/{faNumber(lastSync.listings.checkpoint.totalPages)} صفحه
                </Badge>
              )}
              <Badge variant="outline" className="gap-1 text-[10px]">
                <History className="w-3 h-3" aria-hidden /> ازسرگیری از آخرین صفحهٔ کامل
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* تک‌نمای فهرست معاملات — P6.5-12 (حذف دو تب ادغام‌شدهٔ قبلی) */}
      <TransactionsTab sortBy={sortBy} showCharts={showCharts} />
    </div>
  );
};
