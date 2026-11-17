import 'dotenv/config';
import { prisma } from '../server/db.js';
import { computeLeadScore, hashPassword } from '../server/security.js';

export async function runSeed() {
  const existingUsers = await prisma.user.count();
  if (existingUsers > 0) {
    return;
  }

  console.log('Seeding SentinelShield Cyber CRM database...');
  const passwordHash = await hashPassword('Password123!');

  // 1. Create 15 users (3 per role)
  const userDefinitions = [
    { email: 'admin1@sentinelshield.ae', name: 'Tariq Al-Mansoori', role: 'ADMIN', dept: 'Executive Security', teamAccess: true },
    { email: 'admin2@sentinelshield.ae', name: 'Nadia Haddad', role: 'ADMIN', dept: 'RevOps & SecOps', teamAccess: true },
    { email: 'admin3@sentinelshield.ae', name: 'Omar Farooq', role: 'ADMIN', dept: 'IT Governance', teamAccess: true },

    { email: 'manager1@sentinelshield.ae', name: 'Layla Al-Hashemi', role: 'SALES_MANAGER', dept: 'Enterprise Sales', teamAccess: true },
    { email: 'manager2@sentinelshield.ae', name: 'Karim Darwish', role: 'SALES_MANAGER', dept: 'Government & Banking', teamAccess: true },
    { email: 'manager3@sentinelshield.ae', name: 'Sana Al-Qahtani', role: 'SALES_MANAGER', dept: 'Managed Services', teamAccess: true },

    { email: 'rep1@sentinelshield.ae', name: 'Zaid Khoury', role: 'SALES_REP', dept: 'Enterprise Sales', teamAccess: false },
    { email: 'rep2@sentinelshield.ae', name: 'Hana Al-Suwaidi', role: 'SALES_REP', dept: 'Mid-Market Sales', teamAccess: false },
    { email: 'rep3@sentinelshield.ae', name: 'Rami Mansour', role: 'SALES_REP', dept: 'Strategic Accounts', teamAccess: true },

    { email: 'mkt1@sentinelshield.ae', name: 'Yasmine Nassar', role: 'MARKETING', dept: 'Demand Generation', teamAccess: false },
    { email: 'mkt2@sentinelshield.ae', name: 'Bilal Qureshi', role: 'MARKETING', dept: 'Field Events & ABM', teamAccess: false },
    { email: 'mkt3@sentinelshield.ae', name: 'Dina Al-Mazrouei', role: 'MARKETING', dept: 'Product Marketing', teamAccess: false },

    { email: 'readonly1@sentinelshield.ae', name: 'Faisal Al-Nuaimi', role: 'READ_ONLY', dept: 'Finance Audit', teamAccess: false },
    { email: 'readonly2@sentinelshield.ae', name: 'Maya Sabbagh', role: 'READ_ONLY', dept: 'Delivery PMO', teamAccess: false },
    { email: 'readonly3@sentinelshield.ae', name: 'Hassan Barakat', role: 'READ_ONLY', dept: 'Board Advisory', teamAccess: false },
  ];

  const users: Record<string, { id: string; name: string; email: string }> = {};
  for (const u of userDefinitions) {
    const created = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash,
        role: u.role,
        department: u.dept,
        teamAccessGranted: u.teamAccess,
        phone: '+971 4 555 0100',
      },
    });
    users[u.email] = created;
  }

  const rep1 = users['rep1@sentinelshield.ae'];
  const rep2 = users['rep2@sentinelshield.ae'];
  const rep3 = users['rep3@sentinelshield.ae'];
  const mgr1 = users['manager1@sentinelshield.ae'];
  const mkt1 = users['mkt1@sentinelshield.ae'];
  const admin1 = users['admin1@sentinelshield.ae'];
  const owners = [rep1.id, rep2.id, rep3.id, mgr1.id];

  // 2. Services Catalog (6 core cybersecurity packages)
  const services = await Promise.all([
    prisma.serviceCatalogItem.create({
      data: {
        code: 'SVC-VAPT-WEB',
        name: 'Web & API Penetration Testing (PTES/OWASP)',
        category: 'OFFENSIVE_SECURITY',
        description: 'Manual + automated gray-box penetration testing for web portals, REST/GraphQL APIs, and mobile backends with executive & technical remediation retest.',
        unitType: 'PER_ASSET',
        unitPriceAED: 18500,
        unitPriceUSD: 5040,
        deliverables: JSON.stringify(['Executive Risk Summary', 'CVSS v3.1 Technical Findings', '1x Free Verification Retest']),
      },
    }),
    prisma.serviceCatalogItem.create({
      data: {
        code: 'SVC-NET-VAPT',
        name: 'External & Internal Infrastructure VAPT',
        category: 'OFFENSIVE_SECURITY',
        description: 'Comprehensive perimeter and internal Active Directory network vulnerability assessment & exploit validation.',
        unitType: 'PER_IP',
        unitPriceAED: 450,
        unitPriceUSD: 125,
        deliverables: JSON.stringify(['Attack Path Map', 'AD Hardening Checklist', 'Remediation Verification']),
      },
    }),
    prisma.serviceCatalogItem.create({
      data: {
        code: 'SVC-SOC-MDR',
        name: '24/7 Managed SOC & MDR Monitoring',
        category: 'MANAGED_SOC',
        description: 'Continuous endpoint, cloud, and firewall telemetry monitoring with 15-minute SLA containment from our Dubai Tier-3 SOC.',
        unitType: 'PER_USER',
        unitPriceAED: 95,
        unitPriceUSD: 26,
        deliverables: JSON.stringify(['24/7 Alert Triage', 'Monthly Threat Intel Brief', 'SOAR Playbook Containment']),
      },
    }),
    prisma.serviceCatalogItem.create({
      data: {
        code: 'SVC-SIEM-DEP',
        name: 'Enterprise SIEM Deployment & Tuning',
        category: 'MANAGED_SOC',
        description: 'End-to-end Microsoft Sentinel / Splunk architecture, log source onboarding, MITRE ATT&CK correlation rules, and custom dashboards.',
        unitType: 'FIXED_RETAINER',
        unitPriceAED: 145000,
        unitPriceUSD: 39500,
        deliverables: JSON.stringify(['SIEM Architecture Blueprint', '45 Custom Detection Rules', 'SOC Runbooks']),
      },
    }),
    prisma.serviceCatalogItem.create({
      data: {
        code: 'SVC-COMP-ISO',
        name: 'Compliance Consulting (ISO 27001 / NESA / PCI DSS)',
        category: 'COMPLIANCE',
        description: 'Gap assessment, ISMS policy drafting, risk register setup, and pre-audit readiness advisory for UAE IA/NESA, ISO 27001:2022, SOC 2, or PCI DSS 4.0.',
        unitType: 'PER_DAY',
        unitPriceAED: 5500,
        unitPriceUSD: 1500,
        deliverables: JSON.stringify(['Gap Analysis Matrix', 'Full ISMS Policy Suite', 'Mock Audit Walkthrough']),
      },
    }),
    prisma.serviceCatalogItem.create({
      data: {
        code: 'SVC-PHISH-SAT',
        name: 'Phishing Simulation & Security Awareness',
        category: 'AWARENESS',
        description: 'Bilingual (English & Arabic) monthly phishing campaigns, interactive micro-learning modules, and executive risk scorecards.',
        unitType: 'PER_USER',
        unitPriceAED: 35,
        unitPriceUSD: 9.5,
        deliverables: JSON.stringify(['Monthly Phishing Drills', 'Bilingual Training Portal', 'Department Risk Report']),
      },
    }),
  ]);

  // 3. Marketing Campaigns, Templates, Segments, Content Library
  const campaigns = await Promise.all([
    prisma.campaign.create({
      data: {
        name: 'GISEC Global Dubai Enterprise Pavilion',
        type: 'EVENT',
        status: 'COMPLETED',
        budget: 95000,
        currency: 'AED',
        startDate: new Date(Date.now() - 60 * 86400000),
        endDate: new Date(Date.now() - 45 * 86400000),
        targetIndustry: 'Banking & Finance',
        description: 'Executive booth & private CISO roundtable on UAE IA / NESA v2 & Managed MDR.',
        ownerId: mkt1.id,
      },
    }),
    prisma.campaign.create({
      data: {
        name: 'UAE NESA & ISO 27001:2022 Readiness Webinar',
        type: 'WEBINAR',
        status: 'ACTIVE',
        budget: 24000,
        currency: 'AED',
        startDate: new Date(Date.now() - 25 * 86400000),
        targetIndustry: 'Government',
        description: 'Live regulatory compliance deep-dive for GCC CISOs and Risk Officers.',
        ownerId: mkt1.id,
      },
    }),
    prisma.campaign.create({
      data: {
        name: 'LinkedIn CISO ABM — Managed SOC/MDR',
        type: 'LINKEDIN',
        status: 'ACTIVE',
        budget: 38000,
        currency: 'AED',
        startDate: new Date(Date.now() - 35 * 86400000),
        targetIndustry: 'Healthcare',
        description: 'Account-based sponsored outreach targeting hospital groups and fintech CISOs.',
        ownerId: mkt1.id,
      },
    }),
    prisma.campaign.create({
      data: {
        name: 'Q4 Ransomware Resilience Email Sequence',
        type: 'EMAIL',
        status: 'ACTIVE',
        budget: 12000,
        currency: 'AED',
        startDate: new Date(Date.now() - 18 * 86400000),
        targetIndustry: 'Retail',
        description: '3-touch outbound sequence offering complimentary perimeter attack-surface check.',
        ownerId: mkt1.id,
      },
    }),
    prisma.campaign.create({
      data: {
        name: 'MENA Threat Landscape Whitepaper 2026',
        type: 'CONTENT',
        status: 'ACTIVE',
        budget: 18500,
        currency: 'AED',
        startDate: new Date(Date.now() - 40 * 86400000),
        targetIndustry: 'Fintech',
        description: 'Gated research report covering API threats, supply chain attacks, and SOC benchmarks.',
        ownerId: mkt1.id,
      },
    }),
  ]);

  await prisma.emailTemplate.createMany({
    data: [
      {
        name: 'CISO VAPT Scoping Intro',
        subject: 'Preparing {{companyName}} for upcoming {{serviceInterest}}',
        body: 'Dear {{firstName}},\n\nWith new regulatory mandates across {{industry}}, many teams are reviewing their {{serviceInterest}} posture ahead of Q1 audits.\n\nAt SentinelShield Cyber, our CREST-aligned consultants help organizations like {{companyName}} uncover critical exposure paths within 10 business days.\n\nWould you be open to a 20-minute scoping briefing this week?\n\nBest regards,\n{{senderName}}',
        category: 'OUTREACH',
        mergeFields: JSON.stringify(['firstName', 'companyName', 'serviceInterest', 'industry', 'senderName']),
        createdById: mkt1.id,
      },
      {
        name: 'Proposal Follow-Up (72h)',
        subject: 'Following up: {{companyName}} Cybersecurity Proposal',
        body: 'Hi {{firstName}},\n\nI wanted to check in on the {{serviceInterest}} proposal we shared earlier this week for {{companyName}}. Please let me know if your procurement or technical team needs any SLA clarifications.\n\nRegards,\n{{senderName}}',
        category: 'PROPOSAL_FOLLOWUP',
        mergeFields: JSON.stringify(['firstName', 'companyName', 'serviceInterest', 'senderName']),
        createdById: mkt1.id,
      },
      {
        name: 'Managed SOC Renewal Briefing',
        subject: 'Annual Threat Review & Renewal — {{companyName}}',
        body: 'Hello {{firstName}},\n\nAs your annual Managed SOC term approaches renewal, we have compiled {{companyName}}\'s 12-month containment metrics and recommended MITRE ATT&CK coverage upgrades.\n\nWarm regards,\n{{senderName}}',
        category: 'RENEWAL',
        mergeFields: JSON.stringify(['firstName', 'companyName', 'senderName']),
        createdById: mkt1.id,
      },
    ],
  });

  await prisma.audienceSegment.createMany({
    data: [
      {
        name: 'Regulated Banking & Fintech CISOs',
        description: 'Financial services prospects requiring PCI DSS 4.0, SWIFT, or VAPT.',
        criteriaIndustry: 'Banking & Finance',
        criteriaService: 'VAPT',
        createdById: mkt1.id,
      },
      {
        name: 'Healthcare Managed SOC Prospects',
        description: 'Hospital networks interested in 24/7 MDR & ransomware containment.',
        criteriaIndustry: 'Healthcare',
        criteriaService: 'SOC',
        createdById: mkt1.id,
      },
      {
        name: 'Late-Stage Proposal Pipeline',
        description: 'All active deals currently in Proposal or Negotiation.',
        criteriaStage: 'PROPOSAL',
        createdById: mkt1.id,
      },
    ],
  });

  await prisma.contentAsset.createMany({
    data: [
      {
        title: 'UAE IA / NESA Compliance Acceleration Guide 2026',
        type: 'WHITEPAPER',
        serviceCategory: 'COMPLIANCE',
        summary: 'Step-by-step control mapping for UAE critical infrastructure and government entities.',
        url: 'https://sentinelshield.ae/resources/uae-nesa-guide-2026.pdf',
        downloads: 184,
      },
      {
        title: 'Case Study: Tier-1 Gulf Bank 24/7 SOC Migration',
        type: 'CASE_STUDY',
        serviceCategory: 'MANAGED_SOC',
        summary: 'How a 4,200-endpoint bank reduced MTTR from 4 hours to 11 minutes with SentinelShield MDR.',
        url: 'https://sentinelshield.ae/resources/gulf-bank-soc-case-study.pdf',
        downloads: 142,
      },
      {
        title: 'VAPT & Red Teaming Scope Matrix Datasheet',
        type: 'DATASHEET',
        serviceCategory: 'OFFENSIVE_SECURITY',
        summary: 'Detailed methodology, rules of engagement, and deliverables for web, mobile, and AD pentests.',
        url: 'https://sentinelshield.ae/resources/vapt-datasheet.pdf',
        downloads: 239,
      },
      {
        title: 'Board-Ready Incident Response Playbook',
        type: 'PLAYBOOK',
        serviceCategory: 'MANAGED_SOC',
        summary: 'Crisis communication and regulatory notification checklist for ransomware events.',
        url: 'https://sentinelshield.ae/resources/ir-playbook.pdf',
        downloads: 97,
      },
    ],
  });

  // 4. 15 Accounts
  const accountSeeds = [
    { name: 'Emirates Crescent Bank', industry: 'Banking & Finance', size: 'ENTERPRISE', country: 'UAE', reqs: ['PCI DSS', 'NESA/UAE IA', 'ISO 27001'], stack: 'CrowdStrike Falcon, Palo Alto NGFW, Splunk SIEM', vuln: 'Legacy SWIFT gateway requires quarterly external VAPT; 2 unpatched jump hosts flagged in Q3.', health: 'HEALTHY', rev: 1800000000, owner: rep1.id },
    { name: 'Al Noor Healthcare Group', industry: 'Healthcare', size: 'ENTERPRISE', country: 'UAE', reqs: ['ISO 27001', 'GDPR', 'NESA/UAE IA'], stack: 'SentinelOne EDR, Fortinet FortiGate, Microsoft 365 E5', vuln: 'HL7 DICOM medical imaging VLAN segmentation audit pending remediation.', health: 'AT_RISK', rev: 620000000, owner: rep1.id },
    { name: 'Abu Dhabi Digital Logistics Authority', industry: 'Government', size: 'GOVERNMENT', country: 'UAE', reqs: ['NESA/UAE IA', 'ISO 27001'], stack: 'Microsoft Sentinel, Defender for Endpoint, Cisco Firepower', vuln: 'External API gateway rate-limiting bypass resolved; retest scheduled next month.', health: 'HEALTHY', rev: 950000000, owner: rep3.id },
    { name: 'Desert Oasis Retail Holdings', industry: 'Retail', size: 'MID_MARKET', country: 'UAE', reqs: ['PCI DSS', 'GDPR'], stack: 'Sophos Intercept X, Cloudflare WAF, Meraki MX', vuln: 'POS terminal flat subnet isolation needs firewall ACL enforcement across 42 stores.', health: 'CRITICAL', rev: 280000000, owner: rep2.id },
    { name: 'FalconPay Financial Technologies', industry: 'Fintech', size: 'MID_MARKET', country: 'UAE', reqs: ['PCI DSS', 'SOC 2', 'ISO 27001'], stack: 'AWS Security Hub, Datadog Cloud SIEM, Wiz', vuln: 'GraphQL introspection disabled; IAM cross-account role trust policy under review.', health: 'HEALTHY', rev: 145000000, owner: rep1.id },
    { name: 'Gulf Horizon Energy Corp', industry: 'Energy & Utilities', size: 'ENTERPRISE', country: 'Saudi Arabia', reqs: ['ISO 27001', 'NESA/UAE IA'], stack: 'Nozomi Networks OT, QRadar SIEM, Palo Alto Panorama', vuln: 'OT/ICS historian remote access relies on legacy VPN concentrator.', health: 'AT_RISK', rev: 2400000000, owner: rep3.id },
    { name: 'Riyadh Commercial Clearing House', industry: 'Banking & Finance', size: 'ENTERPRISE', country: 'Saudi Arabia', reqs: ['PCI DSS', 'ISO 27001', 'SOC 2'], stack: 'Trellix EDR, Splunk Enterprise Security, F5 ASM', vuln: 'Privilege escalation path via Misconfigured AD CS template identified in red team.', health: 'HEALTHY', rev: 1100000000, owner: mgr1.id },
    { name: 'Crescent Medical Clinics Network', industry: 'Healthcare', size: 'MID_MARKET', country: 'UAE', reqs: ['ISO 27001'], stack: 'Bitdefender GravityZone, SonicWall NSA', vuln: 'Phishing click rate 19% in Q2 baseline; awareness training deployed.', health: 'HEALTHY', rev: 95000000, owner: rep2.id },
    { name: 'Meridian Sovereign Cloud Services', industry: 'Technology', size: 'ENTERPRISE', country: 'UAE', reqs: ['SOC 2', 'ISO 27001', 'GDPR'], stack: 'Prisma Cloud, CrowdStrike, Elastic Security', vuln: 'Kubernetes RBAC cluster-admin binding audit clean; SOC 2 Type II readiness 88%.', health: 'HEALTHY', rev: 410000000, owner: rep1.id },
    { name: 'Al-Bahr Maritime & Ports', industry: 'Logistics', size: 'GOVERNMENT', country: 'Oman', reqs: ['ISO 27001', 'NESA/UAE IA'], stack: 'Darktrace, Check Point Quantum, IBM QRadar', vuln: 'Terminal crane telemetry subnet lacks behavioral anomaly baselining.', health: 'AT_RISK', rev: 740000000, owner: rep3.id },
    { name: 'Lumina Luxury E-Commerce', industry: 'Retail', size: 'SMB', country: 'UAE', reqs: ['PCI DSS', 'GDPR'], stack: 'Cloudflare Enterprise, SentinelOne', vuln: 'Third-party checkout script integrity monitoring (CSP/SRI) incomplete.', health: 'HEALTHY', rev: 48000000, owner: rep2.id },
    { name: 'Atlas Capital Asset Management', industry: 'Banking & Finance', size: 'MID_MARKET', country: 'UK', reqs: ['SOC 2', 'GDPR', 'ISO 27001'], stack: 'Microsoft Defender XDR, Sentinel SIEM, Proofpoint', vuln: 'SPF/DMARC enforcement p=none on secondary investor portal domain.', health: 'HEALTHY', rev: 310000000, owner: rep3.id },
    { name: 'MedCore Diagnostics Lab', industry: 'Healthcare', size: 'SMB', country: 'UAE', reqs: ['ISO 27001'], stack: 'ESET Protect, WatchGuard Firebox', vuln: 'Backup immutability test failed on secondary NAS; urgent remediation open.', health: 'CRITICAL', rev: 34000000, owner: rep2.id },
    { name: 'SkyBridge Aviation Services', industry: 'Logistics', size: 'ENTERPRISE', country: 'Qatar', reqs: ['ISO 27001', 'PCI DSS'], stack: 'Carbon Black, Palo Alto Cortex XDR, Splunk', vuln: 'Crew scheduling mobile API requires OAuth PKCE upgrade.', health: 'HEALTHY', rev: 560000000, owner: mgr1.id },
    { name: 'Vertex Industrial Manufacturing', industry: 'Manufacturing', size: 'MID_MARKET', country: 'UAE', reqs: ['ISO 27001'], stack: 'Fortinet FortiEDR, FortiSIEM', vuln: 'Legacy ERP server on Windows Server 2016 isolated behind micro-segmentation.', health: 'HEALTHY', rev: 175000000, owner: rep1.id },
  ];

  const accounts = [];
  for (const a of accountSeeds) {
    const acc = await prisma.account.create({
      data: {
        name: a.name,
        industry: a.industry,
        size: a.size,
        country: a.country,
        website: `https://www.${a.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        complianceReqs: JSON.stringify(a.reqs),
        securityStack: a.stack,
        vulnerabilityNotes: a.vuln,
        healthStatus: a.health,
        annualRevenue: a.rev,
        tags: JSON.stringify([a.industry, a.country]),
        notes: `Key strategic ${a.industry} account managed by SentinelShield Cyber.`,
        attachments: JSON.stringify([
          {
            name: `${a.name.replace(/\s+/g, '_')}_NDA_2026.pdf`,
            size: '420 KB',
            type: 'application/pdf',
            url: '#nda-archived',
            uploadedAt: new Date(Date.now() - 20 * 86400000).toISOString(),
          },
        ]),
        ownerId: a.owner,
      },
    });
    accounts.push(acc);
  }

  // 5. Contacts (22 contacts across accounts)
  const contactRoles = ['CISO', 'IT_MANAGER', 'CFO', 'PROCUREMENT', 'CTO'];
  const firstNames = ['Rashid', 'Amira', 'Tariq', 'Salma', 'Khalid', 'Noura', 'Fadi', 'Leila', 'Mansoor', 'Reem', 'Samir', 'Dana', 'Youssef', 'Huda', 'Nabil', 'Mariam', 'Adel', 'Lina', 'Waleed', 'Sara', 'Imran', 'Fatima'];
  const lastNames = ['Al-Maktoum', 'Al-Farsi', 'Khoury', 'Al-Qasimi', 'Haddad', 'Al-Sharif', 'Mansour', 'Al-Dhaheri', 'Sabbagh', 'Al-Ghamdi', 'Nassar', 'Al-Zaabi', 'Darwish', 'Al-Harthi', 'Qureshi', 'Al-Rashed', 'Zayed', 'Al-Amri', 'Karam', 'Al-Ketbi', 'Farooq', 'Al-Muhairi'];

  const contacts = [];
  for (let i = 0; i < 22; i++) {
    const acc = accounts[i % accounts.length];
    const role = contactRoles[i % contactRoles.length];
    const c = await prisma.contact.create({
      data: {
        firstName: firstNames[i],
        lastName: lastNames[i],
        email: `${firstNames[i].toLowerCase()}.${lastNames[i].toLowerCase().replace(/[^a-z]/g, '')}@${acc.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 12)}.ae`,
        phone: `+971 50 ${100 + i} ${4000 + i * 13}`,
        role,
        jobTitle: role === 'CISO' ? 'Chief Information Security Officer' : role === 'IT_MANAGER' ? 'Head of IT Infrastructure' : role === 'CFO' ? 'Chief Financial Officer' : role === 'CTO' ? 'Chief Technology Officer' : 'IT Procurement Lead',
        isDecisionMaker: role === 'CISO' || role === 'CFO' || role === 'CTO',
        linkedinUrl: `https://linkedin.com/in/${firstNames[i].toLowerCase()}-${lastNames[i].toLowerCase()}`,
        accountId: acc.id,
        ownerId: acc.ownerId,
      },
    });
    contacts.push(c);
  }

  // 6. 30 Leads
  const leadIndustries = ['Banking & Finance', 'Healthcare', 'Government', 'Retail', 'Fintech', 'Energy & Utilities', 'Logistics', 'Technology'];
  const leadSources = ['WEBINAR', 'LINKEDIN', 'EMAIL_CAMPAIGN', 'EVENT', 'INBOUND_WEB', 'PARTNER', 'COLD_OUTREACH'];
  const leadStatuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED'];
  const leadSizes = ['SMB', 'MID_MARKET', 'ENTERPRISE', 'GOVERNMENT'];
  const leadServices = [
    'Web & API Penetration Testing',
    '24/7 Managed SOC / MDR',
    'ISO 27001 & NESA Compliance',
    'SIEM Deployment (Sentinel)',
    'Phishing Simulation & Awareness',
    'Firewall & EDR Licensing',
  ];
  const leadCompanies = [
    'DIFC Wealth Partners', 'Gulf Care Hospitals', 'Sharjah Smart Mobility', 'Al-Futtaim Horizon Tech',
    'Crescent Takaful Insurance', 'Arabian Grid Solutions', 'Oasis Pharmacies Group', 'Mina Logistics Hub',
    'Zayed Innovation Labs', 'Pearl Hospitality Group', 'Nomad FinServe', 'Bahrain National Exchange',
    'Kuwait MedTech Systems', 'Muscat Sovereign Telecom', 'Al-Amal Microfinance', 'Vanguard Retail Co',
    'Sahara Solar Energy', 'Royal Falcon Aviation', 'Delta Maritime Shipping', 'Apex Cloud Hosting',
    'Al-Qudra Construction', 'Horizon BioLabs', 'Emerald Payment Rail', 'Gulf Media Networks',
    'Cedar Capital Partners', 'Buraq Express Cargo', 'Nile Digital Banking', 'Phoenix Petrochem',
    'Starlight Cinema Group', 'Metro Health Clinics',
  ];

  for (let i = 0; i < 30; i++) {
    const companySize = leadSizes[i % leadSizes.length];
    const industry = leadIndustries[i % leadIndustries.length];
    const currency = i % 4 === 0 ? 'USD' : 'AED';
    const estimatedBudget = currency === 'USD' ? 25000 + (i % 6) * 15000 : 75000 + (i % 7) * 55000;
    const engagementScore = 35 + ((i * 11) % 62);
    const status = leadStatuses[i % leadStatuses.length];
    const source = leadSources[i % leadSources.length];
    const serviceInterest = leadServices[i % leadServices.length];
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[(i + 5) % lastNames.length];
    const score = computeLeadScore({ companySize, industry, estimatedBudget, currency, engagementScore });

    await prisma.lead.create({
      data: {
        firstName: fn,
        lastName: ln,
        email: `${fn.toLowerCase()}.${ln.toLowerCase().replace(/[^a-z]/g, '')}${i}@example-b2b.ae`,
        phone: `+971 55 ${200 + i} ${3100 + i * 7}`,
        companyName: leadCompanies[i],
        jobTitle: i % 3 === 0 ? 'CISO' : i % 3 === 1 ? 'IT Security Manager' : 'VP Infrastructure',
        industry,
        companySize,
        country: i % 5 === 0 ? 'Saudi Arabia' : i % 6 === 0 ? 'UK' : 'UAE',
        source,
        serviceInterest,
        estimatedBudget,
        currency,
        engagementScore,
        score,
        status,
        tags: JSON.stringify([industry, i % 2 === 0 ? 'Q4 Priority' : 'Outbound']),
        notes: `Interested in ${serviceInterest} for ${companySize} environment.`,
        ownerId: owners[i % owners.length],
        campaignId: campaigns[i % campaigns.length].id,
      },
    });
  }

  // 7. 20 Deals across all 7 stages
  const dealSpecs = [
    { title: 'Emirates Crescent Bank — 24/7 Managed SOC', stage: 'NEGOTIATION', svc: 'Managed SOC/MDR', val: 640000, cur: 'AED', prob: 85, accIdx: 0, daysOffset: 18 },
    { title: 'Al Noor Healthcare — Hospital Network VAPT', stage: 'PROPOSAL', svc: 'VAPT & Penetration Testing', val: 185000, cur: 'AED', prob: 65, accIdx: 1, daysOffset: 24 },
    { title: 'AD Digital Logistics — NESA/UAE IA Readiness', stage: 'SCOPING', svc: 'Compliance Consulting', val: 310000, cur: 'AED', prob: 45, accIdx: 2, daysOffset: 38 },
    { title: 'Desert Oasis Retail — PCI DSS 4.0 & POS Hardening', stage: 'PROPOSAL', svc: 'Compliance Consulting', val: 220000, cur: 'AED', prob: 60, accIdx: 3, daysOffset: 14 },
    { title: 'FalconPay — API & Cloud Red Team Exercise', stage: 'CLOSED_WON', svc: 'Penetration Testing', val: 145000, cur: 'AED', prob: 100, accIdx: 4, daysOffset: -10 },
    { title: 'Gulf Horizon Energy — OT/ICS SIEM Deployment', stage: 'DISCOVERY', svc: 'SIEM Deployment', val: 520000, cur: 'AED', prob: 25, accIdx: 5, daysOffset: 65 },
    { title: 'Riyadh Clearing House — Annual Red Teaming', stage: 'CLOSED_WON', svc: 'Penetration Testing', val: 95000, cur: 'USD', prob: 100, accIdx: 6, daysOffset: -5 },
    { title: 'Crescent Clinics — Phishing & Awareness Suite', stage: 'CLOSED_WON', svc: 'Phishing & Awareness', val: 68000, cur: 'AED', prob: 100, accIdx: 7, daysOffset: -14 },
    { title: 'Meridian Sovereign Cloud — SOC 2 Type II Advisory', stage: 'NEGOTIATION', svc: 'Compliance Consulting', val: 275000, cur: 'AED', prob: 80, accIdx: 8, daysOffset: 12 },
    { title: 'Al-Bahr Maritime — Maritime SOC Onboarding', stage: 'PROSPECTING', svc: 'Managed SOC/MDR', val: 480000, cur: 'AED', prob: 15, accIdx: 9, daysOffset: 85 },
    { title: 'Lumina E-Commerce — Storefront Web VAPT', stage: 'CLOSED_WON', svc: 'VAPT & Penetration Testing', val: 54000, cur: 'AED', prob: 100, accIdx: 10, daysOffset: -8 },
    { title: 'Atlas Capital UK — Microsoft Sentinel MDR', stage: 'PROPOSAL', svc: 'Managed SOC/MDR', val: 112000, cur: 'USD', prob: 70, accIdx: 11, daysOffset: 29 },
    { title: 'MedCore Labs — Endpoint EDR & Firewall Refresh', stage: 'SCOPING', svc: 'Firewall & EDR Licensing', val: 135000, cur: 'AED', prob: 45, accIdx: 12, daysOffset: 33 },
    { title: 'SkyBridge Aviation — Crew Portal Pen Test', stage: 'DISCOVERY', svc: 'Penetration Testing', val: 165000, cur: 'AED', prob: 30, accIdx: 13, daysOffset: 50 },
    { title: 'Vertex Manufacturing — ISO 27001 Certification', stage: 'PROSPECTING', svc: 'Compliance Consulting', val: 190000, cur: 'AED', prob: 20, accIdx: 14, daysOffset: 75 },
    { title: 'Emirates Crescent Bank — ATM Fleet VAPT', stage: 'CLOSED_LOST', svc: 'VAPT & Penetration Testing', val: 210000, cur: 'AED', prob: 0, accIdx: 0, daysOffset: -12, lostReason: 'Budget deferred to Q2 cycle' },
    { title: 'Al Noor Healthcare — Phishing Bilingual Rollout', stage: 'NEGOTIATION', svc: 'Phishing & Awareness', val: 118000, cur: 'AED', prob: 85, accIdx: 1, daysOffset: 9 },
    { title: 'FalconPay — 24/7 Cloud MDR Retainer', stage: 'SCOPING', svc: 'Managed SOC/MDR', val: 340000, cur: 'AED', prob: 50, accIdx: 4, daysOffset: 42 },
    { title: 'Desert Oasis Retail — SIEM Managed Integration', stage: 'CLOSED_LOST', svc: 'SIEM Deployment', val: 290000, cur: 'AED', prob: 0, accIdx: 3, daysOffset: -18, lostReason: 'Lost to incumbent telecom MSSP bundle' },
    { title: 'Meridian Sovereign Cloud — Penetration Retainer', stage: 'CLOSED_WON', svc: 'Penetration Testing', val: 240000, cur: 'AED', prob: 100, accIdx: 8, daysOffset: -3 },
  ];

  const deals = [];
  for (let i = 0; i < dealSpecs.length; i++) {
    const ds = dealSpecs[i];
    const acc = accounts[ds.accIdx];
    const accContacts = contacts.filter((c) => c.accountId === acc.id).map((c) => c.id);
    const deal = await prisma.deal.create({
      data: {
        title: ds.title,
        stage: ds.stage,
        serviceType: ds.svc,
        value: ds.val,
        currency: ds.cur,
        probability: ds.prob,
        expectedCloseDate: new Date(Date.now() + ds.daysOffset * 86400000),
        competitors: i % 2 === 0 ? 'CyberKnight MSSP, Big4 Advisory' : 'HelpAG, Regional Integrator',
        lostReason: ds.lostReason || null,
        internalMargin: 34 + (i % 15),
        tags: JSON.stringify([ds.svc, acc.country]),
        notes: `Multi-stakeholder evaluation involving ${acc.name} CISO & Procurement.`,
        stakeholderIds: JSON.stringify(accContacts),
        stageChangedAt: new Date(Date.now() - Math.abs(ds.daysOffset % 10) * 86400000),
        accountId: acc.id,
        ownerId: acc.ownerId,
        campaignId: campaigns[i % campaigns.length].id,
      },
    });
    deals.push(deal);
  }

  // 8. Quotes (6 quotes across DRAFT, SENT, ACCEPTED, REJECTED)
  const quoteStatuses = ['SENT', 'ACCEPTED', 'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'];
  for (let i = 0; i < 6; i++) {
    const deal = deals[i];
    const svc = services[i % services.length];
    const qty = svc.unitType === 'PER_USER' ? 450 : svc.unitType === 'PER_IP' ? 120 : 4;
    const unitPrice = deal.currency === 'USD' ? svc.unitPriceUSD : svc.unitPriceAED;
    const subtotal = qty * unitPrice;
    const discount = i % 2 === 0 ? 5 : 0;
    const tax = 5;
    const total = Math.round(subtotal * (1 - discount / 100) * (1 + tax / 100) * 100) / 100;

    await prisma.quote.create({
      data: {
        quoteNumber: `QT-2026-${1041 + i}`,
        title: `${deal.title} — Commercial Proposal`,
        status: quoteStatuses[i],
        currency: deal.currency,
        discountPercent: discount,
        taxPercent: tax,
        subtotal,
        total,
        validUntil: new Date(Date.now() + 30 * 86400000),
        terms: '50% upon SOW signature, 50% upon final executive report delivery. Net 30 days.',
        sensitiveTerms: 'Includes complimentary 1x emergency IR tabletop session.',
        sentAt: quoteStatuses[i] !== 'DRAFT' ? new Date(Date.now() - 4 * 86400000) : null,
        dealId: deal.id,
        accountId: deal.accountId,
        ownerId: deal.ownerId,
        items: {
          create: [
            {
              serviceId: svc.id,
              description: svc.name,
              unitType: svc.unitType,
              quantity: qty,
              unitPrice,
              total: subtotal,
            },
          ],
        },
      },
    });
  }

  // 9. Contracts & Renewals (8 contracts with 20, 45, 75, 180 day renewals)
  const contractOffsets = [22, 48, 76, 190, 250, 310, 15, 120];
  for (let i = 0; i < 8; i++) {
    const acc = accounts[i];
    const daysLeft = contractOffsets[i];
    const endDate = new Date(Date.now() + daysLeft * 86400000);
    const startDate = new Date(endDate.getTime() - 365 * 86400000);
    const totalVal = 180000 + i * 65000;
    const mrr = Math.round((totalVal / 12) * 100) / 100;
    const status = daysLeft <= 60 ? 'EXPIRING_SOON' : 'ACTIVE';

    await prisma.contract.create({
      data: {
        contractNumber: `CTR-2026-${301 + i}`,
        title: `${acc.name} — Annual Managed Security Agreement`,
        accountId: acc.id,
        dealId: deals[i].id,
        ownerId: acc.ownerId,
        startDate,
        endDate,
        autoRenew: i % 3 !== 0,
        renewalNoticeDays: 60,
        billingCycle: i % 2 === 0 ? 'ANNUAL' : 'MONTHLY',
        mrr,
        arr: totalVal,
        totalValue: totalVal,
        currency: 'AED',
        status,
        sensitiveTerms: '15-min P1 SOC containment SLA; 2% annual CPI cap.',
      },
    });
  }

  // 10. Engagements / Delivery Projects (5 linked to Won deals)
  const wonDeals = deals.filter((d) => d.stage === 'CLOSED_WON');
  const engStatuses = ['IN_PROGRESS', 'REPORTING', 'DELIVERED', 'KICKOFF', 'COMPLETED'];
  for (let i = 0; i < wonDeals.length; i++) {
    const d = wonDeals[i];
    await prisma.engagement.create({
      data: {
        title: `${d.title} — Delivery`,
        dealId: d.id,
        accountId: d.accountId,
        scope: `Execution of ${d.serviceType} including rules of engagement sign-off, testing/onboarding, and executive readout.`,
        assignedConsultants: JSON.stringify(['Samir Al-Khatib (Lead OSCP)', 'Rania Mansoor (GRC)']),
        startDate: new Date(Date.now() - (15 - i * 2) * 86400000),
        endDate: new Date(Date.now() + (20 + i * 7) * 86400000),
        status: engStatuses[i % engStatuses.length],
        reportDelivered: i === 2 || i === 4,
        reportDeliveredAt: i === 2 || i === 4 ? new Date(Date.now() - 2 * 86400000) : null,
        notes: 'Weekly status sync scheduled every Tuesday 10:00 GST.',
      },
    });
  }

  // 11. Activities & Tasks (24 items across calendar & due today)
  const actTypes = ['TASK', 'CALL', 'MEETING', 'EMAIL', 'NOTE'];
  const actSubjects = [
    'Review VAPT rules of engagement with CISO',
    'Follow up on Managed SOC commercial pricing',
    'Technical architecture walkthrough (SIEM connectors)',
    'Send NESA compliance gap checklist',
    'Executive sponsor check-in before procurement board',
    'Prepare renewal QBR slide deck',
    'Confirm firewall licensing seat count',
    'Log notes from security committee demo',
  ];
  for (let i = 0; i < 24; i++) {
    const deal = deals[i % deals.length];
    const type = actTypes[i % actTypes.length];
    const dayOffset = i < 5 ? 0 : (i % 18) - 4; // First 5 tasks/activities due today
    await prisma.activity.create({
      data: {
        type,
        subject: actSubjects[i % actSubjects.length],
        description: `Scheduled ${type.toLowerCase()} for ${deal.title}.`,
        dueDate: new Date(Date.now() + dayOffset * 86400000),
        completed: i > 16,
        completedAt: i > 16 ? new Date() : null,
        priority: i % 3 === 0 ? 'HIGH' : 'MEDIUM',
        autoGenerated: i === 1,
        dealId: deal.id,
        accountId: deal.accountId,
        ownerId: deal.ownerId,
      },
    });
  }

  // 12. Support Tickets (8 items)
  const ticketSpecs = [
    { subj: 'SOC Alert Escalation: Suspicious PowerShell on DC-02', cat: 'SOC_ALERT', prio: 'CRITICAL', status: 'IN_PROGRESS', accIdx: 1 },
    { subj: 'Request verification retest for patched /api/v2/auth endpoint', cat: 'PEN_TEST_RETEST', prio: 'HIGH', status: 'OPEN', accIdx: 0 },
    { subj: 'Add 120 EDR licenses for new Abu Dhabi branch', cat: 'LICENSING', prio: 'MEDIUM', status: 'OPEN', accIdx: 3 },
    { subj: 'NESA Control T3.4.2 evidence clarification', cat: 'COMPLIANCE_ADVISORY', prio: 'MEDIUM', status: 'RESOLVED', accIdx: 2 },
    { subj: 'Splunk forwarder heartbeat drop on DMZ proxy', cat: 'SOC_ALERT', prio: 'HIGH', status: 'IN_PROGRESS', accIdx: 5 },
    { subj: 'Quarterly executive threat briefing deck request', cat: 'GENERAL', prio: 'LOW', status: 'CLOSED', accIdx: 6 },
    { subj: 'Phishing campaign whitelist IP update for O365', cat: 'GENERAL', prio: 'MEDIUM', status: 'RESOLVED', accIdx: 7 },
    { subj: 'Urgent NAS backup immutability advisory', cat: 'COMPLIANCE_ADVISORY', prio: 'CRITICAL', status: 'OPEN', accIdx: 12 },
  ];
  for (let i = 0; i < ticketSpecs.length; i++) {
    const t = ticketSpecs[i];
    const acc = accounts[t.accIdx];
    await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-${40210 + i}`,
        subject: t.subj,
        description: `Customer request logged for ${acc.name}. Assigned to SentinelShield Delivery & SecOps coordination.`,
        category: t.cat,
        priority: t.prio,
        status: t.status,
        accountId: acc.id,
        ownerId: acc.ownerId,
      },
    });
  }

  // 13. Initial Audit Logs
  await prisma.auditLog.createMany({
    data: [
      {
        userId: admin1.id,
        userEmail: admin1.email,
        userRole: 'ADMIN',
        action: 'LOGIN',
        entityType: 'Auth',
        details: 'Initial security baseline audit verification',
        ipAddress: '127.0.0.1',
      },
      {
        userId: mgr1.id,
        userEmail: mgr1.email,
        userRole: 'SALES_MANAGER',
        action: 'VIEW_SENSITIVE',
        entityType: 'Account',
        entityId: accounts[0].id,
        details: 'Reviewed Emirates Crescent Bank vulnerability posture notes',
        ipAddress: '127.0.0.1',
      },
      {
        userId: rep1.id,
        userEmail: rep1.email,
        userRole: 'SALES_REP',
        action: 'CREATE',
        entityType: 'Quote',
        details: 'Generated commercial proposal QT-2026-1041',
        ipAddress: '127.0.0.1',
      },
    ],
  });

  console.log('Seed complete: 15 users, 30 leads, 15 accounts, 22 contacts, 20 deals, 6 services, 6 quotes, 8 contracts, 5 engagements, 5 campaigns, 24 activities, 8 tickets.');
}

// Execute when run directly via `tsx prisma/seed.ts`
const isDirectRun = process.argv[1]?.includes('seed');
if (isDirectRun) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
