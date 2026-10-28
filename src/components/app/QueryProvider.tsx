'use client'

/**
 * QueryProvider — PN-051 · فرمان ۷ — TanStack Query با Stale-While-Revalidate
 * ---------------------------------------------------------------------------
 * یک QueryClient برای زیردرخت داشبورد:
 *   · staleTime 60s → در بازهٔ تازگی از کش فوری جواب (revalidate پس‌زمینه) — SWR
 *   · refetchOnWindowFocus → بازگشت به تب = تازگی بی‌درنگ
 *   · پایدارسازی به IndexedDB (idb-keyval) — دسترسی آفلاین + boot سریع:
 *     هیدرات یک‌باره در ساخت (await لازم نیست — سنجاق می‌شود و cache تازه می‌شود)
 * مزیت بر fetch دستی قدیمی: صفر درخواست تکراری بین کاشی‌ها (dedup کلید query).
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { get, set } from 'idb-keyval'
import { useEffect, useState, type ReactNode } from 'react'

const PERSIST_KEY = 'melka-query-cache-v1'

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000, // SWR: در بازهٔ تازگی → کش فوری + revalidate پس‌زمینه
          gcTime: 30 * 60_000,
          refetchOnWindowFocus: true,
          retry: 1,
        },
      },
    })
    // هیدرات آفلاین — بهترین-تلاش (IndexedDB در برخی مرورگرها غایب/سهمیه‌پر)
    void get(PERSIST_KEY)
      .then((cached) => {
        if (cached && Array.isArray(cached)) {
          for (const entry of cached) {
            try {
              qc.setQueryData(entry.queryKey, entry.data, { updatedAt: entry.updatedAt })
            } catch {
              /* ردیف معیوب کش — نادیده */
            }
          }
        }
      })
      .catch(() => {})
    return qc
  })

  // پایدارسازی — debounce ۲s (نه روی هر تغییر — نظم ذخیره)
  useEffect(() => {
    const save = () => {
      const cache = client.getQueryCache()
      const entries = cache
        .getAll()
        .filter((q) => q.state.status === 'success')
        .slice(0, 50)
        .map((q) => ({ queryKey: q.queryKey, data: q.state.data, updatedAt: q.state.dataUpdatedAt }))
      void set(PERSIST_KEY, entries).catch(() => {})
    }
    const unsub = client.getQueryCache().subscribe(() => {
      window.clearTimeout((window as unknown as { __melkaQSave?: number }).__melkaQSave)
      ;(window as unknown as { __melkaQSave?: number }).__melkaQSave = window.setTimeout(save, 2_000)
    })
    return unsub
  }, [client])

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
