"use client";

/**
 * پنجرهٔ «رد پیشنهاد تطبیق» — PN-028/رابعاً-ج (دستور مالک)
 * ---------------------------------------------------------------------------
 * «کلید رد ... چند مورد گزینه رد پیشنهاد قابل تیم زدن وجود داشته باشد و آخرین
 * گزینه سایر باشد و کاربر دلیل رد پیشنهاد را در آن درج کند تا مغز ملکا دلیل
 * واقعی رد را متوجه شده ... (از گزینه پیشنهادی رد شده بیاموزد، بیاندیشد و
 * منبعد این اشتباه را دوباره تکرار نکند)»
 *
 * چندانتخابی + «سایر» (آخرین گزینه، یادداشت اجباری) — عین الگوی RejectDialog
 * فایل‌یابی. ثبت: POST /api/matching/feedback (سه‌لایهٔ یادگیری).
 */

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, XCircle, BrainCircuit, ShieldCheck } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faDigits } from "@/lib/format";

/** گزینه‌های دلایل رد — عین کلیدهای مجاز API (سایر همیشه آخرین) */
const REJECT_REASONS: { key: string; title: string; hint: string }[] = [
  { key: "price", title: "قیمت با بودجهٔ متقاضی نمی‌خواند", hint: "فاصلهٔ مالی — وزن عامل قیمت در آینده تقویت می‌شود" },
  { key: "geo", title: "منطقهٔ ملک خلاف سلیقهٔ متقاضی است", hint: "وزن عامل مکان تقویت می‌شود" },
  { key: "meterage", title: "متراژ خارج از بازهٔ درخواست است", hint: "وزن عامل متراژ تقویت می‌شود" },
  { key: "type", title: "نوع ملک با خواستهٔ متقاضی فرق دارد", hint: "وزن عامل نوع ملک تقویت می‌شود" },
  { key: "rooms", title: "تعداد اتاق مناسب نیست", hint: "وزن عامل اتاق تقویت می‌شود" },
  { key: "floor", title: "طبقهٔ ملک مناسب نیست", hint: "وزن عامل طبقه تقویت می‌شود" },
  { key: "age", title: "سال ساخت با انتظار متقاضی فاصله دارد", hint: "وزن عامل سال ساخت تقویت می‌شود" },
  { key: "stale", title: "آگهی کهنه است — احتمالاً رفته است", hint: "وزن عامل تازگی تقویت می‌شود" },
  { key: "dealt", title: "ملک قبلاً معامله/رزرو شده است", hint: "سیگنال وضعیت — در آینده دقیق‌تر بررسی می‌شود" },
  { key: "customer", title: "متقاضی از فاز خرید خارج شده است", hint: "سیگنال انسانی سمت تقاضا" },
  { key: "expert", title: "مشکل سمت کارشناس/شعبهٔ طرف مقابل", hint: "وزن عامل اعتبار کارشناس تقویت می‌شود" },
  { key: "other", title: "سایر (دلیل را بنویسید)", hint: "دلیل آزاد — یادداشت اجباری است" },
];

export function MatchRejectDialog({
  open,
  onOpenChange,
  direction,
  listingCode,
  requestCode,
  score,
  factors,
  onRejected,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  direction: "listing_to_request" | "request_to_listing";
  listingCode: string | null;
  requestCode: string | null;
  score: number | null;
  factors: Array<{ factor: string; value: number }>;
  onRejected: () => void;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected([]);
      setNote("");
    }
  }, [open]);

  const toggle = (key: string) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const otherSelected = selected.includes("other");

  const submit = async () => {
    if (selected.length === 0) {
      toast({
        title: "حداقل یک دلیل انتخاب کنید",
        description: "این دلایل سوخت یادگیری مغز ملکا هستند تا در پیشنهادهای آینده تکرار نشوند.",
        variant: "destructive",
      });
      return;
    }
    if (otherSelected && !note.trim()) {
      toast({
        title: "دلیل «سایر» را توضیح دهید",
        description: "برای گزینهٔ سایر، نوشتن دلیل واقعی الزامی است — مغز ملکا از متن دلایل می‌آموزد.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/matching/feedback", {
        method: "POST",
        body: {
          direction,
          listingCode: listingCode ?? undefined,
          requestCode: requestCode ?? undefined,
          reasons: selected,
          note: note.trim() || undefined,
          scoreAtReject: score ?? undefined,
          factors,
        },
      });
      toast({ title: "رد ثبت شد — مغز ملکا آموخت", description: res.message });
      onOpenChange(false);
      onRejected();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ثبت رد ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <XCircle className="w-5 h-5 text-rose-600" aria-hidden /> رد پیشنهاد تطبیق
            {score != null ? <span className="text-[11px] text-muted-foreground font-normal">(امتیاز {faDigits(score.toFixed(2))})</span> : null}
          </DialogTitle>
          <DialogDescription>
            دلایل رد این پیشنهاد را انتخاب کنید — مغز ملکا این دلایل را می‌آموزد: این جفت دیگر هرگز پیشنهاد نمی‌شود و عامل متناظرِ هر دلیل، در وزن‌دهی پیشنهادهای تطبیق آینده تقویت می‌شود.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border divide-y">
            {REJECT_REASONS.map((r, ri) => (
              <div key={r.key} className={`flex items-start gap-3 p-2.5 ${r.key === "other" ? "bg-muted/30" : ""}`}>
                <span
                  className="inline-flex items-center justify-center w-5 h-5 min-w-5 rounded-md bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-[10px] font-bold tabular-nums mt-0.5 shrink-0"
                  aria-label={`دلیل ${faDigits(ri + 1)}`}
                  title={`ردیف ${faDigits(ri + 1)}`}
                >
                  {faDigits(ri + 1)}
                </span>
                <Checkbox
                  id={`match-reason-${r.key}`}
                  checked={selected.includes(r.key)}
                  onCheckedChange={() => toggle(r.key)}
                  aria-label={r.title}
                />
                <div className="grow min-w-0">
                  <Label htmlFor={`match-reason-${r.key}`} className="text-xs font-medium cursor-pointer leading-5">
                    {r.title}
                  </Label>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{r.hint}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="match-reject-note" className="text-xs">
              توضیح دلیل رد {otherSelected ? "(برای «سایر» الزامی)" : "(اختیاری — هرچه دقیق‌تر، یادگیری عمیق‌تر)"}
            </Label>
            <Textarea
              id="match-reject-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: متقاضی فقط برج‌های شمالی را می‌خواهد؛ این ملک اگرچه هم‌منطقه است ولی کوچهٔ فرعی است…"
              className="min-h-20 text-xs leading-6"
              maxLength={1000}
            />
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <BrainCircuit className="w-3 h-3" aria-hidden />
              این دلیل در حافظهٔ یادگیرندهٔ تطبیق ثبت می‌شود و پیشنهادهای مشابه با حساسیت بیشترهایی ارزیابی می‌شوند.
            </p>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/30 p-2.5 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
            <p className="text-[10px] leading-5 text-emerald-800 dark:text-emerald-300">
              هیچ داده‌ای حذف نمی‌شود — رد فقط یک «درس» است: جفت (آگهی × درخواست) از پیشنهادهای آینده کنار می‌رود و عامل متناظر دلیل رد، حساس‌تر می‌شود. تصمیم و اجرا همیشه با مالک است.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>انصراف</Button>
          <Button variant="destructive" onClick={submit} disabled={submitting} className="gap-1.5">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <XCircle className="w-4 h-4" aria-hidden />}
            رد و یادگیری
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
