"use client";

/**
 * صفحه کاشی «درخواست ملک» — دفتر مرکزی درخواست‌های ملک
 * ------------------------------------------------------
 * KPI + پنجره‌ها (همه/ثبت دستی/ثبت اتوماتیک/مدیریت مشتریان) + کارت‌های شماره‌دار +
 * ثبت دستی و ثبت اتوماتیک (ویزارد ۴ گامی عین آرم) + کلید «ویرایش» و «ثبت رویداد» و
 * «ثبت در سامانه ARM» + پنل شاهکار «مدیریت مشتریان» + ایجنت
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Plus, ClipboardList, UserRound, UploadCloud, CalendarPlus, Users, Zap, FileStack } from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber } from "@/lib/format";
import type { RequestRow } from "@/lib/request/types";
import type { CustomerManagementSummary } from "@/lib/types/customer-lifecycle";
import { RequestCard } from "./RequestCard";
import { NewRequestDialog, type RequestMetaResponse } from "./NewRequestDialog";
import { EventDialog } from "./EventDialog";
import { ArmRegisterDialog } from "./ArmRegisterDialog";
import { CustomerManagementPanel } from "./CustomerManagementPanel";

interface RequestsResponse {
  ok: boolean;
  rows: RequestRow[];
  stats: {
    total: number;
    manual: number;
    auto: number;
    ready: number;
    draft: number;
    armRegistered: number;
    armPending: number;
    eventsTotal: number;
    eventsThisWeek: number;
    newThisWeek: number;
  };
  customers?: CustomerManagementSummary["customers"];
  customerStats?: CustomerManagementSummary["stats"];
  requirements: { armToken: boolean; message: string };
}

export function RequestsPage({ settings }: TilePageProps) {
  const { toast } = useToast();
  const [data, setData] = useState<RequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [tab, setTab] = useState<string>((settings.defaultTab as string) ?? "all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<"manual" | "auto">("manual");
  const [editRequest, setEditRequest] = useState<RequestRow | null>(null);
  const [eventRequest, setEventRequest] = useState<RequestRow | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [registerRequest, setRegisterRequest] = useState<RequestRow | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const withCustomers = tab === "customers" ? "1" : "0";
      const res = await api<RequestsResponse>(`/api/requests?customers=${withCustomers}`);
      setData(res);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "بارگذاری ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tab, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const res = await api<RequestsResponse>("/api/requests?customers=1");
      setData((prev) => ({ ...(prev ?? res), customers: res.customers, customerStats: res.customerStats, rows: res.rows, stats: res.stats }));
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "بارگذاری مدیریت مشتریان ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setCustomersLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (tab === "customers" && !data?.customers) void loadCustomers();
     
  }, [tab]);

  // P6.5-09 — بدون صفحه‌بندی: همهٔ ردیف‌های فیلترشده در یک صفحهٔ واحد
  const allRows = data?.rows ?? [];
  const rows = (() => {
    let filtered = allRows;
    if (tab === "manual") filtered = allRows.filter((r) => r.source === "manual");
    if (tab === "auto") filtered = allRows.filter((r) => r.source === "auto");
    if (tab === "pending") filtered = allRows.filter((r) => !r.armRequestId);
    return filtered;
  })();

  const stats = data?.stats;

  const meta = data as RequestMetaResponse | null;

  const openWizard = (mode: "manual" | "auto") => {
    setWizardMode(mode);
    setEditRequest(null);
    setWizardOpen(true);
  };

  const openEdit = (r: RequestRow) => {
    setWizardMode("manual");
    setEditRequest(r);
    setWizardOpen(true);
  };

  return (
    <div data-negin="aqiq-limoonee" className="space-y-6">
      {/* نگین (PN-024) — میلهٔ گوهر aqiq-limoonee */}
      <div className="negin-bar" aria-hidden />
      {/* سربرگ + KPI */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-sec-melka-request-700" aria-hidden /> دفتر درخواست‌های ملک
            </h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              ثبت دستی و اتوماتیک با همان فرم ۴ گامی سامانه آرم (بدون دور زدن هیچ گامی)، ویرایش، ثبت رویداد و ایجنت مدیریت مشتریان.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" className="gap-1.5" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
              به‌روزرسانی
            </Button>
            <Button variant="outline" className="gap-1.5 border-teal-400 text-teal-700 hover:bg-teal-50 dark:text-teal-300" onClick={() => openWizard("manual")}>
              <UserRound className="w-4 h-4" aria-hidden /> ثبت دستی (مالک حضوری)
            </Button>
            <Button className="gap-1.5 bg-gradient-to-l from-sec-melka-request-700 to-sec-melka-request-500 text-sec-melka-request-fg shadow" onClick={() => openWizard("auto")}>
              <Zap className="w-4 h-4" aria-hidden /> ثبت اتوماتیک در آرم
            </Button>
          </div>
        </div>

        {/* KPI ها */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "کل درخواست‌ها", value: stats?.total ?? 0, icon: FileStack, cls: "from-stone-600 to-stone-400" },
            { label: "ثبت دستی", value: stats?.manual ?? 0, icon: UserRound, cls: "from-teal-600 to-cyan-500" },
            { label: "ثبت اتوماتیک", value: stats?.auto ?? 0, icon: Zap, cls: "from-amber-600 to-amber-400" },
            { label: "ثبت‌شده در آرم", value: stats?.armRegistered ?? 0, icon: UploadCloud, cls: "from-teal-600 to-cyan-500" },
            { label: "رویدادها (این هفته)", value: stats?.eventsThisWeek ?? 0, icon: CalendarPlus, cls: "from-rose-600 to-rose-400" },
            { label: "آمادهٔ ثبت در آرم", value: stats?.armPending ?? 0, icon: ClipboardList, cls: "from-amber-500 to-amber-300" },
          ].map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <Card key={i} className="border-border/60">
                <CardContent className="p-3 flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${kpi.cls} flex items-center justify-center shadow shrink-0`}>
                    <Icon className="w-4.5 h-4.5 text-white" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground leading-3 truncate">{kpi.label}</p>
                    <p className="text-lg font-extrabold leading-6">{faNumber(kpi.value)}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* الزامات */}
        {data && !data.requirements.armToken && (
          <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 leading-5">{data.requirements.message}</p>
        )}
      </section>

      {/* پنجره‌ها */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { value: "all", label: `همه (${faNumber(stats?.total ?? 0)})` },
          { value: "manual", label: `ثبت دستی (${faNumber(stats?.manual ?? 0)})` },
          { value: "auto", label: `ثبت اتوماتیک (${faNumber(stats?.auto ?? 0)})` },
          { value: "pending", label: `ثبت‌نشده در آرم (${faNumber(stats?.armPending ?? 0)})` },
          { value: "customers", label: "مدیریت مشتریان (ایجنت)" },
        ].map((t) => (
          <Button
            key={t.value}
            size="sm"
            variant={tab === t.value ? "default" : "outline"}
            onClick={() => setTab(t.value)}
            className={tab === t.value && t.value === "customers" ? "bg-gradient-to-l from-rose-600 to-rose-500 text-white" : undefined}
          >
            {t.value === "customers" && <Users className="w-3.5 h-3.5 me-1" aria-hidden />}
            {t.label}
          </Button>
        ))}
      </div>

      {/* محتوا */}
      {tab === "customers" ? (
        <CustomerManagementPanel
          summary={data?.customers && data.customerStats ? { customers: data.customers, stats: data.customerStats } : null}
          loading={customersLoading && !data?.customers}
          onSelectRequest={undefined}
        />
      ) : loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground/40" aria-hidden />
            <p className="text-sm font-bold">هنوز درخواستی ثبت نشده است</p>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
              دو مسیر ثبت دارید: «ثبت دستی» برای مشتریانی که حضوری درخواست ثبت دارند و «ثبت اتوماتیک» که فرم را پس از تکمیل،
              همانند یک کاربر عادی مرحله‌به‌مرحله در سامانه آرم ملک تبریز ثبت می‌کند. هر دو با همان فرم ۴ گامی خود سامانه.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <Button variant="outline" className="gap-1.5" onClick={() => openWizard("manual")}>
                <Plus className="w-4 h-4" aria-hidden /> ثبت دستی
              </Button>
              <Button className="gap-1.5 bg-gradient-to-l from-teal-600 to-cyan-500 text-white" onClick={() => openWizard("auto")}>
                <Zap className="w-4 h-4" aria-hidden /> ثبت اتوماتیک
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((r, i) => (
            <RequestCard
              key={r.id}
              request={r}
              index={i}
              showCompleteness={settings.showCompleteness !== false}
              busy={false}
              onEdit={openEdit}
              onEvent={(req) => {
                setEventRequest(req);
                setEventOpen(true);
              }}
              onRegister={(req) => {
                setRegisterRequest(req);
                setRegisterOpen(true);
              }}
              onDetails={(req) => {
                // جزییات = ویرایش (همان ویزارد ۴ گامی با مقادیر پرشده)
                openEdit(req);
              }}
            />
          ))}
        </div>
      )}

      {/* ایجنت کاشی — مدیریت مشتریان */}
      <AgentPanel tileId="requests" />

      {/* دیالوگ‌ها */}
      <NewRequestDialog
        open={wizardOpen}
        onOpenChange={(o) => {
          setWizardOpen(o);
          if (!o) setEditRequest(null);
        }}
        mode={wizardMode}
        editRequest={editRequest}
        meta={meta}
        armToken={data?.requirements.armToken ?? false}
        onSaved={() => {
          void load();
          if (tab === "customers") void loadCustomers();
        }}
      />
      <EventDialog
        request={eventRequest}
        open={eventOpen}
        onOpenChange={setEventOpen}
        onSaved={() => {
          void load();
          if (tab === "customers") void loadCustomers();
        }}
      />
      <ArmRegisterDialog
        request={registerRequest}
        open={registerOpen}
        onOpenChange={(o) => {
          setRegisterOpen(o);
          if (!o) setRegisterRequest(null);
        }}
        onDone={() => void load()}
      />
    </div>
  );
}


/** P6549 — خروجی پیش‌فرض برای بارگذاری تنبل (lazyPage) */
export default RequestsPage;
