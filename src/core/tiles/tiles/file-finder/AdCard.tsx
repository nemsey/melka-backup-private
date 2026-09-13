"use client";

/**
 * کارت فایل (آگهی دیوار) — چهار کلید اختصاصی:
 * ۱. پل به دیوار  ۲. جزییات آگهی  ۳. رد آگهی  ۴. ثبت آگهی
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ExternalLink, Info, XCircle, UploadCloud, MapPin, Ruler, BedDouble, Building2, TrendingDown, UserCheck, Loader2, Image as ImageIcon, Briefcase, ShieldCheck,
} from "lucide-react";
import { faNumber, faDateTime } from "@/lib/format";
import { formatToman } from "@/lib/divar/parse";

export interface DivarAdRow {
  token: string;
  category: string;
  title: string;
  price: number | null;
  priceText: string | null;
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
  personalScore: number;
  underpriceScore: number;
  locationScore: number;
  totalScore: number;
  bucket: string;
  /** نوع آگهی‌دهنده — برچسب زیر نقشه دیوار (personal | agent | department | business | null=نامشخص) */
  publisherType: string | null;
  publisherName: string | null;
  images: string[];
}

/** برچسب/سبک نوع آگهی‌دهنده — هم‌خانواده پالت زمرد/کهربای پروژه */
const PUBLISHER_CHIPS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }> = {
  personal: { label: "شخصی (مالک)", icon: ShieldCheck, cls: "text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800" },
  agent: { label: "مشاور املاک", icon: Briefcase, cls: "text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800" },
  department: { label: "دپارتمان املاک", icon: Briefcase, cls: "text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800" },
  business: { label: "کسب‌وکار املاک", icon: Briefcase, cls: "text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-800" },
};

const CATEGORY_LABELS: Record<string, string> = {
  "apartment-sell": "فروش آپارتمان",
  "house-villa-sell": "فروش خانه و ویلا",
  "plot-old": "کلنگی",
  "presell": "پیش‌فروش",
  "office-sell": "فروش اداری",
  "shop-sell": "فروش مغازه",
  "commercial-sell": "فروش تجاری",
  "industry-agriculture-business-sell": "صنعتی/کشاورزی",
  "apartment-rent": "اجاره آپارتمان",
  "house-villa-rent": "اجاره خانه و ویلا",
  "office-rent": "اجاره اداری",
  "shop-rent": "اجاره مغازه",
  "commercial-rent": "اجاره تجاری",
};

const BUCKET_STYLES: Record<string, { label: string; badge: "default" | "secondary" | "destructive" | "outline"; ring: string }> = {
  hunt: { label: "شکار", badge: "default", ring: "ring-2 ring-emerald-500/60" },
  follow: { label: "پیگیری", badge: "secondary", ring: "ring-2 ring-amber-500/40" },
  review: { label: "بررسی", badge: "outline", ring: "" },
};

function ScoreBar({ label, value, icon: Icon, tone }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone: string }) {
  return (
    <div className="flex items-center gap-2 min-w-[7.5rem] grow">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
      <div className="grow space-y-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className={`text-xs font-bold ${tone}`}>{faNumber(Math.round(value))}٪</span>
        </div>
        <Progress value={value} className="h-1.5" aria-label={`${label}: ${value} درصد`} />
      </div>
    </div>
  );
}

