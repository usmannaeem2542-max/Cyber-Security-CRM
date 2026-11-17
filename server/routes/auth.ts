import express from 'express';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  type AuthenticatedRequest,
  type AuthPayload,
  type UserRole,
  clearAuthCookies,
  generateCsrfToken,
  hashPassword,
  requireAuth,
  requireRoles,
  sanitizeText,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  signTemp2FAToken,
  verifyPassword,
  verifyRefreshToken,
  verifyTemp2FAToken,
  writeAuditLog,
} from '../security.js';

const router = express.Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const verify2FALoginSchema = z.object({
  tempToken: z.string().min(10),
  code: z.string().length(6),
});

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(128),
  role: z.enum(['ADMIN', 'SALES_MANAGER', 'SALES_REP', 'MARKETING', 'READ_ONLY']),
  teamAccessGranted: z.boolean().optional().default(false),
  department: z.string().max(60).optional().default('Sales'),
  phone: z.string().max(40).optional(),
});

const updateUserSchema = z.object({
  role: z.enum(['ADMIN', 'SALES_MANAGER', 'SALES_REP', 'MARKETING', 'READ_ONLY']).optional(),
  teamAccessGranted: z.boolean().optional(),
  isActive: z.boolean().optional(),
  department: z.string().max(60).optional(),
});

function toAuthPayload(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  teamAccessGranted: boolean;
}): AuthPayload {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    teamAccessGranted: user.teamAccessGranted,
  };
}

router.post('/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email and password required' });
      return;
    }
    const email = parsed.data.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      await writeAuditLog({
        userEmail: email,
        action: 'LOGIN_FAILED',
        entityType: 'Auth',
        details: 'Unknown or inactive user login attempt',
        ipAddress: req.ip,
      });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) {
      await writeAuditLog({
        userEmail: email,
        userRole: user.role,
        action: 'LOGIN_FAILED',
        entityType: 'Auth',
        details: 'Incorrect password',
        ipAddress: req.ip,
      });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const tempToken = signTemp2FAToken(user.id);
      res.json({ requires2FA: true, tempToken });
      return;
    }

    const payload = toAuthPayload(user);
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    const csrfToken = generateCsrfToken();

    setAuthCookies(res, refreshToken, csrfToken);
    await writeAuditLog({
      user: payload,
      action: 'LOGIN',
      entityType: 'Auth',
      entityId: user.id,
      details: 'Successful password login',
      ipAddress: req.ip,
    });

    res.json({
      requires2FA: false,
      accessToken,
      csrfToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        teamAccessGranted: user.teamAccessGranted,
        department: user.department,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/2fa/verify-login', async (req, res) => {
  try {
    const parsed = verify2FALoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid 6-digit TOTP code required' });
      return;
    }
    const decoded = verifyTemp2FAToken(parsed.data.tempToken);
    if (decoded.purpose !== '2fa_pending') {
      res.status(401).json({ error: 'Invalid 2FA session' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.isActive || !user.twoFactorSecret) {
      res.status(401).json({ error: '2FA verification unavailable' });
      return;
    }

    const isValid = authenticator.verify({
      token: parsed.data.code,
      secret: user.twoFactorSecret,
    });
    if (!isValid) {
      await writeAuditLog({
        userEmail: user.email,
        userRole: user.role,
        action: 'LOGIN_2FA_FAILED',
        entityType: 'Auth',
        entityId: user.id,
        ipAddress: req.ip,
      });
      res.status(401).json({ error: 'Invalid authenticator code' });
      return;
    }

    const payload = toAuthPayload(user);
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    const csrfToken = generateCsrfToken();

    setAuthCookies(res, refreshToken, csrfToken);
    await writeAuditLog({
      user: payload,
      action: 'LOGIN',
      entityType: 'Auth',
      entityId: user.id,
      details: 'Successful 2FA login',
      ipAddress: req.ip,
    });

    res.json({
      accessToken,
      csrfToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        teamAccessGranted: user.teamAccessGranted,
        department: user.department,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch {
    res.status(401).json({ error: '2FA session expired or invalid' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) {
      res.status(401).json({ error: 'No refresh token' });
      return;
    }
    const decoded = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.isActive) {
      clearAuthCookies(res);
      res.status(401).json({ error: 'User inactive or not found' });
      return;
    }

    const payload = toAuthPayload(user);
    const accessToken = signAccessToken(payload);
    const newRefresh = signRefreshToken(payload);
    const csrfToken = req.cookies?.csrf_token || generateCsrfToken();
    setAuthCookies(res, newRefresh, csrfToken);

    res.json({
      accessToken,
      csrfToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        teamAccessGranted: user.teamAccessGranted,
        department: user.department,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    });
  } catch {
    clearAuthCookies(res);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

router.post('/logout', (req: AuthenticatedRequest, res) => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      teamAccessGranted: true,
      department: true,
      phone: true,
      twoFactorEnabled: true,
      createdAt: true,
    },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
});

router.post('/2fa/setup', requireAuth, async (req: AuthenticatedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(
    user.email,
    process.env.COMPANY_NAME || 'SentinelShield Cyber CRM',
    secret
  );
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: secret },
  });

  res.json({ secret, qrDataUrl });
});

router.post('/2fa/enable', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ code: z.string().length(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: '6-digit code required' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user || !user.twoFactorSecret) {
    res.status(400).json({ error: 'Initiate 2FA setup first' });
    return;
  }
  const valid = authenticator.verify({
    token: parsed.data.code,
    secret: user.twoFactorSecret,
  });
  if (!valid) {
    res.status(400).json({ error: 'Invalid verification code' });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true },
  });
  await writeAuditLog({
    user: req.user,
    action: '2FA_UPDATE',
    entityType: 'User',
    entityId: user.id,
    details: 'Enabled TOTP 2FA',
    ipAddress: req.ip,
  });
  res.json({ twoFactorEnabled: true });
});

