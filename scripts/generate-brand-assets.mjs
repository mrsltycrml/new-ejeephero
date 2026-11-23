#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = path.join(root, 'assets', 'brand');
const assetsDir = path.join(root, 'assets');
const markSvg = fs.readFileSync(path.join(brandDir, 'ejeephero-mark.svg'));

function wordmarkSvg({ fg, bg }) {
  const bgRect = bg
    ? `<rect width="1028" height="312" rx="24" fill="${bg}"/>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1028 312" width="1028" height="312">
  ${bgRect}
  <g transform="translate(24, 28)">
    <svg width="192" height="240" viewBox="0 0 64 80">${markSvg.toString().replace(/<\?xml[^>]*>/, '').replace(/<svg[^>]*>/, '').replace('</svg>', '')}</svg>
  </g>
  <text x="244" y="200" fill="${fg}" font-family="Outfit, Inter, Geist, sans-serif" font-size="132" font-weight="800" letter-spacing="-3">eJeepHero</text>
</svg>`;
}

function appIconSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#13263F"/>
  <g transform="translate(212, 128) scale(9.4)">
    ${markSvg.toString().replace(/<\?xml[^>]*>/, '').replace(/<svg[^>]*>/, '').replace('</svg>', '')}
  </g>
</svg>`;
}

function splashSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#F5F4EF"/>
  <g transform="translate(144, 76) scale(3.5)">
    ${markSvg.toString().replace(/<\?xml[^>]*>/, '').replace(/<svg[^>]*>/, '').replace('</svg>', '')}
  </g>
</svg>`;
}

const lightWordmark = wordmarkSvg({ fg: '#FFFFFF', bg: null });
const darkWordmark = wordmarkSvg({ fg: '#13263F', bg: null });
const pdfWordmark = wordmarkSvg({ fg: '#13263F', bg: '#FFFFFF' });

await sharp(Buffer.from(appIconSvg())).png().toFile(path.join(assetsDir, 'ejeephero-app-icon.png'));
await sharp(Buffer.from(appIconSvg())).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon.png'));
await sharp(Buffer.from(appIconSvg())).resize(192, 192).png().toFile(path.join(assetsDir, 'favicon.png'));
await sharp(Buffer.from(splashSvg())).png().toFile(path.join(assetsDir, 'splash-icon.png'));
await sharp(Buffer.from(appIconSvg())).resize(432, 432).png().toFile(path.join(assetsDir, 'android-icon-foreground.png'));
await sharp({
  create: { width: 432, height: 432, channels: 3, background: '#13263F' },
}).png().toFile(path.join(assetsDir, 'android-icon-background.png'));
await sharp(Buffer.from(appIconSvg()))
  .resize(432, 432)
  .grayscale()
  .png()
  .toFile(path.join(assetsDir, 'android-icon-monochrome.png'));

await sharp(Buffer.from(lightWordmark)).png().toFile(path.join(brandDir, 'ejeephero-wordmark-on-dark.png'));
await sharp(Buffer.from(darkWordmark)).png().toFile(path.join(brandDir, 'ejeephero-wordmark-on-light.png'));
await sharp(Buffer.from(pdfWordmark)).jpeg({ quality: 95, mozjpeg: true }).toFile(path.join(assetsDir, 'ejeephero-wordmark.jpeg'));
await sharp(markSvg).png().toFile(path.join(brandDir, 'ejeephero-mark.png'));

fs.writeFileSync(path.join(brandDir, 'ejeephero-wordmark-on-dark.svg'), lightWordmark);
fs.writeFileSync(path.join(brandDir, 'ejeephero-wordmark-on-light.svg'), darkWordmark);

console.log('Brand assets written to assets/ and assets/brand/');
