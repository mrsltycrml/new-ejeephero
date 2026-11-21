// Build with EXPO_NO_DOTENV=1, EXPO_PUBLIC_SUPABASE_URL=https://fixture.supabase.invalid,
// EXPO_PUBLIC_SUPABASE_ANON_KEY=fixture and no Clerk key. With playwright-core and its
// WebKit installed, run: node tests/webkit-shell.cjs [export directory]
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { devices, webkit } = require('playwright-core');

const dist = path.resolve(process.argv[2] || 'dist');
const origin = 'https://esakay.test';
const profile = { id: 'layout-fixture', role: 'passenger', status: 'approved', full_name: 'Layout fixture' };
const failures = [];

function near(label, actual, expected) {
  console.log(`${label}: ${actual}px (expected ${expected}px)`);
  if (Math.abs(actual - expected) > 1) failures.push(label);
}

async function box(locator) {
  await locator.waitFor({ state: 'visible' });
  return locator.evaluate(el => el.getBoundingClientRect().toJSON());
}

async function visibleViewport(page, height, offsetTop = 0, scale = 1) {
  // Desktop WebKit has no iOS keyboard or browser chrome. Change only the visual
  // viewport and fire its events while the real layout viewport stays full size.
  await page.evaluate(({ height, offsetTop, scale }) => {
    for (const [key, value] of Object.entries({ height, offsetTop, scale })) {
      Object.defineProperty(visualViewport, key, { configurable: true, value });
    }
    visualViewport.dispatchEvent(new Event('resize'));
    visualViewport.dispatchEvent(new Event('scroll'));
  }, { height, offsetTop, scale });
}

