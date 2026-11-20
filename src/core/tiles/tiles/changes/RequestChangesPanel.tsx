"use client";

/**
 * RequestChangesPanel — بخش «کددرخواست»: تغییر در کد · حذف کد (DIR-CHANGES-TILE-002)
 * ------------------------------------------------------
 * فقط همین دو عملیات (دستور مالک ۱۴۰۵/۰۸/۲۹ — سایر بخش‌ها حذف شد):
 *   · تغییر: تاریخ «ایجاد مشاور» در تاریخچهٔ تغییرات درخواست + آبشار اتوماتیک
 *     سایر مدخل‌ها و رویدادها متناسب با تاریخ اعلامی مالک (تعمیم شاهکار ۰۹۹)
 *   · حذف: حذف کامل از ARM + همهٔ آینه‌های محلی (هیچ اثری نماند)
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, FilePen, Trash2, Loader2, CalendarClock } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useToast } from "@/hooks/use-toast";
import { toLatinDigits } from "@/lib/listing/types";
import { jalaliHourToIsoUtc, isoToJalaliHour, isoToTehranHour, CASCADE_RULES } from "@/lib/changes/variables";
import { StepReport } from "./StepReport";
import type { ChangesReport } from "@/lib/changes/types";

interface LookupResult {
  ok: boolean;
  code: string;
  error?: string;
  arm: {
    armRequestId: string;
    title: string | null;
    relatedRealtor: string | null;
    createdAt: string | null;
    history: Array<{ id: string; action: string | null; realtor: string | null; date: string | null; display: string | null }>;
  } | null;
  events: Array<{ id: string; type: string | null; propertyCode: string | null; date: string | null; hour: string | null; display: string | null }>;
  localTraces: Record<string, number> | null;
}

export function RequestChangesPanel() {
  const { toast } = useToast();
  const field = "grid gap-1.5";
  const inputCls = "bg-background";

  /* ── جستجوی مشترک (درونیِ فرم تغییر) ── */
  const [code, setCode] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookup, setLookup] = useState<LookupResult | null>(null);

  const doLookup = async () => {
    const clean = code.trim();
    if (!clean) return;
    setLookupBusy(true);
    setLookup(null);
    try {
      const res = await api<LookupResult>("/api/changes/request", { method: "POST", body: { action: "lookup", code: clean }, timeoutMs: 150_000 });
      setLookup(res);
      if (!res.ok) toast({ title: "یافت نشد", description: res.error ?? "درخواست یافت نشد.", variant: "destructive" });
    } catch (err) {
      toast({ title: "جستجو ناموفق", description: (err as ApiClientError).message, variant: "destructive" });
    } finally {
      setLookupBusy(false);
    }
  };

  /* ── تغییر تاریخ + آبشار ── */
  const [targetDate, setTargetDate] = useState("");
  const [targetHour, setTargetHour] = useState("");
  const [dateBusy, setDateBusy] = useState(false);
  const [dateReport, setDateReport] = useState<ChangesReport | null>(null);

  /** پیش‌نمایش آبشار — همان قاعدهٔ سرور: لنگر «ایجاد مشاور» (وگرنه قدیمی‌ترین) + Δ نسبی */
  const cascadePreview = useMemo(() => {
    if (!lookup?.ok || !lookup.arm?.history?.length) return null;
    const withDates = lookup.arm.history.filter((h) => h.date);
    if (withDates.length === 0) return null;
    const anchorEntry = withDates.find((h) => (h.action ?? "").includes(CASCADE_RULES.anchorActionName)) ?? [...withDates].sort((a, b) => new Date(String(a.date)).getTime() - new Date(String(b.date)).getTime())[0];
    const anchorDate = String(anchorEntry.date);
    const hour = targetHour.trim() || isoToTehranHour(anchorDate) || "";
    const date = toLatinDigits(targetDate.trim());
    const targetIso = jalaliHourToIsoUtc(date, hour);
    if (!targetIso) return null;
    const deltaMs = new Date(targetIso).getTime() - new Date(anchorDate).getTime();
    const entries = [
      ...withDates.map((e) => ({ label: `${e.action ?? "مدخل"}${e.realtor ? ` · ${e.realtor}` : ""}`, before: e.date! })),
      ...lookup.events.map((e) => ({ label: `رویداد ${e.type ?? ""}${e.propertyCode ? ` (آگهی ${e.propertyCode})` : ""}`.trim(), before: e.hour ?? e.date ?? "" })),
    ].filter((e) => e.before);
    return {
      anchorLabel: anchorEntry.action ?? "مدخل لنگر",
      deltaDays: Math.round(deltaMs / 86_400_000),
      targetDisplay: isoToJalaliHour(targetIso),
      entries: entries.map((e) => ({ label: e.label, before: isoToJalaliHour(e.before) ?? e.before, after: isoToJalaliHour(new Date(new Date(e.before).getTime() + deltaMs).toISOString()) ?? "" })),
    };
  }, [lookup, targetDate, targetHour]);

  const submitDate = async () => {
    if (!lookup?.ok) return;
    setDateBusy(true);
    setDateReport(null);
    try {
      const res = await api<ChangesReport>("/api/changes/request", {
        method: "POST",
        body: {
          action: "change-date",
          spec: { code: lookup.code, targetJalali: toLatinDigits(targetDate.trim()), targetHour: targetHour.trim() || null },
        },
        timeoutMs: 300_000,
      });
      setDateReport(res);
      toast({ title: res.ok ? "آبشار تاریخ اعمال شد" : "تغییر ناموفق", description: res.ok ? "همهٔ مدخل‌ها با همان Δ نسبی جابه‌جا و راستی‌آزمایی شدند." : res.error ?? "گزارش گام‌ها را ببینید.", variant: res.ok ? undefined : "destructive" });
      if (res.ok) await doLookup();
    } catch (err) {
      toast({ title: "خطا", description: (err as ApiClientError).message, variant: "destructive" });
    } finally {
      setDateBusy(false);
    }
  };

  /* ── حذف ── */
  const [delCode, setDelCode] = useState("");
  const [delLookup, setDelLookup] = useState<LookupResult | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [delConfirm, setDelConfirm] = useState("");
  const [delReport, setDelReport] = useState<ChangesReport | null>(null);

  const doDeleteLookup = async () => {
    const clean = delCode.trim();
    if (!clean) return;
    setDelBusy(true);
    setDelLookup(null);
    setDelReport(null);
    setDelConfirm("");
    try {
      const res = await api<LookupResult>("/api/changes/request", { method: "POST", body: { action: "lookup", code: clean }, timeoutMs: 150_000 });
      setDelLookup(res);
      if (!res.ok) toast({ title: "یافت نشد", description: res.error ?? "درخواست یافت نشد.", variant: "destructive" });
    } catch (err) {
      toast({ title: "جستجو ناموفق", description: (err as ApiClientError).message, variant: "destructive" });
    } finally {
      setDelBusy(false);
    }
  };

  const submitDelete = async () => {
    if (!delLookup?.ok) return;
    setDelBusy(true);
    setDelReport(null);
    try {
      const res = await api<ChangesReport>("/api/changes/request", {
        method: "POST",
        body: { action: "delete", code: delLookup.code },
        timeoutMs: 300_000,
      });
      setDelReport(res);
      toast({ title: res.ok ? "درخواست کاملاً حذف شد" : "حذف ناقص", description: res.ok ? "هیچ اثری در آینه‌ها باقی نماند." : res.error ?? "گزارش گام‌ها را ببینید.", variant: res.ok ? undefined : "destructive" });
    } catch (err) {
      toast({ title: "خطا", description: (err as ApiClientError).message, variant: "destructive" });
    } finally {
      setDelBusy(false);
    }
  };

  const tracesTotal = useMemo(() => {
    if (!delLookup?.localTraces) return 0;
    return Object.values(delLookup.localTraces).reduce((a, b) => a + (b ?? 0), 0);
  }, [delLookup]);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="change">
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="change" className="gap-1 text-xs py-2"><FilePen className="h-3.5 w-3.5" /> تغییر در کد</TabsTrigger>
          <TabsTrigger value="delete" className="gap-1 text-xs py-2"><Trash2 className="h-3.5 w-3.5" /> حذف کد</TabsTrigger>
        </TabsList>

        {/* ═══════════ تغییر ═══════════ */}
        <TabsContent value="change" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">شناسایی کد درخواست در خود سامانهٔ ARM</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input dir="ltr" placeholder="کد درخواست…" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLookup()} className={inputCls} />
                <Button onClick={doLookup} disabled={lookupBusy || !code.trim()} className="shrink-0 gap-1">
                  {lookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} خواندن وضعیت
                </Button>
              </div>
              {lookupBusy ? <Skeleton className="h-24 rounded-xl" /> : null}
              {lookup && !lookupBusy ? (
                !lookup.ok ? (
                  <p className="text-xs text-red-600 font-medium">{lookup.error}</p>
                ) : (
                  <div className="rounded-xl border border-border bg-background/60 p-3 space-y-2 text-xs">
                    <div className="flex flex-wrap gap-2 items-center">
                      <Badge variant="outline" className="font-mono" dir="ltr">کد {lookup.code}</Badge>
                      <Badge className="bg-sky-600 hover:bg-sky-600">زندهٔ ARM</Badge>
                      {lookup.arm?.title ? <span className="text-muted-foreground">«{lookup.arm.title}»</span> : null}
                    </div>
                    <div className="text-muted-foreground">کارشناس: {lookup.arm?.relatedRealtor ?? "—"}</div>
                    <div className="font-medium mt-1">تاریخچهٔ تغییرات درخواست ({lookup.arm?.history.length ?? 0} مدخل — زنده):</div>
                    <div className="space-y-1 max-h-40 overflow-auto pl-1">
                      {(lookup.arm?.history ?? []).map((h, i) => (
                        <div key={h.id || i} className="flex items-center justify-between gap-2 rounded-lg bg-card border border-border/50 px-2 py-1">
                          <span className="font-medium truncate">{h.action ?? "—"}{h.realtor ? ` · ${h.realtor}` : ""}</span>
                          <span className="text-muted-foreground font-mono shrink-0" dir="ltr">{h.display ?? h.date ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                    {lookup.events.length ? (
                      <div className="text-muted-foreground">رویدادهای درخواست: {lookup.events.length} رویداد (در آبشار مشارکت می‌کنند)</div>
                    ) : null}
                  </div>
                )
              ) : null}
            </CardContent>
          </Card>

          {lookup?.ok ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-amber-600" /> تغییر تاریخ «ایجاد مشاور» + آبشار اتوماتیک</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground leading-5">
                  تاریخ مدخل «ایجاد مشاور» تاریخچهٔ تغییرات درخواست به تاریخ اعلامی مالک تغییر می‌کند و تاریخ سایر مدخل‌های تاریخچه و رویدادها با همان فاصلهٔ نسبی به‌صورت اتوماتیک جابه‌جا می‌شود (شاهکار ۰۹۹ — PUT با آرایهٔ status کامل — تعمیم‌یافته با Δ نسبی).
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className={field}>
                    <Label className="text-xs">تاریخ جدید «ایجاد مشاور» * (جلالی)</Label>
                    <Input dir="ltr" placeholder="1405/08/20" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={inputCls} />
                  </div>
                  <div className={field}>
                    <Label className="text-xs">ساعت (خالی = حفظ ساعت فعلی لنگر)</Label>
                    <Input dir="ltr" placeholder="17:30" value={targetHour} onChange={(e) => setTargetHour(e.target.value)} className={inputCls} />
                  </div>
                </div>
                {cascadePreview ? (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
                    <div className="text-xs font-medium">
                      لنگر: {cascadePreview.anchorLabel} · جابه‌جایی {cascadePreview.deltaDays === 0 ? "صفر" : `${cascadePreview.deltaDays > 0 ? "+" : ""}${cascadePreview.deltaDays} روز`} · هدف: {cascadePreview.targetDisplay}
                    </div>
                    <div className="space-y-1 max-h-44 overflow-auto pl-1">
                      {cascadePreview.entries.map((e, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-background/70 border border-border/50 px-2 py-1 text-[11px]">
                          <span className="font-medium truncate">{e.label}</span>
                          <span className="text-muted-foreground font-mono shrink-0" dir="ltr">{e.before} ← <span className="text-amber-700 font-semibold">{e.after}</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                <Button onClick={submitDate} disabled={dateBusy || !toLatinDigits(targetDate.trim())} className="w-full gap-1 bg-amber-600 hover:bg-amber-700">
                  {dateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                  اعمال تغییر تاریخ + آبشار اتوماتیک
                </Button>
                {dateBusy ? <p className="text-[11px] text-muted-foreground">در حال اجرای زنجیرهٔ آبشار از طریق ترموکس — تا ~۲ دقیقه؛ صفحه را نبندید.</p> : null}
                {dateReport ? <StepReport report={dateReport} /> : null}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* ═══════════ حذف ═══════════ */}
        <TabsContent value="delete" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5"><Trash2 className="h-4 w-4 text-red-600" /> حذف کامل کددرخواست</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground leading-5">
                درخواست اعلامی مالک کاملاً از سامانه ARM حذف و همهٔ آینه‌های محلی (رکورد، رویدادها، معاملات، قراردادها، گراف هوشمند) پاکسازی می‌شود — هیچ اثری، حتی در پروفایل کارشناس ثبت‌کننده، باقی نمی‌ماند.
              </p>
              <div className="flex gap-2">
                <Input dir="ltr" placeholder="کد درخواست…" value={delCode} onChange={(e) => setDelCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doDeleteLookup()} className={inputCls} />
                <Button onClick={doDeleteLookup} disabled={delBusy || !delCode.trim()} variant="outline" className="shrink-0 gap-1">
                  {delBusy && !delReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} بررسی آثار
                </Button>
              </div>
              {delLookup?.ok ? (
                <div className="rounded-xl border border-red-500/40 bg-red-500/5 p-3 space-y-2 text-xs">
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant="outline" className="font-mono" dir="ltr">کد {delLookup.code}</Badge>
                    {delLookup.arm?.title ? <span className="text-muted-foreground">«{delLookup.arm.title}»</span> : null}
                    <Badge variant="destructive">{tracesTotal} اثر محلی قابل حذف</Badge>
                    {delLookup.events.length ? <Badge variant="destructive">{delLookup.events.length} رویداد ARM</Badge> : null}
                  </div>
                  <div className="text-muted-foreground">این آثار پاک خواهند شد: {Object.entries(delLookup.localTraces ?? {}).filter(([, v]) => v > 0).map(([k, v]) => `${traceLabel(k)}: ${v}`).join(" · ") || "اثر محلی‌ای نبود"}.</div>
                  <div className={field}>
                    <Label className="text-xs font-medium text-red-700">برای تأیید حذف کامل، کد درخواست را دقیقاً بنویسید: {delLookup.code}</Label>
                    <Input dir="ltr" value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} className={inputCls} />
                  </div>
                  <Button onClick={submitDelete} disabled={delBusy || delConfirm.trim() !== delLookup.code} variant="destructive" className="w-full gap-1">
                    {delBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    حذف کامل و پاکسازی
                  </Button>
                </div>
              ) : delLookup && !delLookup.ok ? (
                <p className="text-xs text-red-600 font-medium">{delLookup.error}</p>
              ) : null}
              {delReport ? <StepReport report={delReport} /> : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function traceLabel(key: string): string {
  const map: Record<string, string> = {
    requestRecords: "رکورد درخواست",
    requestEvents: "رویدادها",
    linkedEvents: "رویدادها",
    transactions: "معاملات",
    contracts: "قراردادها",
    matchRejections: "رد تطبیق",
    opportunityAlerts: "هشدار فرصت",
    graphNodes: "گره گراف",
    graphEdges: "یال گراف",
  };
  return map[key] ?? key;
}
