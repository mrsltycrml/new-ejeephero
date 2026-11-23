import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@react-native-async-storage/async-storage') {
      return { url: 'data:text/javascript,export default {setItem: () => Promise.reject(new Error("storage unavailable"))};', shortCircuit: true };
    }
    if (specifier === './en.json' || specifier === './fil.json') {
      return { url: 'data:text/javascript,export default {passenger: {}};', shortCircuit: true };
    }
    return next(specifier === './passengerSections' ? './passengerSections.ts' : specifier, context);
  },
});
const { default: i18next, changeLanguage } = await import('../src/locales/i18n.ts');
hooks.deregister();

test('a failed language save leaves the displayed language unchanged', async () => {
  await i18next.changeLanguage('en');
  await assert.rejects(changeLanguage('fil'), /storage unavailable/);
  assert.equal(i18next.language, 'en');
});
