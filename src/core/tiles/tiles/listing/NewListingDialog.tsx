"use client";

/**
 * دیالوگ «ثبت دستی آگهی» — ویزارد ۵ گامی، عین فرم ثبت آگهی خود سامانه آرم
 * ------------------------------------------------------
 * عنوان‌ها عین خود سامانه:
 *   ۱. اطلاعات مالک — «نام، نام خانوادگی و ...»
 *   ۲. اطلاعات مکانی ملک — «انتخاب استان، شهر و...»
 *   ۳. اطلاعات معامله — «نوع معامله، نوع کاربری و...»
 *   ۴. تصاویر و اسناد ملک — «آپلود تصاویر، ویدیو و...»
 *   ۵. توضیحات مشاوران — «قیمت فایل، وضعیت آن و...»
 * هیچ گامی دور نمی‌زند؛ برای مالک حضوری، همه اطلاعات لازم همان‌جا پرسیده می‌شود.
 */

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User, MapPin, FileText, ImagePlus, PenLine, ChevronRight, ChevronLeft, CheckCircle2, X, Plus, ShieldCheck, Search } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber } from "@/lib/format";
import { formatToman } from "@/lib/divar/parse";
import {
  TRADE_TYPES, PROPERTY_TYPES, BUILDING_TYPES, CHANGEABLE_WITH,
  FILE_FINDINGS, FILE_TYPES, USER_SERIOUSNESS, DESIRABILITY_LEVELS, PRICE_EVALUATIONS, SELL_REASONS,
  toLatinDigits, type ListingValidationError,
} from "@/lib/listing/types";

interface LocationsResponse {
  ok: boolean;
  areas: { id: string; name: string; lines: { id: string; name: string }[] }[];
}

const STEPS = [
  { title: "اطلاعات مالک", subTitle: "نام، نام خانوادگی و ...", icon: User },
  { title: "اطلاعات مکانی ملک", subTitle: "انتخاب استان، شهر و...", icon: MapPin },
  { title: "اطلاعات معامله", subTitle: "نوع معامله، نوع کاربری و...", icon: FileText },
  { title: "تصاویر و اسناد ملک", subTitle: "آپلود تصاویر، ویدیو و...", icon: ImagePlus },
  { title: "توضیحات مشاوران", subTitle: "قیمت فایل، وضعیت آن و...", icon: PenLine },
] as const;

