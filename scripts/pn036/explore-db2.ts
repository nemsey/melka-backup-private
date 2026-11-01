// PN-036 · فاز ۳ (کاوش ۲): کوئری‌های درست با epoch-millis
import { Database } from "bun:sqlite";

const db = new Database("/home/z/my-project/db/custom.db", { readonly: true });
const q = (sql: string, ...p: unknown[]) => {
  try { return db.query(sql).all(...p); } catch (e) { console.log("SQL ERR:", (e as Error).message); return []; }
};
const now = Date.now();
const H12 = now - 12 * 3600_000;

console.log("═══ RelayJob: همهٔ کارها (تازه‌ترین ۱۵) ═══");
console.table(q("SELECT type, status, substr(error,1,70) err, httpStatus, datetime(createdAt/1000,'unixepoch') at FROM RelayJob ORDER BY createdAt DESC LIMIT 15"));

console.log("═══ RelayQueue: URL های authentication (همهٔ زمان‌ها) ═══");
console.table(q("SELECT substr(url,1,75) url, method, status, responseStatus, substr(error,1,25) err, datetime(enqueuedAt/1000,'unixepoch') at FROM RelayQueue WHERE url LIKE '%authentication%' ORDER BY enqueuedAt DESC LIMIT 15"));

console.log("═══ RelayQueue: ۱۶ آیتمِ failed (کامل) ═══");
console.table(q("SELECT substr(url,1,55) url, priority, responseStatus, substr(error,1,20) err, datetime(enqueuedAt/1000,'unixepoch') enq, datetime(completedAt/1000,'unixepoch') done FROM RelayQueue WHERE status='failed' ORDER BY enqueuedAt DESC LIMIT 16"));

console.log("═══ RelayQueue: نمونهٔ done تازه (۸) ═══");
console.table(q("SELECT substr(url,1,55) url, responseStatus, length(responseBody) bodyLen, CAST((completedAt-dispatchedAt) AS INT) rtMs, datetime(completedAt/1000,'unixepoch') at FROM RelayQueue WHERE status='done' ORDER BY completedAt DESC LIMIT 8"));

console.log("═══ RelayQueue: توزیع مسیر (کل) ═══");
console.table(q("SELECT replace(substr(url, instr(url,'://')+3), 'https://','') u, count(*) n FROM RelayQueue GROUP BY substr(url, 9, 60) ORDER BY n DESC LIMIT 15"));

console.log("═══ RelayDevice ═══");
console.table(q("SELECT deviceId, label, datetime(lastSeenAt/1000,'unixepoch') lastSeen, servedCount, errorCount, lastRoundtripMs, revokedAt IS NOT NULL revoked, enrollCode IS NOT NULL hasCode FROM RelayDevice ORDER BY id DESC LIMIT 5"));

console.log("═══ PmConnection (خام) ═══");
console.log(q("SELECT * FROM PmConnection LIMIT 2"));

console.log("═══ IntegrationRepository؟ جست‌وجوی جدول‌های pm ═══");
console.table(q("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%onnect%' OR name LIKE '%ntegration%')"));

console.log("═══ ArmConnection ═══");
console.table(q("SELECT status, personnelCode, displayName, substr(lastError,1,80) err, datetime(lastCheckedAt/1000,'unixepoch') checked FROM ArmConnection LIMIT 3"));

db.close();
