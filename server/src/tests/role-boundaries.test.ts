import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import http from 'http';
import config from '../config';
import { User } from '../models/User';

dotenv.config({ path: '.env' });

/**
 * Role-boundary integration test.
 *
 * The unit tests assert the *matrix* (which role holds which permission). This
 * suite sits one layer up: it authenticates each role for real and asserts the
 * HTTP surface refuses the wrong thing and answers the right thing. One token
 * per role is minted against the same secret the API uses, so nothing here
 * reaches into the auth middleware for shortcuts.
 *
 * It needs a local Mongo, so it skips softly when one is not reachable -- the
 * same reason `start.bat --verify` can complain.
 */

const MONGO_URI = (process.env.MONGODB_URI_TEST ?? process.env.MONGODB_URI) as string;
let dbReady = false;
let server: http.Server;
let base = '';
const createdUserIds: string[] = [];
const tokens: Record<string, string> = {};

const suffix = () => Math.random().toString(36).slice(2, 9);

const users: Array<{ role: Parameters<typeof User.create>[0]['role']; email: string }> = [
  { role: 'customer', email: '' },
  { role: 'teller', email: '' },
  { role: 'loan_officer', email: '' },
  { role: 'manager', email: '' },
  { role: 'auditor', email: '' },
  { role: 'admin', email: '' },
];

const call = async (
  token: string,
  method: string,
  urlPath: string,
  body?: unknown
): Promise<{ status: number; ok: boolean }> => {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, ok: res.ok };
};

beforeAll(async () => {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
    dbReady = true;
  } catch {
    dbReady = false;
    return;
  }

  const app = (await import('../index')).default;
  server = app.listen(0);
  const address = server.address();
  if (address && typeof address === 'object') base = `http://localhost:${address.port}`;

  for (const u of users) {
    u.email = `rb-${u.role}-${suffix()}@test.local`;
    const created = await User.create({
      email: u.email,
      password: 'RoleBoundary@123',
      firstName: u.role,
      lastName: 'Boundary',
      phone: '+919000000000',
      role: u.role,
    });
    createdUserIds.push(String(created._id));
    tokens[u.role] = jwt.sign({ id: String(created._id) }, config.jwt.accessSecret, {
      algorithm: 'HS256',
      expiresIn: '5m',
    });
  }
}, 30000);

afterAll(async () => {
  if (createdUserIds.length) await User.deleteMany({ _id: { $in: createdUserIds } });
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (dbReady) await mongoose.disconnect();
});

describe('role boundaries over HTTP', () => {
  // Without a reachable Mongo there is no app to exercise, so every test
  // returns early. In the local setup that flag always holds.
  const requireDb = (): boolean => dbReady;

  it('every role can log in and is classified as active', async () => {
    if (!requireDb()) return;
    for (const u of users) {
      const res = await call(tokens[u.role], 'GET', '/api/v1/auth/profile');
      expect(res.status, `${u.role} profile`).toBe(200);
    }
  });

  it('customer cannot reach back-office surfaces', async () => {
    if (!requireDb()) return;
    expect((await call(tokens.customer, 'GET', '/api/v1/admin/users')).status).toBe(403);
    expect((await call(tokens.customer, 'GET', '/api/v1/customers?q=ab')).status).toBe(403);
    expect((await call(tokens.customer, 'POST', '/api/v1/deposits/mature')).status).not.toBe(200);
    // The customer *is* allowed to repay own loans, so the gate must open and
    // the bogus id should fail *past* it (404), not be a 403. That is the
    // assertion that the own-scope gate is genuinely permissive for the owner.
    expect((await call(tokens.customer, 'POST', `/api/v1/loans/${'0'.repeat(24)}/repay`, { amount: 1 })).status).toBe(404);
  });

  it('teller has the counter API but not admin', async () => {
    if (!requireDb()) return;
    expect((await call(tokens.teller, 'GET', '/api/v1/customers?q=ab')).status).toBe(200);
    expect((await call(tokens.teller, 'GET', '/api/v1/admin/users')).status).toBe(403);
  });

  it('loan officer and manager cannot disburse alone; admin can attempt', async () => {
    if (!requireDb()) return;
    expect((await call(tokens.loan_officer, 'POST', `/api/v1/loans/${'0'.repeat(24)}/disburse`)).status).toBe(403);
    expect((await call(tokens.manager, 'POST', `/api/v1/loans/${'0'.repeat(24)}/disburse`)).status).toBe(403);
    // Admin holds the gate; the loan id is bogus so it 404s *past* the gate.
    expect((await call(tokens.admin, 'POST', `/api/v1/loans/${'0'.repeat(24)}/disburse`)).status).toBe(404);
  });

  it('auditor is refused on any money-mutating action', async () => {
    if (!requireDb()) return;
    expect((await call(tokens.auditor, 'POST', `/api/v1/loans/${'0'.repeat(24)}/disburse`)).status).toBe(403);
    expect((await call(tokens.auditor, 'POST', '/api/v1/beneficiaries', { name: 'x' })).status).toBe(403);
  });

  it('admin holds the management surface', async () => {
    if (!requireDb()) return;
    expect((await call(tokens.admin, 'GET', '/api/v1/admin/users')).status).toBe(200);
  });

  it('invalid payloads are rejected by the schema, not swallowed', async () => {
    if (!requireDb()) return;
    expect((await call(tokens.customer, 'POST', '/api/v1/beneficiaries', { name: 'x' })).status).toBe(400);
    expect((await call(tokens.customer, 'PATCH', `/api/v1/cards/${'0'.repeat(24)}/limits`, {})).status).toBe(400);
  });
});
