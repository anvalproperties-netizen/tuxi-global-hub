import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, Plugin } from 'vite';
import { processAILocationDetection } from './src/utils/aiLocationProcessor.ts';
import { processAIVoiceSearch } from './src/utils/aiVoiceSearchProcessor.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function aiDevMiddlewarePlugin(): Plugin {
  return {
    name: 'ai-dev-middleware',
    configureServer(server) {
      // Connect middleware to handle /api/ai/detect-location
      server.middlewares.use('/api/ai/detect-location', async (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const parsed = body ? JSON.parse(body) : {};
              const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
              const result = await processAILocationDetection({
                ...parsed,
                clientIp
              });
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        }
      });

      // Connect middleware to handle /api/ai/voice-search
      server.middlewares.use('/api/ai/voice-search', async (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const parsed = body ? JSON.parse(body) : {};
              const result = await processAIVoiceSearch(parsed);
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        }
      });

      // Health endpoint
      server.middlewares.use('/api/health', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.statusCode = 200;
        res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), aiDevMiddlewarePlugin()],
    resolve: {
      alias: [
        { find: /^@\/(.*)/, replacement: path.resolve(__dirname, './$1') },
        { find: '@', replacement: path.resolve(__dirname, '.') }
      ],
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
