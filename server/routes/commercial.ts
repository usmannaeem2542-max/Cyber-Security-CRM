import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  type AuthenticatedRequest,
  buildOwnerScope,
  canAccessRecord,
  canMutate,
  canViewSensitiveFields,
  redactFinancialDoc,
  requireAuth,
  requireRoles,
  sanitizeText,
  writeAuditLog,
} from '../security.js';

const router = express.Router();
router.use(requireAuth);

// ================= SERVICES CATALOG =================
const serviceSchema = z.object({
  code: z.string().min(2).max(30),
  name: z.string().min(2).max(140),
  category: z.enum(['OFFENSIVE_SECURITY', 'MANAGED_SOC', 'COMPLIANCE', 'AWARENESS', 'MANAGED_IT']),
  description: z.string().min(2).max(1500),
  unitType: z.enum(['PER_ASSET', 'PER_IP', 'PER_USER', 'PER_DAY', 'FIXED_RETAINER']),
  unitPriceAED: z.number().min(0),
  unitPriceUSD: z.number().min(0),
  deliverables: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

router.get('/services', async (_req, res) => {
  const services = await prisma.serviceCatalogItem.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  res.json({ services });
});

router.post(
  '/services',
  requireRoles('ADMIN', 'SALES_MANAGER'),
  async (req: AuthenticatedRequest, res) => {
    const parsed = serviceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid service payload', details: parsed.error.flatten() });
      return;
    }
    const d = parsed.data;
    const service = await prisma.serviceCatalogItem.create({
      data: {
        code: sanitizeText(d.code).toUpperCase(),
        name: sanitizeText(d.name),
        category: d.category,
        description: sanitizeText(d.description),
        unitType: d.unitType,
        unitPriceAED: d.unitPriceAED,
        unitPriceUSD: d.unitPriceUSD,
        deliverables: JSON.stringify(d.deliverables.map(sanitizeText)),
        isActive: d.isActive,
      },
    });
    await writeAuditLog({
      user: req.user,
      action: 'CREATE',
      entityType: 'ServiceCatalogItem',
      entityId: service.id,
      details: `Created catalog service ${service.code} - ${service.name}`,
      ipAddress: req.ip,
    });
    res.status(201).json({ service });
  }
);

router.patch(
  '/services/:id',
  requireRoles('ADMIN', 'SALES_MANAGER'),
  async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const parsed = serviceSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid service update' });
      return;
    }
    const d = parsed.data;
    const service = await prisma.serviceCatalogItem.update({
      where: { id },
      data: {
        ...(d.code !== undefined && { code: sanitizeText(d.code).toUpperCase() }),
        ...(d.name !== undefined && { name: sanitizeText(d.name) }),
        ...(d.category !== undefined && { category: d.category }),
        ...(d.description !== undefined && { description: sanitizeText(d.description) }),
        ...(d.unitType !== undefined && { unitType: d.unitType }),
        ...(d.unitPriceAED !== undefined && { unitPriceAED: d.unitPriceAED }),
        ...(d.unitPriceUSD !== undefined && { unitPriceUSD: d.unitPriceUSD }),
        ...(d.deliverables !== undefined && {
          deliverables: JSON.stringify(d.deliverables.map(sanitizeText)),
        }),
        ...(d.isActive !== undefined && { isActive: d.isActive }),
      },
    });
    res.json({ service });
  }
);

// ================= QUOTES & PROPOSALS =================
const quoteItemSchema = z.object({
  serviceId: z.string().optional().nullable(),
  description: z.string().min(1).max(300),
  unitType: z.string().min(1),
  quantity: z.number().min(0.1),
  unitPrice: z.number().min(0),
});

const quoteSchema = z.object({
  title: z.string().min(1).max(160),
  dealId: z.string().min(1),
  accountId: z.string().min(1),
  currency: z.enum(['AED', 'USD']).default('AED'),
  discountPercent: z.number().min(0).max(100).default(0),
  taxPercent: z.number().min(0).max(30).default(5),
  validUntil: z.string().min(1),
  terms: z.string().max(2000).optional().nullable(),
  sensitiveTerms: z.string().max(1000).optional().nullable(),
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED']).default('DRAFT'),
  items: z.array(quoteItemSchema).min(1),
});

