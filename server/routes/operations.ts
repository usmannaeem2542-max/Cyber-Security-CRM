import express from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import {
  type AuthenticatedRequest,
  buildOwnerScope,
  canMutate,
  requireAuth,
  requireRoles,
  sanitizeText,
  writeAuditLog,
} from '../security.js';

const router = express.Router();
router.use(requireAuth);

const AED_TO_USD = Number(process.env.AED_TO_USD_RATE || 0.272294);
function toAED(amount: number, currency: string): number {
  return currency === 'USD' ? amount / AED_TO_USD : amount;
}

// ================= MARKETING =================
router.get('/marketing/overview', async (_req, res) => {
  const [campaigns, templates, segments, assets, leads, deals] = await Promise.all([
    prisma.campaign.findMany({
      include: {
        owner: { select: { id: true, name: true } },
        leads: { select: { id: true, status: true, score: true } },
        deals: { select: { id: true, stage: true, value: true, currency: true } },
      },
      orderBy: { startDate: 'desc' },
    }),
    prisma.emailTemplate.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.audienceSegment.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.contentAsset.findMany({ orderBy: { downloads: 'desc' } }),
    prisma.lead.findMany({ select: { id: true, industry: true, serviceInterest: true, status: true } }),
    prisma.deal.findMany({ select: { id: true, stage: true, serviceType: true } }),
  ]);

  const enrichedCampaigns = campaigns.map((c) => {
    const budgetAED = toAED(c.budget, c.currency);
    const pipelineAED = c.deals
      .filter((d) => d.stage !== 'CLOSED_LOST')
      .reduce((s, d) => s + toAED(d.value, d.currency), 0);
    const wonAED = c.deals
      .filter((d) => d.stage === 'CLOSED_WON')
      .reduce((s, d) => s + toAED(d.value, d.currency), 0);
    const roiPercent = budgetAED > 0 ? Math.round(((wonAED - budgetAED) / budgetAED) * 100) : 0;
    return {
      ...c,
      leadCount: c.leads.length,
      qualifiedCount: c.leads.filter((l) => l.status === 'QUALIFIED' || l.status === 'CONVERTED')
        .length,
      dealCount: c.deals.length,
      pipelineAED: Math.round(pipelineAED),
      wonAED: Math.round(wonAED),
      roiPercent,
    };
  });

  const enrichedSegments = segments.map((seg) => {
    const matchingLeads = leads.filter((l) => {
      if (seg.criteriaIndustry && l.industry !== seg.criteriaIndustry) return false;
      if (
        seg.criteriaService &&
        !l.serviceInterest.toLowerCase().includes(seg.criteriaService.toLowerCase())
      ) {
        return false;
      }
      return true;
    }).length;
    const matchingDeals = deals.filter((d) => {
      if (seg.criteriaStage && d.stage !== seg.criteriaStage) return false;
      if (
        seg.criteriaService &&
        !d.serviceType.toLowerCase().includes(seg.criteriaService.toLowerCase())
      ) {
        return false;
      }
      return true;
    }).length;
    return { ...seg, matchingCount: matchingLeads + matchingDeals };
  });

  res.json({
    campaigns: enrichedCampaigns,
    templates,
    segments: enrichedSegments,
    assets,
  });
});

router.post('/marketing/campaigns', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot create campaigns' });
    return;
  }
  const schema = z.object({
    name: z.string().min(1).max(140),
    type: z.enum(['WEBINAR', 'EMAIL', 'LINKEDIN', 'EVENT', 'CONTENT']),
    status: z.enum(['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED']).default('ACTIVE'),
    budget: z.number().min(0),
    currency: z.enum(['AED', 'USD']).default('AED'),
    startDate: z.string().min(1),
    endDate: z.string().optional().nullable(),
    targetIndustry: z.string().max(100).optional().nullable(),
    description: z.string().max(1500).optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid campaign payload' });
    return;
  }
  const d = parsed.data;
  const campaign = await prisma.campaign.create({
    data: {
      name: sanitizeText(d.name),
      type: d.type,
      status: d.status,
      budget: d.budget,
      currency: d.currency,
      startDate: new Date(d.startDate),
      endDate: d.endDate ? new Date(d.endDate) : null,
      targetIndustry: d.targetIndustry ? sanitizeText(d.targetIndustry) : null,
      description: d.description ? sanitizeText(d.description) : null,
      ownerId: req.user!.userId,
    },
  });
  res.status(201).json({ campaign });
});

