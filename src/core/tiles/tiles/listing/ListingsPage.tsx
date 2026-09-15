"use client";

/**
 * صفحه کاشی «آگهی» — دفتر مرکزی فایل‌های آگهی
 * ------------------------------------------------------
 * KPI + پنجره‌ها (همه/دستی/از فایل‌یابی/در انتظار اقدام) + کارت‌های شماره‌دار
 * + ثبت دستی (ویزارد ۵ گامی) + کلیدهای انتقال به CRM و اینستاگرام + ایجنت
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Plus, Megaphone, UploadCloud, Instagram, FileStack, UserRound, ClipboardCheck, Settings2 } from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber } from "@/lib/format";
import type { ListingRow } from "@/lib/listing/types";
import { ListingCard } from "./ListingCard";
import { NewListingDialog } from "./NewListingDialog";
import { ListingDetailsDialog } from "./ListingDetailsDialog";
import { CrmTransferDialog } from "./CrmTransferDialog";
import { InstagramDialog } from "./InstagramDialog";

interface ListingsResponse {
  ok: boolean;
  rows: ListingRow[];
  stats: {
    total: number;
    manual: number;
    fromDivar: number;
    drafts: number;
    crmTransferred: number;
    instagramPublished: number;
    pendingBoth: number;
  };
  requirements: { armToken: boolean; message: string };
}

export function ListingsPage({ settings, onSettingsChange }: TilePageProps) {
  const { toast } = useToast();
  const [data, setData] = useState<ListingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>((settings.defaultTab as string) ?? "all");
  const [showSettings, setShowSettings] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [detailsListing, setDetailsListing] = useState<ListingRow | null>(null);
  const [crmListing, setCrmListing] = useState<ListingRow | null>(null);
  const [igListing, setIgListing] = useState<ListingRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<ListingsResponse>("/api/listings");
      setData(res);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "بارگذاری ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageSize = Number(settings.pageSize ?? 20) || 20;
  const allRows = data?.rows ?? [];
  const rows = (() => {
    let filtered = allRows;
    if (tab === "manual") filtered = allRows.filter((r) => r.source === "manual");
    if (tab === "divar") filtered = allRows.filter((r) => r.source === "divar");
    if (tab === "pending") filtered = allRows.filter((r) => !r.crmTransferredAt || !r.instagramPublishedAt);
    return filtered.slice(0, pageSize);
  })();

  const stats = data?.stats;

  return (
    <div className="space-y-6">
      {/* سربرگ + KPI */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold flex items-center gap-2">
              <Megaphone className="w-6 h-6 text-amber-600 dark:text-amber-400" aria-hidden /> دفتر فایل‌های آگهی
            </h2>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              ثبت دستی (۵ گامی عین فرم آرم)، ثبت خودکار فایل‌های تأییدشده فایل‌یابی، انتقال گام‌به‌گام به CRM ملک تبریز و انتشار هوشمند در اینستاگرام.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-1.5" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
              به‌روزرسانی
            </Button>
            <Button variant="outline" size="icon" onClick={() => setShowSettings((v) => !v)} aria-label="تنظیمات کاشی آگهی">
              <Settings2 className="w-4 h-4" aria-hidden />
            </Button>
            <Button className="gap-1.5 bg-gradient-to-l from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white shadow" onClick={() => setNewOpen(true)}>
              <Plus className="w-4 h-4" aria-hidden /> ثبت دستی آگهی
            </Button>
          </div>
        </div>

        {/* KPI ها */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "کل فایل‌ها", value: stats?.total ?? 0, icon: FileStack, cls: "from-stone-600 to-stone-400" },
            { label: "ثبت دستی", value: stats?.manual ?? 0, icon: UserRound, cls: "from-amber-600 to-amber-400" },
            { label: "از فایل‌یابی", value: stats?.fromDivar ?? 0, icon: Megaphone, cls: "from-teal-600 to-cyan-500" },
            { label: "منتقل به آرم", value: stats?.crmTransferred ?? 0, icon: UploadCloud, cls: "from-teal-600 to-cyan-500" },
            { label: "منتشر در اینستاگرام", value: stats?.instagramPublished ?? 0, icon: Instagram, cls: "from-rose-600 to-rose-400" },
            { label: "در انتظار اقدام", value: stats?.pendingBoth ?? 0, icon: ClipboardCheck, cls: "from-amber-500 to-amber-300" },
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

      {/* تنظیمات کاشی */}
      {showSettings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">تنظیمات کاشی آگهی</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">پنجره پیش‌فرض:</span>
              {[
                { value: "all", label: "همه" },
                { value: "manual", label: "ثبت دستی" },
                { value: "divar", label: "از فایل‌یابی" },
              ].map((o) => (
                <Button
                  key={o.value}
                  size="sm"
                  variant={tab === o.value ? "default" : "outline"}
                  onClick={() => {
                    setTab(o.value);
                    onSettingsChange({ defaultTab: o.value });
                  }}
                >
                  {o.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">تعداد فایل در هر صفحه:</span>
              {[10, 20, 50].map((n) => (
                <Button key={n} size="sm" variant={Number(settings.pageSize ?? 20) === n ? "default" : "outline"} onClick={() => onSettingsChange({ pageSize: n })}>
                  {faNumber(n)}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* پنجره‌ها + فهرست */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            فایل‌های آگهی
            {stats && <Badge variant="secondary" className="text-[10px]">{faNumber(stats.total)} فایل</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-52 rounded-xl" />
              ))}
            </div>
          )}

          {!loading && (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-3 flex-wrap h-auto">
                <TabsTrigger value="all" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  همه <Badge variant="secondary" className="text-[9px] px-1.5">{faNumber(stats?.total ?? 0)}</Badge>
                </TabsTrigger>
                <TabsTrigger value="manual" className="text-xs gap-1.5">
                  ثبت دستی <Badge variant="secondary" className="text-[9px] px-1.5">{faNumber(stats?.manual ?? 0)}</Badge>
                </TabsTrigger>
                <TabsTrigger value="divar" className="text-xs gap-1.5">
                  از فایل‌یابی <Badge variant="secondary" className="text-[9px] px-1.5">{faNumber(stats?.fromDivar ?? 0)}</Badge>
                </TabsTrigger>
                <TabsTrigger value="pending" className="text-xs gap-1.5">
                  در انتظار اقدام <Badge variant="secondary" className="text-[9px] px-1.5">{faNumber(allRows.filter((r) => !r.crmTransferredAt || !r.instagramPublishedAt).length)}</Badge>
                </TabsTrigger>
              </TabsList>

              {["all", "manual", "divar", "pending"].map((t) => (
                <TabsContent key={t} value={t} className="mt-0">
                  {rows.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
                      <Megaphone className="w-10 h-10 text-muted-foreground/40 mx-auto" aria-hidden />
                      <p className="text-sm font-bold">فایلی در این پنجره نیست</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        با «ثبت دستی آگهی» فایل مالک حضوری را ۵ گامی ثبت کنید؛ فایل‌های تأییدشده کاشی فایل‌یابی نیز خودکار اینجا ثبت می‌شوند.
                      </p>
                      <Button className="gap-1.5 mt-1 bg-gradient-to-l from-amber-600 to-amber-500 text-white" onClick={() => setNewOpen(true)}>
                        <Plus className="w-4 h-4" aria-hidden /> ثبت نخستین فایل
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {rows.map((l, i) => (
                        <ListingCard
                          key={l.id}
                          listing={l}
                          index={i}
                          armToken={data?.requirements.armToken ?? false}
                          busy={busy}
                          onDetails={() => setDetailsListing(l)}
                          onTransferCrm={() => setCrmListing(l)}
                          onInstagram={() => setIgListing(l)}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* ایجنت آگهی */}
      <AgentPanel tileId="listings" />

      {/* دیالوگ‌ها */}
      <NewListingDialog open={newOpen} onOpenChange={setNewOpen} onCreated={() => void load()} />
      <ListingDetailsDialog listing={detailsListing} open={Boolean(detailsListing)} onOpenChange={(v) => !v && setDetailsListing(null)} onChanged={() => void load()} />
      <CrmTransferDialog
        listing={crmListing}
        open={Boolean(crmListing)}
        onOpenChange={(v) => !v && setCrmListing(null)}
        onTransferred={() => void load()}
      />
      <InstagramDialog
        listing={igListing}
        open={Boolean(igListing)}
        onOpenChange={(v) => !v && setIgListing(null)}
        onPublished={() => void load()}
      />
    </div>
  );
}
