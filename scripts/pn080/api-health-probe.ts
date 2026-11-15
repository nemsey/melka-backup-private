#!/usr/bin/env bun
/**
 * PN-080 · گام ۱ — تست سلامت API چهار سامانه ملک تبریز + راستی‌آزمایی شناسه‌های مرجع ثبت آگهی
 * ---------------------------------------------------------------------------
 * حکم مالک (۲۰۲۶-۱۱-۱۰): «از صحت api سامانه‌های فوق اطمینان حاصل کن»
 *   arm  → https://arus-api.melketabriz.ir/api/apm/
 *   pm   → https://pm-api.melketabriz.ir/api/
 *   gap  → https://gap-api.melketabriz.ir/api/
 *   عمومی → https://arus-api.melketabriz.ir/api/apu/
 *
 * مسیر تست: عین مسیر تولید — صف رلهٔ موبایل (MELK_ARM_RELAY_MODE=mobile).
 * مستقیم از سندباکس ممکن نیست (جان‌فنس جغرافیایی مبدأ — PN-030).
 * صفر نوشتن: تنها POST، properties/create با بدنهٔ خالی و «بدون توکن» است
 * (انتظار 401 = زنده‌بودن endpoint؛ هیچ داده‌ای ساخته نمی‌شود).
 */
import { writeFileSync, mkdirSync } from "node:fs";

