"use client";

/**
 * کاشی «مالی و کمیسیون» — صفحه داخلی
 * ------------------------------------------------------
 * • محاسبه‌گر کمیسیون عین خود سامانه: شهر → نوع معامله → ورودی‌ها → نتیجه
 *   (کمیسیون هر طرف + مالیات ارزش افزوده + قابل پرداخت) — تعرفه زنده اتحادیه
 * • تجمیع حق‌السهم قراردادهای نهایی‌شده به تفکیک مشاور و شعبه
 * • نرخ‌نامه رسمی اتحادیه مشاورین املاک تبریز
 */

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RotateCcw, Calculator, Receipt, Percent, Users, Building2, FileText, TrendingUp } from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import { KpiCard, DataSourceAlert, useTileData, type DataSourceInfo } from "@/components/app/shared";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { parseFaAmount } from "@/core/agent/analyzers";
import type { CommissionResult } from "@/lib/melk-api/types";
import { faNumber, faPercent, faToman, faTomanExact, faDigits } from "@/lib/format";

interface FinanceResponse {
  ok: boolean;
  commissionConfig: {
    cityId: string;
    cityName: string;
    valueAddedPercentage: number;
    realEstateTariff: string;
    image: string | null;
    detail: {
      contractType: string;
      contractTypeFa: string;
      buyerLabel: string;
      sellerLabel: string;
      inputs: { key: string; label: string }[];
    }[];
  } | null;
  summary: {
    totalContracts: number;
    finalizedContracts: number;
    consultantsWithShare: number;
    branchesWithShare: number;
    avgSharePercent: number;
  };
  consultantShares: {
    consultant: string;
    shareCount: number;
    totalPercent: number;
    confirmed: number;
    pending: number;
    rejected: number;
  }[];
  branchShares: { branch: string; contractCount: number; totalPercent: number }[];
  monthly: { key: string; count: number }[];
  dataSource: DataSourceInfo & { tariffLive: boolean };
}

interface CalcResponse {
  ok: boolean;
  result: CommissionResult;
  labels: { buyerLabel: string; sellerLabel: string; contractTypeFa: string } | null;
  vatPercent: number;
  error?: string;
}

/** عدد تومان از ورودی متنی (ارقام فارسی/انگلیسی با جداکننده) — منطق دامنه: analyzers */
function parseAmount(v: string): number | undefined {
  return parseFaAmount(v);
}

