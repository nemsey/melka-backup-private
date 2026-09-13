"use client";

/**
 * پنجره «جزییات آگهی» — استخراج عین ساختار ثبت آگهی سامانه آرم:
 * مشخصات، توضیحات، تصاویر + تحلیل هوشمند امتیازدهی + پیش‌بینی دلایل احتمالی رد
 */

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, MapPin, Ruler, BedDouble, Building2, TrendingDown, UserCheck, ShieldCheck, AlertTriangle, Sparkles, Copy, Navigation, Layers,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber, faDateTime } from "@/lib/format";
import { formatToman } from "@/lib/divar/parse";
import type { DivarAdRow } from "./AdCard";

interface DetailsResponse {
  ok: boolean;
  ad: {
    token: string;
    title: string;
    description: string | null;
    price: number | null;
    pricePerMeter: number | null;
    meterage: number | null;
    rooms: number | null;
    floor: number | null;
    buildYear: number | null;
    publishedAt: string | null;
    bumpedAt: string | null;
    locationText: string | null;
    matchedAreaName: string | null;
    matchedLineName: string | null;
    scores: { personal: number; underprice: number; location: number; total: number; bucket: string };
    specs: { title: string; value: string }[];
    features: string[];
    images: string[];
    postUrl: string;
    liveAvailable: boolean;
  };
  analysis: {
    personal: { score: number; isBroker: boolean; confidence: string; signals: { key: string; label: string; weight: number; hit: boolean; evidence: string }[] };
    underprice: { score: number; percentBelow: number | null; referencePerMeter: number | null; sampleCount: number; method: string; reason: string; referenceLabel: string };
    location: { score: number; method: string; reason: string; areaName: string | null; lineName: string | null };
  };
  predictions: { key: string; title: string; likely: number; hint: string }[];
}

