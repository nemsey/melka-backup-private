"use client";

/**
 * کاشی «معاملات ملک تبریز» — P6.5-12 + P6546/گام سوم + DIR-SUPER-UPDATE-001
 * ------------------------------------------------------
 * تک‌نما: فهرست معاملات با ستون‌های کامل + ایجنت مولتی‌بینش.
 *
 * DIR-SUPER-UPDATE-001 (گام دوم ۱۴۰۵/۰۸/۲۶ — ادغام): بخش بروزرسانی معاملات
 * (دکمه + پایش مرحله‌به‌مرحله + تاریخ آخرین بروزرسانی) به «بخش بروزرسانی فهرست
 * فوق پیشرفته» بالای همین کاشی (اولین بخش) منتقل شد — همان مسیر پس‌زمینه‌ای
 * /api/crm/transactions/sync، همان حقیقت SyncJobState، حالا هماهنگ با کارهای
 * پس‌زمینه و چهار فهرست در یک نگاه. این صفحه فقط «فهرست» است:
 *   · پایان هر اجرای برشی از طریق رویداد «melk:super-update» دریافت و فهرست
 *     خودش تازه می‌شود (همان سیگنال قبلی syncDoneSignal — PN-020/گام اول-ج۲).
 */

import { useEffect, useState } from "react";
import { AgentPanel } from "@/components/app/AgentPanel";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { TransactionsTab } from "./TransactionsTab";

export function TransactionsContractsPage({ settings }: TilePageProps) {
  // PN-020/گام اول-ج۲ — سیگنال پایان سینک برای بارگذاری خودکار فهرست؛
  // DIR-SUPER-UPDATE-001 — منبع سیگنال اکنون بخش فوق پیشرفتهٔ بالای کاشی است
  const [syncDoneSignal, setSyncDoneSignal] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<{ list?: string }>).detail?.list === "m3") {
        setSyncDoneSignal((n) => n + 1);
      }
    };
    window.addEventListener("melk:super-update", handler);
    return () => window.removeEventListener("melk:super-update", handler);
  }, []);

  const sortBy = String(settings.sortBy ?? "contractDate");
  const showCharts = settings.showCharts !== false;

  return (
    <div data-negin="yaghut-banafsh" className="space-y-6">
      {/* نگین (PN-024) — میلهٔ گوهر yaghut-banafsh */}
      <div className="negin-bar" aria-hidden />
      {/* ایجنت هوشمند مولتی‌بینش */}
      <AgentPanel tileId="transactions-contracts" />

      {/* تک‌نمای فهرست معاملات (ترتیب الزامی: بینش‌ها → جداول → پوشش → فیلتر → فهرست؛
          بخش بروزرسانی اکنون اولین بخش کاشی است — SuperListUpdate در قاب FourListsTileChrome) */}
      {/* PN-044/فاز ۴ — tenant این رندر به تک‌نما می‌رسد (داشبورد ملکتون فقط دادهٔ ملکتون) */}
      <TransactionsTab sortBy={sortBy} showCharts={showCharts} syncDoneSignal={syncDoneSignal} />
    </div>
  );
};


/** P6549 — خروجی پیش‌فرض برای بارگذاری تنبل (lazyPage) */
export default TransactionsContractsPage;
