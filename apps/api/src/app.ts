import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { config } from './config.js';
import { AppError } from './lib/errors.js';
import prismaPlugin from './plugins/prisma.js';
import authPlugin from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { projectRoutes } from './routes/projects.js';
import { specificationRoutes } from './routes/specifications.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: config.LOG_LEVEL }, requestIdHeader: 'x-request-id' });
  await app.register(cors, { origin: config.APP_ORIGIN, credentials: true });
  await app.register(swagger, { openapi: { info: { title: 'API Sentinel API', version: '0.1.0' } } });
  await app.register(swaggerUi, { routePrefix: '/documentation' });
  await app.register(prismaPlugin);
  await app.register(authPlugin);
  await app.register(healthRoutes, { prefix: '/v1' });
  await app.register(authRoutes, { prefix: '/v1' });
  await app.register(projectRoutes, { prefix: '/v1' });
  await app.register(specificationRoutes, { prefix: '/v1' });
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.flatten() } });
    if (error instanceof AppError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details } });
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } });
  });
  return app;
}
