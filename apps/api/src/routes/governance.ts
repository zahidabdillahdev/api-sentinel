import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  authenticatedUserId,
  requireProjectRole,
} from "../lib/authorization.js";
import { recordAuditEvent } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";

const projectParams = z.object({ projectId: z.string().cuid() });
const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().cuid().optional(),
});
const retentionBody = z.object({
  retentionDays: z.union([
    z.literal(7),
    z.literal(30),
    z.literal(90),
    z.literal(180),
    z.literal(365),
  ]),
});

export const governanceRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/projects/:projectId/governance",
    { preHandler: app.authenticate },
    async (request) => {
      const { projectId } = projectParams.parse(request.params);
      const { limit, cursor } = auditQuery.parse(request.query);
      const project = await requireProjectRole(
        app,
        authenticatedUserId(request),
        projectId,
      );
      if (
        cursor &&
        !(await app.prisma.auditEvent.findFirst({
          where: { id: cursor, projectId },
          select: { id: true },
        }))
      )
        throw new AppError("Invalid audit cursor", 400, "INVALID_AUDIT_CURSOR");
      const events = await app.prisma.auditEvent.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          metadata: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
        },
      });
      return {
        retentionDays: project.retentionDays,
        events,
        nextCursor: events.length === limit ? events.at(-1)?.id ?? null : null,
      };
    },
  );

  app.patch(
    "/projects/:projectId/retention",
    { preHandler: app.authenticate },
    async (request) => {
      const { projectId } = projectParams.parse(request.params);
      const actorUserId = authenticatedUserId(request);
      const project = await requireProjectRole(
        app,
        actorUserId,
        projectId,
        "ADMIN",
      );
      const { retentionDays } = retentionBody.parse(request.body);
      const updated = await app.prisma.project.update({
        where: { id: projectId },
        data: { retentionDays },
        select: { id: true, retentionDays: true },
      });
      await recordAuditEvent(app.prisma, {
        projectId,
        actorUserId,
        action: "project.retention.updated",
        targetType: "project",
        targetId: projectId,
        metadata: { previousDays: project.retentionDays, retentionDays },
      });
      return updated;
    },
  );
};
