/**
 * pn016-login-routes.ts — شاهد مرحلهٔ ۴: سه مسیر ورود
 * ---------------------------------------------------------------------------
 * ۱) مسیر ۱ (master) — روت موجود دست‌نخورده (صادقانه: گواهی tsc + کد)
 * ۲) مسیر ۲ (personnel) — resolvePersonnelLoginUser برای هر سه کاربر واقعی
 * ۳) مسیر ۳ (guest) — مکانیزم OTP مهمان: صدور/تأیید/غلط/یک‌بارمصرف/نرخ
 * خروجی: download/pn016/login-routes.json
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

process.env.DATABASE_URL = "file:/home/z/my-project/db/test.db";
const db = new PrismaClient();

async function main() {
  const out: Record<string, unknown> = {
    council: "ملکا-شورا-ن۰۲۰-۱۴۰۵",
    workOrder: "PN-016",
    stage: "۴ — سه مسیر ورود",
    at: new Date().toISOString(),
    db: "db/test.db (پایگاه تست — الگوی P6.5)",
  };

  // ── مسیر ۱: master-login — روت موجود، صفر تغییر در این مرحله ──
  const { getMasterCodeState } = await import("../../src/lib/services/master-auth");
  const masterState = await getMasterCodeState(process.env.MASTER_ACCESS_CODE);
  out.route1_master = {
    route: "POST /api/auth/master-login",
    changedInStage4: false,
    masterLayersConsistent: masterState.masterLayersConsistent,
    note: "حفظ شد (سند: مسیر ۱ — حفظ). گواهی زندهٔ ورود مالک در مرحلهٔ ۸ (E2E).",
  };

  // ── مسیر ۲: personnel-login + رجیستری User ──
  // آماده‌سازی دادهٔ تست: سه کاربر واقعی (عین seed) در پایگاه تست
  await db.user.deleteMany();
  await db.userPermission.deleteMany();
  await db.userActivity.deleteMany();
  await db.userSession.deleteMany();
  await db.session.deleteMany({ where: { personnelCode: { in: ["410031338", "410031319", "guest:09141112233"] } } }); // پاک‌سازی اجراهای قبلی ناتمام

  const { resolvePersonnelLoginUser, recordLoginSession, revokeUserSessions, resolveGuestLoginUser } = await import("../../src/lib/services/users-service");
  const { hashToken } = await import("../../src/lib/auth/crypto");
  const { verifyGuestOtp, issueGuestOtp, hasActiveGuestOtp } = await import("../../src/lib/auth/guest-otp");

  const mk = async (code: string, name: string, role: string) =>
    db.user.create({ data: { personnelCode: code, fullName: name, role, isActive: true, createdBy: "test" } });

  await mk("410031320", "سید نعمت اله سیدی", "OWNER");
  const am = await mk("410031338", "سید امیرمحمد سیدی", "EXPERT");
  const nr = await mk("410031319", "نرگس یاوری", "EXPERT");
  const dis = await db.user.create({ data: { personnelCode: "410099999", fullName: "کاربر غیرفعال تست", role: "EXPERT", isActive: false, createdBy: "test" } });

  const r1 = await resolvePersonnelLoginUser("410031320", "سید نعمت اله سیدی"); // مالک env
  const r2 = await resolvePersonnelLoginUser("410031338", "سید امیرمحمد سیدی"); // EXPERT موجود
  const r3 = await resolvePersonnelLoginUser("410088777", "کاربر ناشناس تازه"); // خودساخت VIEWER
  const r4 = await resolvePersonnelLoginUser("410099999", "کاربر غیرفعال تست"); // غیرفعال

  out.route2_personnel = {
    route: "POST /api/auth/personnel-login",
    cases: [
      { case: "کد مالک env", resolution: { legacyRole: r1.legacyRole, effectiveRole: r1.effectiveRole, isActive: r1.user.isActive } },
      { case: "EXPERT موجود", resolution: { legacyRole: r2.legacyRole, effectiveRole: r2.effectiveRole, isActive: r2.user.isActive } },
      { case: "بدون رکورد (خودساخت)", resolution: { legacyRole: r3.legacyRole, effectiveRole: r3.effectiveRole, isActive: r3.user.isActive, isNewlyProvisioned: r3.isNewlyProvisioned } },
      { case: "کاربر غیرفعال", resolution: { effectiveRole: r4.effectiveRole, isActive: r4.user.isActive, expectedHttp: 403 } },
    ],
    sessionMapProof: null as unknown,
  };

  // نقشهٔ نشست: recordLoginSession + بازخوانی + بستن از راه دور
  const tokenHash = hashToken("test-token-pn016-a".padEnd(32, "x"));
  await db.session.create({
    data: { tokenHash, personnelCode: "410031338", displayName: "سید امیرمحمد سیدی", role: "CONSULTANT", expiresAt: new Date(Date.now() + 3600_000) },
  });
  await recordLoginSession({ userId: am.id, tokenHash, ip: "10.0.0.9", userAgent: "pn016-test", expiresAt: new Date(Date.now() + 3600_000) });
  const mapped = await db.userSession.findUnique({ where: { tokenHash } });
  const closed = await revokeUserSessions(am.id);
  const sessionAfter = await db.session.findUnique({ where: { tokenHash } });
  out.route2_personnel.sessionMapProof = {
    userSessionRow: mapped ? { userId: mapped.userId, isActive: mapped.isActive, ip: mapped.ip } : null,
    remoteCloseCount: closed,
    authSessionRevokedAfterClose: sessionAfter?.revoked === true,
    revokedReason: sessionAfter?.revokedReason,
  };

  // ── مسیر ۳: guest ──
  const mobile = "09141112233";
  const g1 = await resolveGuestLoginUser(mobile); // خودساخت GUEST
  const g2 = await resolveGuestLoginUser(mobile); // دفعهٔ دوم = همان
  const otp = issueGuestOtp(mobile);
  const wrong = verifyGuestOtp(mobile, "0000");
  const right = verifyGuestOtp(mobile, otp.code);
  const replay = verifyGuestOtp(mobile, otp.code); // یک‌بارمصرف
  const guestSessionsClosed = await revokeUserSessions(g1.user.id);
  out.route3_guest = {
    route: "POST /api/auth/guest-request-otp + POST /api/auth/guest-login",
    cases: {
      provisioning: { firstTime: { effectiveRole: g1.effectiveRole, isNewlyProvisioned: g1.isNewlyProvisioned }, secondTime: { isNewlyProvisioned: g2.isNewlyProvisioned } },
      otpMechanism: {
        ttlSeconds: otp.expiresInSeconds,
        formatValid: /^\d{4}$/.test(otp.code),
        wrongCodeRejected: wrong.ok === false,
        rightCodeAccepted: right.ok === true,
        replayRejected: replay.ok === false,
        activeOtpCheck: hasActiveGuestOtp("09120000000") === false,
      },
      remoteClose: guestSessionsClosed,
    },
  };

  // پاک‌سازی تست
  await db.user.deleteMany();
  await db.userPermission.deleteMany();
  await db.userActivity.deleteMany();
  await db.userSession.deleteMany();
  await db.session.deleteMany({ where: { personnelCode: { in: ["410031338", "410031319"] } } });
  void nr; void dis;

  out.verdict = {
    route1_master: "PRESERVED",
    route2_personnel: "EXTENDED_WITH_USER_REGISTRY (نقش از User + غیرفعال=403 + نقشهٔ نشست + سیاهه)",
    route3_guest: "NEW (OTP هش + TTL + یک‌بارمصرف + GUEST)",
  };

  fs.mkdirSync("download/pn016", { recursive: true });
  fs.writeFileSync("download/pn016/login-routes.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.verdict, null, 2));
  console.log("route2 cases:", JSON.stringify((out.route2_personnel as { cases: unknown[] }).cases, null, 1));
  console.log("sessionMap:", JSON.stringify(out.route2_personnel.sessionMapProof, null, 1));
  console.log("guest otp:", JSON.stringify((out.route3_guest as { cases: { otpMechanism: unknown } }).cases.otpMechanism, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
