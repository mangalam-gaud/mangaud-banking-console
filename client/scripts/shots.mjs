/**
 * Responsive screenshot + console-error harness, over raw Chrome DevTools
 * Protocol.
 *
 *   node scripts/shots.mjs                 # every page, every viewport
 *   node scripts/shots.mjs dashboard       # one page
 *   node scripts/shots.mjs --vp mobile     # one viewport
 *   node scripts/shots.mjs --vp mobile,desktop
 *
 * Why CDP rather than `chrome --screenshot`: that flag navigates once with an
 * empty profile, so there is no way to seed localStorage first and every
 * authenticated route bounced to /login. Driving the protocol also lets us
 * collect console errors and page exceptions per route, which
 * `--screenshot` cannot report.
 *
 * Uses Node's built-in WebSocket (Node >= 22), so there is no dependency to
 * install.
 */

import { spawn, execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, '..', '.shots');
const APP = process.env.APP_URL || 'http://localhost:3000';
const API = process.env.API_URL || 'http://localhost:5000/api/v1';
const PORT = Number(process.env.CDP_PORT || 9222);

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.CHROME_PATH,
].filter(Boolean);

const VIEWPORTS = {
  mobile: 390,
  mobileLg: 430,
  tablet: 820,
  laptop: 1280,
  desktop: 1680,
};

const PAGES = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'accounts', path: '/accounts' },
  { name: 'payments', path: '/payments' },
  { name: 'cards', path: '/cards' },
  { name: 'beneficiaries', path: '/beneficiaries' },
  { name: 'transactions', path: '/transactions' },
  { name: 'statements', path: '/statements' },
  { name: 'loans', path: '/loans' },
  { name: 'deposits', path: '/deposits' },
  { name: 'instructions', path: '/standing-instructions' },
  { name: 'nominees', path: '/nominees' },
  { name: 'kyc', path: '/kyc' },
  { name: 'kycqueue', path: '/kyc-queue', staff: true },
  { name: 'notifications', path: '/notifications' },
  { name: 'security', path: '/security' },
  { name: 'profile', path: '/profile' },
  { name: 'settings', path: '/settings' },
  { name: 'openaccount', path: '/accounts/open' },
  { name: 'audit', path: '/audit', staff: true },
  { name: 'login', path: '/login', auth: false },
  { name: 'register', path: '/register', auth: false },
  { name: 'notfound', path: '/this-route-does-not-exist', auth: false },
];

// ------------------------------------------------------------------ chrome

const findChrome = () => CHROME_CANDIDATES.find((p) => existsSync(p));

const waitForEndpoint = async (timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`CDP endpoint did not come up on port ${PORT}`);
};

// ----------------------------------------------------------------- client

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`));
        else resolve(msg.result);
      } else if (msg.method) {
        const handlers = this.listeners.get(msg.method) || [];
        for (const h of handlers) h(msg.params);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 45_000);
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('WebSocket failed to open')), { once: true });
    });
    return new Cdp(ws);
  }
}

const login = async () => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'aarav.sharma@mangaud.demo', password: 'Customer@123' }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`login failed: ${JSON.stringify(json)}`);
  return json.data.tokens;
};

const adminLogin = async () => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@mangaud.demo', password: 'Admin@123' }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`admin login failed: ${JSON.stringify(json)}`);
  return json.data.tokens;
};

const storageScript = (tokens, user, theme) => `
  (() => {
    localStorage.setItem('accessToken', ${JSON.stringify(tokens.accessToken)});
    localStorage.setItem('refreshToken', ${JSON.stringify(tokens.refreshToken)});
    localStorage.setItem('user', JSON.stringify(${JSON.stringify(user)}));
    localStorage.setItem('auth-storage', JSON.stringify({
      state: { user: ${JSON.stringify(user)}, isAuthenticated: true },
      version: 0,
    }));
    localStorage.setItem('mangaud.theme', ${JSON.stringify(theme)});
  })()
`;

/** Same, but signed out — for the auth screens. */
const publicStorageScript = (theme) => `
  (() => {
    ['accessToken', 'refreshToken', 'user', 'auth-storage'].forEach((k) =>
      localStorage.removeItem(k)
    );
    localStorage.setItem('mangaud.theme', ${JSON.stringify(theme)});
  })()
