const { withDangerousMod } = require('expo/config-plugins');
const { readFile, appendFile } = require('node:fs/promises');
const path = require('node:path');

// Room creates this WorkManager database by reflection before the app starts.
const rule = '-keep class androidx.work.impl.WorkDatabase_Impl { public <init>(); }';

module.exports = config => withDangerousMod(config, ['android', async mod => {
  const file = path.join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
  const rules = await readFile(file, 'utf8');
  if (!rules.split(/\r?\n/).includes(rule)) await appendFile(file, `\n${rule}\n`);
  return mod;
}]);
