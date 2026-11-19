"use client";

/**
 * کارت فایل (آگهی دیوار) — چهار کلید اختصاصی:
 * ۱. پل به دیوار  ۲. جزییات آگهی  ۳. رد آگهی  ۴. ثبت آگهی
 * شمارة ردیف هر فایل در سربرگ کارت می‌آید (قانون مالک: هر فهرستی شماره‌دار است).
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ExternalLink, Info, XCircle, UploadCloud, MapPin, Ruler, BedDouble, Building2, TrendingDown, UserCheck, Loader2, Image as ImageIcon, Briefcase, ShieldCheck, Sparkles,
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
  otherScore: number;
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
  personal: { label: "شخصی (مالک)", icon: ShieldCheck, cls: "text-teal-700 dark:text-teal-400 border-teal-300 dark:border-teal-800" },
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

const BUCKET_STYLES: Record<string, { label: string; chip: string; ring: string }> = {
  hunt: {
    label: "شکار",
    chip: "bg-gradient-to-l from-teal-600 to-cyan-500 text-white shadow-sm shadow-teal-600/30",
    ring: "ring-2 ring-teal-500/60 border-teal-200/70 dark:border-teal-900/60",
  },
  follow: {
    label: "پیگیری",
    chip: "bg-gradient-to-l from-amber-600 to-amber-500 text-white shadow-sm shadow-amber-600/30",
    ring: "ring-2 ring-amber-500/40 border-amber-200/70 dark:border-amber-900/60",
  },
  review: { label: "بررسی", chip: "bg-muted text-muted-foreground border", ring: "" },
};

/** رنگ اختصاصی چهار معیار — پالت زمرد/کهربا/رز/فیروزه (بدون آبی/بنفش) */
const CRITERION_TONES: Record<string, { track: string; bar: string; text: string; icon: string }> = {
  personal: {
    track: "bg-teal-500/15",
    bar: "bg-gradient-to-l from-teal-600 to-cyan-500",
    text: "text-teal-700 dark:text-teal-400",
    icon: "text-teal-600 dark:text-teal-400",
  },
  underprice: {
    track: "bg-amber-500/15",
    bar: "bg-gradient-to-l from-amber-600 to-amber-400",
    text: "text-amber-700 dark:text-amber-400",
    icon: "text-amber-600 dark:text-amber-400",
  },
  other: {
    track: "bg-rose-500/15",
    bar: "bg-gradient-to-l from-rose-600 to-rose-400",
    text: "text-rose-700 dark:text-rose-400",
    icon: "text-rose-600 dark:text-rose-400",
  },
  location: {
    track: "bg-teal-500/15",
    bar: "bg-gradient-to-l from-teal-600 to-cyan-500",
    text: "text-teal-700 dark:text-teal-400",
    icon: "text-teal-600 dark:text-teal-400",
  },
};

function ScoreBar({ label, value, icon: Icon, tone }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone: string }) {
  const t = CRITERION_TONES[tone] ?? CRITERION_TONES.personal;
  return (
    <div className="flex items-center gap-2 min-w-[7.5rem] grow">
      <Icon className={`w-3.5 h-3.5 shrink-0 ${t.icon}`} aria-hidden />
      <div className="grow space-y-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className={`text-xs font-bold ${t.text}`}>{faNumber(Math.round(value))}٪</span>
        </div>
        <Progress value={value} className={`h-1.5 ${t.track}`} indicatorClassName={t.bar} aria-label={`${label}: ${value} درصد`} />
      </div>
    </div>
  );
}

export function AdCard({
  ad,
  index,
  showScores,
  busyAction,
  onDetails,
  onReject,
  onRegister,
}: {
  ad: DivarAdRow;
  /** شمارة ردیف فایل در فهرست — یک‌مبنا، با ارقام فارسی نمایش داده می‌شود */
  index: number;
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
    <article className={`rounded-xl border bg-card p-4 space-y-3 shadow-sm shadow-black/5 ${bucketStyle.ring}`} aria-label={`فایل شمارة ${faNumber(index)} — ${ad.title}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 grow space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded-lg bg-gradient-to-b from-primary/15 to-primary/5 border border-primary/20 text-xs font-extrabold text-primary tabular-nums"
              title={`ردیف ${faNumber(index)}`}
              aria-label={`ردیف ${faNumber(index)}`}
            >
              {faNumber(index)}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 h-6 text-[11px] font-bold ${bucketStyle.chip}`}>
              {bucketStyle.label} — {faNumber(Math.round(ad.totalScore))} امتیاز
            </span>
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
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-2 py-0.5 font-extrabold text-primary">
              {ad.price != null ? formatToman(ad.price) : "توافقی/اجاره"}
            </span>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 pt-1 border-t">
          <ScoreBar label="شخصی‌بودن" value={ad.personalScore} icon={UserCheck} tone="personal" />
          <ScoreBar label="زیرقیمت" value={ad.underpriceScore} icon={TrendingDown} tone="underprice" />
          <ScoreBar label="سایر فاکتورها" value={ad.otherScore} icon={Sparkles} tone="other" />
          <ScoreBar label="مکان" value={ad.locationScore} icon={MapPin} tone="location" />
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Button variant="outline" size="sm" className="gap-1.5 hover:border-primary/50 hover:text-primary" asChild>
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
        <Button variant="outline" size="sm" className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-rose-200 dark:border-rose-900" onClick={() => onReject(ad)} disabled={busy} aria-label="رد آگهی با چک‌لیست دلایل">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <XCircle className="w-3.5 h-3.5" aria-hidden />} رد آگهی
        </Button>
        <Button size="sm" className="gap-1.5 bg-gradient-to-l from-teal-600 to-cyan-500 hover:from-teal-700 hover:to-cyan-600 shadow-sm shadow-teal-600/25" onClick={() => onRegister(ad)} disabled={busy} aria-label="ثبت آگهی در سامانه آرم">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <UploadCloud className="w-3.5 h-3.5" aria-hidden />} ثبت آگهی
        </Button>
      </div>
    </article>
  );
}
