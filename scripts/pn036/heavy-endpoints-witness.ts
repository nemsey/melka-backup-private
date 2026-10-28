#!/usr/bin/env bun
/**
 * scripts/pn036/heavy-endpoints-witness.ts — شاهد فاز ۴: تشخیص endpoint های سنگین
 * از دادهٔ زندهٔ صف: کندترین رفت‌وبرگشت‌ها + شکستهای curl 28 → جدول pageSize/مهلت
 */
import { Database } from "bun:sqlite";

const db = new Database("/home/z/my-project/db/custom.db", { readonly: true });
const q = (sql: string, ...p: unknown[]) => {
  try { return db.query(sql).all(...p) as Array<Record<string, unknown>>; } catch { return []; }
};

// ۱) کندترین رفت‌وبرگشت‌های ۲۴ ساعت اخیر (داده برای علامت‌گذاری > ۲۰ث)
const slow = q(
  "SELECT replace(substr(url, 9, 60),'https://','') path, responseStatus, CAST((completedAt-dispatchedAt) AS INT) rtMs, length(responseBody) bodyLen FROM RelayQueue WHERE status IN ('done','failed') AND dispatchedAt > (strftime('%s','now')-86400)*1000 AND completedAt IS NOT NULL ORDER BY rtMs DESC LIMIT 15"
);

// ۲) شکستهای curl 28 به تفکیک مسیر (۲۴ ساعت)
const curl28 = q(
  "SELECT replace(substr(url, 9, 60),'https://','') path, count(*) n FROM RelayQueue WHERE error LIKE '%curl exit 28%' GROUP BY substr(url, 9, 60) ORDER BY n DESC LIMIT 12"
);

// ۳) اندازهٔ پاسخ‌های بزرگ (ARG_MAX jq — چرا فهرستها jq را شکست)
const bigBodies = q(
  "SELECT replace(substr(url, 9, 60),'https://','') path, MAX(length(responseBody)) maxBodyBytes FROM RelayQueue WHERE responseBody IS NOT NULL GROUP BY substr(url, 9, 60) ORDER BY maxBodyBytes DESC LIMIT 10"
);

const total28 = curl28.reduce((a, r) => a + Number(r.n), 0);
const witness = {
  phase: "PN-036 فاز ۴ — endpoint های سنگین: تشخیص + درمان",
  at: new Date().toISOString(),
  diagnosis: {
    slowRoundtrips: slow.map((r) => ({ path: r.path, httpStatus: r.responseStatus, seconds: Math.round(Number(r.rtMs) / 100) / 10, bodyKB: Math.round(Number(r.bodyLen) / 1024) })),
    curl28ByPath: curl28.map((r) => ({ path: r.path, failures: r.n })),
    curl28Total: total28,
    largestBodies: bigBodies.map((r) => ({ path: r.path, maxBodyKB: Math.round(Number(r.maxBodyBytes) / 1024) })),
    conclusion: "مسیرهای سنگین = فهرست‌ها (properties/requests/list با limit=۵۰۰/۱۰۰) + statics/enums + portalInfo — پاسخ‌های چند-مگابایتی هم curl ۲۵ث را می‌شکستند (خطای 28) هم jq ARG_MAX را (پاسخ base64 در آرگومان خط فرمان)",
  },
  treatment: {
    perItemTimingLogs: "هر آیتم: «✓ METHOD path → HTTP CODE در DURث» یا «⚔ METHOD path → خطای curl N پس از DURث» — مسیر بدون کوئری (صفر لاگ محتوا)",
    adaptiveTimeout: "is_interactive → ۱۵ث (OTP) · بقیه ۶۰ث + تلاش دوم با ۵ث فاصله برای خطای ۲۸",
    pageSize: [
      { catalog: "ARM listings (arm-catalog.ts)", before: "پیش‌فرض ۵۰۰ · clamp ۵۰۰", after: "پیش‌فرض ۵۰ · clamp ۱۰۰ — عین رفتار خود سامانه (limit=50 در ۵.۱ث پایدار)" },
      { catalog: "PM عمومی (melk-public.ts)", before: "پیش‌فرض ۱۰۰ · clamp ۱۰۰", after: "پیش‌فرض ۵۰ · clamp ۵۰" },
    ],
    serverListTimeout: "۴۵ → ۷۵ث (ARM listings) · ۳۰ → ۷۵ث (melk-public) — مهلت سرور بلندتر از مهلت گوشی (۶۰ث)",
    relayWait: "RELAY_WAIT_DEFAULT_MS: ۳۰ ← ۱۱۰ث — کارهای پس‌زمینه برای فهرست‌های سنگین زمان واقعی می‌گیرند",
  },
};
await Bun.write("download/pn036/heavy-endpoints-diagnosis.json", JSON.stringify(witness, null, 2));
console.log(`✓ heavy-endpoints-diagnosis.json — ${slow.length} مسیر کند · مجموع curl28: ${total28}`);
db.close();