export function FinancePage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back }: TilePageProps) {
  const { toast } = useToast();

  // محاسبه‌گر
  const [calcType, setCalcType] = useState<string>("mobayeName");
  const [contractPrice, setContractPrice] = useState("");
  const [contractDeposite, setContractDeposite] = useState("");
  const [contractRent, setContractRent] = useState("");
  const [hologramNumber, setHologramNumber] = useState("");
  const [calcResult, setCalcResult] = useState<CalcResponse | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  const fetchFinance = useCallback(async () => {
    const res = await api<FinanceResponse>("/api/crm/finance");
    if (res.commissionConfig?.detail.length) {
      setCalcType(res.commissionConfig.detail[0].contractType);
    }
    return res;
  }, []);

  const { data, loading, reload } = useTileData(fetchFinance, { errorTitle: "خطا در دریافت داده‌های مالی" });

  const activeType = useMemo(
    () => data?.commissionConfig?.detail.find((d) => d.contractType === calcType) ?? null,
    [data, calcType]
  );

  const runCalculation = useCallback(async () => {
    const body: Record<string, unknown> = { contractType: calcType };
    if (calcType === "mobayeName") body.contractPrice = parseAmount(contractPrice);
    else {
      body.contractDeposite = parseAmount(contractDeposite);
      body.contractRent = parseAmount(contractRent);
    }
    if (hologramNumber.trim()) body.hologramNumber = hologramNumber.trim();

    setCalcLoading(true);
    try {
      const res = await api<CalcResponse>("/api/crm/finance/commission", { method: "POST", body });
      setCalcResult(res);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "خطا در محاسبه کمیسیون", description: e.message, variant: "destructive" });
    } finally {
      setCalcLoading(false);
    }
  }, [calcType, contractPrice, contractDeposite, contractRent, hologramNumber, toast]);

  const s = data?.summary;
  const result = calcResult?.result;

  return (
    <div className="space-y-6">
      <AgentPanel tileId="finance-commission" />

      {/* شاخص‌های اصلی */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "قرارداد مرحله مالی", value: s ? faNumber(s.finalizedContracts) : undefined, icon: Receipt, tone: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
          { label: "مشاوران دارای سهم", value: s ? faNumber(s.consultantsWithShare) : undefined, icon: Users, tone: "bg-primary/10 text-primary" },
          { label: "شعبه‌های فعال مالی", value: s ? faNumber(s.branchesWithShare) : undefined, icon: Building2, tone: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
          { label: "میانگین سهم هر مشاور", value: s ? faPercent(s.avgSharePercent) : undefined, icon: Percent, tone: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
        ].map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            icon={kpi.icon}
            iconWrapperClassName={kpi.tone}
            cardClassName="border-border/60"
            valueClassName="text-lg font-extrabold tabular-nums truncate"
          />
        ))}
      </div>

      {/* شفافیت منبع داده */}
      <DataSourceAlert show={Boolean(data && (data.dataSource.tariffLive || !data.dataSource.cached))} error={data?.dataSource.liveError}>
        {data?.dataSource.tariffLive
          ? "تعرفه و نرخ‌نامه زنده از سامانه مالی ملک تبریز (اتحادیه مشاورین املاک) دریافت شده است."
          : "تعرفه زنده در دسترس نیست؛ محاسبه با قواعد رسمی نرخ‌نامه تبریز انجام می‌شود."}
        {data?.dataSource.cached
          ? " تجمیع حق‌السهم از قراردادهای همگام‌شده محاسبه می‌شود."
          : " پس از ورود با کد پرسنلی، تجمیع حق‌السهم مشاوران و شعبه‌ها فعال می‌شود."}
      </DataSourceAlert>

      <Tabs defaultValue="calculator" dir="rtl">
        <TabsList className="w-full justify-start overflow-x-auto h-auto p-1">
          <TabsTrigger value="calculator" className="gap-1.5">محاسبه‌گر کمیسیون</TabsTrigger>
          <TabsTrigger value="consultants" className="gap-1.5">تجمیع حق‌السهم مشاوران</TabsTrigger>
          <TabsTrigger value="branches" className="gap-1.5">عملکرد مالی شعبه‌ها</TabsTrigger>
          <TabsTrigger value="tariff" className="gap-1.5">نرخ‌نامه اتحادیه</TabsTrigger>
        </TabsList>

        {/* محاسبه‌گر کمیسیون */}
        <TabsContent value="calculator" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* فرم ورودی */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-primary" aria-hidden />
                  محاسبه‌گر کمیسیون — {data?.commissionConfig?.cityName ?? "تبریز"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* انتخاب نوع معامله */}
                <div className="space-y-2">
                  <Label className="text-xs">معامله موردنظر را انتخاب کنید:</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(data?.commissionConfig?.detail ?? []).map((d) => (
                      <button
                        key={d.contractType}
                        type="button"
                        onClick={() => {
                          setCalcType(d.contractType);
                          setCalcResult(null);
                        }}
                        className={`rounded-xl border px-3 py-2.5 text-xs font-bold transition-all ${
                          calcType === d.contractType
                            ? "border-primary bg-primary text-primary-foreground shadow-md"
                            : "border-border/60 bg-card hover:border-primary/40"
                        }`}
                        aria-pressed={calcType === d.contractType}
                      >
                        {d.contractTypeFa}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ورودی‌های نوع معامله */}
                {calcType === "mobayeName" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="price" className="text-xs">ثَمَنِ معامله ملک (تومان)</Label>
                    <Input
                      id="price"
                      inputMode="numeric"
                      placeholder="مثلاً ۲۰۰۰۰۰۰۰۰۰"
                      value={contractPrice}
                      onChange={(e) => setContractPrice(e.target.value)}
                      className="h-10 text-sm"
                    />
                    {parseAmount(contractPrice) !== undefined && parseAmount(contractPrice)! > 0 && (
                      <p className="text-[10px] text-muted-foreground tabular-nums">{faToman(parseAmount(contractPrice)!)}</p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="deposit" className="text-xs">ودیعه (تومان)</Label>
                      <Input
                        id="deposit"
                        inputMode="numeric"
                        placeholder="مثلاً ۵۰۰۰۰۰۰۰۰"
                        value={contractDeposite}
                        onChange={(e) => setContractDeposite(e.target.value)}
                        className="h-10 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="rent" className="text-xs">اجاره ماهانه (تومان)</Label>
                      <Input
                        id="rent"
                        inputMode="numeric"
                        placeholder="مثلاً ۱۵۰۰۰۰۰۰"
                        value={contractRent}
                        onChange={(e) => setContractRent(e.target.value)}
                        className="h-10 text-sm"
                      />
                    </div>
                  </div>
                )}

                {/* شماره هولوگرام (اختیاری) */}
                <div className="space-y-1.5">
                  <Label htmlFor="holo" className="text-xs">شماره هولوگرام (اختیاری)</Label>
                  <Input
                    id="holo"
                    placeholder="شماره هولوگرام قرارداد"
                    value={hologramNumber}
                    onChange={(e) => setHologramNumber(e.target.value)}
                    className="h-10 text-sm"
                  />
                </div>

                <Button
                  onClick={() => void runCalculation()}
                  disabled={calcLoading}
                  className="w-full gap-2 bg-gradient-to-l from-teal-600 to-cyan-500 hover:from-teal-700 hover:to-cyan-600 text-white"
                >
                  {calcLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Calculator className="w-4 h-4" aria-hidden />}
                  محاسبه کمیسیون و صدور نتیجه
                </Button>
              </CardContent>
            </Card>

            {/* نتیجه — عین قبض خود سامانه */}
            <Card className={result ? "border-primary/30 shadow-lg" : ""}>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-primary" aria-hidden />
                    نتیجه محاسبه
                  </span>
                  {result && (
                    <Badge variant="secondary" className="text-xs">
                      {calcResult?.labels?.contractTypeFa ?? ""}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!result ? (
                  <div className="py-12 text-center space-y-2">
                    <Receipt className="w-10 h-10 text-muted-foreground/40 mx-auto" aria-hidden />
                    <p className="text-sm text-muted-foreground">
                      برای شروع، نوع معامله و مبالغ را انتخاب و «محاسبه کمیسیون» را بزنید.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      محاسبه بر پایه نرخ‌نامه رسمی اتحادیه مشاورین املاک تبریز با مالیات ارزش افزوده {faPercent(data?.commissionConfig?.valueAddedPercentage ?? 10)} انجام می‌شود.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* سهم هر طرف */}
                    {[
                      {
                        title: `سهم ${calcResult?.labels?.buyerLabel ?? "خریدار"} (هر طرف معامله)`,
                        commission: result.buyerCommission,
                        tax: result.buyerTax,
                        payable: result.buyerPayable,
                        tone: "from-teal-600 to-cyan-500",
                        bg: "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900",
                      },
                      {
                        title: `سهم ${calcResult?.labels?.sellerLabel ?? "فروشنده"} (هر طرف معامله)`,
                        commission: result.sellerCommission,
                        tax: result.sellerTax,
                        payable: result.sellerPayable,
                        tone: "from-teal-600 to-cyan-500",
                        bg: "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-900",
                      },
                    ].map((side) => (
                      <div key={side.title} className={`rounded-xl border p-4 space-y-2.5 ${side.bg}`}>
                        <p className="text-xs font-extrabold">{side.title}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">کمیسیون پایه</span>
                          <span className="text-sm font-bold tabular-nums">{faTomanExact(side.commission)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">مالیات ارزش افزوده ({faPercent(result.vatPercent)})</span>
                          <span className="text-sm font-bold tabular-nums">{faTomanExact(side.tax)}</span>
                        </div>
                        <div className={`rounded-lg bg-gradient-to-l ${side.tone} text-white px-3 py-2.5 flex items-center justify-between shadow`}>
                          <span className="text-xs font-bold">قابل پرداخت (با احتساب مالیات)</span>
                          <span className="text-sm font-extrabold tabular-nums">{faTomanExact(side.payable)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="rounded-xl border bg-muted/40 p-3 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">مبلغ ورودی معامله</span>
                      <span className="text-sm font-bold tabular-nums">{faToman(result.dealValue)}</span>
                    </div>
                    {hologramNumber.trim() && (
                      <div className="rounded-xl border bg-muted/40 p-3 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">شماره هولوگرام</span>
                        <span className="text-sm font-bold tabular-nums" dir="ltr">{faDigits(hologramNumber)}</span>
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      * مبلغ فوق، سهم هر طرف معامله از بابت کمیسیون است و به‌صورت مجزا پرداخت می‌شود. محاسبه بر اساس نرخ‌نامه اتحادیه مشاورین املاک انجام گرفته است.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* تجمیع حق‌السهم مشاوران */}
        <TabsContent value="consultants" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" aria-hidden />
                  حق‌السهم قراردادهای نهایی‌شده به تفکیک مشاور
                </span>
                <Button variant="outline" size="sm" onClick={reload} disabled={loading} className="gap-1.5">
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />}
                  بازخوانی
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !data ? (
                <Skeleton className="h-40 rounded-xl" />
              ) : !data || data.consultantShares.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <Users className="w-10 h-10 text-muted-foreground/40 mx-auto" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    تجمیع حق‌السهم پس از همگام‌سازی قراردادها (ورود با کد پرسنلی و پیامک) محاسبه می‌شود.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border max-h-[26rem] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-12">ردیف</TableHead>
                        <TableHead>مشاور</TableHead>
                        <TableHead>قراردادها</TableHead>
                        <TableHead>مجموع سهم</TableHead>
                        <TableHead>میانگین سهم</TableHead>
                        <TableHead>تأییدشده</TableHead>
                        <TableHead>در انتظار</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.consultantShares.map((c, i) => (
                        <TableRow key={c.consultant}>
                          <TableCell>
                            <span className="inline-flex items-center justify-center w-5.5 h-5.5 min-w-5.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold tabular-nums" aria-label={`ردیف ${faNumber(i + 1)}`}>
                              {faNumber(i + 1)}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs font-bold">{c.consultant}</TableCell>
                          <TableCell className="text-xs tabular-nums">{faNumber(c.shareCount)}</TableCell>
                          <TableCell className="text-xs tabular-nums font-bold">{faPercent(c.totalPercent)}</TableCell>
                          <TableCell className="text-xs tabular-nums">{faPercent(Math.round((c.totalPercent / Math.max(1, c.shareCount)) * 10) / 10)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 tabular-nums">{faNumber(c.confirmed)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 tabular-nums">{faNumber(c.pending)}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* عملکرد مالی شعبه‌ها */}
        <TabsContent value="branches" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" aria-hidden />
                مقایسه عملکرد مالی شعبه‌ها
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !data ? (
                <Skeleton className="h-40 rounded-xl" />
              ) : !data || data.branchShares.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    پس از همگام‌سازی قراردادها و کارشناسان، عملکرد مالی شعبه‌ها محاسبه می‌شود.
                  </p>
                </div>
              ) : (
                <div className="space-y-3" role="img" aria-label="مقایسه عملکرد مالی شعبه‌ها">
                  {data.branchShares.map((b, i) => {
                    const max = Math.max(...data.branchShares.map((x) => x.contractCount));
                    return (
                      <div key={b.branch} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-2 font-bold">
                            <span className="inline-flex items-center justify-center w-5.5 h-5.5 min-w-5.5 rounded-md bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 text-[10px] font-bold tabular-nums">{faNumber(i + 1)}</span>
                            {b.branch}
                          </span>
                          <span className="text-muted-foreground tabular-nums">{faNumber(b.contractCount)} قرارداد · مجموع سهم {faPercent(b.totalPercent)}</span>
                        </div>
                        <div className="h-3 rounded-full bg-muted overflow-hidden" dir="rtl">
                          <div
                            className="h-full rounded-full bg-gradient-to-l from-teal-600 to-cyan-500"
                            style={{ width: `${Math.max(6, (b.contractCount / max) * 100)}%` }}
                            title={`${b.branch}: ${b.contractCount} قرارداد`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* نرخ‌نامه اتحادیه */}
        <TabsContent value="tariff" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" aria-hidden />
                نرخ‌نامه رسمی اتحادیه مشاورین املاک {data?.commissionConfig?.cityName ?? "تبریز"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.commissionConfig?.realEstateTariff ? (
                <div
                  className="prose-sm max-w-none text-sm leading-relaxed rounded-xl border bg-muted/30 p-4 [&_b]:text-primary [&_b]:font-bold"
                  dir="rtl"
                  dangerouslySetInnerHTML={{ __html: data.commissionConfig.realEstateTariff }}
                />
              ) : (
                <div className="space-y-3 text-sm">
                  <p className="text-muted-foreground">نرخ‌نامه زنده در دسترس نیست — قواعد رسمی تعرفه تبریز:</p>
                  <ul className="space-y-2 list-disc ps-5">
                    <li><b className="text-primary">تعرفه خرید و فروش:</b> ۱) تا سقف ۷۰۰ میلیون تومان نیم درصد از هر طرف معامله ۲) مازاد بر ۷۰۰ میلیون تومان بیست‌وپنج صدم درصد به اضافه بند ۱ از هر طرف</li>
                    <li><b className="text-primary">تعرفه رهن و اجاره:</b> ۱) یک درصد از مبلغ رهن به اضافه یک‌چهارم از اجاره‌بهای ماه اول از هر طرف قرارداد ۲) برای تمدید اجاره، یک‌دوم تعرفه مصوب از مالک و یک‌چهارم تعرفه مصوب از مستأجر</li>
                    <li><b className="text-primary">مالیات ارزش افزوده:</b> {faPercent(data?.commissionConfig?.valueAddedPercentage ?? 10)} بر عهده طرفین معامله</li>
                  </ul>
                </div>
              )}
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5">
                <TrendingUp className="w-4 h-4 text-primary mt-0.5 shrink-0" aria-hidden />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  کمیسیون قابل پرداخت، سهم هر طرف معامله است و باید به‌صورت مجزا پرداخت شود. اگر معامله با رضایت هر یک از طرفین یا به‌واسطه یکی از بندهای شرایط قانونی فسخ گردد و بنگاه عاملِ فسخ نباشد، طرفین معامله مکلف به پرداخت کمیسیون به‌صورت کامل هستند.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
