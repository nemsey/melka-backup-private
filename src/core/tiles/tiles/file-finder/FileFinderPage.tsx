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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Radar, RefreshCw, Settings2, Crosshair, History, Info, ListFilter, Sparkles, Gauge,
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
  weights: { personal: number; underprice: number; location: number };
}

interface SettingsResponse {
  ok: boolean;
  settings: {
    timeWindow: string;
    categories: string[];
    weightPersonal: number;
    weightUnderprice: number;
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

export function FileFinderPage({ settings, onSettingsChange, onBack }: TilePageProps) {
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

  const onRejected = useCallback(() => {
    setBusyAction(rejectAd?.token ?? null);
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
          <Radar className="w-4 h-4" aria-hidden /> بازگشت به خانه داشبورد
        </Button>
        <div className="flex items-center gap-2">
          {lastScan && (
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              آخرین اسکن: {faDateTime(lastScan.startedAt)}
              {lastScan.error ? " — با خطا" : ` — ${faNumber(lastScan.newAds)} فایل تازه`}
            </span>
          )}
          <Button size="sm" className="gap-1.5" onClick={runScan} disabled={scanning}>
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Crosshair className="w-4 h-4" aria-hidden />}
            اسکن دیوار
          </Button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-extrabold flex items-center gap-2">
          <Radar className="w-6 h-6 text-primary" aria-hidden /> فایل‌یابی از دیوار — تبریز
        </h2>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          شکار هوشمند فایل‌های شخصی و زیرقیمت از آگهی‌های دیوار تبریز — حساس به «زمان واقعی انتشار» (نه نردبان دیوار)
        </p>
      </div>

      {/* شاخص‌ها */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: "hunt", label: "فایل‌های شکار", desc: `امتیاز بالای ${faNumber(thresholds.hunt)}`, tone: "border-emerald-500/50 bg-emerald-500/5" },
          { key: "follow", label: "فایل‌های پیگیری", desc: `${faNumber(thresholds.follow)} تا ${faNumber(thresholds.hunt)}`, tone: "border-amber-500/50 bg-amber-500/5" },
          { key: "review", label: "فایل‌های بررسی", desc: `زیر ${faNumber(thresholds.follow)}`, tone: "" },
        ].map((b) => (
          <button
            key={b.key}
            onClick={() => setBucket(b.key)}
            className={`rounded-xl border p-3 text-right transition-shadow hover:shadow-md ${b.tone} ${bucket === b.key ? "ring-2 ring-primary/50" : ""}`}
            aria-pressed={bucket === b.key}
          >
            <p className="text-xl font-extrabold">{faNumber(counts[b.key as keyof typeof counts] ?? 0)}</p>
            <p className="text-xs font-bold mt-0.5">{b.label}</p>
            <p className="text-[10px] text-muted-foreground">{b.desc}</p>
          </button>
        ))}
      </div>

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
                    <p className="text-[10px] text-muted-foreground leading-4">
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
                    <p className="text-[10px] text-muted-foreground leading-4">اسکن خودکار با بازدید شما از صفحه فعال می‌شود.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold">وزن معیارها در امتیاز نهایی (جمع {faNumber(
                      settingsData.settings.weightPersonal + settingsData.settings.weightUnderprice + settingsData.settings.weightLocation
                    )})</Label>
                  </div>
                  {[
                    { key: "weightPersonal", label: "شخصی‌بودن (مهم‌ترین)", value: settingsData.settings.weightPersonal },
                    { key: "weightUnderprice", label: "زیرقیمت‌بودن", value: settingsData.settings.weightUnderprice },
                    { key: "weightLocation", label: "مکان", value: settingsData.settings.weightLocation },
                  ].map((w) => (
                    <div key={w.key} className="flex items-center gap-3">
                      <span className="text-xs w-32 shrink-0 text-muted-foreground">{w.label}</span>
                      <Slider
                        value={[w.value]}
                        min={0}
                        max={100}
                        step={5}
                        onValueCommit={(v) => saveSettingsPatch({ [w.key]: v[0] })}
                        onValueChange={() => undefined}
                        className="grow"
                        aria-label={`وزن ${w.label}`}
                      />
                      <span className="text-xs font-bold w-10 text-center">{faNumber(w.value)}</span>
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
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="hunt" className="gap-1.5 text-xs">
            <Sparkles className="w-3.5 h-3.5" aria-hidden /> شکار ({faNumber(counts.hunt)})
          </TabsTrigger>
          <TabsTrigger value="follow" className="gap-1.5 text-xs">
            <Gauge className="w-3.5 h-3.5" aria-hidden /> پیگیری ({faNumber(counts.follow)})
          </TabsTrigger>
          <TabsTrigger value="review" className="gap-1.5 text-xs">
            <ListFilter className="w-3.5 h-3.5" aria-hidden /> بررسی ({faNumber(counts.review)})
          </TabsTrigger>
        </TabsList>

        {["hunt", "follow", "review"].map((b) => (
          <TabsContent key={b} value={b} className="mt-3">
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
                {rows.map((ad) => (
                  <AdCard
                    key={ad.token}
                    ad={ad}
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
            {scanLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground border-b last:border-0 pb-1.5 last:pb-0">
                <span className="flex items-center gap-1.5">
                  <Info className="w-3 h-3" aria-hidden />
                  {faDateTime(log.startedAt)}
                </span>
                <span className="flex flex-wrap gap-x-2">
                  <span>بررسی {faNumber(log.scanned)}</span>
                  <span>درون بازه {faNumber(log.inWindow)}</span>
                  <span>تازه {faNumber(log.newAds)}</span>
                  <span>{(log.durationMs / 1000).toFixed(1)} ثانیه</span>
                  <Badge variant={log.error ? "destructive" : "secondary"} className="text-[9px] h-4">
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
