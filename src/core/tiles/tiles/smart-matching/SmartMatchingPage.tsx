"use client";

/**
 * کاشی M5 «تطبیق هوشمند ملک تبریز» — P6545 → PN-011 خامسا → PN-014 ارتقای هوشمند
 * ---------------------------------------------------------------------------
 * PN-014 (دستور مالک — هم‌ارزی کامل با کاشی فایل‌یابی):
 *   ۱) جست‌وجوی هوشمند ورودی — همان الگوریتم نرمال‌سازی فارسی فایل‌یابی
 *      (ارقام فارسی/عربی، آ←ا، حذف فاصله/نیم‌فاصله): عبارت آزاد یا کد؛
 *      نتایج جست‌وجو برای انتخاب فهرست می‌شوند و سپس تطبیق اجرا می‌شود.
 *   ۲) بندبندی سه‌گانهٔ نتایج — «شکار / پیگیری / بررسی» عین سطل‌های فایل‌یابی
 *      با شمارش و تب‌های رنگی + کارت‌های هم‌ظاهر AdCard (MatchCard).
 *   ۳) دو بخش هوشمند عین فایل‌یابی در جزئیات هر گزینه: «تحلیل هوشمند
 *      امتیازدهی» و «پیش‌بینی هوشمند دلایل احتمالی رد» + «پیشنهاد تصمیم».
 *   ۴) هوشمندی سرتاسری: خلاصهٔ ایجنت، پانل ایجنت، حلقهٔ یادگیری وزن‌ها
 *      (پذیرش/رد)، پیوند بین‌کاشی، پیش‌بینی رد روی خود کارت‌ها.
 *
 * Tier-aware · صفر اجرای خودکار — پیشنهاد فقط؛ تصمیم با مالک.
 * رنگ: بنفش ارغوانی #7C3AED (sec-m5).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeftRight, Building2, ClipboardList, ExternalLink, Loader2, Search, Sparkles, Gauge, ListFilter, Brain, UserRound, Crosshair, Lightbulb,
} from "lucide-react";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faDigits } from "@/lib/format";
import { useAppStore } from "@/lib/client/store";
import { AgentPanel } from "@/components/app/AgentPanel";
import type { EnrichedCandidate, MatchSummary } from "@/core/matching/match-analysis";
import { bucketOf, type MatchBucket } from "@/core/matching/match-analysis";
import { MatchCard, matchPriceLabel } from "./MatchCard";
import { MatchDetailsDialog } from "./MatchDetailsDialog";

/* ───────── انواع پاسخ ───────── */

interface MatchResultEnriched {
  direction: "listing_to_request" | "request_to_listing";
  listingCode: string | null;
  requestId: string | null;
  candidates: EnrichedCandidate[];
  weightsUsed: Record<string, number>;
  tier: number;
  weightsSource?: "base" | "learned";
  weightsFeedbackCount?: number;
  sourceInfo?: {
    code: string;
    title: string | null;
    customerName: string | null;
    expertName: string | null;
    expertBranch: string | null;
  };
}

interface SearchRow {
  code: string;
  title: string | null;
  customerName: string | null;
  region: string | null;
  price?: number | null;
  priceFrom?: number | null;
  priceTo?: number | null;
  updatedAt: string | null;
}

/* ───────── نرمال‌سازی جست‌وجو — عین الگوریتم فایل‌یابی ───────── */

function normFa(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[آأإ]/g, "ا")
    .replace(/[\u200c\s]/g, "")
    .trim();
}

