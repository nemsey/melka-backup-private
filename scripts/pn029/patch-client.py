#!/usr/bin/env python3
# PN-029 — وصلهٔ client.ts (گارد آفلاین + فیوز) با لنگرهای ASCII مطمئن
import io, sys

P = "/home/z/my-project/src/lib/melk-api/client.ts"
src = io.open(P, encoding="utf-8").read()
orig = src

def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        print(f"ANCHOR-MISMATCH ({n}): {old[:70]!r}")
        sys.exit(1)
    src = src.replace(old, new)

# ۱) import تازه پس از import types
rep('import { MelkApiError, type NestEnvelope } from "./types";',
    'import { MelkApiError, type NestEnvelope } from "./types";\n'
    'import { isArmOfflineMode, offlineModeMessage, offlineBypassAllowed } from "./offline-mode";\n'
    'import {\n'
    '  breakerKeyFromBaseUrl,\n'
    '  checkCircuit,\n'
    '  circuitLockedError,\n'
    '  isBreakerFailure,\n'
    '  recordBreakerFailure,\n'
    '  recordBreakerSuccess,\n'
    '} from "./circuit-breaker";')

# ۲) فیلد bypassOffline در HttpRequestOptions
rep('  query?: Record<string, string | number | undefined | null>;\n}',
    '  query?: Record<string, string | number | undefined | null>;\n'
    '  /** PN-029 — فقط برای فراخوانی صریح مالک (تک‌تلاش OTP)؛ هیچ مسیر خودکاری عبور نمی‌کند */\n'
    '  bypassOffline?: boolean;\n}')

# ۳) گاردهای ورودی armCall
rep('export async function armCall<T = unknown>(opts: HttpRequestOptions): Promise<ArmCallResult<T>> {\n  const base = opts.baseUrl.replace(/\\/$/, "");',
    'export async function armCall<T = unknown>(opts: HttpRequestOptions): Promise<ArmCallResult<T>> {\n'
    '  // ---- گارد ۱: حالت آفلاین (صفر تلاش خودکار — PN-029 مرحلهٔ ۲) ----\n'
    '  if (isArmOfflineMode() && !offlineBypassAllowed(opts.bypassOffline)) {\n'
    '    throw new MelkApiError("ARM_OFFLINE", offlineModeMessage(), 503, false);\n'
    '  }\n'
    '  // ---- گارد ۲: فیوز قطع‌کننده (قانون Retry هوشمند — PN-029 مرحلهٔ ۶) ----\n'
    '  const target = breakerKeyFromBaseUrl(opts.baseUrl);\n'
    '  const gate = await checkCircuit(target);\n'
    '  if (!gate.allowed) throw circuitLockedError(gate);\n'
    '\n'
    '  const base = opts.baseUrl.replace(/\\/$/, "");')

# ۴) ثبت موفقیت پیش از return نتیجه
rep('      return { data: (envelope?.data ?? (envelope as unknown as T)) as T, message: envelope?.message };',
    '      // PN-029 — موفقیت واقعی: بازنشانی فیوز میزبان (شمارش پیاپی صفر می‌شود)\n'
    '      await recordBreakerSuccess(target);\n'
    '      return { data: (envelope?.data ?? (envelope as unknown as T)) as T, message: envelope?.message };')

# ۵) ریزرفایند + ثبت شکست پیش از throw پایانی (رفع return Promise.reject به throw یکسان)
rep('    if (refined.code === "DB_DOWN") return Promise.reject(refined);\n  }\n  throw lastError ?? new MelkApiError("UNKNOWN",',
    '    if (refined.code === "DB_DOWN") lastError = refined;\n'
    '  }\n'
    '  // PN-029 — شکست سمت سرور/شبکه: ثبت در فیوز (backoff ۶/۱۲/۲۴س · ۳ پیاپی = قفل ۲۴س)\n'
    '  if (lastError && isBreakerFailure(lastError)) await recordBreakerFailure(target);\n'
    '  throw lastError ?? new MelkApiError("UNKNOWN",')

# ۶) بازنویسی کامل probeGet (از sig تا انتهای تابع — لنگرهای ASCII)
old_probe = '''export async function probeGet(baseUrl: string, path: string, timeoutMs = 8000): Promise<{ ok: boolean; httpStatus: number; latencyMs: number; bodyText: string }> {
  const url = `${baseUrl.replace(/\\/$/, "")}/${path.replace(/^\\//, "")}`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const bodyText = await res.text().catch(() => "");
    return { ok: res.ok || res.status < 500 || bodyText.length > 0, httpStatus: res.status, latencyMs: Date.now() - started, bodyText };
  } finally {
    clearTimeout(timer);
  }
}'''
new_probe = '''export interface ProbeResult {
  ok: boolean;
  httpStatus: number;
  latencyMs: number;
  bodyText: string;
  /** PN-029 — پروب به‌خاطر حالت آفلاین انجام نشد */
  offlineMode?: boolean;
  /** PN-029 — پروب به‌خاطر فیوز بسته انجام نشد (پیام دقیق در circuitDetail) */
  circuitLocked?: boolean;
  circuitDetail?: string;
}

export async function probeGet(
  baseUrl: string,
  path: string,
  timeoutMs = 8000,
  opts?: { bypassOffline?: boolean }
): Promise<ProbeResult> {
  // گارد آفلاین — پروب همیشه «تلاش» است؛ فقط فراخوانی صریح live (دکمهٔ تست مالک) عبور می‌کند
  if (isArmOfflineMode() && !opts?.bypassOffline) {
    return { ok: false, httpStatus: 0, latencyMs: -1, bodyText: "", offlineMode: true };
  }
  const target = breakerKeyFromBaseUrl(baseUrl);
  const gate = await checkCircuit(target);
  if (!gate.allowed) {
    return {
      ok: false,
      httpStatus: 0,
      latencyMs: -1,
      bodyText: "",
      circuitLocked: true,
      circuitDetail: circuitLockedError(gate).message,
    };
  }
  const url = `${baseUrl.replace(/\\/$/, "")}/${path.replace(/^\\//, "")}`;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const bodyText = await res.text().catch(() => "");
    // PN-029 — ۵xx = شکست فیوز (سرویس پشتیبان پایین است؛ کوبیدن درِ او فایده ندارد)
    if (res.status >= 500) await recordBreakerFailure(target);
    else await recordBreakerSuccess(target);
    return { ok: res.ok || res.status < 500 || bodyText.length > 0, httpStatus: res.status, latencyMs: Date.now() - started, bodyText };
  } catch {
    // خطای شبکه/TLS — شکست فیوز
    await recordBreakerFailure(target);
    return { ok: false, httpStatus: 0, latencyMs: Date.now() - started, bodyText: "" };
  } finally {
    clearTimeout(timer);
  }
}'''
rep(old_probe, new_probe)

io.open(P, "w", encoding="utf-8").write(src)
print("client.ts patched OK —", len(orig), "->", len(src), "chars")
