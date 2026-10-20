"use client";

/**
 * InfoButton — دکمهٔ ستون «اطلاعات» + Modal (PN-045 · فاز ۳ — شورا-ن۰۸۹)
 * ---------------------------------------------------------------------------
 * «ستون اطلاعات = پنجره‌ای به دادهٔ خام» — کلیک روی 📋 → فایل کامل همان کد
 * (فیلدهای استاندارد + دادهٔ خام منبع + متادیتا) در modal باز می‌شود.
 *
 * چرا modal، نه inline؟ (بخش ۲.۲ گزارش شورا) اطلاعات کامل طولانی است —
 * inline جدول را نابود می‌کند.
 *
 * واکشی: lazy — فقط هنگام کلیک (GET /api/info/{tenant}/{type}/{code}).
 * فایل هر بار تازه regenerate می‌شود (سرور) — همیشه همگام با DB.
 * Doctrine: no LLM, no cost, read-only.
 */

import { useState } from "react";
import { ClipboardList, Loader2, X, RefreshCw } from "lucide-react";

export interface InfoButtonProps {
  /** 'tabriz' | 'melketun' — tenant همین رندر (پیش‌فرض tabriz — صفر نشت) */
  tenant: "tabriz" | "melketun";
  /** "listing" (فهرست آگهی) | "request" (فهرست درخواست) | … */
  type: "listing" | "request" | "transaction" | "expert";
  /** کد رکورد همان‌طور که در فهرست دیده می‌شود (propertyCode/requestCode) */
  code: string;
}

export function InfoButton({ tenant, type, code }: InfoButtonProps) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadInfo() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/info/${tenant}/${type}/${encodeURIComponent(code)}`);
      if (res.ok) {
        setContent(await res.text());
      } else {
        setError(`دریافت اطلاعات ناموفق بود (HTTP ${res.status}).`);
      }
    } catch {
      setError("خطا در دریافت اطلاعات — ارتباط با سرور برقرار نشد.");
    }
    setLoading(false);
  }

  return (
    <>
      <button
        type="button"
        data-info-button={code}
        onClick={(e) => {
          e.stopPropagation();
          void loadInfo();
        }}
        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sec-m1-700 text-[10px] hover:bg-accent/60 transition-colors"
        title={`اطلاعات کامل ${code} — همهٔ فیلدها + دادهٔ خام منبع`}
      >
        <ClipboardList className="w-3 h-3 shrink-0" aria-hidden />
        نمایش
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
          data-info-modal={code}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-lg bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`اطلاعات کامل ${code}`}
          >
            {/* هدر modal */}
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-sec-m1-700" aria-hidden />
                <h3 className="text-sm font-bold">
                  اطلاعات کامل — {code}
                  <span className="mr-2 text-[10px] font-normal text-muted-foreground">
                    {tenant === "melketun" ? "ملکتون" : "ملک تبریز"}
                  </span>
                </h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent transition-colors"
                  title="بازخوانی تازه از سرور"
                  onClick={() => void loadInfo()}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="w-4 h-4" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent transition-colors"
                  title="بستن"
                  onClick={() => setOpen(false)}
                >
                  <X className="w-4 h-4" aria-hidden />
                </button>
              </div>
            </div>

            {/* بدنه — فایل متنی کامل (RTL متن + خام JSON) */}
            <div className="max-h-[calc(85vh-3rem)] overflow-auto bg-muted/20 p-3">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  در حال تولید فایل اطلاعات از رکورد…
                </div>
              ) : error ? (
                <p className="py-10 text-center text-xs text-destructive">{error}</p>
              ) : (
                <pre
                  className="whitespace-pre-wrap rounded-md bg-card p-3 text-[11px] leading-5"
                  dir="rtl"
                >
                  {content}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
