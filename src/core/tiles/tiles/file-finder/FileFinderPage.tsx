"use client";

/**
 * کاشی «فایل‌یابی از دیوار» — صفحه اصلی (بازسازی DIR-FF-TILE-003 · دستور مالک ۱۴۰۵/۰۸/۳۰)
 * ------------------------------------------------------
 * اولاً) تمام جزییات بخش‌های مختلف کاشی:
 *   · شاخص‌ها و پنجره‌های چهارگانه: شکار / پیگیری / بررسی / تحت نظر (DIR-FF-WATCH-001)
 *   · تنظیمات اختصاصی ایجنت (وزن‌ها، آستانه‌ها، فیلتر زمان، دسته‌ها، فیلتر مکان، اسکن خودکار)
 *   · دکمه اسکن دیوار + خودکار دوره‌ای + گزارش اسکن‌های اخیر
 *   · پنل ایجنت + مشورهٔ مغز برای برترین فایل سطل جاری (موتور ۱۶)
 *   · پنجره‌های پنج کلید: پل دیوار / جزییات / رد / ثبت / ارجاع به تحت نظر (DIR-FF-WATCH-001)
 * ثانیاً) تمام ظرفیت‌های مغز ملکا بدون هیچ محدودیتی:
 *   · کارت «مغز ملکا» — DIR-FF-CAP-502/اولاً: بازشونده با پیش‌فرض «بسته» +
 *     بارگذاری تنبلکار در نخستین بازشدن؛ Tier + نوار پیشرفت + Brier/کالیبراسیون
 *     + سلامت ۲۵ بررسی + فرا-ذهن (موتورهای ۱۲-۱۵) + تختهٔ سیاه + شورا
 * ثالثاً) سیاست رلهٔ ترموکس (DIR-FF-RELAY-POLICY-001 · دستور مالک ۱۴۰۵/۰۹/۰۱):
 *   · اسکن دیوار به رلهٔ ترموکس نیازی ندارد — همیشه در «حالت عادی» و مستقیم
 *     از وب عمومی دیوار اجرا می‌شود (client.ts: fetch مستقیم · صفر صف رله)
 *   · رلهٔ ترموکس فقط و فقط هنگام ثبت فایل کشف‌شده در سامانه ARM به کار
 *     می‌رود (روت register: نشست تمام‌ظرفیت + اولویت رله)
 * رابعاً) DIR-OWNER-4STEPS-001 (گام دوم مالک ۱۴۰۵/۰۹/۰۵): بخش
 *   «حالت تمام‌ظرفیت ترموکس» به‌طور کامل از این کاشی حذف شد — سلوک
 *   سرور (نشست خودکار هنگام ثبت + اولویت سقف رله) پابرجاست؛ کاشی فایل‌یابی
 *   جز در لحظهٔ ثبت آگهی هیچ نیازی به رلهٔ ترموکس ندارد (دستور صریح مالک).
 *   مناطق/محله‌های تنظیمات ایجنت دقیقاً همانند بخش مناطق ثبت آگهی آرم شد
 *   (گام سوم) و دکمهٔ پیش‌فرضِ فهرست ۱۷منطقه‌ای حذف و آخرین انتخاب مالک تثبیت شد (گام چهارم).
 * پنجم) DIR-FF-SUPER-001 (دستور مالک — «فوق پیشرفته کردن فایل‌یابی»):
 *   · اسکن چندوجهی و فراعمیق — کارِ اسکن در پس‌زمینهٔ سرور با پنج فاز زنده
 *     (جست‌وجوی چنددسته‌ای → واکشی جزئیات با خطوط موازی → آمار بازار →
 *     بازامتیازدهی → ثبت گزارش) و پیشرفت زنده در UI (نظارت ۲.۵ثانیه‌ای)
 *   · POST اسکن فوری برمی‌گردد ⇒ مهلت ۲۰ثانیه‌ای مرورگر منتفی؛ اسکن بدون
 *     واسطهٔ ترموکس/رله و مستقیم از دیوار اجرا می‌شود (گام دوم)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, RefreshCw, Settings2, Crosshair, History, Info, ListFilter, Sparkles, Gauge,
  MapPin, ChevronDown, Brain,
  ClipboardCheck, Clock, Layers, Gem, Radar, Workflow, GitCompareArrows, FlaskConical, Eye,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
// PN-025/مرحلهٔ ۸ — کارت مشورهٔ موتور ۱۶ روی کاشی فایل‌یابی
import { AdviceCard } from "@/components/app/shared/AdviceCard";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber, faDateTime, faDigits } from "@/lib/format";
import { ArmRegionPicker } from "@/components/app/shared/arm-region-picker";
import { AdCard, type DivarAdRow } from "./AdCard";
import { AdDetailsDialog } from "./AdDetailsDialog";
import { RejectDialog } from "./RejectDialog";
import { RegisterDialog } from "./RegisterDialog";

interface AdsResponse {
  ok: boolean;
  rows: DivarAdRow[];
  bucketCounts: { hunt: number; follow: number; review: number; watch: number };
  thresholds: { hunt: number; follow: number };
  weights: { personal: number; underprice: number; other: number; location: number };
  locationFilter: { active: boolean; areaCount: number; lineCount: number };
}

interface SettingsResponse {
  ok: boolean;
  settings: {
    timeWindow: string;
    categories: string[];
    weightPersonal: number;
    weightUnderprice: number;
    weightOther: number;
    weightLocation: number;
    huntThreshold: number;
    followThreshold: number;
    autoScanMinutes: number;
    maxScanPages: number;
    minMarketSample: number;
    armPriceWeight: number;
    areaIds: string[];
    lineIds: string[];
  };
  meta: {
    categories: { value: string; label: string }[];
    timeWindows: { value: string; label: string }[];
    areas: { id: string; name: string; lineCount: number }[];
    totalLines: number;
  };
}

interface ScanLogRow {
  id: string;
  startedAt: string;
  durationMs: number;
  scanned: number;
  fetched: number;
  inWindow: number;
  outOfArea: number;
  autoRejected: number;
  newAds: number;
  updatedAds: number;
  source: string;
  error: string | null;
}

/** DIR-FF-SUPER-001 — کارِ اسکن پس‌زمینه (عین قرارداد GET/POST /api/divar/scan · فیلد job) */
interface ScanJobView {
  id: string;
  status: "running" | "done" | "failed";
  triggeredBy: "manual" | "auto";
  startedAt: string;
  updatedAt: string;
  phase: string;
  phaseLabel: string;
  progress: {
    scanned: number;
    processed: number;
    queueTotal: number;
    fetched: number;
    inWindow: number;
    outOfArea: number;
    autoRejected: number;
    newAds: number;
    updatedAds: number;
  };
  durationMs: number;
  summary: { message: string; newAds: number; inWindow: number; durationMs: number } | null;
  error: string | null;
}

