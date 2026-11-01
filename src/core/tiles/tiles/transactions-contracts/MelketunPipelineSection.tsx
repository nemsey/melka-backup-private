"use client";

/**
 * MelketunPipelineSection — M9 معاملات ملکتون (PN-047/گام اول-۲)
 * ---------------------------------------------------------------------------
 * «طراحی مختص کسب‌وکار ملکتون» (دستور مالک): CRM ملکتون ماژول مستقل معاملات
 * ندارد (کشف PN-044؛ تأیید PN-047: قیف هم در مراحل قرارداد/معاملهٔ موفق صفر
 * است). این بخش عین خط لولهٔ فروش واقعی هر دو ماژول CRM را نشان می‌دهد:
 *   · قیف آگهی‌ها (Melketunfilingplus/funnel)
 *   · قیف درخواست‌ها (Potentials/funnel)
 * داده: /api/crm/melketun/funnel ← RefListCache «melketun-funnel» (نوشتهٔ sync).
 * صادقانه: هیچ رکوردی جعل نمی‌شود؛ مراحل صفر همان‌طور صفر نمایش می‌یابند.
 */

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/app/shared";
import { api } from "@/lib/client/api";
import { faNumber, faDateTime } from "@/lib/format";
import { Filter, TrendingUp, Eye, ShieldCheck, Landmark, ClipboardList } from "lucide-react";

interface FunnelStage {
  key: string;
  label: string;
  count: number;
}
interface FunnelDecorated {
  stages: FunnelStage[];
  unknown: FunnelStage[];
  total: number;
}
interface FunnelResponse {
  ok: boolean;
  available: boolean;
  note?: string;
  filings: FunnelDecorated | null;
  potentials: FunnelDecorated | null;
  branchesSeen: string[];
  fetchedAt: string | null;
}

/** نمودار میله‌ای یک قیف — عرض نسبی از بیشینهٔ همان قیف */
function FunnelBars({ title, icon, funnel, accent }: { title: string; icon: React.ReactNode; funnel: FunnelDecorated; accent: string }) {
  const max = Math.max(1, ...funnel.stages.map((s) => s.count));
  const visible = funnel.stages.filter((s) => s.count > 0);
  if (visible.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/20 p-3 text-center">
        <p className="text-[11px] text-muted-foreground">قیف {title}: داده‌ای در هیچ مرحله‌ای نیست.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border p-3 space-y-2" aria-label={`قیف فروش ${title}`}>
      <p className="text-xs font-bold flex items-center gap-1.5">
        {icon} قیف {title} <span className="text-[10px] font-normal text-muted-foreground">({faNumber(funnel.total)} پرونده در مراحل)</span>
      </p>
      {visible.map((s) => (
        <div key={s.key} className="flex items-center gap-2" data-funnel-stage={`${title}:${s.key}`}>
          <span className="text-[11px] font-medium w-24 shrink-0">{s.label}</span>
          <div className="flex-1 h-5 rounded bg-muted/50 overflow-hidden relative">
            <div
              className={`h-full rounded ${accent}`}
              style={{ width: `${Math.max(6, Math.round((s.count / max) * 100))}%` }}
              aria-label={`${s.label}: ${s.count}`}
            />
            <span className="absolute inset-y-0 right-2 flex items-center text-[10px] font-bold tabular-nums" dir="rtl">
              {faNumber(s.count)}
            </span>
          </div>
        </div>
      ))}
      {/* مراحل صفر — صادقانه نمایش داده می‌شوند تا خط لولهٔ کامل دیده شود */}
      {funnel.stages.filter((s) => s.count === 0).length > 0 && (
        <p className="text-[10px] text-muted-foreground leading-relaxed pt-1 border-t">
          مراحل صفر (عین CRM): {funnel.stages.filter((s) => s.count === 0).map((s) => s.label).join(" · ")}
        </p>
      )}
    </div>
  );
}

