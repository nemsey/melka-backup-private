"use client";

/**
 * کاشی ادغامی «معاملات و قراردادهای ملک تبریز» — P6.5-11 (بند پ)
 * ------------------------------------------------------
 * ادغام سه کاشی قبلی در یک کاشی واحد:
 *   تب ۱ «معاملات»          — گزارش تطابق + فهرست معاملات با ستون‌های جدید (پ-۵)
 *   تب ۲ «قراردادها و اسناد» — صورت وضعیت‌های ۹ مرحله‌ای + جزئیات (پ-۳)
 *   تب ۳ «مالی و کمیسیون»    — محاسبه‌گر تعرفه اتحادیه + تجمیع حق‌السهم (پ-۲)
 * همهٔ تب‌ها شامل اطلاعات «تمامی کارشناسان ملک تبریز» هستند.
 * ایجنت مولتی‌بینش ۲۱ دامنه‌ای (الزام ≥۱۵ — بند پ-۶) بالای صفحه.
 * دکمهٔ «بروزرسانی از سامانه» — انتقال کامل همهٔ منابع با ازسرگیری (نکتهٔ ۳).
 */

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileCheck2, ScrollText, Calculator, RefreshCw, Server, CheckCircle2, AlertTriangle } from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber } from "@/lib/format";
import { TransactionsTab } from "./TransactionsTab";
import { ContractsTab } from "./ContractsTab";
import { FinanceTab } from "./FinanceTab";

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

export function TransactionsContractsPage({ settings, onSettingsChange }: TilePageProps) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncAllResponse | null>(null);

  const sortBy = String(settings.sortBy ?? "contractDate");
  const showCharts = settings.showCharts !== false;

  /** بروزرسانی از سامانه — انتقال کامل همهٔ منابع (نکتهٔ ۳: زیرساخت انتقال امشب مالک) */
  const syncAll = async () => {
    setSyncing(true);
    try {
      const res = await api<SyncAllResponse>("/api/sync/all", { method: "POST" });
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
      {/* ایجنت هوشمند مولتی‌بینش — ۲۱ دامنه (بند پ-۶) */}
      <AgentPanel tileId="transactions-contracts" />

      {/* نوار انتقال اطلاعات — نکتهٔ ۳: زیرساخت کامل برای انتقال امشب مالک */}
      <Card className="border-teal-500/20 bg-gradient-to-l from-teal-600/[0.06] to-transparent">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Server className="w-5 h-5 shrink-0 mt-0.5 text-teal-600 dark:text-teal-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-relaxed">
                بروزرسانی از سامانه ملک تبریز — گزارش تطابق معاملات، قراردادها، آگهی‌ها و درخواست‌های ARM در یک اجرا
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                دریافت با «ازسرگیری» انجام می‌شود: در صورت قطعی، ادامه از همان صفحه‌ای است که متوقف شد — نه از ابتدا.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Button className="gap-2" onClick={() => void syncAll()} disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
              بروزرسانی از سامانه
            </Button>
            {lastSync && (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
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
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* سه بخش ادغام‌شده — معاملات + قراردادها و اسناد + مالی و کمیسیون */}
      <Tabs defaultValue="transactions" dir="rtl" className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-xl h-auto p-1">
          <TabsTrigger value="transactions" className="gap-1.5 py-2 text-xs sm:text-sm">
            <FileCheck2 className="w-4 h-4" aria-hidden /> معاملات
          </TabsTrigger>
          <TabsTrigger value="contracts" className="gap-1.5 py-2 text-xs sm:text-sm">
            <ScrollText className="w-4 h-4" aria-hidden /> قراردادها و اسناد
          </TabsTrigger>
          <TabsTrigger value="finance" className="gap-1.5 py-2 text-xs sm:text-sm">
            <Calculator className="w-4 h-4" aria-hidden /> مالی و کمیسیون
          </TabsTrigger>
        </TabsList>
        <TabsContent value="transactions" className="mt-4">
          <TransactionsTab sortBy={sortBy} showCharts={showCharts} />
        </TabsContent>
        <TabsContent value="contracts" className="mt-4">
          <ContractsTab settings={settings} onSettingsChange={onSettingsChange} />
        </TabsContent>
        <TabsContent value="finance" className="mt-4">
          <FinanceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
