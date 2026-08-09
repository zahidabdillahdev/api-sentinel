import type { Prisma, PrismaClient } from "@prisma/client";

export async function recordAuditEvent(
  prisma: PrismaClient,
  event: {
    projectId: string;
    actorUserId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return prisma.auditEvent.create({ data: event });
}
