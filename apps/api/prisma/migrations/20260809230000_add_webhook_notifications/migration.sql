CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('DELIVERED', 'FAILED');

CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "endpointOrigin" TEXT NOT NULL,
    "endpointCiphertext" TEXT NOT NULL,
    "endpointIv" TEXT NOT NULL,
    "endpointAuthTag" TEXT NOT NULL,
    "signingSecretCiphertext" TEXT,
    "signingSecretIv" TEXT,
    "signingSecretAuthTag" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "notificationRuleId" TEXT NOT NULL,
    "executionRunId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL,
    "responseStatus" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotificationRule_collectionId_name_key" ON "NotificationRule"("collectionId", "name");
CREATE UNIQUE INDEX "WebhookDelivery_notificationRuleId_executionRunId_attempt_key" ON "WebhookDelivery"("notificationRuleId", "executionRunId", "attempt");
CREATE INDEX "WebhookDelivery_executionRunId_idx" ON "WebhookDelivery"("executionRunId");

ALTER TABLE "NotificationRule" ADD CONSTRAINT "NotificationRule_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_notificationRuleId_fkey" FOREIGN KEY ("notificationRuleId") REFERENCES "NotificationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_executionRunId_fkey" FOREIGN KEY ("executionRunId") REFERENCES "ExecutionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
