import type { PrismaClient } from "@prisma/client";

export function staleRunCutoff(
  staleAfterSeconds: number,
  now = new Date(),
) {
  return new Date(now.getTime() - staleAfterSeconds * 1_000);
}

export async function recoverStaleRuns(
  prisma: PrismaClient,
  staleAfterSeconds: number,
  now = new Date(),
) {
  const cutoff = staleRunCutoff(staleAfterSeconds, now);
  const candidates = await prisma.executionRun.findMany({
    where: {
      OR: [
        { status: "QUEUED", createdAt: { lt: cutoff } },
        {
          status: "RUNNING",
          OR: [
            { heartbeatAt: { lt: cutoff } },
            { heartbeatAt: null, startedAt: { lt: cutoff } },
          ],
        },
      ],
    },
    select: { id: true, status: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  const recoveredRunIds: string[] = [];
  const recoveredByStatus: Record<"QUEUED" | "RUNNING", number> = {
    QUEUED: 0,
    RUNNING: 0,
  };
  for (const candidate of candidates) {
    if (candidate.status !== "QUEUED" && candidate.status !== "RUNNING")
      continue;
    const status = candidate.status;
    const staleCondition =
      status === "QUEUED"
        ? { createdAt: { lt: cutoff } }
        : {
            OR: [
              { heartbeatAt: { lt: cutoff } },
              { heartbeatAt: null, startedAt: { lt: cutoff } },
            ],
          };
    const result = await prisma.executionRun.updateMany({
      where: { id: candidate.id, status, ...staleCondition },
      data: {
        status: "FAILED",
        finishedAt: now,
        error:
          status === "QUEUED"
            ? "Execution did not start before the recovery deadline"
            : "Worker heartbeat expired before execution completed",
      },
    });
    if (result.count === 1) {
      recoveredRunIds.push(candidate.id);
      recoveredByStatus[status] += 1;
    }
  }

  return {
    scannedRuns: candidates.length,
    recoveredRunIds,
    recoveredQueuedRuns: recoveredByStatus.QUEUED,
    recoveredRunningRuns: recoveredByStatus.RUNNING,
  };
}

export async function touchRunHeartbeat(
  prisma: PrismaClient,
  runId: string,
  heartbeatAt = new Date(),
) {
  return prisma.executionRun.updateMany({
    where: { id: runId, status: "RUNNING" },
    data: { heartbeatAt },
  });
}
