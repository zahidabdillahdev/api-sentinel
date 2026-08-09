import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AppError, notFound } from "../lib/errors.js";
import { toSlug } from "../lib/slug.js";
import {
  authenticatedUserId,
  requireOrganizationRole,
  requireProjectRole,
} from "../lib/authorization.js";
import { encrypt } from "../lib/encryption.js";

const createOrganization = z.object({ name: z.string().min(2).max(100) });
const createProject = z.object({
  name: z.string().min(2).max(100),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(2)
    .max(64)
    .optional(),
});
const createEnvironment = z.object({
  name: z.string().trim().min(2).max(100),
  baseUrl: z.string().url(),
});
const createSecret = z.object({
  name: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .max(64)
    .refine((name) => name !== "baseUrl", "baseUrl is reserved"),
  value: z.string().min(1).max(10_000),
});

export const projectRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/organizations",
    { preHandler: app.authenticate },
    async (request) => {
      const userId = authenticatedUserId(request);
      return app.prisma.organization.findMany({
        where: { members: { some: { userId } } },
        include: {
          members: { where: { userId }, select: { role: true } },
          _count: { select: { projects: true, members: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    },
  );

  app.post(
    "/organizations",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const body = createOrganization.parse(request.body);
      const ownerId = authenticatedUserId(request);
      const slug = toSlug(body.name);
      const organization = await app.prisma.organization.create({
        data: {
          name: body.name,
          slug: `${slug}-${crypto.randomUUID().slice(0, 8)}`,
          members: { create: { userId: ownerId, role: "OWNER" } },
        },
      });
      return reply.code(201).send(organization);
    },
  );

  app.get(
    "/organizations/:organizationId/projects",
    { preHandler: app.authenticate },
    async (request) => {
      const { organizationId } = z
        .object({ organizationId: z.string().cuid() })
        .parse(request.params);
      await requireOrganizationRole(
        app,
        authenticatedUserId(request),
        organizationId,
      );
      return app.prisma.project.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
      });
    },
  );

  app.patch(
    "/environments/:environmentId",
    { preHandler: app.authenticate },
    async (request) => {
      const { environmentId } = z
        .object({ environmentId: z.string().cuid() })
        .parse(request.params);
      const environment = await app.prisma.environment.findUnique({
        where: { id: environmentId },
      });
      if (!environment) throw notFound("Environment");
      await requireProjectRole(
        app,
        authenticatedUserId(request),
        environment.projectId,
        "MEMBER",
      );
      const body = createEnvironment.parse(request.body);
      try {
        return await app.prisma.environment.update({
          where: { id: environmentId },
          data: body,
        });
      } catch (error: unknown) {
        if ((error as { code?: string }).code === "P2002")
          throw new AppError(
            "An environment with this name already exists",
            409,
            "ENVIRONMENT_NAME_TAKEN",
          );
        throw error;
      }
    },
  );

  app.post(
    "/organizations/:organizationId/projects",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { organizationId } = z
        .object({ organizationId: z.string().cuid() })
        .parse(request.params);
      const body = createProject.parse(request.body);
      const organization = await app.prisma.organization.findUnique({
        where: { id: organizationId },
      });
      if (!organization) throw notFound("Organization");
      await requireOrganizationRole(
        app,
        authenticatedUserId(request),
        organizationId,
        "ADMIN",
      );
      const slug = body.slug ?? toSlug(body.name);
      try {
        const project = await app.prisma.project.create({
          data: { organizationId, name: body.name, slug },
        });
        return reply.code(201).send(project);
      } catch (error: unknown) {
        if ((error as { code?: string }).code === "P2002")
          throw new AppError(
            "A project with this slug already exists",
            409,
            "PROJECT_SLUG_TAKEN",
          );
        throw error;
      }
    },
  );

  app.get(
    "/projects/:projectId/environments",
    { preHandler: app.authenticate },
    async (request) => {
      const { projectId } = z
        .object({ projectId: z.string().cuid() })
        .parse(request.params);
      await requireProjectRole(app, authenticatedUserId(request), projectId);
      return app.prisma.environment.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
      });
    },
  );

  app.post(
    "/projects/:projectId/environments",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { projectId } = z
        .object({ projectId: z.string().cuid() })
        .parse(request.params);
      await requireProjectRole(
        app,
        authenticatedUserId(request),
        projectId,
        "MEMBER",
      );
      const body = createEnvironment.parse(request.body);
      try {
        return reply.code(201).send(
          await app.prisma.environment.create({
            data: { projectId, ...body },
          }),
        );
      } catch (error: unknown) {
        if ((error as { code?: string }).code === "P2002")
          throw new AppError(
            "An environment with this name already exists",
            409,
            "ENVIRONMENT_NAME_TAKEN",
          );
        throw error;
      }
    },
  );

  app.post(
    "/environments/:environmentId/secrets",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { environmentId } = z
        .object({ environmentId: z.string().cuid() })
        .parse(request.params);
      const body = createSecret.parse(request.body);
      const environment = await app.prisma.environment.findUnique({
        where: { id: environmentId },
      });
      if (!environment) throw notFound("Environment");
      await requireProjectRole(
        app,
        authenticatedUserId(request),
        environment.projectId,
        "MEMBER",
      );
      const encrypted = encrypt(body.value);
      const secret = await app.prisma.environmentSecret.upsert({
        where: { environmentId_name: { environmentId, name: body.name } },
        create: { environmentId, name: body.name, ...encrypted },
        update: encrypted,
        select: { id: true, name: true, createdAt: true },
      });
      return reply.code(201).send(secret);
    },
  );

  app.get(
    "/environments/:environmentId/secrets",
    { preHandler: app.authenticate },
    async (request) => {
      const { environmentId } = z
        .object({ environmentId: z.string().cuid() })
        .parse(request.params);
      const environment = await app.prisma.environment.findUnique({
        where: { id: environmentId },
      });
      if (!environment) throw notFound("Environment");
      await requireProjectRole(
        app,
        authenticatedUserId(request),
        environment.projectId,
      );
      return app.prisma.environmentSecret.findMany({
        where: { environmentId },
        select: { id: true, name: true, createdAt: true },
        orderBy: { name: "asc" },
      });
    },
  );
};
