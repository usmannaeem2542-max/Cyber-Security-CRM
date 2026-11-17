# SentinelShield Cyber CRM

Full-stack B2B CRM tailored for cybersecurity & managed IT service providers (VAPT, Managed SOC/MDR, SIEM deployment, ISO 27001/SOC 2/PCI DSS/NESA compliance consulting, phishing awareness, and managed licensing).

## Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4 (Light/Dark themes + English & Arabic RTL support + AED/USD currency switcher), Recharts, jsPDF + jspdf-autotable
- **Backend**: Node.js + Express REST API (`server.ts`)
- **Database**: SQLite via Prisma ORM (`prisma/schema.prisma`) — runs locally with zero external services
- **Security**: `bcryptjs` password hashing, JWT access + HttpOnly refresh token rotation, optional TOTP 2FA (`otplib` + `qrcode`), Zod input validation & sanitization, `helmet`, `cors`, `express-rate-limit`, CSRF double-submit token validation, RBAC + record-level ownership + field-level sensitive redaction, and immutable `AuditLog`.

## Local Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Update `JWT_SECRET` and `JWT_REFRESH_SECRET` in `.env` with strong random values for production.

3. **Initialize & migrate SQLite database**
   ```bash
   npx prisma generate
   npm run db:push
   ```

4. **Seed realistic demo data**
   *(Seeds 15 users [3 per role], 30 leads, 15 accounts, 22 contacts, 20 deals across all 7 stages, 6 catalog services, 6 quotes, 8 contracts, 5 engagements, 5 marketing campaigns, templates, segments, content assets, 24 activities, and 8 support tickets.)*
   ```bash
   npm run db:seed
   ```

5. **Run in development**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`.

6. **Build & run for production**
   ```bash
   npm run build
   npm start
   ```

## Default Login Credentials (Seeded)

All seeded accounts share the demo password: **`Password123!`**

| Role | Email | Access Scope |
| :--- | :--- | :--- |
| **Admin** | `admin1@sentinelshield.ae` | Full system, RBAC user provisioning, Audit Log, sensitive fields |
| **Sales Manager** | `manager1@sentinelshield.ae` | Full team pipeline, assignment, reports, sensitive fields |
| **Sales Rep (Own Only)** | `rep1@sentinelshield.ae` | Restricted to own assigned records & own sensitive notes |
| **Sales Rep (Team Access)** | `rep3@sentinelshield.ae` | Granted cross-team visibility by Manager/Admin |
| **Marketing** | `mkt1@sentinelshield.ae` | Campaigns, ROI attribution, templates, segments, content, leads |
| **Read-Only** | `readonly1@sentinelshield.ae` | Read-only CRM access; mutations and sensitive fields blocked |

## Key Architecture & Security Highlights
- **Follow-up Automation**: Changing a Quote status to `SENT` automatically creates a high-priority follow-up Task due in 3 days.
- **Field-Level Protection**: Account vulnerability notes (`vulnerabilityNotes`), Deal margins (`internalMargin`), and sensitive contract terms (`sensitiveTerms`) are redacted for unauthorized roles, and explicit reveals log a `VIEW_SENSITIVE` entry in `AuditLog`.
- **CSV & Branded PDF Exports**: Leads, Reports, and Commercial Quotes export cleanly to CSV/PDF and log `EXPORT` events to the Audit Trail.
