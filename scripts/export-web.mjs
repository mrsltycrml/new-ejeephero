import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// The SDK 58 CLI's post-export exit polling stays alive on this Windows host.
// Await its complete exporter before closing; failures retain a nonzero exit.
process.env.CI = '1';
process.env.EXPO_NO_TELEMETRY = '1';
try {
  const { expoExport } = require('../node_modules/@expo/cli/build/src/export/index.js');
  await expoExport(['--platform', 'web', '--max-workers', '2']);
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
