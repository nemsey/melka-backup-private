"use client";

/**
 * دیالوگ «ثبت در سامانه ARM» — مجری گام‌به‌گام عین کاربر عادی
 * ------------------------------------------------------
 * پیش‌نمایش (اعتبارسنجی ۴ گامی + جستجوی مشتری در آرم) + اجرای زنده با گزارش گام‌ها +
 * دو حالت عین خود سامانه: «ثبت نهایی» (requests/create) و «پیش‌نویس» (requests/create/draft)
 */

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UploadCloud, FileSignature, Save, UserRound, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber } from "@/lib/format";
import type { RequestRow } from "@/lib/request/types";

interface StepReport {
  key: string;
  title: string;
  status: "pending" | "done" | "failed" | "skipped";
  detail: string;
}

interface PreviewResponse {
  ok: boolean;
  row: RequestRow;
  customerPreview: { found: boolean; name?: string; id?: string; error?: string } | null;
  lastRegistration: { steps?: StepReport[]; failed?: boolean; at?: string } | null;
  requirements: { armToken: boolean; message: string };
}

interface ExecuteResponse {
  ok: boolean;
  mode: "create" | "draft" | "update";
  steps: StepReport[];
  armRequestId: string | null;
  customerId: string | null;
  customerCreated: boolean;
  message: string;
}

