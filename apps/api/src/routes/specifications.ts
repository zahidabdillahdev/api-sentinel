import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { diffOpenApi, validateOpenApi } from '../lib/openapi.js';
import { notFound } from '../lib/errors.js';

const importSchema = z.object({ name: z.string().min(1).max(150), document: z.unknown(), sourceUrl: z.string().url().optional() });

export const specificationRoutes: FastifyPluginAsync = async (app) => {
  app.get('/projects/:projectId/specifications', async (request) => {
    const { projectId } = z.object({ projectId: z.string().cuid() }).parse(request.params);
    return app.prisma.specification.findMany({ where: { projectId }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' } });
  });

  app.post('/projects/:projectId/specifications/imports', async (request, reply) => {
    const { projectId } = z.object({ projectId: z.string().cuid() }).parse(request.params);
    const body = importSchema.parse(request.body);
    const document = validateOpenApi(body.document);
    const project = await app.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw notFound('Project');
    const existing = await app.prisma.specification.findFirst({ where: { projectId, name: body.name }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
    const specification = existing ?? await app.prisma.specification.create({ data: { projectId, name: body.name } });
    const nextVersion = (existing?.versions[0]?.version ?? 0) + 1;
    const version = await app.prisma.specificationVersion.create({ data: { specificationId: specification.id, version: nextVersion, source: body.sourceUrl ? 'URL' : 'UPLOAD', sourceUrl: body.sourceUrl, document: document as object, title: document.info.title, apiVersion: document.info.version } });
    return reply.code(201).send(version);
  });

  app.get('/specifications/:specificationId/versions', async (request) => {
    const { specificationId } = z.object({ specificationId: z.string().cuid() }).parse(request.params);
    return app.prisma.specificationVersion.findMany({ where: { specificationId }, select: { id: true, version: true, title: true, apiVersion: true, createdAt: true, source: true }, orderBy: { version: 'desc' } });
  });

  app.get('/specifications/:specificationId/diff', async (request) => {
    const { specificationId } = z.object({ specificationId: z.string().cuid() }).parse(request.params);
    const { from, to } = z.object({ from: z.coerce.number().int().positive(), to: z.coerce.number().int().positive() }).parse(request.query);
    if (from === to) return { from, to, changes: [] };
    const versions = await app.prisma.specificationVersion.findMany({ where: { specificationId, version: { in: [from, to] } } });
    const before = versions.find((version) => version.version === from);
    const after = versions.find((version) => version.version === to);
    if (!before || !after) throw notFound('Specification version');
    const changes = diffOpenApi(validateOpenApi(before.document), validateOpenApi(after.document));
    return { from, to, summary: { breaking: changes.filter((change) => change.severity === 'BREAKING').length, total: changes.length }, changes };
  });
};
