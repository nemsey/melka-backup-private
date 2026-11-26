// DIR-OWNER-4STEPS-001 · شواهد زندهٔ گام دوم — مسیریابی رله-اول (نشست‌محور)
// آزمون رفتاری واقعیِ shouldRouteViaRelay روی دیتابیس زندهٔ سندباکس:
//   A) بدون نشست + بدون حالت سراسری → مسیر قبلی (false)
//   B) نشست عملیاتی فعال + رله برخط → رله اولویت اول (true)
//   C) نشست فعال اما رله آفلاین → مسیر قبلی صادقانه (false)
//   D) حالت سراسری mobile → همیشه رله برای میزبان آرم (true)؛ دیوار مستقیم (false)
//   E) اولویت صف: users/create بیرون نشست ۵ · در نشست ۱۰ (سقف)
import { PrismaClient } from "@prisma/client";

// ایزوله‌سازی قطعی: دیتابیس آزمون (نه دیتابیس زندهٔ سندباکس — نویز فرایندهای
// پس‌زمینه/تست‌های موازی نباید پیشینهٔ «رلهٔ برخط» بسازد). پیش از import ماژول‌ها
// تنظیم می‌شود چون @/lib/db در زمان بارگذاری CLIENT را می‌سازد.
process.env.DATABASE_URL = "file:/home/z/my-project/db/test.db";
const db = new PrismaClient();
const ARM = "https://arus-api.melketabriz.ir/api/apm/properties/create";
const DIVAR = "https://api.divar.ir/v8/postlist/w/search";
const DEVICE = "dev-4steps-evidence";
const RT = process.env.MELK_LCPP_RUNTIME_DIR!;

process.env.MELK_ARM_RELAY_MODE = "";
const { shouldRouteViaRelay } = await import("/home/z/my-project/src/lib/melk-api/proxy.ts");
const { relayPriorityForUrl } = await import("/home/z/my-project/src/lib/melk-api/relay.ts");
import { writeFileSync, unlinkSync } from "node:fs";

function session(on: boolean) {
  const p = `${RT}/changes-session.json`;
  try { unlinkSync(p); } catch {}
  if (on) {
    const now = new Date();
    writeFileSync(p, JSON.stringify({
      version: 1, startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
      actor: "EVIDENCE", note: "owner-4steps evidence",
    }), "utf8");
  }
}

const results = [];
const rec = (name, got, want) => results.push({ name, pass: got === want, got, want });

// A — بدون نشست
session(false);
rec("A بدون-نشست: ARM مسیر قبلی", await shouldRouteViaRelay(ARM), false);
rec("A بدون-نشست: دیوار مستقیم", await shouldRouteViaRelay(DIVAR), false);

// B — نشست فعال + رله برخط
await db.relayDevice.create({ data: {
  deviceId: DEVICE, secret: "e".repeat(64), label: "4steps-evidence",
  enrollCode: "e".repeat(36), enrollExpires: new Date(Date.now() + 3600_000),
  maxAttempts: 99, lastSeenAt: new Date(), enrolledBy: "evidence",
}});
session(true);
rec("B نشست+رله-برخط: ARM → رله اولویت اول", await shouldRouteViaRelay(ARM), true);
rec("B نشست+رله-برخط: دیوار مستقیم (ولاغیر)", await shouldRouteViaRelay(DIVAR), false);
session(false);
await db.relayDevice.deleteMany({ where: { deviceId: DEVICE } });

// C — نشست فعال اما رله آفلاین (خارج پنجرهٔ ۲۴۰ث)
await db.relayDevice.create({ data: {
  deviceId: DEVICE, secret: "e".repeat(64), label: "4steps-offline",
  enrollCode: "f".repeat(36), enrollExpires: new Date(Date.now() + 3600_000),
  maxAttempts: 99, lastSeenAt: new Date(Date.now() - 30 * 60_000), enrolledBy: "evidence",
}});
session(true);
rec("C نشست+رله-آفلاین: مسیر قبلی صادقانه", await shouldRouteViaRelay(ARM), false);
session(false);
await db.relayDevice.deleteMany({ where: { deviceId: DEVICE } });

// D — حالت سراسری
process.env.MELK_ARM_RELAY_MODE = "mobile";
rec("D سراسری-mobile: ARM → رله", await shouldRouteViaRelay(ARM), true);
rec("D سراسری-mobile: دیوار مستقیم", await shouldRouteViaRelay(DIVAR), false);
process.env.MELK_ARM_RELAY_MODE = "";

// E — اولویت خانوادهٔ ثبت
session(false);
rec("E users/create بیرون نشست = تعاملی ۵", relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/users/create"), 5);
session(true);
try {
  rec("E users/create در نشست = سقف ۱۰", relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/users/create"), 10);
  rec("E properties/create در نشست = سقف ۱۰", relayPriorityForUrl(ARM), 10);
  rec("E users/info/mobile-number در نشست = سقف ۱۰", relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/users/info/mobile-number/989144018677"), 10);
  rec("E divar در نشست = ۰ (ولاغیر)", relayPriorityForUrl(DIVAR), 0);
} finally { session(false); }

await db.$disconnect();
const pass = results.filter((r) => r.pass).length;
console.log(JSON.stringify({ schema: "melka-dir-owner-4steps-001-relay-first-evidence", pass, fail: results.length - pass, results }, null, 2));
process.exit(results.every((r) => r.pass) ? 0 : 1);
