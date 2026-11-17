import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  type AuthenticatedRequest,
  buildOwnerScope,
  canAccessRecord,
  canMutate,
  canViewSensitiveFields,
  computeLeadScore,
  redactAccount,
  redactDeal,
  requireAuth,
  sanitizeText,
  writeAuditLog,
} from '../security.js';

const router = express.Router();
router.use(requireAuth);

const leadSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  phone: z.string().max(40).optional().nullable(),
  companyName: z.string().min(1).max(120),
  jobTitle: z.string().max(100).optional().nullable(),
  industry: z.string().min(1).max(80),
  companySize: z.enum(['SMB', 'MID_MARKET', 'ENTERPRISE', 'GOVERNMENT']),
  country: z.string().min(1).max(80).default('UAE'),
  source: z.enum([
    'WEBINAR',
    'LINKEDIN',
    'EMAIL_CAMPAIGN',
    'EVENT',
    'INBOUND_WEB',
    'PARTNER',
    'COLD_OUTREACH',
  ]),
  serviceInterest: z.string().min(1).max(120),
  estimatedBudget: z.number().min(0).default(0),
  currency: z.enum(['AED', 'USD']).default('AED'),
  engagementScore: z.number().int().min(0).max(100).default(50),
  status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED']).default('NEW'),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().max(4000).optional().nullable(),
  ownerId: z.string().optional(),
  campaignId: z.string().optional().nullable(),
});

const accountSchema = z.object({
  name: z.string().min(1).max(140),
  industry: z.string().min(1).max(80),
  size: z.enum(['SMB', 'MID_MARKET', 'ENTERPRISE', 'GOVERNMENT']),
  country: z.string().min(1).max(80),
  website: z.string().max(200).optional().nullable(),
  complianceReqs: z.array(z.string()).optional().default([]),
  securityStack: z.string().max(1000).optional().default(''),
  vulnerabilityNotes: z.string().max(4000).optional().default(''),
  healthStatus: z.enum(['HEALTHY', 'AT_RISK', 'CRITICAL']).default('HEALTHY'),
  annualRevenue: z.number().min(0).optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().max(4000).optional().nullable(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        size: z.string(),
        type: z.string(),
        url: z.string(),
        uploadedAt: z.string(),
      })
    )
    .optional(),
  ownerId: z.string().optional(),
});

const contactSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  phone: z.string().max(40).optional().nullable(),
  role: z.enum(['CISO', 'IT_MANAGER', 'CFO', 'PROCUREMENT', 'CTO', 'OTHER']),
  jobTitle: z.string().max(100).optional().nullable(),
  isDecisionMaker: z.boolean().default(false),
  linkedinUrl: z.string().max(250).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  accountId: z.string().min(1),
  ownerId: z.string().optional(),
});

const dealSchema = z.object({
  title: z.string().min(1).max(160),
  stage: z
    .enum([
      'PROSPECTING',
      'DISCOVERY',
      'SCOPING',
      'PROPOSAL',
      'NEGOTIATION',
      'CLOSED_WON',
      'CLOSED_LOST',
    ])
    .default('PROSPECTING'),
  serviceType: z.string().min(1).max(120),
  value: z.number().min(0),
  currency: z.enum(['AED', 'USD']).default('AED'),
  probability: z.number().int().min(0).max(100).default(20),
  expectedCloseDate: z.string().min(1),
  competitors: z.string().max(500).optional().nullable(),
  lostReason: z.string().max(500).optional().nullable(),
  internalMargin: z.number().min(0).max(100).optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  notes: z.string().max(4000).optional().nullable(),
  stakeholderIds: z.array(z.string()).optional().default([]),
  accountId: z.string().min(1),
  ownerId: z.string().optional(),
  campaignId: z.string().optional().nullable(),
});

