"use client";

/**
 * دیالوگ «انتقال به CRM» — ثبت گام‌به‌گام فایل در سامانه ARM ملک تبریز
 * ------------------------------------------------------
 * مثل یک کاربر عادی، هیچ گامی دور نمی‌زند:
 *   پیش‌نمایش ۵ گام + جستجوی زنده مالک در آرم (پیش از ایجاد)
 *   → اجرا: اعتبارسنجی → جستجو/ایجاد کاربر مالک → شناسه‌های مکانی → معامله → رسانه → توضیحات → ثبت
 * دکمه دوم: «ثبت به‌عنوان پیش‌نویس» (عین دکمه «پیش نویس» خود سامانه آرم)
 */

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UploadCloud, ShieldAlert, CheckCircle2, XCircle, UserSearch, FileSignature, ScrollText } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faDateTime } from "@/lib/format";
import type { ListingRow } from "@/lib/listing/types";

interface TransferInfo {
  ok: boolean;
  listing: ListingRow;
  readiness: { steps: { step: number; label: string; done: boolean }[]; allDone: boolean };
  customerPreview: { found: boolean; name?: string; id?: string; error?: string } | null;
  lastTransfer: { steps?: TransferStepUI[]; at?: string; failed?: boolean; error?: string; via?: string } | null;
  requirements: { armToken: boolean; message: string };
}

interface TransferStepUI {
  key: string;
  title: string;
  status: "pending" | "done" | "failed" | "skipped";
  detail: string;
}

interface TransferResponse {
  ok: boolean;
  mode: "create" | "draft";
  steps: TransferStepUI[];
  armPropertyId: string | null;
  customerId: string | null;
  customerCreated: boolean;
  message: string;
}

