/**
 * همگام‌سازی داده CRM از سامانه ملک تبریز به پایگاه محلی
 * ------------------------------------------------------
 * استراتژی: «استخراج و کش» — داده‌های خام یک بار از Provider
 * (Mock یا Real) کشیده و در Prisma ذخیره می‌شوند؛ تحلیل‌های ایجنت
 * و فیلترهای سنگین روی پایگاه محلی اجرا می‌شوند تا عملکرد بالا و
 * بار کم روی سامانه اصلی حفظ شود. دکمه «ریست اتصال» قابلیت
 * پاک‌سازی و همگام‌سازی مجدد دارد.
 */

import { db } from "@/lib/db";
import { getMelkProvider } from "./provider";
import type { CrmExpert, CrmTransaction } from "./types";

/** در صورت خالی‌بودن کش، داده‌های CRM را بارگذاری می‌کند */
export async function ensureSeeded(): Promise<{ transactions: number; experts: number }> {
  const [txCount, exCount] = await Promise.all([
    db.transactionRecord.count(),
    db.expertRecord.count(),
  ]);

  if (txCount === 0 || exCount === 0) {
    return resyncAll();
  }
  return { transactions: txCount, experts: exCount };
}

/** پاک‌سازی کامل کش و استخراج مجدد از سامانه ملک تبریز */
export async function resyncAll(): Promise<{ transactions: number; experts: number }> {
  const provider = getMelkProvider();
  const token = "internal-sync"; // توکن داخلی همگام‌سازی

  const [txPage, exPage] = await Promise.all([
    provider.listTransactions(token, { limit: 5000, offset: 0 }),
    provider.listExperts(token, { limit: 500, offset: 0 }),
  ]);

  await db.$transaction([
    db.transactionRecord.deleteMany({}),
    db.expertRecord.deleteMany({}),
    ...toTxCreates(txPage.rows),
    ...toExCreates(exPage.rows),
  ]);

  return { transactions: txPage.total, experts: exPage.total };
}

function toTxCreates(rows: CrmTransaction[]) {
  return rows.map((t) =>
    db.transactionRecord.create({
      data: {
        id: t.id,
        dealDate: new Date(t.dealDate),
        listingCode: t.listingCode,
        requestCode: t.requestCode,
        expertCode: t.expertCode,
        expertName: t.expertName,
        price: t.price,
        district: t.district,
        propertyType: t.propertyType,
        area: t.area,
        commission: t.commission,
      },
    })
  );
}

function toExCreates(rows: CrmExpert[]) {
  return rows.map((e) =>
    db.expertRecord.create({
      data: {
        id: e.id,
        personnelCode: e.personnelCode,
        fullName: e.fullName,
        mobile: e.mobile,
        address: e.address,
        branch: e.branch,
        active: e.active,
        joinedAt: new Date(e.joinedAt),
      },
    })
  );
}

/** ریست کامل داده (فراخوانی از دکمه ریست اتصال در تنظیمات) */
export async function resetCrmCache(): Promise<{ transactions: number; experts: number }> {
  return resyncAll();
}
