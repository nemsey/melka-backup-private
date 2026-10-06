/**
 * صندوقچهٔ ماندگار توکن‌های ARM — P6.5-11 (بند ث)
 * ------------------------------------------------------
 * مشکل مالک: «در هر بار ورود به اپلیکیشن، پروسهٔ اتصال به PM و ARM باید
 * در تنظیمات عمومی تجدید شود» — علت ریشه‌ای: توکن ARM فقط در رکورد نشست
 * ذخیره می‌شد و با خروج/انقضای نشست (revokeSession) پاک می‌شد.
 *
 * راه‌حل — «اتصال ماندگار»:
 *   · ArmConnection (DB): توکن‌های ARM رمزنگاری‌شدهٔ AES-256-GCM، فراتر از
 *     چرخهٔ عمر نشست — با کلید بازیابی: «master» برای ورود کد مستر مالک،
 *     یا کد پرسنلی برای ورود OTP مشاوران.
 *   · در هر ورود (createSession): اگر نشست تازه توکن ARM نداشته باشد،
 *     به‌طور خودکار از صندوقچه بازیابی می‌شود — بدون پیامک، بدون کلیک.
 *   · تمدید توکن (refreshArmToken / execWithArmToken): توکن تازه هم‌زمان
 *     در نشست و صندوقچه نوشته می‌شود تا زنجیرهٔ ماندگاری هرگز نشکند.
 *
 * SEC-3 (عین HOTFIX-02): بازیابی فقط برای «همان هویت» —
 *   · نشست OWNER (کد مستر مالک) ⇒ جدیدترین رکورد متصل (تک‌مستأجری مالک)
 *   · نشست مشاور (کد پرسنلی X) ⇒ فقط رکورد خودِ X
 * هیچ توکنی بین هویت‌های مختلف رد و بدل نمی‌شود.
 */

import { getIntegrationRepository } from "@/core/repositories";
import type { ArmTokens, UserRole } from "@/lib/melk-api/types";
import { decryptSecret, encryptSecret } from "./crypto";
import type { ArmConnectionDTO } from "@/core/repositories";

/** کلید صندوقچه برای یک نشست: مالک ⇒ master؛ مشاور ⇒ کد پرسنلی خودش */
export function vaultKeyForSession(personnelCode: string, role: UserRole): string {
  return role === "OWNER" ? "master" : personnelCode;
}

function rowToTokens(row: ArmConnectionDTO | null): ArmTokens | null {
  if (!row) return null;
  const accessToken = decryptSecret(row.tokenEnc);
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken: decryptSecret(row.refreshTokenEnc) ?? "",
    userType: row.userType ?? undefined,
  };
}

/**
 * ذخیرهٔ توکن‌های ARM در صندوقچه (upsert با کلید بازیابی).
 * فراخوانی: اتصال ARM از تنظیمات، ورود OTP، و تمدید خودکار توکن.
 */
export async function persistArmTokensToVault(input: {
  ownerKey: string;
  armTokens: ArmTokens;
  personnelCode?: string | null;
  displayName?: string | null;
}): Promise<void> {
  await getIntegrationRepository().upsertArmConnection({
    ownerKey: input.ownerKey,
    personnelCode: input.personnelCode ?? input.ownerKey,
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    userType: input.armTokens.userType ?? null,
    tokenEnc: encryptSecret(input.armTokens.accessToken),
    refreshTokenEnc: input.armTokens.refreshToken ? encryptSecret(input.armTokens.refreshToken) : null,
    status: "connected",
    lastRefreshedAt: new Date(),
    lastError: null,
  });
}

/**
 * بازیابی توکن‌های ARM از صندوقچه برای یک نشست تازه:
 *   · مالک (کد مستر) ⇒ فقط رکورد کلید «master» (همان کلیدی که همهٔ مسیرهای
 *     اتصال مالک — تنظیمات یا OTP با MANAGER_CODE — در آن می‌نویسند؛
 *     هرگز رکورد مشاوران دیگر خوانده نمی‌شود — SEC-3)
 *   · مشاور ⇒ فقط رکورد با کلید کد پرسنلی خودش
 * خروجی null = هیچ اتصال ماندگاری برای این هویت نیست.
 */
export async function restoreArmTokensFromVault(personnelCode: string, role: UserRole): Promise<ArmTokens | null> {
  const repo = getIntegrationRepository();
  const key = vaultKeyForSession(personnelCode, role);
  const row = await repo.getArmConnection(key);
  const tokens = rowToTokens(row);
  if (tokens && row) {
    // شاهد بازیابی (بدون لمس توکن‌ها) — برای شفافیت وضعیت
    await repo
      .upsertArmConnection({ ownerKey: row.ownerKey, lastRestoredAt: new Date() })
      .catch(() => undefined);
  }
  return tokens;
}

/** وضعیت صندوقچه برای نمایش در تنظیمات (بدون افشای توکن) */
export async function getArmVaultStatus(personnelCode: string, role: UserRole): Promise<{
  exists: boolean;
  status: string | null;
  displayName: string | null;
  personnelCode: string | null;
  lastRefreshedAt: string | null;
  lastRestoredAt: string | null;
}> {
  const repo = getIntegrationRepository();
  const key = vaultKeyForSession(personnelCode, role);
  const row = await repo.getArmConnection(key);
  return {
    exists: Boolean(row?.tokenEnc),
    status: row?.status ?? null,
    displayName: row?.displayName ?? null,
    personnelCode: row?.personnelCode ?? null,
    lastRefreshedAt: row?.lastRefreshedAt?.toISOString() ?? null,
    lastRestoredAt: row?.lastRestoredAt?.toISOString() ?? null,
  };
}
