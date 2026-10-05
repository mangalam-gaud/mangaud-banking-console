import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import config from './config';
import { connectDatabase, disconnectDatabase, databaseNameFromUri } from './utils/database';
import logger from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/authRoutes';
import accountRoutes from './routes/accountRoutes';
import loanRoutes from './routes/loanRoutes';
import transactionRoutes from './routes/transactionRoutes';
import cardRoutes from './routes/cardRoutes';
import beneficiaryRoutes from './routes/beneficiaryRoutes';
import customerRoutes from './routes/customerRoutes';
import adminRoutes from './routes/adminRoutes';
import paymentRoutes from './routes/paymentRoutes';
import notificationRoutes from './routes/notificationRoutes';
import statementRoutes from './routes/statementRoutes';
import auditRoutes from './routes/auditRoutes';
import bankingRoutes from './routes/bankingRoutes';
import { startScheduler, stopScheduler } from './jobs/scheduler';

/** Held so the shutdown handler can cancel the sweep. */
let scheduler: NodeJS.Timeout | null = null;

const app = express();

// Without this, `req.ip` is the socket address. Behind a reverse proxy that
// means every request looks like it came from the proxy, which collapses the
// rate limiter into one global bucket and writes the proxy's address into
// every audit entry. Off by default because dev runs with Node exposed
// directly, where trusting headers would let a client spoof its own IP.
if (config.trustProxy > 0) {
  app.set('trust proxy', config.trustProxy);
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

/**
 * CORS with credentials, against an explicit origin allowlist.
 *
 * A function origin rather than a single string, because the app is legitimately
 * reachable on more than one host: `localhost` from the machine it runs on and
 * the LAN address from a phone. The allowlist is checked, never reflected —
 * a reflecting origin would let any site on the network drive this API while
 * the httpOnly refresh cookie rides along.
 *
 * A request with no `Origin` at all (curl, the smoke suite, server-to-server)
 * is allowed through: CORS only exists to constrain browsers, and those
 * callers are not browsers.
 */
const allowOrigin = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void => {
  if (!origin) {
    callback(null, true);
    return;
  }
  if (config.clientUrls.includes(origin)) {
    callback(null, true);
    return;
  }
  logger.warn(`Blocked cross-origin request from ${origin}`, { allowed: config.clientUrls });
  callback(null, false);
};

app.use(
  cors({
    origin: allowOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

if (config.nodeEnv !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

/**
 * Rate limiting is applied at two tiers.
 *
 * The strict tier covers only the credential-checking endpoints -- the ones
 * worth brute-forcing. It deliberately does NOT cover the whole `/auth`
 * prefix: `/auth/profile` is an ordinary authenticated read that the client
 * calls on every page load, and putting it behind a 50-request budget made
 * ordinary navigation start failing with 429 and silently sign the user out.
 *
 * Everything else gets a much higher ceiling. A single global budget of
 * 100 requests / 15 min was previously shared across the whole API, which one
 * page of the dashboard exhausted on its own.
 */
const credentialLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxAuthRequests,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: 'Too many requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(`${config.apiPrefix}/auth/login`, credentialLimiter);
app.use(`${config.apiPrefix}/auth/register`, credentialLimiter);
app.use(`${config.apiPrefix}/auth/refresh`, credentialLimiter);
app.use(`${config.apiPrefix}/auth/forgot-password`, credentialLimiter);
app.use(`${config.apiPrefix}/auth/reset-password`, credentialLimiter);
app.use(config.apiPrefix, apiLimiter);

app.get(`${config.apiPrefix}/health`, (req, res) => {
  res.json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Readiness check. Unlike `/health` this actually touches the database, so a
 * load balancer or `start.bat` can wait on it rather than on a route that
 * answers before Mongo is reachable.
 */
app.get(`${config.apiPrefix}/ready`, async (req, res) => {
  try {
    const mongoose = (await import('mongoose')).default;
    const state = mongoose.connection.readyState; // 1 = connected

    let pingOk = false;
    try {
      const result = (await mongoose.connection.db?.admin().command({ ping: 1 })) as { ok?: number };
      pingOk = result?.ok === 1;
    } catch {
      pingOk = false;
    }

    const ready = state === 1 && pingOk;
    const uri = config.nodeEnv === 'test' ? config.mongodb.uriTest : config.mongodb.uri;

    res.status(ready ? 200 : 503).json({
      success: ready,
      database: {
        connected: ready,
        state,
        /*
         * Naming the database removes the most common false alarm on a shared
         * local MongoDB. `show databases` lists every other project on the
         * machine — cyber_defense, support-system, timetable_scheduler — and
         * only `mangaud` belongs to this app. Before this line, answering "am I
         * on the right database?" meant reading a startup log.
         *
         * `connection.name` is what the driver actually attached to, which is
         * the honest answer; the URI is the fallback for when it is not
         * connected yet, which is exactly when someone is asking.
         */
        name: mongoose.connection.name || databaseNameFromUri(uri),
        host: mongoose.connection.host || null,
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ success: false, database: { connected: false } });
  }
});

app.use(`${config.apiPrefix}/auth`, authRoutes);
app.use(`${config.apiPrefix}/accounts`, accountRoutes);
app.use(`${config.apiPrefix}/loans`, loanRoutes);
app.use(`${config.apiPrefix}/transactions`, transactionRoutes);
app.use(`${config.apiPrefix}/cards`, cardRoutes);
app.use(`${config.apiPrefix}/beneficiaries`, beneficiaryRoutes);
app.use(`${config.apiPrefix}/customers`, customerRoutes);
app.use(`${config.apiPrefix}/admin`, adminRoutes);
app.use(`${config.apiPrefix}/payments`, paymentRoutes);
app.use(`${config.apiPrefix}/notifications`, notificationRoutes);
app.use(`${config.apiPrefix}/statements`, statementRoutes);
app.use(`${config.apiPrefix}/audit`, auditRoutes);
app.use(`${config.apiPrefix}/banking`, bankingRoutes);

// In production the API also hosts the client bundle, so the whole app ships as
// one process behind one origin -- no cross-origin CORS surface to get wrong.
// Static and the SPA fallback are registered before the 404 handler: a deep
// link or refresh that bypasses the client router must still land on
// index.html. API paths keep their JSON 404s because they never match the
// GET-only SPA fallback below.
if (config.nodeEnv === 'production') {
  const clientBuild = path.join(__dirname, '..', '..', 'client', 'build');
  app.use(express.static(clientBuild));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

const serializeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { error: String(error) };
};

const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();

    // Started only after Mongo is reachable. The sweep reads and writes the
    // ledger, so running it before the connection is up would just log failures
    // on every tick.
    scheduler = startScheduler();

    const server = app.listen(config.port, () => {
      logger.info(`Server running in ${config.nodeEnv} mode on port ${config.port}`);
      logger.info(`API available at http://localhost:${config.port}${config.apiPrefix}`);
    });

    /**
     * Graceful shutdown.
     *
     * Without this, `tsx watch` restarts leave the timer running against a
     * closing process and the sweep can fire mid-teardown. Draining the server
     * first means in-flight requests finish, then the scheduler stops, then the
     * process exits.
     */
    const shutdown = (signal: string) => {
      logger.info(`${signal} received, shutting down`);
      if (scheduler) stopScheduler(scheduler);

      // Drain HTTP first so no request is mid-flight against a closing pool,
      // then close Mongo, then exit. The order matters: closing the database
      // first would make every in-flight query fail with a connection error
      // instead of completing.
      //
      // `utils/database` deliberately registers no signal handlers of its own —
      // it used to, and its handler fired first and called `process.exit(0)`
      // before any of the above could run.
      server.close(async () => {
        logger.info('HTTP server closed');
        try {
          await disconnectDatabase();
        } catch {
          // Already on the way out; a failed close changes nothing.
        }
        process.exit(0);
      });
      // Do not hang forever on a stuck keep-alive socket.
      setTimeout(() => {
        logger.warn('Forcing exit after 10s shutdown timeout');
        process.exit(1);
      }, 10_000).unref();
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    logger.error('Failed to start server:', serializeError(error));
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

export default app;