-- DIR-SUPER-STRUCT-001 (بخش الف + ج) — برچسب اتمی سینک + ضربان قلب رله
-- افزودنی-تنها (additive-only): دو ستون برچسب + یک ستون ضربان + دو ایندکس.
-- اعمال رسمی پروژه از مسیر prisma db push است (سنت db push، بدون migrations table)؛
-- این SQL شاهد ممیزی است. پُرانکردن (backfill) برچسب وضعیت موجود در همین فایل است.

-- AlterTable — برچسب اتمی وضعیت سینک هر رکورد (P0_DONE | P1_DONE | ALL_DONE)
ALTER TABLE "PropertyRecord" ADD COLUMN "syncStage" TEXT;
ALTER TABLE "RequestRecord" ADD COLUMN "syncStage" TEXT;

-- Backfill — وضعیت موجود رکوردها از حقیقت زندهٔ extractionBatchId:
--   غنی‌سازی انجام شده = ALL_DONE · فقط لایهٔ فهرست = P0_DONE
UPDATE "PropertyRecord" SET "syncStage" = CASE WHEN "extractionBatchId" IS NOT NULL THEN 'ALL_DONE' ELSE 'P0_DONE' END WHERE "syncStage" IS NULL;
UPDATE "RequestRecord" SET "syncStage" = CASE WHEN "extractionBatchId" IS NOT NULL THEN 'ALL_DONE' ELSE 'P0_DONE' END WHERE "syncStage" IS NULL;

-- AlterTable — ضربان قلب watchDog ترموکس (هر ۳۰ث · سه ضربان غایب = هشدار قطعی)
ALTER TABLE "RelayDevice" ADD COLUMN "lastHeartbeatAt" DATETIME;

-- CreateIndex — پرس‌وجوی سبک پوشش برچسب و گیت آبشاری
CREATE INDEX "PropertyRecord_syncStage_idx" ON "PropertyRecord"("syncStage");
CREATE INDEX "RequestRecord_syncStage_idx" ON "RequestRecord"("syncStage");
