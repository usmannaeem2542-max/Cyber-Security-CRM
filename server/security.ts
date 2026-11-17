import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';

export type UserRole = 'ADMIN' | 'SALES_MANAGER' | 'SALES_REP' | 'MARKETING' | 'READ_ONLY';

export interface AuthPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  teamAccessGranted: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

const ACCESS_SECRET =
  process.env.JWT_SECRET || 'dev-only-access-secret-replace-in-production-env';
const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'dev-only-refresh-secret-replace-in-production-env';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(payload: AuthPayload): string {
  return jwt.sign({ userId: payload.userId }, REFRESH_SECRET, { expiresIn: '7d' });
}

export function signTemp2FAToken(userId: string): string {
  return jwt.sign({ userId, purpose: '2fa_pending' }, ACCESS_SECRET, { expiresIn: '5m' });
}

export function verifyAccessToken(token: string): AuthPayload {
  return jwt.verify(token, ACCESS_SECRET) as AuthPayload;
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, REFRESH_SECRET) as { userId: string };
}

export function verifyTemp2FAToken(token: string): { userId: string; purpose: string } {
  return jwt.verify(token, ACCESS_SECRET) as { userId: string; purpose: string };
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function sanitizeText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))
    .trim();
}

export function setAuthCookies(res: Response, refreshToken: string, csrfToken: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  res.cookie('csrf_token', csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('refresh_token', { path: '/' });
  res.clearCookie('csrf_token', { path: '/' });
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

export function requireCsrf(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }
  const exemptPaths = [
    '/auth/login',
    '/auth/refresh',
    '/auth/logout',
    '/auth/2fa/verify-login',
  ];
  if (exemptPaths.includes(req.path) || exemptPaths.some((p) => req.originalUrl.startsWith(`/api${p}`))) {
    next();
    return;
  }
  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.headers['x-csrf-token'];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: 'CSRF validation failed' });
    return;
  }
  next();
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this action' });
      return;
    }
    next();
  };
}

export function canMutate(user: AuthPayload): boolean {
  return user.role !== 'READ_ONLY';
}

export function buildOwnerScope(user: AuthPayload): { ownerId?: string } {
  if (user.role === 'SALES_REP' && !user.teamAccessGranted) {
    return { ownerId: user.userId };
  }
  return {};
}

export function canAccessRecord(user: AuthPayload, ownerId: string): boolean {
  if (user.role === 'SALES_REP' && !user.teamAccessGranted) {
    return ownerId === user.userId;
  }
  return true;
}

export function canViewSensitiveFields(user: AuthPayload, ownerId: string): boolean {
  if (user.role === 'ADMIN' || user.role === 'SALES_MANAGER') return true;
  if (user.role === 'SALES_REP' && ownerId === user.userId) return true;
  return false;
}

export function redactAccount<T extends { ownerId: string; vulnerabilityNotes: string }>(
  account: T,
  user: AuthPayload,
  reveal = false
): T & { sensitiveRedacted: boolean } {
  const allowed = canViewSensitiveFields(user, account.ownerId);
  if (!allowed || !reveal) {
    return {
      ...account,
      vulnerabilityNotes: account.vulnerabilityNotes
        ? allowed
          ? '•••••••• (Click Reveal Sensitive Data to view & log access)'
          : '[REDACTED — Clearance Required]'
        : '',
      sensitiveRedacted: !allowed || !reveal,
    };
  }
  return { ...account, sensitiveRedacted: false };
}

export function redactDeal<T extends { ownerId: string; internalMargin: number | null }>(
  deal: T,
  user: AuthPayload
): T & { marginRedacted: boolean } {
  const allowed = canViewSensitiveFields(user, deal.ownerId);
  if (!allowed) {
    return { ...deal, internalMargin: null, marginRedacted: true };
  }
  return { ...deal, marginRedacted: false };
}

export function redactFinancialDoc<
  T extends { ownerId: string; sensitiveTerms: string | null }
>(doc: T, user: AuthPayload): T & { termsRedacted: boolean } {
  const allowed = canViewSensitiveFields(user, doc.ownerId);
  if (!allowed) {
    return {
      ...doc,
      sensitiveTerms: doc.sensitiveTerms ? '[REDACTED — Clearance Required]' : null,
      termsRedacted: true,
    };
  }
  return { ...doc, termsRedacted: false };
}

export async function writeAuditLog(params: {
  user?: AuthPayload | null;
  userEmail?: string;
  userRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.user?.userId ?? null,
        userEmail: params.user?.email ?? params.userEmail ?? 'system',
        userRole: params.user?.role ?? params.userRole ?? 'SYSTEM',
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        details: params.details ?? null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (err) {
    console.error('AuditLog write error:', err);
  }
}

export function computeLeadScore(lead: {
  companySize: string;
  industry: string;
  estimatedBudget: number;
  currency: string;
  engagementScore: number;
}): number {
  let score = 0;
  // Company size (0-30)
  const sizePoints: Record<string, number> = {
    GOVERNMENT: 30,
    ENTERPRISE: 28,
    MID_MARKET: 20,
    SMB: 12,
  };
  score += sizePoints[lead.companySize] ?? 15;

  // High-regulation industry bonus (0-25)
  const highReg = ['Banking & Finance', 'Healthcare', 'Government', 'Energy & Utilities', 'Fintech'];
  score += highReg.includes(lead.industry) ? 25 : 15;

  // Budget weight normalized to AED (0-25)
  const budgetAed = lead.currency === 'USD' ? lead.estimatedBudget * 3.6725 : lead.estimatedBudget;
  if (budgetAed >= 300000) score += 25;
  else if (budgetAed >= 150000) score += 20;
  else if (budgetAed >= 60000) score += 14;
  else if (budgetAed > 0) score += 8;

  // Engagement (0-20)
  score += Math.round(Math.min(100, Math.max(0, lead.engagementScore)) * 0.2);

  return Math.min(100, Math.max(0, score));
}