function calculateTotals(
  items: Array<{ quantity: number; unitPrice: number }>,
  discountPercent: number,
  taxPercent: number
) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const discounted = subtotal * (1 - discountPercent / 100);
  const total = discounted * (1 + taxPercent / 100);
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

router.get('/quotes', async (req: AuthenticatedRequest, res) => {
  const scope = buildOwnerScope(req.user!);
  const quotes = await prisma.quote.findMany({
    where: scope,
    include: {
      account: { select: { id: true, name: true, country: true } },
      deal: { select: { id: true, title: true, stage: true } },
      owner: { select: { id: true, name: true, email: true } },
      items: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ quotes: quotes.map((q) => redactFinancialDoc(q, req.user!)) });
});

router.post('/quotes', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot create quotes' });
    return;
  }
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const { subtotal, total } = calculateTotals(d.items, d.discountPercent, d.taxPercent);
  const quoteNumber = `QT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const quote = await prisma.quote.create({
    data: {
      quoteNumber,
      title: sanitizeText(d.title),
      status: d.status,
      currency: d.currency,
      discountPercent: d.discountPercent,
      taxPercent: d.taxPercent,
      subtotal,
      total,
      validUntil: new Date(d.validUntil),
      terms: d.terms ? sanitizeText(d.terms) : null,
      sensitiveTerms: d.sensitiveTerms ? sanitizeText(d.sensitiveTerms) : null,
      sentAt: d.status === 'SENT' ? new Date() : null,
      dealId: d.dealId,
      accountId: d.accountId,
      ownerId: req.user!.userId,
      items: {
        create: d.items.map((item) => ({
          serviceId: item.serviceId || null,
          description: sanitizeText(item.description),
          unitType: item.unitType,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: Math.round(item.quantity * item.unitPrice * 100) / 100,
        })),
      },
    },
    include: {
      account: { select: { id: true, name: true, country: true } },
      deal: { select: { id: true, title: true, stage: true } },
      owner: { select: { id: true, name: true, email: true } },
      items: true,
    },
  });

  // Follow-up automation if created directly as SENT
  if (d.status === 'SENT') {
    const due = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await prisma.activity.create({
      data: {
        type: 'TASK',
        subject: `Follow up on Proposal ${quote.quoteNumber} (${quote.title})`,
        description: 'Automated 3-day follow-up after proposal was sent to client.',
        dueDate: due,
        priority: 'HIGH',
        autoGenerated: true,
        dealId: quote.dealId,
        accountId: quote.accountId,
        ownerId: req.user!.userId,
      },
    });
  }

  await writeAuditLog({
    user: req.user,
    action: 'CREATE',
    entityType: 'Quote',
    entityId: quote.id,
    details: `Created quote ${quote.quoteNumber} (${quote.currency} ${quote.total})`,
    ipAddress: req.ip,
  });

  res.status(201).json({ quote: redactFinancialDoc(quote, req.user!) });
});

router.patch('/quotes/:id/status', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot update quote status' });
    return;
  }
  const id = String(req.params.id);
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Quote not found' });
    return;
  }
  if (!canAccessRecord(req.user!, existing.ownerId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const schema = z.object({ status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const nextStatus = parsed.data.status;
  const becomingSent = nextStatus === 'SENT' && existing.status !== 'SENT';

  const quote = await prisma.quote.update({
    where: { id },
    data: {
      status: nextStatus,
      ...(becomingSent && { sentAt: new Date() }),
    },
    include: {
      account: { select: { id: true, name: true, country: true } },
      deal: { select: { id: true, title: true, stage: true } },
      owner: { select: { id: true, name: true, email: true } },
      items: true,
    },
  });

  let autoTaskCreated = false;
  if (becomingSent) {
    const due = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await prisma.activity.create({
      data: {
        type: 'TASK',
        subject: `Follow up on Proposal ${quote.quoteNumber} (${quote.title})`,
        description: 'Automated 3-day follow-up task created when proposal status changed to Sent.',
        dueDate: due,
        priority: 'HIGH',
        autoGenerated: true,
        dealId: quote.dealId,
        accountId: quote.accountId,
        ownerId: quote.ownerId,
      },
    });
    autoTaskCreated = true;
  }

  await writeAuditLog({
    user: req.user,
    action: 'UPDATE',
    entityType: 'Quote',
    entityId: quote.id,
    details: `Quote ${quote.quoteNumber} status changed to ${nextStatus}`,
    ipAddress: req.ip,
  });

  res.json({ quote: redactFinancialDoc(quote, req.user!), autoTaskCreated });
});

router.delete('/quotes/:id', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot delete quotes' });
    return;
  }
  const id = String(req.params.id);
  const existing = await prisma.quote.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Quote not found' });
    return;
  }
  if (!canAccessRecord(req.user!, existing.ownerId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  await prisma.quote.delete({ where: { id } });
  res.json({ ok: true });
});

// ================= CONTRACTS & RENEWALS =================
const contractSchema = z.object({
  title: z.string().min(1).max(160),
  accountId: z.string().min(1),
  dealId: z.string().optional().nullable(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  autoRenew: z.boolean().default(true),
  renewalNoticeDays: z.number().int().min(15).max(180).default(60),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONE_TIME']).default('ANNUAL'),
  mrr: z.number().min(0).default(0),
  arr: z.number().min(0).default(0),
  totalValue: z.number().min(0),
  currency: z.enum(['AED', 'USD']).default('AED'),
  status: z.enum(['ACTIVE', 'EXPIRING_SOON', 'RENEWED', 'EXPIRED']).default('ACTIVE'),
  sensitiveTerms: z.string().max(1500).optional().nullable(),
});

router.get('/contracts', async (req: AuthenticatedRequest, res) => {
  const scope = buildOwnerScope(req.user!);
  const contracts = await prisma.contract.findMany({
    where: scope,
    include: {
      account: { select: { id: true, name: true, industry: true } },
      deal: { select: { id: true, title: true } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: { endDate: 'asc' },
  });
  res.json({ contracts: contracts.map((c) => redactFinancialDoc(c, req.user!)) });
});

router.post('/contracts', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot create contracts' });
    return;
  }
  const parsed = contractSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid contract payload', details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const contractNumber = `CTR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const mrr = d.mrr > 0 ? d.mrr : d.billingCycle === 'ONE_TIME' ? 0 : Math.round((d.totalValue / 12) * 100) / 100;
  const arr = d.arr > 0 ? d.arr : d.billingCycle === 'ONE_TIME' ? 0 : Math.round(mrr * 12 * 100) / 100;

  const contract = await prisma.contract.create({
    data: {
      contractNumber,
      title: sanitizeText(d.title),
      accountId: d.accountId,
      dealId: d.dealId || null,
      ownerId: req.user!.userId,
      startDate: new Date(d.startDate),
      endDate: new Date(d.endDate),
      autoRenew: d.autoRenew,
      renewalNoticeDays: d.renewalNoticeDays,
      billingCycle: d.billingCycle,
      mrr,
      arr,
      totalValue: d.totalValue,
      currency: d.currency,
      status: d.status,
      sensitiveTerms: d.sensitiveTerms ? sanitizeText(d.sensitiveTerms) : null,
    },
    include: {
      account: { select: { id: true, name: true, industry: true } },
      owner: { select: { id: true, name: true } },
    },
  });

  await writeAuditLog({
    user: req.user,
    action: 'CREATE',
    entityType: 'Contract',
    entityId: contract.id,
    details: `Created contract ${contract.contractNumber}`,
    ipAddress: req.ip,
  });
  res.status(201).json({ contract: redactFinancialDoc(contract, req.user!) });
});