/** وضعیت مغز ملکا — همان قرارداد کاشی یادگیری (/api/intelligence/status) */
interface BrainCoreCycle {
  tier: number;
  tierBasis: { linkedOutcomes: number; distinctPeriods: number };
  p7: {
    outcomesCollected: number;
    coveragePercent: number;
    evaluation: { metrics: { brierScore: number; lift: number; ece: number }; verdict: string };
    calibration?: { applied: boolean; mapVersion: string | null; rawBrier: number; calibratedBrier: number; rawLift: number; calibratedLift: number };
    brierTarget: number;
  };
  p10: { systemHealth: string; overallScore: number; checks: Array<{ id: string; name: string; status: string; details: string }> };
  p11: { proposals: Array<{ id: string; sourceCheckId: string; severity: string; status: string; rationale: string }>; executedCount: number };
}

interface MetaMindView {
  ranAt: string;
  engines: {
    attention: { alive: boolean; top: Array<{ itemId: string; total: number; reason: string }>; considered: number; budget: number; budgetLevel: string };
    causal: { alive: boolean; nodes: number; edges: number; sampleSize: number; dagVerified: boolean; refIntervention: { feature: string; delta: number; totalEffect: number; paths: number } | null };
    counterfactual: { alive: boolean; scenarios: Array<{ scenario: string; baseline: number; counterfactual: number; delta: number; confidence: number; reason: string }>; evidenceNote: string };
    simulation: { alive: boolean; comparison: { results: Array<{ action: { label: string }; simulatedProbability: number; delta: number; confidence: number; risks: string[]; autoExecute: false; reason: string }>; best: { action: { label: string }; delta: number } | null; recommendation: string } | null };
  };
  marketPressure: number;
  notes: string[];
}

interface BrainStatus {
  ok: boolean;
  coreCycle: BrainCoreCycle;
  metaMind?: MetaMindView;
  enginesWithBody?: number;
  enginesTotal?: number;
  daemon?: { alive: boolean; runs: number; lastRunAt: string | null };
}

interface BlackboardEntryView { namespace: string; engineId: string; at: string; hash: string; payload: unknown }

const TIME_WINDOW_LABELS: Record<string, string> = {
  "12h": "۱۲ ساعت گذشته",
  "24h": "۲۴ ساعت گذشته",
  "3d": "۳ روز گذشته",
  "7d": "۷ روز گذشته",
};

const TIER_MIN_OUTCOMES = [0, 10, 20, 50, 70];