// ================= LEADS =================
router.get('/leads', async (req: AuthenticatedRequest, res) => {
  const scope = buildOwnerScope(req.user!);
  const status = req.query.status ? String(req.query.status) : undefined;
  const source = req.query.source ? String(req.query.source) : undefined;
  const search = req.query.search ? String(req.query.search).toLowerCase() : '';

  const where: Record<string, unknown> = { ...scope };
  if (status && status !== 'ALL') where.status = status;
  if (source && source !== 'ALL') where.source = source;

  const leads = await prisma.lead.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true, email: true } },
      campaign: { select: { id: true, name: true, type: true } },
    },
    orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
  });

  const filtered = search
    ? leads.filter(
        (l) =>
          `${l.firstName} ${l.lastName}`.toLowerCase().includes(search) ||
          l.companyName.toLowerCase().includes(search) ||
          l.email.toLowerCase().includes(search) ||
          l.industry.toLowerCase().includes(search) ||
          l.serviceInterest.toLowerCase().includes(search)
      )
    : leads;

  res.json({ leads: filtered });
});

router.post('/leads', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot create leads' });
    return;
  }
  const parsed = leadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const ownerId =
    (req.user!.role === 'ADMIN' || req.user!.role === 'SALES_MANAGER') && d.ownerId
      ? d.ownerId
      : req.user!.userId;
  const score = computeLeadScore({
    companySize: d.companySize,
    industry: d.industry,
    estimatedBudget: d.estimatedBudget,
    currency: d.currency,
    engagementScore: d.engagementScore,
  });

  const lead = await prisma.lead.create({
    data: {
      firstName: sanitizeText(d.firstName),
      lastName: sanitizeText(d.lastName),
      email: d.email.toLowerCase().trim(),
      phone: d.phone ? sanitizeText(d.phone) : null,
      companyName: sanitizeText(d.companyName),
      jobTitle: d.jobTitle ? sanitizeText(d.jobTitle) : null,
      industry: sanitizeText(d.industry),
      companySize: d.companySize,
      country: sanitizeText(d.country),
      source: d.source,
      serviceInterest: sanitizeText(d.serviceInterest),
      estimatedBudget: d.estimatedBudget,
      currency: d.currency,
      engagementScore: d.engagementScore,
      score,
      status: d.status,
      tags: JSON.stringify(d.tags.map(sanitizeText)),
      notes: d.notes ? sanitizeText(d.notes) : null,
      ownerId,
      campaignId: d.campaignId || null,
    },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });

  await writeAuditLog({
    user: req.user,
    action: 'CREATE',
    entityType: 'Lead',
    entityId: lead.id,
    details: `Created lead ${lead.firstName} ${lead.lastName} (${lead.companyName})`,
    ipAddress: req.ip,
  });

  res.status(201).json({ lead });
});

router.post('/leads/import', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot import leads' });
    return;
  }
  const importSchema = z.object({
    rows: z.array(leadSchema.partial({ companySize: true, source: true, currency: true })).min(1).max(200),
  });
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid CSV import payload', details: parsed.error.flatten() });
    return;
  }

  const created = [];
  for (const row of parsed.data.rows) {
    const companySize = row.companySize || 'MID_MARKET';
    const currency = row.currency || 'AED';
    const estimatedBudget = row.estimatedBudget ?? 80000;
    const engagementScore = row.engagementScore ?? 60;
    const score = computeLeadScore({
      companySize,
      industry: row.industry || 'Technology',
      estimatedBudget,
      currency,
      engagementScore,
    });
    const lead = await prisma.lead.create({
      data: {
        firstName: sanitizeText(row.firstName),
        lastName: sanitizeText(row.lastName),
        email: (row.email || '').toLowerCase().trim(),
        phone: row.phone ? sanitizeText(row.phone) : null,
        companyName: sanitizeText(row.companyName),
        jobTitle: row.jobTitle ? sanitizeText(row.jobTitle) : null,
        industry: sanitizeText(row.industry || 'Technology'),
        companySize,
        country: sanitizeText(row.country || 'UAE'),
        source: row.source || 'EVENT',
        serviceInterest: sanitizeText(row.serviceInterest || 'VAPT & Penetration Testing'),
        estimatedBudget,
        currency,
        engagementScore,
        score,
        status: row.status || 'NEW',
        tags: JSON.stringify(row.tags || ['CSV Import']),
        notes: row.notes ? sanitizeText(row.notes) : null,
        ownerId: req.user!.userId,
      },
    });
    created.push(lead);
  }

  await writeAuditLog({
    user: req.user,
    action: 'CREATE',
    entityType: 'Lead',
    details: `Imported ${created.length} leads via CSV`,
    ipAddress: req.ip,
  });

  res.status(201).json({ count: created.length, leads: created });
});