export function ArmRegisterDialog({
  request,
  open,
  onOpenChange,
  onDone,
}: {
  request: RequestRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [report, setReport] = useState<ExecuteResponse | null>(null);

  const load = useCallback(async () => {
    if (!request || !open) return;
    setLoading(true);
    setReport(null);
    try {
      const res = await api<PreviewResponse>(`/api/requests/${request.id}/register`);
      setPreview(res);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "بارگذاری ناموفق", description: e.message, variant: "destructive" });
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [request, open, toast]);

  useEffect(() => {
    if (open) void load();
     
  }, [open, request?.id]);

  const execute = useCallback(
    async (mode: "create" | "draft") => {
      if (!request) return;
      setExecuting(true);
      setReport(null);
      try {
        const res = await api<ExecuteResponse>(`/api/requests/${request.id}/register`, {
          method: "POST",
          body: { mode },
        });
        setReport(res);
        toast({
          title: res.ok ? `ثبت ${mode === "draft" ? "پیش‌نویس " : ""}در آرم انجام شد` : "ثبت در آرم ناموفق بود",
          description: res.message,
          variant: res.ok ? undefined : "destructive",
        });
        if (res.ok) onDone();
      } catch (err) {
        const e = err as ApiClientError;
        toast({ title: "خطای اجرای ثبت", description: e.message, variant: "destructive" });
      } finally {
        setExecuting(false);
      }
    },
    [request, onDone, toast]
  );

  if (!request) return null;

  const steps = report?.steps ?? preview?.lastRegistration?.steps ?? null;
  const doneCount = steps ? steps.filter((s) => s.status === "done").length : 0;
  const readyPct = Math.round((request.completeness.completeCount / request.completeness.total) * 100);

  return (
    <Dialog open={open} onOpenChange={(o) => !executing && onOpenChange(o)}>
      <DialogContent dir="rtl" className="max-w-xl max-h-[92svh] overflow-y-auto">
        <DialogHeader className="text-right space-y-2 items-start">
          <DialogTitle className="text-right flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-emerald-600" aria-hidden /> ثبت گام‌به‌گام در سامانه ARM
          </DialogTitle>
          <DialogDescription className="text-right leading-relaxed">
            «{request.title}» — ثبت همانند یک کاربر عادی، مرحله به مرحله و بدون دور زدن هیچ گامی (عین new-request-page خود سامانه).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* آمادگی ۴ گامی */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold">آمادگی ۴ گامی</span>
                <span className="tabular-nums text-muted-foreground">{faNumber(request.completeness.completeCount)} از {faNumber(4)}</span>
              </div>
              <Progress value={readyPct} indicatorClassName={readyPct === 100 ? "bg-gradient-to-l from-emerald-600 to-emerald-400" : "bg-gradient-to-l from-teal-600 to-teal-400"} />
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                {request.completeness.steps.map((s) => (
                  <span key={s.step} className={s.complete ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600"}>
                    {s.label} {s.complete ? "✓" : "✗"}
                  </span>
                ))}
              </div>
            </div>

            {/* پیش‌نمایش مشتری — عین owner-info-step */}
            {preview?.customerPreview && (
              <div className={`rounded-xl border p-3 text-[11px] leading-5 flex items-start gap-2 ${preview.customerPreview.found ? "border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/40" : "border-amber-300 bg-amber-50/70 dark:bg-amber-950/40"}`}>
                <UserRound className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                <div>
                  <b>گام ۱ — جستجوی مشتری در آرم:</b>{" "}
                  {preview.customerPreview.found
                    ? `کاربر «${preview.customerPreview.name ?? request.customerName}» یافت شد و متصل می‌شود.`
                    : "یافت نشد — هنگام ثبت، کاربر مشتری با نام و موبایل واردشده ایجاد می‌شود (عین خود سامانه)."}
                </div>
              </div>
            )}

            {/* الزام توکن */}
            {preview && !preview.requirements.armToken && (
              <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 leading-5">{preview.requirements.message}</p>
            )}

            {/* گزارش گام‌ها */}
            {steps && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold">{report ? "گزارش اجرای زنده" : "آخرین گزارش ثبت"}</p>
                  <Badge variant="outline" className="text-[9px] tabular-nums">{faNumber(doneCount)} از {faNumber(steps.length)} گام</Badge>
                </div>
                <ol className="space-y-1.5">
                  {steps.map((s, i) => (
                    <li key={`${s.key}-${i}`} className="rounded-lg border p-2.5 text-[11px] leading-5 flex gap-2">
                      <span className={`shrink-0 w-5 h-5 rounded-full grid place-content-center ${s.status === "done" ? "bg-emerald-500 text-white" : s.status === "failed" ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground"}`}>
                        {s.status === "done" ? <CheckCircle2 className="w-3 h-3" aria-hidden /> : s.status === "failed" ? <XCircle className="w-3 h-3" aria-hidden /> : faNumber(i + 1)}
                      </span>
                      <div className="min-w-0">
                        <b>{s.title}</b>
                        <p className="text-muted-foreground">{s.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* نتیجه نهایی */}
            {report && (
              <div className={`rounded-xl border p-3 text-[11px] ${report.ok ? "border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/40" : "border-rose-300 bg-rose-50/70 dark:bg-rose-950/40"}`}>
                {report.ok ? (
                  <>
                    درخواست در سامانه آرم ثبت شد (شناسه: {report.armRequestId ?? "—"}).
                    {report.customerCreated ? " کاربر مشتری جدید ایجاد شد." : " کاربر مشتری موجود متصل شد."}
                  </>
                ) : (
                  <>ثبت ناموفق بود: {report.message}</>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between flex-row-reverse flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void load()} disabled={executing || loading} className="gap-1.5">
              <RefreshCw className="w-4 h-4" aria-hidden /> پیش‌نمایش مجدد
            </Button>
            <Button
              onClick={() => void execute("draft")}
              disabled={executing || loading || readyPct < 100 || !preview?.requirements.armToken}
              className="gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300"
              variant="outline"
            >
              {executing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />} پیش نویس
            </Button>
          </div>
          <Button
            onClick={() => void execute("create")}
            disabled={executing || loading || readyPct < 100 || !preview?.requirements.armToken}
            className="gap-1.5 bg-gradient-to-l from-emerald-600 to-emerald-500 text-white hover:from-emerald-700 hover:to-emerald-600"
          >
            {executing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <FileSignature className="w-4 h-4" aria-hidden />}
            ثبت نهایی در سامانه آرم
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
