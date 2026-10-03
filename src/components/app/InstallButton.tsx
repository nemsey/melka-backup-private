"use client";

/**
 * دکمهٔ «نصب اپلیکیشن» (P6525 — ثالثاً: «در لینک publish امکان نصب اپلیکیشن نیز ایجاد گردد»)
 * -----------------------------------------------------------------------------
 * اپ از نوع PWA قابل نصب است (manifest + service worker با fetch handler + HTTPS).
 * این دکمه:
 *   • روی کروم/اندروید/ادج/دسکتاپ: رویداد استاندارد beforeinstallprompt را می‌گیرد و
 *     با prompt() دیالوگ نصب بومی مرورگر را باز می‌کند.
 *   • روی iOS/Safari (که beforeinstallprompt ندارد): راهنمای «افزودن به صفحهٔ اصلی»
 *     از منوی اشتراک‌گذاری را نشان می‌دهد.
 *   • وقتی اپ از قبل نصب است (display-mode: standalone) یا نصب ممکن نیست، دکمه مخفی می‌ماند.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Share, PlusSquare, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** تشخیص مستقل iOS (بدون UA-Client-Hints) */
function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1)
  );
}

/** آیا اپ همین حالا در حالت نصب‌شده اجرا می‌شود؟ */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone()) return; // نصب‌شده — دکمه لازم نیست
    const onPrompt = (e: Event) => {
      e.preventDefault(); // جلوگیری از بنر خودکار؛ کنترل با دکمه
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    // iOS رویداد ندارد — راهنمای دستی نشان می‌دهیم (غیرهمگام تا از رندر آبشاری بپرهیزیم)
    const iosCheck = setTimeout(() => {
      if (isIos() && "serviceWorker" in navigator) setVisible(true);
    }, 0);
    // اگر بعد از تعامل کاربر نصب شد، دکمه را بردار
    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      clearTimeout(iosCheck);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const onClick = useCallback(async () => {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setVisible(false);
      setDeferred(null); // رویداد یک‌بارمصرف است
      return;
    }
    if (isIos()) setShowIosHint(true);
  }, [deferred]);

  if (!visible) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-9 border-primary/30 text-primary hover:bg-primary/10"
        onClick={() => void onClick()}
        aria-label="نصب اپلیکیشن ملک تبریز روی این دستگاه"
        title="نصب اپلیکیشن ملک تبریز روی این دستگاه"
        id="pwa-install-button"
      >
        <Download className="w-4 h-4" aria-hidden />
        <span className="hidden sm:inline">نصب اپلیکیشن</span>
      </Button>

      <Dialog open={showIosHint} onOpenChange={setShowIosHint}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" aria-hidden /> نصب روی iPhone و iPad
            </DialogTitle>
            <DialogDescription asChild>
              <ol className="list-decimal ps-5 space-y-2 text-sm leading-relaxed text-muted-foreground">
                <li>
                  دکمهٔ <b className="text-foreground">اشتراک‌گذاری</b> را در نوار پایین سافاری بزنید
                  <Share className="w-4 h-4 inline-block mx-1 text-primary" aria-hidden />
                </li>
                <li>
                  گزینهٔ <b className="text-foreground">افزودن به صفحهٔ اصلی</b> را انتخاب کنید
                  <PlusSquare className="w-4 h-4 inline-block mx-1 text-primary" aria-hidden />
                </li>
                <li>
                  با <b className="text-foreground">افزودن</b> تأیید کنید — آیکون ملک تبریز روی صفحهٔ اصلی نصب می‌شود و اپ تمام‌صفحه (مستقل از مرورگر) باز می‌شود.
                </li>
              </ol>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
