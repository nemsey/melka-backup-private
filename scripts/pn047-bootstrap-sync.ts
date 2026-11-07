/**
 * PN-047/گام اول-۳+۴ — Bootstrap دادهٔ ملکتون از شاهدهای کاوش
 * ---------------------------------------------------------------------------
 * داده‌های کاوشگر (download/pn047/) که همین امروز مستقیماً از CRM ملکتون
 * استخراج شده‌اند را با هستهٔ رسمی sync (syncMelketunRows — همان نگاشت v3)
 * در DB بارگذاری می‌کند. Worker ۶-ساعته از این پس با fetch زنده تازه نگه
 * می‌دارد (syncMelketun) — این اسکریپت فقط بارِ اول برای پرهیز از ۱۲ دقیقه
 * fetch تکراری است.
 *
 * اجرا: bun scripts/pn047-bootstrap-sync.ts
 */

import fs from "fs";
import path from "path";
import { syncMelketunRows } from "@/lib/integrations/melketun/sync";

const DIR = path.join(process.cwd(), "download/pn047");

function loadJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DIR, name), "utf-8")) as T;
}

async function main() {
  console.log("=== PN-047 Bootstrap — بارگذاری دادهٔ ملکتون از شاهدهای کاوش ===\n");

  const filings = loadJson<Record<string, unknown>[]>("public-filings.json");
  const potentials = loadJson<Record<string, unknown>[]>("public-potentials-complete.json");
  const specialists = loadJson<{ id: number; name: string }[]>("specialists.json");
  const myFilings = loadJson<{ code?: string; owner_name?: string; owner_phone?: string; price?: string; address?: string; longitude?: string; latitude?: string }[]>("my-filings-full.json");
  const users = loadJson<Record<string, { name: string | null; mobile: string | null }>>("resolved-users-complete.json");

  // قیف فروش — از شاهدهای funnel (کشف PN-047)
  let filingsFunnel: Record<string, unknown> | null = null;
  let potentialsFunnel: Record<string, unknown> | null = null;
  try {
    filingsFunnel = loadJson<{ funnelData?: Record<string, unknown> }>("funnel-_Melketunfilingplus_funnel.json")?.funnelData ?? null;
    potentialsFunnel = loadJson<{ funnelData?: Record<string, unknown> }>("funnel-_Potentials_funnel.json")?.funnelData ?? null;
  } catch { /* بدون قیف — ادامه */ }

  console.log(`filings: ${filings.length} · potentials: ${potentials.length} · specialists: ${specialists.length} · myFilings: ${myFilings.length} · users resolved: ${Object.keys(users).length}`);
  console.log(`funnel: filings=${filingsFunnel ? "✓" : "—"} · potentials=${potentialsFunnel ? "✓" : "—"}`);

  const result = await syncMelketunRows({
    filings: filings as never[],
    potentials: potentials as never[],
    specialists,
    myFilings,
    users,
    funnel: { filings: filingsFunnel, potentials: potentialsFunnel },
  });

  console.log("\n=== نتیجهٔ Bootstrap ===");
  console.log(JSON.stringify({
    ok: result.ok,
    fetched: result.fetched,
    upserted: result.upserted,
    skippedByCityFilter: result.skippedByCityFilter,
    skippedDuplicates: result.skippedDuplicates,
    skippedSamples: result.skippedSamples,
    branchesSeen: result.branchesSeen,
    errors: result.errors.slice(0, 10),
    errorCount: result.errors.length,
    durationMs: result.durationMs,
  }, null, 2));

  if (result.errors.length > 0) process.exit(2);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
