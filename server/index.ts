import 'dotenv/config';

const _origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = ((chunk: any, ...args: any[]) => {
  const msg = typeof chunk === 'string' ? chunk : chunk?.toString?.() || '';
  if (msg.includes('The `credentials` option is deprecated')) return true;
  return _origStderrWrite(chunk, ...args);
}) as any;

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import configRouter from './routes/config';
import draftsRouter from './routes/drafts';
import sadewaRouter from './routes/sadewa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 3003);

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.text({ limit: '8mb', type: 'text/plain' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'sadewa-vite' }));
app.use('/api/config', configRouter);
app.use('/api/drafts', draftsRouter);
app.use('/api/sadewa', sadewaRouter);

// Serve built SPA (local/prod server); on Vercel static files are served by CDN via rewrites
const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  res.sendFile(path.join(distPath, 'index.html'), (err) => { if (err) next(); });
});

const _argv1 = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isDirectRun = _argv1 && _argv1 === path.resolve(__filename);
const isCjsMain = typeof require !== 'undefined' && typeof module !== 'undefined' && (require as any).main === module;
if (isDirectRun || isCjsMain) {
  app.listen(PORT, () => {
    console.log(`[sadewa-vite] server running on http://localhost:${PORT}`);
  });
}

export default app;