export function AdDetailsDialog({ ad, open, onOpenChange }: { ad: DivarAdRow | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<DetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ad) return;
    setLoading(true);
    try {
      const res = await api<DetailsResponse>(`/api/divar/ads/${ad.token}`);
      setData(res);
      setError(null);
    } catch (err) {
      const e = err as ApiClientError;
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [ad]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast({ title: "کپی شد", description: `${label} کپی شد.` }),
      () => toast({ title: "کپی ناموفق", variant: "destructive" })
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base leading-relaxed">{data?.ad.title ?? ad?.title ?? "جزییات آگهی"}</DialogTitle>
          <DialogDescription>
            تحلیل کامل فایل — مشخصات عین ساختار ثبت آگهی سامانه آرم + امتیازدهی هوشمند
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="w-4 h-4" aria-hidden />
            <AlertTitle>دریافت جزییات ناموفق</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {data && (
          <div className="space-y-5">
            {/* تصاویر */}
            {data.ad.images.length > 0 && (
              <div>
                <h4 className="text-sm font-bold mb-2 flex items-center gap-1.5"><Layers className="w-4 h-4" aria-hidden /> تصاویر آگهی</h4>
                <Carousel opts={{ align: "start", direction: "rtl" }} className="w-full">
                  <CarouselContent>
                    {data.ad.images.map((img, i) => (
                      <CarouselItem key={i} className="basis-40 sm:basis-52">
                        <img src={img} alt={`تصویر ${i + 1} — ${data.ad.title}`} className="w-full h-32 object-cover rounded-lg border" loading="lazy" />
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  <CarouselPrevious className="right-1" aria-label="قبلی" />
                  <CarouselNext className="left-1" aria-label="بعدی" />
                </Carousel>
              </div>
            )}

            {/* مشخصات — عین فرم ثبت آگهی آرم */}
            <div>
              <h4 className="text-sm font-bold mb-2">مشخصات ملک</h4>
              <div className="rounded-xl border divide-y">
                <div className="grid grid-cols-2 sm:grid-cols-4 text-xs">
                  <div className="p-3 flex items-center gap-2"><Ruler className="w-3.5 h-3.5 text-muted-foreground" aria-hidden /> متراژ: <b>{data.ad.meterage != null ? faNumber(Math.round(data.ad.meterage)) : "—"} متر</b></div>
                  <div className="p-3 flex items-center gap-2"><BedDouble className="w-3.5 h-3.5 text-muted-foreground" aria-hidden /> اتاق: <b>{data.ad.rooms != null ? faNumber(data.ad.rooms) : "—"}</b></div>
                  <div className="p-3 flex items-center gap-2"><Building2 className="w-3.5 h-3.5 text-muted-foreground" aria-hidden /> ساخت: <b>{data.ad.buildYear != null ? faNumber(data.ad.buildYear) : "—"}</b></div>
                  <div className="p-3 flex items-center gap-2"><Navigation className="w-3.5 h-3.5 text-muted-foreground" aria-hidden /> طبقه: <b>{data.ad.floor != null ? faNumber(data.ad.floor) : "—"}</b></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 text-xs">
                  <div className="p-3">قیمت کل: <b className="text-primary">{formatToman(data.ad.price)}</b></div>
                  <div className="p-3">قیمت هر متر: <b>{formatToman(data.ad.pricePerMeter)}</b></div>
                </div>
                {data.ad.specs.filter((s) => !s.title.includes("قیمت")).length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 p-3 text-xs">
                    {data.ad.specs.filter((s) => !s.title.includes("قیمت")).map((s, i) => (
                      <span key={i} className="flex justify-between gap-2 py-0.5">
                        <span className="text-muted-foreground">{s.title}:</span>
                        <b className="truncate">{s.value}</b>
                      </span>
                    ))}
                  </div>
                )}
                {data.ad.features.length > 0 && (
                  <div className="p-3 flex flex-wrap gap-1.5">
                    {data.ad.features.slice(0, 12).map((f, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{f}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* توضیحات */}
            {data.ad.description && (
              <div>
                <h4 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                  توضیحات آگهی‌دهنده
                  <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => copy(data.ad.description!, "توضیحات")} aria-label="کپی توضیحات">
                    <Copy className="w-3 h-3" aria-hidden />
                  </Button>
                </h4>
                <p className="text-xs leading-6 rounded-xl border bg-muted/30 p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">{data.ad.description}</p>
              </div>
            )}

            {/* تحلیل امتیاز */}
            <div>
              <h4 className="text-sm font-bold mb-2 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary" aria-hidden /> تحلیل هوشمند امتیازدهی</h4>
              <div className="space-y-3">
                <div className="rounded-xl border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5" aria-hidden /> شخصی‌بودن: {faNumber(Math.round(data.analysis.personal.score))}٪</span>
                    {data.analysis.personal.isBroker ? (
                      <Badge variant="destructive" className="text-[10px]">مشاور املاک</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] gap-1"><ShieldCheck className="w-3 h-3" aria-hidden /> {data.analysis.personal.confidence === "high" ? "شخصی با اطمینان بالا" : "احتمالاً شخصی"}</Badge>
                    )}
                  </div>
                  <Progress value={data.analysis.personal.score} className="h-1.5" aria-label="امتیاز شخصی بودن" />
                  <p className="text-[11px] text-muted-foreground leading-5">
                    {data.analysis.personal.signals.filter((s) => s.hit).map((s) => `«${s.label}» (${s.evidence})`).join("؛ ") || "هیچ سیگنال متنی قوی یافت نشد."}
                  </p>
                </div>

                <div className="rounded-xl border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5" aria-hidden /> زیرقیمت: {faNumber(Math.round(data.analysis.underprice.score))}٪</span>
                    {data.analysis.underprice.percentBelow != null && (
                      <Badge variant={data.analysis.underprice.percentBelow > 0 ? "default" : "secondary"} className="text-[10px]">
                        {data.analysis.underprice.percentBelow > 0 ? `${faNumber(data.analysis.underprice.percentBelow)}٪ زیر بازار` : `${faNumber(-data.analysis.underprice.percentBelow)}٪ بالای بازار`}
                      </Badge>
                    )}
                  </div>
                  <Progress value={data.analysis.underprice.score} className="h-1.5" aria-label="امتیاز زیر قیمت بودن" />
                  <p className="text-[11px] text-muted-foreground leading-5">{data.analysis.underprice.reason}</p>
                </div>

                <div className="rounded-xl border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" aria-hidden /> مکان: {faNumber(Math.round(data.analysis.location.score))}٪</span>
                    {data.analysis.location.lineName && (
                      <Badge variant="secondary" className="text-[10px]">{data.analysis.location.lineName} — {data.analysis.location.areaName}</Badge>
                    )}
                  </div>
                  <Progress value={data.analysis.location.score} className="h-1.5" aria-label="امتیاز مکان" />
                  <p className="text-[11px] text-muted-foreground leading-5">{data.analysis.location.reason}</p>
                </div>
              </div>
            </div>

            {/* پیش‌بینی دلایل رد */}
            <div>
              <h4 className="text-sm font-bold mb-2 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden /> پیش‌بینی هوشمند دلایل احتمالی رد</h4>
              <div className="rounded-xl border divide-y text-xs">
                {data.predictions.slice(0, 6).map((p) => (
                  <div key={p.key} className="p-2.5 flex items-center justify-between gap-2">
                    <span className="font-medium">{p.title}</span>
                    <span className="text-muted-foreground text-[10px]">احتمال {faNumber(p.likely)}٪ — {p.hint}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground border-t pt-3">
              <span>انتشار واقعی: {data.ad.publishedAt ? faDateTime(data.ad.publishedAt) : "—"}</span>
              <span>{data.ad.liveAvailable ? "جزئیات زنده از دیوار" : "از آخرین اسکن"}</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
