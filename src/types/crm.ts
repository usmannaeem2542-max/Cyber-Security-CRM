export type UserRole = 'ADMIN' | 'SALES_MANAGER' | 'SALES_REP' | 'MARKETING' | 'READ_ONLY';
export type CurrencyCode = 'AED' | 'USD';
export type LanguageCode = 'en' | 'ar';
export type ThemeMode = 'light' | 'dark';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  teamAccessGranted: boolean;
  department: string;
  phone?: string | null;
  twoFactorEnabled: boolean;
  isActive?: boolean;
}

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  companyName: string;
  jobTitle?: string | null;
  industry: string;
  companySize: 'SMB' | 'MID_MARKET' | 'ENTERPRISE' | 'GOVERNMENT';
  country: string;
  source: string;
  serviceInterest: string;
  estimatedBudget: number;
  currency: CurrencyCode;
  engagementScore: number;
  score: number;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'CONVERTED';
  tags: string;
  notes?: string | null;
  ownerId: string;
  owner?: { id: string; name: string; email: string };
  campaignId?: string | null;
  campaign?: { id: string; name: string; type: string } | null;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  industry: string;
  size: 'SMB' | 'MID_MARKET' | 'ENTERPRISE' | 'GOVERNMENT';
  country: string;
  website?: string | null;
  complianceReqs: string;
  securityStack: string;
  vulnerabilityNotes: string;
  sensitiveRedacted?: boolean;
  healthStatus: 'HEALTHY' | 'AT_RISK' | 'CRITICAL';
  annualRevenue?: number | null;
  tags: string;
  notes?: string | null;
  attachments: string;
  ownerId: string;
  owner?: { id: string; name: string; email: string };
  _count?: { contacts: number; deals: number; contracts: number; tickets: number };
  contacts?: Contact[];
  deals?: Deal[];
  contracts?: Contract[];
  engagements?: Engagement[];
  tickets?: Ticket[];
  activities?: Activity[];
  createdAt: string;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  role: 'CISO' | 'IT_MANAGER' | 'CFO' | 'PROCUREMENT' | 'CTO' | 'OTHER';
  jobTitle?: string | null;
  isDecisionMaker: boolean;
  linkedinUrl?: string | null;
  notes?: string | null;
  accountId: string;
  account?: { id: string; name: string; industry: string };
  ownerId: string;
  createdAt: string;
}

export type DealStage =
  | 'PROSPECTING'
  | 'DISCOVERY'
  | 'SCOPING'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'CLOSED_WON'
  | 'CLOSED_LOST';

export interface Deal {
  id: string;
  title: string;
  stage: DealStage;
  serviceType: string;
  value: number;
  currency: CurrencyCode;
  probability: number;
  expectedCloseDate: string;
  competitors?: string | null;
  lostReason?: string | null;
  internalMargin?: number | null;
  marginRedacted?: boolean;
  tags: string;
  notes?: string | null;
  stakeholderIds: string;
  stageChangedAt: string;
  accountId: string;
  account?: { id: string; name: string; industry?: string; country?: string; contacts?: Contact[] };
  ownerId: string;
  owner?: { id: string; name: string; email: string };
  quotes?: Quote[];
  engagements?: Engagement[];
  activities?: Activity[];
  _count?: { quotes: number; activities: number };
  createdAt: string;
}

export interface ServiceCatalogItem {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string;
  unitType: string;
  unitPriceAED: number;
  unitPriceUSD: number;
  deliverables: string;
  isActive: boolean;
}

export interface QuoteLineItem {
  id: string;
  serviceId?: string | null;
  description: string;
  unitType: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  title: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';
  currency: CurrencyCode;
  discountPercent: number;
  taxPercent: number;
  subtotal: number;
  total: number;
  validUntil: string;
  terms?: string | null;
  sensitiveTerms?: string | null;
  termsRedacted?: boolean;
  sentAt?: string | null;
  dealId: string;
  deal?: { id: string; title: string; stage: string };
  accountId: string;
  account?: { id: string; name: string; country?: string };
  owner?: { id: string; name: string; email: string };
  items: QuoteLineItem[];
  createdAt: string;
}

export interface Contract {
  id: string;
  contractNumber: string;
  title: string;
  accountId: string;
  account?: { id: string; name: string; industry: string };
  deal?: { id: string; title: string } | null;
  owner?: { id: string; name: string };
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  renewalNoticeDays: number;
  billingCycle: string;
  mrr: number;
  arr: number;
  totalValue: number;
  currency: CurrencyCode;
  status: 'ACTIVE' | 'EXPIRING_SOON' | 'RENEWED' | 'EXPIRED';
  sensitiveTerms?: string | null;
  termsRedacted?: boolean;
}

export interface Engagement {
  id: string;
  title: string;
  dealId?: string | null;
  deal?: { id: string; title: string; value: number; currency: CurrencyCode } | null;
  accountId: string;
  account?: { id: string; name: string; industry: string };
  scope: string;
  assignedConsultants: string;
  startDate: string;
  endDate: string;
  status: 'KICKOFF' | 'IN_PROGRESS' | 'REPORTING' | 'DELIVERED' | 'COMPLETED';
  reportDelivered: boolean;
  reportDeliveredAt?: string | null;
  notes?: string | null;
}

export interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  budget: number;
  currency: CurrencyCode;
  startDate: string;
  endDate?: string | null;
  targetIndustry?: string | null;
  description?: string | null;
  leadCount: number;
  qualifiedCount: number;
  dealCount: number;
  pipelineAED: number;
  wonAED: number;
  roiPercent: number;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  mergeFields: string;
}

export interface AudienceSegment {
  id: string;
  name: string;
  description?: string | null;
  criteriaIndustry?: string | null;
  criteriaService?: string | null;
  criteriaStage?: string | null;
  matchingCount: number;
}

export interface ContentAsset {
  id: string;
  title: string;
  type: string;
  serviceCategory: string;
  summary: string;
  url: string;
  downloads: number;
}

export interface Activity {
  id: string;
  type: 'CALL' | 'MEETING' | 'EMAIL' | 'NOTE' | 'TASK';
  subject: string;
  description?: string | null;
  dueDate?: string | null;
  completed: boolean;
  completedAt?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  autoGenerated: boolean;
  leadId?: string | null;
  accountId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  owner?: { id: string; name: string };
  account?: { id: string; name: string } | null;
  deal?: { id: string; title: string } | null;
  lead?: { id: string; firstName: string; lastName: string; companyName: string } | null;
  createdAt: string;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  accountId: string;
  account?: { id: string; name: string; healthStatus: string };
  owner?: { id: string; name: string };
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userEmail?: string | null;
  userRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
  createdAt: string;
}

export interface SavedFilter {
  id: string;
  name: string;
  module: string;
  filterJson: string;
}
