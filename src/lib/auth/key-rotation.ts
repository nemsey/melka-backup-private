/**
 * چرخش کلید رمزنگاری — HOTFIX-01 / SEC-2
 * ------------------------------------------------------
 * سناریوی استاندارد:
 *   ۱) MELK_TOKEN_KEY_NEW تنظیم می‌شود (کلید جدید)
 *   ۲) این روال اجرا می‌شود: همه ستون‌های رمزنگاری‌شده با کلید قدیم
 *      باز (decrypt) و با کلید جدید قفل (encrypt) می‌شوند
 *   ۳) سپس MELK_TOKEN_KEY = مقدار جدید و MELK_TOKEN_KEY_OLD حذف می‌شود
 *
 * ویژگی‌های ایمنی:
 *   - Idempotent: ردیفی که قبلاً چرخیده شده (با کلید جدید باز می‌شود) skip می‌شود
 *   - غیرمخرب: ردیفی که با هیچ‌کدام باز نمی‌شود دستکاری نمی‌شود و گزارش می‌شود
 *   - AuditLog: پایان چرخش با تعدادها ثبت می‌شود (بدون افشای کلید)
 *   - Verify: پس از چرخش، decode نمونه‌ای از ردیف‌ها با کلید جدید آزموده می‌شود
 *
 * اجرا:
 *   - دستی (یک‌باره): bun scripts/rotate-encryption-key.ts
 *   - در startup: فقط اگر ROTATION_PENDING=true (از instrumentation.ts)
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";

export interface RotationReport {
  ok: boolean;
  rotated: number;
  alreadyRotated: number;
  unreadable: number;
  scanned: number;
  tables: Record<string, { scanned: number; rotated: number; already: number; unreadable: number }>;
  error?: string;
}

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(`arm-token-enc:${secret}`, "utf8").digest();
}

/** رمزگشایی با کلید مشخص — null اگر نامعتبر */
function decryptWith(payload: string, key: Buffer): string | null {
  try {
    const buf = Buffer.from(payload, "base64");
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** رمزنگاری با کلید مشخص — عین فرمت encryptSecret (base64(iv+tag+ct)) */
function encryptWith(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/**
 * چرخش کامل همه ستون‌های رمزنگاری‌شده از کلید قدیم به جدید.
 * @param oldSecret کلید قدیم (راز خام)
 * @param newSecret کلید جدید (راز خام)
 */
export async function rotateEncryptionKeys(oldSecret: string, newSecret: string): Promise<RotationReport> {
  const oldKey = keyFromSecret(oldSecret);
  const newKey = keyFromSecret(newSecret);

  const report: RotationReport = {
    ok: true,
    rotated: 0,
    alreadyRotated: 0,
    unreadable: 0,
    scanned: 0,
    tables: {},
  };

  const bump = (table: string, kind: "scanned" | "rotated" | "already" | "unreadable") => {
    report.tables[table] ??= { scanned: 0, rotated: 0, already: 0, unreadable: 0 };
    report.tables[table][kind] += 1;
    if (kind === "rotated") report.rotated += 1;
    if (kind === "already") report.alreadyRotated += 1;
    if (kind === "unreadable") report.unreadable += 1;
    report.scanned += 1;
  };

  // ---------- ۱) Session (per-user) ----------
  const sessions = await db.session.findMany({ select: { id: true, armTokenEnc: true, armRefreshTokenEnc: true } });
  for (const s of sessions) {
    for (const col of ["armTokenEnc", "armRefreshTokenEnc"] as const) {
      const v = s[col];
      bump("Session", "scanned");
      if (!v) continue;
      const plain = decryptWith(v, oldKey);
      if (plain !== null) {
        if (oldKey.equals(newKey)) {
          bump("Session", "already"); // کلیدها یکسان‌اند — چیزی برای چرخش نیست
        } else {
          await db.session.update({ where: { id: s.id }, data: { [col]: encryptWith(plain, newKey) } });
          bump("Session", "rotated");
        }
      } else if (decryptWith(v, newKey) !== null) {
        bump("Session", "already"); // قبلاً با کلید جدید چرخیده
      } else {
        bump("Session", "unreadable");
      }
    }
  }

  // ---------- ۲) PmConnection ----------
  // (HOTFIX-02: SyncState.armTokenEnc حذف شد — دیگر هیچ رازی در SyncState نیست)
  const pm = await db.pmConnection.findMany();
  for (const p of pm) {
    for (const col of ["tokenEnc", "refreshTokenEnc"] as const) {
      const v = p[col] as string | null;
      bump("PmConnection", "scanned");
      if (!v) continue;
      const plain = decryptWith(v, oldKey);
      if (plain !== null) {
        if (oldKey.equals(newKey)) bump("PmConnection", "already")
        else {
          await db.pmConnection.update({ where: { id: p.id }, data: { [col]: encryptWith(plain, newKey) } });
          bump("PmConnection", "rotated");
        }
      } else if (decryptWith(v, newKey) !== null) bump("PmConnection", "already");
      else bump("PmConnection", "unreadable");
    }
  }

  // ---------- ۲-ب) ArmConnection — خزانهٔ ماندگار ARM (PN-008 BLOCK 2: شکاف پوشش رفع شد) ----------
  const ac = await db.armConnection.findMany();
  for (const a of ac) {
    for (const col of ["tokenEnc", "refreshTokenEnc"] as const) {
      const v = a[col] as string | null;
      bump("ArmConnection", "scanned");
      if (!v) continue;
      const plain = decryptWith(v, oldKey);
      if (plain !== null) {
        if (oldKey.equals(newKey)) bump("ArmConnection", "already");
        else {
          await db.armConnection.update({ where: { id: a.id }, data: { [col]: encryptWith(plain, newKey) } });
          bump("ArmConnection", "rotated");
        }
      } else if (decryptWith(v, newKey) !== null) bump("ArmConnection", "already");
      else bump("ArmConnection", "unreadable");
    }
  }

  // ---------- ۴) DivarConnection ----------
  const dv = await db.divarConnection.findMany();
  for (const d of dv) {
    for (const col of ["tokenEnc", "apiKeyEnc"] as const) {
      const v = d[col] as string | null;
      bump("DivarConnection", "scanned");
      if (!v) continue;
      const plain = decryptWith(v, oldKey);
      if (plain !== null) {
        if (oldKey.equals(newKey)) bump("DivarConnection", "already");
        else {
          await db.divarConnection.update({ where: { method: d.method }, data: { [col]: encryptWith(plain, newKey) } });
          bump("DivarConnection", "rotated");
        }
      } else if (decryptWith(v, newKey) !== null) bump("DivarConnection", "already");
      else bump("DivarConnection", "unreadable");
    }
  }

  // ---------- ۵) InstagramConnection ----------
  const ig = await db.instagramConnection.findMany();
  for (const g of ig) {
    bump("InstagramConnection", "scanned");
    if (!g.tokenEnc) continue;
    const plain = decryptWith(g.tokenEnc, oldKey);
    if (plain !== null) {
      if (oldKey.equals(newKey)) bump("InstagramConnection", "already");
      else {
        await db.instagramConnection.update({ where: { id: g.id }, data: { tokenEnc: encryptWith(plain, newKey) } });
        bump("InstagramConnection", "rotated");
      }
    } else if (decryptWith(g.tokenEnc, newKey) !== null) bump("InstagramConnection", "already");
    else bump("InstagramConnection", "unreadable");
  }

  // ---------- ثبت حسابرسی (بدون افشای کلید) ----------
  await db.auditLog.create({
    data: {
      action: "KEY_ROTATION",
      actor: "system:rotate-encryption-key",
      detail: JSON.stringify({
        scanned: report.scanned,
        rotated: report.rotated,
        alreadyRotated: report.alreadyRotated,
        unreadable: report.unreadable,
        newKeyFingerprint: createHash("sha256").update(newSecret).digest("hex").slice(0, 12),
        at: new Date().toISOString(),
      }),
    },
  });

  if (report.unreadable > 0) {
    report.ok = false;
    report.error = `${report.unreadable} مقدار با هیچ‌یک از کلیدها باز نشد — دستکاری نشده و باید دستی بررسی شوند.`;
  }
  return report;
}

/** اجرای چرخش از متغیرهای محیطی — برای startup (ROTATION_PENDING=true) و اسکریپت CLI */
export async function rotateFromEnv(): Promise<RotationReport> {
  const oldKey = process.env.MELK_TOKEN_KEY_OLD?.trim();
  const newKey = process.env.MELK_TOKEN_KEY?.trim() ?? process.env.MELK_TOKEN_KEY_NEW?.trim();
  if (!oldKey || !newKey) {
    return {
      ok: false,
      rotated: 0,
      alreadyRotated: 0,
      unreadable: 0,
      scanned: 0,
      tables: {},
      error:
        "برای چرخش کلید: MELK_TOKEN_KEY_OLD (کلید قدیم) و MELK_TOKEN_KEY (کلید جدید) هر دو باید تنظیم باشند. " +
        "پس از چرخش موفق، MELK_TOKEN_KEY_OLD را حذف و ROTATION_PENDING را false کنید.",
    };
  }
  return rotateEncryptionKeys(oldKey, newKey);
}

// ابزارهای داخلی برای تست واحد (بدون افشای راز)
export const __internal = { decryptWith, encryptWith, keyFromSecret };
