"use client";

/**
 * ویزارد ثبت درخواست ملک — ۴ گام عین فرم new-request-page سامانه آرم
 * ------------------------------------------------------
 * گام ۱: اطلاعات مشتری (جستجوی زنده در آرم با موبایل + نام/نام‌خانوادگی)
 * گام ۲: اطلاعات مکانی درخواست (ایران/آذربایجان شرقی/تبریز + منطقه و محله چندانتخابی)
 * گام ۳: جزییات درخواست (نوع معامله با برچسب درخواستی + کاربری + ملک + فرم پویای زنده دسته)
 * گام ۴: اطلاعات تکمیلی درخواست (نحوه پرداخت + جدیت + توضیحات مشاور)
 *
 * دکمه‌ها عین خود سامانه: «قبلی» / «بعدی» (تا تعیین مشتری غیرفعال) / «پیش نویس» (از گام ۲)
 * دو حالت ثبت:
 *   الف: manual — ثبت دستی (مالک حضوری) → ذخیره محلی
 *   ب: auto — ثبت اتوماتیک → پس از تکمیل، ثبت گام‌به‌گام در سامانه آرم + گزارش زنده گام‌ها
 *   edit — ویرایش درخواست موجود (کلید «ویرایش»)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { StepReportList, type StepReportItem } from "@/components/app/shared";

/** سازگاری عقب‌وار — نوع گزارش گام‌های آرم اکنون از ماژول مشترک می‌آید */
export type ArmStepReport = StepReportItem;
import {
  Loader2, ChevronRight, ChevronLeft, Save, Search, UserRound, MapPin, ClipboardList, ClipboardCheck,
  CheckCircle2, XCircle, FileEdit, Info, Sparkles,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber } from "@/lib/format";
import { TABRIZ_AREAS } from "@/lib/divar/tabriz-locations";
import type { RequestRow } from "@/lib/request/types";

// ===================== ثابت‌های UI =====================

const STEPS = [
  { title: "اطلاعات مشتری", subTitle: "نام، نام خانوادگی و ...", icon: UserRound },
  { title: "اطلاعات مکانی درخواست", subTitle: "انتخاب استان، شهر و ...", icon: MapPin },
  { title: "جزییات درخواست", subTitle: "نوع معامله، نوع کاربری و ...", icon: ClipboardList },
  { title: "اطلاعات تکمیلی درخواست", subTitle: "پول مشتری، جدیت مشتری و ...", icon: ClipboardCheck },
] as const;

export interface RequestMetaResponse {
  ok: boolean;
  meta: {
    tradeTypes: { id: string; name: string; nameRequest: string; isRental: boolean }[];
    buildingTypes: { id: string; name: string; tradeTypeIds: string[] }[];
    propertyTypes: Record<string, { id: string; name: string }[]>;
    paymentMethods: { id: string; name: string }[];
    userSeriousness: { id: string; name: string }[];
    geo: { countryId: string; stateId: string; cityId: string };
  };
  requirements: { armToken: boolean; message: string };
}

interface FormField {
  id: string;
  nameFa: string;
  nameEn: string;
  inputType: "text" | "number" | "dropdown" | "multi_select_dropdown" | "switch" | "checkbox";
  createName: string;
  createNameFrom?: string;
  createNameTo?: string;
  createRange: boolean;
  unit?: string;
  options: { label: string; value: string }[];
  placeholder?: string;
  placeholderFrom?: string;
  placeholderTo?: string;
  help?: string;
}

interface FormMetaResponse {
  ok: boolean;
  formName: string | null;
  infos: FormField[];
  options: FormField[];
  fields: FormField[];
  message?: string;
}

export interface NewRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** الف: manual (مالک حضوری) | ب: auto (ثبت اتوماتیک در آرم) */
  mode: "manual" | "auto";
  /** ویرایش درخواست موجود (کلید «ویرایش») */
  editRequest?: RequestRow | null;
  meta: RequestMetaResponse | null;
  armToken: boolean;
  onSaved: () => void;
}

// ===================== ابزار =====================

function toLatinDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function normalizeMobileInput(s: string): string {
  return toLatinDigits(s).replace(/\D/g, "").slice(0, 11);
}

// ===================== کامپوننت اصلی =====================

