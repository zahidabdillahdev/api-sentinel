import { createHash } from 'node:crypto';
import fp from 'fastify-plugin';
import type { preHandlerHookHandler } from 'fastify';
import { AppError } from '../lib/errors.js';

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
};

declare module 'fastify' {
  interface FastifyRequest {
    auth: { sessionId: string; user: AuthenticatedUser } | null;
  }

  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
  }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export default fp(async (app) => {
  app.decorateRequest('auth', null);
  app.decorate('authenticate', async (request) => {
    const authorization = request.headers.authorization;
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new AppError('Authentication is required', 401, 'UNAUTHENTICATED');
    }

    const session = await app.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: { select: { id: true, email: true, name: true } } }
    });

    if (!session || session.expiresAt <= new Date()) {
      if (session) await app.prisma.session.delete({ where: { id: session.id } });
      throw new AppError('The session is invalid or expired', 401, 'INVALID_SESSION');
    }

    request.auth = { sessionId: session.id, user: session.user };
  });
});
