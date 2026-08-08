ALTER TABLE "Collection" ADD COLUMN "environmentId" TEXT;
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
