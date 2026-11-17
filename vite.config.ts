import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3002,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
              if (res && 'writeHead' in res && !res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'API server sedang mulai, coba lagi sebentar.' }));
              }
              return;
            }
            console.error('[vite-proxy]', err.message);
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
