import type { PrismaClient } from "@prisma/client";

export function retentionCutoff(retentionDays: number, now = new Date()) {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1_000);
}

export async function cleanupExpiredRuns(prisma: PrismaClient) {
  const projects = await prisma.project.findMany({
    select: { id: true, retentionDays: true },
  });
  let deletedRuns = 0;
  for (const project of projects) {
    const result = await prisma.executionRun.deleteMany({
      where: {
        collection: { projectId: project.id },
        status: { in: ["PASSED", "FAILED"] },
        finishedAt: { lt: retentionCutoff(project.retentionDays) },
      },
    });
    deletedRuns += result.count;
  }
  return { projects: projects.length, deletedRuns };
}