router.patch('/leads/bulk', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot update leads' });
    return;
  }
  const bulkSchema = z.object({
    ids: z.array(z.string()).min(1),
    status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED']).optional(),
    ownerId: z.string().optional(),
  });
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid bulk update payload' });
    return;
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.ownerId && (req.user!.role === 'ADMIN' || req.user!.role === 'SALES_MANAGER')) {
    data.ownerId = parsed.data.ownerId;
  }

  await prisma.lead.updateMany({
    where: { id: { in: parsed.data.ids }, ...buildOwnerScope(req.user!) },
    data,
  });

  await writeAuditLog({
    user: req.user,
    action: 'UPDATE',
    entityType: 'Lead',
    details: `Bulk updated ${parsed.data.ids.length} leads`,
    ipAddress: req.ip,
  });
  res.json({ ok: true });
});

router.patch('/leads/:id', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot edit leads' });
    return;
  }
  const id = String(req.params.id);
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }
  if (!canAccessRecord(req.user!, existing.ownerId)) {
    res.status(403).json({ error: 'Access denied to this lead' });
    return;
  }

  const parsed = leadSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid lead update', details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const mergedScoreInput = {
    companySize: d.companySize ?? existing.companySize,
    industry: d.industry ?? existing.industry,
    estimatedBudget: d.estimatedBudget ?? existing.estimatedBudget,
    currency: d.currency ?? existing.currency,
    engagementScore: d.engagementScore ?? existing.engagementScore,
  };

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      ...(d.firstName !== undefined && { firstName: sanitizeText(d.firstName) }),
      ...(d.lastName !== undefined && { lastName: sanitizeText(d.lastName) }),
      ...(d.email !== undefined && { email: d.email.toLowerCase().trim() }),
      ...(d.phone !== undefined && { phone: d.phone ? sanitizeText(d.phone) : null }),
      ...(d.companyName !== undefined && { companyName: sanitizeText(d.companyName) }),
      ...(d.jobTitle !== undefined && { jobTitle: d.jobTitle ? sanitizeText(d.jobTitle) : null }),
      ...(d.industry !== undefined && { industry: sanitizeText(d.industry) }),
      ...(d.companySize !== undefined && { companySize: d.companySize }),
      ...(d.country !== undefined && { country: sanitizeText(d.country) }),
      ...(d.source !== undefined && { source: d.source }),
      ...(d.serviceInterest !== undefined && { serviceInterest: sanitizeText(d.serviceInterest) }),
      ...(d.estimatedBudget !== undefined && { estimatedBudget: d.estimatedBudget }),
      ...(d.currency !== undefined && { currency: d.currency }),
      ...(d.engagementScore !== undefined && { engagementScore: d.engagementScore }),
      ...(d.status !== undefined && { status: d.status }),
      ...(d.tags !== undefined && { tags: JSON.stringify(d.tags.map(sanitizeText)) }),
      ...(d.notes !== undefined && { notes: d.notes ? sanitizeText(d.notes) : null }),
      ...(d.ownerId !== undefined &&
        (req.user!.role === 'ADMIN' || req.user!.role === 'SALES_MANAGER') && {
          ownerId: d.ownerId,
        }),
      score: computeLeadScore(mergedScoreInput),
    },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });

  await writeAuditLog({
    user: req.user,
    action: 'UPDATE',
    entityType: 'Lead',
    entityId: lead.id,
    details: `Updated lead ${lead.firstName} ${lead.lastName}`,
    ipAddress: req.ip,
  });

  res.json({ lead });
});

