// PN-049 — بازیابی کلیدهای عملیاتی env.platform.json از بستهٔ بقای PN-048
// (قانون بقای env — الگوی restore-env.sh؛ رازهای زندهٔ فعلی دست‌نخورده)
import fs from "node:fs";

const current = JSON.parse(fs.readFileSync("env.platform.json", "utf8"));
const survival = JSON.parse(fs.readFileSync("upload/.survival/PN-048-20261021/env.platform.json", "utf8"));

// فقط کلیدهای عملیاتیِ غایب بازمی‌گردند؛ رازهای زنده (TOKEN_KEY/MASTER_CODE/…) عوض نمی‌شوند
const OPERATIONAL_KEYS = ["MELK_ARM_CIRCUIT_DISABLED", "MELK_ARM_RELAY_MODE", "MELK_RELAY_ALT_URL", "MELK_PROXY_SECRET", "MELK_PUBLIC_BASE_URL"] as const;

const next: Record<string, unknown> = { ...current };
const restored: string[] = [];
for (const k of OPERATIONAL_KEYS) {
  if (!(k in current) && k in survival) {
    next[k] = survival[k];
    restored.push(k);
  }
}
next["_pn049"] = "بازگردانی کلیدهای عملیاتی پس از ریست محیط — از بستهٔ بقای PN-048-20261021 (قانون بقای env)؛ رازهای زنده دست‌نخورده.";

fs.writeFileSync("env.platform.json.tmp", JSON.stringify(next, null, 2) + "\n");
fs.renameSync("env.platform.json.tmp", "env.platform.json");
fs.chmodSync("env.platform.json", 0o600);
console.log(JSON.stringify({ ok: true, restored, finalKeys: Object.keys(next).sort() }));
