"use client";

/**
 * RequestChangesPanel — قابلیت ۲: ایجاد و تغییر «کد درخواست» (DIR-CHANGES-TILE-001)
 * ------------------------------------------------------
 * چهار عملیات (هرچه مالک بخواهد):
 *   · جستجو با کد درخواست — محلی + زندهٔ ARM + تاریخچهٔ تغییرات
 *   · ثبت کد درخواست جدید — عین ۰۹۹ (۴ گامی) + رویداد تاریخچه با تاریخ دقیق
 *   · تغییر و اصلاح تاریخ — PUT requests/update + آرایهٔ status (شاهکار ۰۹۹)
 *   · ثبت رویداد تاریخچه — اقدام/توسط/تاریخ جلالی + ساعت دقیق
 */

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, FilePlus2, History, CalendarClock, Loader2 } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useToast } from "@/hooks/use-toast";
import { TRADE_TYPES, BUILDING_TYPES, PROPERTY_TYPES, PAYMENT_METHODS } from "@/lib/request/types";
import { USER_SERIOUSNESS } from "@/lib/listing/types";
import { StepReport } from "./StepReport";
import type { ChangesReport } from "@/lib/changes/executor";

interface LookupResult {
  ok: boolean;
  code: string;
  error?: string;
  local: {
    requestCode: string | null;
    armRequestId: string | null;
    customerName: string | null;
    customerMobile: string | null;
    actorName: string | null;
    title: string | null;
    status: string;
    source: string;
    events: Array<{ name: string; date: string | null; hour: string | null; display: string | null }>;
  } | null;
  arm: {
    armRequestId: string;
    title: string | null;
    relatedRealtor: string | null;
    relatedCustomer: string | null;
    createdAt: string | null;
    history: Array<{ id: string; action: string | null; realtor: string | null; date: string | null; display: string | null }>;
  } | null;
}

