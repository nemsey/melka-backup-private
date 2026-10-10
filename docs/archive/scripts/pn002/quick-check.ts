// scripts/pn002/quick-check.ts — بررسی سریع وضعیت توکن و پاسخ ARM
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db';
export {};

async function main() {
  const { applyPlatformEnvFallbacks } = await import('@/lib/platform-env');
  applyPlatformEnvFallbacks();
  const { getIntegrationRepository } = await import('@/core/repositories');
  const { decryptSecret } = await import('@/lib/auth/crypto');
  const repo = getIntegrationRepository();
  const conn = await repo.getArmConnection('410031320');
  const token = conn?.tokenEnc ? decryptSecret(conn.tokenEnc) : null;
  if (!token) { console.log('NO VAULT TOKEN'); process.exit(1); }

  const { armCall } = await import('@/lib/melk-api/client');
  const { getMelkApiConfig } = await import('@/lib/melk-api/config');
  const cfg = getMelkApiConfig();

  const t0 = Date.now();
  try {
    const res = await armCall<unknown>({ path: 'realtors/list', baseUrl: cfg.armApiBase, token, query: { page: 1, limit: 5 }, timeoutMs: 30_000, maxRetries: 1 });
    const payload = res.data as Record<string, unknown> | null;
    const list = payload?.list;
    console.log(`realtors/list: OK ${Date.now() - t0}ms rows=${Array.isArray(list) ? list.length : '?'} total=${payload?.count ?? '?'}`);
  } catch (e) {
    const err = e as { code?: string; message?: string; httpStatus?: number };
    console.log(`realtors/list FAIL ${Date.now() - t0}ms: code=${err.code} status=${err.httpStatus} msg=${(err.message ?? '').slice(0, 150)}`);
  }

  const t1 = Date.now();
  try {
    const res = await armCall<unknown>({ path: 'properties/list', baseUrl: cfg.armApiBase, token, query: { page: 1, limit: 50 }, timeoutMs: 60_000, maxRetries: 0 });
    const payload = res.data as Record<string, unknown> | null;
    const list = payload?.list;
    console.log(`properties/list: OK ${Date.now() - t1}ms rows=${Array.isArray(list) ? list.length : '?'} total=${payload?.count ?? '?'}`);
  } catch (e) {
    const err = e as { code?: string; message?: string; httpStatus?: number };
    console.log(`properties/list FAIL ${Date.now() - t1}ms: code=${err.code} status=${err.httpStatus} msg=${(err.message ?? '').slice(0, 150)}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error('FATAL:', e?.message ?? e); process.exit(1); });