router.post('/marketing/templates', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot create templates' });
    return;
  }
  const schema = z.object({
    name: z.string().min(1).max(120),
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(5000),
    category: z.string().default('OUTREACH'),
    mergeFields: z.array(z.string()).default(['firstName', 'companyName', 'serviceInterest']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid template payload' });
    return;
  }
  const d = parsed.data;
  const template = await prisma.emailTemplate.create({
    data: {
      name: sanitizeText(d.name),
      subject: sanitizeText(d.subject),
      body: d.body,
      category: sanitizeText(d.category),
      mergeFields: JSON.stringify(d.mergeFields),
      createdById: req.user!.userId,
    },
  });
  res.status(201).json({ template });
});

router.post('/marketing/segments', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot create segments' });
    return;
  }
  const schema = z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(400).optional().nullable(),
    criteriaIndustry: z.string().optional().nullable(),
    criteriaService: z.string().optional().nullable(),
    criteriaStage: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid segment payload' });
    return;
  }
  const d = parsed.data;
  const segment = await prisma.audienceSegment.create({
    data: {
      name: sanitizeText(d.name),
      description: d.description ? sanitizeText(d.description) : null,
      criteriaIndustry: d.criteriaIndustry || null,
      criteriaService: d.criteriaService || null,
      criteriaStage: d.criteriaStage || null,
      createdById: req.user!.userId,
    },
  });
  res.status(201).json({ segment });
});

router.post('/marketing/assets', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot create content assets' });
    return;
  }
  const schema = z.object({
    title: z.string().min(1).max(160),
    type: z.enum(['WHITEPAPER', 'CASE_STUDY', 'DATASHEET', 'PLAYBOOK']),
    serviceCategory: z.string().min(1).max(80),
    summary: z.string().min(1).max(1000),
    url: z.string().min(1).max(300),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid asset payload' });
    return;
  }
  const d = parsed.data;
  const asset = await prisma.contentAsset.create({
    data: {
      title: sanitizeText(d.title),
      type: d.type,
      serviceCategory: sanitizeText(d.serviceCategory),
      summary: sanitizeText(d.summary),
      url: sanitizeText(d.url),
    },
  });
  res.status(201).json({ asset });
});

router.post('/marketing/assets/:id/download', async (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id);
  const asset = await prisma.contentAsset.update({
    where: { id },
    data: { downloads: { increment: 1 } },
  });
  res.json({ asset });
});

