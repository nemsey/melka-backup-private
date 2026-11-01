// scripts/pn002/probe-enums.ts — استخراج نام‌های فارسی رسمی enum های ARM (statics/enums-persian)
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';
export {};

async function main() {
  const { applyPlatformEnvFallbacks } = await import('@/lib/platform-env');
  applyPlatformEnvFallbacks();
  const { armCall } = await import('@/lib/melk-api/client');
  const { getMelkApiConfig } = await import('@/lib/melk-api/config');
  const { MELK_ENDPOINTS } = await import('@/lib/melk-api/endpoints');
  const cfg = getMelkApiConfig();

  // عمومی — بدون توکن
  try {
    const res = await armCall<unknown>({ path: MELK_ENDPOINTS.armPublic.enums, baseUrl: cfg.armPublicApiBase, timeoutMs: 30_000, maxRetries: 1 });
    const data = res.data as Record<string, unknown>;
    console.log('=== statics/enums-persian — کلیدهای موجود ===');
    for (const [k, v] of Object.entries(data ?? {})) {
      console.log(`\n[${k}]`);
      console.log(JSON.stringify(v, null, 0).slice(0, 900));
    }
  } catch (e) {
    console.log('enums خطا:', (e as { code?: string; message?: string })?.code ?? (e as Error).message);
  }
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