async function main() {
  const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
  const manifest = JSON.parse(await fs.readFile(path.join(dist, 'manifest.json'), 'utf8'));
  const browser = await webkit.launch();
  try {
    const context = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
    await context.routeWebSocket('**/*', () => {});
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'blob:') return route.continue();
      if (url.origin === 'https://fixture.supabase.invalid') {
        return route.fulfill({ json: url.pathname === '/rest/v1/profiles' ? profile : [] });
      }
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/') {
        // Supply notch/home-indicator values to CSS and the safe-area provider's
        // CSS probe. Keep the app's normal safe-area computation and real layout.
        const fixtureCSS = `<style>
          :root { --top: 47px; --right: 0px; --bottom: 34px; --left: 0px; }
          @media (orientation: landscape) { :root { --top: 0px; --right: 47px; --bottom: 21px; --left: 47px; } }
          @media (min-width: 1100px) { :root { --top: 0px; --right: 0px; --bottom: 0px; --left: 0px; } }
          div[style*="safe-area-inset-bottom"] { padding: var(--top) var(--right) var(--bottom) var(--left) !important; }
        </style>`;
        const body = html.replace(/env\(safe-area-inset-(\w+)(?:,\s*0px)?\)/g, 'var(--$1)')
          .replace('</head>', fixtureCSS + '</head>');
        return route.fulfill({ contentType: 'text/html', body });
      }
      const file = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(dist + path.sep)) return route.abort();
      return route.fulfill({ path: file });
    });
    const page = await context.newPage();
    const screenshot = async name => {
      if (process.env.WEBKIT_SCREENSHOTS) await page.screenshot({
        path: path.join(process.env.WEBKIT_SCREENSHOTS, name + '.png'), scale: 'css',
      });
    };
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    const toolbarColors = await page.locator('meta[name="theme-color"]').evaluateAll(tags => tags.map(tag => tag.content));
    if (toolbarColors.length !== 1 || toolbarColors[0] !== manifest.theme_color) failures.push('one manifest toolbar color');
    const root = page.locator('#root');
    const email = page.getByRole('textbox', { name: 'Email address', exact: true });
    const button = name => page.getByRole('button', { name });
    for (const title of ['Welcome back', 'Create an account', 'Reset your password']) {
      if (title !== 'Welcome back') await button(title === 'Create an account' ? 'Create account' : 'Forgot password?').click();
      await page.getByRole('heading', { name: title }).waitFor();
      const panelEnd = await email.evaluate(el => {
        // The field is white too. Find the outermost white form surface.
        let end = 0;
        for (; el; el = el.parentElement) {
          if (getComputedStyle(el).backgroundColor === 'rgb(255, 255, 255)') end = el.getBoundingClientRect().bottom;
        }
        return end;
      });
      near(title + ' exposed canvas', Math.max(0, 844 - panelEnd), 0);
      if (title === 'Welcome back') await screenshot('sign-in');
      if (title !== 'Welcome back') await button('Back to sign in').click();
    }
    await email.focus();
    await visibleViewport(page, 496, 24);
    near('keyboard shell top', (await box(root)).top, 24);
    near('keyboard shell bottom', (await box(root)).bottom, 520);
    const submit = button('Sign in');
    await submit.scrollIntoViewIfNeeded();
    if ((await box(submit)).bottom > 520) failures.push('sign-in action reachable above the keyboard');
    assert.ok(await email.evaluate(el => el === document.activeElement), 'resizing preserved input focus');
    await email.evaluate(el => el.blur());
    await visibleViewport(page, 844);
    await button(/Install eSAKAY on your phone/).click();
    const dialog = page.getByRole('dialog');
    await button('Close installation guide').waitFor();
    await visibleViewport(page, 496, 24);
    await dialog.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)));
    near('portal bottom with keyboard', (await box(dialog)).bottom, 520);
    await button('Close installation guide').click();
    await visibleViewport(page, 844);
    near('restored shell bottom', (await box(root)).bottom, 844);
    await visibleViewport(page, 422, 12, 2);
    near('pinch zoom preserves layout height', (await box(root)).height, 844);
    await visibleViewport(page, 844);

    await page.evaluate(profile => {
      localStorage.setItem('sb-fixture-auth-token', JSON.stringify({
        access_token: 'layout-fixture', refresh_token: 'layout-fixture', expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer', user: { id: profile.id, app_metadata: {}, user_metadata: {} },
      }));
    }, profile);
    await page.reload();
    const tabs = page.getByRole('tablist');
    const bar = tabs.locator('..');
    const more = page.getByRole('tab', { name: /More/ });
    await more.click();
    assert.equal(await more.getAttribute('aria-selected'), 'true');
    const home = button('Go to map');
    if ((await box(home)).height < 44) failures.push('header home target');
    assert.ok((await box(more)).height >= 44, 'bottom tab target');
    near('portrait bar bottom', (await box(bar)).bottom, 844);
    near('home indicator clearance', 844 - (await box(more)).bottom, 34);
    await screenshot('navigation');
    await visibleViewport(page, 740);
    near('bar after Safari toolbar change', (await box(bar)).bottom, 740);
    await visibleViewport(page, 844);
    await page.evaluate(() => {
      for (const key of ['height', 'offsetTop', 'scale']) delete visualViewport[key];
    });
    await page.setViewportSize({ width: 844, height: 390 });
    // setViewportSize can resolve before WebKit dispatches VisualViewport.resize.
    await page.waitForFunction(() => document.getElementById('root').offsetHeight === 390, null, { timeout: 3000 });
    near('landscape bar bottom', (await box(bar)).bottom, 390);
    near('landscape left inset', (await box(bar)).left, 47);
    near('landscape right inset', (await box(bar)).right, 797);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page overflow');
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForFunction(() => document.querySelector('[role=tablist]')?.parentElement.offsetWidth === 160);
    near('desktop rail width', (await box(bar)).width, 160);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.querySelector('[role=tablist]')?.parentElement.offsetWidth === 390);
    near('portrait after rotation', (await box(bar)).bottom, 844);
    for (const [role, tab] of [['driver', 'Records'], ['supervisor', 'Reports']]) {
      profile.role = role;
      await page.reload();
      await page.getByRole('tab', { name: new RegExp(tab) }).waitFor();
      near(role + ' bar bottom', (await box(bar)).bottom, 844);
    }
    assert.deepEqual(errors, [], 'uncaught application errors');
    assert.deepEqual(failures, [], 'WebKit geometry failures');
    console.log('WebKit ' + browser.version() + ' passed');
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
