/**
 * Reports what the browser thinks about the PWA: registered service workers,
 * controller, installability, and the manifest Chrome actually parsed.
 *
 *   node scripts/pwa-check.mjs [url]
 */
import { spawn, execSync } from 'child_process';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const APP = process.argv[2] || 'http://localhost:3000';
const PORT = 9333;

/** Same candidate list as shots.mjs, so both harnesses agree on the browser. */
const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  process.env.CHROME_PATH,
].filter(Boolean);

const findChrome = () => CHROME_CANDIDATES.find((p) => existsSync(p));
const chrome = findChrome();
if (!chrome) {
  console.error('No Chrome/Edge binary found. Set CHROME_PATH.');
  process.exit(1);
}

const profile = mkdtempSync(join(tmpdir(), 'pwa-check-'));
const child = spawn(
  chrome,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--disable-gpu',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
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
          reject(new Error(`timeout: ${method}`));
        }
      }, 20000);
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return new Cdp(ws);
  }
}

const run = async () => {
  let cdp;
  try {
    let targets;
    for (let i = 0; i < 30; i++) {
      try {
        targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        if (targets.length) break;
      } catch {}
      await wait(500);
    }
    cdp = await Cdp.connect(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    await cdp.send('Page.navigate', { url: `${APP}${process.argv[3] || '/login'}` });
    await wait(3000);

    /*
     * Reload with a listener already attached, then wait. Whether
     * `beforeinstallprompt` fires is the thing that actually decides whether the
     * install card can work, and it is not the same question as "is there a
     * manifest" — so it has to be observed rather than assumed.
     */
    await cdp.send('Runtime.evaluate', {
      expression: `
        window.__installPromptFired = false;
        window.addEventListener('beforeinstallprompt', () => { window.__installPromptFired = true; });
      `,
    });
    await cdp.send('Page.reload');
    // Chrome fires the event after the load event, once installability has been
    // evaluated. Polling rather than sleeping a fixed amount, so a slow machine
    // is not reported as "no prompt".
    let fired = false;
    for (let i = 0; i < 20 && !fired; i += 1) {
      await wait(500);
      const probe = await cdp.send('Runtime.evaluate', {
        expression: 'window.__installPromptFired === true',
        returnByValue: true,
      });
      fired = probe.result.value === true;
    }

    const { result } = await cdp.send('Runtime.evaluate', {
      // `fired` is a Node-side value, so it has to be interpolated — the page's
      // scope has no access to it.
      expression: `(async () => {
        const installPromptFired = ${JSON.stringify(fired)};
        const regs = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistrations() : [];
        const manifestHref = document.querySelector('link[rel="manifest"]')?.href ?? null;
        let manifest = null;
        if (manifestHref) {
          try {
            const r = await fetch(manifestHref);
            manifest = r.ok ? await r.json() : 'HTTP ' + r.status;
          } catch (e) { manifest = 'fetch failed: ' + e.message; }
        }
        return JSON.stringify({
          swSupported: 'serviceWorker' in navigator,
          registrations: regs.map(r => ({ scope: r.scope, active: !!r.active, state: r.active?.state })),
          controller: navigator.serviceWorker?.controller?.scriptURL ?? null,
          installPromptFired,
          standalone: window.matchMedia('(display-mode: standalone)').matches,
          secureContext: window.isSecureContext,
          manifestHref,
          manifestName: manifest?.name ?? null,
          manifestIcons: manifest?.icons?.length ?? null,
          manifestStartUrl: manifest?.start_url ?? null,
          display: manifest?.display ?? null,
        }, null, 2);
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });

    console.log(result.value);
  } finally {
    try { cdp?.ws?.close(); } catch {}
    child.kill();
    await wait(1200);
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 5 }); } catch {}
  }
};

run().catch((e) => {
  console.error('pwa-check failed:', e.message);
  process.exit(1);
});