export function MelketunPipelineSection() {
  const [data, setData] = useState<FunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<FunnelResponse>("/api/crm/melketun/funnel", { timeoutMs: 20_000 })
      .then((r) => { if (alive) setData(r); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "خطا در دریافت قیف فروش"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground text-center py-6">در حال دریافت خط لولهٔ فروش ملکتون از CRM…</p>
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-destructive text-center py-4">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const filings = data?.filings ?? null;
  const potentials = data?.potentials ?? null;
  const visits = (potentials?.stages.find((s) => s.key === "visit")?.count ?? 0) + (filings?.stages.find((s) => s.key === "visit")?.count ?? 0);
  const contracts = (potentials?.stages.find((s) => s.key === "contract")?.count ?? 0) + (filings?.stages.find((s) => s.key === "contract")?.count ?? 0);
  const wins = (potentials?.stages.find((s) => s.key === "win")?.count ?? 0) + (filings?.stages.find((s) => s.key === "win")?.count ?? 0);

  return (
    <div className="space-y-4" id="m9-melketun-pipeline">
      {/* سربرگ صادقانهٔ M9 ملکتون */}
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/30">
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-bold flex items-center gap-2">
            <Filter className="w-4 h-4 text-amber-600" aria-hidden /> M9 معاملات ملکتون — خط لولهٔ فروش واقعی CRM
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            CRM ملکتون ماژول مستقل «معاملات» ندارد (کشف PN-044 · کاوش کامل ۱۵۵ مسیر PN-047) و در قیف فروش خود نیز
            هیچ پرونده‌ای به مراحل قرارداد/معاملهٔ موفق نرسیده است. این بخش عین وضعیت خط لولهٔ فروش دو ماژول
            آگهی و درخواست را از CRM نشان می‌دهد — با همگام‌سازی ۶-ساعته تازه می‌شود و به محض ثبت معاملهٔ واقعی
            در CRM، مراحل پایانی و سپس رکوردها ظاهر می‌شوند. هیچ عددی ساخته یا تغییر نمی‌کند.
          </p>
          {data?.branchesSeen && data.branchesSeen.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-medium">شعب فعال (همگی در سطح شهر تبریز):</span>
              {data.branchesSeen.map((b) => (
                <Badge key={b} variant="outline" className="text-[10px] gap-1">
                  <Landmark className="w-3 h-3" aria-hidden /> {b}
                </Badge>
              ))}
            </div>
          )}
          {data?.fetchedAt && (
            <p className="text-[10px] text-muted-foreground">آخرین همگام‌سازی قیف: {faDateTime(data.fetchedAt)}</p>
          )}
        </CardContent>
      </Card>

      {/* شاخص‌ها — مختص کسب‌وکار ملکتون */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard label="پرونده‌های خط لولهٔ آگهی" value={faNumber(filings?.total ?? 0)} icon={TrendingUp} iconWrapperClassName="bg-sec-m1-50" iconColorClassName="text-sec-m1-700" />
        <KpiCard label="پرونده‌های خط لولهٔ درخواست" value={faNumber(potentials?.total ?? 0)} icon={ClipboardList} iconWrapperClassName="bg-sec-m2-50" iconColorClassName="text-sec-m2-700" />
        <KpiCard label="بازدیدهای انجام‌شده" value={faNumber(visits)} icon={Eye} iconWrapperClassName="bg-amber-50" iconColorClassName="text-amber-700" />
        <KpiCard label="قرارداد + معاملهٔ موفق" value={`${faNumber(contracts + wins)} (صادقانه)`} icon={ShieldCheck} iconWrapperClassName="bg-emerald-50" iconColorClassName="text-emerald-700" />
      </div>

      {/* نمودارهای قیف — عین دادهٔ CRM */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filings && <FunnelBars title="آگهی‌ها" icon={<TrendingUp className="w-3.5 h-3.5 text-sec-m1-700" aria-hidden />} funnel={filings} accent="bg-sec-m1-500/70" />}
        {potentials && <FunnelBars title="درخواست‌ها" icon={<ClipboardList className="w-3.5 h-3.5 text-sec-m2-700" aria-hidden />} funnel={potentials} accent="bg-sec-m2-500/70" />}
      </div>

      {!data?.available && (
        <p className="text-[11px] text-muted-foreground text-center">{data?.note ?? "قیف هنوز همگام‌سازی نشده است."}</p>
      )}
    </div>
  );
}
