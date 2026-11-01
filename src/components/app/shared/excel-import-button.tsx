"use client";

/**
 * دکمهٔ «بارگذاری اکسل» — مؤلفهٔ مشترک چهار کاشی فهرست (PN-003 گام ۴-۲)
 * ------------------------------------------------------
 * «قابلیت آپلود اطلاعات کل فهرست به صورت فایل اکسل» — دستور مالک ۱۴۰۵/۰۷/۱۴.
 *
 * جریان: انتخاب فایل .xlsx → POST /api/crm/import/{entity} (multipart) →
 * گزارش شفاف: ایجادشده / بروزرسانی‌شده / نادیده + خطاها (حداکثر ۱۲ مورد).
 * فایل قالب همان خروجی «اکسل کل فهرست» است (رفت و برگشت کامل).
 */

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload } from "lucide-react";
import { apiUpload, ApiClientError } from "@/lib/client/api";
import { useToast } from "@/hooks/use-toast";
import { faNumber } from "@/lib/format";

interface ExcelImportButtonProps {
  /** موجودیت مسیر ایمپورت: listings | requests | transactions | experts */
  entity: "listings" | "requests" | "transactions" | "experts";
  /** برچسب دکمه (پیش‌فرض: بارگذاری اکسل) */
  label?: string;
  /** کوچک‌تر (کنار عنوان فهرست) */
  compact?: boolean;
  /** تازه‌سازی داده‌های صفحه پس از ایمپورت موفق */
  onImported?: () => void;
  /** PN-051 (دستور شورا ۱۴۰۵/۰۸/۰۲) — tenant همین فهرست: 'melketun' ⇒ ملکتون؛
   *  رکوردهای تازه در همان داشبوردِ فهرستِ بارگذاری‌شده ثبت می‌شوند */
  tenantId?: "tabriz" | "melketun";
}

interface ImportResponse {
  ok: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  fileName: string;
}

export function ExcelImportButton({ entity, label = "بارگذاری اکسل", compact = false, onImported, tenantId }: ExcelImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const pick = () => inputRef.current?.click();

  const upload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast({
        title: "فرمت فایل نامعتبر",
        description: "فقط فایل اکسل با پسوند xlsx پذیرفته می‌شود.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const q = tenantId === "melketun" ? "?tenantId=melketun" : "";
      const res = await apiUpload<ImportResponse>(`/api/crm/import/${entity}${q}`, file);
      const detail =
        `از ${faNumber(res.total)} ردیف — ${faNumber(res.created)} ایجاد، ${faNumber(res.updated)} بروزرسانی، ${faNumber(res.skipped)} نادیده` +
        (res.errors.length > 0 ? ` · ${faNumber(res.errors.length)} خطا (نمونه: ${res.errors[0]})` : "");
      toast({
        title: "بارگذاری اکسل کامل شد",
        description: detail,
      });
      onImported?.();
    } catch (err) {
      const e = err as ApiClientError;
      toast({
        title: "بارگذاری اکسل ناموفق",
        description: e instanceof ApiClientError ? e.message : "خطای نامشخص در بارگذاری فایل.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        aria-label="انتخاب فایل اکسل برای بارگذاری"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={`gap-1.5 ${compact ? "h-7 text-[11px]" : ""}`}
        onClick={pick}
        disabled={busy}
        aria-label="بارگذاری اطلاعات کل فهرست از فایل اکسل"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Upload className="w-3.5 h-3.5" aria-hidden />}
        {busy ? "در حال بارگذاری…" : label}
      </Button>
    </>
  );
}
