"use client";

/**
 * بخش «اتصال به دیوار» در تنظیمات عمومی — دو روش:
 * ۱. کنارِ دیوار (کلید API رسمی + راهنمای گام‌به‌گام اخذ کلید)
 * ۲. موبایل کاربر + کد پیامکی دیوار (اکانت شخصی دیوار)
 * هر دو بخش کلید ریست اختصاصی دارند.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Loader2, KeyRound, Smartphone, RotateCcw, ExternalLink, ShieldCheck, XCircle, HelpCircle } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faDateTime } from "@/lib/format";

interface ConnectionResponse {
  ok: boolean;
  connections: {
    method: "kenar" | "phone";
    status: "connected" | "disconnected" | "pending" | "error";
    phone: string | null;
    displayName: string | null;
    hasToken: boolean;
    lastCheckedAt: string | null;
    lastError: string | null;
  }[];
  guide: {
    kenarPanelUrl: string;
    kenarDocsUrl: string;
    kenarSteps: string[];
    phoneSteps: string[];
  };
}

function StatusBadge({ status }: { status: "connected" | "disconnected" | "pending" | "error" }) {
  if (status === "connected") {
    return <Badge variant="default" className="gap-1"><ShieldCheck className="w-3 h-3" aria-hidden /> متصل</Badge>;
  }
  if (status === "pending") {
    return <Badge variant="secondary" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" aria-hidden /> در انتظار کد</Badge>;
  }
  if (status === "error") {
    return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" aria-hidden /> خطا</Badge>;
  }
  return <Badge variant="outline">قطع</Badge>;
}

export function DivarConnectionSection() {
  const { toast } = useToast();
  const [data, setData] = useState<ConnectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [savingKenar, setSavingKenar] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [phoneStage, setPhoneStage] = useState<"phone" | "code">("phone");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [resetting, setResetting] = useState<"kenar" | "phone" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<ConnectionResponse>("/api/divar/connection");
      setData(res);
      setPhoneStage(res.connections.find((c) => c.method === "phone")?.status === "pending" ? "code" : "phone");
    } catch {
      // بی‌صدا
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveKenar = async () => {
    if (apiKey.trim().length < 10) {
      toast({ title: "کلید نامعتبر", description: "کلید API کنار را کامل وارد کنید.", variant: "destructive" });
      return;
    }
    setSavingKenar(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/divar/connection", {
        method: "POST",
        body: { action: "save-kenar", apiKey: apiKey.trim() },
      });
      toast({
        title: res.ok ? "اتصال کنار برقرار شد" : "کلید پذیرفته نشد",
        description: res.message,
        variant: res.ok ? "default" : "destructive",
      });
      if (res.ok) setApiKey("");
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ذخیره کلید ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSavingKenar(false);
    }
  };

  const startPhone = async () => {
    const normalized = phone.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
    if (!/^09\d{9}$/.test(normalized)) {
      toast({ title: "شماره نامعتبر", description: "شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.", variant: "destructive" });
      return;
    }
    setPhoneBusy(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/divar/connection", {
        method: "POST",
        body: { action: "start-phone", phone: normalized },
      });
      if (res.ok) {
        setPhoneStage("code");
        toast({ title: "کد پیامکی ارسال شد", description: res.message });
      } else {
        toast({ title: "ارسال کد ناموفق", description: res.message, variant: "destructive" });
      }
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ارسال کد ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setPhoneBusy(false);
    }
  };

  const verifyPhone = async () => {
    const normalized = phone.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
    const digits = code.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
    setPhoneBusy(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/divar/connection", {
        method: "POST",
        body: { action: "verify-phone", phone: normalized, code: digits },
      });
      toast({
        title: res.ok ? "اتصال پیامکی برقرار شد" : "تأیید ناموفق",
        description: res.message,
        variant: res.ok ? "default" : "destructive",
      });
      if (res.ok) {
        setCode("");
        setPhoneStage("phone");
      }
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "تأیید کد ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setPhoneBusy(false);
    }
  };

  const reset = async (method: "kenar" | "phone") => {
    setResetting(method);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/divar/connection", {
        method: "POST",
        body: { action: "reset", method },
      });
      toast({ title: "ریست انجام شد", description: res.message });
      if (method === "phone") {
        setPhoneStage("phone");
        setCode("");
      }
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ریست ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setResetting(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" aria-hidden /> اتصال به دیوار
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  const kenar = data?.connections.find((c) => c.method === "kenar");
  const phoneConn = data?.connections.find((c) => c.method === "phone");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary" aria-hidden /> اتصال به دیوار
        </CardTitle>
        <CardDescription>دو روش اتصال برای ایجنت فایل‌یابی — هر بخش مستقل و دارای کلید ریست</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* روش ۱ — کنار دیوار */}
        <section className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-sm font-bold flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-primary" aria-hidden /> روش ۱: کنارِ دیوار (کلید API رسمی)
            </h4>
            <div className="flex items-center gap-2">
              <StatusBadge status={kenar?.status ?? "disconnected"} />
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => reset("kenar")}
                disabled={resetting === "kenar" || kenar?.status === "disconnected"}
                aria-label="ریست اتصال کنار دیوار"
              >
                {resetting === "kenar" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />}
                ریست
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            کنارِ دیوار، پلتفرم رسمی توسعه‌دهندگان دیوار است. با کلید API، ایجنت فایل‌یابی از داده ساختاریافته رسمی
            (زمان انتشار دقیق، برچسب کسب‌وکار برای تشخیص مشاور املاک) استفاده می‌کند.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="divar-kenar-key" className="text-xs">کلید API کنار (x-api-key)</Label>
            <div className="flex gap-2">
              <Input
                id="divar-kenar-key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="کلید را از پنل کنار کپی کنید…"
                dir="ltr"
                className="text-xs font-mono"
                autoComplete="off"
              />
              <Button size="sm" className="shrink-0 gap-1.5" onClick={saveKenar} disabled={savingKenar}>
                {savingKenar ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="w-3.5 h-3.5" aria-hidden />}
                ذخیره و آزمون
              </Button>
            </div>
            {kenar?.lastError && (
              <p className="text-[10px] text-destructive leading-4">{kenar.lastError}</p>
            )}
            {kenar?.status === "connected" && kenar.lastCheckedAt && (
              <p className="text-[10px] text-muted-foreground">آزمون موفق: {faDateTime(kenar.lastCheckedAt)}</p>
            )}
          </div>

          <Accordion type="single" collapsible>
            <AccordionItem value="kenar-guide" className="border-0">
              <AccordionTrigger className="text-xs py-2 text-primary">
                <span className="flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5" aria-hidden /> راهنمای گام‌به‌گام اتصال به کنارِ دیوار</span>
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                <ol className="text-xs text-muted-foreground leading-6 space-y-1.5 list-decimal list-inside">
                  {(data?.guide.kenarSteps ?? []).map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
                    <a href={data?.guide.kenarPanelUrl ?? "https://divar.ir/kenar/"} target="_blank" rel="noopener noreferrer">
                      پنل کنار دیوار <ExternalLink className="w-3 h-3" aria-hidden />
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
                    <a href={data?.guide.kenarDocsUrl ?? "https://kenar.divar.dev/"} target="_blank" rel="noopener noreferrer">
                      مستندات فنی کنار <ExternalLink className="w-3 h-3" aria-hidden />
                    </a>
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground leading-4 pt-1">
                  تا زمان دریافت کلید، ایجنت فایل‌یابی با API عمومی وب دیوار کار می‌کند — کلید کنار کیفیت داده را ارتقا می‌دهد.
                </p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* روش ۲ — موبایل + کد پیامکی */}
        <section className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-sm font-bold flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-primary" aria-hidden /> روش ۲: موبایل کاربر + کد پیامکی دیوار
            </h4>
            <div className="flex items-center gap-2">
              <StatusBadge status={phoneConn?.status ?? "disconnected"} />
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => reset("phone")}
                disabled={resetting === "phone" || phoneConn?.status === "disconnected"}
                aria-label="ریست اتصال پیامکی دیوار"
              >
                {resetting === "phone" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />}
                ریست
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            با حساب دیوار خود وارد شوید — دیوار کد تأیید را مستقیم به شماره شما پیامک می‌کند.
            {phoneConn?.phone && phoneConn.status === "connected" && (
              <span className="font-medium text-foreground"> متصل با شماره {phoneConn.phone}</span>
            )}
          </p>

          {phoneConn?.status === "connected" ? (
            <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
              <p className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" aria-hidden />
                اتصال پیامکی برقرار است{phoneConn.lastCheckedAt ? ` — از ${faDateTime(phoneConn.lastCheckedAt)}` : ""}
              </p>
              {phoneConn.lastError && <p className="text-destructive text-[10px] mt-1">{phoneConn.lastError}</p>}
            </div>
          ) : phoneStage === "phone" ? (
            <div className="space-y-1.5">
              <Label htmlFor="divar-phone" className="text-xs">شماره موبایل حساب دیوار</Label>
              <div className="flex gap-2">
                <Input
                  id="divar-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="۰۹۱۴۱۲۳۴۵۶۷"
                  inputMode="tel"
                  className="text-xs"
                  dir="ltr"
                />
                <Button size="sm" className="shrink-0 gap-1.5" onClick={startPhone} disabled={phoneBusy}>
                  {phoneBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Smartphone className="w-3.5 h-3.5" aria-hidden />}
                  دریافت کد پیامکی
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground leading-4">
                دیوار کد تأیید را پیامک می‌کند (ارسال از سمت خود دیوار انجام می‌شود).
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="divar-code" className="text-xs">کد پیامکی دریافتی از دیوار</Label>
              <div className="flex gap-2">
                <Input
                  id="divar-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="کد تأیید…"
                  inputMode="numeric"
                  className="text-xs"
                  dir="ltr"
                />
                <Button size="sm" className="shrink-0 gap-1.5" onClick={verifyPhone} disabled={phoneBusy}>
                  {phoneBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="w-3.5 h-3.5" aria-hidden />}
                  تأیید و اتصال
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                کد برای شماره {phone || phoneConn?.phone} ارسال شده است.
              </p>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
