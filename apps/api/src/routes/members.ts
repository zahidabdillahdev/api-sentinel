import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticatedUserId, requireOrganizationRole } from '../lib/authorization.js';
import { AppError } from '../lib/errors.js';
import { hashSessionToken } from '../plugins/auth.js';

const params = z.object({ organizationId: z.string().cuid() });
const inviteBody = z.object({ email: z.string().email().transform((v) => v.toLowerCase()), role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER') });

export const memberRoutes: FastifyPluginAsync = async (app) => {
  app.get('/organizations/:organizationId/members', { preHandler: app.authenticate }, async (request) => {
    const { organizationId } = params.parse(request.params);
    await requireOrganizationRole(app, authenticatedUserId(request), organizationId);
    return app.prisma.membership.findMany({ where: { organizationId }, select: { id: true, role: true, user: { select: { id: true, email: true, name: true } } } });
  });

  app.post('/organizations/:organizationId/invitations', { preHandler: app.authenticate }, async (request, reply) => {
    const { organizationId } = params.parse(request.params);
    const body = inviteBody.parse(request.body);
    const invitedById = authenticatedUserId(request);
    await requireOrganizationRole(app, invitedById, organizationId, 'ADMIN');
    const existing = await app.prisma.user.findUnique({ where: { email: body.email }, select: { id: true } });
    if (existing && await app.prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId: existing.id } } })) throw new AppError('This user is already a member', 409, 'ALREADY_A_MEMBER');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    const invitation = await app.prisma.invitation.upsert({ where: { organizationId_email: { organizationId, email: body.email } }, create: { organizationId, invitedById, email: body.email, role: body.role, tokenHash: hashSessionToken(token), expiresAt }, update: { invitedById, role: body.role, tokenHash: hashSessionToken(token), expiresAt, acceptedAt: null } });
    return reply.code(201).send({ id: invitation.id, email: invitation.email, role: invitation.role, expiresAt, token });
  });

  app.post('/invitations/:token/accept', { preHandler: app.authenticate }, async (request) => {
    const { token } = z.object({ token: z.string().min(20) }).parse(request.params);
    const user = request.auth!.user;
    const invitation = await app.prisma.invitation.findUnique({ where: { tokenHash: hashSessionToken(token) } });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) throw new AppError('The invitation is invalid or expired', 400, 'INVALID_INVITATION');
    if (invitation.email !== user.email) throw new AppError('This invitation belongs to another email', 403, 'INVITATION_EMAIL_MISMATCH');
    await app.prisma.$transaction([app.prisma.membership.upsert({ where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } }, create: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role }, update: { role: invitation.role } }), app.prisma.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } })]);
    return { organizationId: invitation.organizationId, role: invitation.role };
  });
};
