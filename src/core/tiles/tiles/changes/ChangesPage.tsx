"use client";

/**
 * کاشی «تغییرات» — صفحهٔ اصلی (DIR-CHANGES-TILE-002 · دستور مالک ۱۴۰۵/۰۸/۲۹)
 * ---------------------------------------------------------------------------
 * ساختار تازه (فقط همین‌ها — سایر بخش‌ها حذف شد):
 *   ۰) حالت تمام‌ظرفیت (گام سوم): شروع/پایان + وضعیت رلهٔ ترموکس + صف اولویت‌ها
 *   ۱) کدآگهی — تغییر در کد · حذف کد
 *   ۲) کددرخواست — تغییر در کد · حذف کد
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Zap, ZapOff, RefreshCw, Building2, ClipboardList, Loader2, Smartphone, Cpu } from "lucide-react";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { useToast } from "@/hooks/use-toast";
import { RequestChangesPanel } from "./RequestChangesPanel";
import { ListingChangesPanel } from "./ListingChangesPanel";

interface SessionView {
  active: boolean;
  session: { startedAt: string; actorName: string; note: string; expiresAt: string; actor: string; started: { queuePending: number; queueDispatched: number } } | null;
  expiresInMs: number | null;
  maxMs: number;
}

interface ChangesStatus {
  ok: boolean;
  session: SessionView;
  relay: {
    mode: string;
    active: boolean;
    relayModeActive: boolean;
    online: boolean;
    devices: Array<{ label: string; online: boolean; served: number; errors: number; lastRoundtripMs: number | null }>;
    queue: { pending: number; dispatched: number; done24h: number; failed24h: number; expired24h: number };
  };
  priorityQueue: { changes: number; interactive: number; bulk: number } | null;
  role: string;
}

export function ChangesPage({ userRole }: TilePageProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<ChangesStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<ChangesStatus>("/api/changes", { timeoutMs: 30_000 });
      setStatus(res);
    } catch {
      /* نمایش صادقانه در کارت وضعیت */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000); // نبض ۱۵ثانیه‌ای وضعیت (نشست/رله/صف)
    return () => clearInterval(t);
  }, [load]);

  const toggleSession = async (action: "begin" | "end") => {
    setToggling(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/changes/session", {
        method: "POST",
        body: { action },
        timeoutMs: 30_000,
      });
      toast({ title: action === "begin" ? "حالت تمام‌ظرفیت فعال شد" : "حالت تمام‌ظرفیت پایان یافت", description: res.message });
      await load();
    } catch (err) {
      toast({ title: "خطا در تغییر حالت", description: (err as ApiClientError).message, variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  const s = status?.session;
  const relay = status?.relay;
  const pq = status?.priorityQueue;
  const remainingMin = s?.expiresInMs != null ? Math.max(0, Math.ceil(s.expiresInMs / 60_000)) : null;

  return (
    <div className="space-y-4" data-tile-page="changes">
      {/* ── سربرگ ── */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">تغییرات — تغییر در کد و حذف کد (کدآگهی و کددرخواست)</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-5">
            صاحب‌اختیار مالک در سامانه ARM ملک تبریز — تغییر اطلاعات مالک آگهی، تغییر تاریخ «ایجاد مشاور» با آبشار اتوماتیک تاریخچه‌ها، و حذف کامل کدها با پاکسازی کامل آثار — با شناخت کامل گزارش‌های dir-reg-req-099-001 و DIR-CHANGES-TILE-001.
            {userRole !== "OWNER" ? " — این کاشی فقط برای مالک فعال است." : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1 shrink-0">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> بروزرسانی وضعیت
        </Button>
      </div>

      {/* ── گام سوم: حالت تمام‌ظرفیت ── */}
      <Card className={s?.active ? "border-amber-400/60 shadow-md shadow-amber-500/10" : ""}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Cpu className="h-4 w-4 text-amber-600" />
            حالت تمام‌ظرفیت ترموکس (گام سوم)
            {s?.active ? <Badge className="bg-amber-500 hover:bg-amber-500">فعال{remainingMin != null ? ` · ${remainingMin} دقیقه تا انقضای خودکار` : ""}</Badge> : <Badge variant="secondary">غیرفعال</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground leading-5">
            با فعال‌سازی: بروزرسانی چهار فهرست (آگهی/درخواست/معاملات/مشاوران) متوقف می‌شود و تمام ظرفیت رلهٔ ترموکس به این کاشی اختصاص می‌یابد — آیتم‌های این کاشی با اولویت سقف (۱۰) مقدم بر OTP و سینک اجرا می‌شوند و کارهای انبوه صف صبر می‌کنند. هر عملیات ثبت/تغییر نیز این حالت را خودکار فعال می‌کند. انقضای خودکار: ۳۰ دقیقه.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="rounded-lg border border-border bg-background/60 p-2 flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
              <div>
                <div className="text-muted-foreground text-[10px]">رلهٔ ترموکس</div>
                <div className="font-medium">{relay ? (relay.online ? "برخط ✓" : "آفلاین") : "—"}</div>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-2">
              <div className="text-muted-foreground text-[10px]">صف رله (در انتظار)</div>
              <div className="font-medium font-mono" dir="ltr">{relay?.queue.pending ?? "—"} / {relay?.queue.dispatched ?? "—"} dispatched</div>
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-2">
              <div className="text-muted-foreground text-[10px]">اولویت کاشی (۱۰)</div>
              <div className="font-medium font-mono" dir="ltr">{pq?.changes ?? "—"} آیتم</div>
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-2">
              <div className="text-muted-foreground text-[10px]">انبوه معلق (۰-۴)</div>
              <div className="font-medium font-mono" dir="ltr">{pq?.bulk ?? "—"}</div>
            </div>
          </div>
          {s?.active && s.session ? (
            <div className="text-[11px] text-muted-foreground">
              شروع: {s.session.actorName}{s.session.note ? ` · ${s.session.note}` : ""}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => toggleSession("begin")}
              disabled={toggling || s?.active}
              className="gap-1 bg-amber-600 hover:bg-amber-700"
            >
              {toggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              شروع حالت تمام‌ظرفیت
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toggleSession("end")}
              disabled={toggling || !s?.active}
              className="gap-1"
            >
              <ZapOff className="h-3.5 w-3.5" />
              پایان و بازگشت چرخه‌های عادی
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── دو بخش کاشی ── */}
      <Tabs defaultValue="listing">
        <TabsList className="grid w-full grid-cols-2 h-auto">
          <TabsTrigger value="listing" className="gap-1.5 text-xs py-2">
            <Building2 className="h-4 w-4" />
            ۱. کدآگهی — تغییر · حذف
          </TabsTrigger>
          <TabsTrigger value="request" className="gap-1.5 text-xs py-2">
            <ClipboardList className="h-4 w-4" />
            ۲. کددرخواست — تغییر · حذف
          </TabsTrigger>
        </TabsList>
        <TabsContent value="listing" className="mt-3">
          <ListingChangesPanel />
        </TabsContent>
        <TabsContent value="request" className="mt-3">
          <RequestChangesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ChangesPage;
