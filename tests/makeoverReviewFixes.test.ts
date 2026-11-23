import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('review fixes keep the report link, compact logo, inbox label and map inset', () => {
const REPORT_URL = 'https://meralcomain.s3.ap-southeast-1.amazonaws.com/2020-04/mer_sustainabilityreport2019_final.pdf';

const about = read('src/screens/passenger/AboutScreen.tsx');
assert.match(about, /accessibilityRole="link"/);
assert.ok(about.includes(REPORT_URL), 'About screen must keep the original report PDF URL');
assert.match(about, /Linking\.openURL/);
assert.doesNotMatch(about, /Meralco/);

const en = JSON.parse(read('src/locales/en.json'));
const fil = JSON.parse(read('src/locales/fil.json'));
assert.equal(en.passenger.about.report, 'Sustainability report (PDF)');
assert.equal(fil.passenger.about.report, 'Ulat tungkol sa sustainability (PDF)');
assert.match(en.passenger.about.summary, /eJeepHero/);
assert.match(fil.passenger.about.summary, /eJeepHero/);
assert.doesNotMatch(en.passenger.about.report, /Meralco/i);
assert.doesNotMatch(fil.passenger.about.report, /Meralco/i);

const logo = read('src/components/EJeepHeroLogo.tsx');
assert.match(logo, /compact \? 100/);
assert.doesNotMatch(logo, /compact \? 158/);

const inbox = read('src/components/FleetIncidentInbox.tsx');
assert.match(inbox, /accessibilityLabel=\{`\$\{typeLabel\}, \$\{statusLabel\}`\}/);

const home = read('src/screens/passenger/HomeScreen.tsx');
const driver = read('src/screens/driver/DashboardScreen.tsx');
const supervisor = read('src/screens/admin/SupervisorDashboardScreen.tsx');
const leaflet = read('src/components/LeafletMap.tsx');
for (const [name, src] of [['home', home], ['driver', driver], ['supervisor', supervisor]] as const) {
  assert.match(src, /bottomInset/, `${name} must pad the map above the peek sheet`);
  assert.match(src, /onSnapChange/, `${name} must update the map inset when the sheet snaps`);
}
assert.match(leaflet, /paddingBottom: bottomInset/);

const tabs = read('src/navigation/AppNavigator.tsx');
assert.match(tabs, /chrome\.tabBar/);
});
