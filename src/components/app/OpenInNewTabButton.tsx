"use client";

/**
 * دکمهٔ «باز کردن در صفحهٔ جدید» (P6526/ث-۲)
 * ---------------------------------------------------------------------------
 * دستور مالک: «لینک preview در زمان باز شدن در صفحهٔ جدید مرورگر باز شود
 * (open new page)». لینک preview اپ را داخل قاب گفت‌وگو (iframe) نشان می‌دهد؛
 * این دکمه تشخیص می‌دهد که اپ داخل قاب است و با یک لمس، همان صفحه را در
 * برگهٔ تازهٔ مرورگر باز می‌کند (window.open با _blank).
 *
 * رفتار:
 *   • خارج از iframe (مرورگر مستقیم/نصب‌شده) → دکمه کاملاً مخفی (صفر شلوغی)
 *   • داخل iframe → دکمهٔ شناور در هدر؛ کلیک = باز شدن همین نشانی در برگهٔ جدید
 *   • اگر popup مسدود بود → پیام راهنما با لینک قابل رونوشت (fallback شفاف)
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Copy, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function OpenInNewTabButton() {
  const { toast } = useToast();
  const [embedded, setEmbedded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // تشخیص قاب: اپ داخل iframe است؟ (پیش‌نمایش داخل چت)
    // غیرهمگام (الگوی اثبات‌شدهٔ P6525 برای دکمهٔ نصب) تا از رندر آبشاری نپرهیم
    const detect = setTimeout(() => {
      try {
        setEmbedded(window.self !== window.top);
      } catch {
        // دسترسی به window.top مسدود شد = داخل قابِ متقاطع است
        setEmbedded(true);
      }
    }, 0);
    return () => clearTimeout(detect);
  }, []);

  const openNew = useCallback(() => {
    const win = window.open(window.location.href, "_blank", "noopener,noreferrer");
    if (!win) {
      // popup مسدود شد — راهنمای شفاف با رونوشت نشانی
      toast({
        title: "باز کردن برگهٔ جدید مسدود شد",
        description:
          "مرورگر اجازهٔ باز کردن برگهٔ تازه را نداد. نشانی زیر را رونوشت کنید و خودتان در برگهٔ جدید باز کنید.",
      });
    }
  }, [toast]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* کلیپ‌بورد در دسترس نیست — بهترین تلاش */
    }
  }, []);

  // خارج از قاب → هیچ چیزی نشان نده (اپ مستقیم/نصب‌شده در حال مشاهده است)
  if (!embedded) return null;

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        onClick={openNew}
        className="gap-1.5 h-9 px-3 text-xs font-bold"
        data-testid="open-in-new-tab"
        aria-label="باز کردن اپلیکیشن در صفحهٔ جدید مرورگر"
        title="این پیش‌نمایش داخل قاب گفت‌وگو است — برای تجربهٔ کامل در برگهٔ تازه باز کنید"
      >
        <ExternalLink className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden />
        <span className="hidden sm:inline">باز کردن در صفحهٔ جدید</span>
        <span className="sm:hidden">صفحهٔ جدید</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void copyLink()}
        className="w-9 h-9 shrink-0"
        aria-label="رونوشت نشانی اپلیکیشن"
      >
        {copied ? (
          <CheckCircle2 className="w-4 h-4 text-teal-600" aria-hidden />
        ) : (
          <Copy className="w-4 h-4 text-muted-foreground" aria-hidden />
        )}
      </Button>
    </div>
  );
}
