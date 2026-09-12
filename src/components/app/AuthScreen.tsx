"use client";

/**
 * صفحه ورود — مرحله ۱: کد پرسنلی یا کد مدیر
 * ------------------------------------------------------
 * دو مسیر: (۱) کارشناس با کد پرسنلی → پیامک  (۲) مالک با کد مدیر → ورود مستقیم
 * ورودی‌ها ارقام فارسی/عربی را به لاتین تبدیل می‌کنند.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, KeyRound, ShieldCheck, Smartphone, Building2 } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useAppStore } from "@/lib/client/store";
import { enDigits } from "@/lib/format";

export function AuthScreen() {
  const { toast } = useToast();
  const setPendingPersonnelCode = useAppStore((s) => s.setPendingPersonnelCode);
  const setStage = useAppStore((s) => s.setStage);
  const login = useAppStore((s) => s.login);

  const [personnelCode, setPersonnelCode] = useState("");
  const [masterCode, setMasterCode] = useState("");
  const [mode, setMode] = useState<"CONSULTANT" | "MASTER">("CONSULTANT");
  const [loading, setLoading] = useState(false);

  const submitPersonnel = useCallback(async () => {
    const code = enDigits(personnelCode).trim();
    if (!/^\d{6,12}$/.test(code)) {
      toast({ title: "کد پرسنلی نامعتبر", description: "کد پرسنلی باید ۶ تا ۱۲ رقم باشد.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ ok: boolean; expiresInSeconds: number; source?: string }>(
        "/api/auth/request-otp",
        { method: "POST", body: { personnelCode: code }, auth: false }
      );
      setPendingPersonnelCode(code);
      setStage("otp");
      toast({
        title: "کد پیامکی ارسال شد",
        description: "کد تأیید ۴ رقمی به شماره موبایل ثبت‌شده در سامانه ملک تبریز پیامک شد.",
      });
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "خطا در ارسال کد", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [personnelCode, setPendingPersonnelCode, setStage, toast]);

  const submitMaster = useCallback(async () => {
    const code = enDigits(masterCode).trim();
    if (!/^\d{8}$/.test(code)) {
      toast({ title: "کد مدیر نامعتبر", description: "کد مدیر باید ۸ رقم باشد.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ ok: boolean; token: string; user: { personnelCode: string; displayName: string; role: "OWNER" | "CONSULTANT"; expiresAt: string } }>(
        "/api/auth/master-login",
        { method: "POST", body: { masterCode: code }, auth: false }
      );
      await login(res.token, res.user);
      toast({ title: `خوش آمدید، ${res.user.displayName}`, description: "ورود مدیر با موفقیت انجام شد." });
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ورود مدیر ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [masterCode, login, toast]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-primary/5 via-background to-background">
      <main className="w-full max-w-md">
        {/* برندینگ */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 mb-4 tile-pop">
            <Building2 className="w-10 h-10 text-primary-foreground" aria-hidden />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">داشبورد هوشمند ملک تبریز</h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base leading-relaxed">
            لایه‌ی هوش تحلیلی و تصمیم‌یار، مکمل سامانه‌ی CRM ملک تبریز
          </p>
        </div>

        <Card className="tile-pop border-border/60 shadow-xl shadow-black/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {mode === "CONSULTANT" ? "ورود کارشناس" : "ورود مدیر سامانه"}
              </CardTitle>
              <Badge variant={mode === "CONSULTANT" ? "secondary" : "outline"} className="gap-1">
                {mode === "CONSULTANT" ? (
                  <>
                    <Smartphone className="w-3.5 h-3.5" aria-hidden /> تأیید پیامکی
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden /> دسترسی کامل
                  </>
                )}
              </Badge>
            </div>
            <CardDescription>
              {mode === "CONSULTANT"
                ? "کد پرسنلی خود را وارد کنید تا کد تأیید پیامکی صادر شود."
                : "مالک سامانه با کد یکتای مدیر، بدون پیامک وارد می‌شود."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === "CONSULTANT" ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitPersonnel();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="personnelCode">کد پرسنلی</Label>
                  <Input
                    id="personnelCode"
                    inputMode="numeric"
                    autoComplete="username"
                    placeholder="مثال: ۴۱۰۰۳۱۳۲۰"
                    dir="ltr"
                    className="text-center text-lg tracking-widest font-medium"
                    value={personnelCode}
                    onChange={(e) => setPersonnelCode(e.target.value.replace(/[^\d۰-۹٠-٩]/g, ""))}
                    disabled={loading}
                    aria-describedby="personnelCodeHint"
                  />
                  <p id="personnelCodeHint" className="text-xs text-muted-foreground">
                    کد پرسنلی شما در سامانه ملک تبریز ثبت شده است.
                  </p>
                </div>
                <Button type="submit" className="w-full h-12 text-base font-bold" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> در حال ارسال…
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-5 h-5 ml-2" aria-hidden /> دریافت کد پیامکی
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitMaster();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="masterCode">کد مدیر (۸ رقم)</Label>
                  <Input
                    id="masterCode"
                    inputMode="numeric"
                    type="password"
                    dir="ltr"
                    className="text-center text-lg tracking-widest font-medium"
                    value={masterCode}
                    onChange={(e) => setMasterCode(e.target.value.replace(/[^\d۰-۹٠-٩]/g, ""))}
                    disabled={loading}
                    aria-describedby="masterCodeHint"
                  />
                  <p id="masterCodeHint" className="text-xs text-muted-foreground">
                    این کد فقط در اختیار مالک سامانه است و به‌صورت امن مقایسه می‌شود.
                  </p>
                </div>
                <Button type="submit" variant="outline" className="w-full h-12 text-base font-bold" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> در حال بررسی…
                    </>
                  ) : (
                    "ورود به عنوان مدیر"
                  )}
                </Button>
              </form>
            )}

            <Separator />

            <button
              type="button"
              className="w-full text-sm text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md py-1"
              onClick={() => setMode(mode === "CONSULTANT" ? "MASTER" : "CONSULTANT")}
            >
              {mode === "CONSULTANT" ? "ورود با کد مدیر (مالک سامانه)" : "بازگشت به ورود با کد پرسنلی"}
            </button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          مالک و برنامه‌نویس و طراح: سید نعمت اله سیدی
        </p>
      </main>
    </div>
  );
}
