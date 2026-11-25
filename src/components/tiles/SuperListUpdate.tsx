"use client";

/**
 * SuperListUpdate — DIR-SUPER-UPDATE-001 · بخش «بروزرسانی فهرست فوق پیشرفته» (گام دوم)
 * ---------------------------------------------------------------------------
 * دستور مالک (۱۴۰۵/۰۸/۲۶): بخش بروزرسانی فهرست چهارگانه با بخش بروزرسانی چهار
 * فهرست — هماهنگ با کارهای پس‌زمینه — ادغام شود و به‌عنوان «اولین بخش هر کاشی»
 * بنشیند. این بخش پس از فراکاوی کارکرد هر دو بخش قبلی ساخته شد:
 *
 *   · منبع یگانهٔ حقیقت: GET /api/sync/four-lists — ادغام SyncJobState (لایهٔ ۲)
 *     + فاز LCPP + قفل‌های زنده (لایهٔ ۱) + شمار رکورد + پوشش غنی‌سازی + نقطهٔ
 *     ازسرگیری (DIR-SUPER-UPDATE-001) — همان چیزی که نوار چهار-فهرست PN-083،
 *     بخش بروزرسانی داخل هر فهرست و کارهای پس‌زمینهٔ تنظیمات می‌دیدند؛ حالا
 *     یکجا و صادقانه.
 *   · سه مسیر اجرا (عین چهارگانهٔ هماهنگ‌ساز PN-083 — همه زیر قفل update:mX):
 *     ۱) بروزرسانی برشی همین فهرست — همان دکمهٔ داخل فهرست (زنجیرهٔ ARM/PM)
 *     ۲) چرخهٔ فوری همین فهرست — پرچم Worker (≤۶۰ث · فقط مالک)
 *     ۳) چرخهٔ فوری هر چهار فهرست — همان دکمهٔ نوار قدیمی (فقط مالک)
 *   · کارهای پس‌زمینهٔ هماهنگ: GET /api/sync/jobs — کاتالوگ/غنی‌سازی/سینک اصلی
 *     در نوار پایین همین بخش (همان حقیقت تنظیمات — صفر تکرار محاسبه).
 *   · زبان رویداد: پس از پایان هر اجرای برشی، رویداد «melk:super-update»
 *     پخش می‌شود تا خودِ صفحهٔ فهرست (بدون کپی منطق) داده‌اش را تازه کند.
 *   · پایش زنده: ۱۰ث حین اجرا · ۳۰ث در سکون (فهرست‌ها) · ۱۵ث/۶۰ث (کارها).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Rocket, Zap, Layers, HardDriveDownload } from "lucide-react";
import { api, apiSync, ApiClientError } from "@/lib/client/api";
import { useAppStore } from "@/lib/client/store";
import { useToast } from "@/hooks/use-toast";
import { faDigits } from "@/lib/jalali";
import { faDateTime, faNumber } from "@/lib/format";
import { Button } from "@/components/ui/button";

type FourListId = "m1" | "m2" | "m3" | "m4";
type ListStatus = "idle" | "running" | "paused" | "done" | "failed";
type LcppPhase = "idle" | "fast-pass" | "deep-pass" | "done" | "error";

interface FourListUi {
  id: FourListId;
  label: string;
  shortLabel: string;
  status: ListStatus;
  lcppPhase: LcppPhase | null;
  progressPercent: number;
  sourceLabel: string | null;
  lastCompletedPage: number;
  totalPages: number;
  lastWritten: number | null;
  updatedAt: string | null;
  nextCycleAt: string | null;
  rows: number | null;
  enrich: { total: number; complete: number; pending: number } | null;
  /** DIR-SUPER-STRUCT-001 (بخش الف · ۱) — پوشش برچسب اتمی رکوردها (P0/P1/ALL_DONE)؛ فقط M1/M2 */
  stage: { p0: number; p1: number; all: number; unmarked: number; total: number; completePct: number } | null;
  checkpoint: { phase: string; lastCompletedPage: number; totalPages: number; totalAtSource: number; updatedAt: string; completedAt: string | null } | null;
  lockHeldBy: string | null;
  detail: Record<string, unknown> | null;
}

