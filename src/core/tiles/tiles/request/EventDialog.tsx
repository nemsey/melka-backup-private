"use client";

/**
 * دیالوگ «ثبت رویداد» — عین فرم request-events خود سامانه آرم
 * ------------------------------------------------------
 * نوع رویداد (رادیو از request-event-types زنده خود سامانه) +
 * تاریخ (در صورت نیاز نوع) + ساعت + کدآگهی (جستجوی زنده) + پیام (اختیاری)
 * ثبت محلی + همگام‌سازی خودکار با POST request-events/create آرم (در صورت ثبت قبلی درخواست و وجود توکن)
 */

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CalendarPlus, Search, Info, CheckCircle2 } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber, faDateTime } from "@/lib/format";
import { isoToJalaliString } from "@/lib/jalali";
import type { RequestRow } from "@/lib/request/types";

interface EventType {
  id: string;
  name: string;
  needTime?: boolean;
  needHour?: boolean;
  needMessage?: boolean;
  needProperty?: boolean;
}

interface EventRow {
  id: string;
  eventTypeName: string;
  date: string | null;
  hour: string | null;
  propertyCode: string | null;
  message: string | null;
  armEventId: string | null;
  armSyncedAt: string | null;
  createdAt: string;
}

interface EventsResponse {
  ok: boolean;
  events: EventRow[];
  armRequestId: string | null;
  eventTypes: { types: EventType[]; live: boolean; error: string | null };
  requirements: { armToken: boolean; message: string };
}

