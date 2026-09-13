"use client";

/**
 * پنجره «رد آگهی» — چک‌لیست دلایل احتمالی رد (پیش‌بینی ایجنت) + توضیحات کاربر
 * آگهی هرگز آرشیو نمی‌شود — فقط سیگنال یادگیری ثبت می‌گردد.
 */

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, XCircle, BrainCircuit } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber } from "@/lib/format";
import type { DivarAdRow } from "./AdCard";

interface DetailsResponse {
  predictions: { key: string; title: string; likely: number; hint: string }[];
}

const FALLBACK_REASONS: { key: string; title: string }[] = [
  { key: "broker", title: "آگهی مشاور املاک است (شخصی نیست)" },
  { key: "semi-personal", title: "شخصی‌بودن آگهی قطعی نیست" },
  { key: "no-price", title: "قیمت آگهی درج نشده/قابل استخراج نیست" },
  { key: "overpriced", title: "قیمت بالاتر از بازار است" },
  { key: "location", title: "موقعیت مکانی نامشخص/خارج از محدوده" },
  { key: "not-underpriced", title: "قیمت معمولی است — شکار نمی‌ارزد" },
  { key: "already-sold", title: "ملک قبلاً فروخته/تماس بی‌پاسخ" },
  { key: "condition", title: "وضعیت ساختمان/سند مشکل‌دار" },
  { key: "other", title: "دلیل دیگر (در توضیحات بنویسید)" },
];

export function RejectDialog({
  ad,
  open,
  onOpenChange,
  onRejected,
}: {
  ad: DivarAdRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRejected: () => void;
}) {
  const { toast } = useToast();
  const [reasons, setReasons] = useState<{ key: string; title: string; likely: number }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !ad) return;
    setSelected([]);
    setNote("");
    setLoading(true);
    api<DetailsResponse>(`/api/divar/ads/${ad.token}`)
      .then((res) => {
        const preds = (res.predictions ?? []).map((p) => ({ key: p.key, title: p.title, likely: p.likely }));
        setReasons(preds.length > 0 ? preds : FALLBACK_REASONS.map((r) => ({ ...r, likely: 10 })));
      })
      .catch(() => setReasons(FALLBACK_REASONS.map((r) => ({ ...r, likely: 10 }))))
      .finally(() => setLoading(false));
  }, [open, ad]);

  const toggle = (key: string) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const submit = async () => {
    if (!ad) return;
    if (selected.length === 0) {
      toast({ title: "حداقل یک دلیل انتخاب کنید", description: "این دلایل مبنای یادگیری ایجنت برای عدم تکرار اشتباه‌اند.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ ok: boolean; message: string }>(`/api/divar/ads/${ad.token}/reject`, {
        method: "POST",
        body: { reasons: selected, note: note.trim() || undefined },
      });
      toast({ title: "فایل رد شد", description: res.message });
      onOpenChange(false);
      onRejected();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "رد ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <XCircle className="w-5 h-5 text-rose-600" aria-hidden /> رد آگهی
          </DialogTitle>
          <DialogDescription>
            دلایل رد این فایل را انتخاب کنید — ایجنت با بررسی این موارد، در آینده این اشتباهات را تکرار نمی‌کند. آگهی ردشده هرگز آرشیو نمی‌شود.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border divide-y">
              {reasons.map((r) => (
                <div key={r.key} className="flex items-start gap-3 p-3">
                  <Checkbox
                    id={`reason-${r.key}`}
                    checked={selected.includes(r.key)}
                    onCheckedChange={() => toggle(r.key)}
                    aria-label={r.title}
                  />
                  <div className="grow min-w-0">
                    <Label htmlFor={`reason-${r.key}`} className="text-xs font-medium cursor-pointer leading-5">
                      {r.title}
                    </Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">احتمال از دید ایجنت: {faNumber(r.likely)}٪</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reject-note" className="text-xs">توضیحات دلایل رد (اختیاری)</Label>
              <Textarea
                id="reject-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="مثال: مشاور شناخته‌شده بازار بود؛ قیمت واقعی پایه بالاتر از بازار است…"
                className="min-h-20 text-xs leading-6"
                maxLength={1000}
              />
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <BrainCircuit className="w-3 h-3" aria-hidden />
                این توضیح در حافظه یادگیرنده ایجنت ثبت می‌شود تا آگهی‌های مشابه با دقت بیشتری امتیاز بگیرند.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>انصراف</Button>
          <Button variant="destructive" onClick={submit} disabled={submitting || loading} className="gap-1.5">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <XCircle className="w-4 h-4" aria-hidden />}
            رد و یادگیری
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