router.delete('/leads/:id', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot delete leads' });
    return;
  }
  const id = String(req.params.id);
  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }
  if (!canAccessRecord(req.user!, existing.ownerId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  await prisma.lead.delete({ where: { id } });
  await writeAuditLog({
    user: req.user,
    action: 'DELETE',
    entityType: 'Lead',
    entityId: id,
    details: `Deleted lead ${existing.firstName} ${existing.lastName}`,
    ipAddress: req.ip,
  });
  res.json({ ok: true });
});

router.post('/leads/:id/convert', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot convert leads' });
    return;
  }
  const id = String(req.params.id);
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }
  if (!canAccessRecord(req.user!, lead.ownerId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  if (lead.status === 'CONVERTED') {
    res.status(400).json({ error: 'Lead already converted' });
    return;
  }

  const convertBody = z
    .object({
      dealTitle: z.string().min(1).max(160).optional(),
      dealValue: z.number().min(0).optional(),
      expectedCloseDate: z.string().optional(),
      complianceReqs: z.array(z.string()).optional(),
    })
    .safeParse(req.body || {});

  const opts = convertBody.success ? convertBody.data : {};
  const closeDate = opts.expectedCloseDate
    ? new Date(opts.expectedCloseDate)
    : new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        name: lead.companyName,
        industry: lead.industry,
        size: lead.companySize,
        country: lead.country,
        complianceReqs: JSON.stringify(opts.complianceReqs ?? ['ISO 27001']),
        securityStack: 'Pending Discovery Assessment',
        vulnerabilityNotes: '',
        healthStatus: 'HEALTHY',
        tags: lead.tags,
        notes: lead.notes,
        ownerId: lead.ownerId,
      },
    });

    const contact = await tx.contact.create({
      data: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        role:
          lead.jobTitle?.toLowerCase().includes('ciso')
            ? 'CISO'
            : lead.jobTitle?.toLowerCase().includes('cfo')
              ? 'CFO'
              : 'IT_MANAGER',
        jobTitle: lead.jobTitle,
        isDecisionMaker: true,
        accountId: account.id,
        ownerId: lead.ownerId,
      },
    });

    const deal = await tx.deal.create({
      data: {
        title: opts.dealTitle || `${lead.companyName} — ${lead.serviceInterest}`,
        stage: 'DISCOVERY',
        serviceType: lead.serviceInterest,
        value: opts.dealValue ?? (lead.estimatedBudget > 0 ? lead.estimatedBudget : 120000),
        currency: lead.currency,
        probability: 25,
        expectedCloseDate: closeDate,
        internalMargin: 38,
        tags: lead.tags,
        stakeholderIds: JSON.stringify([contact.id]),
        accountId: account.id,
        ownerId: lead.ownerId,
        campaignId: lead.campaignId,
      },
    });

    const updatedLead = await tx.lead.update({
      where: { id: lead.id },
      data: { status: 'CONVERTED', convertedAccountId: account.id },
    });

    // Re-link activities to new account/deal/contact
    await tx.activity.updateMany({
      where: { leadId: lead.id },
      data: { accountId: account.id, contactId: contact.id, dealId: deal.id },
    });

    return { account, contact, deal, lead: updatedLead };
  });

  await writeAuditLog({
    user: req.user,
    action: 'UPDATE',
    entityType: 'Lead',
    entityId: lead.id,
    details: `Converted lead to Account(${result.account.id}), Contact(${result.contact.id}), Deal(${result.deal.id})`,
    ipAddress: req.ip,
  });

  res.status(201).json(result);
});