export function AdCard({
  ad,
  showScores,
  busyAction,
  onDetails,
  onReject,
  onRegister,
}: {
  ad: DivarAdRow;
  showScores: boolean;
  busyAction: string | null;
  onDetails: (ad: DivarAdRow) => void;
  onReject: (ad: DivarAdRow) => void;
  onRegister: (ad: DivarAdRow) => void;
}) {
  const bucketStyle = BUCKET_STYLES[ad.bucket] ?? BUCKET_STYLES.review;
  const publisherChip = ad.publisherType ? PUBLISHER_CHIPS[ad.publisherType] ?? null : null;
  const PublisherIcon = publisherChip?.icon;
  const busy = busyAction === ad.token;
  return (
    <article className={`rounded-xl border bg-card p-4 space-y-3 ${bucketStyle.ring}`} aria-label={`فایل ${ad.title}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 grow space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={bucketStyle.badge}>{bucketStyle.label} — {faNumber(Math.round(ad.totalScore))} امتیاز</Badge>
            <Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[ad.category] ?? ad.category}</Badge>
            {publisherChip && PublisherIcon && (
              <Badge
                variant="outline"
                className={`text-[10px] gap-1 ${publisherChip.cls}`}
                title={ad.publisherName ? `آگهی‌دهنده: ${ad.publisherName}` : "برچسب رسمی دیوار زیر نقشه آگهی"}
              >
                <PublisherIcon className="w-3 h-3" aria-hidden />
                {publisherChip.label}
              </Badge>
            )}
            {ad.bumpedAt && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400" title="این آگهی نردبان شده — زمان واقعی انتشار در جزئیات بررسی می‌شود">
                نردبان‌شده
              </span>
            )}
          </div>
          <h3 className="text-sm font-bold leading-relaxed line-clamp-2">{ad.title}</h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {ad.matchedLineName ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" aria-hidden />
                {ad.matchedLineName}
                {ad.matchedAreaName ? ` (${ad.matchedAreaName})` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground/70">
                <MapPin className="w-3.5 h-3.5" aria-hidden /> مکان نامشخص
              </span>
            )}
            {ad.meterage != null && (
              <span className="inline-flex items-center gap-1">
                <Ruler className="w-3.5 h-3.5" aria-hidden /> {faNumber(Math.round(ad.meterage))} متر
              </span>
            )}
            {ad.rooms != null && (
              <span className="inline-flex items-center gap-1">
                <BedDouble className="w-3.5 h-3.5" aria-hidden /> {faNumber(ad.rooms)} خواب
              </span>
            )}
            {ad.buildYear != null && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" aria-hidden /> ساخت {faNumber(ad.buildYear)}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-bold text-primary">{ad.price != null ? formatToman(ad.price) : "توافقی/اجاره"}</span>
            {ad.pricePerMeter != null && (
              <span className="text-muted-foreground">هر متر: {formatToman(ad.pricePerMeter)}</span>
            )}
          </div>
          {ad.publishedAt && (
            <p className="text-[10px] text-muted-foreground">انتشار واقعی: {faDateTime(ad.publishedAt)}</p>
          )}
        </div>
        {ad.images[0] ? (
          <img
            src={ad.images[0]}
            alt={`تصویر آگهی ${ad.title}`}
            className="w-20 h-20 rounded-lg object-cover border shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="w-20 h-20 rounded-lg border bg-muted/40 flex items-center justify-center shrink-0" aria-hidden>
            <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
          </div>
        )}
      </div>

      {showScores && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t">
          <ScoreBar label="شخصی‌بودن" value={ad.personalScore} icon={UserCheck} tone={ad.personalScore >= 60 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"} />
          <ScoreBar label="زیرقیمت" value={ad.underpriceScore} icon={TrendingDown} tone={ad.underpriceScore >= 70 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"} />
          <ScoreBar label="مکان" value={ad.locationScore} icon={MapPin} tone={ad.locationScore >= 70 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"} />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" asChild>
          <a
            href={`https://divar.ir/v/${encodeURIComponent(ad.title.replace(/\s+/g, "-").slice(0, 50))}/${ad.token}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`پل به دیوار — باز کردن آگهی ${ad.title}`}
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden /> پل به دیوار
          </a>
        </Button>
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => onDetails(ad)} aria-label="جزییات آگهی با تحلیل امتیاز">
          <Info className="w-3.5 h-3.5" aria-hidden /> جزییات آگهی
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-rose-600 hover:text-rose-700 border-rose-200 dark:border-rose-900" onClick={() => onReject(ad)} disabled={busy} aria-label="رد آگهی با چک‌لیست دلایل">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <XCircle className="w-3.5 h-3.5" aria-hidden />} رد آگهی
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => onRegister(ad)} disabled={busy} aria-label="ثبت آگهی در سامانه آرم">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <UploadCloud className="w-3.5 h-3.5" aria-hidden />} ثبت آگهی
        </Button>
      </div>
    </article>
  );
}
