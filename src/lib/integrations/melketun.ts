// Adapter: Melketun integration (CRM + Public)
// ---------------------------------------------------------------------------
// PN-043/فاز ۳ (شورا-ن۰۸۷) — اتصال یکپارچهٔ ملکتون.
// PN-044/فاز ۲-۳ (شورا-ن۰۸۸) — لاگین واقعی کشف و پیاده شد:
//   CRM = Laravel + Inertia · POST /login-store (فیلدهای دقیق Username/Password)
//   + هدر X-XSRF-TOKEN · راستی‌آزمایی: GET /dashboard → 200 (لاگ: pn044/recon.log)
// PN-046/گام صفر (دستور مالک ۱۴۰۵/۰۷/۲۸) — بازنویسی تنظیمات اتصال ملکتون
//   دقیقاً همانند الگوی «اتصال به ملک تبریز»:
//   · saveCredentials — فرم یوزر/پسورد مالک (بجای کدپرسنلی + پیامک تبریز)
//   · وضعیت اتصال پایدار (state file) — سوخت نشانگر نوار وضعیت + تنظیمات
// Doctrine: no LLM, no cost, no auto_execute.
// Secrets live in the Persistent Zone file upload/.runtime/melketun-secrets.json
// (chmod 600 — never in code, never in git, never printed to logs — قانون ۱۲/۱۸).

import fs from 'fs'
import path from 'path'

const RUNTIME_DIR = path.join(process.cwd(), 'upload/.runtime')
const SECRET_FILE = path.join(RUNTIME_DIR, 'melketun-secrets.json')
/** PN-046/گام صفر — وضعیت آخرین ورود واقعی (سوخت نوار وضعیت + بخش تنظیمات) */
const STATE_FILE = path.join(RUNTIME_DIR, 'melketun-connection-state.json')

interface MelketunSecrets {
  crm: { base_url: string; username: string; password: string }
  public: { base_url: string }
}

export interface MelketunConnectionState {
  ok: boolean
  at: string
  note: string
  username: string
}

let _cached: MelketunSecrets | null = null
function loadSecrets(): MelketunSecrets {
  if (_cached) return _cached
  const raw = fs.readFileSync(SECRET_FILE, 'utf8')
  _cached = JSON.parse(raw) as MelketunSecrets
  return _cached
}

/** رازها بعد از تغییر اعتبارنامه از نو خوانده می‌شوند (هر دو مصرف‌کننده هم‌راستا) */
export function invalidateMelketunSecretsCache(): void {
  _cached = null
}

/**
 * PN-046/گام صفر — ذخیرهٔ اعتبارنامهٔ حساب شخصی CRM ملکتون (یوزر + پسورد).
 * نوشتن اتمیک + chmod 600 — فقط در Persistent Zone (هرگز در کد/گیت/لاگ).
 */
export function saveMelketunCredentials(username: string, password: string): void {
  const trimmedUser = username.trim()
  if (!trimmedUser || !password.trim()) {
    throw new Error('نام کاربری و رمز عبور هر دو لازم است (قانون ۱۲ — خالی ممنوع).')
  }
  const current = loadSecrets()
  const next: MelketunSecrets = {
    crm: { ...current.crm, username: trimmedUser, password: password.trim() },
    public: { ...current.public },
  }
  fs.mkdirSync(RUNTIME_DIR, { recursive: true })
  const tmp = `${SECRET_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, SECRET_FILE)
  fs.chmodSync(SECRET_FILE, 0o600)
  _cached = null // کش باطل — خواندن بعدی از فایل تازه
}

/** PN-046/گام صفر — ثبت وضعیت آخرین ورود واقعی (پایدار در برابر ری‌استارت) */
export function recordMelketunConnection(ok: boolean, note: string): void {
  try {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true })
    const state: MelketunConnectionState = {
      ok,
      at: new Date().toISOString(),
      note,
      username: (() => { try { return loadSecrets().crm.username } catch { return '' } })(),
    }
    const tmp = `${STATE_FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 })
    fs.renameSync(tmp, STATE_FILE)
    fs.chmodSync(STATE_FILE, 0o600)
  } catch {
    // ثبت وضعیت نباید جریان اصلی را بشکند — نشانگر «آزمایش‌نشده» صادقانه می‌ماند
  }
}

/** PN-046/گام صفر — خواندن وضعیت اتصال (null = هنوز هیچ ورودی آزمایش نشده) */
export function getMelketunConnection(): MelketunConnectionState | null {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8')
    return JSON.parse(raw) as MelketunConnectionState
  } catch {
    return null
  }
}

/**
 * Metadata for the settings UI — NEVER includes the password itself.
 * (رمز هرگز برنمی‌گردد — فقط نمایش ماسک‌شده)
 */
export function melketunMeta(): {
  crm: { base_url: string; username: string; passwordMasked: string }
  public: { base_url: string }
  connectionMode: 'direct' | 'relay' | 'blocked'
  /** PN-046/گام صفر — وضعیت آخرین ورود واقعی CRM (سوخت نشانگر) */
  connection: MelketunConnectionState | null
} {
  const s = loadSecrets()
  // Verdict فاز ۰: اتصال مستقیم برقرار است (رله لازم نیست)
  return {
    crm: { base_url: s.crm.base_url, username: s.crm.username, passwordMasked: '••••••••' },
    public: { base_url: s.public.base_url },
    connectionMode: 'direct',
    connection: getMelketunConnection(),
  }
}

export const melketun = {
  async testPublicConnection(): Promise<{ ok: boolean; status: number; latencyMs: number }> {
    const s = loadSecrets()
    const t0 = Date.now()
    try {
      const res = await fetch(s.public.base_url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) })
      return { ok: res.ok, status: res.status, latencyMs: Date.now() - t0 }
    } catch {
      return { ok: false, status: 0, latencyMs: Date.now() - t0 }
    }
  },

  async testCrmLogin(): Promise<{ ok: boolean; status: number; note: string }> {
    const s = loadSecrets()
    // PN-044/فاز ۰ کشف: POST /login-store (فیلدهای Username/Password + X-XSRF-TOKEN).
    // لاگین واقعی + راستی‌آزمایی GET /dashboard → 200 (نه صرفاً reachability).
    // رمز هرگز در پاسخ/لاگ برنمی‌گردد (قانون ۱۲/۱۸).
    // PN-046/گام صفر: نتیجه در state file ثبت می‌شود (نوار وضعیت + تنظیمات).
    let result: { ok: boolean; status: number; note: string }
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
      if (!loginPage.ok) {
        result = { ok: false, status: loginPage.status, note: `GET /login → ${loginPage.status}` }
        recordMelketunConnection(false, result.note)
        return result
      }

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
        result = { ok: false, status: loginRes.status, note: `login-store → ${loginRes.status} (bad credentials or CSRF)` }
        recordMelketunConnection(false, result.note)
        return result
      }

      const verify = await fetch(`${base}/dashboard`, {
        headers: { Cookie: cookieHeader() },
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
      })
      const ok = verify.status === 200
      result = {
        ok,
        status: verify.status,
        note: ok
          ? 'ورود واقعی موفق (POST /login-store · dashboard 200) — session-based'
          : `login verify failed (dashboard → ${verify.status})`,
      }
    } catch (e) {
      result = { ok: false, status: 0, note: e instanceof Error ? e.message : 'unreachable' }
    }
    recordMelketunConnection(result.ok, result.note)
    return result
  },
}
