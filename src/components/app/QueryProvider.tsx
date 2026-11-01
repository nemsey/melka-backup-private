'use client'

/**
 * QueryProvider — PN-051 · فرمان ۷ — TanStack Query با Stale-While-Revalidate
 * ---------------------------------------------------------------------------
 * یک QueryClient برای زیردرخت داشبورد:
 *   · staleTime 60s → در بازهٔ تازگی از کش فوری جواب (revalidate پس‌زمینه) — SWR
 *   · refetchOnWindowFocus → بازگشت به تب = تازگی بی‌درنگ
 *   · پایدارسازی به IndexedDB (idb-keyval) — دسترسی آفلاین + boot سریع
 * ⊙ درس زندهٔ بیلد ۲۰۲۶-۱۰-۲۸ ۲۲:۴۰ (Error: indexedDB is not defined در
 *   prerender /dashboard/melketun): هیدرات IndexedDB هرگز در مسیر رندر نیست —
 *   فقط در useEffect (client-only). سازندهٔ QueryClient صافِ نابی است.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { get, set } from 'idb-keyval'
import { useEffect, useState, type ReactNode } from 'react'

const PERSIST_KEY = 'melka-query-cache-v1'

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    // ⊙ صافِ ناب — صفر دسترسی به browser API (SSR/prerender امن)
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000, // SWR: در بازهٔ تازگی → کش فوری + revalidate پس‌زمینه
          gcTime: 30 * 60_000,
          refetchOnWindowFocus: true,
          retry: 1,
        },
      },
    })
  })

  // هیدرات آفلاین — فقط سمت کلاینت (useEffect هرگز در SSR اجرا نمی‌شود)
  useEffect(() => {
    let cancelled = false
    void get(PERSIST_KEY)
      .then((cached) => {
        if (cancelled || !cached || !Array.isArray(cached)) return
        for (const entry of cached) {
          try {
            client.setQueryData(entry.queryKey, entry.data, { updatedAt: entry.updatedAt })
          } catch {
            /* ردیف معیوب کش — نادیده */
          }
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [client])

  // پایدارسازی — debounce ۲s (client-only)
  useEffect(() => {
    let saveTimer: ReturnType<typeof setTimeout> | undefined
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
      clearTimeout(saveTimer)
      saveTimer = setTimeout(save, 2_000)
    })
    return () => {
      clearTimeout(saveTimer)
      unsub()
    }
  }, [client])

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