// ================= ACCOUNTS =================
router.get('/accounts', async (req: AuthenticatedRequest, res) => {
  const scope = buildOwnerScope(req.user!);
  const accounts = await prisma.account.findMany({
    where: scope,
    include: {
      owner: { select: { id: true, name: true, email: true } },
      _count: { select: { contacts: true, deals: true, contracts: true, tickets: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  res.json({
    accounts: accounts.map((a) => redactAccount(a, req.user!, false)),
  });
});

router.get('/accounts/:id', async (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id);
  const reveal = req.query.reveal === 'true';
  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      contacts: true,
      deals: true,
      contracts: true,
      engagements: true,
      tickets: true,
      activities: {
        include: { owner: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  if (!canAccessRecord(req.user!, account.ownerId)) {
    res.status(403).json({ error: 'Access denied to this account' });
    return;
  }

  if (reveal && canViewSensitiveFields(req.user!, account.ownerId)) {
    await writeAuditLog({
      user: req.user,
      action: 'VIEW_SENSITIVE',
      entityType: 'Account',
      entityId: account.id,
      details: `Revealed sensitive security stack / vulnerability notes for ${account.name}`,
      ipAddress: req.ip,
    });
  }

  res.json({
    account: {
      ...redactAccount(account, req.user!, reveal),
      deals: account.deals.map((d) => redactDeal(d, req.user!)),
    },
  });
});

router.post('/accounts', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot create accounts' });
    return;
  }
  const parsed = accountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const ownerId =
    (req.user!.role === 'ADMIN' || req.user!.role === 'SALES_MANAGER') && d.ownerId
      ? d.ownerId
      : req.user!.userId;

  const account = await prisma.account.create({
    data: {
      name: sanitizeText(d.name),
      industry: sanitizeText(d.industry),
      size: d.size,
      country: sanitizeText(d.country),
      website: d.website ? sanitizeText(d.website) : null,
      complianceReqs: JSON.stringify(d.complianceReqs.map(sanitizeText)),
      securityStack: sanitizeText(d.securityStack),
      vulnerabilityNotes: sanitizeText(d.vulnerabilityNotes),
      healthStatus: d.healthStatus,
      annualRevenue: d.annualRevenue ?? null,
      tags: JSON.stringify(d.tags.map(sanitizeText)),
      notes: d.notes ? sanitizeText(d.notes) : null,
      attachments: JSON.stringify(d.attachments ?? []),
      ownerId,
    },
  });

  await writeAuditLog({
    user: req.user,
    action: 'CREATE',
    entityType: 'Account',
    entityId: account.id,
    details: `Created account ${account.name}`,
    ipAddress: req.ip,
  });

  res.status(201).json({ account: redactAccount(account, req.user!, false) });
});

router.patch('/accounts/:id', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot edit accounts' });
    return;
  }
  const id = String(req.params.id);
  const existing = await prisma.account.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  if (!canAccessRecord(req.user!, existing.ownerId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  const parsed = accountSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid account update' });
    return;
  }
  const d = parsed.data;
  const updated = await prisma.account.update({
    where: { id },
    data: {
      ...(d.name !== undefined && { name: sanitizeText(d.name) }),
      ...(d.industry !== undefined && { industry: sanitizeText(d.industry) }),
      ...(d.size !== undefined && { size: d.size }),
      ...(d.country !== undefined && { country: sanitizeText(d.country) }),
      ...(d.website !== undefined && { website: d.website ? sanitizeText(d.website) : null }),
      ...(d.complianceReqs !== undefined && {
        complianceReqs: JSON.stringify(d.complianceReqs.map(sanitizeText)),
      }),
      ...(d.securityStack !== undefined && { securityStack: sanitizeText(d.securityStack) }),
      ...(d.vulnerabilityNotes !== undefined &&
        canViewSensitiveFields(req.user!, existing.ownerId) && {
          vulnerabilityNotes: sanitizeText(d.vulnerabilityNotes),
        }),
      ...(d.healthStatus !== undefined && { healthStatus: d.healthStatus }),
      ...(d.annualRevenue !== undefined && { annualRevenue: d.annualRevenue }),
      ...(d.tags !== undefined && { tags: JSON.stringify(d.tags.map(sanitizeText)) }),
      ...(d.notes !== undefined && { notes: d.notes ? sanitizeText(d.notes) : null }),
      ...(d.attachments !== undefined && { attachments: JSON.stringify(d.attachments) }),
    },
  });

  await writeAuditLog({
    user: req.user,
    action: 'UPDATE',
    entityType: 'Account',
    entityId: id,
    details: `Updated account ${updated.name}`,
    ipAddress: req.ip,
  });

  res.json({ account: redactAccount(updated, req.user!, false) });
});

router.delete('/accounts/:id', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot delete accounts' });
    return;
  }
  const id = String(req.params.id);
  const existing = await prisma.account.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  if (!canAccessRecord(req.user!, existing.ownerId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  await prisma.account.delete({ where: { id } });
  await writeAuditLog({
    user: req.user,
    action: 'DELETE',
    entityType: 'Account',
    entityId: id,
    details: `Deleted account ${existing.name}`,
    ipAddress: req.ip,
  });
  res.json({ ok: true });
});

// ================= CONTACTS =================
router.get('/contacts', async (req: AuthenticatedRequest, res) => {
  const scope = buildOwnerScope(req.user!);
  const accountId = req.query.accountId ? String(req.query.accountId) : undefined;
  const contacts = await prisma.contact.findMany({
    where: { ...scope, ...(accountId ? { accountId } : {}) },
    include: {
      account: { select: { id: true, name: true, industry: true } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: [{ isDecisionMaker: 'desc' }, { lastName: 'asc' }],
  });
  res.json({ contacts });
});

router.post('/contacts', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot create contacts' });
    return;
  }
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const contact = await prisma.contact.create({
    data: {
      firstName: sanitizeText(d.firstName),
      lastName: sanitizeText(d.lastName),
      email: d.email.toLowerCase().trim(),
      phone: d.phone ? sanitizeText(d.phone) : null,
      role: d.role,
      jobTitle: d.jobTitle ? sanitizeText(d.jobTitle) : null,
      isDecisionMaker: d.isDecisionMaker,
      linkedinUrl: d.linkedinUrl ? sanitizeText(d.linkedinUrl) : null,
      notes: d.notes ? sanitizeText(d.notes) : null,
      accountId: d.accountId,
      ownerId: req.user!.userId,
    },
    include: { account: { select: { id: true, name: true, industry: true } } },
  });
  await writeAuditLog({
    user: req.user,
    action: 'CREATE',
    entityType: 'Contact',
    entityId: contact.id,
    details: `Created contact ${contact.firstName} ${contact.lastName}`,
    ipAddress: req.ip,
  });
  res.status(201).json({ contact });
});

router.patch('/contacts/:id', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot edit contacts' });
    return;
  }
  const id = String(req.params.id);
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Contact not found' });
    return;
  }
  if (!canAccessRecord(req.user!, existing.ownerId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  const parsed = contactSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid contact payload' });
    return;
  }
  const d = parsed.data;
  const updated = await prisma.contact.update({
    where: { id },
    data: {
      ...(d.firstName !== undefined && { firstName: sanitizeText(d.firstName) }),
      ...(d.lastName !== undefined && { lastName: sanitizeText(d.lastName) }),
      ...(d.email !== undefined && { email: d.email.toLowerCase().trim() }),
      ...(d.phone !== undefined && { phone: d.phone ? sanitizeText(d.phone) : null }),
      ...(d.role !== undefined && { role: d.role }),
      ...(d.jobTitle !== undefined && { jobTitle: d.jobTitle ? sanitizeText(d.jobTitle) : null }),
      ...(d.isDecisionMaker !== undefined && { isDecisionMaker: d.isDecisionMaker }),
      ...(d.linkedinUrl !== undefined && {
        linkedinUrl: d.linkedinUrl ? sanitizeText(d.linkedinUrl) : null,
      }),
      ...(d.notes !== undefined && { notes: d.notes ? sanitizeText(d.notes) : null }),
    },
    include: { account: { select: { id: true, name: true, industry: true } } },
  });
  res.json({ contact: updated });
});

router.delete('/contacts/:id', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot delete contacts' });
    return;
  }
  const id = String(req.params.id);
  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Contact not found' });
    return;
  }
  if (!canAccessRecord(req.user!, existing.ownerId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  await prisma.contact.delete({ where: { id } });
  res.json({ ok: true });
});

