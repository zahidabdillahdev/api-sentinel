import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  authenticatedUserId,
  requireProjectRole,
} from "../lib/authorization.js";
import { summarizeRuns } from "../lib/metrics.js";

const projectParams = z.object({ projectId: z.string().cuid() });

export const overviewRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/projects/:projectId/overview",
    { preHandler: app.authenticate },
    async (request) => {
      const { projectId } = projectParams.parse(request.params);
      await requireProjectRole(
        app,
        authenticatedUserId(request),
        projectId,
      );
      const since = new Date(Date.now() - 24 * 60 * 60 * 1_000);
      const runWhere = {
        collection: { projectId },
        createdAt: { gte: since },
      } as const;
      const [
        collections,
        requests,
        activeSchedules,
        runGroups,
        duration,
        recentRuns,
      ] = await Promise.all([
        app.prisma.collection.count({ where: { projectId } }),
        app.prisma.testRequest.count({
          where: { collection: { projectId } },
        }),
        app.prisma.schedule.count({
          where: { enabled: true, collection: { projectId } },
        }),
        app.prisma.executionRun.groupBy({
          by: ["status"],
          where: runWhere,
          _count: { _all: true },
        }),
        app.prisma.requestResult.aggregate({
          where: { executionRun: runWhere },
          _avg: { durationMs: true },
        }),
        app.prisma.executionRun.findMany({
          where: { collection: { projectId } },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            createdAt: true,
            finishedAt: true,
            collection: { select: { id: true, name: true } },
            _count: { select: { results: true } },
          },
        }),
      ]);
      return {
        counts: { collections, requests, activeSchedules },
        last24Hours: {
          ...summarizeRuns(runGroups),
          averageRequestDurationMs:
            duration._avg.durationMs === null
              ? null
              : Math.round(duration._avg.durationMs),
        },
        recentRuns,
        generatedAt: new Date().toISOString(),
      };
    },
  );
};
