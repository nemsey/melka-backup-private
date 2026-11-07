-- AlterTable
ALTER TABLE "PropertyRecord" ADD COLUMN "fieldChanges" TEXT;
ALTER TABLE "PropertyRecord" ADD COLUMN "lastModifiedAt" DATETIME;
ALTER TABLE "PropertyRecord" ADD COLUMN "lastModifiedBy" TEXT;
ALTER TABLE "PropertyRecord" ADD COLUMN "lastSyncedAt" DATETIME;
ALTER TABLE "PropertyRecord" ADD COLUMN "lastSyncedValue" TEXT;

-- AlterTable
ALTER TABLE "RequestRecord" ADD COLUMN "fieldChanges" TEXT;
ALTER TABLE "RequestRecord" ADD COLUMN "lastModifiedAt" DATETIME;
ALTER TABLE "RequestRecord" ADD COLUMN "lastModifiedBy" TEXT;
ALTER TABLE "RequestRecord" ADD COLUMN "lastSyncedAt" DATETIME;
ALTER TABLE "RequestRecord" ADD COLUMN "lastSyncedValue" TEXT;

-- CreateIndex
CREATE INDEX "PropertyRecord_lastSyncedAt_idx" ON "PropertyRecord"("lastSyncedAt");

-- CreateIndex
CREATE INDEX "PropertyRecord_lastModifiedAt_idx" ON "PropertyRecord"("lastModifiedAt");

-- CreateIndex
CREATE INDEX "RequestRecord_lastSyncedAt_idx" ON "RequestRecord"("lastSyncedAt");

-- CreateIndex
CREATE INDEX "RequestRecord_lastModifiedAt_idx" ON "RequestRecord"("lastModifiedAt");