`;

/** Matches the shape /auth/profile returns, which AuthProvider persists. */
const fetchProfile = async (token) => {
  const res = await fetch(`${API}/auth/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!json.success) throw new Error(`profile failed: ${JSON.stringify(json)}`);
  return json.data.user;
};

// ------------------------------------------------------------------- main

const main = async () => {
  const chrome = findChrome();
  if (!chrome) {
    console.error('No Chrome/Edge binary found. Set CHROME_PATH.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const vpArgIndex = args.indexOf('--vp');
  const themeArgIndex = args.indexOf('--theme');

  // Collect positionals by skipping each flag *and its value*, rather than by
  // index arithmetic. `indexOf` returns -1 when a flag is absent, and -1 + 1
  // silently ate the first positional — so `node shots.mjs dashboard --vp
  // desktop` ran every page.
  const positionals = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('--')) {
      i += 1; // skip the flag's value
      continue;
    }
    positionals.push(args[i]);
  }

  const onlyVp = vpArgIndex >= 0 ? args[vpArgIndex + 1]?.split(',') : null;
  const onlyTheme = themeArgIndex >= 0 ? args[themeArgIndex + 1]?.split(',') : null;

  // Several page names, space- or comma-separated. This used to read
  // `positionals[0]` and drop the rest, so asking for six pages quietly
  // captured one and still reported "no console errors" - the kind of harness
  // that quietly stops verifying things.
  const wantedPages = positionals.length
    ? positionals.join(',').split(',').map((s) => s.trim()).filter(Boolean)
    : null;

  const viewports = onlyVp
    ? Object.fromEntries(Object.entries(VIEWPORTS).filter(([k]) => onlyVp.includes(k)))
    : VIEWPORTS;
  const pages = wantedPages ? PAGES.filter((p) => wantedPages.includes(p.name)) : PAGES;
  const themes = onlyTheme ? onlyTheme : ['light', 'dark'];

  // Cheap sanity check, and the answer to "why did it run nothing?" — an
  // unmatched page name or a mistyped viewport silently produces an empty run
  // that still prints a cheerful "no problems found".
  if (pages.length === 0) {
    throw new Error(
      `No page matched "${wantedPages.join(', ')}". Available: ${PAGES.map((p) => p.name).join(', ')}`
    );
  }
  // Half a request is still a failure. Asking for six pages and getting four
  // means one name was wrong, and the four that did run would otherwise look
  // like a clean sweep.
  if (wantedPages && pages.length !== wantedPages.length) {
    const missing = wantedPages.filter((n) => !pages.some((p) => p.name === n));
    throw new Error(`No page matched: ${missing.join(', ')}`);
  }
  if (Object.keys(viewports).length === 0) {
    throw new Error(
      `No viewport matched "${onlyVp}". Available: ${Object.keys(VIEWPORTS).join(', ')}`
    );
  }

  console.log(
    `Capturing ${pages.length} page(s) x ${Object.keys(viewports).length} viewport(s) x ${themes.length} theme(s)`
  );

  const customer = await login();
  const admin = await adminLogin();

  // Seed the exact profile the API would return. The role decides which routes
  // the guards allow, and a mismatched role/token pair produces redirect loops
  // that look like app bugs.
  const customerUser = await fetchProfile(customer.accessToken);
  const adminUser = await fetchProfile(admin.accessToken);
  console.log('Signed in as customer and admin.\n');

  if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const profile = mkdtempSync(join(tmpdir(), 'mangaud-shots-'));
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--user-data-dir=${profile}`,
      `--remote-debugging-port=${PORT}`,
      'about:blank',
    ],
    { stdio: 'pipe' }
  );

  let cdp;
  const problems = [];

  try {
    await waitForEndpoint();
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    cdp = await Cdp.connect(page.webSocketDebuggerUrl);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');

    let bucket = [];
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error' || p.type === 'warning') {
        const text = (p.args || [])
          .map((a) => a.value ?? a.description ?? a.unserializableValue ?? '')
          .join(' ')
          .replace(/%s/g, '')
          .trim();
        // Keep the whole component stack: React puts the frame that *created*
        // the unkeyed array after the message, and that is the only way to
        // find the offending list.
        bucket.push(`console.${p.type}: ${text.slice(0, 1400)}`);
      }
    });
    cdp.on('Runtime.exceptionThrown', (p) => {
      const d = p.exceptionDetails;
      bucket.push(`uncaught: ${d.exception?.description || d.text}`);
    });
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error') bucket.push(`log: ${p.entry.text} (${p.entry.url ?? ''})`);
    });

    for (const theme of themes) {
    for (const [vp, width] of Object.entries(viewports)) {
      for (const pg of pages) {
        bucket = [];

        /*
         * One page's failure must not end the run.
         *
         * A CDP call timing out — the browser wedging on a heavy page, a
         * navigation racing a reload — used to reject straight out of the loop
         * and throw away the fourteen minutes of captures already taken. A
         * harness that loses everything because of one hiccup is a harness
         * nobody trusts twice. Record it, keep going.
         */
        try {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width,
          height: 1000,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });

        // Seed the session, then navigate: localStorage is origin-scoped, so
        // it has to be written from a page already on the app's origin.
        await cdp.send('Page.navigate', { url: `${APP}/login` });
        await waitFor(1200);

        const staff = pg.staff === true;
        const signedIn = pg.auth !== false;
        await cdp.send('Runtime.evaluate', {
          expression: signedIn
            ? storageScript(
                staff ? admin : customer,
                staff ? adminUser : customerUser,
                theme
              )
            : publicStorageScript(theme),
          awaitPromise: false,
        });

        await cdp.send('Page.navigate', { url: `${APP}${pg.path}` });
        await waitFor(2600);
        // Let data-driven layouts settle after the fetches resolve.
        await cdp.send('Runtime.evaluate', {
          expression: 'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))',
          awaitPromise: true,
        });

        const { data } = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
        });

        /*
          * Include the theme in the filename unless only one theme was asked for.
          *
          * This used to key off `onlyTheme`, which is the *array* parsed from
          * `--theme` -- so `--theme light,dark` made it truthy, the suffix was
          * dropped, and dark silently overwrote light. A two-theme sweep wrote
          * one theme's worth of files and reported eight captures, which is
          * worse than a failure: the count said both themes were checked.
          */
        const suffix = themes.length === 1 ? '' : `-${theme}`;
        const file = join(OUT, `${vp}${suffix}-${pg.name}.png`);
        writeFileSync(file, Buffer.from(data, 'base64'));

        // The seeded theme has to be what the app actually applied.
        const { result: themeCheck } = await cdp.send('Runtime.evaluate', {
          expression: "document.documentElement.classList.contains('dark') ? 'dark' : 'light'",
          returnByValue: true,
        });
        if (themeCheck.value !== theme) {
          bucket.push(`theme not applied: expected ${theme}, document is ${themeCheck.value}`);
        }

        // A route that redirected is a real bug: an auth page reached while
        // signed in, or a signed-in route reached while signed out.
        const { result } = await cdp.send('Runtime.evaluate', {
          expression: 'location.pathname',
          returnByValue: true,
        });
        const landedOn = result.value;
        const expected = signedIn ? pg.path : null;
        if (expected && landedOn !== expected) {
          bucket.push(`redirected: expected ${expected}, landed on ${landedOn}`);
        }

        const kb = (statSync(file).size / 1024).toFixed(0);
        const flag = bucket.length ? '!' : ' ';
        console.log(
          `  ${flag} ${theme.padEnd(5)} ${vp.padEnd(8)} ${String(width).padStart(4)}px  ${pg.name.padEnd(14)} ${kb.padStart(4)} kB`
        );
        for (const b of [...new Set(bucket)].slice(0, 3)) {
          console.log(`        ${b}`);
          problems.push(`${theme}/${vp}/${pg.name}: ${b}`);
        }
        } catch (error) {
          const message = `harness failure: ${error.message ?? error}`;
          console.log(
            `  ! ${theme.padEnd(5)} ${vp.padEnd(8)} ${String(width).padStart(4)}px  ${pg.name.padEnd(14)}    --`
          );
          console.log(`        ${message}`);
          problems.push(`${theme}/${vp}/${pg.name}: ${message}`);
        }
      }
    }
    }
  } finally {
    try { cdp?.ws?.close(); } catch { /* already closed */ }
    child.kill();
    // Chrome keeps file handles open for a moment after SIGTERM, and
    // rmSync throws EPERM on Windows if the profile is touched too early.
    await waitFor(1500);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
    catch { /* a leftover temp profile is harmless */ }
  }

  console.log(`\nScreenshots in ${OUT}`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s) found:`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exitCode = 1;
  } else {
    console.log('No console errors, exceptions or unexpected redirects.');
  }
};

const waitFor = (ms) => new Promise((r) => setTimeout(r, ms));

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
