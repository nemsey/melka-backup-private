"use client";

/**
 * پنجره «ثبت آگهی» — پیش‌پر کامل فرم ۵ مرحله‌ای ثبت آگهی سامانه آرم از روی آگهی دیوار
 * + تکمیل اطلاعات ناقص توسط کاربر + تأیید نهایی و ثبت خودکار
 */

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UploadCloud, MapPin, User, FileText, ShieldAlert, CheckCircle2 } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { formatToman } from "@/lib/divar/parse";
import type { DivarAdRow } from "./AdCard";

interface RegisterDraft {
  ok: boolean;
  draft: {
    step1_owner: { fullName: string; mobileNumber: string; hint: string };
    step2_location: {
      country: string; state: string; city: string; areaName: string | null; lineName: string | null;
      postalCode: string; address: string; latitude: number | null; longitude: number | null; hint: string;
    };
    step3_transaction: { tradeType: string; propertyType: string; buildingType: string; changeWith: string[]; inputs: Record<string, string> };
    step4_media: { images: string[]; hint: string };
    step5_description: { priceEvaluation: string; fileFinding: string; fileType: string[]; description: string };
  };
  missing: string[];
  requirements: { armToken: boolean; message: string };
  categoryLabel: string;
  scores: { total: number; bucket: string };
}

