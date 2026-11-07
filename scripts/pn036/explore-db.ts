// PN-036 · فاز ۳ (کاوش): وضعیت صف رله و کارهای PM در پایگاه دادهٔ زنده
import { Database } from "bun:sqlite";

const db = new Database("/home/z/my-project/db/custom.db", { readonly: true });

const q = (sql: string, ...p: unknown[]) => {
  try { return db.query(sql).all(...p); } catch (e) { console.log("SQL ERR:", (e as Error).message); return []; }
};

console.log("═══ RelayQueue: شمارش بر اساس وضعیت ═══");
console.table(q("SELECT status, count(*) n FROM RelayQueue GROUP BY status"));

console.log("═══ RelayQueue: توزیع میزبان مقصد (۱۲ ساعت اخیر) ═══");
console.table(q("SELECT substr(url,1,45) host, status, count(*) n FROM RelayQueue WHERE enqueuedAt > datetime('now','-12 hours') GROUP BY substr(url,1,45), status ORDER BY n DESC LIMIT 20"));

console.log("═══ RelayQueue: خطاها (نمونه) ═══");
console.table(q("SELECT substr(url,1,60) url, method, responseStatus, substr(error,1,40) err, count(*) n FROM RelayQueue WHERE status='failed' GROUP BY substr(url,1,60), responseStatus, substr(error,1,40) ORDER BY n DESC LIMIT 15"));

console.log("═══ RelayJob: کارهای ۱۲ ساعت اخیر ═══");
console.table(q("SELECT type, status, count(*) n FROM RelayJob WHERE createdAt > datetime('now','-12 hours') GROUP BY type, status"));

console.log("═══ RelayJob: خطاهای PM ═══");
console.table(q("SELECT type, status, substr(error,1,90) err, httpStatus, createdAt FROM RelayJob WHERE type LIKE 'pm-%' ORDER BY createdAt DESC LIMIT 10"));

console.log("═══ PmConnection ═══");
console.table(q("SELECT status, personnelCode, substr(lastError,1,120) lastError, lastCheckedAt FROM PmConnection"));

console.log("═══ RelayQueue: slowest roundtrips (dispatched→completed) ═══");
console.table(q("SELECT substr(url,1,50) url, responseStatus, CAST((julianday(completedAt)-julianday(dispatchedAt))*86400000 AS INT) ms FROM RelayQueue WHERE status IN ('done','failed') AND dispatchedAt > datetime('now','-12 hours') ORDER BY ms DESC LIMIT 12"));

console.log("═══ آیتم‌های OTP در ۱۲ ساعت اخیر ═══");
console.table(q("SELECT substr(url,1,70) url, method, status, responseStatus, substr(error,1,30) err, enqueuedAt, completedAt FROM RelayQueue WHERE url LIKE '%otp%' AND enqueuedAt > datetime('now','-12 hours') ORDER BY enqueuedAt DESC LIMIT 12"));

console.log("═══ بک‌لاگ صف pending (کهنه‌ترین) ═══");
console.table(q("SELECT substr(url,1,55) url, priority, status, enqueuedAt FROM RelayQueue WHERE status IN ('pending','dispatched') ORDER BY enqueuedAt ASC LIMIT 12"));

db.close();
