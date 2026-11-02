// PN-036 · فاز ۳ (کاوش ۳): بدنهٔ پاسخ‌های PM 412 + ARM 400 — «سامانه خودش چه گفت؟»
import { Database } from "bun:sqlite";

const db = new Database("/home/z/my-project/db/custom.db", { readonly: true });
const q = (sql: string, ...p: unknown[]) => {
  try { return db.query(sql).all(...p); } catch (e) { console.log("SQL ERR:", (e as Error).message); return []; }
};

console.log("═══ PM OTP 412 — بدنهٔ پاسخ کامل ═══");
for (const r of q("SELECT url, responseStatus, responseBody, responseContentType, datetime(completedAt/1000,'unixepoch') at FROM RelayQueue WHERE url LIKE '%pm-api%otp%' AND responseStatus IS NOT NULL ORDER BY enqueuedAt DESC LIMIT 6")) {
  console.log(`\n── ${r.at} · ${r.url} · HTTP ${r.responseStatus} · ${r.responseContentType}`);
  const body = String(r.responseBody ?? "");
  try { console.log(JSON.stringify(JSON.parse(body), null, 2).slice(0, 1200)); } catch { console.log(body.slice(0, 800)); }
}

console.log("\n═══ ARM otp/0 400 — بدنهٔ پاسخ ═══");
for (const r of q("SELECT url, responseStatus, responseBody, datetime(completedAt/1000,'unixepoch') at FROM RelayQueue WHERE url LIKE '%apm/authentication/otp/0%' AND responseStatus=400 ORDER BY enqueuedAt DESC LIMIT 2")) {
  console.log(`\n── ${r.at} · HTTP ${r.responseStatus}`);
  const body = String(r.responseBody ?? "");
  try { console.log(JSON.stringify(JSON.parse(body), null, 2).slice(0, 800)); } catch { console.log(body.slice(0, 500)); }
}

console.log("\n═══ PM portalInfo (نمونهٔ موفق؟) ═══");
for (const r of q("SELECT responseStatus, length(responseBody) len, substr(responseBody,1,200) body FROM RelayQueue WHERE url LIKE '%portalInfo%' AND responseStatus IS NOT NULL ORDER BY enqueuedAt DESC LIMIT 3")) {
  console.log(`HTTP ${r.responseStatus} · len=${r.len} · ${r.body}`);
}

console.log("\n═══ PM otp/login (ورود موفق قبلی؟) ═══");
for (const r of q("SELECT responseStatus, substr(responseBody,1,150) body, datetime(completedAt/1000,'unixepoch') at FROM RelayQueue WHERE url LIKE '%pm-api%otp/login%' AND responseStatus IS NOT NULL ORDER BY enqueuedAt DESC LIMIT 4")) {
  console.log(`${r.at} · HTTP ${r.responseStatus} · ${r.body}`);
}

console.log("\n═══ ARM otp/login 200 (ورود اپ) ═══");
for (const r of q("SELECT responseStatus, datetime(completedAt/1000,'unixepoch') at FROM RelayQueue WHERE url LIKE '%apm/authentication/otp/login%' ORDER BY enqueuedAt DESC LIMIT 5")) {
  console.log(`${r.at} · HTTP ${r.responseStatus}`);
}

console.log("\n═══ headersJson نمونهٔ PM OTP (چه هدرهایی فرستادیم؟) ═══");
for (const r of q("SELECT headersJson FROM RelayQueue WHERE url LIKE '%pm-api%authentication/otp/4%' ORDER BY enqueuedAt DESC LIMIT 2")) {
  console.log(r.headersJson);
}

console.log("\n═══ gap probe ═══");
for (const r of q("SELECT responseStatus, substr(responseBody,1,120) body FROM RelayQueue WHERE url LIKE '%gap-api%' AND responseStatus IS NOT NULL ORDER BY enqueuedAt DESC LIMIT 3")) {
  console.log(`HTTP ${r.responseStatus} · ${r.body}`);
}

db.close();
