CREATE TABLE "Environment" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseUrl" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Environment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Environment_projectId_name_key" ON "Environment"("projectId", "name");
ALTER TABLE "Environment" ADD CONSTRAINT "Environment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestRequest" ADD COLUMN "headers" JSONB;
ALTER TABLE "TestRequest" ADD COLUMN "body" TEXT;
