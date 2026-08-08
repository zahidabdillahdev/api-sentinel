import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', { schema: { tags: ['system'], response: { 200: { type: 'object', properties: { status: { type: 'string' }, timestamp: { type: 'string' } } } } } }, async () => {
    await app.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
};
