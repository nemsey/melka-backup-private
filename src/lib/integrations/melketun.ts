// Adapter: Melketun integration (CRM + Public)
// ---------------------------------------------------------------------------
// PN-043/فاز ۳ (شورا-ن۰۸۷) — اتصال یکپارچهٔ ملکتون.
// Doctrine: no LLM, no cost, no auto_execute.
// Secrets live in the Persistent Zone file upload/.runtime/melketun-secrets.json
// (chmod 600 — never in code, never in git, never printed to logs).
// Recon (PN-043/فاز ۰): melketun.com → HTTP 200 · melketun.app → 302 → /login (200)
// · real login API endpoint NOT discovered (/api/auth/login → 404) → CRM check is
// reachability-only until a future recon discovers the exact endpoint.

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
    // [GLM/فاز ۰ recon]: endpoint دقیق login API کشف نشد (صفحهٔ /login → 200 ولی
    // /api/auth/login → 404). در نبود کشف: فقط reachability چک می‌شود (نه login واقعی).
    try {
      const res = await fetch(`${s.crm.base_url}/`, { method: 'HEAD' })
      return {
        ok: res.ok,
        status: res.status,
        note: 'reachability only (login endpoint pending recon)'
      }
    } catch (e) {
      return { ok: false, status: 0, note: 'unreachable' }
    }
  },
}
