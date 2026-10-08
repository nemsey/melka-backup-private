"use client";

/**
 * بخش «مدیریت دسترسی کارشناسان ملکا» — PN-008 BLOCK 7 (بند ۷.۳) · PN-017 جابه‌جایی عنوان
 * (سازگاری: بخش شاهکار ساخت حساب/نقش/ماتریس را در «مدیریت کاربران ملک تبریز» انجام می‌دهد)
 * ------------------------------------------------------
 * در تنظیمات عمومی (فقط OWNER روت API را می‌بیند):
 *   · فرم ورودی کد پرسنلی
 *   · سه رادیو: دسترسی کامل / محدود (چند انتخابی کاشی) / عدم دسترسی
 *   · اگر «محدود»: چک‌باکس‌های کاشی‌ها
 *   · دکمه ذخیره / حذف + فهرست رکوردهای موجود
 * قانون هویت دوگانه: کد مالک همیشه full — رکوردش بی‌اثر است (نمایش اطلاعاتی).
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Trash2, Users, ShieldCheck, ShieldOff, ShieldHalf } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useAppStore } from "@/lib/client/store";
import { faDigits } from "@/lib/jalali";

interface AccessRow {
  personnelCode: string;
  level: "full" | "limited" | "none";
  allowedTiles: string[];
  grantedBy: string;
  notes: string | null;
}

interface RegistryResponse {
  ok: boolean;
  rows: AccessRow[];
  registry: Array<{ id: string; title: string }>;
  ownerPersonnelCodes: string[];
}

const LEVEL_LABEL: Record<string, string> = {
  full: "دسترسی کامل — همهٔ کاشی‌های داشبورد",
  limited: "دسترسی محدود — فقط کاشی‌های انتخاب‌شده",
  none: "عدم دسترسی — هیچ کاشی‌ای",
};

export function PersonnelAccessSection() {
  const { toast } = useToast();
  const userRole = useAppStore((s) => s.user?.role ?? "CONSULTANT");
  const [rows, setRows] = useState<AccessRow[]>([]);
  const [registry, setRegistry] = useState<Array<{ id: string; title: string }>>([]);
  const [ownerCodes, setOwnerCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [level, setLevel] = useState<"full" | "limited" | "none">("none");
  const [tiles, setTiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api<RegistryResponse>("/api/admin/personnel-access");
      setRows(res.rows ?? []);
      setRegistry(res.registry ?? []);
      setOwnerCodes(res.ownerPersonnelCodes ?? []);
    } catch {
      // OWNER نیست یا خطا — بخش خالی می‌ماند
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userRole === "OWNER") void load();
    else setLoading(false);
  }, [userRole, load]);

  if (userRole !== "OWNER") return null; // فقط مالک می‌بیند (روت هم OWNER-only است)

  const save = async () => {
    const personnelCode = code.trim();
    if (personnelCode.length < 3) {
      toast({ title: "کد پرسنلی معتبر وارد کنید", variant: "destructive" });
      return;
    }
    if (level === "limited" && tiles.length === 0) {
      toast({ title: "برای دسترسی محدود حداقل یک کاشی انتخاب کنید", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await api("/api/admin/personnel-access", {
        method: "POST",
        body: { personnelCode, level, allowedTiles: tiles },
      });
      toast({ title: "دسترسی ذخیره شد", description: `کد پرسنلی ${faDigits(personnelCode)} — سطح: ${LEVEL_LABEL[level].split("—")[0].trim()}` });
      setCode("");
      setTiles([]);
      setLevel("none");
      await load();
    } catch (e) {
      toast({ title: "ذخیره ناموفق", description: e instanceof ApiClientError ? e.message : "خطای نامشخص", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (personnelCode: string) => {
    setBusy(true);
    try {
      await api(`/api/admin/personnel-access/${encodeURIComponent(personnelCode)}`, { method: "DELETE" });
      toast({ title: "رکورد حذف شد", description: `کد پرسنلی ${faDigits(personnelCode)} — پیش‌فرض: عدم دسترسی` });
      await load();
    } catch (e) {
      toast({ title: "حذف ناموفق", description: e instanceof ApiClientError ? e.message : "خطای نامشخص", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="settings-personnel-access">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" aria-hidden /> مدیریت دسترسی کارشناسان ملکا
        </CardTitle>
        <CardDescription>سطح دسترسی هر کد پرسنلی به کاشی‌های اپلیکیشن ملکا — سه حالت (ساخت حساب و نقش‌ها در بخش «مدیریت کاربران ملک تبریز»)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* فرم ثبت/ویرایش */}
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="pa-code">کد پرسنلی</Label>
            <Input id="pa-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="مثال: 410031320" dir="ltr" inputMode="numeric" />
          </div>
          <RadioGroup value={level} onValueChange={(v) => setLevel(v as typeof level)} className="gap-3">
            <div className="flex items-start gap-2">
              <RadioGroupItem value="full" id="pa-full" className="mt-1" />
              <Label htmlFor="pa-full" className="flex items-center gap-1.5 font-normal cursor-pointer">
                <ShieldCheck className="w-4 h-4 text-primary" aria-hidden /> {LEVEL_LABEL.full}
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="limited" id="pa-limited" className="mt-1" />
              <Label htmlFor="pa-limited" className="flex items-center gap-1.5 font-normal cursor-pointer">
                <ShieldHalf className="w-4 h-4 text-primary" aria-hidden /> {LEVEL_LABEL.limited}
              </Label>
            </div>
            {level === "limited" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 ps-6 pt-1" data-testid="pa-tiles">
                {registry.map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5 text-xs rounded-md border px-2.5 py-2 cursor-pointer hover:bg-muted/50">
                    <Checkbox
                      checked={tiles.includes(t.id)}
                      onCheckedChange={(v) => setTiles((prev) => (v ? [...prev, t.id] : prev.filter((x) => x !== t.id)))}
                    />
                    {t.title}
                  </label>
                ))}
              </div>
            )}
            <div className="flex items-start gap-2">
              <RadioGroupItem value="none" id="pa-none" className="mt-1" />
              <Label htmlFor="pa-none" className="flex items-center gap-1.5 font-normal cursor-pointer">
                <ShieldOff className="w-4 h-4 text-muted-foreground" aria-hidden /> {LEVEL_LABEL.none}
              </Label>
            </div>
          </RadioGroup>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void save()} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Save className="w-3.5 h-3.5" aria-hidden />} ذخیره
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setCode(""); setTiles([]); setLevel("none"); }} className="gap-1.5">انصراف</Button>
          </div>
        </div>

        {/* فهرست رکوردها */}
        {loading ? (
          <p className="text-xs text-muted-foreground">در حال بارگذاری…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">هنوز رکوردی ثبت نشده است — همهٔ کدپرسنلی‌ها جز مالک، بدون دسترسی هستند.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const isOwner = ownerCodes.includes(r.personnelCode);
              return (
                <div key={r.personnelCode} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="font-mono font-bold tabular-nums" dir="ltr">{faDigits(r.personnelCode)}</span>
                    <Badge variant={r.level === "full" ? "default" : r.level === "limited" ? "secondary" : "outline"} className="text-[10px]">
                      {r.level === "full" ? "کامل" : r.level === "limited" ? `محدود (${faDigits(r.allowedTiles.length)} کاشی)` : "بدون دسترسی"}
                    </Badge>
                    {isOwner && <Badge className="bg-amber-500 text-amber-950 text-[10px]">کد مالک — همیشه کامل (قانون هویت دوگانه)</Badge>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void remove(r.personnelCode)} disabled={busy} className="gap-1 h-7 text-[11px]">
                    <Trash2 className="w-3 h-3" aria-hidden /> حذف
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
