"use client";

/**
 * کاشی «فایل‌یابی از دیوار» — صفحه اصلی
 * ------------------------------------------------------
 * سه پنجره: شکار (بالای آستانه) / پیگیری / بررسی
 * + تنظیمات اختصاصی ایجنت (وزن‌ها، آستانه‌ها، فیلتر زمان، دسته‌ها، اسکن خودکار)
 * + دکمه اسکن + خودکار دوره‌ای + میانگین تحلیل ایجنت
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, RefreshCw, Settings2, Crosshair, History, Info, ListFilter, Sparkles, Gauge,
  MapPin, ChevronDown, ChevronLeft, Search,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber, faDateTime } from "@/lib/format";
import { AdCard, type DivarAdRow } from "./AdCard";
import { AdDetailsDialog } from "./AdDetailsDialog";
import { RejectDialog } from "./RejectDialog";
import { RegisterDialog } from "./RegisterDialog";

interface AdsResponse {
  ok: boolean;
  rows: DivarAdRow[];
  bucketCounts: { hunt: number; follow: number; review: number };
  thresholds: { hunt: number; follow: number };
  weights: { personal: number; underprice: number; other: number; location: number };
  locationFilter: { active: boolean; areaCount: number; lineCount: number };
}

interface LocationsArea {
  id: string;
  name: string;
  lines: { id: string; name: string }[];
}

interface LocationsResponse {
  ok: boolean;
  totalAreas: number;
  totalLines: number;
  areas: LocationsArea[];
  defaults: { areaIds: string[]; areaNames: string[] };
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
    locationDefaults: { areaIds: string[]; areaNames: string[] };
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

const TIME_WINDOW_LABELS: Record<string, string> = {
  "12h": "۱۲ ساعت گذشته",
  "24h": "۲۴ ساعت گذشته",
  "3d": "۳ روز گذشته",
  "7d": "۷ روز گذشته",
};

/** نرمال‌سازی جست‌وجوی فارسی (ارقام فارسی/عربی، آ ← ا، حذف فاصله/ZWNJ) */
function normFa(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[آأإ]/g, "ا")
    .replace(/[\u200c\s]/g, "")
    .trim();
}

