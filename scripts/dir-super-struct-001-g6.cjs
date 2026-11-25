// DIR-SUPER-STRUCT-001 — شمارش دادهٔ مقدس (G6) + پوشش برچسب اتمی + وضعیت دستگاه رله از DB زنده
const db = require("better-sqlite3")("db/custom.db", { readonly: true });
const count = (t) => {
  try { return db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n; } catch { return "?"; }
};
const group = (t) => {
  try { return db.prepare(`SELECT syncStage, COUNT(*) n FROM ${t} GROUP BY syncStage`).all(); } catch (e) { return [{ error: String(e.message).slice(0, 60) }]; }
};
const devices = (() => {
  try {
    return db.prepare("SELECT deviceId, lastHeartbeatAt, lastSeenAt, enrolledAt, revokedAt FROM RelayDevice ORDER BY lastSeenAt DESC LIMIT 3").all();
  } catch (e) { return [{ error: String(e.message).slice(0, 60) }]; }
})();
const out = {
  P: count("PropertyRecord"),
  R: count("RequestRecord"),
  T: count("TransactionRecord"),
  EP: count("ExpertProfile"),
  User: count("User"),
  stage_m1: group("PropertyRecord"),
  stage_m2: group("RequestRecord"),
  relayDevices: devices,
  quick_check: (() => { try { return db.pragma("quick_check", { simple: true }); } catch (e) { return String(e.message).slice(0, 40); } })(),
};
console.log(JSON.stringify(out, null, 1));
