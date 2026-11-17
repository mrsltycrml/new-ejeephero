#!/usr/bin/env node
/**
 * Post-processes `dist/` after `npx expo export --platform web` so that ejeephero
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
  for (const [name, size] of [
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ]) {
    await sharp(appleIconSrc).resize(size, size).png().toFile(path.join(distDir, name));
  }
}

const manifest = {
  name: 'ejeephero: Makati e-Jeepney Tracker',
  short_name: 'ejeephero',
  description: 'Real-time Makati e-Jeepney tracker, fare calculator, and commuter safety app.',
  start_url: '/',
  id: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#FFFFFF',
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
    <meta name="apple-mobile-web-app-title" content="ejeephero" />
    <meta name="theme-color" content="#FFFFFF" />
    <style>
      html,body{margin:0!important;padding:0!important;width:100%!important;height:100vh!important;height:100dvh!important;background:#FFFFFF!important;overflow:hidden!important;overscroll-behavior:none!important}
      #root{position:fixed!important;top:0!important;right:0!important;bottom:0!important;left:0!important;display:flex!important;flex-direction:column!important;min-width:0!important;width:100%!important;height:100vh!important;height:100dvh!important;background:#FFFFFF!important;padding-top:env(safe-area-inset-top,0px)!important;padding-right:env(safe-area-inset-right,0px)!important;padding-bottom:env(safe-area-inset-bottom,0px)!important;padding-left:env(safe-area-inset-left,0px)!important;box-sizing:border-box!important;overflow:hidden!important}
      input,textarea{font-size:16px!important;caret-color:#087A55}::selection{background:#E7F3EB;color:#172B24}
      button:focus-visible,[role=button]:focus-visible,[role=tab]:focus-visible,a:focus-visible{outline:2px solid #087A55;outline-offset:2px}
      @media(hover:hover) and (pointer:fine){button,[role=button]{transition:opacity 120ms cubic-bezier(.23,1,.32,1)}}
      @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
    </style>
  `;
  html = html.replace(/<meta name="theme-color" content="[^"]*">/g, '<meta name="theme-color" content="#FFFFFF">');
  if (!html.includes('rel="manifest"')) {
    html = html.replace('</head>', `${pwaMeta}</head>`);
    html = html.replace(
      /name="viewport" content="[^"]*"/,
      'name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"',
    );
    fs.writeFileSync(indexPath, html, 'utf8');
  }
}

console.log('[postprocess-pwa] Injected iOS Safari & Android Web PWA manifest into dist/');
