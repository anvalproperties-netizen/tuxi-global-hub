import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// If executed via bare "node server.ts", respawn under Node with tsx loader
if (!process.env.TSX_ACTIVE && !process.execArgv.some(a => a.includes('tsx'))) {
  const child = spawn(process.execPath, ['--import', 'tsx', __filename, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, TSX_ACTIVE: 'true' }
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
  // Keep event loop alive while child runs
  await new Promise(() => {});
}

// When tsx loader is active, dynamically load TypeScript modules
const { processAILocationDetection } = await import('./src/utils/aiLocationProcessor.js');
const { processAIVoiceSearch } = await import('./src/utils/aiVoiceSearchProcessor.js');
const { apiRouter } = await import('./src/server/routes/api.js');

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  // Fail-safe database authority verification in production
  if (isProduction) {
    if (!process.env.SQL_HOST) {
      console.warn('[TUXI Notice] SQL_HOST is not configured in production. Falling back to embedded SQLite storage.');
    } else {
      try {
        const { postgresAdapter } = await import('./src/server/db/postgres.js');
        const health = await postgresAdapter.checkHealth();
        if (!health.connected) {
          console.warn(`[TUXI Warning] PostgreSQL health check failed: ${health.error || 'Connection refused'}. Falling back to SQLite.`);
        } else {
          console.log(`[TUXI Production Authority] Connected to PostgreSQL with PostGIS (${health.tableCount} tables verified)`);
        }
      } catch (err: any) {
        console.warn('[TUXI Warning] Production database connection failed, falling back to SQLite:', err.message);
      }
    }
  }

  app.use(express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    }
  }));

  // Mount Authoritative Backend API Router
  app.use('/api', apiRouter);

  // Global CORS headers for cross-origin PWA audits & packaging tools (PWABuilder, Lighthouse)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Explicit PWA Manifest Endpoint with correct W3C MIME type
  app.get('/manifest.json', (req, res, next) => {
    res.setHeader('Content-Type', 'application/manifest+json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const manifestPath = isProduction 
      ? path.resolve(__dirname, 'dist', 'manifest.json')
      : path.resolve(__dirname, 'public', 'manifest.json');
    res.sendFile(manifestPath, (err) => {
      if (err) next();
    });
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Direct forced download of all 8 screenshots + feature graphic ZIP
  app.get('/api/download-all-screenshots', (req, res) => {
    const zipPath = path.resolve(__dirname, 'public', 'tuxi-google-play-screenshots.zip');
    res.download(zipPath, 'tuxi-google-play-screenshots.zip', (err) => {
      if (err) {
        console.error('[Download Error]', err);
        res.status(500).send('Error downloading zip');
      }
    });
  });

  // Direct forced download of individual screenshot
  app.get('/api/download-screenshot/:id', (req, res) => {
    const id = req.params.id;
    const imgPath = path.resolve(__dirname, 'public', `screenshot-phone-${id}.png`);
    res.download(imgPath, `tuxi-screenshot-${id}.png`, (err) => {
      if (err) {
        console.error('[Download Screenshot Error]', err);
        res.status(404).send('Screenshot not found');
      }
    });
  });

  // AI Automatic Location & Country Detection Endpoint
  app.post('/api/ai/detect-location', async (req, res) => {
    try {
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
      const result = await processAILocationDetection({
        ...(req.body || {}),
        clientIp
      });
      return res.json(result);
    } catch (err: any) {
      console.error('[AI Location Detection Route Error]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // AI Voice Search & Semantic Product Interpretation Endpoint
  app.post('/api/ai/voice-search', async (req, res) => {
    try {
      const result = await processAIVoiceSearch(req.body || {});
      return res.json(result);
    } catch (err: any) {
      console.error('[AI Voice Search Route Error]', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware in dev or static files in production
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[TUXI Full-Stack] Server active on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[Server Start Error]', err);
  process.exit(1);
});
