-- PN-081 (دستور مالک ۱۴۰۵/۰۸/۲۰) — رفع گرهٔ کدهای غیرمنطبقهٔ فهرست معاملات
-- افزودنی-تنها: ۶ ستون + ۱ ایندکس روی TransactionEnrichment
-- هدف: تماس مالک/درخواست‌دهندهٔ معامله‌هایی که کد ملک/درخواستشان در
-- رجیستری آگهی/درخواست محلی نیست (خارج از properties/list و requests/list آرم)
-- از مسیر مستقیم ARM رفع و در همین جدول ذخیره می‌شود.

-- AlterTable
ALTER TABLE "TransactionEnrichment" ADD COLUMN "linkOwnerName" TEXT;
ALTER TABLE "TransactionEnrichment" ADD COLUMN "linkOwnerMobile" TEXT;
ALTER TABLE "TransactionEnrichment" ADD COLUMN "linkRequesterName" TEXT;
ALTER TABLE "TransactionEnrichment" ADD COLUMN "linkRequesterMobile" TEXT;
ALTER TABLE "TransactionEnrichment" ADD COLUMN "linkStatus" TEXT;
ALTER TABLE "TransactionEnrichment" ADD COLUMN "linkResolvedAt" DATETIME;

-- CreateIndex
CREATE INDEX "TransactionEnrichment_linkResolvedAt_idx" ON "TransactionEnrichment"("linkResolvedAt");
