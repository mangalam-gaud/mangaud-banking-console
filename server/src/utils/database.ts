import mongoose from 'mongoose';
import config from '../config';
import logger from './logger';

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

/**
 * The database name, pulled out of the URI for logging and the readiness probe.
 *
 * Worth having explicitly: a local MongoDB serves every project on the machine,
 * so `show databases` lists `cyber_defense`, `support-system` and
 * `timetable_scheduler` alongside `mangaud`, and none of those are this app.
 * Without the name in the startup line and `/ready`, "which database am I on?"
 * is a guess.
 */
export const databaseNameFromUri = (uri: string): string => {
  const withoutQuery = uri.split('?')[0];
  const afterHost = withoutQuery.replace(/^mongodb(\+srv)?:\/\/[^/]+\//, '');
  return afterHost || '(unknown)';
};

export const connectDatabase = async (): Promise<void> => {
  // `readyState`, not a flag we set ourselves. See `getConnectionStatus`.
  if (mongoose.connection.readyState === 1) {
    logger.info('Database already connected');
    return;
  }

  try {
    const uri = config.nodeEnv === 'test' ? config.mongodb.uriTest : config.mongodb.uri;

    /*
     * Connection options differ between a local mongod and a remote cluster, and
     * the local values actively break Atlas:
     *
     * - `family: 4` pins the driver to IPv4. A `mongodb+srv://` URI resolves via
     *   DNS SRV, and Atlas free/M0 clusters are reachable over IPv6 from many
     *   networks; forcing IPv4 makes the connection fail in a way that looks
     *   like bad credentials rather than a protocol mismatch.
     * - `serverSelectionTimeoutMS: 5000` is right for localhost, where the answer
     *   is either instant or never. Across the internet the same 5s has to cover
     *   a DNS SRV lookup plus a TLS handshake, which can exceed it on a slow or
     *   distant link -- and the failure then looks like "Atlas is unreachable"
     *   rather than "we gave up too early".
     *
     * So both are derived from the URI rather than fixed. Local keeps the tight
     * timeout that `start.bat` polls against; anything remote gets the driver's
     * 30s and lets the resolver choose the address family.
     */
    const isRemote = uri.startsWith('mongodb+srv://') || !/^mongodb:\/\/(localhost|127\.0\.0\.1)/.test(uri);

    await mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: isRemote ? 30000 : 5000,
      socketTimeoutMS: 45000,
      ...(isRemote ? {} : { family: 4 }),
    });

    logger.info(
      `MongoDB connected: ${mongoose.connection.host}/${databaseNameFromUri(uri)}`
    );
  } catch (error) {
    logger.error(
      `MongoDB connection error (tried ${databaseNameFromUri(
        config.nodeEnv === 'test' ? config.mongodb.uriTest : config.mongodb.uri
      )}):`,
      serializeError(error)
    );
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  try {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error('MongoDB disconnection error:', serializeError(error));
    throw error;
  }
};

/**
 * The truth is `mongoose.connection.readyState`, not a boolean this module
 * maintains.
 *
 * The old flag was set true on connect and false on `disconnected`, but nothing
 * ever set it true again. The driver reconnects on its own after a transient
 * blip, so from then on `getConnectionStatus()` reported `false` forever while
 * the database was perfectly healthy — and `connectDatabase()`'s early-return
 * guard stopped guarding. A cache of derived state is only ever as good as its
 * invalidation, and there was no invalidation.
 */
export const getConnectionStatus = (): boolean => mongoose.connection.readyState === 1;

/** 0 disconnected · 1 connected · 2 connecting · 3 disconnecting */
export const getConnectionState = (): number => mongoose.connection.readyState;

mongoose.connection.on('connected', () => {
  logger.info('Mongoose connected to DB');
});

mongoose.connection.on('error', (err) => {
  logger.error('Mongoose connection error:', serializeError(err));
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose disconnected - the driver will keep retrying in the background');
});

mongoose.connection.on('reconnected', () => {
  logger.info('Mongoose reconnected');
});

// No SIGINT/SIGTERM handlers here.
//
// They used to live in this module and called `process.exit(0)` as soon as the
// connection closed. This module is loaded well before `index.ts` registers its
// own shutdown, so this handler fired first and the process exited before the
// graceful path could stop the scheduler, close the HTTP server or drain
// in-flight requests — a hard exit wearing a graceful costume. Shutdown belongs
// to whoever owns the process; that is `index.ts`, and it does it properly.