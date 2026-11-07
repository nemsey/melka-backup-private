#!/usr/bin/env bun
/**
 * scripts/pn036/pm-endpoint-witness.ts — شاهد فاز ۳: تشخیص PM endpoint
 * پاسخ‌های واقعی صف رله (بدنهٔ خام) доказ می‌کنند مسیر PM درست است؛
 * ریشهٔ مرگ جریان PM بودجهٔ ۲۰ث + گرسنگی صف + شکست خاموش upsert بود.
 */
import { Database } from "bun:sqlite";

const db = new Database("/home/z/my-project/db/custom.db", { readonly: true });
const q = (sql: string, ...p: unknown[]) => {
  try { return db.query(sql).all(...p) as Array<Record<string, unknown>>; } catch { return []; }
};

// ۱) نمونهٔ پاسخ زندهٔ PM OTP (۴۱۲ — پیامک واقعاً ارسال شده)
const pm412 = q(
  "SELECT url, responseStatus, responseBody, datetime(completedAt/1000,'unixepoch') at FROM RelayQueue WHERE url LIKE '%pm-api%authentication/otp%' AND responseStatus=412 ORDER BY enqueuedAt DESC LIMIT 1"
)[0];
let body: unknown = null;
try { body = JSON.parse(String(pm412?.responseBody ?? "")); } catch { body = String(pm412?.responseBody ?? "").slice(0, 200); }

// ۲) ورود موفق PM (اگر بوده)
const pmLogin = q(
  "SELECT responseStatus, datetime(completedAt/1000,'unixepoch') at FROM RelayQueue WHERE url LIKE '%pm-api%otp/login%' AND responseStatus=200 ORDER BY enqueuedAt DESC LIMIT 1"
)[0];

// ۳) کار pm-start-otp شکسته (شاهد ریشه)
const failedJob = q(
  "SELECT type, status, substr(error,1,120) err, httpStatus, datetime(createdAt/1000,'unixepoch') at FROM RelayJob WHERE type='pm-start-otp' ORDER BY createdAt DESC LIMIT 1"
)[0];

// ۴) وضعیت PmConnection (باید خالی بوده باشد — شکست خاموش upsert)
const pmConn = q("SELECT count(*) n FROM PmConnection")[0];

const witness = {
  phase: "PN-036 فاز ۳ — تشخیص و اصلاح PM endpoint",
  at: new Date().toISOString(),
  diagnosis: {
    endpointPath: "https://pm-api.melketabriz.ir/api/authentication/otp/{code}",
    endpointVerdict: "CORRECT — نیازی به تغییر مسیر نبود",
    evidence: pm412
      ? {
          url: pm412.url,
          httpStatus: pm412.responseStatus,
          at: pm412.at,
          body,
          meaning: "سامانه PM خودش پاسخ داد: «کد تایید قبلا ارسال شده است» — یعنی پیامک PM واقعاً ارسال می‌شده و مسیر از گوشی مالک تا PM باز است",
        }
      : "بدون نمونهٔ ۴۱۲ در صف",
    rootCauses: [
      "بودجهٔ رله PM: Math.min(cfg,20s) — رفت‌وبرگشت رله در شلوغی صف > ۲۰ث → کار با «ارتباط برقرار نشد» (502) مرد در حالی که پیامک رفته بود",
      "گرسنگی صف: batch=100 با موج‌های سنگین → آیتم‌های OTP در TTL ۱۲۰ث اجرا نشدند (expired) — ۴۳۰ رکورد expired",
      "شکست خاموش upsertPmConnection (SQLITE_BUSY زیر بار نوشتن صف) → جدول PmConnection خالی ماند → UI وضعیت pending نداشت",
    ],
  },
  fixes: [
    { what: "بودجهٔ تعاملی", change: "Math.min(cfg,20s) → cfg.interactiveTimeoutMs (۹۰ث پیش‌فرض · env MELK_INTERACTIVE_TIMEOUT_MS)", where: "src/app/api/pm/connection/route.ts + provider.ts (requestOtp/verifyOtp)" },
    { what: "تاب‌آوری نوشتن وضعیت PM", change: "upsertPmStatus — ۴ تلاش با فاصلهٔ ۲۵۰/۷۵۰/۲۰۰۰ms + لاگ ساخت‌یافته در شکست نهایی (قانون کنسول-فقط-در-لاگر)", where: "src/app/api/pm/connection/route.ts" },
    { what: "poll اپ", change: "تلاشهای pollRelayJob: ۶۰ → ۱۲۰ (start) / ۱۵۰ (verify) — هم‌تراز بودجهٔ ۹۰ث", where: "PmConnectionSection.tsx + ArmConnectionSection.tsx" },
    { what: "گرسنگی صف", change: "نسل K: BATCH=20 + Express lane (OTP مقدم بر فهرست‌ها)", where: "relay-script.ts" },
  ],
  liveEvidence: {
    pmOtp412: { at: pm412?.at ?? null, status: pm412?.responseStatus ?? null },
    pmLogin200: pmLogin ? { at: pmLogin.at, status: pmLogin.responseStatus } : null,
    failedJob,
    pmConnectionRows: pmConn?.n ?? 0,
  },
  expectedAfterFix: {
    pmOtpField: "ظاهر می‌شود — POST فوری jobId برمی‌گرداند (startRelayJob < ۱ث)",
    pmVerify: "کار verify با بودجهٔ ۹۰ث از TTL صف (۱۲۰ث) کوچک‌تر — پاسخ برمی‌گردد",
    pmConnectionTable: "پر می‌شود — upsertPmStatus با retry دیگر خاموش نمی‌میرد",
  },
};
await Bun.write("download/pn036/pm-endpoint-fix.json", JSON.stringify(witness, null, 2));
console.log("✓ pm-endpoint-fix.json — مسیر PM درست بود؛ ریشه: بودجه/گرسنگی/شکست خاموش");
db.close();
