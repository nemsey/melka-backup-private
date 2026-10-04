"use client";

/**
 * کاشی M5 «تطبیق هوشمند ملک تبریز» — P6545/گام۲ BLOCK 2.1 (جلسه ۰۳۰ سؤال ۱۰)
 * ---------------------------------------------------------------------------
 * تب ۱ — آگهی → درخواست: ورودی کدملک، خروجی ۵ درخواست برتر با امتیاز و دلیل
 * تب ۲ — درخواست → آگهی: ورودی کد درخواست، خروجی ۵ آگهی برتر
 * فیلتر سخت + امتیاز نرم (۵ عامل) + پوشش سیگنال + حلقهٔ یادگیری (پذیرش/رد)
 * Tier-aware · صفر اجرای خودکار — پیشنهاد فقط؛ تصمیم با مالک
 * رنگ: بنفش ارغوانی #7C3AED (sec-m5)
 */

import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeftRight, Building2, ClipboardList, Loader2, Search, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faDigits, faAmountFull, faRelative } from "@/lib/format";

const faPct = (n: number) => `${faDigits(n)}٪`;

/** قیمت گزینه — عدد یا بازهٔ از/تا (گام پنجم ن۰۰۱) */
function priceLabel(info: MatchOptionInfo): string {
  if (info.priceFrom == null && info.priceTo == null) return "—";
  if (info.priceFrom != null && info.priceTo != null && info.priceFrom !== info.priceTo) {
    return `${faAmountFull(info.priceFrom, "")} تا ${faAmountFull(info.priceTo, "")}`;
  }
  return faAmountFull(info.priceFrom ?? info.priceTo);
}

interface MatchReason { factor: string; value: number; weight: number; note: string }
/** الزام گام پنجم ن۰۰۱ — اطلاعات کامل هر گزینهٔ پیشنهادی */
interface MatchOptionInfo {
  code: string;
  ownerName: string | null;
  mobile: string | null;
  region: string | null;
  priceFrom: number | null;
  priceTo: number | null;
  lastSeenAt: string | null;
}
interface MatchCandidate {
  requestId: string;
  listingCode?: string;
  requestLabel?: string;
  score: number;
  hardPassed: boolean;
  reasons: MatchReason[];
  hardFilterNotes: string[];
  signalCoverage: number;
  info?: MatchOptionInfo;
}
interface MatchResult {
  direction: "listing_to_request" | "request_to_listing";
  listingCode: string | null;
  requestId: string | null;
  candidates: MatchCandidate[];
  weightsUsed: Record<string, number>;
  tier: number;
}

