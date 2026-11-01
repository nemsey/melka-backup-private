'use client'

/**
 * /settings/melketun — تنظیمات یکپارچهٔ ملکتون (PN-043/فاز ۳ — شورا-ن۰۸۷)
 * ---------------------------------------------------------------------------
 * Tab 1 «اتصال به ملکتون»   — وضعیت اتصال (direct / relay / blocked)
 * Tab 2 «مدیریت اتصال‌ها»   — لیست اتصال‌ها (CRM, عمومی) + وضعیت زندهٔ تست
 * Tab 3 «اتصال به CRM»       — فرم (username / password از فایل راز — رمز ماسک‌شده)
 * Tab 4 «رله Termux»        — وضعیت رله + ثبت URL رله (بدون فعال‌سازی خودکار)
 *
 * اصل صداقت (PN-043): هیچ چیز تظاهر نمی‌شود — endpoint دقیق login در فاز ۰
 * کشف نشد ⇒ CRM فقط reachability است و پیام «در انتظار کشف API» صادقانه نمایش می‌شود.
 * راز‌ها هرگز در UI چاپ نمی‌شوند (قانون ۱۲ — فقط username و رمز ماسک‌شده از API).
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/client/api'
import { ExternalLink, Landmark, Plug, RefreshCw, Radio, ShieldCheck } from 'lucide-react'

interface MelketunMeta {
  crm: { base_url: string; username: string; passwordMasked: string }
  public: { base_url: string }
  connectionMode: 'direct' | 'relay' | 'blocked'
}

interface TestResult {
  ok: boolean
  public: { ok: boolean; status: number; latencyMs: number }
  crm: { ok: boolean; status: number; note: string }
}

const CONNECTION_MODE_LABEL: Record<MelketunMeta['connectionMode'], string> = {
  direct: '✅ اتصال مستقیم برقرار است (verdict فاز ۰ — رله لازم نیست)',
  relay: '🔁 از طریق رله Termux',
  blocked: '🚨 مسدود (فایروال)',
}

const RELAY_URL_KEY = 'melketun-relay-url'

function StatusBadge({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) return <span className="text-xs text-muted-foreground">{label} — تست نشده</span>
  return (
    <span
      className={`text-xs font-bold px-2 py-1 rounded-full ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}
      data-testid="melketun-status"
    >
      {label} — {ok ? 'سبز' : 'قرمز'}
    </span>
  )
}

export default function MelketunSettingsPage() {
  const [meta, setMeta] = useState<MelketunMeta | null>(null)
  const [test, setTest] = useState<TestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [relayUrl, setRelayUrl] = useState('')
  const [relaySaved, setRelaySaved] = useState(false)

  const loadMeta = useCallback(async () => {
    try {
      const res = await api<MelketunMeta>('/api/integrations/melketun')
      setMeta(res)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در بارگذاری وضعیت ملکتون')
    }
  }, [])

  useEffect(() => {
    void loadMeta()
    const saved = localStorage.getItem(RELAY_URL_KEY)
    if (saved) setRelayUrl(saved)
  }, [loadMeta])

  const runTest = useCallback(async () => {
    setTesting(true)
    try {
      const res = await api<TestResult>('/api/integrations/melketun', { method: 'POST' })
      setTest(res)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در تست اتصال')
    } finally {
      setTesting(false)
    }
  }, [])

  const saveRelayUrl = useCallback(() => {
    const trimmed = relayUrl.trim()
    if (trimmed) {
      localStorage.setItem(RELAY_URL_KEY, trimmed)
      setRelaySaved(true)
    }
  }, [relayUrl])

  return (
    <main className="flex-1 mx-auto max-w-4xl w-full px-4 sm:px-6 py-8 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-700 via-indigo-500 to-indigo-400 flex items-center justify-center shadow-lg">
          <Landmark className="w-6 h-6 text-white" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-extrabold">تنظیمات ملکتون</h1>
          <p className="text-xs text-muted-foreground">
            یکپارچه‌سازی داشبوردها + اتصال به ملکتون (PN-043 — شورا-ن۰۸۷)
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      <Tabs defaultValue="connection">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="connection">اتصال به ملکتون</TabsTrigger>
          <TabsTrigger value="manage">مدیریت اتصال‌ها</TabsTrigger>
          <TabsTrigger value="crm">اتصال به CRM</TabsTrigger>
          <TabsTrigger value="relay">رله Termux</TabsTrigger>
        </TabsList>

        {/* Tab 1 — وضعیت اتصال */}
        <TabsContent value="connection">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plug className="w-4 h-4" aria-hidden /> وضعیت اتصال به ملکتون
              </CardTitle>
              <CardDescription>نتیجهٔ کشف فاز ۰ (recon) + تست زندهٔ دکمهٔ زیر</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm" data-testid="melketun-mode">
                {meta ? CONNECTION_MODE_LABEL[meta.connectionMode] : 'در حال بارگذاری…'}
              </p>
              {test && (
                <div className="text-xs text-muted-foreground space-y-1" data-testid="melketun-test-summary">
                  <p>سایت عمومی: HTTP {test.public.status} · {test.public.latencyMs}ms</p>
                  <p>CRM: HTTP {test.crm.status} · {test.crm.note}</p>
                </div>
              )}
              <Button onClick={runTest} disabled={testing} className="gap-2">
                <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} aria-hidden />
                {testing ? 'در حال تست…' : 'تست اتصال'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2 — مدیریت اتصال‌ها */}
        <TabsContent value="manage">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">مدیریت اتصال‌ها</CardTitle>
              <CardDescription>دو اتصال فعال: CRM و سایت عمومی — وضعیت از آخرین تست زنده</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div className="text-sm">
                  <span className="font-bold">CRM ملکتون</span>{' '}
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {meta?.crm.base_url ?? '—'} <ExternalLink className="inline w-3 h-3" aria-hidden />
                  </span>
                </div>
                <StatusBadge ok={test ? test.crm.ok : null} label={`HTTP ${test?.crm.status ?? '—'}`} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div className="text-sm">
                  <span className="font-bold">سایت عمومی ملکتون</span>{' '}
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {meta?.public.base_url ?? '—'}
                  </span>
                </div>
                <StatusBadge ok={test ? test.public.ok : null} label={`HTTP ${test?.public.status ?? '—'}`} />
              </div>
              <Button onClick={runTest} disabled={testing} variant="outline" className="gap-2">
                <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} aria-hidden />
                تست زندهٔ همهٔ اتصال‌ها
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3 — اتصال به CRM */}
        <TabsContent value="crm">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">اتصال به CRM ملکتون</CardTitle>
              <CardDescription>
                اطلاعات از فایل راز (Persistent Zone) خوانده می‌شود — رمز هرگز نمایش داده نمی‌شود
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold" htmlFor="melketun-username">نام کاربری CRM</label>
                  <Input id="melketun-username" value={meta?.crm.username ?? ''} readOnly dir="ltr" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold" htmlFor="melketun-password">رمز عبور</label>
                  <Input
                    id="melketun-password"
                    value={meta?.crm.passwordMasked ?? ''}
                    readOnly
                    dir="ltr"
                    aria-label="رمز عبور CRM (ماسک‌شده)"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid="melketun-crm-note">
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
                در انتظار کشف API: endpoint دقیق login در فاز ۰ کشف نشد — فعلاً فقط
                reachability تست می‌شود (نه login واقعی). پس از کشف، login واقعی فعال می‌شود.
              </p>
              <Button onClick={runTest} disabled={testing} variant="outline" className="gap-2">
                <RefreshCw className={`w-4 h-4 ${testing ? 'animate-spin' : ''}`} aria-hidden />
                تست دسترسی CRM (reachability)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4 — رله Termux */}
        <TabsContent value="relay">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Radio className="w-4 h-4" aria-hidden /> رله Termux ملکتون
              </CardTitle>
              <CardDescription>وضعیت رله + ثبت URL رله (فعال‌سازی خودکار وجود ندارد)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm" data-testid="melketun-relay-verdict">
                ✅ اتصال مستقیم برقرار است (verdict فاز ۰) — رله Termux لازم نیست؛
                فاز ۴ skip شد. URL رله فقط برای روزی که فایروال مسدود کند ثبت می‌شود.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[16rem] space-y-1">
                  <label className="text-xs font-bold" htmlFor="melketun-relay-url">URL رله (اختیاری — ذخیره در مرورگر)</label>
                  <Input
                    id="melketun-relay-url"
                    value={relayUrl}
                    onChange={(e) => { setRelayUrl(e.target.value); setRelaySaved(false) }}
                    placeholder="https://… (Termux relay)"
                    dir="ltr"
                  />
                </div>
                <Button onClick={saveRelayUrl} variant="outline">ثبت URL رله</Button>
              </div>
              {relaySaved && (
                <p className="text-xs text-emerald-700">✅ URL رله ثبت شد (بدون فعال‌سازی خودکار — آماده برای آینده)</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  )
}