export function NewRequestDialog({ open, onOpenChange, mode, editRequest, meta, armToken, onSaved }: NewRequestDialogProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [armReport, setArmReport] = useState<{ ok: boolean; steps: ArmStepReport[]; armRequestId?: string | null; error?: string | null } | null>(null);

  // ---------- گام ۱: مشتری ----------
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [armCustomerId, setArmCustomerId] = useState<string | null>(null);
  const [customerFound, setCustomerFound] = useState<boolean | null>(null);
  const [searching, setSearching] = useState(false);

  // ---------- گام ۲: مکان ----------
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedLines, setSelectedLines] = useState<string[]>([]);
  const [areaSearch, setAreaSearch] = useState("");

  // ---------- گام ۳: جزییات ----------
  const [tradeTypeId, setTradeTypeId] = useState("");
  const [buildingTypeId, setBuildingTypeId] = useState("");
  const [propertyTypeId, setPropertyTypeId] = useState("");
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [formMeta, setFormMeta] = useState<FormMetaResponse | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [customerDescription, setCustomerDescription] = useState("");

  // ---------- گام ۴: تکمیلی ----------
  const [paymentMethod, setPaymentMethod] = useState("");
  const [seriousness, setSeriousness] = useState("");
  const [realtorDescription, setRealtorDescription] = useState("");

  const tradeTypes = meta?.meta.tradeTypes ?? [];
  const buildingTypes = meta?.meta.buildingTypes ?? [];
  const propertyTypes = meta?.meta.propertyTypes ?? {};
  const paymentMethods = meta?.meta.paymentMethods ?? [];
  const seriousnessList = meta?.meta.userSeriousness ?? [];

  // ---------- مقداردهی در ویرایش (شناسه‌های خام از ردیف) ----------
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setArmReport(null);
    setSaving(false);
    if (editRequest) {
      setMobile(editRequest.customerMobile === "—" ? "" : editRequest.customerMobile);
      setName(editRequest.customerName === "—" ? "" : editRequest.customerName);
      setArmCustomerId(editRequest.armCustomerId ?? null);
      setCustomerFound(editRequest.armCustomerId ? true : null);
      setSelectedAreas(editRequest.areaIds ?? []);
      setSelectedLines(editRequest.lineIds ?? []);
      setAreaSearch("");
      setTradeTypeId(editRequest.tradeTypeId ?? "");
      setBuildingTypeId(editRequest.buildingTypeId ?? "");
      setPropertyTypeId(editRequest.propertyTypeId ?? "");
      setInputs(editRequest.inputs ?? {});
      setFormMeta(null);
      setCustomerDescription(editRequest.customerDescription ?? "");
      setPaymentMethod(editRequest.userPaymentMethodId ?? "");
      setSeriousness(editRequest.userSeriousityId ?? "");
      setRealtorDescription(editRequest.realtorDescription ?? "");
    } else {
      setMobile("");
      setName("");
      setArmCustomerId(null);
      setCustomerFound(null);
      setSelectedAreas([]);
      setSelectedLines([]);
      setAreaSearch("");
      setTradeTypeId("");
      setBuildingTypeId("");
      setPropertyTypeId("");
      setInputs({});
      setFormMeta(null);
      setCustomerDescription("");
      setPaymentMethod("");
      setSeriousness("");
      setRealtorDescription("");
    }
     
  }, [open, editRequest?.id]);

  // ---------- جستجوی زنده مشتری در آرم (عین owner-info-step) ----------
  const searchCustomer = useCallback(async () => {
    const digits = normalizeMobileInput(mobile);
    if (!/^09\d{9}$/.test(digits)) {
      toast({ title: "شماره موبایل نامعتبر", description: "۱۱ رقم با ۰۹ وارد کنید — مثال: ۰۹۱۴۱۲۳۴۵۶۷", variant: "destructive" });
      return;
    }
    setSearching(true);
    try {
      const res = await api<{ found: boolean; name?: string; id?: string }>(`/api/users/lookup?mobile=${encodeURIComponent(digits)}`);
      setCustomerFound(res.found);
      if (res.found) {
        setArmCustomerId(res.id ?? null);
        if (res.name && (!name || name === "—")) setName(res.name);
        toast({ title: "مشتری در سامانه آرم یافت شد", description: res.name ? `«${res.name}» به این درخواست متصل شد.` : "کاربر موجود است." });
      } else {
        setArmCustomerId(null);
        toast({ title: "این شماره در سامانه آرم ثبت نشده است", description: "نام و نام خانوادگی مشتری را وارد کنید — هنگام ثبت در آرم، کاربرش به‌صورت خودکار ایجاد می‌شود (عین خود سامانه)." });
      }
    } catch (err) {
      const e = err as ApiClientError;
      setCustomerFound(null);
      setArmCustomerId(null);
      toast({ title: "جستجو ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  }, [mobile, name, toast]);

  // ---------- فرم پویای دسته (گام ۳) — زنده از خود سامانه ----------
  useEffect(() => {
    if (!open || !tradeTypeId || !buildingTypeId || !propertyTypeId) {
      setFormMeta(null);
      return;
    }
    let cancelled = false;
    setFormLoading(true);
    void (async () => {
      try {
        const res = await api<FormMetaResponse>(
          `/api/requests/meta/form?tradeType=${encodeURIComponent(tradeTypeId)}&buildingType=${encodeURIComponent(buildingTypeId)}&propertyType=${encodeURIComponent(propertyTypeId)}`
        );
        if (!cancelled) {
          setFormMeta(res);
          // مقادیر قبلی را که هنوز معتبرند نگه دار، بقیه را پاک کن
          setInputs((prev) => {
            const valid = new Set(res.fields.flatMap((f) => [f.createName, f.createNameFrom, f.createNameTo].filter(Boolean) as string[]));
            const next: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(prev)) if (valid.has(k)) next[k] = v;
            return next;
          });
        }
      } catch {
        if (!cancelled) setFormMeta({ ok: false, formName: null, infos: [], options: [], fields: [], message: "فرم دسته‌بندی دریافت نشد — ادامه دهید و بعداً تکمیل کنید." });
      } finally {
        if (!cancelled) setFormLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tradeTypeId, buildingTypeId, propertyTypeId]);

  // ---------- قیود عین خود سامانه: کاربری مجازِ معامله، ملک مجازِ کاربری ----------
  const allowedBuildings = useMemo(
    () => buildingTypes.filter((b) => !tradeTypeId || b.tradeTypeIds.includes(tradeTypeId)),
    [buildingTypes, tradeTypeId]
  );
  const allowedProperties = useMemo(
    () => (buildingTypeId ? propertyTypes[buildingTypeId] ?? [] : []),
    [propertyTypes, buildingTypeId]
  );

  useEffect(() => {
    if (tradeTypeId && buildingTypeId && !allowedBuildings.some((b) => b.id === buildingTypeId)) setBuildingTypeId("");
  }, [tradeTypeId, buildingTypeId, allowedBuildings]);
  useEffect(() => {
    if (buildingTypeId && propertyTypeId && !allowedProperties.some((p) => p.id === propertyTypeId)) setPropertyTypeId("");
  }, [buildingTypeId, propertyTypeId, allowedProperties]);

  // ---------- منطق منطقه/محله (عین areaAndLine خود سامانه) ----------
  const filteredAreas = useMemo(() => {
    const q = areaSearch.trim();
    if (!q) return TABRIZ_AREAS.slice(0, 40);
    return TABRIZ_AREAS.filter((a) => a.n.includes(q) || a.l.some((l) => l.n.includes(q))).slice(0, 40);
  }, [areaSearch]);

  const toggleArea = useCallback((areaId: string) => {
    setSelectedAreas((prev) => {
      const has = prev.includes(areaId);
      const area = TABRIZ_AREAS.find((a) => a.id === areaId);
      const lineIds = area?.l.map((l) => l.id) ?? [];
      setSelectedLines((lines) => (has ? lines.filter((l) => !lineIds.includes(l)) : [...new Set([...lines, ...lineIds])]));
      return has ? prev.filter((a) => a !== areaId) : [...prev, areaId];
    });
  }, []);

  const toggleLine = useCallback((lineId: string, areaId: string) => {
    setSelectedLines((prev) => (prev.includes(lineId) ? prev.filter((l) => l !== lineId) : [...prev, lineId]));
    setSelectedAreas((prev) => (prev.includes(areaId) ? prev : [...prev, areaId]));
  }, []);

  // ---------- اعتبارسنجی هر گام (عین قیود خود سامانه) ----------
  const stepValid = useMemo((): boolean[] => {
    const mobileDigits = normalizeMobileInput(mobile);
    const s1 = name.trim().length >= 3 && /^09\d{9}$/.test(mobileDigits);
    const s2 = selectedAreas.length > 0;
    const s3 = Boolean(tradeTypeId && buildingTypeId && propertyTypeId);
    const s4 = Boolean(paymentMethod && seriousness);
    return [s1, s2, s3, s4];
  }, [name, mobile, selectedAreas, tradeTypeId, buildingTypeId, propertyTypeId, paymentMethod, seriousness]);

  const customerDetermined = useMemo(() => Boolean(name.trim()) && /^09\d{9}$/.test(normalizeMobileInput(mobile)), [name, mobile]);

  // ---------- ثبت ----------
  const buildPayload = useCallback(
    (asDraft: boolean) => {
      const areaNames = selectedAreas.map((id) => TABRIZ_AREAS.find((a) => a.id === id)?.n ?? id);
      const lineNames = selectedLines.map((id) => {
        const area = TABRIZ_AREAS.find((a) => a.l.some((l) => l.id === id));
        return area?.l.find((l) => l.id === id)?.n ?? id;
      });
      return {
        customerName: name.trim(),
        customerMobile: normalizeMobileInput(mobile),
        armCustomerId,
        countryId: meta?.meta.geo.countryId,
        stateId: meta?.meta.geo.stateId,
        cityId: meta?.meta.geo.cityId,
        areaIds: selectedAreas,
        areaNames,
        lineIds: selectedLines,
        lineNames,
        tradeTypeId,
        buildingTypeId,
        propertyTypeId,
        inputs,
        customerDescription: customerDescription.trim() || undefined,
        userPaymentMethod: paymentMethod,
        userSeriousity: seriousness,
        realtorDescription: realtorDescription.trim() || undefined,
        ...(asDraft ? {} : {}),
      };
    },
    [name, mobile, armCustomerId, meta, selectedAreas, selectedLines, tradeTypeId, buildingTypeId, propertyTypeId, inputs, customerDescription, paymentMethod, seriousness, realtorDescription]
  );

  const submit = useCallback(
    async (asDraft: boolean) => {
      if (!asDraft && !stepValid.every(Boolean)) {
        const firstBad = stepValid.findIndex((v) => !v);
        setStep(firstBad);
        toast({ title: "اطلاعات ناقص است", description: `گام ${faNumber(firstBad + 1)} («${STEPS[firstBad].title}») را کامل کنید — عین خود سامانه، هیچ گامی دور زده نمی‌شود.`, variant: "destructive" });
        return;
      }
      setSaving(true);
      try {
        const payload = buildPayload(asDraft);
        if (editRequest) {
          // ویرایش — اگر در آرم ثبت شده و توکن هست، همگام با PUT خود سامانه
          const res = await api<{ ok: boolean; complete: boolean; message: string; arm?: { ok: boolean; steps: ArmStepReport[]; error?: string | null } }>(`/api/requests/${editRequest.id}`, {
            method: "PATCH",
            body: { ...payload, syncArm: Boolean(editRequest.armRequestId && armToken && !asDraft) },
          });
          if (res.arm) setArmReport({ ok: res.arm.ok, steps: res.arm.steps ?? [], error: res.arm.error ?? null });
          toast({ title: res.arm ? (res.arm.ok ? "ویرایش و همگام‌سازی با آرم انجام شد" : "ویرایش محلی انجام شد") : "درخواست ویرایش شد", description: res.message, variant: res.arm && !res.arm.ok ? "default" : undefined });
          onSaved();
          if (!res.arm || res.arm.ok) onOpenChange(false);
        } else if (mode === "auto" && !asDraft) {
          // ب: ثبت اتوماتیک — پس از تکمیل فرم، ثبت مستقیم گام‌به‌گام در آرم
          const res = await api<{ ok: boolean; id: string; complete: boolean; message: string; arm: { ok: boolean; steps: ArmStepReport[]; armRequestId?: string | null; error?: string | null } | null }>("/api/requests", {
            method: "POST",
            body: { ...payload, autoRegister: true },
          });
          if (res.arm) setArmReport(res.arm);
          toast({ title: res.arm?.ok ? "درخواست در سامانه آرم ثبت شد" : "درخواست ثبت شد", description: res.message, variant: res.arm && !res.arm.ok ? "destructive" : undefined });
          onSaved();
          if (!res.arm || res.arm.ok) onOpenChange(false);
        } else {
          // الف: ثبت دستی (یا پیش‌نویس عین دکمه «پیش نویس» خود سامانه)
          const res = await api<{ ok: boolean; id: string; complete: boolean; message: string }>("/api/requests", {
            method: "POST",
            body: payload,
          });
          toast({
            title: asDraft ? "پیش‌نویس ذخیره شد" : "درخواست ثبت شد",
            description: res.message,
          });
          onSaved();
          onOpenChange(false);
        }
      } catch (err) {
        const e = err as ApiClientError;
        toast({ title: "ثبت ناموفق", description: e.message, variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [stepValid, buildPayload, editRequest, mode, armToken, onSaved, onOpenChange, toast]
  );

  const next = useCallback(() => {
    if (step === 0 && !customerDetermined) {
      toast({ title: "ابتدا اطلاعات مشتری را کامل کنید", description: "عین خود سامانه: دکمه «بعدی» تا تعیین مشتری (نام + موبایل) فعال نمی‌شود.", variant: "destructive" });
      return;
    }
    if (!stepValid[step]) {
      toast({ title: "این گام کامل نیست", description: "همه فیلدهای الزامی گام «" + STEPS[step].title + "» را پر کنید.", variant: "destructive" });
      return;
    }
    if (step < 3) setStep((s) => s + 1);
    else void submit(false);
  }, [step, customerDetermined, stepValid, submit, toast]);

  const prev = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  // ===================== رندر =====================

  const isEdit = Boolean(editRequest);

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[92svh] overflow-y-auto">
        <DialogHeader className="text-right space-y-2 items-start">
          <DialogTitle className="text-right flex items-center gap-2">
            {isEdit ? <FileEdit className="w-5 h-5 text-teal-600" aria-hidden /> : <ClipboardList className="w-5 h-5 text-teal-600" aria-hidden />}
            {isEdit ? "ویرایش درخواست ملک" : mode === "auto" ? "ثبت اتوماتیک درخواست در سامانه آرم" : "ثبت دستی درخواست ملک (مالک حضوری)"}
          </DialogTitle>
          <DialogDescription className="text-right leading-relaxed">
            {isEdit
              ? "ویرایش با همان ۴ گام خود سامانه — اگر درخواست در آرم ثبت شده باشد، تغییرات با PUT خود سامانه همگام می‌شود."
              : mode === "auto"
                ? "فرم را کامل کنید؛ پس از تکمیل، درخواست همانند یک کاربر عادی مرحله‌به‌مرحله در سامانه آرم ملک تبریز ثبت می‌شود."
                : "برای مشتریانی که حضوری (در دفتر) درخواست ثبت دارند — با همان فرم ۴ گامی سامانه آرم و بدون دور زدن هیچ گامی."}
          </DialogDescription>
        </DialogHeader>

        {/* نوار گام‌ها — عین Stepper خود سامانه */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const done = i < step && stepValid[i];
            return (
              <button
                key={s.title}
                type="button"
                onClick={() => i <= step && setStep(i)}
                className={`flex-1 rounded-xl border p-2 text-right transition-colors ${active ? "border-teal-500 bg-teal-50 dark:bg-teal-950" : done ? "border-teal-300 bg-teal-50 dark:bg-teal-950" : "border-border bg-muted/30"} ${i > step ? "opacity-50" : ""}`}
                aria-current={active ? "step" : undefined}
              >
                <div className="flex items-center gap-1.5">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? "text-teal-600" : done ? "text-teal-600" : "text-muted-foreground"}`} aria-hidden />
                  <span className="text-[10px] font-bold leading-3 truncate">{s.title}</span>
                </div>
                <span className="text-[9px] text-muted-foreground block truncate mt-0.5">{s.subTitle}</span>
              </button>
            );
          })}
        </div>

        {/* گزارش ثبت گام‌به‌گام در آرم (حالت اتوماتیک) */}
        {armReport && (
          <div className={`rounded-xl border p-3 space-y-2 ${armReport.ok ? "border-teal-300 bg-teal-50/70 dark:bg-teal-950/50" : "border-rose-300 bg-rose-50/70 dark:bg-rose-950/50"}`}>
            <p className="text-xs font-extrabold flex items-center gap-1.5">
              {armReport.ok ? <CheckCircle2 className="w-4 h-4 text-teal-600" aria-hidden /> : <XCircle className="w-4 h-4 text-rose-600" aria-hidden />}
              گزارش ثبت گام‌به‌گام در سامانه آرم
            </p>
            <StepReportList steps={armReport.steps} variant="inline" />
            {armReport.error && <p className="text-[11px] text-rose-700 dark:text-rose-300">{armReport.error}</p>}
          </div>
        )}

        {/* ---------- گام ۱: اطلاعات مشتری ---------- */}
        {step === 0 && (
          <section className="rounded-xl border p-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rq-mobile" className="text-xs flex items-center gap-1">
                شماره موبایل مشتری <b className="text-rose-600">*</b>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="rq-mobile"
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left flex-1"
                  placeholder="09141234567"
                  value={mobile}
                  onChange={(e) => {
                    setMobile(normalizeMobileInput(e.target.value));
                    setCustomerFound(null);
                    setArmCustomerId(null);
                  }}
                />
                <Button variant="outline" className="gap-1.5 shrink-0" onClick={() => void searchCustomer()} disabled={searching || !armToken || !/^09\d{9}$/.test(normalizeMobileInput(mobile))} title={armToken ? "جستجوی زنده در سامانه آرم" : "برای جستجوی زنده، با کد پرسنلی + پیامک وارد شوید"}>
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Search className="w-4 h-4" aria-hidden />}
                  جستجو در آرم
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground leading-4">
                عین خود سامانه: با شماره موبایل، مشتری در سامانه آرم جستجو می‌شود (بدون صفر ارسال می‌شود).
                {!armToken && " جستجوی زنده نیازمند ورود با «کد پرسنلی + پیامک» است — بدون آن هم می‌توانید ادامه دهید؛ هنگام ثبت در آرم، کاربر مشتری جستجو/ایجاد می‌شود."}
              </p>
              {customerFound === true && (
                <div className="rounded-lg border border-teal-300 bg-teal-50 dark:bg-teal-950 px-3 py-2 text-[11px] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" aria-hidden />
                  مشتری موجود در سامانه آرم — به این درخواست متصل شد.
                </div>
              )}
              {customerFound === false && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-[11px] flex items-start gap-1.5 leading-5">
                  <Info className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" aria-hidden />
                  این شماره در سامانه آرم ثبت نشده است — نام و نام‌خانوادگی را وارد کنید؛ هنگام ثبت در آرم، کاربر مشتری به‌صورت خودکار ایجاد می‌شود (عین فرم خود سامانه).
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rq-name" className="text-xs flex items-center gap-1">
                  نام و نام خانوادگی درخواست‌دهنده <b className="text-rose-600">*</b>
                </Label>
                <Input id="rq-name" placeholder="مثال: سید علی محمدی" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">کد درخواست (پس از ثبت)</Label>
                <Input value="—" disabled readOnly />
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 px-3 py-2 text-[10px] text-muted-foreground leading-5 flex gap-2">
              <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
              <span>این مشتری پس از ثبت، در «مدیریت مشتریان» ایجنت این کاشی پروفایل ۳۶۰ درجه می‌گیرد: امتیاز سلامت، چرخه عمر و اقدام بعدی هوشمند.</span>
            </div>
          </section>
        )}

        {/* ---------- گام ۲: اطلاعات مکانی درخواست ---------- */}
        {step === 1 && (
          <section className="rounded-xl border p-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "کشور", value: "ایران" },
                { label: "استان", value: "آذربایجان شرقی" },
                { label: "شهر", value: "تبریز" },
              ].map((g) => (
                <div key={g.label} className="rounded-lg border bg-muted/40 px-3 py-2 space-y-0.5">
                  <p className="text-[9px] text-muted-foreground">
                    {g.label} <span className="text-[8px]">(پیش‌فرض انتخاب شده است)</span>
                  </p>
                  <p className="text-xs font-bold">{g.value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                منطقه و محله <b className="text-rose-600">*</b>
                <span className="text-[10px] font-normal text-muted-foreground">({faNumber(selectedAreas.length)} منطقه، {faNumber(selectedLines.length)} محله)</span>
              </Label>
              <Input placeholder="جستجوی منطقه یا محله… (مثلاً ولیعصر)" value={areaSearch} onChange={(e) => setAreaSearch(e.target.value)} />
              <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
                {filteredAreas.map((a) => {
                  const areaSelected = selectedAreas.includes(a.id);
                  return (
                    <div key={a.id} className={`p-2 ${areaSelected ? "bg-teal-50/60 dark:bg-teal-950/40" : ""}`}>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`area-${a.id}`}
                          checked={areaSelected}
                          onCheckedChange={() => toggleArea(a.id)}
                          aria-label={`منطقه ${a.n}`}
                        />
                        <label htmlFor={`area-${a.id}`} className="text-xs font-bold cursor-pointer flex-1">
                          {a.n}
                          <span className="text-[10px] text-muted-foreground font-normal ms-1">({faNumber(a.l.length)} محله)</span>
                        </label>
                        <Badge variant={areaSelected ? "default" : "secondary"} className="text-[9px]">
                          {areaSelected ? "منتخب" : "—"}
                        </Badge>
                      </div>
                      {areaSelected && (
                        <div className="flex flex-wrap gap-1.5 mt-2 me-6">
                          {a.l.map((l) => {
                            const lineSelected = selectedLines.includes(l.id);
                            return (
                              <button
                                key={l.id}
                                type="button"
                                onClick={() => toggleLine(l.id, a.id)}
                                className={`text-[10px] rounded-full border px-2.5 py-1 transition-colors ${lineSelected ? "bg-teal-600 text-white border-teal-600" : "bg-background hover:bg-muted"}`}
                                aria-pressed={lineSelected}
                              >
                                {l.n}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredAreas.length === 0 && <p className="p-3 text-xs text-muted-foreground text-center">منطقه‌ای یافت نشد.</p>}
              </div>
              <p className="text-[10px] text-muted-foreground leading-4">
                انتخاب منطقه = همه محله‌هایش (عین خود سامانه)؛ محله‌ها را جداگانه هم می‌توانید بردارید یا اضافه کنید.
              </p>
            </div>
          </section>
        )}

        {/* ---------- گام ۳: جزییات درخواست ---------- */}
        {step === 2 && (
          <section className="rounded-xl border p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                نوع معامله <b className="text-rose-600">*</b>
              </Label>
              <div className="flex flex-wrap gap-2">
                {tradeTypes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTradeTypeId(t.id)}
                    className={`text-xs rounded-xl border px-3 py-2 transition-colors ${tradeTypeId === t.id ? "bg-teal-600 text-white border-teal-600 shadow" : "bg-background hover:bg-muted"}`}
                    aria-pressed={tradeTypeId === t.id}
                  >
                    {t.nameRequest}
                    <span className="block text-[9px] opacity-70">{t.name}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">برچسب درخواستی عین خود سامانه (خرید / پیش خرید / رهن و اجاره / مشارکت در ساخت).</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  نوع کاربری <b className="text-rose-600">*</b>
                </Label>
                <Select value={buildingTypeId} onValueChange={setBuildingTypeId}>
                  <SelectTrigger aria-label="نوع کاربری"><SelectValue placeholder="انتخاب کنید" /></SelectTrigger>
                  <SelectContent>
                    {allowedBuildings.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  نوع ملک <b className="text-rose-600">*</b>
                </Label>
                <Select value={propertyTypeId} onValueChange={setPropertyTypeId} disabled={!buildingTypeId}>
                  <SelectTrigger aria-label="نوع ملک"><SelectValue placeholder={buildingTypeId ? "انتخاب کنید" : "ابتدا نوع کاربری"} /></SelectTrigger>
                  <SelectContent>
                    {allowedProperties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* فرم پویای زنده دسته‌بندی — عین FormsTab خود سامانه */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-extrabold">مشخصات درخواست (فرم پویای زنده سامانه آرم)</Label>
                {formLoading && <Loader2 className="w-4 h-4 animate-spin text-teal-600" aria-hidden />}
              </div>
              {formLoading && <Skeleton className="h-24 w-full" />}
              {!formLoading && formMeta && formMeta.ok && (
                <>
                  {formMeta.formName && <p className="text-[10px] text-muted-foreground">فرم «{formMeta.formName}» — {faNumber(formMeta.infos.length)} مشخصه + {faNumber(formMeta.options.length)} امکان</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {formMeta.infos.map((f) => (
                      <DynamicField key={f.id} field={f} inputs={inputs} setInputs={setInputs} />
                    ))}
                  </div>
                  {formMeta.options.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold">امکانات ملک</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {formMeta.options.map((f) => (
                          <label key={f.id} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2 text-[11px] cursor-pointer">
                            <Checkbox
                              checked={Boolean(inputs[f.createName])}
                              onCheckedChange={(v) => setInputs((prev) => ({ ...prev, [f.createName]: Boolean(v) }))}
                              aria-label={f.nameFa}
                            />
                            {f.nameFa}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {!formLoading && formMeta && !formMeta.ok && (
                <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 leading-5">{formMeta.message ?? "فرم دسته‌بندی در دسترس نیست — ادامه دهید و بعداً تکمیل کنید."}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rq-customer-desc" className="text-xs">توضیحات مشتری</Label>
              <Textarea id="rq-customer-desc" rows={3} placeholder="مثل: دارای ویو ابدی…" value={customerDescription} onChange={(e) => setCustomerDescription(e.target.value)} />
            </div>
          </section>
        )}

        {/* ---------- گام ۴: اطلاعات تکمیلی درخواست ---------- */}
        {step === 3 && (
          <section className="rounded-xl border p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                نحوه پرداخت (پول مشتری) <b className="text-rose-600">*</b>
              </Label>
              <div className="flex flex-wrap gap-2">
                {paymentMethods.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPaymentMethod(p.id)}
                    className={`text-xs rounded-xl border px-3 py-2 transition-colors ${paymentMethod === p.id ? "bg-teal-600 text-white border-teal-600 shadow" : "bg-background hover:bg-muted"}`}
                    aria-pressed={paymentMethod === p.id}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1">
                جدیت مشتری <b className="text-rose-600">*</b>
              </Label>
              <div className="flex flex-wrap gap-2">
                {seriousnessList.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSeriousness(s.id)}
                    className={`text-xs rounded-xl border px-3 py-2 transition-colors ${seriousness === s.id ? "bg-teal-600 text-white border-teal-600 shadow" : "bg-background hover:bg-muted"}`}
                    aria-pressed={seriousness === s.id}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rq-realtor-desc" className="text-xs">توضیحات مشاور</Label>
              <Textarea id="rq-realtor-desc" rows={3} placeholder="یادداشت مشاور درباره این درخواست…" value={realtorDescription} onChange={(e) => setRealtorDescription(e.target.value)} />
            </div>

            {/* خلاصه نهایی — شفافیت عین خود سامانه */}
            <div className="rounded-xl bg-muted/40 border p-3 text-[11px] leading-6 space-y-1">
              <p><b>مشتری:</b> {name || "—"} ({mobile || "—"})</p>
              <p><b>مکان:</b> {faNumber(selectedAreas.length)} منطقه / {faNumber(selectedLines.length)} محله در تبریز</p>
              <p><b>جزییات:</b> {tradeTypes.find((t) => t.id === tradeTypeId)?.nameRequest ?? "—"} · {buildingTypes.find((b) => b.id === buildingTypeId)?.name ?? "—"} · {allowedProperties.find((p) => p.id === propertyTypeId)?.name ?? "—"}</p>
              <p><b>تکمیلی:</b> پرداخت {paymentMethods.find((p) => p.id === paymentMethod)?.name ?? "—"} · جدیت {seriousnessList.find((s) => s.id === seriousness)?.name ?? "—"}</p>
            </div>
          </section>
        )}

        <DialogFooter className="gap-2 sm:justify-between flex-row-reverse">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={prev} disabled={step === 0 || saving} className="gap-1.5">
              <ChevronRight className="w-4 h-4" aria-hidden /> قبلی
            </Button>
            <Button onClick={next} disabled={saving || (step === 0 && !customerDetermined)} className="gap-1.5 bg-gradient-to-l from-teal-600 to-cyan-500 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : step === 3 ? <Save className="w-4 h-4" aria-hidden /> : <ChevronLeft className="w-4 h-4" aria-hidden />}
              {step === 3 ? (isEdit ? "ذخیره ویرایش" : mode === "auto" ? "ثبت در سامانه آرم" : "ثبت درخواست") : "بعدی"}
            </Button>
          </div>
          {/* «پیش نویس» عین خود سامانه — از گام ۲ به بعد فعال */}
          <Button variant="outline" onClick={() => void submit(true)} disabled={saving || step <= 1} className="gap-1.5 border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300">
            <Save className="w-4 h-4" aria-hidden /> پیش نویس
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== فیلد پویای فرم دسته (گام ۳) =====================

function DynamicField({ field: f, inputs, setInputs }: { field: FormField; inputs: Record<string, unknown>; setInputs: React.Dispatch<React.SetStateAction<Record<string, unknown>>> }) {
  const set = (key: string, value: unknown) => setInputs((prev) => ({ ...prev, [key]: value }));
  const toNum = (s: string) => toLatinDigits(s).replace(/[^\d.-]/g, "");

  if (f.inputType === "number" && f.createRange) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">
          {f.nameFa} {f.unit ? <span className="text-[9px] text-muted-foreground">({f.unit})</span> : null}
        </Label>
        <div className="flex items-center gap-1.5">
          <Input
            dir="ltr"
            inputMode="numeric"
            className="text-left"
            placeholder={f.placeholderFrom ?? "از…"}
            value={String(inputs[f.createNameFrom ?? ""] ?? "")}
            onChange={(e) => set(f.createNameFrom ?? "", toNum(e.target.value))}
          />
          <span className="text-[10px] text-muted-foreground">تا</span>
          <Input
            dir="ltr"
            inputMode="numeric"
            className="text-left"
            placeholder={f.placeholderTo ?? "تا…"}
            value={String(inputs[f.createNameTo ?? ""] ?? "")}
            onChange={(e) => set(f.createNameTo ?? "", toNum(e.target.value))}
          />
        </div>
        {f.help && <p className="text-[9px] text-muted-foreground">{f.help}</p>}
      </div>
    );
  }

  if (f.inputType === "number" || f.inputType === "text") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">
          {f.nameFa} {f.unit ? <span className="text-[9px] text-muted-foreground">({f.unit})</span> : null}
        </Label>
        <Input
          dir={f.inputType === "number" ? "ltr" : undefined}
          inputMode={f.inputType === "number" ? "numeric" : undefined}
          className={f.inputType === "number" ? "text-left" : undefined}
          placeholder={f.placeholder ?? ""}
          value={String(inputs[f.createName] ?? "")}
          onChange={(e) => set(f.createName, f.inputType === "number" ? toNum(e.target.value) : e.target.value)}
        />
        {f.help && <p className="text-[9px] text-muted-foreground">{f.help}</p>}
      </div>
    );
  }

  if (f.inputType === "dropdown") {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{f.nameFa}</Label>
        <Select
          value={String(inputs[f.createName] ?? "")}
          onValueChange={(v) => set(f.createName, v)}
        >
          <SelectTrigger aria-label={f.nameFa}><SelectValue placeholder={f.placeholder ?? "انتخاب کنید"} /></SelectTrigger>
          <SelectContent>
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (f.inputType === "multi_select_dropdown") {
    const selected = Array.isArray(inputs[f.createName]) ? (inputs[f.createName] as string[]) : [];
    return (
      <div className="space-y-1.5 col-span-full">
        <Label className="text-xs">{f.nameFa}</Label>
        <div className="flex flex-wrap gap-1.5">
          {f.options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => set(f.createName, on ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
                className={`text-[10px] rounded-full border px-2.5 py-1 transition-colors ${on ? "bg-teal-600 text-white border-teal-600" : "bg-background hover:bg-muted"}`}
                aria-pressed={on}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (f.inputType === "switch" || f.inputType === "checkbox") {
    return (
      <label className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2 text-[11px] cursor-pointer">
        <Checkbox
          checked={Boolean(inputs[f.createName])}
          onCheckedChange={(v) => set(f.createName, Boolean(v))}
          aria-label={f.nameFa}
        />
        {f.nameFa}
      </label>
    );
  }

  return null;
}
