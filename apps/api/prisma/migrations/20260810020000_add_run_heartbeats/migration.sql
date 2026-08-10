ALTER TABLE "ExecutionRun" ADD COLUMN "heartbeatAt" TIMESTAMP(3);

CREATE INDEX "ExecutionRun_status_heartbeatAt_idx"
  ON "ExecutionRun"("status", "heartbeatAt");
CREATE INDEX "ExecutionRun_status_createdAt_idx"
  ON "ExecutionRun"("status", "createdAt");
