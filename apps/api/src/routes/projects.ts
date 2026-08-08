import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError, notFound } from '../lib/errors.js';
import { toSlug } from '../lib/slug.js';
import { authenticatedUserId, requireOrganizationRole } from '../lib/authorization.js';

const createOrganization = z.object({ name: z.string().min(2).max(100) });
const createProject = z.object({ name: z.string().min(2).max(100), slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(64).optional() });

export const projectRoutes: FastifyPluginAsync = async (app) => {
  app.get('/organizations', { preHandler: app.authenticate }, async (request) => {
    const userId = authenticatedUserId(request);
    return app.prisma.organization.findMany({
      where: { members: { some: { userId } } },
      include: { members: { where: { userId }, select: { role: true } }, _count: { select: { projects: true, members: true } } },
      orderBy: { createdAt: 'desc' }
    });
  });

  app.post('/organizations', { preHandler: app.authenticate }, async (request, reply) => {
    const body = createOrganization.parse(request.body);
    const ownerId = authenticatedUserId(request);
    const slug = toSlug(body.name);
    const organization = await app.prisma.organization.create({ data: { name: body.name, slug: `${slug}-${crypto.randomUUID().slice(0, 8)}`, members: { create: { userId: ownerId, role: 'OWNER' } } } });
    return reply.code(201).send(organization);
  });

  app.get('/organizations/:organizationId/projects', { preHandler: app.authenticate }, async (request) => {
    const { organizationId } = z.object({ organizationId: z.string().cuid() }).parse(request.params);
    await requireOrganizationRole(app, authenticatedUserId(request), organizationId);
    return app.prisma.project.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
  });

  app.post('/organizations/:organizationId/projects', { preHandler: app.authenticate }, async (request, reply) => {
    const { organizationId } = z.object({ organizationId: z.string().cuid() }).parse(request.params);
    const body = createProject.parse(request.body);
    const organization = await app.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) throw notFound('Organization');
    await requireOrganizationRole(app, authenticatedUserId(request), organizationId, 'ADMIN');
    const slug = body.slug ?? toSlug(body.name);
    try {
      const project = await app.prisma.project.create({ data: { organizationId, name: body.name, slug } });
      return reply.code(201).send(project);
    } catch (error: unknown) {
      if ((error as { code?: string }).code === 'P2002') throw new AppError('A project with this slug already exists', 409, 'PROJECT_SLUG_TAKEN');
      throw error;
    }
  });
};
