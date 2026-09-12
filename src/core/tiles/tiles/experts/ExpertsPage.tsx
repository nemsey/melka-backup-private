"use client";

/**
 * کاشی «کارشناسان» — صفحه داخلی
 * اطلاعات کامل کارشناسان ملک تبریز با فیلتر (نام، موبایل، کد پرسنلی، آدرس، شعبه، وضعیت)
 * + شاخص‌های عملکرد هر کارشناس + بینش‌های ایجنت.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Filter, RotateCcw, Search, Users, UserCheck, UserX, Phone, MapPin, Building, Hash, Trophy } from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faToman, faNumber, faDate, faDigits, enDigits } from "@/lib/format";

interface ExRow {
  id: string;
  personnelCode: string;
  fullName: string;
  mobile: string;
  address: string;
  branch: string;
  active: boolean;
  joinedAt: string;
  dealCount: number;
  totalVolume: number;
}

interface Meta {
  branches: string[];
}

const EMPTY = { fullName: "", mobile: "", personnelCode: "", address: "", branch: "all", active: "all" };
type Filters = typeof EMPTY;

const SEGMENT_STYLE: Record<string, string> = {
  top: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  mid: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  inactive: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
};

export function ExpertsPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back }: TilePageProps) {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rows, setRows] = useState<ExRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const viewMode = String(settings.viewMode ?? "cards");

  useEffect(() => {
    api<{ branches: string[] }>("/api/crm/meta")
      .then(setMeta)
      .catch(() => setMeta({ branches: [] }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (applied.fullName) params.set("fullName", applied.fullName);
      if (applied.mobile) params.set("mobile", enDigits(applied.mobile));
      if (applied.personnelCode) params.set("personnelCode", enDigits(applied.personnelCode));
      if (applied.address) params.set("address", applied.address);
      if (applied.branch !== "all") params.set("branch", applied.branch);
      if (applied.active !== "all") params.set("active", applied.active);
      params.set("limit", "500");

      const res = await api<{ rows: ExRow[]; total: number }>(`/api/crm/experts?${params.toString()}`);
      setRows(res.rows);
      setTotal(res.total);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "خطا در دریافت کارشناسان", description: e.message, variant: "destructive" });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applied, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    if (!rows) return null;
    const active = rows.filter((r) => r.active).length;
    const withDeals = rows.filter((r) => r.dealCount > 0);
    const best = [...rows].sort((a, b) => b.totalVolume - a.totalVolume)[0];
    return { count: rows.length, active, withDeals: withDeals.length, best };
  }, [rows]);

  const setF = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <AgentPanel tileId="experts" />

      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-primary" aria-hidden />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">کل کارشناسان</p>
                <p className="text-lg font-extrabold">{faNumber(kpis.count)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5 text-emerald-600" aria-hidden />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">کارشناسان فعال</p>
                <p className="text-lg font-extrabold">{faNumber(kpis.active)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 flex items-center justify-center shrink-0">
                <UserX className="w-5 h-5 text-rose-600" aria-hidden />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">غیرفعال</p>
                <p className="text-lg font-extrabold">{faNumber(kpis.count - kpis.active)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5 text-amber-600" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">صدرنشین ارزش معاملات</p>
                <p className="text-sm font-extrabold truncate">{kpis.best?.fullName ?? "—"}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* فیلترها */}
      <Card>
        <CardContent className="pt-6">
          <form
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied({ ...filters });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="f-name">نام و نام خانوادگی</Label>
              <Input id="f-name" placeholder="مثال: علی اکبری" value={filters.fullName} onChange={(e) => setF("fullName", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-mobile">شماره موبایل</Label>
              <Input id="f-mobile" inputMode="numeric" dir="ltr" className="text-left" placeholder="0914xxxxxxx" value={filters.mobile} onChange={(e) => setF("mobile", e.target.value.replace(/[^\d۰-۹]/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-code">کد پرسنلی</Label>
              <Input id="f-code" inputMode="numeric" dir="ltr" className="text-left" placeholder="4100313xx" value={filters.personnelCode} onChange={(e) => setF("personnelCode", e.target.value.replace(/[^\d۰-۹]/g, ""))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="f-address">آدرس</Label>
              <Input id="f-address" placeholder="خیابان، محله…" value={filters.address} onChange={(e) => setF("address", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-branch">شعبه</Label>
              <Select value={filters.branch} onValueChange={(v) => setF("branch", v)}>
                <SelectTrigger id="f-branch">
                  <SelectValue placeholder="همه شعبه‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه شعبه‌ها</SelectItem>
                  {meta?.branches.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-active">وضعیت</Label>
              <Select value={filters.active} onValueChange={(v) => setF("active", v)}>
                <SelectTrigger id="f-active">
                  <SelectValue placeholder="همه" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                  <SelectItem value="true">فعال</SelectItem>
                  <SelectItem value="false">غیرفعال</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 lg:col-span-3">
              <Button type="submit" className="gap-2" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Search className="w-4 h-4" aria-hidden />}
                اعمال فیلتر
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setFilters(EMPTY);
                  setApplied(EMPTY);
                }}
              >
                <RotateCcw className="w-4 h-4" aria-hidden /> پاک‌سازی
              </Button>
              {total > 0 && (
                <Badge variant="secondary" className="mb-1">
                  {faNumber(total)} کارشناس
                </Badge>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* فهرست کارشناسان */}
      {rows === null ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground text-sm">
            هیچ کارشناسی با این فیلترها یافت نشد.
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((e, i) => {
            const segment = e.dealCount === 0 ? "inactive" : e.totalVolume > 8e9 ? "top" : e.totalVolume > 2e9 ? "mid" : "low";
            return (
              <Card key={e.id} className="tile-pop" style={{ animationDelay: `${i * 0.03}s` }}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start gap-4">
                    <Avatar className="w-14 h-14 shrink-0">
                      <AvatarFallback className="bg-primary/15 text-primary font-bold text-base">
                        {e.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-sm sm:text-base">{e.fullName}</h4>
                        <Badge className={`${SEGMENT_STYLE[segment]} text-[11px]`}>
                          {segment === "top" ? "پیشتاز" : segment === "mid" ? "پایدار" : segment === "low" ? "کم‌فعالیت" : "بدون معامله"}
                        </Badge>
                        {!e.active && <Badge variant="destructive" className="text-[11px]">غیرفعال</Badge>}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Hash className="w-3.5 h-3.5 shrink-0" aria-hidden />
                          <span dir="ltr" className="font-mono">{faDigits(e.personnelCode)}</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden />
                          <span dir="ltr" className="font-mono">{faDigits(e.mobile)}</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-muted-foreground col-span-1 sm:col-span-2 truncate" title={e.address}>
                          <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden />
                          {e.address}
                        </span>
                        <span className="flex items-center gap-1.5 text-muted-foreground col-span-1 sm:col-span-2">
                          <Building className="w-3.5 h-3.5 shrink-0" aria-hidden />
                          {e.branch}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1 border-t">
                        <Badge variant="secondary" className="text-[11px]">
                          {faNumber(e.dealCount)} معامله
                        </Badge>
                        <Badge variant="secondary" className="text-[11px]">
                          {faToman(e.totalVolume)} حجم
                        </Badge>
                        <span className="text-[11px] text-muted-foreground mr-auto self-center">
                          عضویت: {faDate(e.joinedAt)}
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
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b bg-muted/40">
                <tr className="text-right">
                  <th className="p-3">نام</th>
                  <th className="p-3">کد پرسنلی</th>
                  <th className="p-3">موبایل</th>
                  <th className="p-3 hidden md:table-cell">آدرس</th>
                  <th className="p-3">شعبه</th>
                  <th className="p-3">وضعیت</th>
                  <th className="p-3">معاملات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-medium whitespace-nowrap">{e.fullName}</td>
                    <td dir="ltr" className="p-3 font-mono text-left">{faDigits(e.personnelCode)}</td>
                    <td dir="ltr" className="p-3 font-mono text-left">{faDigits(e.mobile)}</td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">{e.address}</td>
                    <td className="p-3">{e.branch}</td>
                    <td className="p-3">
                      {e.active ? <Badge className="bg-emerald-600">فعال</Badge> : <Badge variant="destructive">غیرفعال</Badge>}
                    </td>
                    <td className="p-3">{faNumber(e.dealCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