export function EventDialog({
  request,
  open,
  onOpenChange,
  onSaved,
}: {
  request: RequestRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedType, setSelectedType] = useState<EventType | null>(null);
  const [customTypeName, setCustomTypeName] = useState("");
  const [dateIso, setDateIso] = useState("");
  const [hour, setHour] = useState("");
  const [propertyCode, setPropertyCode] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!request || !open) return;
    setLoading(true);
    try {
      const res = await api<EventsResponse>(`/api/requests/${request.id}/events`);
      setData(res);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "بارگذاری ناموفق", description: e.message, variant: "destructive" });
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [request, open, toast]);

  useEffect(() => {
    if (open) {
      setSelectedType(null);
      setCustomTypeName("");
      setDateIso("");
      setHour("");
      setPropertyCode("");
      setMessage("");
      void load();
    }
     
  }, [open, request?.id]);

  const flags = selectedType
    ? { needTime: selectedType.needTime, needHour: selectedType.needHour, needMessage: selectedType.needMessage, needProperty: selectedType.needProperty }
    : { needTime: false, needHour: false, needMessage: false, needProperty: false };
  const anyField = flags.needTime || flags.needHour || flags.needMessage || flags.needProperty;
  const useCustomType = (data?.eventTypes.types.length ?? 0) === 0;

  const submit = useCallback(async () => {
    if (!request) return;
    const typeName = selectedType?.name ?? customTypeName.trim();
    if (!typeName) {
      toast({ title: "نوع رویداد الزامی است", description: "عین خود سامانه: ابتدا نوع رویداد را انتخاب کنید.", variant: "destructive" });
      return;
    }
    if (flags.needTime && !dateIso) {
      toast({ title: "تاریخ الزامی است", description: "این نوع رویداد به تاریخ نیاز دارد (عین خود سامانه).", variant: "destructive" });
      return;
    }
    if (flags.needHour && !hour) {
      toast({ title: "ساعت الزامی است", description: "این نوع رویداد به ساعت نیاز دارد (عین خود سامانه).", variant: "destructive" });
      return;
    }
    if (flags.needProperty && !propertyCode.trim()) {
      toast({ title: "کدآگهی الزامی است", description: "این نوع رویداد به کدآگهی نیاز دارد (عین خود سامانه).", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await api<{ ok: boolean; message: string; arm: { ok: boolean; error?: string | null } | null }>(`/api/requests/${request.id}/events`, {
        method: "POST",
        body: {
          eventTypeId: selectedType?.id ?? `local-${typeName}`,
          eventTypeName: typeName,
          flags,
          date: dateIso || null,
          hour: hour || null,
          propertyCode: propertyCode.trim() || null,
          message: message.trim() || null,
        },
      });
      toast({
        title: res.arm ? (res.arm.ok ? "رویداد ثبت و در آرم همگام شد" : "رویداد محلی ثبت شد") : "رویداد ثبت شد",
        description: res.message,
        variant: res.arm && !res.arm.ok ? "default" : undefined,
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ثبت رویداد ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [request, selectedType, customTypeName, flags, dateIso, hour, propertyCode, message, onSaved, onOpenChange, toast]);

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent dir="rtl" className="max-w-xl max-h-[92svh] overflow-y-auto">
        <DialogHeader className="text-right space-y-2 items-start">
          <DialogTitle className="text-right flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-teal-600" aria-hidden /> ثبت رویداد برای درخواست
          </DialogTitle>
          <DialogDescription className="text-right leading-relaxed">
            «{request.title}» — {request.customerName}
            {request.armRequestId ? " · درخواست در سامانه آرم ثبت شده و رویداد همزمان همگام می‌شود." : " · ثبت محلی (پس از ثبت درخواست در آرم، همگام‌سازی خودکار فعال می‌شود)."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* نوع رویداد — عین خود سامانه: «نوع رویداد را انتخاب کنید» */}
            <div className="space-y-2">
              <Label className="text-xs font-bold flex items-center gap-1">
                نوع رویداد را انتخاب کنید <b className="text-rose-600">*</b>
              </Label>
              {data?.eventTypes.live && data.eventTypes.types.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {data.eventTypes.types.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedType(t)}
                      className={`text-xs rounded-xl border p-2.5 text-right transition-colors ${selectedType?.id === t.id ? "bg-teal-600 text-white border-teal-600 shadow" : "bg-background hover:bg-muted"}`}
                      aria-pressed={selectedType?.id === t.id}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-[11px] flex items-start gap-1.5 leading-5">
                    <Info className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" aria-hidden />
                    <span>
                      {data?.eventTypes.error ?? "انواع رویداد زنده سامانه آرم در دسترس نیست."}
                      {" "}عنوان رویداد را دستی وارد کنید — رویداد محلی ثبت می‌شود و پس از اتصال آرم، انواع زنده و همگام‌سازی فعال می‌گردد.
                    </span>
                  </div>
                  <Input placeholder="عنوان رویداد (مثلاً: تماس تلفنی، ارسال آگهی…)" value={customTypeName} onChange={(e) => setCustomTypeName(e.target.value)} />
                </div>
              )}
            </div>

            {/* فیلدهای شرطی عین خود سامانه (needTime/needHour/needProperty/needMessage) */}
            {anyField && (
              <div className="rounded-xl border border-dashed p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {flags.needTime && (
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      تاریخ <b className="text-rose-600">*</b>
                    </Label>
                    <JalaliDatePicker value={dateIso} onChange={(iso) => { setDateIso(iso); setHour(""); }} />
                  </div>
                )}
                {flags.needHour && (
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      ساعت <b className="text-rose-600">*</b>
                    </Label>
                    <Input
                      dir="ltr"
                      className="text-left"
                      placeholder="18:30"
                      value={hour}
                      disabled={!dateIso}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d:]/g, "").slice(0, 5);
                        setHour(v);
                      }}
                    />
                    <p className="text-[9px] text-muted-foreground">برای امروز، حداقل ۱ ساعت بعد (عین خود سامانه).</p>
                  </div>
                )}
                {flags.needProperty && (
                  <div className="space-y-1.5 col-span-full">
                    <Label className="text-xs flex items-center gap-1">
                      کدآگهی <b className="text-rose-600">*</b>
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        dir="ltr"
                        inputMode="numeric"
                        className="text-left flex-1"
                        placeholder="کد آگهی"
                        value={propertyCode}
                        onChange={(e) => setPropertyCode(e.target.value.replace(/\D/g, ""))}
                      />
                      <Badge variant="outline" className="gap-1 shrink-0 self-center">
                        <Search className="w-3 h-3" aria-hidden /> هنگام ثبت در آرم بررسی می‌شود
                      </Badge>
                    </div>
                    <p className="text-[9px] text-muted-foreground">کدآگهی هنگام ثبت در سامانه آرم جستجو می‌شود و مشاور/عنوان آگهی متصل می‌گردد (عین خود سامانه).</p>
                  </div>
                )}
                {flags.needMessage && (
                  <div className="space-y-1.5 col-span-full">
                    <Label className="text-xs">(اختیاری) پیام</Label>
                    <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            {/* تاریخچه رویدادهای ثبت‌شده — عین تب «بازخورد-رویداد» خود سامانه */}
            {data && data.events.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-bold">رویدادهای ثبت‌شده ({faNumber(data.events.length)})</Label>
                <div className="max-h-44 overflow-y-auto rounded-lg border divide-y">
                  {data.events.map((e, i) => (
                    <div key={e.id} className="p-2.5 text-[11px] flex items-start gap-2">
                      <span className="shrink-0 w-5 h-5 rounded-lg bg-teal-600/10 border border-teal-600/25 grid place-content-center text-[9px] font-extrabold text-teal-700 dark:text-teal-300 tabular-nums">
                        {faNumber(i + 1)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold flex items-center gap-1.5 flex-wrap">
                          {e.eventTypeName}
                          {e.armEventId && (
                            <Badge className="text-[8px] gap-1 bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                              <CheckCircle2 className="w-2.5 h-2.5" aria-hidden /> همگام با آرم
                            </Badge>
                          )}
                        </p>
                        <p className="text-muted-foreground leading-5">
                          {faDateTime(e.createdAt)}
                          {e.date && ` · تاریخ ${isoToJalaliString(e.date)}`}
                          {e.hour && ` ساعت ${e.hour}`}
                          {e.propertyCode && ` · آگهی ${e.propertyCode}`}
                        </p>
                        {e.message && <p className="text-muted-foreground leading-5 truncate" title={e.message}>{e.message}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>انصراف</Button>
          <Button onClick={() => void submit()} disabled={saving || loading} className="gap-1.5 bg-gradient-to-l from-teal-600 to-cyan-500 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CalendarPlus className="w-4 h-4" aria-hidden />}
            ثبت رویداد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
