#!/usr/bin/env node
/**
 * Post-processes `dist/` after `npx expo export --platform web` so that EjeepHero
 * can be installed directly onto iOS (Safari -> Add to Home Screen) and Android
 * without any Expo Go tunnel.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(distDir)) {
  console.error('[postprocess-pwa] dist/ directory not found. Run `npx expo export --platform web` first.');
  process.exit(1);
}

const appleIconSrc = path.join(rootDir, 'assets', 'esakay-app-icon.png');
if (fs.existsSync(appleIconSrc)) {
  for (const [name,size] of [['apple-touch-icon.png',180],['icon-192.png',192],['icon-512.png',512]]) {
    await sharp(appleIconSrc).resize(size,size).png().toFile(path.join(distDir,name));
  }
}

const manifest = {
  name: 'eSAKAY: Makati e-Jeepney Tracker',
  short_name: 'eSAKAY',
  description: 'Real-time Makati e-Jeepney tracker, fare calculator, and commuter safety app.',
  start_url: '/',
  id: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#F5F4F1',
  theme_color: '#FFFFFF',
  icons: [
    {
      src: '/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
    },
    {
      src: '/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
    },
  ],
};

fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

const indexPath = path.join(distDir, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf8');
  const pwaMeta = `
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="eSAKAY" />
    <meta name="theme-color" content="#FFFFFF" />
    <style>
      html,body,#root{min-width:0;height:100%}body{background:#F5F4F1;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);box-sizing:border-box}
      input,textarea{font-size:16px!important;caret-color:#B63D32}::selection{background:#F3DED2;color:#18282E}
      button:focus-visible,[role=button]:focus-visible,[role=tab]:focus-visible,a:focus-visible{outline:2px solid #B63D32;outline-offset:2px}
      @media(hover:hover) and (pointer:fine){button,[role=button]{transition:opacity 120ms cubic-bezier(.23,1,.32,1)}}
      @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
    </style>
  `;
  if (!html.includes('rel="manifest"')) {
    html = html.replace('</head>', `${pwaMeta}</head>`);
    html = html.replace(/name="viewport" content="[^"]*"/, 'name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"');
    fs.writeFileSync(indexPath, html, 'utf8');
  }
}

console.log('[postprocess-pwa] Injected iOS Safari & Android Web PWA manifest into dist/');
