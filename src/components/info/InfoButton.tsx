"use client";

/**
 * InfoButton — دکمهٔ ستون «اطلاعات» + سند رسمی (PN-045 · فاز ۳ + PN-047 · گام دوم-۱)
 * ---------------------------------------------------------------------------
 * «ستون اطلاعات = پنجره‌ای به دادهٔ خام» — کلیک روی 📋 → سند کامل همان کد
 * در modal باز می‌شود.
 *
 * PN-047/گام دوم-۱ (دستور مالک: «فایل ایجاد شده در آن زیباسازی شود همانند
 * فایل موجود در فایل قرارداد در فهرست معاملات»): سند ساختاری InfoDoc از
 * ?format=json → قالب رسمی همانند ContractFileDialog:
 *   · سربرگ رسمی (کسب‌وکار + کد هویت کاشی M1…M10 + کد رکورد + تاریخ تولید)
 *   · جدول فیلدهای استاندارد (دو ستون خط‌دار)
 *   · دادهٔ خام منبع (بخش جمع‌شونده)
 *   · متادیتای استخراج + پاورقی شفافیت
 *   · چاپ + دانلود PDF (همان تکنیک فایل قرارداد: html2canvas-pro + jsPDF)
 *   · نمای فایل متنی خام (toggle) — همان فایل شاهد روی دیسک
 *
 * چرا modal، نه inline؟ (بخش ۲.۲ گزارش شورا) اطلاعات کامل طولانی است —
 * inline جدول را نابود می‌کند.
 *
 * واکشی: lazy — فقط هنگام کلیک (GET /api/info/{tenant}/{type}/{code}?format=json).
 * فایل هر بار تازه regenerate می‌شود (سرور) — همیشه همگام با DB.
 * Doctrine: no LLM, no cost, read-only.
 */

