import dotenv from 'dotenv';
dotenv.config();

interface Config {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  mongodb: {
    uri: string;
    uriTest: string;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiry: string;
    refreshExpiry: string;
  };
  /** Comma-separated allowlist; see the note on the value below. */
  clientUrls: string[];
  /**
   * How many proxy hops to trust when deriving the client IP.
   *
   * `0` disables it. This matters more than it looks: without it, every
   * request through nginx/Render/Railway reports the *proxy's* IP, which makes
   * the rate limiter a single global bucket and writes the proxy address into
   * every audit entry. Set it to the number of proxies in front of the app.
   */
  trustProxy: number;
  rateLimit: {
    windowMs: number;
    /** Ceiling for the general API surface. */
    maxRequests: number;
    /** Tighter ceiling for the credential-checking `/auth` routes. */
    maxAuthRequests: number;
  };
  logLevel: string;
  bcryptRounds: number;
}

const nodeEnv = process.env.NODE_ENV || 'development';

/**
 * Loud failures for the values that must never fall back to a default.
 *
 * `MONGODB_URI` used to default to `mongodb://localhost:27017/banking`. That is
 * the worst possible default: if `.env` fails to load — wrong cwd, missing file,
 * a typo in the loader — the app does not crash. It quietly connects, creates an
 * empty database called `banking`, and serves a login page that will never
 * contain the demo data. The symptom ("my accounts are gone", "the database is
 * empty") points nowhere near the actual cause, which is the trap.
 *
 * So: in production there is no fallback at all. In development the fallback is
 * the real database name, so a missing `.env` degrades to "same database, no
 * secrets" rather than to "a different, empty database".
 */
const requireInProduction = (name: string, value: string | undefined, fallback?: string): string => {
  if (value) return value;
  if (nodeEnv === 'production') {
    throw new Error(
      `${name} is not set. Refusing to start in production with a default value. ` +
        `Copy server/.env.example to server/.env and fill it in.`
    );
  }
  return fallback ?? '';
};

const config: Config = {
  nodeEnv,
  port: parseInt(process.env.PORT || '5000', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  mongodb: {
    // `mangaud`, not `banking`. This is the only database this app should ever
    // touch; `cyber_defense`, `support-system` and `timetable_scheduler` in a
    // local `show databases` listing belong to other projects on this machine.
    uri: requireInProduction(
      'MONGODB_URI',
      process.env.MONGODB_URI,
      'mongodb://localhost:27017/mangaud'
    ),
    uriTest: process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/mangaud_test',
  },
  jwt: {
    accessSecret: requireInProduction('JWT_ACCESS_SECRET', process.env.JWT_ACCESS_SECRET, 'dev-only-access-secret'),
    refreshSecret: requireInProduction('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET, 'dev-only-refresh-secret'),
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },
  /**
   * Origins allowed to call the API with credentials.
   *
   * A comma-separated list, because one origin is not enough in practice: the
   * app is reached on `localhost:3000` from the machine it runs on and on the
   * LAN address from a phone or a second browser, and both are legitimate. The
   * old single-string form silently rejected the second one, answering CORS
   * preflights with "origin not allowed" and no hint about the expected value.
   *
   * Matching stays an explicit allowlist rather than reflecting whatever
   * `Origin` header arrives. Reflecting would make the API callable from any
   * site the machine can reach, and it sends an httpOnly refresh cookie.
   */
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean),
  // 0 = trust nothing (correct when Node is exposed directly, as in dev).
  trustProxy: parseInt(process.env.TRUST_PROXY_HOPS || '0', 10),
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    // The dashboard fires ~10 requests per page view, so the old 100/15min
    // ceiling was exhausted by ordinary browsing and everything after it
    // 429'd. This one is sized for a heavy session over the window, and is a
    // backstop against runaway clients rather than a UX budget.
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '6000', 10),
    // Credential endpoints only. 50 sign-in attempts per 15 minutes is generous
    // for a human and still tight against a password-spraying script.
    maxAuthRequests: parseInt(process.env.RATE_LIMIT_MAX_AUTH_REQUESTS || '50', 10),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
};

export default config;