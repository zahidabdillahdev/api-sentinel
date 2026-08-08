import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticatedUserId, requireProjectRole } from '../lib/authorization.js';
import { notFound } from '../lib/errors.js';
import { assertSafeTarget } from '../lib/safe-url.js';

const projectParams = z.object({ projectId: z.string().cuid() });
const collectionParams = z.object({ collectionId: z.string().cuid() });
const collectionBody = z.object({ name: z.string().min(2).max(100) });
const requestBody = z.object({ name: z.string().min(2).max(100), method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']), url: z.string().url(), expectedStatus: z.number().int().min(100).max(599) });

async function collectionForUser(app: Parameters<FastifyPluginAsync>[0], userId: string, collectionId: string, role: 'VIEWER' | 'MEMBER' = 'VIEWER') {
  const collection = await app.prisma.collection.findUnique({ where: { id: collectionId }, include: { project: { select: { id: true } } } });
  if (!collection) throw notFound('Collection');
  await requireProjectRole(app, userId, collection.project.id, role);
  return collection;
}

export const collectionRoutes: FastifyPluginAsync = async (app) => {
  app.get('/projects/:projectId/collections', { preHandler: app.authenticate }, async (request) => {
    const { projectId } = projectParams.parse(request.params); await requireProjectRole(app, authenticatedUserId(request), projectId);
    return app.prisma.collection.findMany({ where: { projectId }, include: { requests: { include: { assertions: true } } }, orderBy: { createdAt: 'desc' } });
  });
  app.post('/projects/:projectId/collections', { preHandler: app.authenticate }, async (request, reply) => {
    const { projectId } = projectParams.parse(request.params); await requireProjectRole(app, authenticatedUserId(request), projectId, 'MEMBER');
    return reply.code(201).send(await app.prisma.collection.create({ data: { projectId, ...collectionBody.parse(request.body) } }));
  });
  app.post('/collections/:collectionId/requests', { preHandler: app.authenticate }, async (request, reply) => {
    const { collectionId } = collectionParams.parse(request.params); await collectionForUser(app, authenticatedUserId(request), collectionId, 'MEMBER'); const body = requestBody.parse(request.body); await assertSafeTarget(body.url);
    return reply.code(201).send(await app.prisma.testRequest.create({ data: { collectionId, name: body.name, method: body.method, url: body.url, assertions: { create: { expectedStatus: body.expectedStatus } } }, include: { assertions: true } }));
  });
  app.post('/collections/:collectionId/runs', { preHandler: app.authenticate }, async (request, reply) => {
    const { collectionId } = collectionParams.parse(request.params); await collectionForUser(app, authenticatedUserId(request), collectionId, 'MEMBER');
    const collection = await app.prisma.collection.findUnique({ where: { id: collectionId }, include: { requests: { include: { assertions: true } } } }); if (!collection) throw notFound('Collection');
    const results = await Promise.all(collection.requests.map(async (testRequest) => { const started = Date.now(); try { await assertSafeTarget(testRequest.url); const response = await fetch(testRequest.url, { method: testRequest.method, redirect: 'error', signal: AbortSignal.timeout(10_000) }); const passed = testRequest.assertions.every((assertion) => assertion.expectedStatus === response.status); return { testRequestId: testRequest.id, statusCode: response.status, durationMs: Date.now() - started, passed }; } catch (error) { return { testRequestId: testRequest.id, durationMs: Date.now() - started, passed: false, error: error instanceof Error ? error.message : 'Request failed' }; } }));
    const status = results.every((result) => result.passed) ? 'PASSED' : 'FAILED';
    return reply.code(201).send(await app.prisma.executionRun.create({ data: { collectionId, status, results: { create: results } }, include: { results: { include: { testRequest: { select: { name: true, method: true, url: true } } } } } }));
  });
};
