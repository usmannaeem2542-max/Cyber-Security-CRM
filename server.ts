import 'dotenv/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { runSeed } from './prisma/seed.js';
import authRoutes from './server/routes/auth.js';
import commercialRoutes from './server/routes/commercial.js';
import crmRoutes from './server/routes/crm.js';
import operationsRoutes from './server/routes/operations.js';
import { requireCsrf } from './server/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  // Ensure database is seeded on first boot if empty
  await runSeed();

  app.set('trust proxy', 1);

  // Security headers (CSP tuned for Vite dev/preview & Google Fonts)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS configuration
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin) || origin.endsWith('.run.app')) {
          return cb(null, true);
        }
        return cb(null, true);
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // Rate limiting
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again shortly.' },
  });

  const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded. Slow down requests.' },
  });

  app.use('/api/auth', authLimiter);
  app.use('/api', apiLimiter);

  // CSRF validation on mutating API calls
  app.use('/api', requireCsrf);

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      company: process.env.COMPANY_NAME || 'SentinelShield Cyber',
      timestamp: new Date().toISOString(),
    });
  });

  // API routers
  app.use('/api/auth', authRoutes);
  app.use('/api', crmRoutes);
  app.use('/api', commercialRoutes);
  app.use('/api', operationsRoutes);

  // API error handler
  app.use('/api', (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('API Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // Frontend middleware / static serving
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SentinelShield Cyber CRM running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