// ================= DEALS =================
router.get('/deals', async (req: AuthenticatedRequest, res) => {
  const scope = buildOwnerScope(req.user!);
  const deals = await prisma.deal.findMany({
    where: scope,
    include: {
      account: { select: { id: true, name: true, industry: true, country: true } },
      owner: { select: { id: true, name: true, email: true } },
      campaign: { select: { id: true, name: true } },
      _count: { select: { quotes: true, activities: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  res.json({ deals: deals.map((d) => redactDeal(d, req.user!)) });
});

router.get('/deals/:id', async (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id);
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      account: { include: { contacts: true } },
      owner: { select: { id: true, name: true, email: true } },
      quotes: { include: { items: true } },
      engagements: true,
      activities: {
        include: { owner: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!deal) {
    res.status(404).json({ error: 'Deal not found' });
    return;
  }
  if (!canAccessRecord(req.user!, deal.ownerId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  res.json({ deal: redactDeal(deal, req.user!) });
});

router.post('/deals', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot create deals' });
    return;
  }
  const parsed = dealSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const ownerId =
    (req.user!.role === 'ADMIN' || req.user!.role === 'SALES_MANAGER') && d.ownerId
      ? d.ownerId
      : req.user!.userId;

  const deal = await prisma.deal.create({
    data: {
      title: sanitizeText(d.title),
      stage: d.stage,
      serviceType: sanitizeText(d.serviceType),
      value: d.value,
      currency: d.currency,
      probability: d.probability,
      expectedCloseDate: new Date(d.expectedCloseDate),
      competitors: d.competitors ? sanitizeText(d.competitors) : null,
      lostReason: d.lostReason ? sanitizeText(d.lostReason) : null,
      internalMargin: d.internalMargin ?? 35,
      tags: JSON.stringify(d.tags.map(sanitizeText)),
      notes: d.notes ? sanitizeText(d.notes) : null,
      stakeholderIds: JSON.stringify(d.stakeholderIds),
      accountId: d.accountId,
      ownerId,
      campaignId: d.campaignId || null,
    },
    include: {
      account: { select: { id: true, name: true, industry: true, country: true } },
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  await writeAuditLog({
    user: req.user,
    action: 'CREATE',
    entityType: 'Deal',
    entityId: deal.id,
    details: `Created deal ${deal.title} (${deal.currency} ${deal.value})`,
    ipAddress: req.ip,
  });

  res.status(201).json({ deal: redactDeal(deal, req.user!) });
});

const STAGE_DEFAULT_PROBABILITY: Record<string, number> = {
  PROSPECTING: 15,
  DISCOVERY: 25,
  SCOPING: 45,
  PROPOSAL: 65,
  NEGOTIATION: 80,
  CLOSED_WON: 100,
  CLOSED_LOST: 0,
};

router.patch('/deals/:id', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot update deals' });
    return;
  }
  const id = String(req.params.id);
  const existing = await prisma.deal.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Deal not found' });
    return;
  }
  if (!canAccessRecord(req.user!, existing.ownerId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const parsed = dealSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid deal update', details: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const stageChanged = d.stage && d.stage !== existing.stage;
  const autoProb =
    stageChanged && d.probability === undefined
      ? STAGE_DEFAULT_PROBABILITY[d.stage!] ?? existing.probability
      : d.probability;

  const updated = await prisma.deal.update({
    where: { id },
    data: {
      ...(d.title !== undefined && { title: sanitizeText(d.title) }),
      ...(d.stage !== undefined && { stage: d.stage }),
      ...(stageChanged && { stageChangedAt: new Date() }),
      ...(d.serviceType !== undefined && { serviceType: sanitizeText(d.serviceType) }),
      ...(d.value !== undefined && { value: d.value }),
      ...(d.currency !== undefined && { currency: d.currency }),
      ...(autoProb !== undefined && { probability: autoProb }),
      ...(d.expectedCloseDate !== undefined && {
        expectedCloseDate: new Date(d.expectedCloseDate),
      }),
      ...(d.competitors !== undefined && {
        competitors: d.competitors ? sanitizeText(d.competitors) : null,
      }),
      ...(d.lostReason !== undefined && {
        lostReason: d.lostReason ? sanitizeText(d.lostReason) : null,
      }),
      ...(d.internalMargin !== undefined &&
        canViewSensitiveFields(req.user!, existing.ownerId) && {
          internalMargin: d.internalMargin,
        }),
      ...(d.tags !== undefined && { tags: JSON.stringify(d.tags.map(sanitizeText)) }),
      ...(d.notes !== undefined && { notes: d.notes ? sanitizeText(d.notes) : null }),
      ...(d.stakeholderIds !== undefined && {
        stakeholderIds: JSON.stringify(d.stakeholderIds),
      }),
    },
    include: {
      account: { select: { id: true, name: true, industry: true, country: true } },
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  await writeAuditLog({
    user: req.user,
    action: 'UPDATE',
    entityType: 'Deal',
    entityId: updated.id,
    details: stageChanged
      ? `Moved deal "${updated.title}" from ${existing.stage} to ${updated.stage}`
      : `Updated deal "${updated.title}"`,
    ipAddress: req.ip,
  });

  res.json({ deal: redactDeal(updated, req.user!) });
});

router.delete('/deals/:id', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot delete deals' });
    return;
  }
  const id = String(req.params.id);
  const existing = await prisma.deal.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'Deal not found' });
    return;
  }
  if (!canAccessRecord(req.user!, existing.ownerId)) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  await prisma.deal.delete({ where: { id } });
  await writeAuditLog({
    user: req.user,
    action: 'DELETE',
    entityType: 'Deal',
    entityId: id,
    details: `Deleted deal ${existing.title}`,
    ipAddress: req.ip,
  });
  res.json({ ok: true });
});

// ================= SAVED FILTERS =================
router.get('/saved-filters', async (req: AuthenticatedRequest, res) => {
  const module = req.query.module ? String(req.query.module) : undefined;
  const filters = await prisma.savedFilter.findMany({
    where: { userId: req.user!.userId, ...(module ? { module } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ filters });
});

router.post('/saved-filters', async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    name: z.string().min(1).max(60),
    module: z.string().min(1).max(40),
    filterJson: z.string().min(2),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid saved filter' });
    return;
  }
  const filter = await prisma.savedFilter.create({
    data: {
      name: sanitizeText(parsed.data.name),
      module: parsed.data.module,
      filterJson: parsed.data.filterJson,
      userId: req.user!.userId,
    },
  });
  res.status(201).json({ filter });
});

router.delete('/saved-filters/:id', async (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id);
  await prisma.savedFilter.deleteMany({
    where: { id, userId: req.user!.userId },
  });
  res.json({ ok: true });
});

export default router;