export function CrmTransferDialog({
  listing,
  open,
  onOpenChange,
  onTransferred,
}: {
  listing: ListingRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onTransferred: () => void;
}) {
  const { toast } = useToast();
  const [info, setInfo] = useState<TransferInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState<false | "create" | "draft">(false);
  const [result, setResult] = useState<TransferResponse | null>(null);

  useEffect(() => {
    if (!open || !listing) return;
    setLoading(true);
    setResult(null);
    api<TransferInfo>(`/api/listings/${listing.id}/transfer-crm`)
      .then((res) => setInfo(res))
      .catch((err: ApiClientError) =>
        toast({ title: "آماده‌سازی ناموفق", description: err.message, variant: "destructive" })
      )
      .finally(() => setLoading(false));
  }, [open, listing, toast]);

  const execute = async (mode: "create" | "draft") => {
    if (!listing) return;
    setExecuting(mode);
    try {
      const res = await api<TransferResponse>(`/api/listings/${listing.id}/transfer-crm`, {
        method: "POST",
        body: { mode },
      });
      setResult(res);
      toast({
        title: res.ok ? (mode === "draft" ? "پیش‌نویس در آرم ثبت شد" : "ثبت نهایی انجام شد") : "انتقال ناموفق",
        description: res.message,
        variant: res.ok ? "default" : "destructive",
      });
      if (res.ok) onTransferred();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "انتقال ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setExecuting(false);
    }
  };

  const stepIcon = (status: TransferStepUI["status"]) => {
    if (status === "done") return <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden />;
    if (status === "failed") return <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" aria-hidden />;
    if (status === "skipped") return <XCircle className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />;
    return <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" aria-hidden />;
  };

  const stepsToShow: TransferStepUI[] = result?.steps ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UploadCloud className="w-5 h-5 text-primary" aria-hidden /> انتقال به CRM — ثبت گام‌به‌گام در سامانه آرم
          </DialogTitle>
          <DialogDescription>
            ثبت فایل عین یک کاربر عادی: جستجوی/ایجاد مالک، شناسه‌های منطقه‌بندی، فرم معامله، رسانه و توضیحات — هیچ گامی دور نمی‌زند.
          </DialogDescription>
        </DialogHeader>

        {loading && <Skeleton className="h-72 w-full rounded-xl" />}

        {!loading && info && (
          <div className="space-y-4">
            {/* الزامات */}
            <Alert variant={info.requirements.armToken ? "default" : "destructive"}>
              <ShieldAlert className="w-4 h-4" aria-hidden />
              <AlertTitle className="text-xs">{info.requirements.armToken ? "توکن آرم موجود است" : "توکن آرم موجود نیست"}</AlertTitle>
              <AlertDescription className="text-xs leading-5">{info.requirements.message}</AlertDescription>
            </Alert>

            {/* آمادگی ۵ گام */}
            <section className="rounded-xl border p-4 space-y-2">
              <h4 className="text-sm font-bold flex items-center gap-1.5">
                <ScrollText className="w-4 h-4 text-primary" aria-hidden /> آمادگی اطلاعات ۵ گامی
              </h4>
              <div className="space-y-1">
                {info.readiness.steps.map((s) => (
                  <div key={s.step} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      گام {["۱", "۲", "۳", "۴", "۵"][s.step - 1]}: {s.label}
                    </span>
                    <Badge
                      className={
                        s.done
                          ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 text-[10px]"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px]"
                      }
                    >
                      {s.done ? "کامل" : "ناقص"}
                    </Badge>
                  </div>
                ))}
              </div>
              {!info.readiness.allDone && (
                <p className="text-[10px] text-destructive leading-4">
                  اطلاعات ناقص است — از «جزییات» فایل، گام‌های ناقص را تکمیل کنید و دوباره انتقال را اجرا کنید.
                </p>
              )}
            </section>

            {/* پیش‌نمایش مالک در آرم */}
            <section className="rounded-xl border p-4 space-y-2">
              <h4 className="text-sm font-bold flex items-center gap-1.5">
                <UserSearch className="w-4 h-4 text-primary" aria-hidden /> گام ۱ — جستجوی مالک در سامانه آرم
              </h4>
              {info.customerPreview === null ? (
                <p className="text-xs text-muted-foreground leading-5">
                  {info.listing.customerName} — {info.listing.customerMobile} (در زمان انتقال، ابتدا در آرم جستجو و در صورت نبود، ایجاد می‌شود)
                </p>
              ) : info.customerPreview.error ? (
                <p className="text-xs text-amber-600 dark:text-amber-400 leading-5">جستجو ناموفق بود: {info.customerPreview.error}</p>
              ) : info.customerPreview.found ? (
                <p className="text-xs leading-5">
                  <CheckCircle2 className="w-3.5 h-3.5 inline text-teal-600 dark:text-teal-400" aria-hidden /> کاربر موجود:{" "}
                  <b>{info.customerPreview.name || info.listing.customerName}</b> — مستقیم به آگهی متصل می‌شود (ایجاد کاربر جدید لازم نیست).
                </p>
              ) : (
                <p className="text-xs leading-5">
                  <UserSearch className="w-3.5 h-3.5 inline text-amber-600" aria-hidden /> کاربری با این شماره در آرم نیست — در زمان انتقال، کاربر جدید
                  با نام «{info.listing.customerName}» ایجاد می‌شود (عین فرم خود سامانه).
                </p>
              )}
            </section>

            {/* اجرای انتقال — گزارش گام‌به‌گام زنده */}
            {stepsToShow.length > 0 && (
              <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
                <h4 className="text-sm font-bold flex items-center gap-1.5">
                  <FileSignature className="w-4 h-4 text-primary" aria-hidden /> گزارش اجرای انتقال
                </h4>
                <ol className="space-y-2">
                  {stepsToShow.map((s, i) => (
                    <li key={s.key} className="flex gap-2 items-start">
                      <span className="text-[10px] text-muted-foreground mt-0.5 shrink-0">{["۱", "۲", "۳", "۴", "۵", "۶", "۷"][i] ?? i + 1}.</span>
                      {stepIcon(s.status)}
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-5">{s.title}</p>
                        <p className="text-[11px] text-muted-foreground leading-5 break-words">{s.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                {result?.armPropertyId && (
                  <p className="text-[11px] text-teal-700 dark:text-teal-400 font-bold">
                    شناسه آگهی در آرم: <span dir="ltr" className="font-mono">{result.armPropertyId}</span>
                  </p>
                )}
              </section>
            )}

            {/* انتقال قبلی */}
            {info.lastTransfer?.at && !result && (
              <p className="text-[11px] text-muted-foreground leading-5">
                آخرین انتقال: {faDateTime(info.lastTransfer.at)}
                {info.lastTransfer.via === "file-finder-register" ? " (از مسیر ثبت فایل‌یابی)" : ""}
                {info.lastTransfer.failed ? ` — ناموفق: ${info.lastTransfer.error ?? ""}` : " — موفق"}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={executing !== false}>
            بستن
          </Button>
          {!result?.ok && info && (
            <>
              <Button
                variant="secondary"
                className="gap-1.5"
                onClick={() => void execute("draft")}
                disabled={executing !== false || !info.readiness.allDone || !info.requirements.armToken || Boolean(info.listing.crmTransferredAt)}
              >
                {executing === "draft" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <FileSignature className="w-4 h-4" aria-hidden />}
                ثبت به‌عنوان پیش‌نویس
              </Button>
              <Button
                className="gap-1.5"
                onClick={() => void execute("create")}
                disabled={executing !== false || !info.readiness.allDone || !info.requirements.armToken || Boolean(info.listing.crmTransferredAt)}
              >
                {executing === "create" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <UploadCloud className="w-4 h-4" aria-hidden />}
                {info.listing.crmTransferredAt ? "قبلاً منتقل شده" : "ثبت نهایی در آرم"}
              </Button>
            </>
          )}
          {result?.ok && (
            <Button className="gap-1.5" onClick={() => onOpenChange(false)}>
              <CheckCircle2 className="w-4 h-4" aria-hidden /> تمام
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
