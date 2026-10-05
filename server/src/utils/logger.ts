import config from '../config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = levels[config.logLevel as LogLevel] ?? levels.info;

/**
 * Make a string safe to write to this process's stdout.
 *
 * The server logs rupee signs, em-dashes and middots, and on Windows a
 * redirected stdout is written in the OEM codepage (cp437/cp1252), not UTF-8.
 * The bytes that do not fit came out as `?` and replacement characters, so the
 * log read:
 *
 *     Payment PAY-X3SE: 100000000009 -> ????????? 1835 4859
 *     scheduler boot: deposit maturities ?" 0 matured
 *
 * which is worse than useless when you are grepping a log to work out whether
 * an amount was right. The log is a diagnostic channel, so the information that
 * matters is the numbers — transliterating the punctuation keeps those legible
 * and costs nothing that a reader needed.
 *
 * Deliberately not a fix to the encoding: forcing UTF-8 on stdout is right for a
 * deployed service but not something a library should do to the process it is
 * loaded into.
 */
const toSafeAscii = (value: string): string =>
  value
    // Keep a leading currency marker, since ₹10,000 and 10,000 read differently
    // at a glance and this is a banking log.
    .replace(/₹/g, 'Rs ')
    .replace(/[—–]/g, '-')
    .replace(/[·•]/g, '*')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    // Anything still outside Latin-1 cannot survive the codepage either.
    .replace(/[^\x20-\x7E\n\t]/g, '?');

const formatMessage = (level: LogLevel, message: string, meta?: Record<string, unknown>): string => {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return toSafeAscii(`[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`);
};

const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (currentLevel <= levels.debug) {
      console.log(formatMessage('debug', message, meta));
    }
  },
  info: (message: string, meta?: Record<string, unknown>) => {
    if (currentLevel <= levels.info) {
      console.log(formatMessage('info', message, meta));
    }
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    if (currentLevel <= levels.warn) {
      console.warn(formatMessage('warn', message, meta));
    }
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    if (currentLevel <= levels.error) {
      console.error(formatMessage('error', message, meta));
    }
  },
};

export default logger;