export function RegisterDialog({
  ad,
  open,
  onOpenChange,
  onRegistered,
}: {
  ad: DivarAdRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRegistered: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<RegisterDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ownerName, setOwnerName] = useState("");
  const [ownerMobile, setOwnerMobile] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!open || !ad) return;
    setLoading(true);
    setError(null);
    setConfirmed(false);
    api<RegisterDraft>(`/api/divar/ads/${ad.token}/register`)
      .then((res) => {
        setDraft(res);
        setOwnerName(res.draft.step1_owner.fullName);
        setOwnerMobile(res.draft.step1_owner.mobileNumber);
        setPostalCode(res.draft.step2_location.postalCode);
        setAddress(res.draft.step2_location.address);
        setPrice(res.draft.step5_description.priceEvaluation);
        setDescription(res.draft.step5_description.description.slice(0, 600));
      })
      .catch((err: ApiClientError) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, ad]);

  const missingCount = useMemo(() => {
    const m: string[] = [];
    if (ownerName.trim().length < 3) m.push("نام مالک");
    if (!/^09\d{9}$/.test(ownerMobile.replace(/\D/g, ""))) m.push("موبایل مالک");
    if (postalCode && postalCode.replace(/\D/g, "").length !== 10) m.push("کد پستی");
    if (!draft?.draft.step2_location.lineName) m.push("محله");
    return m;
  }, [ownerName, ownerMobile, postalCode, draft]);

  const submit = async () => {
    if (!ad || !draft) return;
    if (!confirmed) {
      toast({ title: "تأیید نهایی لازم است", description: "صحت اطلاعات پیش‌پر را بررسی و تیک تأیید را بزنید.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ ok: boolean; message: string }>(`/api/divar/ads/${ad.token}/register`, {
        method: "POST",
        body: {
          owner: { fullName: ownerName.trim(), mobileNumber: ownerMobile.replace(/\D/g, "") },
          postalCode: postalCode.replace(/\D/g, ""),
          address: address.trim(),
          lineId: draft.draft.step2_location.lineName ? undefined : undefined,
          priceEvaluation: price,
          description,
          inputs: draft.draft.step3_transaction.inputs,
        },
      });
      toast({ title: "ثبت موفق", description: res.message });
      onOpenChange(false);
      onRegistered();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ثبت ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UploadCloud className="w-5 h-5 text-primary" aria-hidden /> ثبت آگهی در سامانه آرم
          </DialogTitle>
          <DialogDescription>
            پیش‌پر خودکار از روی آگهی دیوار — اطلاعات ناقص را تکمیل و پس از بازبینی، تأیید نهایی کنید.
          </DialogDescription>
        </DialogHeader>

        {loading && <Skeleton className="h-64 w-full rounded-xl" />}
        {error && (
          <Alert variant="destructive">
            <ShieldAlert className="w-4 h-4" aria-hidden />
            <AlertTitle>آماده‌سازی ناموفق</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {draft && (
          <div className="space-y-4">
            <Alert>
              <CheckCircle2 className="w-4 h-4 text-primary" aria-hidden />
              <AlertTitle className="text-xs">{draft.categoryLabel} — امتیاز {Math.round(draft.scores.total)}</AlertTitle>
              <AlertDescription className="text-xs">{draft.requirements.message}</AlertDescription>
            </Alert>

            {/* گام ۱ — اطلاعات مالک */}
            <section className="rounded-xl border p-4 space-y-3">
              <h4 className="text-sm font-bold flex items-center gap-1.5"><User className="w-4 h-4" aria-hidden /> گام ۱: اطلاعات مالک</h4>
              <p className="text-[11px] text-muted-foreground leading-5">{draft.draft.step1_owner.hint}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-owner-name" className="text-xs">نام و نام خانوادگی مالک *</Label>
                  <Input id="reg-owner-name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="مثال: علی محمدی" className="text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-owner-mobile" className="text-xs">شماره موبایل مالک *</Label>
                  <Input id="reg-owner-mobile" value={ownerMobile} onChange={(e) => setOwnerMobile(e.target.value)} placeholder="۰۹۱۴۱۲۳۴۵۶۷" inputMode="tel" className="text-xs" dir="ltr text-right" />
                </div>
              </div>
            </section>

            {/* گام ۲ — اطلاعات مکانی */}
            <section className="rounded-xl border p-4 space-y-3">
              <h4 className="text-sm font-bold flex items-center gap-1.5"><MapPin className="w-4 h-4" aria-hidden /> گام ۲: اطلاعات مکانی ملک</h4>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="text-[10px]">{draft.draft.step2_location.state}</Badge>
                <Badge variant="secondary" className="text-[10px]">{draft.draft.step2_location.city}</Badge>
                {draft.draft.step2_location.areaName && <Badge className="text-[10px]">منطقه: {draft.draft.step2_location.areaName}</Badge>}
                {draft.draft.step2_location.lineName && <Badge className="text-[10px]">محله: {draft.draft.step2_location.lineName}</Badge>}
              </div>
              <p className="text-[11px] text-muted-foreground leading-5">{draft.draft.step2_location.hint}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="reg-postal" className="text-xs">کد پستی (۱۰ رقم)</Label>
                  <Input id="reg-postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="۵۱۳۳۶۷۵۱۳۴" inputMode="numeric" className="text-xs" dir="ltr text-right" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-address" className="text-xs">آدرس ملک</Label>
                  <Input id="reg-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="خیابان، کوچه، پلاک…" className="text-xs" />
                </div>
              </div>
            </section>

            {/* گام ۳ — اطلاعات معامله (پیش‌پر) */}
            <section className="rounded-xl border p-4 space-y-2">
              <h4 className="text-sm font-bold flex items-center gap-1.5"><FileText className="w-4 h-4" aria-hidden /> گام ۳: اطلاعات معامله (پیش‌پر خودکار)</h4>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px]">معامله: {draft.draft.step3_transaction.tradeType}</Badge>
                <Badge variant="outline" className="text-[10px]">کاربری: {draft.draft.step3_transaction.propertyType}</Badge>
                <Badge variant="outline" className="text-[10px]">ساختمان: {draft.draft.step3_transaction.buildingType}</Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {Object.entries(draft.draft.step3_transaction.inputs).map(([k, v]) => (
                  <span key={k} className="rounded-lg bg-muted/40 px-2.5 py-1.5 flex justify-between gap-1">
                    <span className="text-muted-foreground">{k}:</span>
                    <b>{v || "—"}</b>
                  </span>
                ))}
              </div>
            </section>

            {/* گام ۵ — توضیحات مشاوران */}
            <section className="rounded-xl border p-4 space-y-3">
              <h4 className="text-sm font-bold">گام ۵: قیمت و توضیحات مشاوران</h4>
              <div className="space-y-1.5">
                <Label htmlFor="reg-price" className="text-xs">قیمت پایه (تومان)</Label>
                <Input id="reg-price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="مثال: ۳۵۰۰۰۰۰۰۰۰" inputMode="numeric" className="text-xs" dir="ltr text-right" />
                {price && /^\d+$/.test(price) && <p className="text-[10px] text-muted-foreground">{formatToman(Number(price))}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-desc" className="text-xs">توضیحات (از آگهی دیوار پیش‌پر شده)</Label>
                <textarea
                  id="reg-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full min-h-20 text-xs leading-6 rounded-lg border bg-transparent px-3 py-2 resize-y"
                  maxLength={2000}
                />
              </div>
            </section>

            {missingCount.length > 0 && (
              <Alert variant="destructive">
                <ShieldAlert className="w-4 h-4" aria-hidden />
                <AlertTitle className="text-xs">اطلاعات ناقص</AlertTitle>
                <AlertDescription className="text-xs">{missingCount.join("، ")} — برای ثبت نهایی تکمیل کنید.</AlertDescription>
              </Alert>
            )}

            <label className="flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 accent-primary"
                aria-label="تأیید نهایی صحت اطلاعات"
              />
              <span className="text-xs leading-5">
                صحت اطلاعات پیش‌پر و تکمیل‌شده را بررسی کردم و ثبت نهایی این آگهی در سامانه آرم ملک تبریز را تأیید می‌کنم.
              </span>
            </label>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>انصراف</Button>
          <Button onClick={submit} disabled={submitting || loading || !draft || !draft.requirements.armToken} className="gap-1.5">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <UploadCloud className="w-4 h-4" aria-hidden />}
            ثبت نهایی در آرم
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
