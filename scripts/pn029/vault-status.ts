/**
 * PN-029 · آزمون ۶ — وضعیت خزانهٔ توکن‌های ARM (Vault)
 * فقط خواندن: شمار رکوردها + قابل‌رمزگشایی بودن هر توکن + آخرین مهلت تازه‌سازی.
 * خروجی: یک خط JSON در stdout
 */

import { applyPlatformEnvFallbacks } from "@/lib/platform-env";
applyPlatformEnvFallbacks();

import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/auth/crypto";

async function main(): Promise<void> {
  const rows = await db.armConnection.findMany({
    select: { ownerKey: true, personnelCode: true, tokenEnc: true, refreshTokenEnc: true, status: true, lastRefreshedAt: true, lastError: true },
  });
  let decryptable = 0;
  let failed = 0;
  const details: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    const ok = Boolean(decryptSecret(r.tokenEnc));
    if (ok) decryptable += 1;
    else failed += 1;
    details.push({
      ownerKey: r.ownerKey,
      personnelCode: r.personnelCode,
      tokenDecryptable: ok,
      refreshDecryptable: r.refreshTokenEnc ? Boolean(decryptSecret(r.refreshTokenEnc)) : null,
      status: r.status,
      lastRefreshedAt: r.lastRefreshedAt?.toISOString() ?? null,
      ageHours: r.lastRefreshedAt ? Math.round((Date.now() - r.lastRefreshedAt.getTime()) / 3_600_000) : null,
    });
  }
  const result = {
    ok: true,
    vaultRecords: rows.length,
    tokenDecryptable: decryptable,
    tokenUndecryptable: failed,
    note:
      rows.length === 0
        ? "خزانه خالی است — هیچ توکن ARM ذخیره نشده (پس از ریست‌ها پاک شده یا هرگز ذخیره نشده)"
        : "توکنهای موجود بررسی شدند — عمر بیش از ۴۸ ساعت یعنی قطعاً منقضی (قرارداد PN-008)",
    details,
  };
  console.log(JSON.stringify(result));
  await db.$disconnect();
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: String(e).slice(0, 300) }));
  process.exit(1);
});
