import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';

// Exercise the actual TSX with isolated hook state and query responses.
function load(path: string, modules: Record<string, any>) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } });
  const exports: any = {};
  new Function('require', 'exports', outputText)((name: string) => modules[name] ?? {}, exports);
  return exports;
}

function hooks() {
  let states: any[] = [], cursor = 0;
  const effects: Array<() => () => void> = [];
  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children }),
    createContext: (value: any) => ({ Provider: 'Provider', value }),
    useState(initial: any) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (next: any) => {
        states[index] = typeof next === 'function' ? next(states[index]) : next;
      }];
    },
    useEffect: (fn: any) => effects.push(fn),
    useCallback: (fn: any) => fn,
  };
  return { react: { ...react, default: react }, effects, render(fn: () => any, remount = false) {
    if (remount) states = [];
    cursor = 0;
    effects.length = 0;
    return fn();
  } };
}

const native = { StyleSheet: { create: (value: any) => value }, View: 'View', Text: 'Text', ScrollView: 'ScrollView',
  TouchableOpacity: 'Button', useWindowDimensions: () => ({ width: 400, height: 800 }) };
const common = { 'react-native': native, '../constants/theme': { Colors: {} } };
const warning = (id: string, seconds: number, open = true, driver = 'driver') => {
  const time = new Date(Date.UTC(2020, 0, 1) + seconds * 1000).toISOString();
  return { id, driver_id: driver, captured_at: time, created_at: time, closed_at: open ? null : time,
    unit_label: id, distance_meters: 200, accuracy_meters: 5 };
};

test('banner drains every open warning once across history limits, refreshes and remounts', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => warning('closed-' + i, i + 20, false));
  rows.push(warning('old', 1), warning('middle', 2), warning('new', 3), warning('other driver', 4, true, 'other'));
  let failRead = false, refresh: () => void;
  const channel = { on(_type: string, _filter: any, callback: () => void) { refresh = callback; return this; }, subscribe() { return this; } };
  const db = { channel: () => channel, removeChannel() {}, from(table: string) {
    assert.equal(table, 'route_deviation_events');
    let page = [...rows], limit = 1000;
    const orders: Array<(a: typeof rows[number], b: typeof rows[number]) => number> = [];
    return {
      select() { return this; },
      eq(_key: string, id: string) { page = page.filter(w => w.driver_id === id); return this; },
      is(key: string, value: any) {
        assert.deepEqual([key, value], ['closed_at', null]);
        page = page.filter(w => !w.closed_at); limit = 2; return this;
      },
      not(key: string, operator: string, value: any) {
        assert.deepEqual([key, operator, value], ['closed_at', 'is', null]);
        page = page.filter(w => w.closed_at); return this;
      },
      order(key: 'created_at' | 'id', { ascending = true } = {}) {
        orders.push((a, b) => a[key].localeCompare(b[key]) * (ascending ? 1 : -1)); return this;
      },
      gt(_key: string, after: string) { page = page.filter(w => w.id > after); return this; },
      limit(n: number) { limit = Math.min(limit, n); return this; },
      then(resolve: any) {
        for (const compare of orders.reverse()) page.sort(compare);
        resolve(failRead ? { error: 'offline' } : { data: page.slice(0, limit) });
      },
    };
  } };
  const provider = hooks(), banner = hooks();
  const { RouteWarningsProvider } = load('../src/contexts/RouteWarningsContext.tsx', {
    react: provider.react, '../lib/supabase': { supabase: db }, './AuthContext': { useAuth: () => ({ user: { id: 'driver' } }) },
  });
  const read = () => provider.render(() => RouteWarningsProvider({ driverOnly: true })).props.value;
  const { default: Banner } = load('../src/components/RouteWarningBanner.tsx', {
    ...common, react: banner.react, '../contexts/RouteWarningsContext': { useRouteWarnings: read },
  });
  let opened = 0;
  const button = () => banner.render(() => Banner({ onOpen: () => opened++ }), true)?.children[0];
  const press = (id: string) => {
    const item = button();
    assert.equal(item?.props.accessibilityLabel, `Possible off-route movement · ${id}. View alert.`);
    item.props.onPress();
  };
  read();
  const cleanup = provider.effects[0]();
  try {
    await setImmediate();
    assert.equal(read().warnings.length, 23, 'all three open plus twenty historical rows for this driver');
    press('new');
    failRead = true;
    refresh!(); await setImmediate();
    assert.ok(read().error);
    press('middle');
    failRead = false;
    rows.push(warning('arrival', 60));
    refresh!(); await setImmediate();
    assert.equal(read().error, '');
    press('arrival');
    press('old');
    assert.equal(button(), undefined);
    assert.equal(opened, 4);
    rows.push(warning('brief', 61));
    refresh!(); await setImmediate();
    assert.equal(read().nextWarning.id, 'brief');
    rows.at(-1)!.closed_at = rows.at(-1)!.created_at;
    refresh!(); await setImmediate();
    assert.equal(button(), undefined);
  } finally { cleanup(); }
});

test('supervisor alert panel keeps an open warning below the ten recent rows', () => {
  const warnings = Array.from({ length: 14 }, (_, i) => warning('closed-' + i, i + 1, false));
  warnings.push(warning('still open', 0));
  const panel = hooks();
  const { default: Popover } = load('../src/components/AdminHeaderPopover.tsx', {
    ...common, react: panel.react, '../contexts/AuthContext': { useAuth: () => ({}) },
    '../contexts/RouteWarningsContext': { useRouteWarnings: () => ({ warnings }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
  });
  function findList(node: any): any {
    return node?.type === 'ScrollView' ? node : node?.children?.flat().map(findList).find(Boolean);
  }
  const tree = panel.render(() => Popover({ panel: 'alerts' }));
  const ids = findList(tree).children.flat().map((row: any) => row.props.key);
  assert.equal(ids.length, 11);
  assert.equal(ids.at(-1), 'warning-still open');
});

test('driver and supervisor warning sessions remount when the account changes', () => {
  const account = { user: { id: 'first' }, role: 'driver', status: 'approved', isAdmin: false };
  const { AppNavigator } = load('../src/navigation/AppNavigator.tsx', {
    ...common, react: hooks().react, '../contexts/AuthContext': { useAuth: () => account },
    '@react-navigation/native-stack': { createNativeStackNavigator: () => ({}) },
    '@react-navigation/bottom-tabs': { createBottomTabNavigator: () => ({}) },
  });
  for (const isAdmin of [false, true]) {
    account.isAdmin = isAdmin;
    for (const id of ['first', 'second']) {
      account.user.id = id;
      const screen = AppNavigator().children[0].props;
      assert.equal(screen.name, isAdmin ? 'AdminApp' : 'DriverApp');
      assert.equal(screen.navigationKey, id);
    }
  }
});
