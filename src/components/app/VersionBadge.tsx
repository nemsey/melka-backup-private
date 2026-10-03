"use client";

/**
 * نشان نسخهٔ زنده — P6519 (BLOCK B شورا: نمایش BUILD_ID در UI)
 * ---------------------------------------------------------------------------
 * فوتر داشبورد نسخهٔ «در حال سرو» را نشان می‌دهد تا مالک با یک نگاه بفهمد
 * کدام بیلد را می‌بیند. زنجیرهٔ مقادیر:
 *   ۱) fetch زندهٔ /api/version (دقیق‌ترین — همان چیزی که سرور اجرا می‌کند)
 *   ۲) fallback: NEXT_PUBLIC_BUILD_ID پخته‌شده در همین باندل
 *   ۳) «نامشخص» — فقط اگر هر دو مسیر شکست بخورند (خودش علامت خطر است)
 */

import { useEffect, useState } from "react";
import { faJalaliShortDateTime } from "@/lib/format";

interface VersionInfo {
  buildId: string;
  env: string;
  source: string;
  builtAt?: string;
  gitSha?: string;
}

const ENV_FA: Record<string, string> = {
  production: "تولید",
  development: "توسعه",
};

export function VersionBadge() {
  const [ver, setVer] = useState<VersionInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/version", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: VersionInfo) => {
        if (alive && j?.buildId) setVer(j);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const inlineBaked = process.env.NEXT_PUBLIC_BUILD_ID; // در build پخته می‌شود
  const buildId = ver?.buildId ?? inlineBaked ?? (failed ? "نامشخص" : "…");
  const envLabel = ver ? (ENV_FA[ver.env] ?? ver.env) : null;
  // تاریخ دقیق ساخت (شمسی) — چرخهٔ ۳ راستی‌آزمایی: شاهد چشمی دوم برای مالک
  const builtFa = ver?.builtAt ? faJalaliShortDateTime(ver.builtAt) : null;
  // راهنمای شناور: تاریخ دقیق ساخت + sha (شاهد کامل برای مالک)
  const tooltip = ver?.builtAt ? `ساخته‌شده: ${ver.builtAt}${ver.gitSha ? ` — کد کامیت: ${ver.gitSha}` : ""}` : undefined;

  return (
    <p className="mt-1" dir="ltr">
      <span dir="rtl">نسخهٔ زندهٔ سامانه: </span>
      <code
        className="font-mono text-[11px] tracking-tight select-all cursor-help"
        data-testid="live-build-id"
        title={tooltip}
      >
        {buildId}
      </code>
      {envLabel ? <span className="text-muted-foreground/70"> ({envLabel})</span> : null}
      {builtFa ? <span className="text-muted-foreground/70"> — </span> : null}
      {builtFa ? <span data-testid="live-built-at">{builtFa}</span> : null}
    </p>
  );
}