router.patch('/contracts/:id', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot update contracts' });
    return;
  }
  const id = String(req.params.id);
  const existing = await prisma.contract.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Contract not found' });
    return;
  }
  if (!canAccessRecord(req.user!, existing.ownerId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  const parsed = contractSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid contract update' });
    return;
  }
  const d = parsed.data;
  const updated = await prisma.contract.update({
    where: { id },
    data: {
      ...(d.title !== undefined && { title: sanitizeText(d.title) }),
      ...(d.status !== undefined && { status: d.status }),
      ...(d.autoRenew !== undefined && { autoRenew: d.autoRenew }),
      ...(d.endDate !== undefined && { endDate: new Date(d.endDate) }),
      ...(d.sensitiveTerms !== undefined &&
        canViewSensitiveFields(req.user!, existing.ownerId) && {
          sensitiveTerms: d.sensitiveTerms ? sanitizeText(d.sensitiveTerms) : null,
        }),
    },
    include: {
      account: { select: { id: true, name: true, industry: true } },
      owner: { select: { id: true, name: true } },
    },
  });
  res.json({ contract: redactFinancialDoc(updated, req.user!) });
});

// ================= ENGAGEMENTS / DELIVERY PROJECTS =================
const engagementSchema = z.object({
  title: z.string().min(1).max(160),
  dealId: z.string().optional().nullable(),
  accountId: z.string().min(1),
  scope: z.string().min(2).max(2000),
  assignedConsultants: z.array(z.string()).default([]),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  status: z.enum(['KICKOFF', 'IN_PROGRESS', 'REPORTING', 'DELIVERED', 'COMPLETED']).default('KICKOFF'),
  reportDelivered: z.boolean().default(false),
  notes: z.string().max(2000).optional().nullable(),
});

