#!/usr/bin/env bun
/**
 * PN-033 · فاز ۴ — ممیزی پاکسازی env + اسکرو سه‌لایه (شورا-ن۰۵۴)
 * خروجی: download/pn033/env-cleanup.json
 * قانون: صفر چاپ مقدار راز — فقط نام کلیدها و وضعیت.
 */
const ROOT = "/home/z/my-project";

const readJson = async (p: string) => JSON.parse(await Bun.file(`${ROOT}/${p}`).text());
const readText = async (p: string) => Bun.file(`${ROOT}/${p}`).text();

const REPORT: Record<string, unknown> = {};

// ۱) env.platform.json — منبع اصلی
const env = await readJson("env.platform.json");
REPORT["env.platform.json"] = {
  hasProxyUrl: "MELK_ARM_PROXY_URL" in env,
  hasAltUrl: "MELK_RELAY_ALT_URL" in env,
  hasCircuitDisabled: env.MELK_ARM_CIRCUIT_DISABLED === "1",
  relayMode: env.MELK_ARM_RELAY_MODE,
};

// ۲) env.platform.json.example
const example = await readText("env.platform.json.example");
REPORT["env.platform.json.example"] = {
  validJson: (() => { try { JSON.parse(example); return true; } catch { return false; } })(),
  hasProxyUrl: example.includes('"MELK_ARM_PROXY_URL"'),
  hasAltUrl: example.includes('"MELK_RELAY_ALT_URL"'),
  hasCircuitDisabled: example.includes('"MELK_ARM_CIRCUIT_DISABLED"'),
};

// ۳) اسکرو سه‌لایه — دو لایهٔ متنی
for (const layer of ["db/.runtime/boot-secrets.json", "upload/.runtime/boot-secrets.json"]) {
  try {
    const esc = await readJson(layer);
    REPORT[layer] = {
      hasProxyUrl: "MELK_ARM_PROXY_URL" in esc,
      hasAltUrl: "MELK_RELAY_ALT_URL" in esc,
      hasCircuitDisabled: esc.MELK_ARM_CIRCUIT_DISABLED === "1",
      keyCount: Object.keys(esc).filter((k) => !k.startsWith("_") && k !== "updatedAt").length,
    };
  } catch {
    REPORT[layer] = { exists: false };
  }
}

// ۴) اسکرو رمزنگاری‌شده — ساختار SECRET_FIELDS (بدون رمزگشایی)
try {
  const src = await readText("scripts/pn012/escrow-manager.ts");
  const m = src.match(/SECRET_FIELDS\s*=\s*\[([^\]]*)\]/);
  const fields = m ? m[1].split(",").map((s) => s.trim().replace(/["'`]/g, "")).filter(Boolean) : [];
  REPORT["env.escrow.enc"] = {
    structFields: fields,
    hasProxyUrl: fields.includes("MELK_ARM_PROXY_URL"),
    note: "لایهٔ رمزنگاری‌شده اساساً رازهای هسته را حمل می‌کند — کلیدهای Worker هرگز در آن نبودند",
  };
} catch { /* ignore */ }

// ۵) .env.local
try {
  const envl = await readText(".env.local");
  REPORT[".env.local"] = {
    exists: true,
    hasProxyUrl: /^\s*MELK_ARM_PROXY_URL\s*=/m.test(envl),
    hasAltUrl: /^\s*MELK_RELAY_ALT_URL\s*=/m.test(envl),
  };
} catch {
  REPORT[".env.local"] = { exists: false };
}

// ۶) BOOT_SECRET_KEYS (کد منبع)
try {
  const src = await readText("src/lib/auth/boot-secrets.ts");
  REPORT["BOOT_SECRET_KEYS"] = {
    hasProxyUrl: src.includes('"MELK_ARM_PROXY_URL"'),
    hasAltUrl: src.includes('"MELK_RELAY_ALT_URL"'),
    hasCircuitDisabled: src.includes('"MELK_ARM_CIRCUIT_DISABLED"'),
  };
} catch { /* ignore */ }

// داوری
const layers = [REPORT["env.platform.json"], REPORT["env.platform.json.example"], REPORT["db/.runtime/boot-secrets.json"], REPORT["upload/.runtime/boot-secrets.json"], REPORT[".env.local"], REPORT["BOOT_SECRET_KEYS"]];
const anyWorkerKey = layers.some((l) => l && (l.hasProxyUrl || l.hasAltUrl));
const circuitEverywhere = REPORT["env.platform.json"].hasCircuitDisabled === true && REPORT["db/.runtime/boot-secrets.json"].hasCircuitDisabled === true && REPORT["upload/.runtime/boot-secrets.json"].hasCircuitDisabled === true && REPORT["BOOT_SECRET_KEYS"].hasCircuitDisabled === true;

const out = {
  phase: "PN-033 · فاز ۴ — پاکسازی env + اسکرو سه‌لایه (شورا-ن۰۵۴)",
  at: new Date().toISOString(),
  layers: REPORT,
  anyWorkerKeyAnywhere: anyWorkerKey,
  circuitDisabledEverywhere: circuitEverywhere,
  verdict: !anyWorkerKey && circuitEverywhere ? "ENV-CLEAN" : "WORKER-KEY-FOUND",
};

await Bun.write("download/pn033/env-cleanup.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({ anyWorkerKey, circuitDisabledEverywhere: circuitEverywhere, verdict: out.verdict }, null, 2));
if (out.verdict !== "ENV-CLEAN") process.exit(1);
