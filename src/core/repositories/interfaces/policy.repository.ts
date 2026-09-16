/**
 * PolicyRepository — قرارداد دسترسی به نسخه‌های سیاست ایجنت
 * ------------------------------------------------------
 * دامنه: AgentPolicyVersion (نسخه قبلی هرگز حذف نمی‌شود — قابلیت Rollback).
 * مصرف‌کننده‌ها: BaseLearningAgent (تمام ایجنت‌ها).
 *
 * نکته: تراکنش «غیرفعال‌سازی نسخه‌های فعال + فعال‌سازی نسخه هدف»
 * (پیشتر db.$transaction در base-agent) به همین لایه منتقل شده است —
 * تنها جایی که $transaction مجاز است.
 */
import type { AgentPolicyVersionDTO, PolicyVersionInput } from "./dto";

export interface PolicyRepository {
  /** نسخه فعال یک کاشی (null اگر هنوز نسخه‌ای فعال نیست) */
  findActive(tileId: string): Promise<AgentPolicyVersionDTO | null>;
  /** آخرین (بیشترین) نسخه یک کاشی — برای محاسبه نسخه بعدی */
  findLatest(tileId: string): Promise<AgentPolicyVersionDTO | null>;
  /** نسخه مشخص یک کاشی (برای Rollback) */
  findByTileAndVersion(tileId: string, version: number): Promise<AgentPolicyVersionDTO | null>;
  /** همه نسخه‌های یک کاشی — مرتب بر اساس version نزولی */
  listVersions(tileId: string): Promise<AgentPolicyVersionDTO[]>;
  /** ایجاد نسخه جدید (بدون تغییر وضعیت فعال‌بودن نسخه‌های دیگر) */
  createVersion(input: PolicyVersionInput): Promise<AgentPolicyVersionDTO>;
  /**
   * فعال‌سازی اتمیک یک نسخه: تمام نسخه‌های فعال کاشی غیرفعال و
   * نسخه هدف با activatedAt فعال می‌شوند (عین $transaction قبلی).
   */
  activateVersion(tileId: string, versionId: string, activatedAt: Date): Promise<void>;
  /** شمارش نسخه‌های یک کاشی */
  countVersions(tileId: string): Promise<number>;
}
