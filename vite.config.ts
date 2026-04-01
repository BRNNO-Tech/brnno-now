import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal(envDir: string): Record<string, string> {
  const file = path.join(envDir, '.env.local');
  if (!fs.existsSync(file)) return {};
  const content = fs.readFileSync(file, 'utf-8');
  const out: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1).replace(/\\'/g, "'");
    out[key] = val;
  }
  return out;
}

export default defineConfig(({ mode }) => {
    // Try config directory first, then cwd, so .env.local is found in either location
    const configDir = __dirname;
    const cwd = process.cwd();
    const localFromConfig = loadEnvLocal(configDir);
    const localFromCwd = configDir !== cwd ? loadEnvLocal(cwd) : {};
    const env = {
      ...loadEnv(mode, configDir, ''),
      ...loadEnv(mode, cwd, ''),
      ...localFromCwd,
      ...localFromConfig,
    };
    const root = configDir;
    /** Set VITE_DEV_HTTPS=1 in .env.local so phone/LAN can use geolocation (https + self-signed cert). */
    const devHttps = env.VITE_DEV_HTTPS === '1' || env.VITE_DEV_HTTPS === 'true';
    return {
      envDir: root,
      server: {
        port: 3000,
        host: '0.0.0.0',
        ...(devHttps ? { https: true } : {}),
      },
      plugins: [react(), ...(devHttps ? [basicSsl()] : [])],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GOOGLE_MAPS_API_KEY': JSON.stringify(env.VITE_GOOGLE_MAPS_API_KEY || env.GOOGLE_MAPS_API_KEY),
        'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
        'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return;
              if (id.includes('@stripe')) return 'stripe';
              if (id.includes('@supabase')) return 'supabase';
              if (id.includes('@google/genai') || id.includes('@google\\genai')) return 'genai';
              if (id.includes('react-router')) return 'react-router';
              if (id.includes('react-dom')) return 'react-dom';
              if (id.includes('node_modules/react/') && !id.includes('node_modules/react-dom')) return 'react';
            },
          },
        },
      },
    };
});