// env زنده — عین melka-debug.ts
for (const p of ["../../../.env", "../../../env.platform.json"]) {
  try {
    const url = new URL(p, import.meta.url);
    const raw = await Bun.file(url).text();
    if (p.endsWith(".json")) {
      const plat = JSON.parse(raw) as Record<string, string>;
      for (const [k, v] of Object.entries(plat)) if (typeof v === "string" && !process.env[k]) process.env[k] = v;
    } else {
      for (const line of raw.split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* اختیاری */ }
}

const OUT_DIR = `${import.meta.dir}/../../download/PN-080`;
const IRAN_COUNTRY_ID = "614ed19700cace6eac4f9ded";
const AZ_SHARGHI_STATE_ID = "614ed19700cace6eac4f9df0";

interface ProbeResult {
  label: string;
  method: string;
  url: string;
  httpStatus: number | null;
  ms: number | null;
  bodyHead: string;
  parsed?: Record<string, unknown>;
  error?: string;
}

async function main(): Promise<number> {
  const { anyRelayDeviceOnline, enqueueRelayRequest, waitRelayResponse } = await import("@/lib/melk-api/relay");

  // انتظار بازگشت رله (تا ۲۴۰ث) — آیتم‌ها باید «پس از» بازگشت گوشی صف شوند تا TTL نسوزند
  let online = await anyRelayDeviceOnline();
  if (!online) {
    console.log("رله آفلاین است — تا ۲۴۰ ثانیه برای بازگشت گوشی انتظار می‌کشم…");
    const waitStart = Date.now();
    while (!(online = await anyRelayDeviceOnline())) {
      if (Date.now() - waitStart > 240_000) break;
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
  if (!online) {
    console.log(JSON.stringify({ ok: false, error: "رلهٔ موبایل در ۲۴۰ ثانیه برنگشت — پروب انجام نشد" }, null, 2));
    return 1;
  }

  // دروازهٔ poll تازه — آخرین lastSeenAt باید < ۶۰ث باشد (گوشی همین حالا در چرخه است؛
  // پنجرهٔ ۲۴۰ث آنلاین، گوشیِ خفته را هم آنلاین می‌پندارد و TTL آیتم‌ها می‌سوخت)
  const { db } = await import("@/lib/db");
  const freshStart = Date.now();
  for (;;) {
    const freshest = await db.relayDevice.findFirst({
      where: { revokedAt: null, lastSeenAt: { not: null } },
      orderBy: { lastSeenAt: "desc" },
      select: { lastSeenAt: true },
    });
    const ageMs = freshest?.lastSeenAt ? Date.now() - freshest.lastSeenAt.getTime() : Infinity;
    if (ageMs < 60_000) {
      console.log(`poll تازه ✓ (سن ${Math.round(ageMs / 1000)}ث) — صف‌گذاری ${""}۱۷ پروب…`);
      break;
    }
    if (Date.now() - freshStart > 300_000) {
      console.log(JSON.stringify({ ok: false, error: `رله در ۳۰۰ثانیه poll تازه نزد (آخرین سن ${Math.round(ageMs / 1000)}ث)` }, null, 2));
      return 1;
    }
    process.stdout.write(`.`);
    await new Promise((r) => setTimeout(r, 5_000));
  }

  const targets: Array<{ label: string; method: string; url: string; body?: string }> = [
    // ── چهار پایهٔ اعلامی مالک ──
    { label: "ARM apm ریشه", method: "GET", url: "https://arus-api.melketabriz.ir/api/apm/" },
    { label: "PM ریشه", method: "GET", url: "https://pm-api.melketabriz.ir/api/" },
    { label: "GAP ریشه", method: "GET", url: "https://gap-api.melketabriz.ir/api/" },
    { label: "عمومی apu ریشه", method: "GET", url: "https://arus-api.melketabriz.ir/api/apu/" },
    // ── عمومی‌های سالم شناخته‌شده ──
    { label: "ARM public enums", method: "GET", url: "https://arus-api.melketabriz.ir/api/public/statics/enums-persian" },
    { label: "PM portalInfo", method: "GET", url: "https://pm-api.melketabriz.ir/api/public/portalInfo" },
    { label: "عمومی apu فهرست آگهی", method: "GET", url: "https://arus-api.melketabriz.ir/api/apu/properties/list?page=1&limit=1" },
    // ── شناسه‌های مرجع ثبت آگهی (گام ۲) ──
    { label: "ARM countries", method: "GET", url: "https://arus-api.melketabriz.ir/api/apm/countries/list" },
    { label: "ARM states", method: "GET", url: `https://arus-api.melketabriz.ir/api/apm/states/list?country=${IRAN_COUNTRY_ID}` },
    { label: "ARM cities", method: "GET", url: `https://arus-api.melketabriz.ir/api/apm/cities/list?state=${AZ_SHARGHI_STATE_ID}` },
    { label: "ARM areas", method: "GET", url: "https://arus-api.melketabriz.ir/api/apm/areas/list" },
    { label: "ARM trade-types", method: "GET", url: "https://arus-api.melketabriz.ir/api/apm/trade-types/list" },
    { label: "ARM building-types", method: "GET", url: "https://arus-api.melketabriz.ir/api/apm/building-types/list" },
    { label: "ARM property-types", method: "GET", url: "https://arus-api.melketabriz.ir/api/apm/property-types/list" },
    { label: "ARM user-seriousness", method: "GET", url: "https://arus-api.melketabriz.ir/api/apm/user-seriousness/list" },
    { label: "ARM price-evaluation", method: "GET", url: "https://arus-api.melketabriz.ir/api/apm/property-price-evaluation/list" },
    // ── زنده‌بودن endpoint ثبت (بدون توکن → انتظار 401؛ صفر نوشتن) ──
    { label: "ARM properties/create (بدون توکن)", method: "POST", url: "https://arus-api.melketabriz.ir/api/apm/properties/create", body: "{}" },
  ];

  // صف‌گذاری همه (یک دستهٔ گوشی) سپس انتظار موازی
  const enqueued: Array<{ t: (typeof targets)[number]; id: string }> = [];
  for (const t of targets) {
    const { id } = await enqueueRelayRequest({
      method: t.method,
      url: t.url,
      headers: t.body ? { "content-type": "application/json" } : undefined,
      body: t.body ?? null,
      source: "pn080-api-health",
    });
    enqueued.push({ t, id });
  }

  const results: ProbeResult[] = await Promise.all(
    enqueued.map(async ({ t, id }) => {
      const started = Date.now();
      try {
        const res = await waitRelayResponse(id, 115_000);
        const text = await res.text().catch(() => "");
        const out: ProbeResult = {
          label: t.label,
          method: t.method,
          url: t.url,
          httpStatus: res.status,
          ms: Date.now() - started,
          bodyHead: text.slice(0, 220),
        };
        // راستی‌آزمایی شناسه‌های مرجع
        try {
          const j = JSON.parse(text) as Record<string, unknown>;
          const data = (j.data ?? j) as unknown;
          if (Array.isArray(data)) {
            out.parsed = { count: data.length };
            const first = data[0] as Record<string, unknown> | undefined;
            if (first) out.parsed.first = { _id: first._id ?? first.id ?? first.value, name: first.name ?? first.title ?? first.label };
          } else if (typeof data === "object" && data !== null) {
            const list = (data as { list?: unknown[] }).list;
            if (Array.isArray(list)) {
              out.parsed = { count: list.length };
              const first = list[0] as Record<string, unknown> | undefined;
              if (first) out.parsed.first = { _id: first._id ?? first.id ?? first.value, name: first.name ?? first.title ?? first.label };
            } else {
              out.parsed = { keys: Object.keys(data).slice(0, 12) };
            }
          }
        } catch { /* بدنهٔ غیرJSON */ }
        return out;
      } catch (e) {
        return {
          label: t.label,
          method: t.method,
          url: t.url,
          httpStatus: null,
          ms: Date.now() - started,
          bodyHead: "",
          error: (e as Error).message,
        };
      }
    })
  );

  // خلاصهٔ کنسولی
  console.log("== PN-080 · سلامت API چهار سامانه (از مسیر رلهٔ تولید) ==");
  for (const r of results) {
    const mark = r.httpStatus == null ? "✗" : r.httpStatus < 400 ? "✓" : r.httpStatus === 401 || r.httpStatus === 404 ? "◯" : "⚠";
    console.log(`${mark} ${r.label.padEnd(34)} HTTP=${String(r.httpStatus).padEnd(3)} ${String(r.ms).padStart(6)}ms ${r.parsed ? JSON.stringify(r.parsed).slice(0, 110) : ""} ${r.error ?? ""}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString();
  writeFileSync(`${OUT_DIR}/api-health-probe.json`, JSON.stringify({ ok: true, at: stamp, via: "relay-mobile-production-path", results }, null, 2));
  console.log(`\nشاهد: download/PN-080/api-health-probe.json (${stamp})`);
  return 0;
}

process.exit(await main());
