"use client";

/**
 * کاشی «استخراج اطلاعات» — استعلام زنده از سامانه واقعی ملک تبریز
 * ------------------------------------------------------
 * دو بخش تخصصی:
 *   ۱. استخراج اطلاعات «کدآگهی»: نام و نام خانوادگی آگهی‌دهنده (مالک ملک) +
 *      شماره تماس او + آدرس ملک — زنجیره عین خود سامانه آرم:
 *      properties/info/by-code → properties/details → properties/owner
 *   ۲. استخراج اطلاعات «کددرخواست»: نام و نام خانوادگی درخواست‌دهنده
 *      (مشتری ملک) + شماره تماس او — زنجیره:
 *      requests/list?code → requests/details → requests/applicant
 *
 * همه داده‌ها «زنده» از سامانه استخراج می‌شوند (بدون کش)؛
 * تاریخچه استعلام‌ها فقط افزودنی ثبت و برای ایجنت هوشمند استفاده می‌شود.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBodyVirtual, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Search, Home, ClipboardList, Phone, MapPin, User, Copy, Building2, ShieldCheck, FileSearch, History, CheckCircle2, AlertTriangle, Landmark,
} from "lucide-react";
import { AgentPanel } from "@/components/app/AgentPanel";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { faDigits } from "@/lib/jalali";
import { faDateTime, faNumber } from "@/lib/format";

interface PersonInfo {
  fullName: string;
  mobile: string;
  phone: string;
  isRegisteredUser: boolean;
}

interface PropertyResult {
  code: string;
  armId: string;
  title: string;
  owner: PersonInfo | null;
  address: string;
  relatedRealtor: string;
  details: { label: string; value: string; unit: string }[];
}

interface RequestResult {
  code: string;
  armId: string;
  title: string;
  applicant: PersonInfo | null;
  businessTitle: string;
  details: { label: string; value: string; unit: string }[];
}

interface LookupHistoryRow {
  id: string;
  kind: string;
  code: string;
  found: boolean;
  personName: string | null;
  personMobile: string | null;
  address: string | null;
  actorCode: string;
  createdAt: string;
}

/** کارت «اطلاعات تماس» — نام + موبایل با دکمه کپی و لینک تماس */
function ContactCard({ person, roleLabel }: { person: PersonInfo | null; roleLabel: string }) {
  const { toast } = useToast();
  if (!person) {
    return (
      <div className="rounded-xl border border-dashed p-4 flex items-start gap-3 bg-muted/30">
        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-bold">{roleLabel}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            اطلاعات تماس این {roleLabel} در سامانه ملک تبریز در دسترس نیست — ثبت ناقص در مراحل «ثبت آگهی/درخواست» یا محدودیت مجوز ممکن است علت باشد.
          </p>
        </div>
      </div>
    );
  }
  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast({ title: "کپی شد", description: `${label} در حافظه کپی شد.` }),
      () => toast({ title: "کپی ناموفق", description: "دسترسی به حافظه میانی ممکن نیست.", variant: "destructive" })
    );
  };
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-primary" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
            <p className="text-sm font-extrabold truncate">{person.fullName}</p>
          </div>
        </div>
        {person.isRegisteredUser && (
          <Badge variant="secondary" className="gap-1 shrink-0">
            <ShieldCheck className="w-3 h-3" aria-hidden /> کاربر ثبت‌شده
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {person.mobile && (
          <>
            <a
              href={`tel:${person.mobile}`}
              dir="ltr"
              className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary hover:bg-primary/20 transition-colors"
            >
              <Phone className="w-4 h-4" aria-hidden />
              {faDigits(person.mobile)}
            </a>
            <Button variant="outline" size="icon" onClick={() => copy(person.mobile, "شماره تماس")} aria-label="کپی شماره تماس">
              <Copy className="w-4 h-4" aria-hidden />
            </Button>
          </>
        )}
        {person.phone && (
          <span dir="ltr" className="text-xs text-muted-foreground font-medium">تلفن ثابت: {faDigits(person.phone)}</span>
        )}
        {!person.mobile && !person.phone && <span className="text-xs text-muted-foreground">شماره تماسی ثبت نشده است.</span>}
      </div>
    </div>
  );
}

