"use client";

/**
 * ContractFileDialog — P6.5-12 (بند ت — مهم‌ترین خواستهٔ مالک)
 * ------------------------------------------------------
 * «فایل قرارداد» هر معامله: سند قرارداد تولیدشده از داده‌های واقعی سامانه‌های
 * ملک تبریز (صورت‌وضعیت ARM + کارگزاری special-properties + رجیستری آگهی/درخواست).
 *
 * فنی: تولید PDF با همان تکنیک خود سامانه ARM («چاپ کارگزاری صادر شده» در
 * arm.melketabriz.ir با html2canvas + jsPDF) — سند HTML فارسی RTL رندر و به
 * PDF واقعی تبدیل می‌شود.
 */

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Printer, Download, FileText, ShieldCheck } from "lucide-react";
import { faAmountFull, faPercent, faNumber, faDate } from "@/lib/format";
import { faDigits } from "@/lib/jalali";

export interface ContractDocParty {
  name: string | null;
  mobile: string | null;
  role: string;
}

export interface ContractDocData {
  txId: string;
  contractDate: string;
  propertyCode: string;
  requestCode: string | null;
  contractHolo: string | null;
  contractType: string | null;
  contractAmount: number | null;
  comisionOfContract?: number | null;
  taxOfContract?: number | null;
  contractText: string | null;
  matchBy: "holo" | "propertyCode" | "requestCode" | null;
  seller: ContractDocParty;
  buyer: ContractDocParty;
  shares: { name: string; unitPercent: number; confirmation: string }[];
  agency: {
    realtorName: string | null;
    creatorName: string | null;
    payPercent: number | null;
    sellPrice: number | null;
    detailsHtml: string[] | null;
    createdAt: string | null;
  } | null;
  property: { title: string | null; address: string | null } | null;
}

function PartyRow({ label, party }: { label: string; party: ContractDocParty }) {
  return (
    <div className="flex-1 rounded-lg border bg-muted/20 p-3">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-medium leading-relaxed">{party.name ?? "—"}</p>
      {party.mobile ? (
        <p className="text-xs text-muted-foreground mt-0.5 font-mono" dir="ltr">{faDigits(party.mobile)}</p>
      ) : null}
    </div>
  );
}

