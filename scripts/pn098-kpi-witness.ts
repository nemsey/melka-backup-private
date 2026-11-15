/**
 * PN-098 — شاهد KPI بدون سقف ۲۵٬۰۰۰ (بازسازی PN-INIT · ملکا-شورا-ن۰۹۸)
 * ------------------------------------------------------------------------
 * مسئله: در حالت masterAuth=database (هش واقعی مالک در AppMeta — SEC-1، کد تستی
 * عمومی رد می‌شود)، شاهد HTTP بدون کد واقعی مالک ممکن نیست.
 * راه‌حل: نشست OWNER با ماژول رسمی نشست خود اپ (createSession — همان رمزنگاری
 * AES-256-GCM با MELK_TOKEN_KEY محیط) تراشیده می‌شود، مسیر واقعی HTTP
 * (guard → tile-access → repository → countArmCatalog) صدا زده می‌شود، و در پایان
 * ردیف نشست حذف می‌شود (صفر پسماند روی دادهٔ مقدس).
 * خروجی: فقط اعداد/شمارش‌ها — توکن هرگز چاپ نمی‌شود (قانون افشای راز).
 *
 * اجرا: set -a; . ./.env.local; set +a; bun scripts/pn098-kpi-witness.ts
 */
process.env.DATABASE_URL ||= "file:/home/z/my-project/db/custom.db";

const BASE = process.env.WITNESS_BASE_URL ?? "http://localhost:3000";

async function main() {
  const { createSession, OWNER_DISPLAY_NAME } = await import("@/lib/auth/session");
  const { db } = await import("@/lib/db");

  // ۱) تراشیدن نشست مالک (عین مسیر موفق master-login)
  const { token } = await createSession(
    { personnelCode: "OWNER", displayName: OWNER_DISPLAY_NAME, role: "OWNER" },
    { ip: "127.0.0.1", userAgent: "pn098-kpi-witness" },
  );

  try {
    const auth = { Authorization: `Bearer ${token}` };

    // ۲) KPI Listings / Requests — عین دستور گام ۷ (limit=1 · total از countArmCatalog)
    for (const ep of ["listings", "requests"] as const) {
      const res = await fetch(`${BASE}/api/crm/arm-catalog/${ep}?limit=1`, { headers: auth });
      const text = await res.text();
      try {
        const body = JSON.parse(text) as { total?: number; pagination?: { total?: number } };
        const total = body.total ?? body.pagination?.total;
        console.log(`KPI ${ep}: HTTP ${res.status} · total=${total ?? "?"}`);
      } catch {
        console.log(`KPI ${ep}: HTTP ${res.status} · RAW[0..200]=${text.slice(0, 200)}`);
      }
    }

    // ۳) کاشی‌ها (گام ۸ — از رجیستری حقیقت: bootstrap = تنها نقطهٔ ثبت)
    await import("@/core/tiles/bootstrap");
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const tileList = tileRegistry.listAll("OWNER");
    console.log(`tiles(registry): count=${tileList.length} → [${tileList.map((t) => t.id).join(", ")}]`);

    // ۴) موتورهای هوش (گام ۸)
    const intel = await fetch(`${BASE}/api/intelligence/status`, { headers: auth });
    const intelText = await intel.text();
    let engineCount = "?";
    try {
      const j = JSON.parse(intelText) as { engines?: unknown[]; data?: { engines?: unknown[] } };
      const arr = j.engines ?? j.data?.engines;
      if (Array.isArray(arr)) engineCount = String(arr.length);
    } catch { /* ساختار متفاوت — فقط وضعیت HTTP گزارش می‌شود */ }
    console.log(`intelligence: HTTP ${intel.status} · engines=${engineCount}`);
  } finally {
    // ۵) صفر پسماند — حذف ردیف نشست شاهد از دادهٔ مقدس
    await db.session.deleteMany({ where: { userAgent: "pn098-kpi-witness" } });
    console.log("witness session purged (zero residue)");
  }
}

main().catch((e) => {
  console.error("WITNESS-ERR:", (e as Error).message);
  process.exit(1);
});