router.get('/engagements', async (_req, res) => {
  const engagements = await prisma.engagement.findMany({
    include: {
      account: { select: { id: true, name: true, industry: true } },
      deal: { select: { id: true, title: true, value: true, currency: true } },
    },
    orderBy: { startDate: 'desc' },
  });
  res.json({ engagements });
});

router.post('/engagements', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot create engagements' });
    return;
  }
  const parsed = engagementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid engagement payload', details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const engagement = await prisma.engagement.create({
    data: {
      title: sanitizeText(d.title),
      dealId: d.dealId || null,
      accountId: d.accountId,
      scope: sanitizeText(d.scope),
      assignedConsultants: JSON.stringify(d.assignedConsultants.map(sanitizeText)),
      startDate: new Date(d.startDate),
      endDate: new Date(d.endDate),
      status: d.status,
      reportDelivered: d.reportDelivered,
      reportDeliveredAt: d.reportDelivered ? new Date() : null,
      notes: d.notes ? sanitizeText(d.notes) : null,
    },
    include: {
      account: { select: { id: true, name: true, industry: true } },
      deal: { select: { id: true, title: true, value: true, currency: true } },
    },
  });
  await writeAuditLog({
    user: req.user,
    action: 'CREATE',
    entityType: 'Engagement',
    entityId: engagement.id,
    details: `Created delivery engagement ${engagement.title}`,
    ipAddress: req.ip,
  });
  res.status(201).json({ engagement });
});

router.patch('/engagements/:id', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot update engagements' });
    return;
  }
  const id = String(req.params.id);
  const parsed = engagementSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid engagement update' });
    return;
  }
  const d = parsed.data;
  const engagement = await prisma.engagement.update({
    where: { id },
    data: {
      ...(d.title !== undefined && { title: sanitizeText(d.title) }),
      ...(d.scope !== undefined && { scope: sanitizeText(d.scope) }),
      ...(d.assignedConsultants !== undefined && {
        assignedConsultants: JSON.stringify(d.assignedConsultants.map(sanitizeText)),
      }),
      ...(d.status !== undefined && { status: d.status }),
      ...(d.reportDelivered !== undefined && {
        reportDelivered: d.reportDelivered,
        reportDeliveredAt: d.reportDelivered ? new Date() : null,
      }),
      ...(d.notes !== undefined && { notes: d.notes ? sanitizeText(d.notes) : null }),
    },
    include: {
      account: { select: { id: true, name: true, industry: true } },
      deal: { select: { id: true, title: true, value: true, currency: true } },
    },
  });
  res.json({ engagement });
});

export default router;
