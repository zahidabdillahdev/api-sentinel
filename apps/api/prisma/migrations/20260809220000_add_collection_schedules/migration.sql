CREATE TABLE "Schedule" (
  "id" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "cron" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Schedule_collectionId_name_key" ON "Schedule"("collectionId", "name");
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExecutionRun" ADD COLUMN "scheduleId" TEXT;
ALTER TABLE "ExecutionRun" ADD CONSTRAINT "ExecutionRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ExecutionRun_active_schedule_key" ON "ExecutionRun"("scheduleId") WHERE "scheduleId" IS NOT NULL AND "status" IN ('QUEUED', 'RUNNING');
