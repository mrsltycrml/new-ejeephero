import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = require.resolve('expo/bin/cli');
console.log('Open http://localhost:8091 in the Codex browser after Metro starts.');
const child = spawn(process.execPath, [cli, 'start', '--web', '--localhost', '--port', '8091', '--max-workers', '2'], {
  stdio: 'inherit',
  env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1' },
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
