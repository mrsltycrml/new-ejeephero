#!/usr/bin/env node
/**
 * Automates creating the `ejeephero-static` Cloudflare R2 bucket and uploading
 * all static transit assets (`r2-bundle/transit/*.json`) using Cloudflare Wrangler.
 *
 * Usage:
 *   npm run upload:r2
 *   (or: node scripts/upload-r2-wrangler.mjs [bucket-name])
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const bucketName = process.argv[2] || process.env.R2_BUCKET_NAME || 'ejeephero-static';
if (bucketName !== 'ejeephero-static') throw new Error('Unexpected release bucket. Inspect the target before changing it.');
const wrangler = (...args) => execFileSync(process.execPath,
  [process.env.WRANGLER_CLI_PATH || path.join(rootDir,'node_modules','wrangler','bin','wrangler.js'), ...args],
  { stdio:'inherit',cwd:rootDir });

console.log(`[upload:r2] Ensuring R2 bundle exists...`);
execFileSync(process.execPath,['scripts/export-r2-bundle.mjs'], { stdio: 'inherit', cwd: rootDir });

const transitDir = path.join(rootDir, 'r2-bundle', 'transit');
const files = fs.readdirSync(transitDir).filter((f) => f.endsWith('.json'));

for (const file of files) {
  const localPath = path.join(transitDir, file);
  const digest = createHash('sha256').update(fs.readFileSync(localPath)).digest('hex').slice(0,16);
  const objectKey = `${bucketName}/transit/versions/${digest}/${file}`;
  console.log(`[upload:r2] Uploading ${file} -> r2://${objectKey}`);
  wrangler('r2','object','put',objectKey,'--file',localPath,'--content-type','application/json','--remote');
}

console.log('[upload:r2] Versioned assets uploaded. Existing objects were preserved; files are served by the eSAKAY Worker.');