export function RequestChangesPanel() {
  const { toast } = useToast();

  /* ── جستجو ── */
  const [lookupCode, setLookupCode] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookup, setLookup] = useState<LookupResult | null>(null);

  const doLookup = async () => {
    const code = lookupCode.trim();
    if (!code) return;
    setLookupBusy(true);
    setLookup(null);
    try {
      const res = await api<LookupResult>("/api/changes/request", { method: "POST", body: { action: "lookup", code }, timeoutMs: 150_000 });
      setLookup(res);
    } catch (err) {
      toast({ title: "جستجو ناموفق", description: (err as ApiClientError).message, variant: "destructive" });
    } finally {
      setLookupBusy(false);
    }
  };

  /* ── ثبت جدید ── */
  const [createForm, setCreateForm] = useState({
    customerName: "",
    customerMobile: "",
    tradeTypeId: TRADE_TYPES[0].id,
    buildingTypeId: BUILDING_TYPES[0].id,
    propertyTypeId: PROPERTY_TYPES[BUILDING_TYPES[0].id]?.[0]?.id ?? "",
    spaceFrom: "", spaceTo: "",
    priceFrom: "", priceTo: "",
    userPaymentMethod: PAYMENT_METHODS[0].id,
    userSeriousity: "61a753650927675c45489a4f", // زیاد — استاندارد ۰۹۹
    withHistory: true,
    historyTypeName: "ایجاد مشاور",
    historyBy: "سید نعمت اله سیدی",
    historyDate: "",
    historyHour: "17:30",
  });
  const [createBusy, setCreateBusy] = useState(false);
  const [createReport, setCreateReport] = useState<ChangesReport | null>(null);

  const propertyOptions = useMemo(() => PROPERTY_TYPES[createForm.buildingTypeId] ?? [], [createForm.buildingTypeId]);

  useEffect(() => {
    // همگام‌سازی نوع ملک با کاربری (عین فرم خود سامانه)
    if (!(PROPERTY_TYPES[createForm.buildingTypeId] ?? []).some((p) => p.id === createForm.propertyTypeId)) {
      setCreateForm((f) => ({ ...f, propertyTypeId: (PROPERTY_TYPES[f.buildingTypeId] ?? [])[0]?.id ?? "" }));
    }
  }, [createForm.buildingTypeId, createForm.propertyTypeId]);

  const submitCreate = async () => {
    setCreateBusy(true);
    setCreateReport(null);
    try {
      const inputs: Record<string, unknown> = {};
      const nf = (v: string) => (v.trim() ? Number(v.replace(/\D/g, "")) : undefined);
      const spaceFrom = nf(createForm.spaceFrom);
      const spaceTo = nf(createForm.spaceTo);
      const priceFrom = nf(createForm.priceFrom);
      const priceTo = nf(createForm.priceTo);
      if (spaceFrom !== undefined) inputs.space_from = spaceFrom;
      if (spaceTo !== undefined) inputs.space_to = spaceTo;
      if (priceFrom !== undefined) inputs.totalPrice_from = priceFrom;
      if (priceTo !== undefined) inputs.totalPrice_to = priceTo;

      const body: Record<string, unknown> = {
        action: "create",
        spec: {
          customerName: createForm.customerName.trim(),
          customerMobile: createForm.customerMobile.trim(),
          tradeTypeId: createForm.tradeTypeId,
          buildingTypeId: createForm.buildingTypeId,
          propertyTypeId: createForm.propertyTypeId,
          inputs,
          userPaymentMethod: createForm.userPaymentMethod,
          userSeriousity: createForm.userSeriousity,
        },
        history: createForm.withHistory && createForm.historyDate.trim()
          ? { eventTypeName: createForm.historyTypeName.trim(), byName: createForm.historyBy.trim(), date: createForm.historyDate.trim(), hour: createForm.historyHour.trim() }
          : null,
      };
      const res = await api<ChangesReport>("/api/changes/request", { method: "POST", body, timeoutMs: 300_000 });
      setCreateReport(res);
      toast({
        title: res.ok ? "کد درخواست ثبت شد" : "ثبت ناموفق",
        description: res.ok && res.result?.requestCode ? `کد درخواست: ${res.result.requestCode}` : res.error ?? "گزارش گام‌ها را ببینید.",
        variant: res.ok ? undefined : "destructive",
      });
    } catch (err) {
      toast({ title: "خطا", description: (err as ApiClientError).message, variant: "destructive" });
    } finally {
      setCreateBusy(false);
    }
  };

  /* ── تغییر و اصلاح تاریخ ── */
  const [fixForm, setFixForm] = useState({ code: "", date: "", hour: "17:30" });
  const [fixBusy, setFixBusy] = useState(false);
  const [fixReport, setFixReport] = useState<ChangesReport | null>(null);

  const submitFix = async () => {
    setFixBusy(true);
    setFixReport(null);
    try {
      const res = await api<ChangesReport>("/api/changes/request", {
        method: "POST",
        body: { action: "update", spec: { code: fixForm.code.trim(), historyTarget: fixForm.date.trim() ? { date: fixForm.date.trim(), hour: fixForm.hour.trim() } : null } },
        timeoutMs: 300_000,
      });
      setFixReport(res);
      toast({
        title: res.ok ? "تاریخ تاریخچه اصلاح شد" : "اصلاح ناموفق",
        description: res.ok ? "همهٔ مدخل‌های تاریخچهٔ زندهٔ ARM با تاریخ هدف هم‌راستا شدند." : res.error ?? "گزارش گام‌ها را ببینید.",
        variant: res.ok ? undefined : "destructive",
      });
    } catch (err) {
      toast({ title: "خطا", description: (err as ApiClientError).message, variant: "destructive" });
    } finally {
      setFixBusy(false);
    }
  };

  /* ── ثبت رویداد ── */
  const [eventTypes, setEventTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [eventForm, setEventForm] = useState({ code: "", typeId: "", typeName: "ایجاد مشاور", by: "سید نعمت اله سیدی", date: "", hour: "17:30" });
  const [eventBusy, setEventBusy] = useState(false);
  const [eventReport, setEventReport] = useState<ChangesReport | null>(null);

  useEffect(() => {
    // انواع رویداد زنده — بهترین‌تلاش (پیش‌فرض ۰۹۹ همیشه موجود است)
    api<{ ok: boolean; types: Array<{ id: string; name: string }> }>("/api/changes/request", { method: "POST", body: { action: "types" }, timeoutMs: 60_000 })
      .then((r) => setEventTypes(r.types ?? []))
      .catch(() => undefined);
  }, []);

  const submitEvent = async () => {
    setEventBusy(true);
    setEventReport(null);
    try {
      const chosen = eventTypes.find((t) => t.id === eventForm.typeId);
      const res = await api<ChangesReport>("/api/changes/request", {
        method: "POST",
        body: {
          action: "event",
          code: eventForm.code.trim(),
          spec: {
            eventTypeId: chosen?.id ?? undefined,
            eventTypeName: chosen?.name ?? eventForm.typeName.trim(),
            byName: eventForm.by.trim(),
            date: eventForm.date.trim(),
            hour: eventForm.hour.trim(),
          },
        },
        timeoutMs: 300_000,
      });
      setEventReport(res);
      toast({
        title: res.ok ? "رویداد تاریخچه ثبت شد" : "ثبت رویداد ناموفق",
        description: res.ok ? `اقدام: ${chosen?.name ?? eventForm.typeName} · تاریخ: ${eventForm.hour} | ${eventForm.date}` : res.error ?? "گزارش گام‌ها را ببینید.",
        variant: res.ok ? undefined : "destructive",
      });
    } catch (err) {
      toast({ title: "خطا", description: (err as ApiClientError).message, variant: "destructive" });
    } finally {
      setEventBusy(false);
    }
  };

  const field = "grid gap-1.5";
  const inputCls = "bg-background";

  return (
    <div className="space-y-4">
      <Tabs defaultValue="lookup">
        <TabsList className="grid w-full grid-cols-4 h-auto">
          <TabsTrigger value="lookup" className="gap-1 text-xs py-2"><Search className="h-3.5 w-3.5" /> جستجو</TabsTrigger>
          <TabsTrigger value="create" className="gap-1 text-xs py-2"><FilePlus2 className="h-3.5 w-3.5" /> ثبت جدید</TabsTrigger>
          <TabsTrigger value="fix" className="gap-1 text-xs py-2"><History className="h-3.5 w-3.5" /> اصلاح تاریخ</TabsTrigger>
          <TabsTrigger value="event" className="gap-1 text-xs py-2"><CalendarClock className="h-3.5 w-3.5" /> ثبت رویداد</TabsTrigger>
        </TabsList>

        {/* ── جستجو ── */}
        <TabsContent value="lookup" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">جستجوی کد درخواست (محلی + زندهٔ ARM)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input dir="ltr" placeholder="مثلاً 55920" value={lookupCode} onChange={(e) => setLookupCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLookup()} className={inputCls} />
                <Button onClick={doLookup} disabled={lookupBusy || !lookupCode.trim()} className="shrink-0 gap-1">
                  {lookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} جستجو
                </Button>
              </div>
              {lookupBusy ? <Skeleton className="h-32 rounded-xl" /> : null}
              {lookup && !lookupBusy ? (
                <div className="space-y-3 text-xs">
                  {!lookup.ok && lookup.error ? <p className="text-red-600 font-medium">{lookup.error}</p> : null}
                  {lookup.arm ? (
                    <div className="rounded-xl border border-border bg-background/60 p-3 space-y-2">
                      <div className="flex flex-wrap gap-2 items-center">
                        <Badge variant="outline" className="font-mono" dir="ltr">کد {lookup.code}</Badge>
                        <Badge className="bg-sky-600 hover:bg-sky-600">زندهٔ ARM</Badge>
                        {lookup.arm.title ? <span className="text-muted-foreground">«{lookup.arm.title}»</span> : null}
                      </div>
                      <div className="text-muted-foreground space-y-0.5">
                        <div>کارشناس: {lookup.arm.relatedRealtor ?? "—"} · متقاضی: {lookup.arm.relatedCustomer ?? "—"}</div>
                        {lookup.arm.createdAt ? <div dir="ltr" className="text-[11px]">createdAt: {lookup.arm.createdAt}</div> : null}
                      </div>
                      <div>
                        <div className="font-medium mb-1">تاریخچهٔ تغییرات درخواست (زنده — requests/history):</div>
                        {lookup.arm.history.length ? (
                          <ul className="space-y-1">
                            {lookup.arm.history.map((h) => (
                              <li key={h.id} className="flex flex-wrap items-center gap-1.5 rounded-lg bg-card p-1.5 border border-border/50">
                                <span className="font-medium">{h.action ?? "؟"}</span>
                                <span className="text-muted-foreground">· {h.realtor ?? "؟"} ·</span>
                                <span className="font-mono text-[11px]" dir="ltr">{h.display ?? h.date ?? "؟"}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-muted-foreground">تاریخچه‌ای ثبت نشده است.</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                  {lookup.local ? (
                    <div className="rounded-xl border border-border bg-background/60 p-3 space-y-1.5">
                      <div className="flex flex-wrap gap-2 items-center">
                        <Badge variant="secondary">آینهٔ محلی</Badge>
                        <span className="text-muted-foreground">{lookup.local.title ?? "بدون عنوان"} · وضعیت {lookup.local.status} · منبع {lookup.local.source}</span>
                      </div>
                      <div className="text-muted-foreground">
                        متقاضی: {lookup.local.customerName ?? "—"} · {lookup.local.customerMobile ?? "—"} · کارشناس: {lookup.local.actorName ?? "—"}
                      </div>
                      {lookup.local.events.length ? (
                        <div>
                          <div className="font-medium mb-1">رویدادهای محلی:</div>
                          <ul className="space-y-1">
                            {lookup.local.events.map((e, i) => (
                              <li key={i} className="rounded-lg bg-card p-1.5 border border-border/50">
                                {e.name} {e.display ? <span className="font-mono text-[11px]" dir="ltr">· {e.display}</span> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ثبت جدید ── */}
        <TabsContent value="create" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">ثبت کد درخواست جدید در سامانه ARM — عین فرم ۴ گامی خود سامانه</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-leading text-muted-foreground leading-5">
                هیچ گامی دور زده نمی‌شود: اعتبارسنجی ۴ گامی ← جستجو/ایجاد مشتری ← مکان (پیش‌فرض: کل تبریز — ۱۳۰ منطقه/۹۲۶ محله) ← جزییات + فرم پویا ← تکمیلی ← POST requests/create ← کد درخواست از فهرست زنده. مقادیر اعلام‌نشده با استانداردترین‌های ۰۹۹ پر می‌شوند (نقدی · زیاد).
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className={field}>
                  <Label className="text-xs">نام و نام خانوادگی درخواست‌دهنده *</Label>
                  <Input value={createForm.customerName} onChange={(e) => setCreateForm((f) => ({ ...f, customerName: e.target.value }))} className={inputCls} placeholder="مثلاً رامین عباس نژاد" />
                </div>
                <div className={field}>
                  <Label className="text-xs">موبایل درخواست‌دهنده * (۱۱ رقم با ۰۹)</Label>
                  <Input dir="ltr" value={createForm.customerMobile} onChange={(e) => setCreateForm((f) => ({ ...f, customerMobile: e.target.value }))} className={inputCls} placeholder="09910756951" />
                </div>
                <div className={field}>
                  <Label className="text-xs">نوع معامله</Label>
                  <Select value={createForm.tradeTypeId} onValueChange={(v) => setCreateForm((f) => ({ ...f, tradeTypeId: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TRADE_TYPES.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.nameRequest} ({t.name})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={field}>
                  <Label className="text-xs">نوع کاربری</Label>
                  <Select value={createForm.buildingTypeId} onValueChange={(v) => setCreateForm((f) => ({ ...f, buildingTypeId: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BUILDING_TYPES.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={field}>
                  <Label className="text-xs">نوع ملک</Label>
                  <Select value={createForm.propertyTypeId} onValueChange={(v) => setCreateForm((f) => ({ ...f, propertyTypeId: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {propertyOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={field}>
                  <Label className="text-xs">نحوهٔ پرداخت (پول مشتری)</Label>
                  <Select value={createForm.userPaymentMethod} onValueChange={(v) => setCreateForm((f) => ({ ...f, userPaymentMethod: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={field}>
                  <Label className="text-xs">جدیت مشتری</Label>
                  <Select value={createForm.userSeriousity} onValueChange={(v) => setCreateForm((f) => ({ ...f, userSeriousity: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {USER_SERIOUSNESS.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className={field}>
                    <Label className="text-xs">متراژ از</Label>
                    <Input dir="ltr" inputMode="numeric" value={createForm.spaceFrom} onChange={(e) => setCreateForm((f) => ({ ...f, spaceFrom: e.target.value }))} className={inputCls} placeholder="140" />
                  </div>
                  <div className={field}>
                    <Label className="text-xs">متراژ تا</Label>
                    <Input dir="ltr" inputMode="numeric" value={createForm.spaceTo} onChange={(e) => setCreateForm((f) => ({ ...f, spaceTo: e.target.value }))} className={inputCls} placeholder="180" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className={field}>
                    <Label className="text-xs">قیمت کل از (تومان)</Label>
                    <Input dir="ltr" inputMode="numeric" value={createForm.priceFrom} onChange={(e) => setCreateForm((f) => ({ ...f, priceFrom: e.target.value }))} className={inputCls} placeholder="35000000000" />
                  </div>
                  <div className={field}>
                    <Label className="text-xs">قیمت کل تا (تومان)</Label>
                    <Input dir="ltr" inputMode="numeric" value={createForm.priceTo} onChange={(e) => setCreateForm((f) => ({ ...f, priceTo: e.target.value }))} className={inputCls} placeholder="40000000000" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-border p-3 space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input type="checkbox" checked={createForm.withHistory} onChange={(e) => setCreateForm((f) => ({ ...f, withHistory: e.target.checked }))} className="h-4 w-4 accent-primary" />
                  ثبت رویداد تاریخچه با تاریخ دقیق (عین دستور مالک ۰۹۹)
                </label>
                {createForm.withHistory ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className={field}>
                      <Label className="text-xs">اقدام</Label>
                      <Input value={createForm.historyTypeName} onChange={(e) => setCreateForm((f) => ({ ...f, historyTypeName: e.target.value }))} className={inputCls} placeholder="ایجاد مشاور" />
                    </div>
                    <div className={field}>
                      <Label className="text-xs">توسط</Label>
                      <Input value={createForm.historyBy} onChange={(e) => setCreateForm((f) => ({ ...f, historyBy: e.target.value }))} className={inputCls} placeholder="سید نعمت اله سیدی" />
                    </div>
                    <div className={field}>
                      <Label className="text-xs">تاریخ (جلالی)</Label>
                      <Input dir="ltr" value={createForm.historyDate} onChange={(e) => setCreateForm((f) => ({ ...f, historyDate: e.target.value }))} className={inputCls} placeholder="1405/08/20" />
                    </div>
                    <div className={field}>
                      <Label className="text-xs">ساعت</Label>
                      <Input dir="ltr" value={createForm.historyHour} onChange={(e) => setCreateForm((f) => ({ ...f, historyHour: e.target.value }))} className={inputCls} placeholder="17:30" />
                    </div>
                  </div>
                ) : null}
              </div>

              <Button onClick={submitCreate} disabled={createBusy || !createForm.customerName.trim() || !createForm.customerMobile.trim()} className="w-full gap-1">
                {createBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                ثبت نهایی در سامانه ARM (گام‌به‌گام)
              </Button>
              {createBusy ? <p className="text-[11px] text-muted-foreground">در حال اجرای زنجیرهٔ ثبت از طریق ترموکس — ممکن است تا ~۲ دقیقه طول بکشد؛ صفحه را نبندید.</p> : null}
              {createReport ? <StepReport report={createReport} /> : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── اصلاح تاریخ ── */}
        <TabsContent value="fix" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">اصلاح تاریخ تاریخچهٔ تغییرات درخواست — شاهکار ۰۹۹</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground leading-5">
                تاریخ همهٔ مدخل‌های «تاریخچه تغییرات درخواست» در خود سامانهٔ ARM با همان شناسه‌های عین (آرایهٔ status در PUT requests/update) به تاریخ هدف اصلاح می‌شود — عین اجرای موفق ۰۹۹ روی درخواست ۵۵۹۲۰ (۱۷:۳۰ | ۱۴۰۵/۰۸/۲۰ = 2026-11-11T14:00:00.000Z).
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className={field}>
                  <Label className="text-xs">کد درخواست *</Label>
                  <Input dir="ltr" value={fixForm.code} onChange={(e) => setFixForm((f) => ({ ...f, code: e.target.value }))} className={inputCls} placeholder="55920" />
                </div>
                <div className={field}>
                  <Label className="text-xs">تاریخ هدف (جلالی) *</Label>
                  <Input dir="ltr" value={fixForm.date} onChange={(e) => setFixForm((f) => ({ ...f, date: e.target.value }))} className={inputCls} placeholder="1405/08/20" />
                </div>
                <div className={field}>
                  <Label className="text-xs">ساعت هدف</Label>
                  <Input dir="ltr" value={fixForm.hour} onChange={(e) => setFixForm((f) => ({ ...f, hour: e.target.value }))} className={inputCls} placeholder="17:30" />
                </div>
              </div>
              <Button onClick={submitFix} disabled={fixBusy || !fixForm.code.trim() || !fixForm.date.trim()} className="w-full gap-1">
                {fixBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                اصلاح تاریخ در خود سامانهٔ ARM + راستی‌آزمایی زنده
              </Button>
              {fixBusy ? <p className="text-[11px] text-muted-foreground">PUT + راستی‌آزمایی زندهٔ تاریخچه — از طریق ترموکس؛ تا ~۲ دقیقه.</p> : null}
              {fixReport ? <StepReport report={fixReport} /> : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── ثبت رویداد ── */}
        <TabsContent value="event" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">ثبت رویداد تاریخچه با تاریخ دقیق (اقدام · توسط · تاریخ)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground leading-5">
                رویداد هم در خود سامانهٔ ARM (request-events/create عین فرم رویداد) و هم در آینهٔ محلی با تاریخ جلالی + ساعت دقیق ثبت می‌شود.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className={field}>
                  <Label className="text-xs">کد درخواست *</Label>
                  <Input dir="ltr" value={eventForm.code} onChange={(e) => setEventForm((f) => ({ ...f, code: e.target.value }))} className={inputCls} placeholder="55920" />
                </div>
                <div className={field}>
                  <Label className="text-xs">اقدام (نوع رویداد)</Label>
                  <Select
                    value={eventForm.typeId || undefined}
                    onValueChange={(v) => {
                      const chosen = eventTypes.find((t) => t.id === v);
                      setEventForm((f) => ({ ...f, typeId: v, typeName: chosen?.name ?? f.typeName }));
                    }}
                  >
                    <SelectTrigger className={inputCls}><SelectValue placeholder={eventForm.typeName || "ایجاد مشاور"} /></SelectTrigger>
                    <SelectContent>
                      {(eventTypes.length ? eventTypes : [{ id: "", name: "ایجاد مشاور" }]).map((t) => (
                        <SelectItem key={t.id || t.name} value={t.id || t.name}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={field}>
                  <Label className="text-xs">توسط</Label>
                  <Input value={eventForm.by} onChange={(e) => setEventForm((f) => ({ ...f, by: e.target.value }))} className={inputCls} placeholder="سید نعمت اله سیدی" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className={field}>
                    <Label className="text-xs">تاریخ (جلالی) *</Label>
                    <Input dir="ltr" value={eventForm.date} onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))} className={inputCls} placeholder="1405/08/20" />
                  </div>
                  <div className={field}>
                    <Label className="text-xs">ساعت *</Label>
                    <Input dir="ltr" value={eventForm.hour} onChange={(e) => setEventForm((f) => ({ ...f, hour: e.target.value }))} className={inputCls} placeholder="17:30" />
                  </div>
                </div>
              </div>
              <Button onClick={submitEvent} disabled={eventBusy || !eventForm.code.trim() || !eventForm.date.trim()} className="w-full gap-1">
                {eventBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                ثبت رویداد (ARM + آینهٔ محلی)
              </Button>
              {eventReport ? <StepReport report={eventReport} /> : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