router.post('/2fa/disable', requireAuth, async (req: AuthenticatedRequest, res) => {
  await prisma.user.update({
    where: { id: req.user!.userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });
  await writeAuditLog({
    user: req.user,
    action: '2FA_UPDATE',
    entityType: 'User',
    entityId: req.user!.userId,
    details: 'Disabled TOTP 2FA',
    ipAddress: req.ip,
  });
  res.json({ twoFactorEnabled: false });
});

// Directory of active users for assignment dropdowns
router.get('/users/directory', requireAuth, async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      teamAccessGranted: true,
    },
    orderBy: { name: 'asc' },
  });
  res.json({ users });
});

// Admin user management
router.get('/users', requireAuth, requireRoles('ADMIN', 'SALES_MANAGER'), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      teamAccessGranted: true,
      department: true,
      phone: true,
      twoFactorEnabled: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  res.json({ users });
});

router.post('/users', requireAuth, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid user payload', details: parsed.error.flatten() });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }
  const passwordHash = await hashPassword(parsed.data.password);
  const created = await prisma.user.create({
    data: {
      email,
      name: sanitizeText(parsed.data.name),
      passwordHash,
      role: parsed.data.role,
      teamAccessGranted: parsed.data.teamAccessGranted,
      department: sanitizeText(parsed.data.department),
      phone: parsed.data.phone ? sanitizeText(parsed.data.phone) : null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      teamAccessGranted: true,
      department: true,
      isActive: true,
      twoFactorEnabled: true,
      createdAt: true,
    },
  });
  await writeAuditLog({
    user: req.user,
    action: 'CREATE',
    entityType: 'User',
    entityId: created.id,
    details: `Created user ${created.email} with role ${created.role}`,
    ipAddress: req.ip,
  });
  res.status(201).json({ user: created });
});

router.patch(
  '/users/:id',
  requireAuth,
  requireRoles('ADMIN', 'SALES_MANAGER'),
  async (req: AuthenticatedRequest, res) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid update payload' });
      return;
    }
    const targetId = String(req.params.id);
    // Only ADMIN can change role or isActive; SALES_MANAGER can toggle teamAccessGranted for reps
    if (req.user!.role === 'SALES_MANAGER' && (parsed.data.role || parsed.data.isActive !== undefined)) {
      res.status(403).json({ error: 'Only Admins can change roles or account activation' });
      return;
    }
    const updated = await prisma.user.update({
      where: { id: targetId },
      data: parsed.data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        teamAccessGranted: true,
        department: true,
        isActive: true,
        twoFactorEnabled: true,
      },
    });
    await writeAuditLog({
      user: req.user,
      action: 'ROLE_CHANGE',
      entityType: 'User',
      entityId: updated.id,
      details: JSON.stringify(parsed.data),
      ipAddress: req.ip,
    });
    res.json({ user: updated });
  }
);

export default router;