import { useRef, useState } from "react";
import { ClipboardList, Loader2, X, RefreshCw, Printer, Download, FileText, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client/api";
import { faDateTime } from "@/lib/format";
import { faDigits } from "@/lib/jalali";

export interface InfoButtonProps {
  /** 'tabriz' | 'melketun' — tenant همین رندر (پیش‌فرض tabriz — صفر نشت) */
  tenant: "tabriz" | "melketun";
  /** "listing" (فهرست آگهی) | "request" (فهرست درخواست) | … */
  type: "listing" | "request" | "transaction" | "expert";
  /** کد رکورد همان‌طور که در فهرست دیده می‌شود (propertyCode/requestCode) */
  code: string;
}

interface InfoDocField {
  label: string;
  value: string;
}

interface InfoDoc {
  ok: true;
  found: boolean;
  tenant: "tabriz" | "melketun";
  type: string;
  code: string;
  /** «M7 · آگهی ملکتون» / «M1 · آگهی ملک تبریز» */
  tileIdentity: string;
  tileCode: string;
  tenantLabel: string;
  generatedAt: string;
  standard: InfoDocField[];
  raw: string | null;
  rawTruncated: boolean;
  meta: InfoDocField[];
  notFoundNote: string | null;
  content: string;
}

/** قالب‌بندی هوشمند مقدار: عدد خالص → ارقام فارسی با کاما · تاریخ ISO → جلالی-فارسی */
function smartValue(v: string): string {
  if (!v) return v;
  // عدد خالص (احتمالاً مبالغ/کدها) → کاما + ارقام فارسی
  if (/^\d{4,}$/.test(v)) return faDigits(v.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
  // تاریخ ISO
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return faDateTime(v);
  return v;
}

const BUSINESS_FA: Record<string, string> = {
  tabriz: "مشاور املاک ملک تبریز",
  melketun: "مشاور املاک ملکتون",
};

export function InfoButton({ tenant, type, code }: InfoButtonProps) {
  const [open, setOpen] = useState(false);
  const [doc, setDoc] = useState<InfoDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRawFile, setShowRawFile] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);

  async function loadInfo() {
    setOpen(true);
    setLoading(true);
    setError(null);
    setShowRawFile(false);
    try {
      const res = await api<InfoDoc>(
        `/api/info/${tenant}/${type}/${encodeURIComponent(code)}?format=json`,
        { timeoutMs: 30_000 }
      );
      setDoc(res);
    } catch {
      setError("خطا در دریافت اطلاعات — ارتباط با سرور برقرار نشد.");
    }
    setLoading(false);
  }

  /** دانلود PDF — همان تکنیک فایل قرارداد (چاپ کارگزاری ARM: html2canvas-pro + jsPDF) */
  async function downloadPdf() {
    if (!docRef.current || !doc) return;
    setDownloading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(docRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const img = canvas.toDataURL("image/png", 1.0);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      let w = pw - 10;
      let h = w / ratio;
      if (h > ph - 10) {
        h = ph - 10;
        w = h * ratio;
      }
      pdf.addImage(img, "PNG", (pw - w) / 2, 5, w, h);
      pdf.save(`اطلاعات-${doc.tileCode}-${doc.code}.pdf`);
    } catch {
      // بی‌صدا — پیام خطا در toast سناریوی سخت‌گیرانه
    } finally {
      setDownloading(false);
    }
  }

  /** چاپ — همان الگوی فایل قرارداد (پنجرهٔ تازه + استایل چاپی) */
  function printDoc() {
    if (!docRef.current) return;
    const w = window.open("", "_blank", "width=900,height=650");
    if (!w) return;
    w.document.write(
      `<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>اطلاعات ${doc?.code ?? ""}</title>
<style>body{font-family:Tahoma,'Segoe UI',sans-serif;padding:24px;color:#111}img{max-width:100%}</style></head>
<body>${docRef.current.innerHTML}</body></html>`
    );
    w.document.close();
    w.focus();
    w.print();
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
        title={`اطلاعات کامل ${code} — سند رسمی + دادهٔ خام منبع`}
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
            className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-lg bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`اطلاعات کامل ${code}`}
          >
            {/* هدر modal — چاپ + دانلود PDF همانند فایل قرارداد */}
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-sec-m1-700" aria-hidden />
                <h3 className="text-sm font-bold">
                  فایل اطلاعات — {doc ? `${doc.tileIdentity}` : code}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                {doc && (
                  <>
                    <button
                      type="button"
                      className={`rounded-md p-1 transition-colors ${showRawFile ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent"}`}
                      title={showRawFile ? "بازگشت به سند رسمی" : "نمایش فایل متنی خام (شاهد دیسک)"}
                      onClick={() => setShowRawFile((v) => !v)}
                    >
                      <FileText className="w-4 h-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="rounded-md p-1 text-muted-foreground hover:bg-accent transition-colors"
                      title="چاپ سند"
                      onClick={printDoc}
                    >
                      <Printer className="w-4 h-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="rounded-md p-1 text-muted-foreground hover:bg-accent transition-colors"
                      title="دانلود PDF"
                      onClick={() => void downloadPdf()}
                      disabled={downloading}
                    >
                      {downloading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground hover:bg-accent transition-colors"
                  title="بازخوانی تازه از سرور"
                  onClick={() => void loadInfo()}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
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

            {/* بدنه */}
            <div className="max-h-[calc(88vh-3rem)] overflow-auto bg-muted/20 p-3">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  در حال تولید فایل اطلاعات از رکورد…
                </div>
              ) : error ? (
                <p className="py-10 text-center text-xs text-destructive">{error}</p>
              ) : doc ? (
                showRawFile ? (
                  /* نمای فایل متنی خام — همان فایل شاهد روی دیسک (toggle) */
                  <pre className="whitespace-pre-wrap rounded-md bg-card p-3 text-[11px] leading-5" dir="rtl">
                    {doc.content}
                  </pre>
                ) : (
                /* ══ سند رسمی زیبا — همانند فایل قرارداد (دستور مالک PN-047) ══ */
                <div ref={docRef} className="bg-white text-neutral-900 rounded-xl border p-6 text-[13px] leading-7" dir="rtl">
                  {/* سربرگ رسمی — کسب‌وکار + هویت کاشی (M1…M10) + کد + تاریخ */}
                  <div className="text-center border-b-2 border-neutral-800 pb-3 mb-4">
                    <p className="text-lg font-bold">{BUSINESS_FA[doc.tenant] ?? doc.tenantLabel}</p>
                    <p className="text-sm mt-1 font-semibold text-teal-800 flex items-center justify-center gap-2 flex-wrap">
                      <span className="inline-block rounded-md border border-teal-700 px-1.5 py-0.5 font-mono text-[11px]" dir="ltr">
                        {doc.tileCode}
                      </span>
                      فایل اطلاعات {doc.tileIdentity}
                    </p>
                    <p className="text-xs mt-1 text-neutral-600">
                      کد: <span className="font-mono font-bold">{faDigits(doc.code)}</span>
                      {" · "}تولید: {faDateTime(doc.generatedAt)}
                    </p>
                  </div>

                  {doc.found ? (
                    <>
                      {/* بخش ۱ — فیلدهای استاندارد: جدول رسمی خط‌دار */}
                      <p className="font-bold mb-1.5 text-[12.5px]">مشخصات کامل رکورد</p>
                      <table className="w-full border-collapse text-[12.5px] mb-3">
                        <tbody>
                          {doc.standard.map((f, i) => (
                            <tr key={`${f.label}-${i}`} className="border-b border-neutral-200">
                              <td className="py-1.5 pl-2 font-semibold w-40 align-top">{f.label}</td>
                              <td className="py-1.5 whitespace-pre-wrap break-words">{smartValue(f.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* بخش ۲ — دادهٔ خام منبع (جمع‌شونده — عین منبع، هرگز تغییر نمی‌کند) */}
                      {doc.raw && (
                        <details className="border border-neutral-300 rounded-lg p-3 mb-3">
                          <summary className="font-semibold cursor-pointer text-[12.5px]">
                            دادهٔ خام منبع (عین منبع — بدون نرمال‌سازی)
                          </summary>
                          <pre className="mt-2 whitespace-pre-wrap text-[10.5px] leading-5 bg-neutral-50 rounded p-2 overflow-x-auto" dir="ltr">
                            {doc.raw}
                            {doc.rawTruncated ? "\n… (برش خورده — سقف ۶۴KB بخش خام)" : ""}
                          </pre>
                        </details>
                      )}

                      {/* بخش ۳ — متادیتای استخراج (provenance سه‌لایه) */}
                      <div className="border border-neutral-300 rounded-lg p-3 mb-3">
                        <p className="font-semibold mb-1 text-[12.5px]">متادیتای استخراج (provenance)</p>
                        <table className="w-full border-collapse text-[11.5px]">
                          <tbody>
                            {doc.meta.map((m, i) => (
                              <tr key={`${m.label}-${i}`} className="border-b border-neutral-100 last:border-0">
                                <td className="py-1 pl-2 font-medium w-36 align-top">{m.label}</td>
                                <td className="py-1 break-all" dir={/^[\x00-\x7F\s.-]+$/.test(m.value) ? "ltr" : "rtl"}>{smartValue(m.value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* پاورقی — شفافیت منبع (همان لحن فایل قرارداد) */}
                      <div className="mt-2 pt-2 border-t border-neutral-300 text-[10.5px] text-neutral-600 leading-5">
                        <p className="flex items-center gap-1 flex-wrap">
                          <ShieldCheck className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden />
                          این سند از داده‌های واقعی ثبت‌شده در {doc.tenantLabel} تولید شده است — مقدار تهی = «— (تهی)»،
                          هیچ عددی ساخته یا تغییر نمی‌کند. این سند شاهد است؛ منبع حقیقت همان پایگاه داده است.
                        </p>
                      </div>
                    </>
                  ) : (
                    /* رکورد یافت نشد — گزارش صادقانه (همان گزارش PN-045) */
                    <div className="text-center py-8 space-y-2">
                      <p className="text-sm font-bold text-neutral-800">رکوردی با این کد پیدا نشد</p>
                      <p className="text-[11px] text-neutral-600 leading-relaxed">
                        {doc.notFoundNote}
                      </p>
                    </div>
                  )}
                </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
