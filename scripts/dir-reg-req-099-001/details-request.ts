/**
 * DIR-REG-REQ-099-001 — گام ۳: جزئیات یک درخواست تازه (فقط خواندن)
 * هدف: کشف ساختار «تاریخچه تغییرات» در صفحهٔ جزئیات خود سامانه
 */

import fs from "fs";
import path from "path";

async function main() {
  const { applyPlatformEnvFallbacks } = await import("@/lib/platform-env");
  applyPlatformEnvFallbacks();
  const { db } = await import("@/lib/db");
  const { resolveBestArmToken } = await import("@/lib/melk-api/arm-token-resolver");
  const { armCall } = await import("@/lib/melk-api/client");
  const { getMelkApiConfig } = await import("@/lib/melk-api/config");

  const resolved = await resolveBestArmToken(db);
  if (!resolved) throw new Error("no token");
  const cfg = getMelkApiConfig();

  const targetId = process.argv[2] ?? "";
  if (!targetId) throw new Error("usage: bun details-request.ts <_id|code>");

  const out: Record<string, unknown> = {};
  // جزئیات با شناسهٔ داخلی — اگر 500/404 داد، با کد هم امتحان می‌کنیم
  for (const pathVariant of [`requests/details/${encodeURIComponent(targetId)}`]) {
    try {
      const res = await armCall<Record<string, any>>({
        method: "GET",
        path: pathVariant,
        baseUrl: cfg.armApiBase,
        token: resolved.token,
        timeoutMs: 90_000,
        maxRetries: 0,
      });
      out.details = res.data;
      console.log("[details] OK — keys:", Object.keys(res.data ?? {}));
      fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "request-details-sample.json"), JSON.stringify(out, null, 2), "utf-8");
      const s = JSON.stringify(res.data, null, 2);
      console.log(s.slice(0, 3500));
      process.exit(0);
    } catch (e) {
      out.error = String(e);
      console.error("[details] FAILED:", String(e));
    }
  }
  fs.writeFileSync(path.join(process.cwd(), "scripts", "tmp", "request-details-sample.json"), JSON.stringify(out, null, 2), "utf-8");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
