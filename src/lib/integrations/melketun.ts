// Adapter: Melketun integration (CRM + Public)
// ---------------------------------------------------------------------------
// PN-043/فاز ۳ (شورا-ن۰۸۷) — اتصال یکپارچهٔ ملکتون.
// PN-044/فاز ۲-۳ (شورا-ن۰۸۸) — لاگین واقعی کشف و پیاده شد:
//   CRM = Laravel + Inertia · POST /login-store (فیلدهای دقیق Username/Password)
//   + هدر X-XSRF-TOKEN · راستی‌آزمایی: GET /dashboard → 200 (لاگ: pn044/recon.log)
// Doctrine: no LLM, no cost, no auto_execute.
// Secrets live in the Persistent Zone file upload/.runtime/melketun-secrets.json
// (chmod 600 — never in code, never in git, never printed to logs).

import fs from 'fs'
import path from 'path'

const SECRET_FILE = path.join(process.cwd(), 'upload/.runtime/melketun-secrets.json')

interface MelketunSecrets {
  crm: { base_url: string; username: string; password: string }
  public: { base_url: string }
}

let _cached: MelketunSecrets | null = null
function loadSecrets(): MelketunSecrets {
  if (_cached) return _cached
  const raw = fs.readFileSync(SECRET_FILE, 'utf8')
  _cached = JSON.parse(raw) as MelketunSecrets
  return _cached
}

/**
 * Metadata for the settings UI — NEVER includes the password itself.
 * (رمز هرگز برنمی‌گردد — فقط نمایش ماسک‌شده)
 */
export function melketunMeta(): {
  crm: { base_url: string; username: string; passwordMasked: string }
  public: { base_url: string }
  connectionMode: 'direct' | 'relay' | 'blocked'
} {
  const s = loadSecrets()
  // Verdict فاز ۰: اتصال مستقیم برقرار است (رله لازم نیست)
  return {
    crm: { base_url: s.crm.base_url, username: s.crm.username, passwordMasked: '••••••••' },
    public: { base_url: s.public.base_url },
    connectionMode: 'direct',
  }
}

export const melketun = {
  async testPublicConnection(): Promise<{ ok: boolean; status: number; latencyMs: number }> {
    const s = loadSecrets()
    const t0 = Date.now()
    try {
      const res = await fetch(s.public.base_url, { method: 'HEAD' })
      return { ok: res.ok, status: res.status, latencyMs: Date.now() - t0 }
    } catch (e) {
      return { ok: false, status: 0, latencyMs: Date.now() - t0 }
    }
  },

  async testCrmLogin(): Promise<{ ok: boolean; status: number; note: string }> {
    const s = loadSecrets()
    // PN-044/فاز ۰ کشف: POST /login-store (فیلدهای Username/Password + X-XSRF-TOKEN).
    // لاگین واقعی + راستی‌آزمایی GET /dashboard → 200 (نه صرفاً reachability).
    // رمز هرگز در پاسخ/لاگ برنمی‌گردد (قانون ۱۲/۱۸).
    try {
      const base = s.crm.base_url.replace(/\/$/, '')
      const cookies = new Map<string, string>()
      const absorb = (res: Response) => {
        const list: string[] =
          typeof res.headers.getSetCookie === 'function'
            ? res.headers.getSetCookie()
            : (res.headers.get('set-cookie') ?? '').split(/,(?=[^;]+=)/).filter(Boolean)
        for (const line of list) {
          const [pair] = line.split(';')
          const eq = pair.indexOf('=')
          if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
        }
      }
      const cookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
      const decodedXsrf = () => {
        const v = cookies.get('XSRF-TOKEN') ?? ''
        try { return decodeURIComponent(v) } catch { return v }
      }

      const loginPage = await fetch(`${base}/login`, { signal: AbortSignal.timeout(20_000) })
      absorb(loginPage)
      if (!loginPage.ok) return { ok: false, status: loginPage.status, note: `GET /login → ${loginPage.status}` }

      const loginRes = await fetch(`${base}/login-store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: cookieHeader(),
          'X-XSRF-TOKEN': decodedXsrf(),
        },
        body: new URLSearchParams({ Username: s.crm.username, Password: s.crm.password }),
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      })
      absorb(loginRes)
      if (loginRes.status !== 302 && loginRes.status !== 303) {
        return { ok: false, status: loginRes.status, note: `login-store → ${loginRes.status} (bad credentials or CSRF)` }
      }

      const verify = await fetch(`${base}/dashboard`, {
        headers: { Cookie: cookieHeader() },
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      })
      const ok = verify.status === 200
      return {
        ok,
        status: verify.status,
        note: ok
          ? 'real login OK (POST /login-store · dashboard 200) — session-based'
          : `login verify failed (dashboard → ${verify.status})`,
      }
    } catch (e) {
      return { ok: false, status: 0, note: e instanceof Error ? e.message : 'unreachable' }
    }
  },
}
