#!/usr/bin/env node
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

execSync('node scripts/export-web.mjs', { stdio: 'inherit', cwd: rootDir, env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' } });
execSync('node scripts/postprocess-pwa.mjs', { stdio: 'inherit', cwd: rootDir });
