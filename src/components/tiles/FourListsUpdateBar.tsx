'use client'

/**
 * FourListsUpdateBar — PN-083 · نوار هماهنگ بروزرسانی چهار فهرست داشبورد ملک تبریز
 * ---------------------------------------------------------------------------
 * «هماهنگی کامل بین (۱) بخش بروزرسانی فهرست‌های چهارگانه، (۲) بخش بروزرسانی
 * دستی و (۳) بخش کارهای پس‌زمینهٔ تنظیمات» — این نوار و تنظیمات و بخش
 * بروزرسانی هر فهرست، همه از یک منبع حقیقت می‌خوانند: GET /api/sync/four-lists
 * (ادغام SyncJobState + فاز LCPP + قفل‌های زنده + شمار رکورد).
 *
 * · چهار چیپ (M1 آگهی‌ها · M2 درخواست‌ها · M3 معاملات · M4 مشاوران): وضعیت،
 *   پیشرفت، منبع آخرین اجرا (خودکار/دستی/فوری)، زمان چرخهٔ بعدی و شمار رکورد.
 * · دکمهٔ «بروزرسانی دستی» (فقط مالک): POST /api/sync/four-lists → اجرای فوری
 *   زیر قفل هماهنگ‌ساز (≤۶۰ث) — دیگر هیچ مسیری با هیچ مسیری تداخل نمی‌کند.
 * · TanStack Query: ۱۰s حین اجرا · ۳۰s در سکون (نشانگر زنده بدون بار اضافه).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { api } from '@/lib/client/api'
import { faDigits } from '@/lib/format'

type ListStatus = 'idle' | 'running' | 'paused' | 'done' | 'failed'
type LcppPhase = 'idle' | 'fast-pass' | 'deep-pass' | 'done' | 'error'

interface FourListUi {
  id: 'm1' | 'm2' | 'm3' | 'm4'
  label: string
  shortLabel: string
  status: ListStatus
  lcppPhase: LcppPhase | null
  progressPercent: number
  sourceLabel: string | null
  lastCompletedPage: number
  totalPages: number
  lastWritten: number | null
  updatedAt: string | null
  nextCycleAt: string | null
  rows: number | null
  lockHeldBy: string | null
  detail: Record<string, unknown> | null
}

interface FourListsViewUi {
  ok?: boolean
  running: boolean
  lists: Record<'m1' | 'm2' | 'm3' | 'm4', FourListUi>
}

const ORDER: Array<'m1' | 'm2' | 'm3' | 'm4'> = ['m1', 'm2', 'm3', 'm4']

/** رنگ چیپ بر اساس «جدی‌ترین» وضعیت (قفل زنده > SyncJobState > LCPP) */
function chipState(l: FourListUi): { cls: string; text: string } {
  const live = l.status === 'running' || l.lockHeldBy !== null
  if (live) {
    const deep = l.lcppPhase === 'deep-pass'
    return {
      cls: deep ? 'bg-sky-100 text-sky-800 animate-pulse' : 'bg-amber-100 text-amber-800 animate-pulse',
      text: deep ? 'تکمیل جزئیات…' : 'در حال بروزرسانی…',
    }
  }
  if (l.status === 'failed') return { cls: 'bg-rose-100 text-rose-800', text: 'خطا (چرخهٔ بعدی تلاش مجدد)' }
  if (l.status === 'done') return { cls: 'bg-emerald-100 text-emerald-800', text: 'کامل' }
  return { cls: 'bg-slate-100 text-slate-600', text: 'آماده' }
}

function faTime(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

export function FourListsUpdateBar() {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['four-lists-status'],
    queryFn: async () => {
      const j = await api<FourListsViewUi>('/api/sync/four-lists')
      return j ?? null
    },
    refetchInterval: (query) => (query.state.data?.running ? 10_000 : 30_000),
    staleTime: 60_000,
  })

  const forceRefresh = useMutation({
    mutationFn: async () => {
      const j = await api<{ ok?: boolean; message?: string }>('/api/sync/four-lists', { method: 'POST', body: { list: 'all' } })
      return j
    },
    onSuccess: () => {
      // پس از ثبت درخواست فوری، پایش تندتر شود تا آغاز چرخه زنده دیده شود
      void queryClient.invalidateQueries({ queryKey: ['four-lists-status'] })
    },
  })

  if (!data?.lists) return null // پیش از نخستین پاسخ — بی‌صدا (داشبورد خودش هست)

  const busy = data.running
  const lists = ORDER.map((id) => data.lists[id]).filter(Boolean)

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm" data-testid="four-lists-update-bar">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex h-2.5 w-2.5 rounded-full flex-none ${busy ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}
            aria-hidden
          />
          <span className="text-sm font-medium truncate">
            {busy ? 'بروزرسانی فهرست‌ها در جریان است…' : 'بروزرسانی چهار فهرست — هماهنگ با کارهای پس‌زمینه'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => forceRefresh.mutate()}
          disabled={forceRefresh.isPending || busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50 transition-colors"
          title="اجرای فوری بروزرسانی هر چهار فهرست زیر قفل هماهنگ‌ساز (حداکثر تا ۶۰ ثانیه دیگر)"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${forceRefresh.isPending || busy ? 'animate-spin' : ''}`} aria-hidden />
          {forceRefresh.isPending
            ? 'در حال ثبت…'
            : forceRefresh.isSuccess
              ? 'ثبت شد — چرخهٔ فوری در راه'
              : 'بروزرسانی دستی چهار فهرست'}
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-1.5">
        {lists.map((l) => {
          const chip = chipState(l)
          const live = l.status === 'running' || l.lockHeldBy !== null
          const titleParts = [
            l.label,
            chip.text,
            l.sourceLabel ? `آخرین اجرا: ${l.sourceLabel}` : null,
            l.updatedAt ? `زمان: ${faTime(l.updatedAt)}` : null,
            l.nextCycleAt ? `چرخهٔ کامل بعدی ≈ ${faTime(l.nextCycleAt)}` : null,
            l.rows !== null ? `${faDigits(String(l.rows))} رکورد زنده` : null,
          ].filter(Boolean)
          return (
            <div
              key={l.id}
              className={`rounded-lg px-2.5 py-2 text-[11px] leading-5 ${chip.cls}`}
              title={titleParts.join(' · ')}
              data-testid={`four-lists-chip-${l.id}`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold">{l.shortLabel}</span>
                {live && typeof l.progressPercent === 'number' && l.progressPercent > 0 ? (
                  <span className="tabular-nums font-bold">{faDigits(String(l.progressPercent))}٪</span>
                ) : l.lastWritten && l.lastWritten > 0 ? (
                  <span className="tabular-nums font-bold">+{faDigits(String(l.lastWritten))}</span>
                ) : null}
              </div>
              <div className="opacity-90">
                {l.sourceLabel ? l.sourceLabel : chip.text}
                {l.updatedAt ? ` · ${faTime(l.updatedAt)}` : ''}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        دکمه‌های بروزرسانی داخل هر فهرست و چرخه‌های خودکار، همگی زیر قفل هماهنگ‌ساز اجرا می‌شوند — هیچ اجرای موازی روی سامانهٔ مبدأ در کار نیست.
      </p>
    </div>
  )
}
