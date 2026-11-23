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
const distDir = path.resolve(rootDir, process.argv[2] ?? 'dist');

if (!fs.existsSync(distDir)) {
  console.error(`[postprocess-pwa] Export directory missing: ${distDir}`);
  process.exit(1);
}

const appleIconSrc = path.join(rootDir, 'assets', 'ejeephero-app-icon.png');
if (fs.existsSync(appleIconSrc)) {
  for (const [name, size] of [
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ]) {
    await sharp(appleIconSrc).resize(size, size).png().toFile(path.join(distDir, name));
  }
}

const { expo } = JSON.parse(fs.readFileSync(path.join(rootDir, 'app.json'), 'utf8'));
const manifest = {
  name: expo.web.name,
  short_name: expo.web.shortName,
  description: 'Real-time Makati e-Jeepney tracker, fare calculator, and commuter safety app.',
  start_url: '/',
  id: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'any',
  background_color: expo.web.backgroundColor,
  theme_color: expo.web.themeColor,
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
    <meta name="apple-mobile-web-app-title" content="${manifest.short_name}" />
  `;
  if (!html.includes('rel="manifest"')) {
    html = html.replace('</head>', `${pwaMeta}</head>`);
  }
  // Use the installed app's toolbar color in Safari as well, including on repeated exports.
  html = html.replace(/<meta name="theme-color"[^>]*>\s*/gi, '');
  html = html.replace('</head>', `<meta name="theme-color" content="${manifest.theme_color}" />\n</head>`);
  fs.writeFileSync(indexPath, html, 'utf8');
}

console.log(`[postprocess-pwa] Prepared ${distDir}`);
