"use client";

/**
 * پنل ایجنت هوشمند — نمایش بینش‌ها، بازخورد و شفافیت یادگیری
 * برای هر کاشی که ایجنت دارد (طبق قرارداد کاشی).
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  BrainCircuit, ThumbsUp, ThumbsDown, Sparkles, History, Info, Loader2, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Undo2,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber, faDateTime } from "@/lib/format";
import { useAppStore } from "@/lib/client/store";

interface Insight {
  key: string;
  domain: string;
  title: string;
  body: string;
  severity: "info" | "positive" | "warning" | "critical";
  metrics?: { label: string; value: string }[];
  finalWeight: number;
  learned: boolean;
  weightSource: string;
}

interface LearningStats {
  feedbackCount: number;
  memoryCount: number;
  policyVersions: number;
  activePolicyVersion: number;
  positiveRate: number;
}

interface PolicyVersion {
  id: string;
  version: number;
  rationale: string;
  active: boolean;
  createdAt: string;
  activatedAt: string | null;
  content: { weights: Record<string, number>; maxInsights: number };
}

const SEVERITY_STYLE: Record<Insight["severity"], { border: string; icon: React.ReactNode; chip: string }> = {
  info: { border: "border-s-4 border-primary/70", icon: <Info className="w-5 h-5 text-primary" aria-hidden />, chip: "bg-primary/10 text-primary" },
  positive: { border: "border-s-4 border-emerald-500/70", icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden />, chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  warning: { border: "border-s-4 border-amber-500/70", icon: <AlertTriangle className="w-5 h-5 text-amber-600" aria-hidden />, chip: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  critical: { border: "border-s-4 border-rose-500/80", icon: <XCircle className="w-5 h-5 text-rose-600" aria-hidden />, chip: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" },
};

export const DOMAIN_FA: Record<string, string> = {
  TREND: "روند بازار",
  VOLUME: "حجم معاملات",
  TOP_EXPERTS: "کارشناسان برتر",
  DISTRICT: "تحلیل محله‌ای",
  ANOMALY: "ناهنجاری",
  CONVERSION: "نرخ تبدیل",
  RANKING: "رتبه‌بندی",
  ACTIVITY: "فعالیت",
  SEGMENT: "بخش‌بندی",
  RISK: "ریسک",
  CAPACITY: "تمرکز درآمد",
  COMPOSITION: "ترکیب",
  DOCUMENT: "اسناد و مدارک",
  GROWTH: "رشد",
  NETWORK: "شبکه همکاری",
  SCAN: "سلامت اسکن",
  PERSONAL: "شخصی‌بودن",
  PRICE: "زیرقیمت و بازار",
  OTHER: "سایر فاکتورهای بهینه",
  LOCATION: "مکان",
  LEARNING: "یادگیری از ردها",
  FUNNEL: "قیف چرخه عمر",
  BOTTLENECK: "گلوگاه اداری",
  STALLED: "قراردادهای راکد",
  SHARE: "حق‌السهم",
  REJECT: "رد و فسخ",
  COMMUNITY: "جامعه مشتریان",
  REPEAT: "مشتریان تکراری",
  LOYALTY: "وفادارسازی",
  CATALOG: "فهرست‌های مرجع",
  TARIFF: "تعرفه اتحادیه",
  REVENUE: "درآمد",
  SETTLEMENT: "تسویه‌حساب",
  BRANCH: "شعبه‌ها",
  PIPELINE: "درآمد در جریان",
  MARKET: "شاخص بازار",
  REGION: "مقایسه مناطق",
  ALERT: "هشدار جهش",
  HEALTH: "سلامت قیمت‌گذاری",
};

export function AgentPanel({ tileId }: { tileId: string }) {
  const { toast } = useToast();
  const userRole = useAppStore((s) => s.user?.role ?? "CONSULTANT");
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [policyVersions, setPolicyVersions] = useState<PolicyVersion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [voted, setVoted] = useState<Record<string, 1 | -1>>({});
  const [commentFor, setCommentFor] = useState<Insight | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentRating, setCommentRating] = useState<1 | -1>(1);
  const [showHistory, setShowHistory] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [insightRes, statsRes] = await Promise.all([
        api<{ insights: Insight[]; policyVersion: number; agentName: string }>(`/api/agent/${tileId}/insight`),
        api<{ stats: LearningStats }>(`/api/agent/${tileId}/stats`),
      ]);
      setInsights(insightRes.insights);
      setStats(statsRes.stats);
      if (userRole === "OWNER") {
        const pol = await api<{ versions: PolicyVersion[] }>(`/api/agent/${tileId}/policy`);
        setPolicyVersions(pol.versions);
      }
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "خطا در دریافت بینش‌های ایجنت", description: e.message, variant: "destructive" });
      setInsights([]);
    } finally {
      setLoading(false);
    }
  }, [tileId, toast, userRole]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendFeedback = useCallback(
    async (insight: Insight, rating: 1 | -1, comment?: string) => {
      setBusyKey(insight.key);
      try {
        await api(`/api/agent/${tileId}/feedback`, {
          method: "POST",
          body: {
            insightKey: insight.key,
            insightTitle: insight.title,
            domain: insight.domain,
            rating,
            comment: comment || undefined,
          },
        });
        setVoted((v) => ({ ...v, [insight.key]: rating }));
        toast({
          title: "بازخورد ثبت شد",
          description: "ایجنت این بازخورد را در حافظه خود ثبت کرد و ترتیب بینش‌های آینده را به‌روزرسانی می‌کند.",
        });
        await load();
      } catch (err) {
        const e = err as ApiClientError;
        toast({ title: "خطا در ثبت بازخورد", description: e.message, variant: "destructive" });
      } finally {
        setBusyKey(null);
      }
    },
    [tileId, load, toast]
  );

  const rollback = useCallback(
    async (version: number) => {
      try {
        await api(`/api/agent/${tileId}/policy`, { method: "POST", body: { rollbackTo: version } });
        toast({ title: `سیاست به نسخه ${faNumber(version)} بازگشت`, description: "نسخه‌های قبلی حفظ شدند." });
        await load();
      } catch (err) {
        const e = err as ApiClientError;
        toast({ title: "بازگشت سیاست ناموفق", description: e.message, variant: "destructive" });
      }
    },
    [tileId, load, toast]
  );

  if (loading) {
    return (
      <section aria-busy className="mb-6">
        <Skeleton className="h-9 w-56 mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="بینش‌های ایجنت هوشمند" className="mb-6">
      {/* هدر پنل */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="text-base font-extrabold flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-primary" aria-hidden /> بینش‌های ایجنت هوشمند
        </h3>
        {stats && (
          <>
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="w-3 h-3" aria-hidden /> سیاست نسخه {faNumber(stats.activePolicyVersion)}
            </Badge>
            <Badge variant="outline">{faNumber(stats.feedbackCount)} بازخورد</Badge>
            <Badge variant="outline">{faNumber(stats.memoryCount)} خاطره</Badge>
            {stats.feedbackCount > 0 && (
              <Badge variant="outline">
                {faNumber(stats.positiveRate)}٪ رضایت
              </Badge>
            )}
          </>
        )}
        {userRole === "OWNER" && policyVersions && policyVersions.length > 0 && (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setShowHistory((h) => !h)} aria-expanded={showHistory}>
            <History className="w-4 h-4" aria-hidden /> تاریخچه سیاست ({faNumber(policyVersions.length)})
          </Button>
        )}
      </div>

      {/* تاریخچه سیاست — فقط مالک */}
      {showHistory && policyVersions && (
        <Card className="mb-4">
          <CardHeader className="py-4">
            <CardTitle className="text-sm">نسخه‌های سیاست ایجنت (با قابلیت بازگردانی)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {policyVersions.map((v) => (
              <div key={v.id} className={`rounded-lg border p-3 text-sm flex flex-wrap items-center justify-between gap-2 ${v.active ? "border-primary/50 bg-primary/5" : ""}`}>
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <b>نسخه {faNumber(v.version)}</b>
                    {v.active && <Badge className="bg-primary hover:bg-primary">فعال</Badge>}
                    <span className="text-xs text-muted-foreground">{faDateTime(v.createdAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{v.rationale}</p>
                </div>
                {!v.active && (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void rollback(v.version)}>
                    <Undo2 className="w-3.5 h-3.5" aria-hidden /> بازگشت به این نسخه
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* کارت‌های بینش */}
      {insights && insights.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {insights.map((ins, idx) => {
            const st = SEVERITY_STYLE[ins.severity] ?? SEVERITY_STYLE.info;
            return (
              <Card key={ins.key} className={`tile-pop ${st.border} shadow-sm hover:shadow-md transition-shadow`}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5">{st.icon}</div>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-lg bg-primary/10 border border-primary/20 text-[10px] font-extrabold text-primary tabular-nums shrink-0" aria-label={`بینش ${faNumber(idx + 1)}`} title={`ردیف ${faNumber(idx + 1)}`}>
                          {faNumber(idx + 1)}
                        </span>
                        <h4 className="font-bold text-sm sm:text-base">{ins.title}</h4>
                        <Badge className={`${st.chip} text-[11px]`}>{DOMAIN_FA[ins.domain] ?? ins.domain}</Badge>
                        {ins.learned && (
                          <Badge variant="outline" className="gap-1 text-[11px] text-primary border-primary/40">
                            <TrendingUp className="w-3 h-3" aria-hidden /> یادگیری‌شده
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{ins.body}</p>

                      {ins.metrics && ins.metrics.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {ins.metrics.map((m) => (
                            <div key={m.label} className="rounded-lg bg-muted/60 px-2.5 py-2 text-center min-w-0">
                              <div className="text-[10px] text-muted-foreground truncate">{m.label}</div>
                              <div className="text-xs font-bold truncate" title={m.value}>
                                {m.value}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex gap-1.5">
                          <Button
                            variant={voted[ins.key] === 1 ? "default" : "outline"}
                            size="sm"
                            className="gap-1.5 h-8"
                            disabled={busyKey === ins.key}
                            onClick={() => {
                              setCommentFor(ins);
                              setCommentRating(1);
                              setCommentText("");
                            }}
                            aria-label="این بینش مفید بود"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" aria-hidden /> مفید
                          </Button>
                          <Button
                            variant={voted[ins.key] === -1 ? "destructive" : "outline"}
                            size="sm"
                            className="gap-1.5 h-8"
                            disabled={busyKey === ins.key}
                            onClick={() => {
                              setCommentFor(ins);
                              setCommentRating(-1);
                              setCommentText("");
                            }}
                            aria-label="این بینش مفید نبود"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" aria-hidden /> غیرمفید
                          </Button>
                        </div>
                        <span
                          className="text-[10px] text-muted-foreground/70 max-w-52 truncate cursor-help"
                          title={ins.weightSource}
                        >
                          اولویت {faNumber(ins.finalWeight)} — {ins.weightSource}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground text-sm leading-relaxed">
            ایجنت هنوز بینشی تولید نکرده — داده کافی پس از همگام‌سازی با سامانه ملک تبریز لازم است.
          </CardContent>
        </Card>
      )}

      {/* دیالوگ ثبت بازخورد با توضیح */}
      <Dialog open={Boolean(commentFor)} onOpenChange={(o) => !o && setCommentFor(null)}>
        <DialogContent dir="rtl">
          <DialogHeader className="text-right space-y-2 items-start">
            <DialogTitle className="text-right">ثبت بازخورد برای ایجنت</DialogTitle>
            <DialogDescription className="text-right leading-relaxed">
              بازخورد شما در حافظه‌ی ایجنت «{commentFor?.title}» ثبت می‌شود و اولویت این‌گونه بینش‌ها را در آینده تنظیم می‌کند.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
              <span>ارزیابی شما</span>
              <Select
                value={String(commentRating)}
                onValueChange={(v) => setCommentRating(Number(v) === 1 ? 1 : -1)}
              >
                <SelectTrigger className="w-36" aria-label="نوع بازخورد">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">مفید بود</SelectItem>
                  <SelectItem value="-1">مفید نبود</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea
              placeholder="توضیح اختیاری — چه چیزی به شما کمک می‌کرد؟ (برای یادگیری ایجنت)"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              maxLength={500}
              dir="rtl"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCommentFor(null)}>
              انصراف
            </Button>
            <Button
              disabled={busyKey !== null}
              onClick={() => {
                if (!commentFor) return;
                void sendFeedback(commentFor, commentRating, commentText.trim() || undefined).then(() => setCommentFor(null));
              }}
            >
              {busyKey ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
              ثبت بازخورد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
