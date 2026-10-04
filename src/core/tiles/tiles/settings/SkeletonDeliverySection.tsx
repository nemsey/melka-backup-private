"use client";

/**
 * بخش «بستهٔ انتقال ملکا» (P6551 / جلسهٔ فوق‌العادهٔ ۰۳۹ — BLOCK 2.2)
 * ------------------------------------------------------
 * کارت تازه در «تنظیمات عمومی»: چهار دکمهٔ دانلود
 * (مانیفست · سند اسکلت · سورس کامل · نامهٔ بازسازی)
 * + نمایش حجم و تاریخ ساخت هر فایل.
 *
 * سه‌گانهٔ P6550 — قابل انتقال به هر تسک تازه بدون هیچ رجوعی به این نشست:
 *   صفر داده · صفر توکن · صفر رمز (اسکن سه‌مرحله‌ای سبز)
 * دانلود فقط برای مالک سامانه (OWNER-gate در روت).
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, FileText, Archive, ScrollText, ListOrdered, Download, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "@/lib/client/api";
import { useAppStore } from "@/lib/client/store";
import { faDateTime } from "@/lib/format";

type SkeletonFileMeta = {
  key: "manifest" | "skeleton" | "source" | "letter";
  filename: string;
  title: string;
  desc: string;
  size: number;
  md5: string;
  builtAt: string;
};

type SkeletonMeta = { ok: true; package: { title: string; ref: string; policy: string }; files: SkeletonFileMeta[] };

/** قالب بایت فارسی — 474,606 → «۴۶۴ کیلوبایت» */
function faSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const m = bytes / (1024 * 1024);
    return `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(m)} مگابایت`;
  }
  if (bytes >= 1024) {
    return `${new Intl.NumberFormat("fa-IR").format(Math.round(bytes / 1024))} کیلوبایت`;
  }
  return `${new Intl.NumberFormat("fa-IR").format(bytes)} بایت`;
}

const ICONS = { manifest: ListOrdered, skeleton: FileText, source: Archive, letter: ScrollText } as const;

export function SkeletonDeliverySection() {
  const token = useAppStore((s) => s.token);
  const [meta, setMeta] = useState<SkeletonMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<SkeletonMeta>("/api/skeleton/download")
      .then((d) => alive && setMeta(d))
      .catch((e: { status?: number; message?: string }) => {
        if (!alive) return;
        // بستهٔ انتقال فقط برای مالک است — برای سایر نقش‌ها کارت به‌کل نمایش داده نمی‌شود
        if (e?.status === 403) {
          setForbidden(true);
          return;
        }
        setError(e instanceof Error ? e.message : String(e?.message ?? "خطا در خواندن فرادادهٔ بسته"));
      });
    return () => {
      alive = false;
    };
  }, []);

  /** دانلود با توکن نشست → blob → ذخیره */
  const download = useCallback(
    async (file: SkeletonFileMeta) => {
      setDownloading(file.key);
      setDone(null);
      try {
        const res = await fetch(`/api/skeleton/download?file=${file.key}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`دانلود ناموفق بود (کد ${res.status})`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setDone(file.key);
      } catch (e) {
        setError(e instanceof Error ? e.message : "خطای ناشناخته در دانلود");
      } finally {
        setDownloading(null);
      }
    },
    [token]
  );

  // نقش غیرمالک — این بخش مال مالک است (پس از همهٔ هوک‌ها)
  if (forbidden) return null;

  return (
    <Card id="settings-skeleton-delivery">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" aria-hidden /> بستهٔ انتقال ملکا
        </CardTitle>
        <CardDescription>
          سه‌گانهٔ قابل انتقال (سند اسکلت ۲۵ فصلی + سورس کامل بدون داده + نامهٔ بازسازی) — صفر داده · صفر توکن · صفر رمز
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden /> {error}
          </div>
        )}
        {meta ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {meta.files.map((f) => {
              const Icon = ICONS[f.key];
              const busy = downloading === f.key;
              return (
                <div key={f.key} className="rounded-xl border p-4 space-y-2 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-4 h-4 text-primary shrink-0" aria-hidden />
                      <span className="text-sm font-bold truncate">{f.title}</span>
                    </div>
                    {done === f.key ? (
                      <Badge className="gap-1 bg-emerald-600 text-white shrink-0">
                        <CheckCircle2 className="w-3 h-3" aria-hidden /> دریافت شد
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">{faSize(f.size)}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-5">{f.desc}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    <span className="font-mono">{f.filename}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    ساخته‌شده: {faDateTime(f.builtAt)} · md5: <span className="font-mono" dir="ltr">{f.md5.slice(0, 8)}…</span>
                  </p>
                  <Button
                    size="sm"
                    className="gap-2 w-fit"
                    onClick={() => void download(f)}
                    disabled={busy}
                    aria-label={`دانلود ${f.title}`}
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Download className="w-4 h-4" aria-hidden />}
                    {busy ? "در حال دریافت…" : "دانلود"}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : !error ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> در حال خواندن فرادادهٔ بسته…
          </div>
        ) : null}
        <p className="text-[11px] text-muted-foreground leading-5 border-t pt-3">
          مرجع: جلسهٔ فوق‌العادهٔ ۰۳۷ (ساخت) + جلسهٔ فوق‌العادهٔ ۰۳۹ (تحویل) — این بسته به‌گونه‌ای ساخته شده که یک تسک
          تازه بتواند کل ملکا را بدون هیچ رجوعی به این نشست‌ها بازسازی کند. مسیر موازی تحویل: شاخهٔ
          <span className="font-mono" dir="ltr"> skeleton/v1 </span> روی GitHub.
        </p>
      </CardContent>
    </Card>
  );
}
