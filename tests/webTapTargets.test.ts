import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the web shell opts controls out of double-tap-to-zoom so one tap presses a button', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /html, body, #root \{[^}]*touch-action: manipulation/);
});
