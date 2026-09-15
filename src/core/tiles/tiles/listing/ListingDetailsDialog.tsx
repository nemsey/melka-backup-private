"use client";

/**
 * دیالوگ جزییات فایل آگهی — نمایش کامل ۵ گام + ویرایش فیلدهای ناقص + وضعیت انتقال‌ها
 */

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User, MapPin, FileText, ImagePlus, PenLine, Save, CheckCircle2, XCircle, UploadCloud, Instagram as IgIcon } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faDateTime, faNumber } from "@/lib/format";
import { formatToman } from "@/lib/divar/parse";
import {
  PRICE_EVALUATIONS, DESIRABILITY_LEVELS, USER_SERIOUSNESS, FILE_FINDINGS, SELL_REASONS,
  changeWithLabel, fileTypeLabels, fileFindingLabelOf,
  type ListingRow,
} from "@/lib/listing/types";

interface StepBadgeProps {
  step: number;
  label: string;
  done: boolean;
}

function StepBadge({ step, label, done }: StepBadgeProps) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs rounded-lg border px-2.5 py-1.5">
      <span className="flex items-center gap-1.5">
        {done ? <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden /> : <XCircle className="w-3.5 h-3.5 text-amber-600" aria-hidden />}
        <span className="text-muted-foreground">گام {["۱", "۲", "۳", "۴", "۵"][step - 1]}: {label}</span>
      </span>
      <Badge className={`text-[10px] ${done ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
        {done ? "کامل" : "ناقص"}
      </Badge>
    </div>
  );
}

export function ListingDetailsDialog({
  listing,
  open,
  onOpenChange,
  onChanged,
}: {
  listing: ListingRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [priceEvaluation, setPriceEvaluation] = useState("");
  const [desirabilityLevel, setDesirabilityLevel] = useState("");
  const [fileFinding, setFileFinding] = useState("");
  const [userSeriousness, setUserSeriousness] = useState("");
  const [sellReason, setSellReason] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (!listing) return;
    setCustomerName(listing.customerName ?? "");
    setCustomerMobile(listing.customerMobile ?? "");
    setPostalCode(listing.postalCode ?? "");
    setAddress(listing.address ?? "");
    setFileFinding(listing.fileFinding ?? "");
    setPrice(listing.inputs?.["قیمت"] ?? "");
  }, [listing, open]);

  // برای ویرایش، مقادیر خام id از API جزئیات خوانده می‌شود
  useEffect(() => {
    if (!open || !listing) return;
    api<{ ok: boolean; raw: { priceEvaluation: string | null; desirabilityLevel: string | null; userSeriousness: string | null; sellReason: string | null } }>(
      `/api/listings/${listing.id}`
    )
      .then((res) => {
        setPriceEvaluation(res.raw.priceEvaluation ?? "");
        setDesirabilityLevel(res.raw.desirabilityLevel ?? "");
        setUserSeriousness(res.raw.userSeriousness ?? "");
        setSellReason(res.raw.sellReason ?? "");
      })
      .catch(() => undefined);
  }, [open, listing]);

  if (!listing) return null;

  const save = async () => {
    setSaving(true);
    try {
      const inputs = { ...listing.inputs };
      if (price.trim()) inputs["قیمت"] = price.trim();
      else delete inputs["قیمت"];
      const res = await api<{ ok: boolean; complete: boolean; message: string }>(`/api/listings/${listing!.id}`, {
        method: "PATCH",
        body: {
          customerName,
          customerMobile,
          postalCode,
          address,
          priceEvaluation: priceEvaluation || null,
          desirabilityLevel: desirabilityLevel || null,
          fileFinding: fileFinding || null,
          userSeriousness: userSeriousness || null,
          sellReason: sellReason || null,
          inputs,
        },
      });
      toast({ title: "ذخیره شد", description: res.message });
      onOpenChange(false);
      onChanged();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ذخیره ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">جزییات فایل آگهی — تکمیل گام‌های ناقص</DialogTitle>
          <DialogDescription>اطلاعات کامل ۵ گامی؛ فیلدهای خالی را تکمیل و ذخیره کنید تا فایل برای انتقال به CRM و انتشار اینستاگرام آماده شود.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* پیشرفت ۵ گام */}
          <div className="space-y-1.5">
            {listing.completeness.map((c) => (
              <StepBadge key={c.step} step={c.step} label={c.label} done={c.done} />
            ))}
          </div>

          {/* گام ۱ — ویرایش مالک */}
          <section className="rounded-xl border p-4 space-y-3">
            <h4 className="text-sm font-bold flex items-center gap-1.5"><User className="w-4 h-4 text-primary" aria-hidden /> گام ۱: اطلاعات مالک</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">نام و نام‌خانوادگی مالک</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="text-xs" placeholder="نام مالک" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">شماره موبایل</Label>
                <Input value={customerMobile} onChange={(e) => setCustomerMobile(e.target.value)} className="text-xs" dir="ltr text-right" placeholder="۰۹…" inputMode="tel" />
              </div>
            </div>
            {listing.armCustomerId && (
              <p className="text-[10px] text-teal-700 dark:text-teal-400">کاربر آرم متصل: <span dir="ltr" className="font-mono">{listing.armCustomerId}</span></p>
            )}
          </section>

          {/* گام ۲ — مکان */}
          <section className="rounded-xl border p-4 space-y-3">
            <h4 className="text-sm font-bold flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary" aria-hidden /> گام ۲: اطلاعات مکانی ملک</h4>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              <Badge variant="secondary">تبریز</Badge>
              {listing.areaName && <Badge variant="secondary">منطقه: {listing.areaName}</Badge>}
              {listing.lineName && <Badge>محله: {listing.lineName}</Badge>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">کد پستی</Label>
                <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="text-xs" dir="ltr text-right" placeholder="۱۰ رقم" inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">آدرس</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} className="text-xs" placeholder="آدرس ملک" />
              </div>
            </div>
          </section>

          {/* گام ۳ — معامله (نمایش) */}
          <section className="rounded-xl border p-4 space-y-2">
            <h4 className="text-sm font-bold flex items-center gap-1.5"><FileText className="w-4 h-4 text-primary" aria-hidden /> گام ۳: اطلاعات معامله</h4>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              {listing.tradeTypeName && <Badge variant="outline">{listing.tradeTypeName}</Badge>}
              {listing.buildingTypeName && <Badge variant="outline">{listing.buildingTypeName}</Badge>}
              {listing.propertyTypeName && <Badge variant="outline">{listing.propertyTypeName}</Badge>}
              {changeWithLabel(listing.changeWith).map((c) => (
                <Badge key={c} variant="outline">معاوضه: {c}</Badge>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {Object.entries(listing.inputs).map(([k, v]) => (
                <span key={k} className="rounded-lg bg-muted/40 px-2.5 py-1.5 flex justify-between gap-1">
                  <span className="text-muted-foreground">{k}:</span>
                  <b>{v || "—"}</b>
                </span>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ld-price" className="text-xs">قیمت (تومان)</Label>
              <Input id="ld-price" value={price} onChange={(e) => setPrice(e.target.value)} className="text-xs" dir="ltr text-right" placeholder="۳۵۰۰۰۰۰۰۰۰" inputMode="numeric" />
              {price && /^\d+$/.test(price) && <p className="text-[10px] text-muted-foreground">{formatToman(Number(price))}</p>}
            </div>
          </section>

          {/* گام ۴ — رسانه */}
          <section className="rounded-xl border p-4 space-y-2">
            <h4 className="text-sm font-bold flex items-center gap-1.5"><ImagePlus className="w-4 h-4 text-primary" aria-hidden /> گام ۴: تصاویر و اسناد ملک</h4>
            {listing.images.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {listing.images.slice(0, 8).map((u, i) => (
                   
                  <img key={i} src={u} alt={`تصویر ${faNumber(i + 1)} فایل`} className="rounded-lg border h-20 w-full object-cover" loading="lazy" />
                ))}
                {listing.images.length > 8 && <p className="text-[10px] text-muted-foreground self-center">+{faNumber(listing.images.length - 8)} تصویر دیگر</p>}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">تصویری ثبت نشده — آگهی بدون عکس هم قابل ثبت است.</p>
            )}
            {listing.videos.length > 0 && <p className="text-[10px] text-muted-foreground">{faNumber(listing.videos.length)} ویدیو (برای رییلز اینستاگرام)</p>}
          </section>

          {/* گام ۵ — ویرایش توضیحات */}
          <section className="rounded-xl border p-4 space-y-3">
            <h4 className="text-sm font-bold flex items-center gap-1.5"><PenLine className="w-4 h-4 text-primary" aria-hidden /> گام ۵: توضیحات مشاوران</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">قیمت فایل (نسبت با کارشناسی)</Label>
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
                  <SelectTrigger className="text-xs" aria-label="مطلوبیت"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent>
                    {DESIRABILITY_LEVELS.map((d) => (
                      <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">نحوه فایل‌یابی</Label>
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
                <Label className="text-xs">جدیت مشتری</Label>
                <Select value={userSeriousness} onValueChange={setUserSeriousness}>
                  <SelectTrigger className="text-xs" aria-label="جدیت"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent>
                    {USER_SERIOUSNESS.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
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
            <div className="flex flex-wrap gap-1.5 text-[10px]">
              <Badge variant="outline">وضعیت فایل: {fileTypeLabels(listing.fileType).join("، ") || "—"}</Badge>
              {listing.isLuxury && <Badge variant="outline">لوکس</Badge>}
              {listing.isVacation && <Badge variant="outline">اکازیون</Badge>}
              {listing.isUrgent && <Badge variant="outline">فوری</Badge>}
            </div>
            {listing.description && <p className="text-[11px] text-muted-foreground leading-5 rounded-lg bg-muted/40 p-2.5">{listing.description}</p>}
          </section>

          {/* وضعیت انتقال‌ها */}
          <section className="rounded-xl border p-4 space-y-1.5 text-xs">
            <h4 className="text-sm font-bold mb-1">وضعیت انتقال‌ها</h4>
            <p className="flex items-center gap-1.5">
              {listing.crmTransferredAt ? <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden /> : <UploadCloud className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />}
              CRM (سامانه آرم): {listing.crmTransferredAt ? `منتقل‌شده — ${faDateTime(listing.crmTransferredAt)}` : "منتقل نشده"}
              {listing.armPropertyId && <span dir="ltr" className="font-mono text-[10px]">({listing.armPropertyId.slice(0, 14)}…)</span>}
            </p>
            <p className="flex items-center gap-1.5">
              {listing.instagramPublishedAt ? <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden /> : <IgIcon className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />}
              اینستاگرام: {listing.instagramPublishedAt ? `منتشرشده — ${faDateTime(listing.instagramPublishedAt)}` : "منتشر نشده"}
            </p>
            <p className="text-[10px] text-muted-foreground">ثبت: {faDateTime(listing.createdAt)} — آخرین تغییر: {faDateTime(listing.updatedAt)}</p>
          </section>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>بستن</Button>
          <Button className="gap-1.5" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />}
            ذخیره تغییرات
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
