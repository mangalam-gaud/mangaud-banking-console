/**
 * Serves the production build and proxies `/api` to the API, so the PWA can be
 * tested for real.
 *
 *   npm run build && npm run preview
 *
 * Why this exists rather than `serve -s build`:
 *
 * - The client talks to a *relative* `/api/v1`, which `serve` has no idea what
 *   to do with. Pointing the build at an absolute API URL instead would make the
 *   browser call the API cross-origin, which then depends on the CORS allowlist
 *   and on cookie SameSite rules for a path that is otherwise same-origin.
 * - The service worker only registers in a production build, and it only caches
 *   the app shell. Without a same-origin API route you cannot exercise the one
 *   thing worth testing about it: that a cold start with a flaky connection still
 *   renders the app.
 *
 * Deliberately dependency-free — `node:http` and `node:fs` only. It is a
 * development convenience, not a production server.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { join, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = resolve(HERE, '..', 'build');
const PORT = Number(process.env.PREVIEW_PORT || 8080);
const HOST = process.env.PREVIEW_HOST || '0.0.0.0';
const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:5000';
const API_PREFIX = '/api';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

if (!existsSync(BUILD)) {
  console.error('No production build found. Run `npm run build` first.');
  process.exit(1);
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
};

/** Proxy one request through to the API, streaming the response back. */
const proxy = async (req, res) => {
  const target = `${API_ORIGIN}${req.url}`;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const headers = {};
  // Forward the browser's own Origin so the API's CORS allowlist sees the real
  // requester rather than nothing, and copy the response's CORS headers back.
  if (req.headers.origin) headers.origin = req.headers.origin;
  if (req.headers.cookie) headers.cookie = req.headers.cookie;
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
      redirect: 'manual',
    });

    const outHeaders = {};
    for (const name of [
      'content-type',
      'set-cookie',
      'access-control-allow-origin',
      'access-control-allow-credentials',
      'access-control-allow-headers',
      'access-control-allow-methods',
      'location',
    ]) {
      const value = upstream.headers.get(name);
      if (value) outHeaders[name] = value;
    }
    // `fetch` folds multiple Set-Cookie headers into one comma-joined string,
    // which browsers reject. getSetCookie() keeps them separate.
    const setCookies = upstream.headers.getSetCookie?.() ?? [];
    if (setCookies.length) outHeaders['set-cookie'] = setCookies;

    res.writeHead(upstream.status, outHeaders);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    send(res, 502, `Preview proxy could not reach the API at ${API_ORIGIN}.\n\n${error.message}\n\nStart it with: npm run dev:server\n`);
  }
};

const serveFile = (res, filePath) => {
  res.writeHead(200, {
    'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    // The service worker must never be served from cache, or an update can never
    // land. Everything else is content-hashed and safe to cache hard.
    'Cache-Control': filePath.endsWith('sw.js') ? 'no-cache, no-store, must-revalidate' : 'public, max-age=31536000, immutable',
    'Service-Worker-Allowed': '/',
  });
  createReadStream(filePath).pipe(res);
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith(API_PREFIX)) {
    await proxy(req, res);
    return;
  }

  // `normalize` plus the prefix check keeps `..` from escaping the build
  // directory — the reason this is not just `path.join(BUILD, req.url)`.
  const requested = normalize(join(BUILD, decodeURIComponent(url.pathname)));
  if (!requested.startsWith(BUILD)) {
    send(res, 403, 'Forbidden');
    return;
  }

  if (existsSync(requested) && statSync(requested).isFile()) {
    serveFile(res, requested);
    return;
  }

  // Unknown path: hand back index.html so a deep link such as /deposits works
  // on a reload, the same job the router does in the dev server.
  const index = join(BUILD, 'index.html');
  if (!existsSync(index)) {
    send(res, 404, 'Build incomplete — index.html is missing.');
    return;
  }
  serveFile(res, index);
});

server.listen(PORT, HOST, () => {
  const manifest = JSON.parse(readFileSync(join(BUILD, 'manifest.json'), 'utf8'));
  console.log(`\n  Serving the production build on http://localhost:${PORT}`);
  console.log(`  Bound to:           ${HOST}`);
  console.log(`  Proxying ${API_PREFIX}/* to ${API_ORIGIN}`);
  console.log(`  PWA name:           ${manifest.name}`);
  console.log(`  Service worker:     registers (production build), caches the shell only\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
