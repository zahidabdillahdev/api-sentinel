import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { hashSessionToken } from '../plugins/auth.js';

const credentialsSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(200)
});
const registerSchema = credentialsSchema.extend({ name: z.string().trim().min(1).max(100) });
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function publicUser(user: { id: string; email: string; name: string | null; createdAt: Date }) {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

async function createSession(app: Parameters<FastifyPluginAsync>[0], userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await app.prisma.session.create({ data: { userId, tokenHash: hashSessionToken(token), expiresAt } });
  return { token, expiresAt };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/register', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const existing = await app.prisma.user.findUnique({ where: { email: body.email } });
    if (existing?.passwordHash) throw new AppError('An account with this email already exists', 409, 'EMAIL_TAKEN');

    const passwordHash = await hashPassword(body.password);
    const user = existing
      ? await app.prisma.user.update({ where: { id: existing.id }, data: { name: body.name, passwordHash } })
      : await app.prisma.user.create({ data: { email: body.email, name: body.name, passwordHash } });
    const session = await createSession(app, user.id);
    return reply.code(201).send({ user: publicUser(user), ...session });
  });

  app.post('/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    const body = credentialsSchema.parse(request.body);
    const user = await app.prisma.user.findUnique({ where: { email: body.email } });
    if (!user?.passwordHash || !await verifyPassword(body.password, user.passwordHash)) {
      throw new AppError('Email or password is incorrect', 401, 'INVALID_CREDENTIALS');
    }
    const session = await createSession(app, user.id);
    return { user: publicUser(user), ...session };
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (request) => ({ user: request.auth!.user }));

  app.post('/auth/logout', { preHandler: app.authenticate }, async (request, reply) => {
    await app.prisma.session.delete({ where: { id: request.auth!.sessionId } });
    return reply.code(204).send();
  });
};
