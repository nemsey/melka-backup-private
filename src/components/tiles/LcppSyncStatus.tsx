'use client'

/**
 * LcppSyncStatus — PN-051 · فرمان ۴ بند ۴ + فرمان ۷ — نشانگر وضعیت همگام‌سازی
 * ---------------------------------------------------------------------------
 * خط قرمز حکم: «کاربر هرگز صفحهٔ خاموش بی‌نشانگر نمی‌بیند.»
 *   · فاز A: «در حال دریافت اطلاعات حیاتی…» (Fast-Pass ≤۱ دقیقه)
 *   · فاز B: «در حال تکمیل جزئیات…» (Deep-Pass)
 *   · دکمهٔ «بروزرسانی دستی» (Force Refresh — مالک): POST /api/sync/lcpp →
 *     چرخهٔ فوری در ≤۶۰ثانیه (lcppWatch)
 * TanStack Query SWR: staleTime 60s · refetch هنگام بازگشت به تب · چرخهٔ ۳۰s
 * هنگام سینک فعال — یعنی نشانگر زنده بدون بار سرور اضافی.
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { api } from '@/lib/client/api'

interface LcppListStatusUi {
  list: string
  phase: 'idle' | 'fast-pass' | 'deep-pass' | 'done' | 'error'
  label: string
  progressPct: number
  fetched?: number
  written?: number
  skippedUnchanged?: number
  error?: string
}

interface LcppStatusUi {
  running: boolean
  phase: 'idle' | 'fast-pass' | 'deep-pass' | 'done' | 'error'
  cycleId: string
  startedAt: string | null
  finishedAt: string | null
  lists: Record<string, LcppListStatusUi>
}

const LIST_TITLES: Record<string, string> = {
  'm1-arm-listings': 'آگهی ملک‌تبریز (M1)',
  'm2-arm-requests': 'درخواست ملک‌تبریز (M2)',
  'm9-transactions': 'معاملات (M9)',
  'm7-melketun-listings': 'آگهی ملکتون (M7)',
  'm8-melketun-requests': 'درخواست ملکتون (M8)',
}

const CHIP_CLASS: Record<string, string> = {
  idle: 'bg-slate-100 text-slate-600',
  'fast-pass': 'bg-amber-100 text-amber-800 animate-pulse',
  'deep-pass': 'bg-sky-100 text-sky-800 animate-pulse',
  done: 'bg-emerald-100 text-emerald-800',
  error: 'bg-rose-100 text-rose-800',
}

export function LcppSyncStatus() {
  const { data } = useQuery({
    queryKey: ['lcpp-status'],
    queryFn: async () => {
      const j = await api<{ ok?: boolean; status?: LcppStatusUi & { labels?: Record<string, string> } }>(
        '/api/sync/lcpp'
      )
      return j?.status ?? null
    },
    refetchInterval: (query) => (query.state.data?.running ? 10_000 : 30_000),
    staleTime: 60_000,
  })

  const forceRefresh = useMutation({
    mutationFn: async () => {
      const j = await api<{ ok?: boolean; message?: string }>('/api/sync/lcpp', { method: 'POST' })
      return j
    },
  })

  if (!data) return null // پیش از نخستین پاسخ — بی‌صدا (بدون صفحهٔ خاموش: داشبورد خودش هست)

  const overall = data.phase ?? 'idle'
  const busy = data.running
  const lists = Object.entries(data.lists ?? {}).filter(([id]) => LIST_TITLES[id])
  const overallLabel =
    overall === 'fast-pass'
      ? 'در حال دریافت اطلاعات حیاتی…'
      : overall === 'deep-pass'
        ? 'در حال تکمیل جزئیات…'
        : overall === 'done'
          ? 'همگام‌سازی کامل شد'
          : overall === 'error'
            ? 'خطا در همگام‌سازی (چرخهٔ بعدی تلاش مجدد)'
            : 'آماده'

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm" data-testid="lcpp-sync-status">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex h-2.5 w-2.5 rounded-full flex-none ${
              busy ? 'bg-amber-500 animate-pulse' : overall === 'error' ? 'bg-rose-500' : 'bg-emerald-500'
            }`}
            aria-hidden
          />
          <span className="text-sm font-medium truncate">{busy ? overallLabel : overallLabel}</span>
          {data.finishedAt && !busy ? (
            <span className="text-xs text-muted-foreground">
              آخرین چرخه: {new Date(data.finishedAt).toLocaleTimeString('fa-IR')}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => forceRefresh.mutate()}
          disabled={forceRefresh.isPending || busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50 transition-colors"
          title="اجرای فوری همگام‌سازی (حداکثر تا ۶۰ ثانیه دیگر)"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${forceRefresh.isPending || busy ? 'animate-spin' : ''}`} aria-hidden />
          {forceRefresh.isPending
            ? 'در حال ثبت…'
            : forceRefresh.isSuccess
              ? 'ثبت شد — چرخهٔ فوری در راه'
              : 'بروزرسانی دستی'}
        </button>
      </div>
      {lists.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {lists.map(([id, s]) => (
            <span
              key={id}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${CHIP_CLASS[s.phase] ?? CHIP_CLASS.idle}`}
              title={s.error ?? s.label}
            >
              {LIST_TITLES[id] ?? id}
              {typeof s.written === 'number' && s.written > 0 ? <b>· {s.written.toLocaleString('fa-IR')}</b> : null}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