export function FileFinderPage({ settings, onSettingsChange }: TilePageProps) {
  const { toast } = useToast();
  const [bucket, setBucket] = useState<string>("hunt");
  const [adsData, setAdsData] = useState<AdsResponse | null>(null);
  const [loadingAds, setLoadingAds] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [settingsData, setSettingsData] = useState<SettingsResponse | null>(null);
  const [scanLogs, setScanLogs] = useState<ScanLogRow[]>([]);
  // DIR-FF-SUPER-001 — وضعیت کار اسکن پس‌زمینه (پنج فاز + شمارنده‌های زنده)
  const [scanJob, setScanJob] = useState<ScanJobView | null>(null);
  const [detailsAd, setDetailsAd] = useState<DivarAdRow | null>(null);
  const [rejectAd, setRejectAd] = useState<DivarAdRow | null>(null);
  const [registerAd, setRegisterAd] = useState<DivarAdRow | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // DIR-FF-SUPER-001 — حلقهٔ نظارت اسکن پس از ترک کاشی متوقف می‌شود (بی‌نوشتن روی کامپوننت unmount)
  const aliveRef = useRef(true);
  // فیلتر مکان — رجیستری ARM (بارگذاری تنبلکار روی نخستین تعامل)
  // فیلتر مکان — رجیستری آرم مستقیم از ArmRegionPicker (بدون فراخوانی API)
  // مغز ملکا — تمام ظرفیت‌ها بدون محدودیت
  // DIR-FF-CAP-502/اولاً — کارت مغز بازشونده است و پیش‌فرض «بسته»؛ دادهٔ مغز
  // تنبلکار در نخستین بازشدن بارگذاری می‌شود (صفر فراخوانی اضافه در حالت بسته)
  const [brain, setBrain] = useState<BrainStatus | null>(null);
  const [board, setBoard] = useState<BlackboardEntryView[]>([]);
  const [brainOpen, setBrainOpen] = useState(false);
  const [brainLoadedOnce, setBrainLoadedOnce] = useState(false);

  const showScores = settings.showScoresInList !== false;
  const autoRefresh = settings.autoRefresh !== false;

  const loadAds = useCallback(async (b: string) => {
    try {
      // P6.5-09 — بدون صفحه‌بندی: همهٔ فایل‌های سطل در یک صفحه (سقف سرور ۱۰۰۰)
      const res = await api<AdsResponse>(`/api/divar/ads?bucket=${b}&limit=1000`);
      setAdsData(res);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "دریافت فایل‌ها ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setLoadingAds(false);
    }
  }, [toast]);

  const loadScanLogs = useCallback(async () => {
    try {
      const res = await api<{ ok: boolean; logs: ScanLogRow[]; job?: ScanJobView | null }>("/api/divar/scan");
      setScanLogs(res.logs ?? []);
      // کارِ جاری (اسکن خودکار/دستی) از همان پاسخ خوانده می‌شود — بی‌فراخوانی اضافه
      if (res.job) setScanJob(res.job);
    } catch {
      // بی‌صدا — لاگ جانبی است
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api<SettingsResponse>("/api/divar/settings");
      setSettingsData(res);
    } catch {
      // بی‌صدا
    }
  }, []);

  /** وضعیت مغز ملکا — Tier/فرا-ذهن/تختهٔ سیاه (تمام ظرفیت‌ها) */
  const loadBrain = useCallback(async () => {
    try {
      const [status, blackboard] = await Promise.all([
        api<BrainStatus>("/api/intelligence/status"),
        api<{ ok: boolean; entries: BlackboardEntryView[] }>("/api/intelligence/blackboard?limit=30"),
      ]);
      setBrain(status);
      setBoard(blackboard.entries ?? []);
    } catch {
      // بی‌صدا — کارت مغز صادقانه خالی می‌ماند
    }
  }, []);

  useEffect(() => {
    setLoadingAds(true);
    void loadAds(bucket);
    void loadSettings();
    void loadScanLogs();
    // مغز: تنبلکار — DIR-FF-CAP-502/اولاً (فقط با بازشدن کارت، loadBrain اجرا می‌شود)
  }, [bucket, loadAds, loadSettings, loadScanLogs]);

  // DIR-FF-SUPER-001 — حلقهٔ نظارت اسکن فقط تا سکون کاشی زنده می‌ماند
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    refreshTimer.current = setInterval(() => {
      void loadAds(bucket);
      void loadScanLogs();
    }, 60000);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [autoRefresh, bucket, loadAds, loadScanLogs]);

  /**
   * DIR-FF-SUPER-001/گام اول+دوم — اسکن چندوجهی با کارِ پس‌زمینه:
   * POST فوری کار را آغاز می‌کند (مستقیم از وب دیوار — بی‌رله) و سپس تا پایان
   * با نظارت ۲.۵ثانیه‌ای پیشرفت زنده خوانده می‌شود ⇒ مهلت ۲۰ثانیه‌ای مرورگر
   * منتفی و پیام گمراه‌کنندهٔ رله/ترموکس هرگز برای اسکن ظاهر نمی‌شود.
   */
  const runScan = async () => {
    setScanning(true);
    setScanJob(null);
    try {
      const res = await api<{ ok: boolean; started?: boolean; job?: ScanJobView | null }>("/api/divar/scan", { method: "POST" });
      let job = res.job ?? null;
      // نظارت زندهٔ کار پس‌زمینه — تا «انجام/خطا» یا ترک کاشی
      while (aliveRef.current && job && job.status === "running") {
        setScanJob(job);
        await new Promise((r) => setTimeout(r, 2500));
        if (!aliveRef.current) return;
        try {
          const st = await api<{ ok: boolean; job: ScanJobView | null }>("/api/divar/scan");
          job = st.job ?? null;
        } catch {
          break; // نظارت بهترین‌تلاش — کار در سرور ادامه دارد؛ نتیجه در گزارش اسکن‌ها می‌نشیند
        }
      }
      setScanJob(job);
      if (job && job.status === "failed") {
        toast({ title: "اسکن ناموفق", description: job.error ?? "خطای نامشخص در اسکن.", variant: "destructive" });
      } else if (job && job.status === "done") {
        toast({ title: "اسکن دیوار انجام شد", description: job.summary?.message ?? "اسکن کامل شد." });
      } else {
        toast({
          title: "اسکن در پس‌زمینهٔ سرور ادامه دارد",
          description: "نظارت زنده موقتاً قطع شد؛ اسکن در سرور اجرا می‌شود و نتیجهٔ کامل در «گزارش اسکن‌های اخیر» می‌نشیند.",
        });
      }
      await Promise.all([loadAds(bucket), loadScanLogs(), loadBrain()]);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "اسکن ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  };

  const saveSettingsPatch = async (patch: Record<string, unknown>) => {
    try {
      const res = await api<{ ok: boolean; settings: SettingsResponse["settings"]; message: string }>("/api/divar/settings", {
        method: "PUT",
        body: patch,
      });
      setSettingsData((prev) => (prev ? { ...prev, settings: res.settings } : prev));
      toast({ title: "تنظیمات ذخیره شد", description: res.message });
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ذخیره تنظیمات ناموفق", description: e.message, variant: "destructive" });
    }
  };

  /** ذخیره انتخاب مکان + تازه‌سازی فهرست آگهی‌ها (فیلتر روی فهرست اثر دارد) */
  const saveLocationPatch = useCallback(
    async (patch: { areaIds: string[]; lineIds: string[] }) => {
      await saveSettingsPatch(patch);
      void loadAds(bucket);
    },
    [bucket, loadAds]
  );

  const selAreaIds = settingsData?.settings.areaIds ?? [];
  const selLineIds = settingsData?.settings.lineIds ?? [];
  const locationFilterActive = selAreaIds.length > 0 || selLineIds.length > 0;

  const clearLocationFilter = () => {
    void saveLocationPatch({ areaIds: [], lineIds: [] });
  };

  /** DIR-FF-WATCH-001 — کلید «ارجاع به تحت نظر»: فایل به پنجرهٔ تحت نظر ارجاع می‌شود */
  const onWatch = useCallback(
    async (ad: DivarAdRow) => {
      setBusyAction(ad.token);
      try {
        const res = await api<{ ok: boolean; message: string; alreadyWatched?: boolean }>(`/api/divar/ads/${encodeURIComponent(ad.token)}/watch`, { method: "POST" });
        toast({ title: res.alreadyWatched ? "فایل از قبل تحت نظر است" : "فایل به بخش «تحت نظر» ارجاع شد", description: res.message });
        await loadAds(bucket);
      } catch (err) {
        const e = err as ApiClientError;
        toast({ title: "ارجاع به تحت نظر ناموفق", description: e.message, variant: "destructive" });
      } finally {
        setBusyAction(null);
      }
    },
    [toast, loadAds, bucket, setBusyAction]
  );

  const onRejected = useCallback(() => {
    setBusyAction(null);
    void loadAds(bucket);
    void loadBrain(); // سیگنال یادگیری تازه — مغز هم تازه شود
  }, [loadAds, bucket, loadBrain]);

  const onRegistered = useCallback(() => {
    void loadAds(bucket);
  }, [loadAds, bucket]);

  /**
   * DIR-FF-CAP-502/اولاً — باز/بسته کردن کارت مغز ملکا (پیش‌فرض بسته).
   * در نخستین بازشدن، دادهٔ مغز بارگذاری می‌شود (تنبلکار)؛ «تازه‌سازی مغز»
   * همیشه مجاز است حتی در حالت بسته (نتیجه در نشان‌های سربرگ دیده می‌شود).
   */
  const handleBrainOpenChange = useCallback(
    (open: boolean) => {
      setBrainOpen(open);
      if (open && !brainLoadedOnce) {
        setBrainLoadedOnce(true);
        void loadBrain();
      }
    },
    [brainLoadedOnce, loadBrain]
  );

  const counts = adsData?.bucketCounts ?? { hunt: 0, follow: 0, review: 0, watch: 0 };
  const thresholds = adsData?.thresholds ?? { hunt: 70, follow: 40 };
  const lastScan = scanLogs[0];

  const rows = useMemo(() => adsData?.rows ?? [], [adsData]);

  // ── مغز ملکا: مشتقات نمایش ──
  const cycle = brain?.coreCycle ?? null;
  const tier = cycle?.tier ?? 0;
  const outcomes = cycle?.tierBasis.linkedOutcomes ?? 0;
  const nextAt = tier < 4 ? TIER_MIN_OUTCOMES[tier + 1] : null;
  const tierProgress = nextAt ? Math.min(100, Math.round((outcomes / nextAt) * 100)) : 100;
  const checks = cycle?.p10.checks ?? [];
  const pass = checks.filter((c) => c.status === "pass").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  const fail = checks.filter((c) => c.status === "fail").length;
  const metaMind = brain?.metaMind ?? null;

  // ── DIR-FF-SUPER-001 — کار اسکن: مشتقات نمایش (پیشرفت پنج‌فازی) ──
  const scanRunning = scanJob?.status === "running";
  const scanProgressPct = useMemo(() => {
    if (!scanJob) return 0;
    if (scanJob.status !== "running") return 100;
    if (scanJob.phase === "details" && scanJob.progress.queueTotal > 0) {
      return Math.min(99, Math.round((scanJob.progress.processed / scanJob.progress.queueTotal) * 100));
    }
    if (scanJob.phase === "search") return 12;
    if (scanJob.phase === "stats") return 80;
    if (scanJob.phase === "rescore") return 92;
    return 96; // finalize
  }, [scanJob]);

  return (
    <div data-negin="yaghut-kamani" className="space-y-6" data-tile-page="file-finder">
      {/* نگین (PN-024) — میلهٔ گوهر yaghut-kamani */}
      <div className="negin-bar" aria-hidden />
      {/* نوار ابزار عملیاتی — هدر اصلی از TileShell می‌آید (بدون تکرار) */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          {adsData?.locationFilter?.active && (
            <Badge variant="outline" className="gap-1 text-[10px] h-5 hidden sm:inline-flex">
              <MapPin className="w-3 h-3" aria-hidden />
              فیلتر مکان: {faNumber(adsData.locationFilter.areaCount)} منطقه
            </Badge>
          )}
          {lastScan && (
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              آخرین اسکن: {faDateTime(lastScan.startedAt)}
              {lastScan.error ? " — با خطا" : ` — ${faNumber(lastScan.newAds)} فایل شخصی تازه${lastScan.autoRejected > 0 ? ` / ${faNumber(lastScan.autoRejected)} رد خودکار` : ""}`}
            </span>
          )}
          <Button size="sm" className="gap-1.5 bg-sec-finder-500 hover:bg-sec-finder-500/90 text-sec-finder-fg" onClick={runScan} disabled={scanning}>
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Crosshair className="w-4 h-4" aria-hidden />}
            اسکن دیوار
          </Button>
        </div>
      </div>

      {/* DIR-FF-SUPER-001 — پیشرفت زندهٔ کار اسکن پس‌زمینه (پنج فاز + شمارنده‌های لحظه‌ای) */}
      {scanRunning && scanJob && (
        <div className="rounded-xl border border-sec-finder-500/40 bg-sec-finder-500/5 p-3 space-y-2" role="status" aria-live="polite" data-scan-progress>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
              {scanJob.phaseLabel}
              {scanJob.triggeredBy === "auto" ? " (اسکن خودکار)" : ""}
            </span>
            <span className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3">
              {scanJob.phase === "details" && scanJob.progress.queueTotal > 0 && (
                <span>پردازش {faNumber(scanJob.progress.processed)} از {faNumber(scanJob.progress.queueTotal)}</span>
              )}
              <span>بررسی‌شده {faNumber(scanJob.progress.scanned)}</span>
              <span>درون بازه {faNumber(scanJob.progress.inWindow)}</span>
              <span>تازه {faNumber(scanJob.progress.newAds)}</span>
              {scanJob.progress.autoRejected > 0 && <span>رد خودکار {faNumber(scanJob.progress.autoRejected)}</span>}
            </span>
          </div>
          <Progress value={scanProgressPct} className="h-1.5" aria-label="پیشرفت اسکن فایل‌یابی" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            اسکن چندوجهی در پس‌زمینهٔ سرور و مستقیم از وب دیوار اجرا می‌شود — بی‌نیاز از رلهٔ ترموکس؛ این پنجره می‌تواند باز بماند.
          </p>
        </div>
      )}

      {/* شاخص‌ها — DIR-FF-WATCH-001: دکمهٔ چهارم «تحت نظر» در همین کادر مادر (دستور مالک ۱۴۰۵/۰۹/۰۳) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { key: "hunt", label: "فایل‌های شکار", desc: `امتیاز بالای ${faNumber(thresholds.hunt)}`, icon: Sparkles, tone: "border-teal-500/50 bg-gradient-to-b from-teal-500/10 to-transparent", iconCls: "text-teal-600 dark:text-teal-400" },
          { key: "follow", label: "فایل‌های پیگیری", desc: `${faNumber(thresholds.follow)} تا ${faNumber(thresholds.hunt)}`, icon: Gauge, tone: "border-amber-500/50 bg-gradient-to-b from-amber-500/10 to-transparent", iconCls: "text-amber-600 dark:text-amber-400" },
          { key: "review", label: "فایل‌های بررسی", desc: `زیر ${faNumber(thresholds.follow)}`, icon: ListFilter, tone: "border-border bg-gradient-to-b from-muted/60 to-transparent", iconCls: "text-muted-foreground" },
          { key: "watch", label: "فایل‌های تحت نظر", desc: "ارجاع‌شده برای پایش", icon: Eye, tone: "border-teal-600/50 bg-gradient-to-b from-teal-600/10 to-transparent", iconCls: "text-teal-700 dark:text-teal-400" },
        ].map((b) => (
          <button
            key={b.key}
            onClick={() => setBucket(b.key)}
            className={`rounded-xl border p-3 text-right transition-shadow hover:shadow-md ${b.tone} ${bucket === b.key ? "ring-2 ring-primary/50" : ""}`}
            aria-pressed={bucket === b.key}
          >
            <div className="flex items-center justify-between gap-1">
              <p className="text-xl font-extrabold tabular-nums">{faNumber(counts[b.key as keyof typeof counts] ?? 0)}</p>
              <b.icon className={`w-4 h-4 shrink-0 ${b.iconCls}`} aria-hidden />
            </div>
            <p className="text-xs font-bold mt-0.5">{b.label}</p>
            <p className="text-[10px] text-muted-foreground">{b.desc}</p>
          </button>
        ))}
      </div>

      {/* DIR-OWNER-4STEPS-001 (گام دوم · اولاً) — بخش «حالت تمام‌ظرفیت ترموکس» به‌طور کامل
          حذف شد (دستور مالک). سلوک سرور در روت ثبت پابرجاست: نشست تمام‌ظرفیت خودکار +
          اولویت سقف رله، دقیقاً همان‌جا که باید — در لحظهٔ ثبت آگهی در سامانه ARM. */}

      {/* ═══ مغز ملکا — تمام ظرفیت‌ها بدون هیچ محدودیتی (DIR-FF-TILE-003) ═══ */}
      {/* DIR-FF-CAP-502/اولاً — بازشونده با پیش‌فرض «بسته» + بارگذاری تنبلکار مغز در نخستین بازشدن */}
      <Card data-negin="nili">
        <Collapsible open={brainOpen} onOpenChange={handleBrainOpenChange}>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <CollapsibleTrigger className="flex-1 min-w-0 text-right rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={brainOpen ? "بستن بخش مغز ملکا" : "باز کردن بخش مغز ملکا"}>
                <span className="text-sm font-bold flex items-center gap-2 flex-wrap">
                  <Brain className="h-4 w-4 text-sec-m8-500" aria-hidden />
                  مغز ملکا — تمام ظرفیت‌ها در خدمت فایل‌یابی
                  {cycle && <Badge variant="outline" className="text-[10px]">Tier {faDigits(tier)} از ۴</Badge>}
                  {brain?.daemon?.alive && <Badge variant="outline" className="text-[10px]">دیمن v2 زنده — {faNumber(brain.daemon.runs)} اجرا</Badge>}
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-200 mr-auto ${brainOpen ? "" : "rotate-90"}`}
                    aria-hidden
                  />
                </span>
              </CollapsibleTrigger>
              <Button variant="ghost" size="sm" className="gap-1 h-6 text-[11px] shrink-0" onClick={() => { setBrainLoadedOnce(true); void loadBrain(); }}>
                <RefreshCw className="size-3" /> تازه‌سازی مغز
              </Button>
            </div>
          </CardHeader>
          <CollapsibleContent>
          <CardContent className="space-y-3">
          {!brain ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full rounded-xl" />
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> در حال دریافت وضعیت زندهٔ مغز…
              </p>
            </div>
          ) : cycle ? (
            <>
              {/* Tier + نوار پیشرفت + Brier */}
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border p-2.5 space-y-1.5">
                  <p className="text-xs font-bold flex items-center gap-1.5"><Layers className="size-3.5 text-sec-m8-500" /> Tier {faDigits(tier)} از ۴ — {faDigits(outcomes)} نتیجهٔ پیوندشده</p>
                  <Progress value={tierProgress} className="h-2" />
                  <p className="text-[10px] text-muted-foreground">
                    {nextAt ? `تا Tier ${faDigits(tier + 1)}: ${faDigits(Math.max(0, nextAt - outcomes))} نتیجهٔ باقی‌مانده · ${faDigits(cycle.tierBasis.distinctPeriods)} دورهٔ متمایز` : "Tier ۴ — کامل"}
                  </p>
                </div>
                <div className="rounded-lg border p-2.5">
                  <p className="text-muted-foreground text-[10px]">Brier فعال {cycle.p7.calibration?.applied ? "(کالیبره)" : ""} — هدف ≤ {faDigits(cycle.p7.brierTarget?.toFixed(2) ?? "—")}</p>
                  <p className="font-bold text-sm">{cycle.p7.evaluation.metrics.brierScore != null ? faDigits(cycle.p7.evaluation.metrics.brierScore.toFixed(4)) : "— دادهٔ کافی نیست"}</p>
                  <p className="text-[10px] text-muted-foreground">Lift: {cycle.p7.evaluation.metrics.lift != null ? `+${faDigits(cycle.p7.evaluation.metrics.lift.toFixed(1))}٪` : "—"} · پوشش پیامد {faDigits(cycle.p7.coveragePercent)}٪</p>
                </div>
                <div className="rounded-lg border p-2.5">
                  <p className="text-muted-foreground text-[10px]">خودتشخیصی — سلامت: {cycle.p10.systemHealth === "healthy" ? "سالم" : cycle.p10.systemHealth === "degraded" ? "کاهش‌یافته" : "بحرانی"}</p>
                  <p className="font-bold text-sm">نمره {faDigits(cycle.p10.overallScore)}/۱۰۰ · {faDigits(checks.length)} بررسی</p>
                  <p className="text-[10px] text-muted-foreground">
                    <span className="text-emerald-600">{faDigits(pass)} سبز</span> · <span className="text-amber-600">{faDigits(warn)} هشدار</span> · <span className="text-red-600">{faDigits(fail)} قرمز</span>
                  </p>
                </div>
              </div>

              {/* کالیبراسیون مصوب */}
              {cycle.p7.calibration?.applied ? (
                <p className="text-[11px] text-muted-foreground rounded-lg border border-dashed p-2.5">
                  <span className="font-bold">بازکالیبراسیون ({cycle.p7.calibration.mapVersion}):</span>{" "}
                  Brier {faDigits(cycle.p7.calibration.rawBrier.toFixed(4))} ← <span className="font-bold text-emerald-600">{faDigits(cycle.p7.calibration.calibratedBrier.toFixed(4))}</span>
                  {" · "}Lift +{faDigits(cycle.p7.calibration.rawLift.toFixed(1))}٪ ← <span className="font-bold text-emerald-600">+{faDigits(cycle.p7.calibration.calibratedLift.toFixed(1))}٪</span>
                </p>
              ) : null}

              <Tabs defaultValue="metamind">
                <TabsList className="grid w-full grid-cols-4 h-auto">
                  <TabsTrigger value="metamind" className="gap-1 text-[11px] py-1.5 text-negin-nili-700 dark:text-negin-nili-300"><Gem className="size-3.5" /> فرا-ذهن</TabsTrigger>
                  <TabsTrigger value="checks" className="gap-1 text-[11px] py-1.5"><ClipboardCheck className="size-3.5" /> خودتشخیصی</TabsTrigger>
                  <TabsTrigger value="pending" className="gap-1 text-[11px] py-1.5"><Clock className="size-3.5" /> شورا ({faDigits(cycle.p11.proposals.length)})</TabsTrigger>
                  <TabsTrigger value="board" className="gap-1 text-[11px] py-1.5"><Layers className="size-3.5" /> تختهٔ سیاه</TabsTrigger>
                </TabsList>

                {/* فرا-ذهن — موتورهای ۱۲ تا ۱۵ */}
                <TabsContent value="metamind" className="mt-2">
                  {metaMind ? (
                    <div className="space-y-2">
                      {/* موتور ۱۲ — توجه */}
                      <div className="rounded border p-2.5 text-xs">
                        <p className="font-bold flex items-center gap-1.5"><Radar className="w-3.5 h-3.5 text-negin-nili-500" aria-hidden /> موتور ۱۲ — توجه: {faDigits(metaMind.engines.attention.top.length)} برتر روز با دلیل</p>
                        <p className="text-muted-foreground mt-1">
                          از {faDigits(metaMind.engines.attention.considered)} آگهی تازه · بودجهٔ {metaMind.engines.attention.budgetLevel === "DAILY" ? "روزانه" : metaMind.engines.attention.budgetLevel} ({faDigits(metaMind.engines.attention.budget)} مورد)
                        </p>
                        <div className="max-h-40 overflow-auto space-y-1 mt-1.5">
                          {metaMind.engines.attention.top.slice(0, 10).map((t, i) => (
                            <div key={t.itemId} className="flex items-start gap-2 rounded border p-1.5">
                              <Badge variant="outline" className="shrink-0 h-5">{faDigits(i + 1)}</Badge>
                              <div className="flex-1 min-w-0">
                                <p className="truncate"><span className="font-bold" dir="ltr">{t.itemId}</span> — امتیاز <span className="font-bold text-negin-nili-700 dark:text-negin-nili-300">{faDigits(t.total)}</span></p>
                                <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{t.reason}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* موتور ۱۳ — علّیت */}
                      <div className="rounded border p-2.5 text-xs">
                        <p className="font-bold flex items-center gap-1.5"><Workflow className="w-3.5 h-3.5 text-negin-nili-500" aria-hidden /> موتور ۱۳ — علّیت: گراف DAG روی {faDigits(metaMind.engines.causal.sampleSize)} نمونهٔ واقعی</p>
                        {metaMind.engines.causal.alive ? (
                          <>
                            <p className="text-muted-foreground mt-1">
                              {faDigits(metaMind.engines.causal.nodes)} گره · {faDigits(metaMind.engines.causal.edges)} یال علّی
                              {metaMind.engines.causal.dagVerified ? " · صفر چرخه ✓" : ""}
                            </p>
                            {metaMind.engines.causal.refIntervention && (
                              <p className="mt-1.5 rounded bg-muted/50 p-2">
                                کشف کلیدی — do({metaMind.engines.causal.refIntervention.feature} += ۱):
                                <span className="font-bold text-emerald-600"> +{faDigits(Math.round(metaMind.engines.causal.refIntervention.totalEffect * 1000) / 10)}٪ احتمال معامله</span>
                                <span className="text-muted-foreground"> — از {faDigits(metaMind.engines.causal.refIntervention.paths)} مسیر علّی (Pearl L2)</span>
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-muted-foreground mt-1">گراف علّی هنوز ساخته نشده — پس از شاهد علّی نخست فعال می‌شود.</p>
                        )}
                      </div>
                      {/* موتور ۱۴ — پادواقع */}
                      <div className="rounded border p-2.5 text-xs">
                        <p className="font-bold flex items-center gap-1.5"><GitCompareArrows className="w-3.5 h-3.5 text-negin-nili-500" aria-hidden /> موتور ۱۴ — پادواقع (Pearl L3)</p>
                        {metaMind.engines.counterfactual.scenarios.length > 0 ? (
                          <div className="mt-1 space-y-1">
                            {metaMind.engines.counterfactual.scenarios.map((s) => (
                              <p key={s.scenario} className="rounded bg-muted/50 p-2">
                                «{s.scenario}»: {faDigits(Math.round(s.baseline * 1000) / 10)}٪ → <span className="font-bold">{faDigits(Math.round(s.counterfactual * 1000) / 10)}٪</span>
                                <span className={s.delta >= 0 ? "font-bold text-emerald-600" : "font-bold text-red-600"}> (Δ {s.delta >= 0 ? "+" : ""}{faDigits(Math.round(s.delta * 1000) / 10)}٪)</span>
                                <span className="text-muted-foreground"> · اطمینان {faDigits(s.confidence)}</span>
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-muted-foreground mt-1">شاهد معیار کافی نیست — پس از غنی‌سازی معاملات فعال می‌شود.</p>
                        )}
                      </div>
                      {/* موتور ۱۵ — شبیه‌سازی */}
                      <div className="rounded border p-2.5 text-xs">
                        <p className="font-bold flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5 text-negin-nili-500" aria-hidden /> موتور ۱۵ — شبیه‌سازی: آزمون تصمیم پیش از اجرا</p>
                        {metaMind.engines.simulation.comparison ? (
                          <div className="mt-1 space-y-1">
                            {metaMind.engines.simulation.comparison!.results.map((r) => (
                              <p key={r.action.label} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1">
                                <span>{r.action.label}</span>
                                <span className={r.delta > 0 ? "font-bold text-emerald-600" : r.delta < 0 ? "font-bold text-red-600" : "text-muted-foreground"}>
                                  Δ {r.delta >= 0 ? "+" : ""}{faDigits(Math.round(r.delta * 1000) / 10)}٪
                                </span>
                              </p>
                            ))}
                            <p className="text-[10px] leading-relaxed text-muted-foreground">{metaMind.engines.simulation.comparison!.recommendation} — فشار بازار: {faDigits(metaMind.marketPressure)} · قفل ابدی: صفر اجرای خودکار (auto_execute=false)</p>
                          </div>
                        ) : (
                          <p className="text-muted-foreground mt-1">در انتظار گراف و شاهد معیار.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-4 text-center">فرا-ذهن در این نسخه در دسترس نیست.</p>
                  )}
                </TabsContent>

                {/* ۲۵ بررسی خودتشخیصی */}
                <TabsContent value="checks" className="mt-2">
                  <div className="max-h-72 overflow-auto space-y-1">
                    {checks.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 rounded border p-1.5 text-xs">
                        <Badge className={c.status === "pass" ? "bg-emerald-600" : c.status === "warn" ? "bg-amber-500" : "bg-red-600"}>{c.status === "pass" ? "سبز" : c.status === "warn" ? "هشدار" : "قرمز"}</Badge>
                        <span className="w-24 shrink-0 text-muted-foreground" dir="ltr">{c.id}</span>
                        <span className="w-32 shrink-0 font-medium">{c.name}</span>
                        <span className="truncate text-muted-foreground">{c.details}</span>
                      </div>
                    ))}
                    {checks.length === 0 ? <p className="text-xs text-muted-foreground">فهرست بررسی خالی است.</p> : null}
                  </div>
                </TabsContent>

                {/* در انتظار شورا */}
                <TabsContent value="pending" className="mt-2">
                  {cycle.p11.proposals.length === 0 ? (
                    <p className="text-xs text-muted-foreground">هیچ پیشنهاد ترمیمِ بازی در انتظار نیست — صفر اجرای خودکار (قفل ابدی).</p>
                  ) : (
                    <div className="space-y-1 max-h-72 overflow-auto">
                      {cycle.p11.proposals.map((p) => (
                        <div key={p.id} className="flex items-start gap-2 rounded border p-2 text-xs">
                          <Badge variant={p.severity === "critical" || p.severity === "high" ? "destructive" : "outline"}>{p.severity}</Badge>
                          <div className="flex-1">
                            <p className="font-medium" dir="ltr">{p.sourceCheckId} — {p.id}</p>
                            <p className="text-muted-foreground">{p.rationale}</p>
                          </div>
                          <Badge variant="outline">{p.status === "pending" ? "در انتظار" : p.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* تختهٔ سیاه */}
                <TabsContent value="board" className="mt-2">
                  <div className="max-h-72 overflow-auto space-y-1">
                    {board.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 rounded border p-1.5 text-[11px]">
                        <Badge variant="outline">{e.namespace}</Badge>
                        <span className="text-muted-foreground" dir="ltr">{e.engineId}</span>
                        <span className="truncate" dir="ltr">{JSON.stringify(e.payload).slice(0, 70)}</span>
                        <span className="mr-auto shrink-0 text-muted-foreground" dir="ltr">{e.at.slice(0, 19).replace("T", " ")}</span>
                      </div>
                    ))}
                    {board.length === 0 ? <p className="text-xs text-muted-foreground">تخته خالی است.</p> : null}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">چرخهٔ مغز هنوز اجرا نشده است.</p>
          )}
          </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* تنظیمات اختصاصی ایجنت */}
      <Accordion type="single" collapsible>
        <AccordionItem value="agent-settings" className="border rounded-xl px-4">
          <AccordionTrigger className="text-sm font-bold py-3">
            <span className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" aria-hidden /> تنظیمات اختصاصی ایجنت فایل‌یابی
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-5 pb-4">
            {settingsData ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">فیلتر زمانی آگهی‌ها (بر زمان واقعی انتشار)</Label>
                    <Select
                      value={settingsData.settings.timeWindow}
                      onValueChange={(v) => saveSettingsPatch({ timeWindow: v })}
                    >
                      <SelectTrigger className="text-xs" aria-label="بازه زمانی اسکن">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {settingsData.meta.timeWindows.map((w) => (
                          <SelectItem key={w.value} value={w.value} className="text-xs">{w.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground leading-5">
                      فیلتر بر «انتشار آگهی» از جزئیات دیوار اعمال می‌شود — آگهی‌های نردبان‌شده قدیمی در بازه نمی‌آیند.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">اسکن خودکار هر (دقیقه) — ۰ = خاموش</Label>
                    <Input
                      type="number"
                      min={0}
                      max={240}
                      defaultValue={settingsData.settings.autoScanMinutes}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (isFinite(v) && v !== settingsData.settings.autoScanMinutes) void saveSettingsPatch({ autoScanMinutes: v });
                      }}
                      className="text-xs"
                      aria-label="فاصله اسکن خودکار به دقیقه"
                    />
                    <p className="text-[11px] text-muted-foreground leading-5">اسکن خودکار با بازدید شما از صفحه فعال می‌شود.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label className="text-xs font-bold flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-primary" aria-hidden /> جستجوی مناطق و محله‌ها
                      <Badge variant={locationFilterActive ? "default" : "secondary"} className="text-[10px] h-5 px-1.5">
                        {locationFilterActive
                          ? `${faNumber(selAreaIds.length)} منطقه${selLineIds.length > 0 ? ` + ${faNumber(selLineIds.length)} محله` : ""}`
                          : "همه تبریز"}
                      </Badge>
                    </Label>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={clearLocationFilter} disabled={!locationFilterActive}>
                        همه تبریز
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-5">
                    {locationFilterActive
                      ? "اسکن فقط آگهی‌های مناطق/محله‌های انتخابی را نگه می‌دارد؛ آگهی بیرون از انتخاب یا بدون نشانه مکانی قابل اتکا، هرگز ذخیره نمی‌شود."
                      : "فیلتر مکان خاموش است — کل تبریز اسکن و ذخیره می‌شود. با انتخاب مناطق، جست‌وجو دقیقاً محدود می‌شود."}
                  </p>
                  {/* DIR-OWNER-4STEPS-001 (گام سوم) — عین بخش مناطق ثبت آگهی جدید سامانه ARM:
                      دو دراپ‌داون وابسته (منطقه ← محله‌های همان منطقه) از رجیستری رسمی آرم.
                      گام چهارم اولاً: دکمهٔ پیش‌فرضِ فهرست ۱۷منطقه‌ای حذف شد — آخرین تنظیم مالک
                      تا تنظیم بعدیِ مالک به‌عنوان پیش‌فرض تثبیت می‌ماند (ذخیرهٔ سرور). */}
                  <ArmRegionPicker
                    idPrefix="file-finder-agent"
                    selection={{ areaIds: selAreaIds, lineIds: selLineIds }}
                    onChange={(next) => void saveLocationPatch(next)}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label className="text-xs font-bold">سایر معیارها در امتیاز نهایی (جمع {faNumber(
                      settingsData.settings.weightPersonal + settingsData.settings.weightUnderprice + settingsData.settings.weightOther + settingsData.settings.weightLocation
                    )})</Label>
                    <Badge variant={
                      settingsData.settings.weightPersonal + settingsData.settings.weightUnderprice + settingsData.settings.weightOther + settingsData.settings.weightLocation === 100
                        ? "default" : "secondary"
                    } className="text-[10px] h-5 px-1.5">۴ معیار</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-5">
                    قانون مالک: فقط فایل‌های شخصی امتیازدهی می‌شوند (غیرشخصی‌ها کامل رد)؛ پیش‌فرض — شخصی ۵۰، زیرقیمت ۲۰، سایر فاکتورهای بهینه ۲۰، مکان ۱۰. هر معیار قابل افزایش/کاهش است.
                  </p>
                  {[
                    { key: "weightPersonal", label: "شخصی‌بودن (۵۰)", value: settingsData.settings.weightPersonal, hint: "درصد تشخیص شخصی‌بودن فایل", chip: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300", range: "bg-gradient-to-l from-teal-600 to-cyan-500" },
                    { key: "weightUnderprice", label: "زیرقیمت (۲۰)", value: settingsData.settings.weightUnderprice, hint: "درصد تشخیص زیرقیمت‌بودن", chip: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", range: "bg-gradient-to-l from-amber-600 to-amber-400" },
                    { key: "weightOther", label: "سایر فاکتورهای بهینه (۲۰)", value: settingsData.settings.weightOther, hint: "شاهکار ایجنت — فوریت/تازگی/تکمیل داده/اصالت/آمادگی", chip: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300", range: "bg-gradient-to-l from-rose-600 to-rose-400" },
                    { key: "weightLocation", label: "مکان (۱۰)", value: settingsData.settings.weightLocation, hint: "تطبیق مکان فایل با تنظیمات مکان شما", chip: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300", range: "bg-gradient-to-l from-teal-600 to-cyan-500" },
                  ].map((w) => (
                    <div key={w.key} className="flex items-center gap-3">
                      <span className="text-xs w-32 shrink-0 text-muted-foreground" title={w.hint}>{w.label}</span>
                      <Slider
                        value={[w.value]}
                        min={0}
                        max={100}
                        step={5}
                        onValueCommit={(v) => saveSettingsPatch({ [w.key]: v[0] })}
                        onValueChange={() => undefined}
                        rangeClassName={w.range}
                        className="grow"
                        aria-label={`وزن ${w.label}`}
                      />
                      <span className={`inline-flex items-center justify-center min-w-10 h-6 px-1.5 rounded-lg text-xs font-extrabold tabular-nums ${w.chip}`}>{faNumber(w.value)}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold">آستانه‌های دسته‌بندی (قابل تنظیم)</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xs w-24 shrink-0 text-muted-foreground">شکار بالای</span>
                      <Input
                        type="number" min={2} max={99}
                        defaultValue={settingsData.settings.huntThreshold}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (isFinite(v) && v !== settingsData.settings.huntThreshold) void saveSettingsPatch({ huntThreshold: v });
                        }}
                        className="text-xs" aria-label="آستانه شکار"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs w-24 shrink-0 text-muted-foreground">پیگیری از</span>
                      <Input
                        type="number" min={1} max={98}
                        defaultValue={settingsData.settings.followThreshold}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (isFinite(v) && v !== settingsData.settings.followThreshold) void saveSettingsPatch({ followThreshold: v });
                        }}
                        className="text-xs" aria-label="آستانه پیگیری"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold">دسته‌های فعال اسکن (همه املاک تبریز)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {settingsData.meta.categories.map((c) => {
                      const active = settingsData.settings.categories.includes(c.value);
                      return (
                        <button
                          key={c.value}
                          onClick={() => {
                            const next = active
                              ? settingsData.settings.categories.filter((x) => x !== c.value)
                              : [...settingsData.settings.categories, c.value];
                            if (next.length > 0) void saveSettingsPatch({ categories: next });
                          }}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                            active ? "bg-primary text-primary-foreground border-primary" : "bg-transparent hover:bg-muted"
                          }`}
                          aria-pressed={active}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold">نمایش امتیاز تفکیکی در کارت‌ها (تنظیم نمایشی)</Label>
                    <Switch
                      checked={showScores}
                      onCheckedChange={(v) => onSettingsChange({ showScoresInList: v })}
                      aria-label="نمایش امتیاز تفکیکی"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold">به‌روزرسانی خودکار فهرست (۶۰ ثانیه)</Label>
                    <Switch
                      checked={autoRefresh}
                      onCheckedChange={(v) => onSettingsChange({ autoRefresh: v })}
                      aria-label="به‌روزرسانی خودکار"
                    />
                  </div>
                </div>
              </>
            ) : (
              <Skeleton className="h-40 w-full rounded-xl" />
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* پنل ایجنت */}
      <AgentPanel tileId="file-finder" />

      {/* پنجره‌های چهارگانه — DIR-FF-WATCH-001: تب چهارم «تحت نظر» (فایل‌های ارجاع‌شده) */}
      <Tabs value={bucket} onValueChange={setBucket}>
        <TabsList className="w-full grid grid-cols-4 h-auto p-1">
          <TabsTrigger value="hunt" className="gap-1.5 text-xs py-1.5 data-[state=active]:bg-gradient-to-l data-[state=active]:from-teal-600 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <Sparkles className="w-3.5 h-3.5" aria-hidden /> شکار ({faNumber(counts.hunt)})
          </TabsTrigger>
          <TabsTrigger value="follow" className="gap-1.5 text-xs py-1.5 data-[state=active]:bg-gradient-to-l data-[state=active]:from-amber-600 data-[state=active]:to-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <Gauge className="w-3.5 h-3.5" aria-hidden /> پیگیری ({faNumber(counts.follow)})
          </TabsTrigger>
          <TabsTrigger value="review" className="gap-1.5 text-xs py-1.5">
            <ListFilter className="w-3.5 h-3.5" aria-hidden /> بررسی ({faNumber(counts.review)})
          </TabsTrigger>
          <TabsTrigger value="watch" className="gap-1.5 text-xs py-1.5 data-[state=active]:bg-gradient-to-l data-[state=active]:from-teal-700 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <Eye className="w-3.5 h-3.5" aria-hidden /> تحت نظر ({faNumber(counts.watch)})
          </TabsTrigger>
        </TabsList>

        {["hunt", "follow", "review", "watch"].map((b) => (
          <TabsContent key={b} value={b} className="mt-4">
            {loadingAds ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-36 w-full rounded-xl" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center space-y-2">
                  {b === "watch" ? <Eye className="w-10 h-10 mx-auto text-muted-foreground/40" aria-hidden /> : <Crosshair className="w-10 h-10 mx-auto text-muted-foreground/40" aria-hidden />}
                  <p className="text-sm font-bold">{b === "watch" ? "هنوز فایلی به «تحت نظر» ارجاع نشده است" : "فایلی در این پنجره نیست"}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
                    {b === "watch"
                      ? "با کلید «ارجاع به تحت نظر» روی هر فایل کشف‌شده، آن فایل به این پنجره برای پایش ارجاع می‌شود."
                      : scanLogs.length === 0
                        ? "هنوز اسکنی اجرا نشده است — با دکمه «اسکن دیوار» نخستین جست‌وجوی آگهی‌های تبریز را اجرا کنید."
                        : "اسکن قبلی فایلی در این بازه امتیازی نیافته است — اسکن تازه بزنید یا آستانه‌ها را در تنظیمات ایجنت تعدیل کنید."}
                  </p>
                  {b !== "watch" && (
                    <Button size="sm" variant="outline" onClick={runScan} disabled={scanning} className="gap-1.5">
                      {scanning ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />} اسکن تازه
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {rows.map((ad, i) => (
                  <AdCard
                    key={ad.token}
                    ad={ad}
                    index={i + 1}
                    showScores={showScores}
                    busyAction={busyAction}
                    onDetails={(a) => setDetailsAd(a)}
                    onReject={(a) => {
                      setBusyAction(null);
                      setRejectAd(a);
                    }}
                    onRegister={(a) => setRegisterAd(a)}
                    onWatch={onWatch}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* گزارش اسکن‌ها */}
      {scanLogs.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-xs flex items-center gap-1.5"><History className="w-3.5 h-3.5" aria-hidden /> گزارش اسکن‌های اخیر</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {/* P6.5-09 — بدون سقف: همهٔ گزارش‌های اسکن */}
            {scanLogs.map((log, i) => (
              <div key={log.id} className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground border-b last:border-0 pb-1.5 last:pb-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="inline-flex items-center justify-center w-4.5 h-4.5 min-w-4.5 rounded-md bg-muted font-bold text-[9px] tabular-nums shrink-0" aria-label={`ردیف ${faNumber(i + 1)}`}>{faNumber(i + 1)}</span>
                  <Info className="w-3 h-3 shrink-0" aria-hidden />
                  <span className="truncate">{faDateTime(log.startedAt)}</span>
                </span>
                <span className="flex flex-wrap gap-x-2">
                  <span>بررسی {faNumber(log.scanned)}</span>
                  <span>درون بازه {faNumber(log.inWindow)}</span>
                  {log.outOfArea > 0 && <span>خارج از محدوده {faNumber(log.outOfArea)}</span>}
                  {log.autoRejected > 0 && <span>رد خودکار (غیرشخصی) {faNumber(log.autoRejected)}</span>}
                  <span>شخصیِ تازه {faNumber(log.newAds)}</span>
                  <span>{(log.durationMs / 1000).toFixed(1)} ثانیه</span>
                  <Badge variant={log.error ? "destructive" : "secondary"} className="text-[10px] h-5">
                    {log.error ? "خطا" : log.source === "kenar" ? "کنار" : "وب"}
                  </Badge>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* PN-025/مرحلهٔ ۸ — مشورهٔ مغز برای برترین فایل سطل جاری (تقاضای هم‌منطقه + شواهد علّی) */}
      {adsData?.rows && adsData.rows.length > 0 ? (
        <AdviceCard
          endpoint={`/api/file-finder/advice?token=${encodeURIComponent(adsData.rows[0]!.token)}${adsData.rows[0]!.matchedAreaName ? `&area=${encodeURIComponent(adsData.rows[0]!.matchedAreaName)}` : ""}`}
          title="توصیهٔ مغز برای برترین فایل"
        />
      ) : null}

      {/* پنجره‌های چهار کلید */}
      <AdDetailsDialog ad={detailsAd} open={Boolean(detailsAd)} onOpenChange={(v) => !v && setDetailsAd(null)} />
      <RejectDialog ad={rejectAd} open={Boolean(rejectAd)} onOpenChange={(v) => !v && setRejectAd(null)} onRejected={onRejected} />
      <RegisterDialog ad={registerAd} open={Boolean(registerAd)} onOpenChange={(v) => !v && setRegisterAd(null)} onRegistered={onRegistered} />
    </div>
  );
}


/** P6549 — خروجی پیش‌فرض برای بارگذاری تنبل (lazyPage) */
export default FileFinderPage;
