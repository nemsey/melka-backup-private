// scripts/pn002/probe-arm-structure.ts — تحلیل ساختاری کامل ردیف‌های ARM
// پرونده PN-002 گام‌های ۱-۴: «ساختار ثبت انواع آگهی/درخواست/معامله/کارشناس را فراکامل بررسی کن»
// خروجی: نقشهٔ فیلدهای موجود + نرخ پرشدگی هر فیلد در صفحهٔ نمونه (صفر PII — فقط نام فیلد/نوع/درصد)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';
export {};

async function main() {
  // ۰) بارگذاری fallback پلتفرم (عین بوت سرور — MELK_TOKEN_KEY از env.platform.json)
  const { applyPlatformEnvFallbacks } = await import('@/lib/platform-env');
  const platformEnv = applyPlatformEnvFallbacks();
  console.log('platform-env applied:', platformEnv.applied.length ? platformEnv.applied.join(',') : '(هیچ — همه از env واقعی)');

  // ۱) توکن خزانه (اتصال ماندگار مالک — بدون پیامک جدید)
  const { getIntegrationRepository } = await import('@/core/repositories');
  const { decryptSecret } = await import('@/lib/auth/crypto');
  const repo = getIntegrationRepository();
  const conn = await repo.getArmConnection('410031320');
  if (!conn?.tokenEnc) { console.log('NO VAULT TOKEN'); process.exit(1); }
  const token = decryptSecret(conn.tokenEnc);
  if (!token) { console.log('DECRYPT FAILED — key mismatch'); process.exit(1); }
  console.log('توکن خزانه: زنده ✓ (lastRefreshed=' + conn.lastRefreshedAt?.toISOString?.() + ')');

  const { armCall } = await import('@/lib/melk-api/client');
  const { getMelkApiConfig } = await import('@/lib/melk-api/config');
  const cfg = getMelkApiConfig();
  const { MELK_ENDPOINTS } = await import('@/lib/melk-api/endpoints');

  async function probePage(name: string, path: string, query: Record<string, unknown>) {
    try {
      const res = await armCall<unknown>({ path: path as string, baseUrl: cfg.armApiBase, token: token as string, query: query as Record<string, string | number | null | undefined>, timeoutMs: 45_000, maxRetries: 1 });
      const payload = res.data as Record<string, unknown> | null;
      const list = (payload?.list ?? payload?.data ?? payload?.docs ?? payload?.rows) as unknown;
      const total = payload?.count ?? payload?.total ?? '?';
      console.log(`\n===== ${name} — ${Array.isArray(list) ? list.length : 0} ردیف (total=${total}) =====`);
      if (!Array.isArray(list) || list.length === 0) { console.log('  (بدون داده)'); return; }
      const stats = new Map<string, { type: string; filled: number; nested?: string[]; arrItem?: string }>();
      for (const row of list as Record<string, unknown>[]) {
        for (const [k, v] of Object.entries(row)) {
          const entry = stats.get(k) ?? { type: typeof v, filled: 0 };
          const isFilled = v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
          if (isFilled) entry.filled += 1;
          if (v && typeof v === 'object' && !Array.isArray(v)) entry.nested = Object.keys(v as object).slice(0, 10);
          if (Array.isArray(v) && v.length > 0) {
            const first = v[0];
            entry.arrItem = first && typeof first === 'object' ? `{${Object.keys(first as object).slice(0, 10).join(',')}}` : typeof first;
          }
          stats.set(k, entry);
        }
      }
      const sorted = [...stats.entries()].sort((a, b) => b[1].filled - a[1].filled);
      const n = list.length;
      for (const [k, s] of sorted) {
        const pct = Math.round((s.filled / n) * 100);
        const extra = s.nested ? ` {${s.nested.join(',')}}` : s.arrItem ? ` [${s.arrItem}]` : '';
        console.log(`  ${k}${extra}: ${s.type} — ${pct}%`);
      }
    } catch (e) {
      console.log(`\n===== ${name} — خطا: ${(e as { code?: string; message?: string })?.code ?? (e as Error).message} =====`);
    }
  }

  // ۲) چهار موجودیت اصلی — هر کدام یک صفحهٔ نمونه
  await probePage('۱) properties/list (آگهی)', MELK_ENDPOINTS.arm.propertiesList, { page: 1, limit: 20 });
  await probePage('۲) requests/list (درخواست)', MELK_ENDPOINTS.arm.requestsList, { page: 1, limit: 20 });
  await probePage('۳) realtor-reports/traded-count (معامله)', MELK_ENDPOINTS.arm.tradedCount, {
    page: 1, limit: 20,
    startDate: '2018-01-01T00:00:00.000Z', endDate: new Date().toISOString(),
  });
  await probePage('۴) realtors/list (کارشناس)', MELK_ENDPOINTS.arm.realtorsList, { page: 1, limit: 20 });

  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