export function NewListingDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [locations, setLocations] = useState<LocationsResponse["areas"]>([]);
  const [armLookup, setArmLookup] = useState<{ found: boolean; name?: string } | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  // گام ۱ — مالک
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  // گام ۲ — مکان
  const [areaId, setAreaId] = useState("");
  const [lineId, setLineId] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  // گام ۳ — معامله
  const [tradeTypeId, setTradeTypeId] = useState("");
  const [buildingTypeId, setBuildingTypeId] = useState("");
  const [propertyTypeId, setPropertyTypeId] = useState("");
  const [changeWith, setChangeWith] = useState<string[]>(["notChangeable"]);
  const [meterage, setMeterage] = useState("");
  const [rooms, setRooms] = useState("");
  const [floor, setFloor] = useState("");
  const [buildYear, setBuildYear] = useState("");
  const [price, setPrice] = useState("");
  // گام ۴ — رسانه
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [newVideoUrl, setNewVideoUrl] = useState("");
  // گام ۵ — توضیحات مشاوران
  const [priceEvaluation, setPriceEvaluation] = useState("");
  const [desirabilityLevel, setDesirabilityLevel] = useState("");
  const [fileFinding, setFileFinding] = useState("officeVisit");
  const [fileType, setFileType] = useState<string[]>(["private"]);
  const [userSeriousness, setUserSeriousness] = useState("");
  const [sellReason, setSellReason] = useState("");
  const [description, setDescription] = useState("");
  const [isLuxury, setIsLuxury] = useState(false);
  const [isVacation, setIsVacation] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [notifyBySms, setNotifyBySms] = useState(false);

  useEffect(() => {
    if (!open) return;
    // بارگذاری تنبلکار منطقه‌بندی آرم
    api<LocationsResponse>("/api/divar/locations")
      .then((res) => setLocations(res.areas))
      .catch(() => setLocations([]));
  }, [open]);

  const selectedArea = useMemo(() => locations.find((a) => a.id === areaId), [locations, areaId]);

  const normMobile = toLatinDigits(customerMobile).replace(/\D/g, "");
  const normPostal = toLatinDigits(postalCode).replace(/\D/g, "");
  const normPrice = toLatinDigits(price).replace(/\D/g, "");
  const normMeterage = toLatinDigits(meterage).replace(/\D/g, "");

  /** اعتبارسنجی گام جاری — عین قواعد فرم آرم */
  const stepErrors = useMemo((): ListingValidationError[] => {
    const errors: ListingValidationError[] = [];
    if (step === 0) {
      if (customerName.trim().length < 3) errors.push({ step: 1, stepTitle: STEPS[0].title, field: "name", message: "نام و نام‌خانوادگی مالک را کامل وارد کنید." });
      if (!/^09\d{9}$/.test(normMobile)) errors.push({ step: 1, stepTitle: STEPS[0].title, field: "mobile", message: "شماره موبایل مالک باید ۱۱ رقم و با ۰۹ شروع شود." });
    }
    if (step === 1) {
      if (!areaId) errors.push({ step: 2, stepTitle: STEPS[1].title, field: "area", message: "منطقه ملک را انتخاب کنید." });
      if (!lineId) errors.push({ step: 2, stepTitle: STEPS[1].title, field: "line", message: "محله ملک را انتخاب کنید." });
      if (address.trim().length < 1) errors.push({ step: 2, stepTitle: STEPS[1].title, field: "address", message: "آدرس ملک را وارد کنید." });
      if (normPostal && normPostal.length !== 10) errors.push({ step: 2, stepTitle: STEPS[1].title, field: "postal", message: "کد پستی ده رقمی را وارد کنید." });
    }
    if (step === 2) {
      if (!tradeTypeId) errors.push({ step: 3, stepTitle: STEPS[2].title, field: "trade", message: "نوع معامله را انتخاب کنید." });
      if (!buildingTypeId) errors.push({ step: 3, stepTitle: STEPS[2].title, field: "building", message: "نوع کاربری را انتخاب کنید." });
      if (!propertyTypeId) errors.push({ step: 3, stepTitle: STEPS[2].title, field: "property", message: "نوع ملک را انتخاب کنید." });
      if (changeWith.length === 0) errors.push({ step: 3, stepTitle: STEPS[2].title, field: "changeWith", message: "حداقل یک مورد باید انتخاب شود." });
      if (changeWith.includes("notChangeable") && changeWith.length > 1)
        errors.push({ step: 3, stepTitle: STEPS[2].title, field: "changeWith", message: "«مایل نیستم» نمی‌تواند با سایر گزینه‌ها، همزمان انتخاب شود." });
      if (!normMeterage) errors.push({ step: 3, stepTitle: STEPS[2].title, field: "meterage", message: "متراژ ملک را وارد کنید." });
    }
    if (step === 4) {
      if (!priceEvaluation) errors.push({ step: 5, stepTitle: STEPS[4].title, field: "priceEval", message: "قیمت فایل (نسبت با قیمت کارشناسی) را انتخاب کنید." });
      if (!fileFinding) errors.push({ step: 5, stepTitle: STEPS[4].title, field: "finding", message: "نحوه فایل‌یابی را انتخاب کنید." });
      if (fileType.length === 0) errors.push({ step: 5, stepTitle: STEPS[4].title, field: "type", message: "حداقل یک نوع فایل انتخاب کنید." });
      if (!userSeriousness) errors.push({ step: 5, stepTitle: STEPS[4].title, field: "seriousness", message: "جدیت مشتری را انتخاب کنید." });
    }
    return errors;
  }, [step, customerName, normMobile, areaId, lineId, address, normPostal, tradeTypeId, buildingTypeId, propertyTypeId, changeWith, normMeterage, priceEvaluation, fileFinding, fileType, userSeriousness]);

  const next = () => {
    if (stepErrors.length > 0) {
      toast({ title: "تکمیل گام الزامی است", description: stepErrors[0].message, variant: "destructive" });
      return;
    }
    setArmLookup(null);
    setStep((s) => Math.min(s + 1, 4));
  };
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  /** جستجوی مالک در آرم (وقتی موبایل معتبر است) — پیش‌نمایش گام ۱ */
  const lookupCustomer = async () => {
    if (!/^09\d{9}$/.test(normMobile)) {
      toast({ title: "شماره نامعتبر", description: "شماره موبایل را کامل وارد کنید.", variant: "destructive" });
      return;
    }
    setLookupBusy(true);
    try {
      const look = await api<{ ok: boolean; found: boolean; name?: string; error?: string }>(`/api/users/lookup?mobile=${normMobile}`);
      setArmLookup({ found: look.found, name: look.name });
      toast({
        title: look.found ? "کاربر در آرم یافت شد" : "کاربر جدید ایجاد می‌شود",
        description: look.found ? `«${look.name ?? customerName}» در سامانه آرم موجود است.` : "این شماره در آرم ثبت نشده — هنگام انتقال به CRM ایجاد می‌شود.",
      });
    } catch (err) {
      const e = err as ApiClientError;
      setArmLookup(null);
      toast({ title: "جستجو ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setLookupBusy(false);
    }
  };

  const submit = async () => {
    if (stepErrors.length > 0) {
      toast({ title: "تکمیل گام ۵ الزامی است", description: stepErrors[0].message, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const inputs: Record<string, string> = { مساحت: normMeterage };
      if (toLatinDigits(rooms).replace(/\D/g, "")) inputs["اتاق"] = toLatinDigits(rooms).replace(/\D/g, "");
      if (toLatinDigits(floor).replace(/[^\d-]/g, "")) inputs["طبقه"] = toLatinDigits(floor).replace(/[^\d-]/g, "");
      if (toLatinDigits(buildYear).replace(/\D/g, "")) inputs["سال ساخت"] = toLatinDigits(buildYear).replace(/\D/g, "");
      if (normPrice) inputs["قیمت"] = normPrice;

      const res = await api<{ ok: boolean; complete: boolean; errors: ListingValidationError[]; message: string }>("/api/listings", {
        method: "POST",
        body: {
          customerName,
          customerMobile: normMobile,
          areaId,
          lineId,
          postalCode: normPostal || null,
          address,
          tradeTypeId,
          buildingTypeId,
          propertyTypeId,
          changeWith,
          inputs,
          images: imageUrls,
          videos: videoUrls,
          priceEvaluation,
          desirabilityLevel: desirabilityLevel || null,
          fileFinding,
          fileType,
          userSeriousness,
          sellReason: sellReason || null,
          description,
          isLuxury,
          isVacation,
          isUrgent,
          notifyBySms,
        },
      });
      toast({ title: "فایل آگهی ثبت شد", description: res.message });
      onOpenChange(false);
      resetAll();
      onCreated();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ثبت ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setStep(0);
    setCustomerName("");
    setCustomerMobile("");
    setAreaId("");
    setLineId("");
    setPostalCode("");
    setAddress("");
    setTradeTypeId("");
    setBuildingTypeId("");
    setPropertyTypeId("");
    setChangeWith(["notChangeable"]);
    setMeterage("");
    setRooms("");
    setFloor("");
    setBuildYear("");
    setPrice("");
    setImageUrls([]);
    setNewImageUrl("");
    setVideoUrls([]);
    setNewVideoUrl("");
    setPriceEvaluation("");
    setDesirabilityLevel("");
    setFileFinding("officeVisit");
    setFileType(["private"]);
    setUserSeriousness("");
    setSellReason("");
    setDescription("");
    setIsLuxury(false);
    setIsVacation(false);
    setIsUrgent(false);
    setNotifyBySms(false);
    setArmLookup(null);
  };

  const toggleChangeWith = (value: string) => {
    setChangeWith((prev) => {
      if (value === "notChangeable") return ["notChangeable"];
      const without = prev.filter((v) => v !== "notChangeable");
      return without.includes(value) ? without.filter((v) => v !== value) : [...without, value];
    });
  };

  const toggleFileType = (value: string) => {
    setFileType((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : (onOpenChange(false), resetAll()))}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <User className="w-5 h-5 text-primary" aria-hidden /> ثبت دستی آگهی — ویزارد ۵ گامی
          </DialogTitle>
          <DialogDescription>برای مالکانی که حضوری درخواست ثبت فایل دارند — عین فرم ثبت آگهی سامانه آرم، بدون دور زدن هیچ گامی.</DialogDescription>
        </DialogHeader>

        {/* نوار گام‌ها */}
        <ol className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="گام‌های ثبت">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const done = i < step;
            return (
              <li key={i} className="flex-1 min-w-24">
                <button
                  type="button"
                  onClick={() => i <= step && setStep(i)}
                  className={`w-full rounded-lg px-2 py-1.5 text-right transition-colors ${
                    active ? "bg-primary/10 border border-primary/30" : done ? "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900" : "bg-muted/40 border border-transparent"
                  } ${i <= step ? "cursor-pointer" : "opacity-50 cursor-default"}`}
                  aria-current={active ? "step" : undefined}
                >
                  <span className="flex items-center gap-1.5">
                    {done ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden /> : <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} aria-hidden />}
                    <span className="text-[10px] font-bold leading-4 truncate">{s.title}</span>
                  </span>
                  <span className="block text-[9px] text-muted-foreground leading-3 truncate">{s.subTitle}</span>
                </button>
              </li>
            );
          })}
        </ol>

        {/* ---------- گام ۱: اطلاعات مالک ---------- */}
        {step === 0 && (
          <section className="rounded-xl border p-4 space-y-3">
            <h4 className="text-sm font-bold flex items-center gap-1.5">
              <User className="w-4 h-4 text-primary" aria-hidden /> اطلاعات مالک
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nl-name" className="text-xs">نام و نام‌خانوادگی مالک *</Label>
                <Input id="nl-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="مثال: علی محمدی" className="text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nl-mobile" className="text-xs">شماره موبایل مالک *</Label>
                <div className="flex gap-1.5">
                  <Input id="nl-mobile" value={customerMobile} onChange={(e) => setCustomerMobile(e.target.value)} placeholder="۰۹۱۴۱۲۳۴۵۶۷" inputMode="tel" className="text-xs" dir="ltr text-right" />
                  <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1 h-9" onClick={() => void lookupCustomer()} disabled={lookupBusy || !/^09\d{9}$/.test(normMobile)} aria-label="جستجوی مالک در سامانه آرم">
                    {lookupBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Search className="w-3.5 h-3.5" aria-hidden />}
                    جستجو در آرم
                  </Button>
                </div>
              </div>
            </div>
            {armLookup && (
              <p className={`text-[11px] leading-5 flex items-center gap-1.5 ${armLookup.found ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}`}>
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden />
                {armLookup.found ? `کاربر «${armLookup.name ?? customerName}» در سامانه آرم موجود است — هنگام انتقال به CRM مستقیم متصل می‌شود.` : "این شماره در آرم ثبت نشده — هنگام انتقال به CRM، کاربر جدید ایجاد می‌شود."}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground leading-4">
              عین فرم آرم: نام و موبایل مالک، پیش‌نیاز گام بعدی است؛ دکمه «بعدی» تا تکمیل این اطلاعات فعال نمی‌شود.
            </p>
          </section>
        )}

        {/* ---------- گام ۲: اطلاعات مکانی ---------- */}
        {step === 1 && (
          <section className="rounded-xl border p-4 space-y-3">
            <h4 className="text-sm font-bold flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-primary" aria-hidden /> اطلاعات مکانی ملک
            </h4>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-[10px]">ایران</Badge>
              <Badge variant="secondary" className="text-[10px]">آذربایجان شرقی</Badge>
              <Badge variant="secondary" className="text-[10px]">تبریز</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">منطقه (منطقه‌بندی آرم) *</Label>
                <Select value={areaId} onValueChange={(v) => { setAreaId(v); setLineId(""); }}>
                  <SelectTrigger className="text-xs" aria-label="انتخاب منطقه"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {locations.map((a) => (
                      <SelectItem key={a.id} value={a.id} className="text-xs">{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">محله *</Label>
                <Select value={lineId} onValueChange={setLineId} disabled={!selectedArea}>
                  <SelectTrigger className="text-xs" aria-label="انتخاب محله"><SelectValue placeholder={selectedArea ? "انتخاب کنید" : "ابتدا منطقه را انتخاب کنید"} /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {(selectedArea?.lines ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nl-postal" className="text-xs">کد پستی (۱۰ رقم)</Label>
                <Input id="nl-postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="۵۱۳۳۶۷۵۱۳۴" inputMode="numeric" className="text-xs" dir="ltr text-right" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nl-address" className="text-xs">آدرس ملک *</Label>
                <Input id="nl-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="خیابان، کوچه، پلاک…" className="text-xs" />
              </div>
            </div>
          </section>
        )}

        {/* ---------- گام ۳: اطلاعات معامله ---------- */}
        {step === 2 && (
          <section className="rounded-xl border p-4 space-y-3">
            <h4 className="text-sm font-bold flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-primary" aria-hidden /> اطلاعات معامله
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">نوع معامله *</Label>
                <Select value={tradeTypeId} onValueChange={setTradeTypeId}>
                  <SelectTrigger className="text-xs" aria-label="نوع معامله"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent>
                    {TRADE_TYPES.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">نوع کاربری *</Label>
                <Select value={buildingTypeId} onValueChange={setBuildingTypeId}>
                  <SelectTrigger className="text-xs" aria-label="نوع کاربری"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent>
                    {BUILDING_TYPES.map((b) => (
                      <SelectItem key={b.id} value={b.id} className="text-xs">{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">نوع ملک *</Label>
                <Select value={propertyTypeId} onValueChange={setPropertyTypeId}>
                  <SelectTrigger className="text-xs" aria-label="نوع ملک"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {PROPERTY_TYPES.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* معاوضه */}
            <div className="space-y-1.5">
              <Label className="text-xs">معاوضه (مایل به تغییر با) *</Label>
              <div className="flex flex-wrap gap-2">
                {CHANGEABLE_WITH.map((c) => (
                  <label key={c.value} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 cursor-pointer hover:bg-accent text-xs">
                    <Checkbox checked={changeWith.includes(c.value)} onCheckedChange={() => toggleChangeWith(c.value)} aria-label={c.label} />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>

            {/* فرم پویا — مشخصات */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="space-y-1">
                <Label htmlFor="nl-meter" className="text-xs">متراژ (متر) *</Label>
                <Input id="nl-meter" value={meterage} onChange={(e) => setMeterage(e.target.value)} placeholder="۱۲۰" inputMode="numeric" className="text-xs" dir="ltr text-right" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nl-rooms" className="text-xs">اتاق</Label>
                <Input id="nl-rooms" value={rooms} onChange={(e) => setRooms(e.target.value)} placeholder="۲" inputMode="numeric" className="text-xs" dir="ltr text-right" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nl-floor" className="text-xs">طبقه</Label>
                <Input id="nl-floor" value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="۳" inputMode="numeric" className="text-xs" dir="ltr text-right" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nl-year" className="text-xs">سال ساخت</Label>
                <Input id="nl-year" value={buildYear} onChange={(e) => setBuildYear(e.target.value)} placeholder="۱۴۰۲" inputMode="numeric" className="text-xs" dir="ltr text-right" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nl-price" className="text-xs">قیمت (تومان)</Label>
                <Input id="nl-price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="۳۵۰۰۰۰۰۰۰۰" inputMode="numeric" className="text-xs" dir="ltr text-right" />
              </div>
            </div>
            {normPrice && <p className="text-[10px] text-muted-foreground">{formatToman(Number(normPrice))}</p>}
          </section>
        )}

        {/* ---------- گام ۴: تصاویر و اسناد ---------- */}
        {step === 3 && (
          <section className="rounded-xl border p-4 space-y-3">
            <h4 className="text-sm font-bold flex items-center gap-1.5">
              <ImagePlus className="w-4 h-4 text-primary" aria-hidden /> تصاویر و اسناد ملک
            </h4>
            <p className="text-[10px] text-muted-foreground leading-4">
              عین فرم آرم: حداکثر ۱۵ تصویر (نخستین = تصویر اصلی)، ۲ ویدیو و ۱۰ سند. نشانی عمومی هر رسانه را وارد کنید؛ در صورت نداشتن عکس، آگهی بدون عکس هم قابل ثبت است.
            </p>

            {/* تصاویر */}
            <div className="space-y-1.5">
              <Label htmlFor="nl-image" className="text-xs">نشانی تصویر (URL عمومی)</Label>
              <div className="flex gap-1.5">
                <Input id="nl-image" value={newImageUrl} onChange={(e) => setNewImageUrl(e.target.value)} placeholder="https://…" dir="ltr" className="text-xs font-mono" />
                <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1 h-9" onClick={() => { if (newImageUrl.trim().startsWith("http") && imageUrls.length < 15) { setImageUrls([...imageUrls, newImageUrl.trim()]); setNewImageUrl(""); } }} disabled={!newImageUrl.trim().startsWith("http") || imageUrls.length >= 15}>
                  <Plus className="w-3.5 h-3.5" aria-hidden /> افزودن
                </Button>
              </div>
              {imageUrls.length > 0 && (
                <ul className="space-y-1.5">
                  {imageUrls.map((u, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg border p-1.5">
                      <span className="text-[10px] text-muted-foreground shrink-0">{faNumber(i + 1)}{i === 0 ? " (اصلی)" : ""}</span>
                      <span dir="ltr" className="text-[10px] font-mono truncate flex-1">{u}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setImageUrls(imageUrls.filter((_, j) => j !== i))} aria-label={`حذف تصویر ${faNumber(i + 1)}`}>
                        <X className="w-3 h-3" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ویدیوها */}
            <div className="space-y-1.5">
              <Label htmlFor="nl-video" className="text-xs">نشانی ویدیو (حداکثر ۲ — برای رییلز اینستاگرام)</Label>
              <div className="flex gap-1.5">
                <Input id="nl-video" value={newVideoUrl} onChange={(e) => setNewVideoUrl(e.target.value)} placeholder="https://…" dir="ltr" className="text-xs font-mono" />
                <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1 h-9" onClick={() => { if (newVideoUrl.trim().startsWith("http") && videoUrls.length < 2) { setVideoUrls([...videoUrls, newVideoUrl.trim()]); setNewVideoUrl(""); } }} disabled={!newVideoUrl.trim().startsWith("http") || videoUrls.length >= 2}>
                  <Plus className="w-3.5 h-3.5" aria-hidden /> افزودن
                </Button>
              </div>
              {videoUrls.length > 0 && (
                <ul className="space-y-1.5">
                  {videoUrls.map((u, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg border p-1.5">
                      <span dir="ltr" className="text-[10px] font-mono truncate flex-1">{u}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setVideoUrls(videoUrls.filter((_, j) => j !== i))} aria-label={`حذف ویدیو ${faNumber(i + 1)}`}>
                        <X className="w-3 h-3" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* ---------- گام ۵: توضیحات مشاوران ---------- */}
        {step === 4 && (
          <section className="rounded-xl border p-4 space-y-3">
            <h4 className="text-sm font-bold flex items-center gap-1.5">
              <PenLine className="w-4 h-4 text-primary" aria-hidden /> توضیحات مشاوران
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">قیمت فایل (نسبت با قیمت کارشناسی) *</Label>
                <Select value={priceEvaluation} onValueChange={setPriceEvaluation}>
                  <SelectTrigger className="text-xs" aria-label="قیمت فایل"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent>
                    {PRICE_EVALUATIONS.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">مطلوبیت فایل</Label>
                <Select value={desirabilityLevel} onValueChange={setDesirabilityLevel}>
                  <SelectTrigger className="text-xs" aria-label="مطلوبیت فایل"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent>
                    {DESIRABILITY_LEVELS.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">نحوه فایل‌یابی *</Label>
                <Select value={fileFinding} onValueChange={setFileFinding}>
                  <SelectTrigger className="text-xs" aria-label="نحوه فایل‌یابی"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent>
                    {FILE_FINDINGS.map((f) => (
                      <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">جدیت مشتری *</Label>
                <Select value={userSeriousness} onValueChange={setUserSeriousness}>
                  <SelectTrigger className="text-xs" aria-label="جدیت مشتری"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent>
                    {USER_SERIOUSNESS.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">دلیل فروش</Label>
                <Select value={sellReason} onValueChange={setSellReason}>
                  <SelectTrigger className="text-xs" aria-label="دلیل فروش"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent className="max-h-56">
                    {SELL_REASONS.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* وضعیت فایل — چندانتخابی */}
            <div className="space-y-1.5">
              <Label className="text-xs">وضعیت فایل *</Label>
              <div className="flex flex-wrap gap-2">
                {FILE_TYPES.map((t) => (
                  <label key={t.value} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 cursor-pointer hover:bg-accent text-xs">
                    <Checkbox checked={fileType.includes(t.value)} onCheckedChange={() => toggleFileType(t.value)} aria-label={t.label} />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>

            {/* برچسب‌ها و اطلاع‌رسانی */}
            <div className="flex flex-wrap gap-3 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox checked={isLuxury} onCheckedChange={(v) => setIsLuxury(v === true)} aria-label="لوکس" /> لوکس است؟
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox checked={isVacation} onCheckedChange={(v) => setIsVacation(v === true)} aria-label="اکازیون" /> اکازیون است؟
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox checked={isUrgent} onCheckedChange={(v) => setIsUrgent(v === true)} aria-label="فوری" /> فوری است؟
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox checked={notifyBySms} onCheckedChange={(v) => setNotifyBySms(v === true)} aria-label="اطلاع‌رسانی با پیامک" /> اطلاع‌رسانی با پیامک
              </label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nl-desc" className="text-xs">توضیحات مشاوران</Label>
              <textarea
                id="nl-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full min-h-24 text-xs leading-6 rounded-lg border bg-transparent px-3 py-2 resize-y"
                placeholder="توضیحات فایل — مثل: دارای ویو ابدی، دو پارکینیگ، سند تک‌برگ…"
                maxLength={2000}
              />
            </div>
          </section>
        )}

        {/* خطاهای گام */}
        {stepErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle className="text-xs">تکمیل گام {faNumber(step + 1)} الزامی است</AlertTitle>
            <AlertDescription className="text-xs">{stepErrors.map((e) => e.message).join("؛ ")}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={prev} disabled={step === 0 || submitting} className="gap-1">
              <ChevronRight className="w-4 h-4" aria-hidden /> قبلی
            </Button>
            <span className="text-[10px] text-muted-foreground">گام {faNumber(step + 1)} از ۵</span>
          </div>
          <div className="flex items-center gap-2">
            {step < 4 ? (
              <Button type="button" onClick={next} disabled={stepErrors.length > 0} className="gap-1">
                بعدی <ChevronLeft className="w-4 h-4" aria-hidden />
              </Button>
            ) : (
              <Button type="button" onClick={() => void submit()} disabled={submitting || stepErrors.length > 0} className="gap-1">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CheckCircle2 className="w-4 h-4" aria-hidden />}
                ثبت فایل آگهی
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
