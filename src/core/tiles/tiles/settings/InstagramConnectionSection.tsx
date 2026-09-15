"use client";

/**
 * بخش «اتصال به اینستاگرام» در تنظیمات عمومی
 * ------------------------------------------------------
 * ثبت توکن Graph API حساب کسب‌وکار + شناسه IG User + آزمون زنده + ریست
 * + تنظیمات مولد محتوا (لحن پیش‌فرض + خط تماس در کپشن)
 * + راهنمای گام‌به‌گام اخذ توکن
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Instagram, RotateCcw, ExternalLink, ShieldCheck, XCircle, HelpCircle, Sparkles } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faDateTime } from "@/lib/format";

interface ConnectionResponse {
  ok: boolean;
  connection: {
    status: "connected" | "disconnected" | "error";
    igUserId: string | null;
    username: string | null;
    displayName: string | null;
    hasToken: boolean;
    lastCheckedAt: string | null;
    lastError: string | null;
  };
  settings: { defaultTone: string; includeContactInCaption: boolean; contactLine: string };
  guide: { steps: string[]; docsUrl: string; graphExplorerUrl: string };
  tones: { value: string; label: string }[];
}

export function InstagramConnectionSection() {
  const { toast } = useToast();
  const [data, setData] = useState<ConnectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [igUserId, setIgUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tone, setTone] = useState("professional");
  const [includeContact, setIncludeContact] = useState(true);
  const [contactLine, setContactLine] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<ConnectionResponse>("/api/instagram/connection");
      setData(res);
      setTone(res.settings.defaultTone);
      setIncludeContact(res.settings.includeContactInCaption);
      setContactLine(res.settings.contactLine);
    } catch {
      // بی‌صدا
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (token.trim().length < 20) {
      toast({ title: "توکن نامعتبر", description: "توکن دسترسی Graph API را کامل وارد کنید.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await api<{ ok: boolean; message: string; username?: string }>("/api/instagram/connection", {
        method: "POST",
        body: { action: "save", accessToken: token.trim(), igUserId: igUserId.trim() || undefined },
      });
      toast({ title: res.ok ? "اتصال اینستاگرام برقرار شد" : "توکن پذیرفته نشد", description: res.message, variant: res.ok ? "default" : "destructive" });
      if (res.ok) {
        setToken("");
        setIgUserId("");
      }
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ذخیره ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const retest = async () => {
    setTesting(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/instagram/connection", {
        method: "POST",
        body: { action: "retest" },
      });
      toast({ title: res.ok ? "اتصال سالم است" : "اتصال قطع است", description: res.message, variant: res.ok ? "default" : "destructive" });
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "آزمون ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const reset = async () => {
    setResetting(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/instagram/connection", {
        method: "POST",
        body: { action: "reset" },
      });
      toast({ title: "ریست انجام شد", description: res.message });
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ریست ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api<{ ok: boolean; message: string }>("/api/instagram/connection", {
        method: "POST",
        body: {
          action: "settings",
          settings: { defaultTone: tone, includeContactInCaption: includeContact, contactLine },
        },
      });
      toast({ title: "تنظیمات محتوا ذخیره شد" });
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ذخیره ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Instagram className="w-5 h-5 text-rose-600 dark:text-rose-400" aria-hidden /> اتصال به اینستاگرام
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  const conn = data?.connection;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Instagram className="w-5 h-5 text-rose-600 dark:text-rose-400" aria-hidden /> اتصال به اینستاگرام
        </CardTitle>
        <CardDescription>حساب اینستاگرام کسب‌وکار برای کلید «انتقال به اینستاگرام» کاشی آگهی</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* وضعیت */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {conn?.status === "connected" ? (
              <Badge className="gap-1 bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                <ShieldCheck className="w-3 h-3" aria-hidden /> متصل{conn.username ? ` — ${conn.username}` : ""}
              </Badge>
            ) : conn?.status === "error" ? (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="w-3 h-3" aria-hidden /> خطا
              </Badge>
            ) : (
              <Badge variant="outline">قطع</Badge>
            )}
            {conn?.lastCheckedAt && <span className="text-[10px] text-muted-foreground">آزمون: {faDateTime(conn.lastCheckedAt)}</span>}
          </div>
          <div className="flex items-center gap-2">
            {conn?.status === "connected" && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void retest()} disabled={testing}>
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="w-3.5 h-3.5" aria-hidden />}
                آزمون مجدد
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void reset()}
              disabled={resetting || conn?.status === "disconnected"}
              aria-label="ریست اتصال اینستاگرام"
            >
              {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />}
              ریست
            </Button>
          </div>
        </div>

        {conn?.lastError && <p className="text-[10px] text-destructive leading-4">{conn.lastError}</p>}

        {/* فرم اعتبارنامه */}
        <section className="rounded-xl border p-4 space-y-3">
          <h4 className="text-sm font-bold">اعتبارنامه Graph API</h4>
          <div className="space-y-1.5">
            <Label htmlFor="ig-token" className="text-xs">توکن دسترسی (Access Token)</Label>
            <Input
              id="ig-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="EAAG… (از Graph API Explorer یا System User)"
              dir="ltr"
              className="text-xs font-mono"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ig-user" className="text-xs">شناسه حساب اینستاگرام (IG User ID — اختیاری اگر توکن «me» بپذیرد)</Label>
            <Input
              id="ig-user"
              value={igUserId}
              onChange={(e) => setIgUserId(e.target.value)}
              placeholder="۱۷۸۴۱۴…"
              dir="ltr"
              className="text-xs font-mono"
              inputMode="numeric"
            />
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="w-3.5 h-3.5" aria-hidden />}
            ذخیره و آزمون
          </Button>

          <Accordion type="single" collapsible>
            <AccordionItem value="ig-guide" className="border-0">
              <AccordionTrigger className="text-xs py-2 text-primary">
                <span className="flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" aria-hidden /> راهنمای گام‌به‌گام اخذ توکن (حساب کسب‌وکار)
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                <ol className="text-xs text-muted-foreground leading-6 space-y-1.5 list-decimal list-inside">
                  {(data?.guide.steps ?? []).map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
                    <a href={data?.guide.docsUrl ?? "https://developers.facebook.com/docs/instagram-api"} target="_blank" rel="noopener noreferrer">
                      مستندات رسمی <ExternalLink className="w-3 h-3" aria-hidden />
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
                    <a href={data?.guide.graphExplorerUrl ?? "https://developers.facebook.com/tools/explorer/"} target="_blank" rel="noopener noreferrer">
                      Graph API Explorer <ExternalLink className="w-3 h-3" aria-hidden />
                    </a>
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* تنظیمات مولد محتوا */}
        <section className="rounded-xl border p-4 space-y-3">
          <h4 className="text-sm font-bold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" aria-hidden /> تنظیمات مولد محتوای اینستاگرام
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">لحن پیش‌فرض محتوا</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="text-xs" aria-label="لحن پیش‌فرض"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(data?.tones ?? []).map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ig-contact" className="text-xs">خط تماس در کپشن (شماره دفتر/آیدی)</Label>
              <Input id="ig-contact" value={contactLine} onChange={(e) => setContactLine(e.target.value)} placeholder="۰۴۱-۳۳۳۳… یا آیدی دایرکت" className="text-xs" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-card p-3">
            <div className="space-y-0.5 me-4">
              <span className="text-xs font-medium">افزودن راه تماس به انتهای کپشن</span>
              <p className="text-[10px] text-muted-foreground">فراخوان اقدام تماس در همه پست‌ها/رییلزها</p>
            </div>
            <Switch checked={includeContact} onCheckedChange={setIncludeContact} aria-label="افزودن راه تماس به کپشن" />
          </div>
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => void saveSettings()} disabled={savingSettings}>
            {savingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}
            ذخیره تنظیمات محتوا
          </Button>
        </section>
      </CardContent>
    </Card>
  );
}