export function ContractFileDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: ContractDocData | null;
}) {
  const { toast } = useToast();
  const docRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const downloadPdf = async () => {
    if (!docRef.current || !data) return;
    setDownloading(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);
      // همان تنظیمات خود سامانه ARM: scale 2 + A3 portrait (شاهد باندل trade-over-view)
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
      pdf.save(`قرارداد-${data.propertyCode}-${data.contractHolo ?? data.txId.slice(-6)}.pdf`);
      toast({ title: "فایل PDF قرارداد دانلود شد" });
    } catch (err) {
      toast({ title: "خطا در تولید PDF", description: (err as Error).message?.slice(0, 80), variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const printDoc = () => {
    if (!docRef.current) return;
    const w = window.open("", "_blank", "width=900,height=650");
    if (!w) return;
    w.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>قرارداد ${data?.propertyCode ?? ""}</title>
<style>body{font-family:Tahoma,'Segoe UI',sans-serif;padding:24px;color:#111}img{max-width:100%}</style></head>
<body>${docRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="flex-row items-center justify-between space-y-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="w-5 h-5 text-teal-600 dark:text-teal-400" aria-hidden />
            فایل قرارداد — ملک {faDigits(data.propertyCode)}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={printDoc}>
              <Printer className="w-4 h-4" aria-hidden /> چاپ
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => void downloadPdf()} disabled={downloading}>
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}
              دانلود PDF
            </Button>
          </div>
        </DialogHeader>

        {/* سند قرارداد — قابل تبدیل به PDF (همان تکنیک چاپ کارگزاری خود سامانه ARM) */}
        <div ref={docRef} className="bg-white text-neutral-900 rounded-xl border p-6 text-[13px] leading-7" dir="rtl">
          {/* سربرگ */}
          <div className="text-center border-b-2 border-neutral-800 pb-3 mb-4">
            <p className="text-lg font-bold">مشاور املاک ملک تبریز</p>
            <p className="text-sm mt-1 font-semibold text-teal-800">
              {data.contractType ? `قرارداد ${data.contractType}` : "سند قرارداد معامله"}
              {data.contractHolo ? ` — شماره هولوگرام ${faDigits(data.contractHolo)}` : ""}
            </p>
          </div>

          {/* مشخصات معامله */}
          <table className="w-full border-collapse text-[12.5px]">
            <tbody>
              <tr className="border-b border-neutral-200">
                <td className="py-1.5 pl-2 font-semibold w-36">تاریخ معامله</td>
                <td className="py-1.5">{faDate(data.contractDate)}</td>
                <td className="py-1.5 pl-2 font-semibold w-28">کد ملک</td>
                <td className="py-1.5 font-mono">{faDigits(data.propertyCode)}</td>
              </tr>
              <tr className="border-b border-neutral-200">
                <td className="py-1.5 pl-2 font-semibold">کد درخواست</td>
                <td className="py-1.5 font-mono">{data.requestCode ? faDigits(data.requestCode) : "—"}</td>
                <td className="py-1.5 pl-2 font-semibold">نوع قرارداد</td>
                <td className="py-1.5">{data.contractType ?? "—"}</td>
              </tr>
              <tr className="border-b border-neutral-200">
                <td className="py-1.5 pl-2 font-semibold">مبلغ قرارداد</td>
                <td className="py-1.5 font-bold">{faAmountFull(data.contractAmount)}</td>
                <td className="py-1.5 pl-2 font-semibold">شماره هولوگرام</td>
                <td className="py-1.5 font-mono">{data.contractHolo ? faDigits(data.contractHolo) : "—"}</td>
              </tr>
              {typeof data.comisionOfContract === "number" && data.comisionOfContract > 0 && (
                <tr className="border-b border-neutral-200">
                  <td className="py-1.5 pl-2 font-semibold">کمیسیون قرارداد</td>
                  <td className="py-1.5">{faAmountFull(data.comisionOfContract)}</td>
                  <td className="py-1.5 pl-2 font-semibold">مالیات</td>
                  <td className="py-1.5">{typeof data.taxOfContract === "number" && data.taxOfContract > 0 ? faAmountFull(data.taxOfContract) : "—"}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* طرفین */}
          <div className="mt-4 flex gap-3 text-neutral-900">
            <div className="flex-1 border border-neutral-300 rounded-lg p-3">
              <p className="font-semibold mb-1">فروشنده / مالک</p>
              <p>{data.seller.name ?? "—"}</p>
              {data.seller.mobile ? <p className="font-mono text-xs mt-0.5" dir="ltr">{faDigits(data.seller.mobile)}</p> : null}
            </div>
            <div className="flex-1 border border-neutral-300 rounded-lg p-3">
              <p className="font-semibold mb-1">خریدار</p>
              <p>{data.buyer.name ?? "—"}</p>
              {data.buyer.mobile ? <p className="font-mono text-xs mt-0.5" dir="ltr">{faDigits(data.buyer.mobile)}</p> : null}
            </div>
          </div>

          {/* ملک */}
          {(data.property?.title || data.property?.address) && (
            <div className="mt-3 border border-neutral-300 rounded-lg p-3">
              <p className="font-semibold mb-1">مشخصات ملک</p>
              {data.property.title ? <p>{data.property.title}</p> : null}
              {data.property.address ? <p className="text-xs mt-0.5 text-neutral-700">{data.property.address}</p> : null}
            </div>
          )}

          {/* تجمیع حق‌السهم مشاوران — با درصد هر مشاور (بند ب) */}
          {data.shares.length > 0 && (
            <div className="mt-3 border border-neutral-300 rounded-lg p-3">
              <p className="font-semibold mb-1.5">تجمیع حق‌السهم مشاوران</p>
              <table className="w-full text-[12px]">
                <tbody>
                  {data.shares.map((s, i) => (
                    <tr key={`${s.name}-${i}`} className="border-b border-neutral-100 last:border-0">
                      <td className="py-1">{faNumber(i + 1)}.</td>
                      <td className="py-1 font-medium">{s.name}</td>
                      <td className="py-1 text-left font-semibold">{faPercent(s.unitPercent)}</td>
                      <td className="py-1 text-left text-[11px] text-neutral-600">
                        {s.confirmation === "confirm" ? "تأیید شده" : "در انتظار تأیید"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* بندهای کارگزاری (عین متن سامانه) */}
          {data.agency?.detailsHtml && data.agency.detailsHtml.length > 0 && (
            <div className="mt-3 border border-neutral-300 rounded-lg p-3">
              <p className="font-semibold mb-1">بندهای کارگزاری صادره {data.agency.realtorName ? `— کارشناس ${data.agency.realtorName}` : ""}</p>
              {data.agency.payPercent ? (
                <p className="mb-1">درصد حق‌الزحمه: {faPercent(data.agency.payPercent)}</p>
              ) : null}
              {data.agency.sellPrice ? (
                <p className="mb-1">قیمت توافقی مبنای درصد: {faAmountFull(data.agency.sellPrice)}</p>
              ) : null}
              <ul className="list-disc pr-5 space-y-1 text-[12.5px]">
                {data.agency.detailsHtml.map((d, i) => (
                  <li key={i} dangerouslySetInnerHTML={{ __html: d.replace(/<b[^>]*>/g, "<strong>").replace(/<\/b>/g, "</strong>") }} />
                ))}
              </ul>
            </div>
          )}

          {/* پاورقی — شفافیت منبع */}
          <div className="mt-4 pt-2 border-t border-neutral-300 text-[10.5px] text-neutral-600 leading-5">
            <p className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-700" aria-hidden />
              این سند از داده‌های واقعی ثبت‌شده در سامانه‌های ملک تبریز (ARM سامانه مدیریت آگهی و درخواست + کارگزاری‌های صادره) تولید شده است
              {data.matchBy === "holo" ? " — تطبیق با قرارداد بر اساس شماره هولوگرام" : data.matchBy === "propertyCode" ? " — تطبیق با قرارداد بر اساس کد ملک" : data.matchBy === "requestCode" ? " — تطبیق با قرارداد بر اساس کد درخواست" : ""}
              {data.agency ? " · شامل بندهای کارگزاری مرتبط با ملک" : ""}
              {" · "}
              تاریخ تولید: {faDate(new Date().toISOString())}
            </p>
          </div>
        </div>

        {/* راهنمای منبع خارج از سند */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px] gap-1">
            <ShieldCheck className="w-3 h-3 text-teal-600" aria-hidden />
            داده‌ها عین سامانه ملک تبریز — بدون تغییر (قانون دادهٔ مقدس)
          </Badge>
          {data.contractType && (
            <Badge variant="outline" className="text-[10px]">نوع: {data.contractType}</Badge>
          )}
          {data.contractAmount !== null && (
            <Badge variant="outline" className="text-[10px]">مبلغ: {faAmountFull(data.contractAmount)}</Badge>
          )}
        </div>
        <Separator className="mt-1" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          تولید PDF با همان تکنیک خود سامانه ملک تبریز (چاپ اسناد از داده‌های ثبت‌شده). اگر مبلغ یا طرفین برای این معامله در سامانه ثبت
          نشده باشد، ستون مربوطه با «—» نمایش داده می‌شود — هیچ داده‌ای جعل نمی‌گردد.
        </p>
      </DialogContent>
    </Dialog>
  );
}
