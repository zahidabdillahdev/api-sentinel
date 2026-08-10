import { Prisma, type PrismaClient } from "@prisma/client";

export class ActiveRunQuotaExceededError extends Error {
  constructor(public readonly limit: number) {
    super(`Organization already has ${limit} active collection runs`);
    this.name = "ActiveRunQuotaExceededError";
  }
}

export function assertActiveRunQuota(
  activeRuns: number,
  limit: number,
) {
  if (activeRuns >= limit) throw new ActiveRunQuotaExceededError(limit);
}

export async function createQueuedRunWithinQuota(
  prisma: PrismaClient,
  input: {
    collectionId: string;
    scheduleId?: string;
    maxActiveRuns: number;
  },
) {
  return prisma.$transaction(async (transaction) => {
    const collection = await transaction.collection.findUnique({
      where: { id: input.collectionId },
      select: { project: { select: { organizationId: true } } },
    });
    if (!collection) throw new Error("Collection was not found");

    const organizationId = collection.project.organizationId;
    const lockKey = `api-sentinel:active-runs:${organizationId}`;
    await transaction.$queryRaw<Array<{ locked: boolean }>>(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0)) IS NULL AS locked`,
    );

    const activeRuns = await transaction.executionRun.count({
      where: {
        status: { in: ["QUEUED", "RUNNING"] },
        collection: { project: { organizationId } },
      },
    });
    assertActiveRunQuota(activeRuns, input.maxActiveRuns);

    return transaction.executionRun.create({
      data: {
        collectionId: input.collectionId,
        scheduleId: input.scheduleId,
        status: "QUEUED",
      },
    });
  });
}