export function SmartMatchingPage({ onBack }: TilePageProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState("listing");
  const [listingCode, setListingCode] = useState("");
  const [requestId, setRequestId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [feedback, setFeedback] = useState<Record<string, "accepted" | "rejected">>({});

  const run = useCallback(async () => {
    const q = tab === "listing" ? listingCode.trim() : requestId.trim();
    if (!q) return;
    setLoading(true);
    setResult(null);
    try {
      const url = tab === "listing" ? `/api/matching?listingCode=${encodeURIComponent(q)}` : `/api/matching?requestId=${encodeURIComponent(q)}`;
      const res = await api<{ ok: boolean; result: MatchResult }>(url);
      setResult(res.result);
      if (res.result.candidates.length === 0) {
        toast({ title: "نتیجه‌ای یافت نشد", description: tab === "listing" ? "هیچ درخواست فعالی فیلترهای سخت را نگذراند یا کدملک موجود نیست." : "هیچ آگهی منتشرشده‌ای فیلترهای سخت را نگذراند یا درخواست موجود نیست." });
      }
    } catch (e) {
      toast({ title: "خطا", description: e instanceof ApiClientError ? e.message : "خطای نامشخص", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tab, listingCode, requestId, toast]);

  const sendFeedback = useCallback(async (candidate: MatchCandidate, kind: "accepted" | "rejected") => {
    setFeedback((f) => ({ ...f, [candidate.requestId]: kind }));
    try {
      await api("/api/agent/feedback", { method: "POST", body: {
        tileId: "smart-matching",
        domain: "MATCH",
        rating: kind === "accepted" ? 1 : -1,
        comment: `تطبیق ${candidate.listingCode ?? ""}${candidate.requestLabel ?? ""} امتیاز ${candidate.score}`,
      } });
      toast({ title: kind === "accepted" ? "پذیرش ثبت شد" : "رد ثبت شد", description: "در حلقهٔ یادگیری ثبت شد — وزن‌ها تدریجاً شخصی می‌شوند." });
    } catch {
      toast({ title: "ثبت بازخورد ناموفق", variant: "destructive" });
    }
  }, [toast]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        {onBack ? <Button variant="outline" size="sm" onClick={onBack}>بازگشت</Button> : null}
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><Sparkles className="size-5 text-sec-m5-500" /> تطبیق هوشمند ملک تبریز</h2>
          <p className="text-xs text-muted-foreground">تطبیق دوجهتهٔ آگهی ↔ درخواست با فیلتر سخت و امتیاز نرم — پیشنهاد فقط؛ تصمیم و اجرا با مالک</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-lg grid-cols-2">
          <TabsTrigger value="listing" className="gap-1"><Building2 className="size-4" /> آگهی ← درخواست</TabsTrigger>
          <TabsTrigger value="request" className="gap-1"><ClipboardList className="size-4" /> درخواست ← آگهی</TabsTrigger>
        </TabsList>

        <TabsContent value="listing" className="space-y-3">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">کد ملک را وارد کنید</CardTitle></CardHeader>
            <CardContent className="flex gap-2">
              <Input dir="ltr" placeholder="مثلاً 59115" value={listingCode} onChange={(e) => setListingCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} className="max-w-xs" />
              <Button onClick={run} disabled={loading || !listingCode.trim()} className="gap-1">{loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} جستجوی تطبیق</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="request" className="space-y-3">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">شناسهٔ درخواست را وارد کنید</CardTitle></CardHeader>
            <CardContent className="flex gap-2">
              <Input dir="ltr" placeholder="شناسهٔ درخواست (از کاشی M2)" value={requestId} onChange={(e) => setRequestId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} className="max-w-xs" />
              <Button onClick={run} disabled={loading || !requestId.trim()} className="gap-1">{loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} جستجوی تطبیق</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {loading ? <Skeleton className="h-64 w-full" /> : null}

      {result && result.candidates.length > 0 ? (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ArrowLeftRight className="size-4 text-sec-m5-500" />
                {result.direction === "listing_to_request" ? `۵ درخواست برتر برای ملک ${faDigits(result.listingCode ?? "")}` : "۵ آگهی برتر برای این درخواست"}
                <Badge variant="outline" className="text-[10px]">Tier {faDigits(result.tier)}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              وزن‌ها: {Object.entries(result.weightsUsed).map(([k, v]) => `${k} ${faPct(Math.round(v * 100))}`).join(" · ")}
            </CardContent>
          </Card>

          {result.candidates.map((c, i) => (
            <Card key={`${c.requestId}:${c.listingCode ?? i}`} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm leading-6">
                    <Badge className="ml-1 bg-sec-m5-500 text-white">{faDigits(i + 1)}</Badge>
                    {c.listingCode ? `ملک ${faDigits(c.listingCode)}` : (c.requestLabel ?? c.requestId)}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge className={c.score >= 0.7 ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}>امتیاز {faDigits(c.score.toFixed(2))}</Badge>
                    {feedback[c.requestId] ? (
                      <Badge variant="outline">{feedback[c.requestId] === "accepted" ? "پذیرفته شد ✓" : "رد شد ✗"}</Badge>
                    ) : (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-emerald-600" onClick={() => sendFeedback(c, "accepted")}><ThumbsUp className="size-3" /> پذیرش</Button>
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-red-600" onClick={() => sendFeedback(c, "rejected")}><ThumbsDown className="size-3" /> رد</Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {c.info ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-sec-m5-200 bg-sec-m5-50/60 p-2 text-xs sm:grid-cols-3">
                    <span className="text-muted-foreground">کد: <b className="text-foreground">{faDigits(c.info.code)}</b></span>
                    <span className="text-muted-foreground">{result.direction === "listing_to_request" ? "مشتری" : "مالک"}: <b className="text-foreground">{c.info.ownerName ?? "—"}</b></span>
                    <span dir="ltr" className="text-muted-foreground">{c.info.mobile ?? "—"}</span>
                    <span className="text-muted-foreground">منطقه: <b className="text-foreground">{c.info.region ?? "—"}</b></span>
                    <span className="text-muted-foreground">قیمت: <b className="text-foreground">{priceLabel(c.info)}</b></span>
                    <span className="text-muted-foreground">تازگی: <b className="text-foreground">{c.info.lastSeenAt ? faRelative(c.info.lastSeenAt) : "—"}</b></span>
                  </div>
                ) : null}
                {c.hardFilterNotes.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {c.hardFilterNotes.map((n) => <Badge key={n} variant="outline" className="text-[10px] text-emerald-700 border-emerald-300">{n}</Badge>)}
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  {c.reasons.map((r) => (
                    <div key={r.factor} className="flex items-center gap-2 text-xs">
                      <span className="w-28 shrink-0 text-muted-foreground">{r.factor}</span>
                      <Progress value={r.value * 100} className="h-1.5 flex-1" />
                      <span className="w-10 text-left tabular-nums">{faDigits(r.value.toFixed(2))}</span>
                      <span className="w-44 shrink-0 truncate text-muted-foreground" dir="rtl">{r.note}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">پوشش سیگنال واقعی: {faPct(Math.round(c.signalCoverage * 100))} — عوامل بدون داده خنثی (۰٫۵) ارزیابی شده‌اند، نه صفر</p>
              </CardContent>
            </Card>
          ))}
        </>
      ) : null}
    </div>
  );
}


/** P6549 — خروجی پیش‌فرض برای بارگذاری تنبل (lazyPage) */
export default SmartMatchingPage;