/** لیست جزئیات ساختاری (عین «جزئیات» خود سامانه) */
function DetailList({ details }: { details: { label: string; value: string; unit: string }[] }) {
  if (details.length === 0) return null;
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/40 flex items-center gap-2">
        <FileSearch className="w-4 h-4 text-primary" aria-hidden />
        <p className="text-sm font-bold">جزئیات ثبت‌شده در سامانه</p>
      </div>
      <ul className="divide-y">
        {/* P6.5-09 — بدون سقف: همهٔ جزئیات */}
        {details.map((d, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="text-muted-foreground shrink-0">{d.label}</span>
            <span className="font-bold text-left" dir="auto">
              {d.value} {d.unit && <span className="text-muted-foreground font-normal">{d.unit}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExtractionPage({ settings, onSettingsChange: _osc, userRole: _role, onBack: _back }: TilePageProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"property" | "request">("property");

  // ورودی‌ها
  const [propertyCode, setPropertyCode] = useState("");
  const [requestCode, setRequestCode] = useState("");

  // وضعیت استعلام
  const [loading, setLoading] = useState<"property" | "request" | null>(null);
  const [propertyResult, setPropertyResult] = useState<PropertyResult | null>(null);
  const [requestResult, setRequestResult] = useState<RequestResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [needsOtpLogin, setNeedsOtpLogin] = useState(false);

  // تاریخچه
  const [history, setHistory] = useState<LookupHistoryRow[] | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);

  const showHistory = settings.showHistory !== false;

  const loadHistory = useCallback(async () => {
    try {
      // P6.5-09 — بدون صفحه‌بندی: کل تاریخچهٔ استخراج در یک صفحه (سقف سرور ۱۰۰۰)
      const res = await api<{ rows: LookupHistoryRow[]; total: number }>("/api/crm/lookup?limit=1000");
      setHistory(res.rows);
      setHistoryTotal(res.total);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const doLookup = useCallback(
    async (kind: "property" | "request") => {
      const code = kind === "property" ? propertyCode.trim() : requestCode.trim();
      if (!code) {
        toast({
          title: "کد را وارد کنید",
          description: kind === "property" ? "کدآگهی را برای استعلام وارد کنید." : "کددرخواست را برای استعلام وارد کنید.",
          variant: "destructive",
        });
        return;
      }
      setLoading(kind);
      setWarnings([]);
      setNeedsOtpLogin(false);
      try {
        const res = await api<{ kind: string; result: PropertyResult | RequestResult; warnings?: string[] }>("/api/crm/lookup", {
          method: "POST",
          body: { kind, code },
        });
        if (kind === "property") setPropertyResult(res.result as PropertyResult);
        else setRequestResult(res.result as RequestResult);
        setWarnings(res.warnings ?? []);
        toast({
          title: "استعلام موفق",
          description:
            kind === "property"
              ? "اطلاعات آگهی از سامانه ملک تبریز استخراج شد."
              : "اطلاعات درخواست از سامانه ملک تبریز استخراج شد.",
        });
        void loadHistory();
      } catch (err) {
        const e = err as ApiClientError;
        if (e.code === "PRECONDITION_FAILED") {
          setNeedsOtpLogin(true);
        } else if (e.code === "NOT_FOUND") {
          if (kind === "property") setPropertyResult(null);
          else setRequestResult(null);
        }
        toast({ title: "استعلام ناموفق", description: e.message, variant: "destructive" });
        void loadHistory();
      } finally {
        setLoading(null);
      }
    },
    [propertyCode, requestCode, toast, loadHistory]
  );

  return (
    <div className="space-y-6">
      {/* ایجنت هوشمند */}
      <AgentPanel tileId="extraction" />

      {needsOtpLogin && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>نیاز به ورود با پیامک</AlertTitle>
          <AlertDescription>
            استخراج زنده اطلاعات، نشست متصل به سامانه ملک تبریز می‌خواهد. از صفحه ورود، مسیر «کد پرسنلی + پیامک» را انتخاب کنید؛ ورود مدیر محلی به داده‌های زنده دسترسی ندارد.
          </AlertDescription>
        </Alert>
      )}

      {/* دو بخش استعلام */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "property" | "request")}>
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="property" className="gap-2">
            <Home className="w-4 h-4" aria-hidden /> استخراج با کدآگهی
          </TabsTrigger>
          <TabsTrigger value="request" className="gap-2">
            <ClipboardList className="w-4 h-4" aria-hidden /> استخراج با کددرخواست
          </TabsTrigger>
        </TabsList>

        {/* بخش ۱: کدآگهی */}
        <TabsContent value="property" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Home className="w-5 h-5 text-primary" aria-hidden />
                استخراج اطلاعات کدآگهی
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                کدآگهی ملک را وارد کنید تا نام و نام خانوادگی آگهی‌دهنده (مالک ملک)، شماره تماس او و آدرس ملک — مستقیماً از «سامانه مدیریت آگهی و درخواست» (آرم) — نمایش داده شود.
              </p>
              <form
                className="flex flex-col sm:flex-row gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void doLookup("property");
                }}
              >
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="property-code">کدآگهی</Label>
                  <Input
                    id="property-code"
                    value={propertyCode}
                    onChange={(e) => setPropertyCode(e.target.value)}
                    placeholder="نمونه: ۱۲۳۴۵"
                    inputMode="numeric"
                    autoComplete="off"
                    className="font-bold"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={loading !== null} className="gap-2 w-full sm:w-auto">
                    {loading === "property" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Search className="w-4 h-4" aria-hidden />}
                    استخراج اطلاعات
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {loading === "property" && !propertyResult && <Skeleton className="h-48 rounded-xl" />}

          {propertyResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <Building2 className="w-5 h-5 text-primary shrink-0" aria-hidden />
                    <span className="truncate">{propertyResult.title}</span>
                  </span>
                  <Badge variant="secondary" dir="ltr">کد {faDigits(propertyResult.code)}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ContactCard person={propertyResult.owner} roleLabel="آگهی‌دهنده (مالک ملک)" />

                <div className="rounded-xl border bg-card p-4 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-5 h-5 text-primary mt-0.5 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">آدرس ملک</p>
                      <p className="text-sm font-bold leading-relaxed">{propertyResult.address}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5 border-t pt-2.5">
                    <Landmark className="w-5 h-5 text-primary mt-0.5 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">مشاور مسؤول آگهی</p>
                      <p className="text-sm font-bold">{propertyResult.relatedRealtor}</p>
                    </div>
                  </div>
                </div>

                <DetailList details={propertyResult.details} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* بخش ۲: کددرخواست */}
        <TabsContent value="request" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" aria-hidden />
                استخراج اطلاعات کددرخواست
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                کددرخواست را وارد کنید تا نام و نام خانوادگی درخواست‌دهنده (مشتری ملک) و شماره تماس او — مستقیماً از «سامانه مدیریت آگهی و درخواست» (آرم) — نمایش داده شود.
              </p>
              <form
                className="flex flex-col sm:flex-row gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void doLookup("request");
                }}
              >
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="request-code">کددرخواست</Label>
                  <Input
                    id="request-code"
                    value={requestCode}
                    onChange={(e) => setRequestCode(e.target.value)}
                    placeholder="نمونه: ۱۲۳"
                    inputMode="numeric"
                    autoComplete="off"
                    className="font-bold"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={loading !== null} className="gap-2 w-full sm:w-auto">
                    {loading === "request" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Search className="w-4 h-4" aria-hidden />}
                    استخراج اطلاعات
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {loading === "request" && !requestResult && <Skeleton className="h-48 rounded-xl" />}

          {requestResult && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <ClipboardList className="w-5 h-5 text-primary shrink-0" aria-hidden />
                    <span className="truncate">{requestResult.title}</span>
                  </span>
                  <Badge variant="secondary" dir="ltr">کد {faDigits(requestResult.code)}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ContactCard person={requestResult.applicant} roleLabel="درخواست‌دهنده (مشتری ملک)" />

                <div className="rounded-xl border bg-card p-4 flex items-start gap-2.5">
                  <Building2 className="w-5 h-5 text-primary mt-0.5 shrink-0" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">کسب‌وکار ثبت‌کننده درخواست</p>
                    <p className="text-sm font-bold">{requestResult.businessTitle}</p>
                  </div>
                </div>

                <DetailList details={requestResult.details} />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* اخطارهای شفافیت داده */}
      {warnings.length > 0 && (
        <Alert>
          <AlertTriangle aria-hidden />
          <AlertTitle>یادداشت داده</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ps-5 space-y-1">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* تاریخچه استعلام‌ها */}
      {showHistory && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-5 h-5 text-primary" aria-hidden />
              تاریخچه استعلام‌ها
              {historyTotal > 0 && (
                <Badge variant="outline">
                  {faNumber(historyTotal)} استعلام
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history === null ? (
              <Skeleton className="h-32 rounded-xl" />
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                هنوز استعلامی ثبت نشده است. اولین استعلام را با کدآگهی یا کددرخواست انجام دهید.
              </p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">ردیف</TableHead>
                      <TableHead>نوع</TableHead>
                      <TableHead>کد</TableHead>
                      <TableHead>شخص</TableHead>
                      <TableHead>وضعیت</TableHead>
                      <TableHead>زمان</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBodyVirtual rows={history} rowKey={(h) => h.id}>
                    {(h, i) => (
                      <TableRow key={h.id}>
                        <TableCell>
                          <span className="inline-flex items-center justify-center w-5.5 h-5.5 min-w-5.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold tabular-nums" aria-label={`ردیف ${faNumber(i + 1)}`}>
                            {faNumber(i + 1)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={h.kind === "PROPERTY" ? "secondary" : "outline"} className="gap-1">
                            {h.kind === "PROPERTY" ? <Home className="w-3 h-3" aria-hidden /> : <ClipboardList className="w-3 h-3" aria-hidden />}
                            {h.kind === "PROPERTY" ? "کدآگهی" : "کددرخواست"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-bold" dir="ltr">{faDigits(h.code)}</TableCell>
                        <TableCell className="max-w-[10rem] truncate">{h.personName ?? "—"}</TableCell>
                        <TableCell>
                          {h.found ? (
                            <span className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 text-xs font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden /> یافته
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-600 text-xs font-bold">
                              <AlertTriangle className="w-3.5 h-3.5" aria-hidden /> یافت نشد
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{faDateTime(h.createdAt)}</TableCell>
                      </TableRow>
                    )}
                  </TableBodyVirtual>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
