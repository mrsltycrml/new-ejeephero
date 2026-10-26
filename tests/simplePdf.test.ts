import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { SimplePdf } from '../src/utils/simplePdf.ts';

test('supervisor PDF includes official logo, pages, and prepared-by section', () => {
  const logo = new Uint8Array(readFileSync(new URL('../assets/esakay-official-logo.jpeg', import.meta.url)));
  const pdf = new SimplePdf(logo, 514, 156, 'Operations report', 'October 27, 2026 / Daily');
  pdf.metrics([{ value: 1, label: 'Live units' }, { value: 12, label: 'Shifts' }]);
  pdf.section('Shift history');
  pdf.table(['Unit', 'Driver', 'Notes'], [100, 130, 180], Array.from({ length: 80 }, (_, index) => [`Unit ${index + 1}`, `Driver ${index + 1}`, 'A recorded trip on the selected reporting date.']));
  pdf.preparedBy();
  const result = pdf.toBytes();
  const content = Buffer.from(result).toString('latin1');
  assert.ok(content.startsWith('%PDF-1.4\n'));
  assert.match(content, /\/Subtype \/Image/);
  assert.match(content, /\/Count [2-9]/);
  assert.match(content, /Prepared by: Admin/);
  assert.match(content, /xref\n0 /);
  assert.match(content, /%%EOF$/);
});