// ================= ACTIVITIES & TASKS =================
router.get('/activities', async (req: AuthenticatedRequest, res) => {
  const scope = buildOwnerScope(req.user!);
  const activities = await prisma.activity.findMany({
    where: scope,
    include: {
      owner: { select: { id: true, name: true } },
      lead: { select: { id: true, firstName: true, lastName: true, companyName: true } },
      account: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      deal: { select: { id: true, title: true } },
    },
    orderBy: [{ completed: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
  });
  res.json({ activities });
});

router.post('/activities', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot log activities' });
    return;
  }
  const schema = z.object({
    type: z.enum(['CALL', 'MEETING', 'EMAIL', 'NOTE', 'TASK']),
    subject: z.string().min(1).max(180),
    description: z.string().max(2000).optional().nullable(),
    dueDate: z.string().optional().nullable(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
    completed: z.boolean().default(false),
    leadId: z.string().optional().nullable(),
    accountId: z.string().optional().nullable(),
    contactId: z.string().optional().nullable(),
    dealId: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid activity payload' });
    return;
  }
  const d = parsed.data;
  const activity = await prisma.activity.create({
    data: {
      type: d.type,
      subject: sanitizeText(d.subject),
      description: d.description ? sanitizeText(d.description) : null,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      priority: d.priority,
      completed: d.completed,
      completedAt: d.completed ? new Date() : null,
      leadId: d.leadId || null,
      accountId: d.accountId || null,
      contactId: d.contactId || null,
      dealId: d.dealId || null,
      ownerId: req.user!.userId,
    },
    include: {
      owner: { select: { id: true, name: true } },
      account: { select: { id: true, name: true } },
      deal: { select: { id: true, title: true } },
    },
  });
  res.status(201).json({ activity });
});

router.patch('/activities/:id', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot update activities' });
    return;
  }
  const id = String(req.params.id);
  const schema = z.object({
    completed: z.boolean().optional(),
    subject: z.string().max(180).optional(),
    dueDate: z.string().optional().nullable(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid activity update' });
    return;
  }
  const d = parsed.data;
  const activity = await prisma.activity.update({
    where: { id },
    data: {
      ...(d.completed !== undefined && {
        completed: d.completed,
        completedAt: d.completed ? new Date() : null,
      }),
      ...(d.subject !== undefined && { subject: sanitizeText(d.subject) }),
      ...(d.dueDate !== undefined && { dueDate: d.dueDate ? new Date(d.dueDate) : null }),
      ...(d.priority !== undefined && { priority: d.priority }),
    },
  });
  res.json({ activity });
});

// ================= SUPPORT TICKETS =================
router.get('/tickets', async (req: AuthenticatedRequest, res) => {
  const scope = buildOwnerScope(req.user!);
  const tickets = await prisma.ticket.findMany({
    where: scope,
    include: {
      account: { select: { id: true, name: true, healthStatus: true } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ tickets });
});

router.post('/tickets', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot create tickets' });
    return;
  }
  const schema = z.object({
    subject: z.string().min(1).max(160),
    description: z.string().min(1).max(3000),
    category: z.enum([
      'SOC_ALERT',
      'PEN_TEST_RETEST',
      'LICENSING',
      'COMPLIANCE_ADVISORY',
      'GENERAL',
    ]),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
    accountId: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid ticket payload' });
    return;
  }
  const d = parsed.data;
  const ticketNumber = `TKT-${Math.floor(10000 + Math.random() * 90000)}`;
  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      subject: sanitizeText(d.subject),
      description: sanitizeText(d.description),
      category: d.category,
      priority: d.priority,
      status: 'OPEN',
      accountId: d.accountId,
      ownerId: req.user!.userId,
    },
    include: {
      account: { select: { id: true, name: true, healthStatus: true } },
      owner: { select: { id: true, name: true } },
    },
  });
  res.status(201).json({ ticket });
});

