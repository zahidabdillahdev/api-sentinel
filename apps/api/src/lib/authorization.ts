import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ProjectRole } from '@prisma/client';
import { AppError, notFound } from './errors.js';

const roleRank: Record<ProjectRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3
};

export function authenticatedUserId(request: FastifyRequest): string {
  if (!request.auth) throw new AppError('Authentication is required', 401, 'UNAUTHENTICATED');
  return request.auth.user.id;
}

export async function requireOrganizationRole(
  app: FastifyInstance,
  userId: string,
  organizationId: string,
  minimumRole: ProjectRole = 'VIEWER'
) {
  const membership = await app.prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } }
  });
  if (!membership || roleRank[membership.role] < roleRank[minimumRole]) {
    throw new AppError('You do not have access to this organization', 403, 'FORBIDDEN');
  }
  return membership;
}

export async function requireProjectRole(
  app: FastifyInstance,
  userId: string,
  projectId: string,
  minimumRole: ProjectRole = 'VIEWER'
) {
  const project = await app.prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound('Project');
  await requireOrganizationRole(app, userId, project.organizationId, minimumRole);
  return project;
}

export async function requireSpecificationRole(
  app: FastifyInstance,
  userId: string,
  specificationId: string,
  minimumRole: ProjectRole = 'VIEWER'
) {
  const specification = await app.prisma.specification.findUnique({
    where: { id: specificationId },
    include: { project: { select: { organizationId: true } } }
  });
  if (!specification) throw notFound('Specification');
  await requireOrganizationRole(app, userId, specification.project.organizationId, minimumRole);
  return specification;
}
