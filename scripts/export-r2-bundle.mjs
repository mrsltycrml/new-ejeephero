#!/usr/bin/env node
/**
 * Exports static heavy assets to `r2-bundle/` for uploading to a Cloudflare R2 bucket:
 *   - r2-bundle/transit/makati-boundary.json (Makati GeoJSON boundary coordinates)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'r2-bundle');

fs.mkdirSync(path.join(outDir, 'transit'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'releases'), { recursive: true });

// Extract Makati boundary from src/constants/makatiBoundary.ts
const boundarySrc = fs.readFileSync(
  path.join(rootDir, 'src', 'constants', 'makatiBoundary.ts'),
  'utf8'
);
const boundarySection = boundarySrc.split('MAKATI_BOUNDARY_COORDINATES')[1] || '';
const boundaryMatches = [
  ...boundarySection.matchAll(/\[\s*(14\.[\d]+),\s*(12[01]\.[\d]+)\s*\]/g),
];
const boundaryCoords = boundaryMatches.map((m) => [Number(m[1]), Number(m[2])]);

fs.writeFileSync(
  path.join(outDir, 'transit', 'makati-boundary.json'),
  JSON.stringify(
    {
      city: 'Makati City',
      version: '1.0.0',
      pointCount: boundaryCoords.length,
      coordinates: boundaryCoords,
    },
    null,
    2
  ),
  'utf8'
);

console.log(
  `[export:r2] Exported ${boundaryCoords.length} Makati boundary points to ${outDir}`
);
