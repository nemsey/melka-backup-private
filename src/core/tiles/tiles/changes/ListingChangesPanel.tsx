"use client";

/**
 * ListingChangesPanel — قابلیت ۱: ایجاد و تغییر «کدآگهی» (DIR-CHANGES-TILE-001)
 * ------------------------------------------------------
 * سه عملیات:
 *   · جستجو با کدآگهی — زنده از خود سامانه (properties/info/by-code عین فرم رویداد)
 *   · ثبت کدآگهی جدید — عین فرم ۵ گامی خود سامانه (مسیر زندهٔ اثبات‌شده)
 *   · تغییر در کدآگهی — PUT properties/update/{id} با بازسازی بدنهٔ کامل
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, FilePlus2, FilePen, Loader2 } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useToast } from "@/hooks/use-toast";
import { TABRIZ_AREAS, linesOfArea } from "@/lib/divar/tabriz-locations";
import { TRADE_TYPES, BUILDING_TYPES, PROPERTY_TYPES, CHANGEABLE_WITH, FILE_FINDINGS, FILE_TYPES, PRICE_EVALUATIONS, USER_SERIOUSNESS } from "@/lib/listing/types";
import { toLatinDigits } from "@/lib/listing/types";
import { StepReport } from "./StepReport";
import type { ChangesReport } from "@/lib/changes/executor";

interface LookupResult {
  ok: boolean;
  code: string;
  error?: string;
  arm: { armPropertyId: string; title: string | null; relatedRealtor: string | null; code: string } | null;
  details: Array<{ label: string; value: string; unit?: string | null }> | null;
  owner: { name: string | null; mobile: string | null } | null;
  localListingId: string | null;
}

export function ListingChangesPanel() {
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
      const res = await api<LookupResult>("/api/changes/listing", { method: "POST", body: { action: "lookup", code }, timeoutMs: 150_000 });
      setLookup(res);
    } catch (err) {
      toast({ title: "جستجو ناموفق", description: (err as ApiClientError).message, variant: "destructive" });
    } finally {
      setLookupBusy(false);
    }
  };

  /* ── ثبت جدید ── */
  interface ListingCreateFormState {
    customerName: string;
    customerMobile: string;
    areaId: string;
    lineId: string;
    address: string;
    tradeTypeId: string;
    buildingTypeId: string;
    propertyTypeId: string;
    meterage: string;
    rooms: string;
    floor: string;
    buildYear: string;
    price: string;
    changeWith: string;
    priceEvaluation: string;
    fileFinding: string;
    fileType: string;
    userSeriousness: string;
  }
  const [createForm, setCreateForm] = useState<ListingCreateFormState>({
    customerName: "",
    customerMobile: "",
    areaId: "",
    lineId: "",
    address: "",
    tradeTypeId: TRADE_TYPES[0].id,
    buildingTypeId: BUILDING_TYPES[0].id,
    propertyTypeId: "",
    meterage: "",
    rooms: "",
    floor: "",
    buildYear: "",
    price: "",
    changeWith: "notChangeable",
    priceEvaluation: PRICE_EVALUATIONS[2]?.id ?? "",
    fileFinding: FILE_FINDINGS[0]?.value ?? "",
    fileType: FILE_TYPES[0]?.value ?? "",
    userSeriousness: "61a753650927675c45489a4f", // زیاد — استاندارد
  });
  const [createBusy, setCreateBusy] = useState(false);
  const [createReport, setCreateReport] = useState<ChangesReport | null>(null);

  const lineOptions = useMemo(() => linesOfArea(createForm.areaId), [createForm.areaId]);
  const propertyOptions = useMemo(() => PROPERTY_TYPES.filter((p) => p.id), []);

  const submitCreate = async () => {
    setCreateBusy(true);
    setCreateReport(null);
    try {
      const inputs: Record<string, string> = { مساحت: toLatinDigits(createForm.meterage) };
      const rooms = toLatinDigits(createForm.rooms).replace(/\D/g, "");
      const floor = toLatinDigits(createForm.floor).replace(/[^\d-]/g, "");
      const year = toLatinDigits(createForm.buildYear).replace(/\D/g, "");
      const price = toLatinDigits(createForm.price).replace(/\D/g, "");
      if (rooms) inputs["اتاق"] = rooms;
      if (floor) inputs["طبقه"] = floor;
      if (year) inputs["سال ساخت"] = year;
      if (price) inputs["قیمت"] = price;

      const res = await api<ChangesReport>("/api/changes/listing", {
        method: "POST",
        body: {
          action: "create",
          spec: {
            customerName: createForm.customerName.trim(),
            customerMobile: createForm.customerMobile.trim(),
            areaId: createForm.areaId,
            lineId: createForm.lineId,
            address: createForm.address.trim(),
            tradeTypeId: createForm.tradeTypeId,
            buildingTypeId: createForm.buildingTypeId,
            propertyTypeId: createForm.propertyTypeId,
            changeWith: [createForm.changeWith],
            inputs,
            priceEvaluation: createForm.priceEvaluation,
            fileFinding: createForm.fileFinding,
            fileType: [createForm.fileType],
            userSeriousness: createForm.userSeriousness,
          },
        },
        timeoutMs: 300_000,
      });
      setCreateReport(res);
      toast({
        title: res.ok ? "کدآگهی ثبت شد" : "ثبت ناموفق",
        description: res.ok && res.result?.propertyCode ? `کدآگهی: ${res.result.propertyCode}` : res.error ?? "گزارش گام‌ها را ببینید.",
        variant: res.ok ? undefined : "destructive",
      });
    } catch (err) {
      toast({ title: "خطا", description: (err as ApiClientError).message, variant: "destructive" });
    } finally {
      setCreateBusy(false);
    }
  };

  /* ── تغییر ── */
  interface ListingUpdateFormState {
    code: string;
    price: string;
    userSeriousness: string;
    priceEvaluation: string;
    isUrgent: boolean;
    isLuxury: boolean;
  }
  const [updateForm, setUpdateForm] = useState<ListingUpdateFormState>({
    code: "",
    price: "",
    userSeriousness: "61a753650927675c45489a4f",
    priceEvaluation: PRICE_EVALUATIONS[2]?.id ?? "",
    isUrgent: false,
    isLuxury: false,
  });
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateReport, setUpdateReport] = useState<ChangesReport | null>(null);

  const submitUpdate = async () => {
    setUpdateBusy(true);
    setUpdateReport(null);
    try {
      const inputsPatch: Record<string, string> = {};
      const price = toLatinDigits(updateForm.price).replace(/\D/g, "");
      if (price) inputsPatch["قیمت"] = price;
      const res = await api<ChangesReport>("/api/changes/listing", {
        method: "POST",
        body: {
          action: "update",
          spec: {
            code: updateForm.code.trim(),
            inputsPatch,
            userSeriousness: updateForm.userSeriousness,
            priceEvaluation: updateForm.priceEvaluation,
            flags: { isUrgent: updateForm.isUrgent, isLuxury: updateForm.isLuxury },
          },
        },
        timeoutMs: 300_000,
      });
      setUpdateReport(res);
      toast({
        title: res.ok ? "تغییرات کدآگهی ثبت شد" : "تغییر ناموفق",
        description: res.ok ? `PUT properties/update روی کد ${updateForm.code} انجام شد.` : res.error ?? "گزارش گام‌ها را ببینید.",
        variant: res.ok ? undefined : "destructive",
      });
    } catch (err) {
      toast({ title: "خطا", description: (err as ApiClientError).message, variant: "destructive" });
    } finally {
      setUpdateBusy(false);
    }
  };

  const field = "grid gap-1.5";
  const inputCls = "bg-background";

  return (
    <div className="space-y-4">
      <Tabs defaultValue="lookup">
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="lookup" className="gap-1 text-xs py-2"><Search className="h-3.5 w-3.5" /> جستجو</TabsTrigger>
          <TabsTrigger value="create" className="gap-1 text-xs py-2"><FilePlus2 className="h-3.5 w-3.5" /> ثبت جدید</TabsTrigger>
          <TabsTrigger value="update" className="gap-1 text-xs py-2"><FilePen className="h-3.5 w-3.5" /> تغییر</TabsTrigger>
        </TabsList>

        {/* ── جستجو ── */}
        <TabsContent value="lookup" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">جستجوی کدآگهی در خود سامانهٔ ARM</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input dir="ltr" placeholder="کدآگهی…" value={lookupCode} onChange={(e) => setLookupCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLookup()} className={inputCls} />
                <Button onClick={doLookup} disabled={lookupBusy || !lookupCode.trim()} className="shrink-0 gap-1">
                  {lookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} جستجو
                </Button>
              </div>
              {lookupBusy ? <Skeleton className="h-28 rounded-xl" /> : null}
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
                      <div className="text-muted-foreground">کارشناس: {lookup.arm.relatedRealtor ?? "—"}</div>
                      {lookup.owner ? <div className="text-muted-foreground">مالک: {lookup.owner.name ?? "—"} · {lookup.owner.mobile ?? "—"}</div> : null}
                      {lookup.details?.length ? (
                        <div className="grid grid-cols-2 gap-1">
                          {lookup.details.slice(0, 12).map((d, i) => (
                            <div key={i} className="rounded-lg bg-card p-1.5 border border-border/50">
                              <span className="text-muted-foreground">{d.label}: </span>
                              <span className="font-medium">{d.value}{d.unit ? ` ${d.unit}` : ""}</span>
                            </div>
                          ))}
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
              <CardTitle className="text-sm">ثبت کدآگهی جدید — عین فرم ۵ گامی خود سامانه</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className={field}>
                  <Label className="text-xs">نام و نام خانوادگی مالک *</Label>
                  <Input value={createForm.customerName} onChange={(e) => setCreateForm((f) => ({ ...f, customerName: e.target.value }))} className={inputCls} />
                </div>
                <div className={field}>
                  <Label className="text-xs">موبایل مالک * (۱۱ رقم با ۰۹)</Label>
                  <Input dir="ltr" value={createForm.customerMobile} onChange={(e) => setCreateForm((f) => ({ ...f, customerMobile: e.target.value }))} className={inputCls} placeholder="09xxxxxxxxx" />
                </div>
                <div className={field}>
                  <Label className="text-xs">منطقه *</Label>
                  <Select value={createForm.areaId || undefined} onValueChange={(v) => setCreateForm((f) => ({ ...f, areaId: v, lineId: "" }))}>
                    <SelectTrigger className={inputCls}><SelectValue placeholder="انتخاب منطقه (۱۳۰ منطقه)" /></SelectTrigger>
                    <SelectContent>
                      {TABRIZ_AREAS.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={field}>
                  <Label className="text-xs">محله *</Label>
                  <Select value={createForm.lineId || undefined} onValueChange={(v) => setCreateForm((f) => ({ ...f, lineId: v }))} disabled={!createForm.areaId}>
                    <SelectTrigger className={inputCls}><SelectValue placeholder={createForm.areaId ? "انتخاب محله" : "ابتدا منطقه"} /></SelectTrigger>
                    <SelectContent>
                      {lineOptions.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={field + " col-span-2"}>
                  <Label className="text-xs">آدرس ملک *</Label>
                  <Input value={createForm.address} onChange={(e) => setCreateForm((f) => ({ ...f, address: e.target.value }))} className={inputCls} />
                </div>
                <div className={field}>
                  <Label className="text-xs">نوع معامله</Label>
                  <Select value={createForm.tradeTypeId} onValueChange={(v) => setCreateForm((f) => ({ ...f, tradeTypeId: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TRADE_TYPES.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
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
                  <Label className="text-xs">نوع ملک *</Label>
                  <Select value={createForm.propertyTypeId || undefined} onValueChange={(v) => setCreateForm((f) => ({ ...f, propertyTypeId: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue placeholder="انتخاب نوع ملک" /></SelectTrigger>
                    <SelectContent>
                      {propertyOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={field}>
                  <Label className="text-xs">متراژ * (متر)</Label>
                  <Input dir="ltr" inputMode="numeric" value={createForm.meterage} onChange={(e) => setCreateForm((f) => ({ ...f, meterage: e.target.value }))} className={inputCls} placeholder="120" />
                </div>
                <div className={field}>
                  <Label className="text-xs">اتاق</Label>
                  <Input dir="ltr" value={createForm.rooms} onChange={(e) => setCreateForm((f) => ({ ...f, rooms: e.target.value }))} className={inputCls} placeholder="2" />
                </div>
                <div className={field}>
                  <Label className="text-xs">طبقه</Label>
                  <Input dir="ltr" value={createForm.floor} onChange={(e) => setCreateForm((f) => ({ ...f, floor: e.target.value }))} className={inputCls} placeholder="3" />
                </div>
                <div className={field}>
                  <Label className="text-xs">سال ساخت</Label>
                  <Input dir="ltr" value={createForm.buildYear} onChange={(e) => setCreateForm((f) => ({ ...f, buildYear: e.target.value }))} className={inputCls} placeholder="1400" />
                </div>
                <div className={field}>
                  <Label className="text-xs">قیمت (تومان)</Label>
                  <Input dir="ltr" inputMode="numeric" value={createForm.price} onChange={(e) => setCreateForm((f) => ({ ...f, price: e.target.value }))} className={inputCls} placeholder="3500000000" />
                </div>
                <div className={field}>
                  <Label className="text-xs">معاوضه</Label>
                  <Select value={createForm.changeWith} onValueChange={(v) => setCreateForm((f) => ({ ...f, changeWith: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CHANGEABLE_WITH.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={field}>
                  <Label className="text-xs">قیمت فایل (نسبت با کارشناسی) *</Label>
                  <Select value={createForm.priceEvaluation} onValueChange={(v) => setCreateForm((f) => ({ ...f, priceEvaluation: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRICE_EVALUATIONS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={field}>
                  <Label className="text-xs">نحوهٔ فایل‌یابی *</Label>
                  <Select value={createForm.fileFinding} onValueChange={(v) => setCreateForm((f) => ({ ...f, fileFinding: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FILE_FINDINGS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={field}>
                  <Label className="text-xs">نوع فایل *</Label>
                  <Select value={createForm.fileType} onValueChange={(v) => setCreateForm((f) => ({ ...f, fileType: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FILE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={field}>
                  <Label className="text-xs">جدیت مشتری *</Label>
                  <Select value={createForm.userSeriousness} onValueChange={(v) => setCreateForm((f) => ({ ...f, userSeriousness: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {USER_SERIOUSNESS.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                onClick={submitCreate}
                disabled={createBusy || !createForm.customerName.trim() || !createForm.customerMobile.trim() || !createForm.areaId || !createForm.lineId || !createForm.address.trim() || !createForm.propertyTypeId || !createForm.meterage.trim()}
                className="w-full gap-1"
              >
                {createBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
                ثبت نهایی آگهی در سامانه ARM (۵ گام)
              </Button>
              {createBusy ? <p className="text-[11px] text-muted-foreground">در حال اجرای زنجیرهٔ ثبت از طریق ترموکس — تا ~۲ دقیقه؛ صفحه را نبندید.</p> : null}
              {createReport ? <StepReport report={createReport} /> : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── تغییر ── */}
        <TabsContent value="update" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">تغییر در کدآگهی موجود (PUT properties/update)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground leading-5">
                بدنهٔ کامل ویرایش از فایل آگهی پیوندخوردهٔ محلی بازسازی می‌شود (عین edit-page خود سامانه) و با پچ‌های شما دوباره به ARM فرستاده می‌شود. اگر کدآگهی فایل پیوندخورده نداشته باشد، ابتدا از مسیر ثبت یا کاشی آگهی پیوندش کنید.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className={field}>
                  <Label className="text-xs">کدآگهی *</Label>
                  <Input dir="ltr" value={updateForm.code} onChange={(e) => setUpdateForm((f) => ({ ...f, code: e.target.value }))} className={inputCls} />
                </div>
                <div className={field}>
                  <Label className="text-xs">قیمت جدید (تومان — خالی = بدون تغییر)</Label>
                  <Input dir="ltr" inputMode="numeric" value={updateForm.price} onChange={(e) => setUpdateForm((f) => ({ ...f, price: e.target.value }))} className={inputCls} placeholder="3600000000" />
                </div>
                <div className={field}>
                  <Label className="text-xs">قیمت فایل (نسبت با کارشناسی)</Label>
                  <Select value={updateForm.priceEvaluation} onValueChange={(v) => setUpdateForm((f) => ({ ...f, priceEvaluation: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRICE_EVALUATIONS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={field}>
                  <Label className="text-xs">جدیت مشتری</Label>
                  <Select value={updateForm.userSeriousness} onValueChange={(v) => setUpdateForm((f) => ({ ...f, userSeriousness: v }))}>
                    <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {USER_SERIOUSNESS.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 flex gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={updateForm.isUrgent} onChange={(e) => setUpdateForm((f) => ({ ...f, isUrgent: e.target.checked }))} className="h-4 w-4 accent-primary" />
                    فوری (urgent)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={updateForm.isLuxury} onChange={(e) => setUpdateForm((f) => ({ ...f, isLuxury: e.target.checked }))} className="h-4 w-4 accent-primary" />
                    لوکس (luxury)
                  </label>
                </div>
              </div>
              <Button onClick={submitUpdate} disabled={updateBusy || !updateForm.code.trim()} className="w-full gap-1">
                {updateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePen className="h-4 w-4" />}
                اعمال تغییرات در خود سامانهٔ ARM
              </Button>
              {updateReport ? <StepReport report={updateReport} /> : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