interface FourListsViewUi {
  ok?: boolean;
  running: boolean;
  lists: Record<FourListId, FourListUi>;
  /** DIR-SUPER-STRUCT-001 (بخش ج · ۱) — بستگی فهرست‌ها به رله: ضربان قلب watchDog ترموکس */
  relay: { mode: string; active: boolean; heartbeat: { status: "alive" | "warning" | "silent"; sinceSec: number | null; beatsMissed: number | null; legacy: boolean } } | null;
}

interface JobView {
  jobId: string;
  status: string;
  progressPercent: number;
  lastCompletedPage: number;
  totalPages: number;
  updatedAt: string;
  detail: Record<string, unknown> | null;
}

const ORDER: FourListId[] = ["m1", "m2", "m3", "m4"];

/** رنگ بخش هر فهرست — همان زبان طراحی sec-mX کاشی‌ها (P6530) */
const ACCENT: Record<FourListId, { card: string; text: string; button: string; bar: string }> = {
  m1: { card: "border-sec-m1-200 bg-sec-m1-50", text: "text-sec-m1-700", button: "bg-sec-m1-500 hover:bg-sec-m1-500/90 text-sec-m1-fg", bar: "from-sec-m1-700 to-sec-m1-500" },
  m2: { card: "border-sec-m2-200 bg-sec-m2-50", text: "text-sec-m2-700", button: "bg-sec-m2-500 hover:bg-sec-m2-500/90 text-sec-m2-fg", bar: "from-sec-m2-700 to-sec-m2-500" },
  m3: { card: "border-sec-m3-200 bg-sec-m3-50", text: "text-sec-m3-700", button: "bg-sec-m3-500 hover:bg-sec-m3-500/90 text-sec-m3-fg", bar: "from-sec-m3-700 to-sec-m3-500" },
  m4: { card: "border-sec-m4-200 bg-sec-m4-50", text: "text-sec-m4-700", button: "bg-sec-m4-500 hover:bg-sec-m4-500/90 text-sec-m4-fg", bar: "from-sec-m4-700 to-sec-m4-500" },
};

/** کارهای پس‌زمینهٔ هماهنگ (غیر چهار‌گانه) — همان ترتیب و برچسب تنظیمات (PN-083) */
const BG_JOBS: Array<{ jobId: string; label: string }> = [
  { jobId: "catalog-listings", label: "کاتالوگ آگهی‌ها" },
  { jobId: "catalog-requests", label: "کاتالوگ درخواست‌ها" },
  { jobId: "catalog-enrich-listings", label: "غنی‌سازی آگهی‌ها" },
  { jobId: "catalog-enrich-requests", label: "غنی‌سازی درخواست‌ها" },
  { jobId: "main-sync", label: "همگام‌سازی اصلی ARM" },
  { jobId: "crm-sync", label: "همگام‌سازی پیوستهٔ CRM" },
];

/** رویداد زندهٔ صفحه — صفحهٔ فهرست با همین شناسه داده‌اش را تازه می‌کند */
export const SUPER_UPDATE_EVENT = "melk:super-update";
function announceSyncDone(list: FourListId): void {
  try {
    window.dispatchEvent(new CustomEvent(SUPER_UPDATE_EVENT, { detail: { list } }));
  } catch {
    /* رویداد بهترین-تلاش است */
  }
}

/** رنگ چیپ بر اساس «جدی‌ترین» وضعیت (قفل زنده > SyncJobState > LCPP) — عین PN-083 */
function chipState(l: FourListUi): { cls: string; text: string } {
  const live = l.status === "running" || l.lockHeldBy !== null;
  if (live) {
    const deep = l.lcppPhase === "deep-pass";
    return {
      cls: deep ? "bg-sky-100 text-sky-800 animate-pulse" : "bg-amber-100 text-amber-800 animate-pulse",
      text: deep ? "تکمیل جزئیات…" : "در حال بروزرسانی…",
    };
  }
  if (l.status === "failed") return { cls: "bg-rose-100 text-rose-800", text: "خطا (چرخهٔ بعدی تلاش مجدد)" };
  if (l.status === "done") return { cls: "bg-emerald-100 text-emerald-800", text: "کامل" };
  return { cls: "bg-slate-100 text-slate-600", text: "آماده" };
}

function faTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    // DIR-TZ-001 — ساعت به وقت تهران، مستقل از TZ سرور/مرورگر
    return new Date(iso).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tehran" });
  } catch {
    return "—";
  }
}

const STATUS_FA: Record<string, string> = {
  running: "در اجرا",
  done: "کامل",
  failed: "خطا",
  idle: "آماده",
  paused: "مکث",
};

/** پاسخ مسیر بروزرسانی معاملات (P6546/گام سوم-۱ — پس‌زمینه‌ای) */
interface TxSyncResponse {
  ok: boolean;
  busy?: boolean;
  running?: boolean;
  message?: string;
  job?: { status: "idle" | "running" | "paused" | "done" | "failed"; progressPercent: number; lastCompletedPage: number; totalPages: number; detail: Record<string, unknown> | null } | null;
}

export function SuperListUpdate({ listId }: { listId: FourListId }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const userRole = useAppStore((s) => s.user?.role ?? "CONSULTANT");
  const isOwner = userRole === "OWNER";
  const [slicing, setSlicing] = useState(false);
  const m3PollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (m3PollTimer.current) clearInterval(m3PollTimer.current);
  }, []);

  /* ─── حقیقت یکپارچهٔ چهار فهرست (۱۰ث حین اجرا · ۳۰ث سکون — عین PN-083) ─── */
  const fourLists = useQuery({
    queryKey: ["four-lists-status"],
    queryFn: async () => (await api<FourListsViewUi>("/api/sync/four-lists")) ?? null,
    refetchInterval: (q) => (q.state.data?.running ? 10_000 : 30_000),
    staleTime: 60_000,
  });

  /* ─── کارهای پس‌زمینهٔ هماهنگ (۱۵ث حین اجرا · ۶۰ث سکون — عین تنظیمات) ─── */
  const jobs = useQuery({
    queryKey: ["super-update-jobs"],
    queryFn: async () => (await api<{ ok: boolean; jobs: JobView[] }>("/api/sync/jobs")) ?? null,
    refetchInterval: (q) => {
      const running = (q.state.data?.jobs ?? []).some((j) => j.status === "running");
      return running ? 15_000 : 60_000;
    },
    staleTime: 30_000,
  });

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["four-lists-status"] });
    void queryClient.invalidateQueries({ queryKey: ["super-update-jobs"] });
  };

  /* ─── مسیر ۲ و ۳ — چرخهٔ فوری (پرچم Worker ≤۶۰ث · فقط مالک · زیر قفل) ─── */
  const forceRefresh = useMutation({
    mutationFn: async (target: FourListId | "all") =>
      api<{ ok?: boolean; message?: string }>("/api/sync/four-lists", { method: "POST", body: { list: target } }),
    onSuccess: (_d, target) => {
      toast({
        title: target === "all" ? "درخواست چرخهٔ فوری هر چهار فهرست ثبت شد" : "درخواست چرخهٔ فوری همین فهرست ثبت شد",
        description: "چرخه حداکثر تا ۶۰ ثانیه دیگر زیر قفل هماهنگ‌ساز آغاز می‌شود — پیشرفت همین‌جا زنده است.",
      });
      refreshAll();
    },
    onError: (e) => {
      toast({ title: "ثبت درخواست فوری ناموفق", description: e instanceof Error ? e.message : "خطای نامشخص", variant: "destructive" });
    },
  });

  /* ─── مسیر ۱ — بروزرسانی برشی همین فهرست (همان دکمهٔ سابق داخل فهرست) ─── */
  const sliceSync = useCallback(async () => {
    setSlicing(true);
    try {
      if (listId === "m1" || listId === "m2") {
        // زنجیرهٔ عین سامانه ARM: لایهٔ فهرست + برش غنی‌سازی — تاب‌آور با apiSync
        const res = await apiSync<{
          lists: Array<{ fetched: number; totalAtSource: number; ok: boolean }>;
          enrich?: Array<{ enriched: number; remaining: number }>;
          busy?: { listings?: { message: string }; requests?: { message: string } };
        }>(
          "/api/crm/arm-catalog/sync",
          { method: "POST", body: { entity: listId === "m1" ? "listings" : "requests", mode: "both", maxRows: 500 } },
          (attempt) =>
            toast({
              title: `ادامهٔ بروزرسانی از نقطهٔ قطع (تلاش ${faDigits(String(attempt + 1))} از ۳)`,
              description: "سرور ملک تبریز لحظه‌ای کند بود؛ همان نقطهٔ قبلی ازسرگیری شد — هیچ داده‌ای از ابتدا شروع نمی‌شود.",
            })
        );
        if (res.busy?.[listId === "m1" ? "listings" : "requests"]) {
          toast({
            title: listId === "m1" ? "بروزرسانی آگهی‌ها همین حالا در جریان است" : "بروزرسانی درخواست‌ها همین حالا در جریان است",
            description: (listId === "m1" ? res.busy.listings?.message : res.busy.requests?.message) ?? "چرخهٔ زنده پس از پایان، تازه‌ترین داده را می‌آورد.",
          });
          refreshAll();
          return;
        }
        const list = res.lists?.[0];
        toast({
          title: listId === "m1" ? "بروزرسانی آگهی‌ها از سامانه‌های ملک تبریز انجام شد" : "بروزرسانی درخواست‌ها از سامانه‌های ملک تبریز انجام شد",
          description: list
            ? `${faNumber(list.fetched)} رکورد از مجموع ${faNumber(list.totalAtSource)} رکورد سامانه ARM در این برش خوانده شد و برش تکمیل جزئیات هم اجرا شد. ادامه از همان صفحه‌ای که تمام شده بود ازسر گرفته می‌شود.`
            : "بروزرسانی اجرا شد.",
        });
      } else if (listId === "m4") {
        // زنجیرهٔ سه‌مرحله‌ای PM (رجیستری → عمق → شمارش) — گزارش صادقانه
        const res = await apiSync<{ ok: boolean; stage?: { registryRows: number; deepEnriched: number; deepRemaining: number; registryError: string | null; counts?: { sale: number; rent: number } }; busy?: boolean; message?: string }>(
          "/api/experts/sync",
          { method: "POST" }
        );
        if (res.busy || !res.stage) {
          toast({ title: "بروزرسانی مشاوران همین حالا در جریان است", description: res.message ?? "چرخهٔ در حال اجرا پس از پایان، تازه‌ترین داده را می‌آورد." });
          refreshAll();
          return;
        }
        const s = res.stage;
        toast({
          title: "بروزرسانی فهرست کارشناسان انجام شد",
          description: s.registryError
            ? `رجیستری PM خطا داد: ${s.registryError.slice(0, 90)}`
            : `رجیستری: ${faNumber(s.registryRows)} نفر · عمق تازه: ${faNumber(s.deepEnriched)} نفر (باقی‌مانده: ${faNumber(s.deepRemaining)}) · شمارش: مبایعه ${faNumber(s.counts?.sale ?? 0)} / اجاره ${faNumber(s.counts?.rent ?? 0)}`,
        });
      } else {
        // m3 — مسیر پس‌زمینه‌ای: پاسخ فوری + پایش مرحله‌به‌مرحله تا پایان
        const res = await api<TxSyncResponse>("/api/crm/transactions/sync", { method: "POST" });
        toast({
          title: res.busy ? "بروزرسانی در جریان است" : "بروزرسانی پس‌زمینه‌ای معاملات آغاز شد",
          description: res.message ?? "پیشرفت مرحله‌به‌مرحله همین‌جا نمایش داده می‌شود.",
        });
        if (res.running) {
          // پایش زنده تا پایان (عین الگوی قبلی صفحه) — سپس رویداد تازه‌سازی فهرست
          if (m3PollTimer.current) clearInterval(m3PollTimer.current);
          m3PollTimer.current = setInterval(async () => {
            try {
              const p = await api<TxSyncResponse>("/api/crm/transactions/sync");
              if (p.job && p.job.status !== "running") {
                if (m3PollTimer.current) clearInterval(m3PollTimer.current);
                m3PollTimer.current = null;
                setSlicing(false);
                toast({
                  title: p.job.status === "done" ? "بروزرسانی معاملات کامل شد" : "بروزرسانی متوقف شد",
                  description:
                    p.job.status === "done"
                      ? "همهٔ مراحل (گزارش تطابق، جزئیات قراردادها، کارگزاری‌ها) با موفقیت انجام شد."
                      : "عملیات از همان نقطهٔ قطع‌شده ادامه می‌یابد — دوباره بروزرسانی را بزنید.",
                  variant: p.job.status === "done" ? "default" : "destructive",
                });
                refreshAll();
                announceSyncDone("m3");
              }
            } catch {
              /* پایش بهترین-تلاش — تایمر ادامه می‌یابد */
            }
          }, 3000);
          return; // slicing تا پایان کار برداشته نمی‌شود (دکمه زنده نشان دهد)
        }
      }
      refreshAll();
      announceSyncDone(listId);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "بروزرسانی ناموفق", description: e instanceof Error ? e.message : "خطای نامشخص", variant: "destructive" });
    } finally {
      // برای m3 حین پایش، حالت slicing دست می‌ماند تا job تمام شود
      if (listId !== "m3" || !(m3PollTimer.current)) setSlicing(false);
    }
  }, [listId, toast]);

  const view = fourLists.data;
  if (!view?.lists) return null; // پیش از نخستین پاسخ — بی‌صدا (داشبورد خودش هست)
  const lists = ORDER.map((id) => view.lists[id]).filter(Boolean);
  const current = view.lists[listId];
  const busy = view.running;
  const accent = ACCENT[listId];
  const live = current.status === "running" || current.lockHeldBy !== null;
  const chip = chipState(current);
  const enrichPct = current.enrich && current.enrich.total > 0 ? Math.round((current.enrich.complete / current.enrich.total) * 100) : null;
  const jobById = new Map((jobs.data?.jobs ?? []).map((j) => [j.jobId, j]));
  /* DIR-SUPER-STRUCT-001 (بخش ج · ۱) — ضربان قلب رله: زنده / هشدار / قطع */
  const hb = view.relay?.heartbeat ?? null;
  const hbFa = hb ? (hb.status === "alive" ? "رله زنده" : hb.status === "warning" ? "رله با هشدار" : "رله قطع شده است") : null;
  const relayDown = hb?.status === "silent";

  return (
    <section
      className={`rounded-xl border ${accent.card} p-3 shadow-sm space-y-3`}
      data-testid="super-list-update"
      data-super-list={listId}
      aria-label="بخش بروزرسانی فهرست فوق پیشرفته"
    >
      {/* DIR-SUPER-STRUCT-001 (بخش ج · ۱) — هشدار قطعی رله: سه ضربان متوالی غایب */}
      {hb && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] leading-5 ${
            relayDown
              ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
              : hb.status === "warning"
                ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          }`}
          data-testid="relay-heartbeat-banner"
          data-relay-heartbeat={hb.status}
        >
          {relayDown ? (
            <span aria-hidden>⛔</span>
          ) : hb.status === "warning" ? (
            <span aria-hidden>⚠️</span>
          ) : (
            <span aria-hidden>📡</span>
          )}
          <span>
            {relayDown
              ? "رلهٔ ترموکس قطع شده است — سه ضربان متوالی غایب است؛ چرخه‌های آیندهٔ سامانه ARM معلق می‌مانند تا بازگشت رله (نگهبان خودکار بازآیدش می‌کند)."
              : hb.status === "warning"
                ? `ضربان قلب رله تازه نیست (${hb.beatsMissed ?? "—"}+ ضربان غایب) اما صف کار فعال است — نسل قدیمی رله یا نگهبان تنها زنده است.`
                : `ضربان قلب رلهٔ ترموکس تازه است (نگهبان هر ۳۰ ثانیه می‌زند${hb.sinceSec != null ? ` — آخرین ${hb.sinceSec < 60 ? `${faDigits(String(hb.sinceSec))} ثانیه پیش` : `${faDigits(String(Math.round(hb.sinceSec / 60)))} دقیقه پیش`}` : ""}).`}
          </span>
        </div>
      )}

      {/* سربرگ + سه مسیر اجرا */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Rocket className={`w-5 h-5 shrink-0 ${accent.text}`} aria-hidden />
          <span className="text-sm font-bold truncate">
            بروزرسانی فهرست فوق پیشرفته — {current.label}
          </span>
          <span
            className={`inline-flex h-2.5 w-2.5 rounded-full flex-none ${busy ? "bg-amber-500 animate-pulse" : "bg-emerald-500"}`}
            aria-hidden
          />
          {hbFa && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold flex-none ${
                relayDown
                  ? "bg-rose-100 text-rose-800"
                  : hb?.status === "warning"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
              }`}
              data-testid="relay-heartbeat-chip"
              title={hb?.legacy ? "نسل قدیمی رله (بدون نگهبان) — قضاوت با فعالیت صف" : "ضربان قلب نگهبان ترموکس (۳۰ث)"}
            >
              {hbFa}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* مسیر ۱ — بروزرسانی برشی همین فهرست (همان دکمهٔ قبلی داخل فهرست) */}
          <Button
            type="button"
            size="sm"
            onClick={() => void sliceSync()}
            disabled={slicing || live}
            className={`gap-1.5 h-8 text-[11px] ${accent.button}`}
            title="اجرای زنجیرهٔ عین سامانه مبدأ برای همین فهرست — زیر قفل هماهنگ‌ساز، ادامه از نقطهٔ قطع"
          >
            {slicing ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden />}
            {slicing ? "در حال بروزرسانی…" : live ? "چرخهٔ زنده در جریان" : "بروزرسانی برشی همین فهرست"}
          </Button>
          {/* مسیر ۲ و ۳ — چرخهٔ فوری (پرچم Worker · فقط مالک) */}
          {isOwner && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => forceRefresh.mutate(listId)}
                disabled={forceRefresh.isPending || busy}
                className="gap-1.5 h-8 text-[11px]"
                title="چرخهٔ کامل فوری همین فهرست — حداکثر تا ۶۰ ثانیه دیگر زیر قفل اجرا می‌شود"
              >
                <Zap className="w-3.5 h-3.5" aria-hidden /> چرخهٔ فوری همین فهرست
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => forceRefresh.mutate("all")}
                disabled={forceRefresh.isPending || busy}
                className="gap-1.5 h-8 text-[11px]"
                title="اجرای فوری چرخهٔ هر چهار فهرست زیر قفل هماهنگ‌ساز"
              >
                <Layers className="w-3.5 h-3.5" aria-hidden /> هر چهار فهرست
              </Button>
            </>
          )}
        </div>
      </div>

      {/* پانل جزئیات فهرست جاری — ادغام بخش بروزرسانی داخل فهرست (بند ۴.۲ دستورهای P6546) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 text-[11px]" data-testid={`super-update-detail-${listId}`}>
        <div className="rounded-lg border bg-card p-2">
          <p className="text-muted-foreground">وضعیت این فهرست</p>
          <p className={`font-bold mt-0.5 ${chip.cls.includes("rose") ? "text-rose-700 dark:text-rose-300" : ""}`}>
            {live ? (current.lcppPhase === "deep-pass" ? "تکمیل جزئیات…" : "در حال بروزرسانی…") : STATUS_FA[current.status] ?? current.status}
            {current.sourceLabel ? ` · ${current.sourceLabel}` : ""}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-2">
          <p className="text-muted-foreground">{listId === "m1" ? "آخرین بروزرسانی فهرست" : listId === "m2" ? "آخرین بروزرسانی فهرست" : "آخرین اجرا"}</p>
          <p className="font-bold mt-0.5">
            {current.checkpoint?.completedAt || current.updatedAt
              ? faDateTime(current.checkpoint?.completedAt ?? current.updatedAt ?? "")
              : "هنوز انجام نشده"}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-2">
          <p className="text-muted-foreground">{current.checkpoint ? "پوشش فهرست منبع (ARM)" : "رکوردهای زندهٔ فهرست"}</p>
          <p className="font-bold mt-0.5 tabular-nums">
            {current.checkpoint
              ? `${faDigits(String(current.checkpoint.lastCompletedPage))} از ${faDigits(String(Math.max(current.checkpoint.totalPages, current.checkpoint.lastCompletedPage)))} صفحه — ${current.checkpoint.phase === "complete" ? "چرخهٔ کامل" : "در ادامه از همین نقطه"}`
              : current.rows !== null
                ? `${faNumber(current.rows)} رکورد`
                : "—"}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-2">
          <p className="text-muted-foreground">{current.checkpoint ? "رکوردهای منبع (ARM)" : "چرخهٔ کامل بعدی"}</p>
          <p className="font-bold mt-0.5 tabular-nums">
            {current.checkpoint
              ? current.checkpoint.totalAtSource > 0
                ? faNumber(current.checkpoint.totalAtSource)
                : "—"
              : current.nextCycleAt
                ? `≈ ${faTime(current.nextCycleAt)}`
                : "—"}
          </p>
        </div>
      </div>

      {/* پیشرفت چرخهٔ جاری + پوشش غنی‌سازی (M1/M2) + مرحلهٔ M4 */}
      <div className="space-y-2">
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-muted-foreground">
              {live
                ? `پیشرفت چرخهٔ جاری${current.lastCompletedPage > 0 && current.totalPages > 0 ? ` — مرحلهٔ ${faDigits(String(current.lastCompletedPage))} از ${faDigits(String(current.totalPages))}` : ""}`
                : current.lastWritten && current.lastWritten > 0
                  ? `آخرین چرخهٔ کامل: ${faNumber(current.lastWritten)} رکورد تازه نوشته شد`
                  : "چرخهٔ خودکار زیر قفل هماهنگ‌ساز"}
            </span>
            <span className="font-bold tabular-nums">{live && current.progressPercent > 0 ? `${faDigits(String(current.progressPercent))}٪` : ""}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={current.progressPercent} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full bg-gradient-to-l ${accent.bar} transition-all duration-500`} style={{ width: `${live ? Math.max(current.progressPercent, 4) : 100}%` }} />
          </div>
        </div>
        {current.enrich && enrichPct !== null && (
          <div>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-muted-foreground">پوشش تکمیل اطلاعات (لایهٔ ۲ — زنجیرهٔ ARM)</span>
              <span className="font-bold tabular-nums">
                {faNumber(current.enrich.complete)} / {faNumber(current.enrich.total)} ({faDigits(String(enrichPct))}٪)
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={enrichPct} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full bg-gradient-to-l ${accent.bar} transition-all duration-500`} style={{ width: `${enrichPct}%` }} />
            </div>
          </div>
        )}
        {/* DIR-SUPER-STRUCT-001 (بخش الف · ۱/۲) — پوشش برچسب اتمی رکوردها:
            لایهٔ حیاتی P0 (مالک/آدرس) → غنی‌سازی P1 → کامل؛ آبشار یعنی P1 تنها پس از
            پوشش کامل P0 پیش می‌رود — نوار سه‌قطعه‌ای همین داستان را صادقانه نشان می‌دهد. */}
        {current.stage && current.stage.total > 0 && (
          <div data-testid={`super-update-stage-${listId}`}>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-muted-foreground">برچسب اتمی رکوردها (لایهٔ حیاتی P0 · غنی‌سازی P1 · کامل)</span>
              <span className="font-bold tabular-nums">
                {faDigits(String(current.stage.completePct))}٪ کامل · {faNumber(current.stage.all)} / {faNumber(current.stage.total)}
              </span>
            </div>
            <div className="flex h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={current.stage.completePct} aria-valuemin={0} aria-valuemax={100} data-testid={`stage-bar-${listId}`}>
              <div className="h-full bg-emerald-500" style={{ width: `${(current.stage.all / current.stage.total) * 100}%` }} title={`کامل (ALL_DONE): ${current.stage.all}`} />
              <div className="h-full bg-amber-500" style={{ width: `${(current.stage.p0 / current.stage.total) * 100}%` }} title={`حیاتی نوشته، در انتظار غنی‌سازی (P0_DONE): ${current.stage.p0}`} />
              <div className="h-full bg-sky-500" style={{ width: `${(current.stage.p1 / current.stage.total) * 100}%` }} title={`غنی‌شده بدون لایهٔ حیاتی (P1_DONE): ${current.stage.p1}`} />
              <div className="h-full bg-slate-400" style={{ width: `${(current.stage.unmarked / current.stage.total) * 100}%` }} title={`قدیمی/بی‌برچسب (پیش از برچسب‌گذاری اتمی): ${current.stage.unmarked}`} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              P0: {faNumber(current.stage.p0)} · P1: {faNumber(current.stage.p1)} · کامل: {faNumber(current.stage.all)} · بی‌برچسب: {faNumber(current.stage.unmarked)}
              {current.stage.p1 > 0 ? " — آبشار: غنی‌سازی همین رکوردها تا نوشتن لایهٔ حیاتی صبر می‌کند" : ""}
            </p>
          </div>
        )}
        {current.detail?.error ? (
          <p className="text-[10px] text-rose-600 dark:text-rose-400 truncate" title={String(current.detail.error)}>
            خطای آخرین اجرا: {String(current.detail.error).slice(0, 140)}
          </p>
        ) : null}
      </div>

      {/* چهار چیپ فهرست‌ها — نوار PN-083 عیناً (منبع یک حقیقت) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
        {lists.map((l) => {
          const c = chipState(l);
          const lLive = l.status === "running" || l.lockHeldBy !== null;
          const isCurrent = l.id === listId;
          const titleParts = [
            l.label,
            c.text,
            l.sourceLabel ? `آخرین اجرا: ${l.sourceLabel}` : null,
            l.updatedAt ? `زمان: ${faTime(l.updatedAt)}` : null,
            l.nextCycleAt ? `چرخهٔ کامل بعدی ≈ ${faTime(l.nextCycleAt)}` : null,
            l.rows !== null ? `${faDigits(String(l.rows))} رکورد زنده` : null,
          ].filter(Boolean);
          return (
            <div
              key={l.id}
              className={`rounded-lg px-2.5 py-2 text-[11px] leading-5 ${c.cls} ${isCurrent ? "ring-2 ring-primary/50" : ""}`}
              title={titleParts.join(" · ")}
              data-testid={`four-lists-chip-${l.id}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold">{l.shortLabel}</span>
                {lLive && typeof l.progressPercent === "number" && l.progressPercent > 0 ? (
                  <span className="tabular-nums font-bold">{faDigits(String(l.progressPercent))}٪</span>
                ) : l.lastWritten && l.lastWritten > 0 ? (
                  <span className="tabular-nums font-bold">+{faDigits(String(l.lastWritten))}</span>
                ) : null}
              </div>
              <div className="opacity-90">
                {l.sourceLabel ?? c.text}
                {l.updatedAt ? ` · ${faTime(l.updatedAt)}` : ""}
              </div>
            </div>
          );
        })}
      </div>

      {/* نوار کارهای پس‌زمینهٔ هماهنگ — همان حقیقت تنظیمات (GET /api/sync/jobs) */}
      <div className="rounded-lg border bg-card/70 p-2" data-testid="super-update-bg-jobs">
        <div className="flex items-center gap-1.5 text-[11px] font-bold mb-1.5">
          <HardDriveDownload className="w-3.5 h-3.5 text-primary" aria-hidden />
          کارهای پس‌زمینهٔ هماهنگ (پایدار در برابر ری‌استارت)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1">
          {BG_JOBS.map(({ jobId, label }) => {
            const j = jobById.get(jobId);
            const st = j?.status ?? "idle";
            const dot = st === "running" ? "bg-blue-500 animate-pulse" : st === "done" ? "bg-emerald-600" : st === "failed" ? "bg-red-600" : "bg-slate-400";
            return (
              <div key={jobId} className="flex items-center gap-1.5 rounded-md border bg-card px-1.5 py-1 text-[10px]" title={`${label}: ${STATUS_FA[st] ?? st}${j?.updatedAt ? ` · ${faTime(j.updatedAt)}` : ""}`}>
                <span className={`inline-flex h-1.5 w-1.5 rounded-full flex-none ${dot}`} aria-hidden />
                <span className="truncate">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        هر سه مسیر اجرا (برشی · فوری همین فهرست · هر چهار فهرست) و چرخه‌های خودکار، همگی زیر قفل هماهنگ‌ساز یکسان اجرا می‌شوند — صفر اجرای موازی روی سامانهٔ مبدأ؛ پس از پایان هر اجرای برشی، فهرست پایین همین کاشی خودش تازه می‌شود.
      </p>
    </section>
  );
}