router.patch('/tickets/:id', async (req: AuthenticatedRequest, res) => {
  if (!canMutate(req.user!)) {
    res.status(403).json({ error: 'Read-only role cannot update tickets' });
    return;
  }
  const id = String(req.params.id);
  const schema = z.object({
    status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid ticket update' });
    return;
  }
  const ticket = await prisma.ticket.update({
    where: { id },
    data: parsed.data,
    include: {
      account: { select: { id: true, name: true, healthStatus: true } },
      owner: { select: { id: true, name: true } },
    },
  });
  res.json({ ticket });
});

// ================= DASHBOARD & REPORTS =================
router.get('/dashboard', async (req: AuthenticatedRequest, res) => {
  const scope = buildOwnerScope(req.user!);
  const [deals, leads, tasks, contracts] = await Promise.all([
    prisma.deal.findMany({
      where: scope,
      include: {
        owner: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
      },
    }),
    prisma.lead.findMany({ where: scope }),
    prisma.activity.findMany({
      where: { ...scope, type: 'TASK', completed: false },
      include: {
        account: { select: { id: true, name: true } },
        deal: { select: { id: true, title: true } },
      },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.contract.findMany({
      where: scope,
      include: { account: { select: { id: true, name: true } } },
      orderBy: { endDate: 'asc' },
    }),
  ]);

  const stages = [
    'PROSPECTING',
    'DISCOVERY',
    'SCOPING',
    'PROPOSAL',
    'NEGOTIATION',
    'CLOSED_WON',
    'CLOSED_LOST',
  ];

  const pipelineByStage = stages.map((stage) => {
    const stageDeals = deals.filter((d) => d.stage === stage);
    const totalAED = stageDeals.reduce((s, d) => s + toAED(d.value, d.currency), 0);
    const weightedAED = stageDeals.reduce(
      (s, d) => s + toAED(d.value, d.currency) * (d.probability / 100),
      0
    );
    return {
      stage,
      count: stageDeals.length,
      valueAED: Math.round(totalAED),
      weightedAED: Math.round(weightedAED),
    };
  });

  const openDeals = deals.filter((d) => d.stage !== 'CLOSED_WON' && d.stage !== 'CLOSED_LOST');
  const openPipelineAED = Math.round(
    openDeals.reduce((s, d) => s + toAED(d.value, d.currency), 0)
  );
  const weightedForecastAED = Math.round(
    openDeals.reduce((s, d) => s + toAED(d.value, d.currency) * (d.probability / 100), 0)
  );

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const wonThisMonth = deals.filter(
    (d) => d.stage === 'CLOSED_WON' && new Date(d.stageChangedAt) >= startOfMonth
  );
  const lostThisMonth = deals.filter(
    (d) => d.stage === 'CLOSED_LOST' && new Date(d.stageChangedAt) >= startOfMonth
  );
  const wonAll = deals.filter((d) => d.stage === 'CLOSED_WON');
  const lostAll = deals.filter((d) => d.stage === 'CLOSED_LOST');

  const wonThisMonthAED = Math.round(
    wonThisMonth.reduce((s, d) => s + toAED(d.value, d.currency), 0)
  );
  const lostThisMonthAED = Math.round(
    lostThisMonth.reduce((s, d) => s + toAED(d.value, d.currency), 0)
  );

  const leadsBySourceMap = new Map<string, number>();
  for (const l of leads) {
    leadsBySourceMap.set(l.source, (leadsBySourceMap.get(l.source) || 0) + 1);
  }
  const leadsBySource = Array.from(leadsBySourceMap.entries()).map(([source, count]) => ({
    source,
    count,
  }));

  const qualifiedOrConverted = leads.filter(
    (l) => l.status === 'QUALIFIED' || l.status === 'CONVERTED'
  ).length;
  const conversionRate = leads.length > 0 ? Math.round((qualifiedOrConverted / leads.length) * 100) : 0;

  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const tasksDueToday = tasks.filter((t) => t.dueDate && new Date(t.dueDate) <= endOfToday);

  // Top reps leaderboard
  const repMap = new Map<string, { id: string; name: string; wonAED: number; pipelineAED: number; dealsCount: number }>();
  for (const d of deals) {
    const cur = repMap.get(d.ownerId) || {
      id: d.ownerId,
      name: d.owner.name,
      wonAED: 0,
      pipelineAED: 0,
      dealsCount: 0,
    };
    const val = toAED(d.value, d.currency);
    if (d.stage === 'CLOSED_WON') cur.wonAED += val;
    else if (d.stage !== 'CLOSED_LOST') cur.pipelineAED += val;
    cur.dealsCount += 1;
    repMap.set(d.ownerId, cur);
  }
  const leaderboard = Array.from(repMap.values())
    .map((r) => ({
      ...r,
      wonAED: Math.round(r.wonAED),
      pipelineAED: Math.round(r.pipelineAED),
    }))
    .sort((a, b) => b.wonAED - a.wonAED || b.pipelineAED - a.pipelineAED);

  // Upcoming renewals within 90 days
  const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const upcomingRenewals = contracts
    .filter((c) => c.status !== 'EXPIRED' && new Date(c.endDate) <= ninetyDays)
    .map((c) => {
      const daysLeft = Math.ceil(
        (new Date(c.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: c.id,
        contractNumber: c.contractNumber,
        title: c.title,
        accountName: c.account.name,
        endDate: c.endDate,
        daysLeft,
        arrAED: Math.round(toAED(c.arr, c.currency)),
      };
    });

  const totalMrrAED = Math.round(
    contracts
      .filter((c) => c.status === 'ACTIVE' || c.status === 'EXPIRING_SOON')
      .reduce((s, c) => s + toAED(c.mrr, c.currency), 0)
  );

  res.json({
    kpis: {
      openPipelineAED,
      weightedForecastAED,
      wonThisMonthAED,
      wonThisMonthCount: wonThisMonth.length,
      lostThisMonthAED,
      lostThisMonthCount: lostThisMonth.length,
      winRate:
        wonAll.length + lostAll.length > 0
          ? Math.round((wonAll.length / (wonAll.length + lostAll.length)) * 100)
          : 0,
      leadConversionRate: conversionRate,
      totalLeads: leads.length,
      tasksDueTodayCount: tasksDueToday.length,
      totalMrrAED,
    },
    pipelineByStage,
    leadsBySource,
    tasksDueToday: tasksDueToday.slice(0, 8),
    leaderboard: leaderboard.slice(0, 5),
    upcomingRenewals,
  });
});

router.get('/reports', async (req: AuthenticatedRequest, res) => {
  const scope = buildOwnerScope(req.user!);
  const [deals, leads, campaigns] = await Promise.all([
    prisma.deal.findMany({
      where: scope,
      include: {
        owner: { select: { id: true, name: true } },
        account: { select: { id: true, name: true, industry: true } },
      },
    }),
    prisma.lead.findMany({ where: scope }),
    prisma.campaign.findMany(),
  ]);

  // 1. Sales Performance by Rep
  const repStats = new Map<
    string,
    { name: string; wonCount: number; lostCount: number; openCount: number; wonAED: number; openAED: number }
  >();
  for (const d of deals) {
    const r = repStats.get(d.ownerId) || {
      name: d.owner.name,
      wonCount: 0,
      lostCount: 0,
      openCount: 0,
      wonAED: 0,
      openAED: 0,
    };
    const v = toAED(d.value, d.currency);
    if (d.stage === 'CLOSED_WON') {
      r.wonCount += 1;
      r.wonAED += v;
    } else if (d.stage === 'CLOSED_LOST') {
      r.lostCount += 1;
    } else {
      r.openCount += 1;
      r.openAED += v;
    }
    repStats.set(d.ownerId, r);
  }
  const salesPerformance = Array.from(repStats.values()).map((r) => ({
    ...r,
    wonAED: Math.round(r.wonAED),
    openAED: Math.round(r.openAED),
    winRate:
      r.wonCount + r.lostCount > 0 ? Math.round((r.wonCount / (r.wonCount + r.lostCount)) * 100) : 0,
  }));

  // 2. Pipeline Velocity (avg days since created per stage)
  const nowMs = Date.now();
  const stageGroups = new Map<string, { count: number; totalDays: number; totalAED: number }>();
  for (const d of deals) {
    const g = stageGroups.get(d.stage) || { count: 0, totalDays: 0, totalAED: 0 };
    const days = Math.max(1, Math.round((nowMs - new Date(d.createdAt).getTime()) / 86400000));
    g.count += 1;
    g.totalDays += days;
    g.totalAED += toAED(d.value, d.currency);
    stageGroups.set(d.stage, g);
  }
  const pipelineVelocity = Array.from(stageGroups.entries()).map(([stage, g]) => ({
    stage,
    deals: g.count,
    avgDays: Math.round(g.totalDays / g.count),
    valueAED: Math.round(g.totalAED),
  }));

  // 3. Win / Loss Analysis
  const lostReasonMap = new Map<string, number>();
  for (const d of deals.filter((x) => x.stage === 'CLOSED_LOST')) {
    const reason = d.lostReason || 'Unspecified';
    lostReasonMap.set(reason, (lostReasonMap.get(reason) || 0) + 1);
  }
  const winLossAnalysis = {
    wonCount: deals.filter((d) => d.stage === 'CLOSED_WON').length,
    lostCount: deals.filter((d) => d.stage === 'CLOSED_LOST').length,
    wonValueAED: Math.round(
      deals.filter((d) => d.stage === 'CLOSED_WON').reduce((s, d) => s + toAED(d.value, d.currency), 0)
    ),
    lostValueAED: Math.round(
      deals.filter((d) => d.stage === 'CLOSED_LOST').reduce((s, d) => s + toAED(d.value, d.currency), 0)
    ),
    lostReasons: Array.from(lostReasonMap.entries()).map(([reason, count]) => ({ reason, count })),
  };

  // 4. Lead Source ROI
  const sourceMap = new Map<string, { leads: number; qualified: number; wonAED: number }>();
  for (const l of leads) {
    const s = sourceMap.get(l.source) || { leads: 0, qualified: 0, wonAED: 0 };
    s.leads += 1;
    if (l.status === 'QUALIFIED' || l.status === 'CONVERTED') s.qualified += 1;
    sourceMap.set(l.source, s);
  }
  for (const c of campaigns) {
    const campDeals = deals.filter((d) => d.campaignId === c.id && d.stage === 'CLOSED_WON');
    const sourceKey =
      c.type === 'EMAIL' ? 'EMAIL_CAMPAIGN' : c.type === 'CONTENT' ? 'INBOUND_WEB' : c.type;
    const s = sourceMap.get(sourceKey) || { leads: 0, qualified: 0, wonAED: 0 };
    s.wonAED += campDeals.reduce((sum, d) => sum + toAED(d.value, d.currency), 0);
    sourceMap.set(sourceKey, s);
  }
  const leadSourceRoi = Array.from(sourceMap.entries()).map(([source, v]) => ({
    source,
    leads: v.leads,
    qualified: v.qualified,
    wonAED: Math.round(v.wonAED),
  }));

  // 5. Forecast vs Actual (by month across next/past 6 months)
  const months: Array<{ month: string; forecastAED: number; actualAED: number }> = [];
  const baseDate = new Date();
  for (let offset = -3; offset <= 2; offset++) {
    const dt = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 1);
    const label = dt.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const monthDeals = deals.filter((d) => {
      const close = new Date(d.expectedCloseDate);
      return close.getFullYear() === dt.getFullYear() && close.getMonth() === dt.getMonth();
    });
    const forecastAED = Math.round(
      monthDeals
        .filter((d) => d.stage !== 'CLOSED_LOST')
        .reduce((s, d) => s + toAED(d.value, d.currency) * (d.probability / 100), 0)
    );
    const actualAED = Math.round(
      monthDeals
        .filter((d) => d.stage === 'CLOSED_WON')
        .reduce((s, d) => s + toAED(d.value, d.currency), 0)
    );
    months.push({ month: label, forecastAED, actualAED });
  }

  res.json({
    salesPerformance,
    pipelineVelocity,
    winLossAnalysis,
    leadSourceRoi,
    forecastVsActual: months,
  });
});

// ================= EXPORT AUDIT LOGGING =================
router.post('/audit/export', async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    module: z.string().min(1).max(60),
    format: z.enum(['CSV', 'PDF']),
    recordCount: z.number().int().min(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid export log payload' });
    return;
  }
  await writeAuditLog({
    user: req.user,
    action: 'EXPORT',
    entityType: parsed.data.module,
    details: `Exported ${parsed.data.recordCount} records as ${parsed.data.format}`,
    ipAddress: req.ip,
  });
  res.json({ ok: true });
});

// ================= GLOBAL SEARCH =================
router.get('/search', async (req: AuthenticatedRequest, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) {
    res.json({ results: [] });
    return;
  }
  const scope = buildOwnerScope(req.user!);
  const [leads, accounts, contacts, deals, quotes, tickets] = await Promise.all([
    prisma.lead.findMany({ where: scope, take: 50 }),
    prisma.account.findMany({ where: scope, take: 50 }),
    prisma.contact.findMany({ where: scope, include: { account: { select: { name: true } } }, take: 50 }),
    prisma.deal.findMany({ where: scope, include: { account: { select: { name: true } } }, take: 50 }),
    prisma.quote.findMany({ where: scope, take: 50 }),
    prisma.ticket.findMany({ where: scope, take: 50 }),
  ]);

  const results: Array<{ id: string; type: string; title: string; subtitle: string; module: string }> = [];

  for (const l of leads) {
    if (`${l.firstName} ${l.lastName} ${l.companyName} ${l.email}`.toLowerCase().includes(q)) {
      results.push({
        id: l.id,
        type: 'Lead',
        title: `${l.firstName} ${l.lastName}`,
        subtitle: `${l.companyName} · ${l.status}`,
        module: 'leads',
      });
    }
  }
  for (const a of accounts) {
    if (`${a.name} ${a.industry} ${a.country}`.toLowerCase().includes(q)) {
      results.push({
        id: a.id,
        type: 'Account',
        title: a.name,
        subtitle: `${a.industry} · ${a.country}`,
        module: 'accounts',
      });
    }
  }
  for (const c of contacts) {
    if (`${c.firstName} ${c.lastName} ${c.email} ${c.role}`.toLowerCase().includes(q)) {
      results.push({
        id: c.id,
        type: 'Contact',
        title: `${c.firstName} ${c.lastName}`,
        subtitle: `${c.role} · ${c.account.name}`,
        module: 'contacts',
      });
    }
  }
  for (const d of deals) {
    if (`${d.title} ${d.serviceType} ${d.account.name}`.toLowerCase().includes(q)) {
      results.push({
        id: d.id,
        type: 'Deal',
        title: d.title,
        subtitle: `${d.account.name} · ${d.stage}`,
        module: 'deals',
      });
    }
  }
  for (const qt of quotes) {
    if (`${qt.quoteNumber} ${qt.title}`.toLowerCase().includes(q)) {
      results.push({
        id: qt.id,
        type: 'Quote',
        title: `${qt.quoteNumber} — ${qt.title}`,
        subtitle: `${qt.status} · ${qt.currency} ${qt.total}`,
        module: 'quotes',
      });
    }
  }
  for (const tk of tickets) {
    if (`${tk.ticketNumber} ${tk.subject}`.toLowerCase().includes(q)) {
      results.push({
        id: tk.id,
        type: 'Ticket',
        title: `${tk.ticketNumber} — ${tk.subject}`,
        subtitle: `${tk.priority} · ${tk.status}`,
        module: 'tickets',
      });
    }
  }

  res.json({ results: results.slice(0, 20) });
});

// ================= AUDIT LOGS =================
router.get(
  '/audit-logs',
  requireRoles('ADMIN', 'SALES_MANAGER'),
  async (req: AuthenticatedRequest, res) => {
    const action = req.query.action ? String(req.query.action) : undefined;
    const logs = await prisma.auditLog.findMany({
      where: action && action !== 'ALL' ? { action } : {},
      orderBy: { createdAt: 'desc' },
      take: 150,
    });
    res.json({ logs });
  }
);

export default router;
