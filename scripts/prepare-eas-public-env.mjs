import { readFileSync, writeFileSync } from 'node:fs';
// Only publishable client configuration is sent to the mobile build service.
const allowed = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY', 'EXPO_PUBLIC_R2_PUBLIC_URL', 'EXPO_PUBLIC_PWA_URL', 'EXPO_PUBLIC_APK_DOWNLOAD_URL'];
const config = JSON.parse(readFileSync('eas.json', 'utf8'));
const env = Object.fromEntries(allowed.filter(key => process.env[key]).map(key => [key, process.env[key]]));
for (const name of ['preview', 'production']) config.build[name].env = env;
writeFileSync('eas.json', JSON.stringify(config, null, 2) + '\n');
console.log(`Prepared ${Object.keys(env).length} public settings; server secrets excluded.`);
