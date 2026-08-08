import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { buildApiReference, diffOpenApi, validateOpenApi } from '../lib/openapi.js';
import { notFound } from '../lib/errors.js';
import { authenticatedUserId, requireProjectRole, requireSpecificationRole } from '../lib/authorization.js';

const importSchema = z.object({ name: z.string().min(1).max(150), document: z.unknown(), sourceUrl: z.string().url().optional() });

export const specificationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/projects/:projectId/specifications', { preHandler: app.authenticate }, async (request) => {
    const { projectId } = z.object({ projectId: z.string().cuid() }).parse(request.params);
    await requireProjectRole(app, authenticatedUserId(request), projectId);
    return app.prisma.specification.findMany({ where: { projectId }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' } });
  });

  app.post('/projects/:projectId/specifications/imports', { preHandler: app.authenticate }, async (request, reply) => {
    const { projectId } = z.object({ projectId: z.string().cuid() }).parse(request.params);
    const body = importSchema.parse(request.body);
    const document = validateOpenApi(body.document);
    await requireProjectRole(app, authenticatedUserId(request), projectId, 'MEMBER');
    const existing = await app.prisma.specification.findFirst({ where: { projectId, name: body.name }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
    const specification = existing ?? await app.prisma.specification.create({ data: { projectId, name: body.name } });
    const nextVersion = (existing?.versions[0]?.version ?? 0) + 1;
    const version = await app.prisma.specificationVersion.create({ data: { specificationId: specification.id, version: nextVersion, source: body.sourceUrl ? 'URL' : 'UPLOAD', sourceUrl: body.sourceUrl, document: document as object, title: document.info.title, apiVersion: document.info.version } });
    return reply.code(201).send(version);
  });

  app.get('/specifications/:specificationId/versions', { preHandler: app.authenticate }, async (request) => {
    const { specificationId } = z.object({ specificationId: z.string().cuid() }).parse(request.params);
    await requireSpecificationRole(app, authenticatedUserId(request), specificationId);
    return app.prisma.specificationVersion.findMany({ where: { specificationId }, select: { id: true, version: true, title: true, apiVersion: true, createdAt: true, source: true }, orderBy: { version: 'desc' } });
  });

  app.get('/specifications/:specificationId/diff', { preHandler: app.authenticate }, async (request) => {
    const { specificationId } = z.object({ specificationId: z.string().cuid() }).parse(request.params);
    await requireSpecificationRole(app, authenticatedUserId(request), specificationId);
    const { from, to } = z.object({ from: z.coerce.number().int().positive(), to: z.coerce.number().int().positive() }).parse(request.query);
    if (from === to) return { from, to, changes: [] };
    const versions = await app.prisma.specificationVersion.findMany({ where: { specificationId, version: { in: [from, to] } } });
    const before = versions.find((version) => version.version === from);
    const after = versions.find((version) => version.version === to);
    if (!before || !after) throw notFound('Specification version');
    const changes = diffOpenApi(validateOpenApi(before.document), validateOpenApi(after.document));
    return { from, to, summary: { breaking: changes.filter((change) => change.severity === 'BREAKING').length, total: changes.length }, changes };
  });

  app.get('/specification-versions/:versionId/reference', { preHandler: app.authenticate }, async (request) => {
    const { versionId } = z.object({ versionId: z.string().cuid() }).parse(request.params);
    const version = await app.prisma.specificationVersion.findUnique({ where: { id: versionId }, include: { specification: { select: { projectId: true } } } });
    if (!version) throw notFound('Specification version');
    await requireProjectRole(app, authenticatedUserId(request), version.specification.projectId);
    return { id: version.id, version: version.version, ...buildApiReference(validateOpenApi(version.document)) };
  });
};