export function FileFinderPage({ settings, onSettingsChange }: TilePageProps) {
  const { toast } = useToast();
  const [bucket, setBucket] = useState<string>("hunt");
  const [adsData, setAdsData] = useState<AdsResponse | null>(null);
  const [loadingAds, setLoadingAds] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [settingsData, setSettingsData] = useState<SettingsResponse | null>(null);
  const [scanLogs, setScanLogs] = useState<ScanLogRow[]>([]);
  const [detailsAd, setDetailsAd] = useState<DivarAdRow | null>(null);
  const [rejectAd, setRejectAd] = useState<DivarAdRow | null>(null);
  const [registerAd, setRegisterAd] = useState<DivarAdRow | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // فیلتر مکان — رجیستری ARM (بارگذاری تنبلکار روی نخستین تعامل)
  const [locData, setLocData] = useState<LocationsResponse | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locQuery, setLocQuery] = useState("");
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());

  const showScores = settings.showScoresInList !== false;
  const autoRefresh = settings.autoRefresh !== false;

  const loadAds = useCallback(async (b: string) => {
    try {
      const res = await api<AdsResponse>(`/api/divar/ads?bucket=${b}&limit=80`);
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
      const res = await api<{ ok: boolean; logs: ScanLogRow[] }>("/api/divar/scan");
      setScanLogs(res.logs ?? []);
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

  useEffect(() => {
    setLoadingAds(true);
    void loadAds(bucket);
    void loadSettings();
    void loadScanLogs();
  }, [bucket, loadAds, loadSettings, loadScanLogs]);

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

  const runScan = async () => {
    setScanning(true);
    try {
      const res = await api<{ ok: boolean; summary: { message: string; newAds: number; inWindow: number; durationMs: number } }>("/api/divar/scan", { method: "POST" });
      toast({ title: "اسکن دیوار انجام شد", description: res.summary.message });
      await Promise.all([loadAds(bucket), loadScanLogs()]);
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

  /** بارگذاری رجیستری مناطق/محله‌های آرم — فقط یک‌بار و در نخستین نیاز */
  const ensureLocations = useCallback(async () => {
    if (locData || locLoading) return;
    setLocLoading(true);
    try {
      const res = await api<LocationsResponse>("/api/divar/locations");
      setLocData(res);
    } catch {
      // بی‌صدا — دفعة بعد دوباره تلاش می‌شود
    } finally {
      setLocLoading(false);
    }
  }, [locData, locLoading]);

  /** ذخیره انتخاب مکان + تازة‌سازی فهرست آگهی‌ها (فیلتر روی فهرست اثر دارد) */
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

  const toggleAreaSelected = (area: LocationsArea) => {
    const on = !selAreaIds.includes(area.id);
    const nextAreas = on ? [...selAreaIds, area.id] : selAreaIds.filter((x) => x !== area.id);
    // با انتخاب کل منطقه، انتخاب‌های محله‌ای همان منطقه زائد می‌شوند
    const areaLineIds = new Set(area.lines.map((l) => l.id));
    const nextLines = on ? selLineIds.filter((id) => !areaLineIds.has(id)) : selLineIds;
    void saveLocationPatch({ areaIds: nextAreas, lineIds: nextLines });
  };

  const toggleLineSelected = (line: { id: string }) => {
    const on = !selLineIds.includes(line.id);
    const nextLines = on ? [...selLineIds, line.id] : selLineIds.filter((x) => x !== line.id);
    void saveLocationPatch({ areaIds: selAreaIds, lineIds: nextLines });
  };

  const resetDefaultLocations = () => {
    const ids = settingsData?.meta.locationDefaults?.areaIds ?? locData?.defaults.areaIds ?? [];
    if (ids.length) void saveLocationPatch({ areaIds: ids, lineIds: [] });
  };

  const clearLocationFilter = () => {
    void saveLocationPatch({ areaIds: [], lineIds: [] });
  };

  const q = normFa(locQuery.trim());
  const visibleAreas = useMemo(() => {
    if (!locData) return [];
    if (!q) return locData.areas;
    return locData.areas.filter(
      (a) => normFa(a.name).includes(q) || a.lines.some((l) => normFa(l.name).includes(q))
    );
  }, [locData, q]);

  const linesToShow = (area: LocationsArea) => {
    if (!q || normFa(area.name).includes(q)) return area.lines;
    return area.lines.filter((l) => normFa(l.name).includes(q));
  };

  const coveredLineCount = useMemo(() => {
    if (!locData) return null;
    const ids = new Set<string>();
    for (const a of locData.areas) {
      if (selAreaIds.includes(a.id)) for (const l of a.lines) ids.add(l.id);
    }
    for (const id of selLineIds) ids.add(id);
    return ids.size;
  }, [locData, selAreaIds, selLineIds]);

  const onRejected = useCallback(() => {
    setBusyAction(null);
    void loadAds(bucket);
  }, [rejectAd, loadAds, bucket]);

  const onRegistered = useCallback(() => {
    void loadAds(bucket);
  }, [loadAds, bucket]);

  const counts = adsData?.bucketCounts ?? { hunt: 0, follow: 0, review: 0 };
  const thresholds = adsData?.thresholds ?? { hunt: 70, follow: 40 };
  const lastScan = scanLogs[0];

  const rows = useMemo(() => adsData?.rows ?? [], [adsData]);

  return (
    <div className="space-y-6">
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
          <Button size="sm" className="gap-1.5" onClick={runScan} disabled={scanning}>
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Crosshair className="w-4 h-4" aria-hidden />}
            اسکن دیوار
          </Button>
        </div>
      </div>

      {/* شاخص‌ها */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: "hunt", label: "فایل‌های شکار", desc: `امتیاز بالای ${faNumber(thresholds.hunt)}`, icon: Sparkles, tone: "border-teal-500/50 bg-gradient-to-b from-teal-500/10 to-transparent", iconCls: "text-teal-600 dark:text-teal-400" },
          { key: "follow", label: "فایل‌های پیگیری", desc: `${faNumber(thresholds.follow)} تا ${faNumber(thresholds.hunt)}`, icon: Gauge, tone: "border-amber-500/50 bg-gradient-to-b from-amber-500/10 to-transparent", iconCls: "text-amber-600 dark:text-amber-400" },
          { key: "review", label: "فایل‌های بررسی", desc: `زیر ${faNumber(thresholds.follow)}`, icon: ListFilter, tone: "border-border bg-gradient-to-b from-muted/60 to-transparent", iconCls: "text-muted-foreground" },
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

      {/* تنظیمات اختصاصی ایجنت */}
      <Accordion type="single" collapsible onValueChange={(v) => { if (v) void ensureLocations(); }}>
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
                      <MapPin className="w-4 h-4 text-primary" aria-hidden /> فیلتر مکان — مناطق جست‌وجوی دیوار
                      <Badge variant={locationFilterActive ? "default" : "secondary"} className="text-[10px] h-5 px-1.5">
                        {locationFilterActive
                          ? `${faNumber(selAreaIds.length)} منطقه${selLineIds.length > 0 ? ` + ${faNumber(selLineIds.length)} محله` : ""}`
                          : "همه تبریز"}
                      </Badge>
                    </Label>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={resetDefaultLocations}>
                        پیش‌فرض ۱۷ منطقه
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={clearLocationFilter} disabled={!locationFilterActive}>
                        همه تبریز
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-5">
                    {locationFilterActive
                      ? `اسکن فقط آگهی‌های مناطق انتخابی را نگه می‌دارد${coveredLineCount != null ? ` (${faNumber(coveredLineCount)} محله از ${faNumber(locData?.totalLines ?? 926)})` : ""}؛ آگهی بیرون از انتخاب یا بدون نشانه مکانی قابل اتکا، هرگز ذخیره نمی‌شود.`
                      : "فیلتر مکان خاموش است — کل تبریز اسکن و ذخیره می‌شود. با انتخاب مناطق، جست‌وجو دقیقاً محدود می‌شود."}
                    تطبیق منطقه‌ای عین فیلتر مکان سامانه آرم است (متنی + مختصات).
                  </p>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      value={locQuery}
                      onChange={(e) => {
                        setLocQuery(e.target.value);
                        if (e.target.value) void ensureLocations();
                      }}
                      onFocus={() => void ensureLocations()}
                      placeholder="جست‌وجوی منطقه یا محله… (مثلاً ولیعصر)"
                      className="text-xs pr-8"
                      aria-label="جست‌وجوی منطقه یا محله"
                    />
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
                    {locLoading && !locData ? (
                      <div className="p-3 space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-6 w-full" />
                        ))}
                      </div>
                    ) : locData ? (
                      visibleAreas.length === 0 ? (
                        <p className="p-3 text-[11px] text-muted-foreground">منطقه/محله‌ای با این نام در رجیستری آرم یافت نشد.</p>
                      ) : (
                        visibleAreas.map((area) => {
                          const areaOn = selAreaIds.includes(area.id);
                          const lines = linesToShow(area);
                          const areaSelectedLines = area.lines.filter((l) => selLineIds.includes(l.id)).length;
                          const expanded = q.length > 0 || expandedAreas.has(area.id);
                          return (
                            <div key={area.id}>
                              <div className="flex items-center gap-2 p-2 hover:bg-muted/50">
                                <Checkbox
                                  checked={areaOn}
                                  onCheckedChange={() => toggleAreaSelected(area)}
                                  aria-label={`انتخاب منطقة ${area.name}`}
                                />
                                <button
                                  type="button"
                                  className="flex-1 min-w-0 text-right"
                                  onClick={() =>
                                    setExpandedAreas((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(area.id)) next.delete(area.id);
                                      else next.add(area.id);
                                      return next;
                                    })
                                  }
                                >
                                  <span className="text-xs font-medium truncate block">
                                    {area.name}
                                    <span className="text-[10px] text-muted-foreground font-normal"> ({faNumber(area.lines.length)} محله)</span>
                                  </span>
                                </button>
                                {!areaOn && areaSelectedLines > 0 && (
                                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">{faNumber(areaSelectedLines)} محله</Badge>
                                )}
                                <button
                                  type="button"
                                  aria-label={expanded ? `بستن محله‌های ${area.name}` : `نمایش محله‌های ${area.name}`}
                                  onClick={() =>
                                    setExpandedAreas((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(area.id)) next.delete(area.id);
                                      else next.add(area.id);
                                      return next;
                                    })
                                  }
                                  className="text-muted-foreground shrink-0"
                                >
                                  {expanded ? <ChevronDown className="w-4 h-4" aria-hidden /> : <ChevronLeft className="w-4 h-4" aria-hidden />}
                                </button>
                              </div>
                              {expanded && (
                                <div className="pr-7 pb-2 space-y-1 border-r mx-3 mb-1">
                                  {lines.map((line) => {
                                    const lineOn = areaOn || selLineIds.includes(line.id);
                                    return (
                                      <label key={line.id} className="flex items-center gap-2 cursor-pointer" title={areaOn ? "کل منطقه انتخاب شده است" : undefined}>
                                        <Checkbox
                                          checked={lineOn}
                                          disabled={areaOn}
                                          onCheckedChange={() => toggleLineSelected(line)}
                                          aria-label={`انتخاب محلة ${line.name}`}
                                        />
                                        <span className="text-[11px] text-muted-foreground">{line.name}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )
                    ) : (
                      <p className="p-3 text-[11px] text-muted-foreground flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5" aria-hidden />
                        فهرست مناطق — با جست‌وجو یا کلیک بارگذاری می‌شود.
                      </p>
                    )}
                  </div>
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

      {/* پنجره‌های سه‌گانه */}
      <Tabs value={bucket} onValueChange={setBucket}>
        <TabsList className="w-full grid grid-cols-3 h-auto p-1">
          <TabsTrigger value="hunt" className="gap-1.5 text-xs py-1.5 data-[state=active]:bg-gradient-to-l data-[state=active]:from-teal-600 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <Sparkles className="w-3.5 h-3.5" aria-hidden /> شکار ({faNumber(counts.hunt)})
          </TabsTrigger>
          <TabsTrigger value="follow" className="gap-1.5 text-xs py-1.5 data-[state=active]:bg-gradient-to-l data-[state=active]:from-amber-600 data-[state=active]:to-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
            <Gauge className="w-3.5 h-3.5" aria-hidden /> پیگیری ({faNumber(counts.follow)})
          </TabsTrigger>
          <TabsTrigger value="review" className="gap-1.5 text-xs py-1.5">
            <ListFilter className="w-3.5 h-3.5" aria-hidden /> بررسی ({faNumber(counts.review)})
          </TabsTrigger>
        </TabsList>

        {["hunt", "follow", "review"].map((b) => (
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
                  <Crosshair className="w-10 h-10 mx-auto text-muted-foreground/40" aria-hidden />
                  <p className="text-sm font-bold">فایلی در این پنجره نیست</p>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
                    {scanLogs.length === 0
                      ? "هنوز اسکنی اجرا نشده است — با دکمه «اسکن دیوار» نخستین جست‌وجوی آگهی‌های تبریز را اجرا کنید."
                      : "اسکن قبلی فایلی در این بازه امتیازی نیافته است — اسکن تازه بزنید یا آستانه‌ها را در تنظیمات ایجنت تعدیل کنید."}
                  </p>
                  <Button size="sm" variant="outline" onClick={runScan} disabled={scanning} className="gap-1.5">
                    {scanning ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />} اسکن تازه
                  </Button>
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
            {scanLogs.slice(0, 5).map((log, i) => (
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

      {/* پنجره‌های چهار کلید */}
      <AdDetailsDialog ad={detailsAd} open={Boolean(detailsAd)} onOpenChange={(v) => !v && setDetailsAd(null)} />
      <RejectDialog ad={rejectAd} open={Boolean(rejectAd)} onOpenChange={(v) => !v && setRejectAd(null)} onRejected={onRejected} />
      <RegisterDialog ad={registerAd} open={Boolean(registerAd)} onOpenChange={(v) => !v && setRegisterAd(null)} onRegistered={onRegistered} />
    </div>
  );
}