export function SmartMatchingPage({ settings, onBack }: TilePageProps) {
  const { toast } = useToast();
  const openTile = useAppStore((s) => s.openTile);
  const [tab, setTab] = useState<"listing" | "request">("listing");
  // ورودی هوشمند: متن آزاد یا کد
  const [query, setQuery] = useState("");
  const [searchRows, setSearchRows] = useState<SearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResultEnriched | null>(null);
  const [summary, setSummary] = useState<MatchSummary | null>(null);
  const [bucket, setBucket] = useState<MatchBucket>("hunt");
  const [feedback, setFeedback] = useState<Record<string, "accepted" | "rejected">>({});
  const [details, setDetails] = useState<EnrichedCandidate | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showScores = settings.showReasons !== false;

  /* ── جست‌وجوی هوشمند ورودی (debounce ۳۵۰ms — حداقل ۲ نویسه) ── */
  useEffect(() => {
    const q = query.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) {
      setSearchRows([]);
      setSearchOpen(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api<{ ok: boolean; rows: SearchRow[] }>(`/api/matching/search?direction=${tab}&q=${encodeURIComponent(q)}`);
        setSearchRows(res.rows);
        setSearchOpen(true);
      } catch {
        setSearchRows([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, tab]);

  /** فیلتر سمت کلاینت روی نتایج سرور — همان الگوریتم نرمال‌سازی (دوباره‌فیلتری محلی) */
  const visibleSearchRows = useMemo(() => {
    const q = normFa(query.trim());
    if (!q) return searchRows;
    return searchRows.filter(
      (r) =>
        normFa(r.code).includes(q) ||
        normFa(r.title ?? "").includes(q) ||
        normFa(r.customerName ?? "").includes(q) ||
        normFa(r.region ?? "").includes(q),
    );
  }, [searchRows, query]);

  const run = useCallback(async (code?: string) => {
    const q = (code ?? query).trim();
    if (!q) return;
    setSearchOpen(false);
    setLoading(true);
    setResult(null);
    setSummary(null);
    try {
      const url = tab === "listing"
        ? `/api/matching?listingCode=${encodeURIComponent(q)}`
        : `/api/matching?requestId=${encodeURIComponent(q)}`;
      const res = await api<{ ok: boolean; result: MatchResultEnriched; summary: MatchSummary }>(url);
      setResult(res.result);
      setSummary(res.summary);
      // بند پیش‌فرض: اولین بند پرشده از بالا
      setBucket(res.result.candidates.length > 0 ? bucketOf(res.result.candidates[0].score) : "hunt");
      if (res.result.candidates.length === 0) {
        toast({
          title: "نتیجه‌ای یافت نشد",
          description: tab === "listing"
            ? "هیچ درخواست فعالی فیلترهای سخت را نگذراند یا کدملک موجود نیست."
            : "هیچ آگهی منتشرشده‌ای فیلترهای سخت را نگذراند یا کد درخواست موجود نیست.",
        });
      }
    } catch (e) {
      toast({ title: "خطا", description: e instanceof ApiClientError ? e.message : "خطای نامشخص", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tab, query, toast]);

  const sendFeedback = useCallback(async (candidate: EnrichedCandidate, kind: "accepted" | "rejected") => {
    setFeedback((f) => ({ ...f, [candidate.requestId]: kind }));
    try {
      await api(`/api/agent/smart-matching/feedback`, {
        method: "POST",
        body: {
          insightKey: `match:${candidate.listingCode ?? ""}:${candidate.requestId}`,
          insightTitle: `تطبیق ${candidate.listingCode ? `ملک ${candidate.listingCode}` : "درخواست"} — امتیاز ${candidate.score}`,
          domain: "MATCH",
          rating: kind === "accepted" ? 1 : -1,
          comment: `امتیاز ${candidate.score} · بند ${candidate.bucket} · پوشش سیگنال ${candidate.signalCoverage}`,
          context: { factors: candidate.analysis.map((a) => ({ factor: a.label, value: a.value })) },
        },
      });
      toast({
        title: kind === "accepted" ? "پذیرش ثبت شد" : "رد ثبت شد",
        description: "در حلقهٔ یادگیری ثبت شد — وزن عوامل تطبیق تدریجاً از بازخوردهای شما شخصی می‌شود.",
      });
    } catch {
      toast({ title: "ثبت بازخورد ناموفق", variant: "destructive" });
    }
  }, [toast]);

  const openInTile = useCallback(
    (code: string) => {
      const tileId = tab === "listing" ? "arm-requests" : "arm-listings";
      openTile(tileId, "management-dashboard", { code });
    },
    [tab, openTile],
  );

  const openSourceInTile = useCallback(() => {
    if (!result?.sourceInfo) return;
    const tileId = result.direction === "listing_to_request" ? "arm-listings" : "arm-requests";
    openTile(tileId, "management-dashboard", { code: result.sourceInfo.code });
  }, [result, openTile]);

  const candidatesInBucket = useMemo(
    () => (result ? result.candidates.filter((c) => bucketOf(c.score) === bucket) : []),
    [result, bucket],
  );
  const globalIndexOf = useCallback(
    (c: EnrichedCandidate) => (result ? result.candidates.findIndex((x) => x.requestId === c.requestId && x.listingCode === c.listingCode) + 1 : 1),
    [result],
  );

  const inputLabel = tab === "listing" ? "کد ملک یا عبارت جست‌وجو (مثلاً ولیعصر یا 59115)" : "کد درخواست یا عبارت جست‌وجو (مثلاً خرید آپارتمان)";

  return (
    <div data-negin="kuartz-soorati" className="space-y-4 p-4 md:p-6">
      {/* نگین (PN-024) — میلهٔ گوهر kuartz-soorati */}
      <div className="negin-bar" aria-hidden />
      <div className="flex items-center gap-3">
        {onBack ? <Button variant="outline" size="sm" onClick={onBack}>بازگشت</Button> : null}
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><Sparkles className="size-5 text-sec-m5-500" /> تطبیق هوشمند ملک تبریز</h2>
          <p className="text-xs text-muted-foreground">تطبیق دوجهتهٔ آگهی ↔ درخواست با جست‌وجوی هوشمند، بندبندی سه‌گانه و تحلیل کامل — پیشنهاد فقط؛ تصمیم و اجرا با مالک</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as "listing" | "request"); setResult(null); setSummary(null); setQuery(""); }}>
        <TabsList className="grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="listing" className="gap-1"><Building2 className="size-4" /> آگهی ← درخواست</TabsTrigger>
          <TabsTrigger value="request" className="gap-1"><ClipboardList className="size-4" /> درخواست ← آگهی</TabsTrigger>
        </TabsList>

        {(["listing", "request"] as const).map((t) => (
          <TabsContent key={t} value={t} className="space-y-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  {t === "listing" ? "کد ملک را وارد یا جست‌وجو کنید" : "کد درخواست را وارد یا جست‌وجو کنید"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2 relative">
                  <div className="relative grow max-w-md">
                    <Search className="size-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      dir="auto"
                      placeholder={inputLabel}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && run()}
                      className="pr-8"
                      aria-label={t === "listing" ? "جست‌وجوی هوشمند ملک" : "جست‌وجوی هوشمند درخواست"}
                    />
                    {searching ? <Loader2 className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden /> : null}
                  </div>
                  <Button onClick={() => run()} disabled={loading || !query.trim()} className="gap-1">
                    {loading ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />} جستجوی تطبیق
                  </Button>
                </div>
                {/* نتایج جست‌وجوی هوشمند — انتخاب سطر مقدم بر اجرای تطبیق */}
                {searchOpen && visibleSearchRows.length > 0 && !loading ? (
                  <div className="max-w-2xl max-h-64 overflow-y-auto rounded-lg border divide-y" role="listbox" aria-label="نتایج جست‌وجوی هوشمند">
                    {visibleSearchRows.map((r) => (
                      <button
                        key={r.code}
                        role="option"
                        aria-selected={false}
                        className="w-full text-right p-2.5 hover:bg-muted/50 flex items-center justify-between gap-2 text-xs"
                        onClick={() => { setQuery(r.code); run(r.code); }}
                      >
                        <span className="min-w-0">
                          <b className="text-foreground">{faDigits(r.code)}</b>
                          {r.title ? <span className="ms-2 text-muted-foreground line-clamp-1 inline">{r.title}</span> : null}
                          <span className="block text-[10px] text-muted-foreground mt-0.5">
                            {r.customerName ?? "—"}{r.region ? ` · ${r.region}` : ""} · {matchPriceLabel({ priceFrom: r.price ?? r.priceFrom ?? null, priceTo: r.price ?? r.priceTo ?? null })}
                          </span>
                        </span>
                        <Badge variant="outline" className="text-[10px] shrink-0">اجرا</Badge>
                      </button>
                    ))}
                  </div>
                ) : null}
                {searchOpen && !searching && query.trim().length >= 2 && visibleSearchRows.length === 0 && !result && !loading ? (
                  <p className="text-[11px] text-muted-foreground">چیزی با این عبارت یافت نشد — کد دقیق را وارد کنید یا عبارت دیگری بیازمایید.</p>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {loading ? <Skeleton className="h-64 w-full" /> : null}

      {result && summary ? (
        <>
          {/* شناسنامهٔ سطر ورودی */}
          {result.sourceInfo ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  <UserRound className="size-4 text-sec-m5-500" />
                  {result.direction === "listing_to_request" ? `شناسنامهٔ ملک ${faDigits(result.sourceInfo.code)}` : `شناسنامهٔ درخواست ${faDigits(result.sourceInfo.code)}`}
                  {result.sourceInfo.customerName ? <Badge variant="outline" className="text-[10px]">{result.direction === "listing_to_request" ? "مالک" : "متقاضی"}: {result.sourceInfo.customerName}</Badge> : null}
                  <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[10px] text-sec-m5-600" onClick={openSourceInTile}>
                    <ExternalLink className="size-3" aria-hidden /> مشاهده در کاشی {result.direction === "listing_to_request" ? "آگهی" : "درخواست"}
                  </Button>
                </CardTitle>
              </CardHeader>
              {result.sourceInfo.expertName ? (
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  کارشناس: <b className="text-foreground">{result.sourceInfo.expertName}</b>
                  {result.sourceInfo.title ? <span className="ms-2">«{result.sourceInfo.title.slice(0, 60)}»</span> : null}
                </CardContent>
              ) : null}
            </Card>
          ) : null}

          {/* خلاصهٔ هوشمند ایجنت — PN-014 */}
          <Card className="border-sec-m5-200 bg-sec-m5-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <Brain className="size-4 text-sec-m5-500" aria-hidden />
                خلاصهٔ هوشمند ایجنت
                <Badge variant="outline" className="text-[10px]">Tier {faDigits(result.tier)}</Badge>
                {result.weightsSource === "learned" ? (
                  <Badge className="bg-sec-m5-500 text-white text-[10px]" title={summary.weightsHint}>
                    <Sparkles className="size-3" aria-hidden /> وزن‌های آموخته ({faDigits(result.weightsFeedbackCount ?? 0)} بازخورد)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]" title={summary.weightsHint}>وزن‌های پایه</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs leading-6 text-foreground">
                <Lightbulb className="size-3.5 inline text-sec-m5-500" aria-hidden /> {summary.headline}
              </p>
              <p className="text-[10px] text-muted-foreground">{summary.weightsHint} — {Object.entries(result.weightsUsed).map(([k, v]) => `${k} ${faDigits(Math.round(v * 100))}٪`).join(" · ")}</p>
            </CardContent>
          </Card>

          {result.candidates.length > 0 ? (
            <>
              {/* بندبندی سه‌گانه — عین سطل‌های فایل‌یابی */}
              <Tabs value={bucket} onValueChange={(v) => setBucket(v as MatchBucket)}>
                <TabsList className="w-full grid grid-cols-3 h-auto p-1">
                  <TabsTrigger value="hunt" className="gap-1.5 text-xs py-1.5 data-[state=active]:bg-gradient-to-l data-[state=active]:from-teal-600 data-[state=active]:to-teal-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden /> شکار ({faDigits(summary.buckets.hunt)})
                  </TabsTrigger>
                  <TabsTrigger value="follow" className="gap-1.5 text-xs py-1.5 data-[state=active]:bg-gradient-to-l data-[state=active]:from-amber-600 data-[state=active]:to-amber-500 data-[state=active]:text-white data-[state=active]:shadow-sm">
                    <Gauge className="w-3.5 h-3.5" aria-hidden /> پیگیری ({faDigits(summary.buckets.follow)})
                  </TabsTrigger>
                  <TabsTrigger value="review" className="gap-1.5 text-xs py-1.5">
                    <ListFilter className="w-3.5 h-3.5" aria-hidden /> بررسی ({faDigits(summary.buckets.review)})
                  </TabsTrigger>
                </TabsList>

                {(["hunt", "follow", "review"] as const).map((b) => (
                  <TabsContent key={b} value={b} className="mt-4">
                    {candidatesInBucket.length === 0 ? (
                      <Card>
                        <CardContent className="py-8 text-center space-y-2">
                          <ArrowLeftRight className="w-10 h-10 mx-auto text-muted-foreground/40" aria-hidden />
                          <p className="text-sm font-bold">گزینه‌ای در این بند نیست</p>
                          <p className="text-xs text-muted-foreground">
                            {b === "hunt" && summary.buckets.follow + summary.buckets.review > 0
                              ? "هیچ گزینه‌ای به آستانهٔ فرصت (۰٫۷) نرسید — بند پیگیری را ببینید."
                              : "این بند در نتیجهٔ فعلی خالی است — بندهای دیگر را بررسی کنید."}
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-3">
                        {candidatesInBucket.map((c) => (
                          <MatchCard
                            key={`${c.requestId}:${c.listingCode ?? ""}`}
                            candidate={c}
                            index={globalIndexOf(c)}
                            direction={result.direction}
                            showScores={showScores}
                            feedbackState={feedback[c.requestId]}
                            onDetails={setDetails}
                            onAccept={(x) => void sendFeedback(x, "accepted")}
                            onReject={(x) => void sendFeedback(x, "rejected")}
                            onOpenInTile={openInTile}
                          />
                        ))}
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </>
          ) : (
            <Card>
              <CardContent className="py-10 text-center space-y-2">
                <Crosshair className="w-10 h-10 mx-auto text-muted-foreground/40" aria-hidden />
                <p className="text-sm font-bold">هیچ تطبیقی از فیلترهای سخت نگذشت</p>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
                  فیلترهای سخت (معکوس نوع معامله · تلاقی قیمت و منطقه · نوع ملک) گزینه‌ای باقی نگذاشتند — سطر ورودی دیگری را امتحان کنید یا منتظر همگام‌سازی تازه بمانید.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}

      {/* پانل ایجنت — بینش‌ها و آمار یادگیری همین کاشی (عین فایل‌یابی) */}
      <AgentPanel tileId="smart-matching" />

      {/* جزئیات تحلیل — تحلیل هوشمند امتیازدهی + پیش‌بینی دلایل رد + پیشنهاد تصمیم */}
      <MatchDetailsDialog
        candidate={details}
        index={details && result ? globalIndexOf(details) : 1}
        direction={result?.direction ?? "listing_to_request"}
        weightsSource={result?.weightsSource}
        weightsFeedbackCount={result?.weightsFeedbackCount}
        weightsUsed={result?.weightsUsed ?? {}}
        feedbackState={details ? feedback[details.requestId] : undefined}
        onAccept={(c) => { void sendFeedback(c, "accepted"); }}
        onReject={(c) => { void sendFeedback(c, "rejected"); }}
        onOpenInTile={openInTile}
        onClose={() => setDetails(null)}
      />
    </div>
  );
}

/** P6549 — خروجی پیش‌فرض برای بارگذاری تنبل (lazyPage) */
export default SmartMatchingPage;
