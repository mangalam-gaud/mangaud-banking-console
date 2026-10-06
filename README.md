# Mangaud Banking Console

A full-stack demo banking console built with the MERN stack — MongoDB, Express, React 18, Node.js — demonstrating production-grade RBAC, optimistic UI, and modern full-stack patterns.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://reactjs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-black?logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-green?logo=mongodb)](https://www.mongodb.com/)
[![Vitest](https://img.shields.io/badge/Vitest-5.0-yellow?logo=vitest)](https://vitest.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-1.40-2EAD33?logo=playwright)](https://playwright.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🎯 What is this?

A **full-stack demo banking console** built with the MERN stack — MongoDB, Express, React 18, Node.js — demonstrating production-grade RBAC, optimistic UI, and modern full-stack patterns. It's a reference implementation you can showcase in a portfolio, extend for a real product, or use as a learning codebase.

> ⚠️ **Not a real bank.** This is a demo/reference implementation. No real money moves, no PCI compliance, no PCI-DSS, no KYC/AML integrations, no PCI-DSS. Use as a reference architecture or learning tool.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Mangaud Banking Console                    │
├─────────────────────────────────────────────────────────────────┤
│  Client (React 18 + CRA + TypeScript + Tailwind + Zustand)     │
│  ├── Pages: Dashboard, Accounts, Cards, Loans, Deposits,       │
│  │          Payments, Beneficiaries, Standing Instructions,    │
│  │          Loans, Notifications, KYC, Profile, Security        │
│  │          Role-specific Dashboards (6 roles)                 │
│  │          Optimistic UI with rollback everywhere              │
│  │          Playwright E2E smoke tests                          │
│  └── Services: api client, auth store, permission store        │
├─────────────────────────────────────────────────────────────────┤
│  Server (Express + Mongoose + TypeScript)                      │
│  ├── REST API: /api/v1/* (accounts, cards, loans, deposits,   │
  │    payments, beneficiaries, loans, deposits, standing       │
  │    instructions, KYC, notifications, audit, admin)           │
  │  ├── JWT auth (access 15m / refresh 7d, httpOnly cookie)    │
  │  ├── RBAC: 6 roles, 62 permissions, branch scoping          │
  │  ├── Validation: Zod schemas on every mutation endpoint     │
  │  ├── Audit: immutable append-only log on every mutation     │
  │  └── Scheduler: deposit maturity, standing instructions     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- MongoDB 7.0+ (local or Atlas)
- npm ≥ 9

### Development

```bash
# Clone
git clone https://github.com/yourname/mangaud-banking-console.git
cd mangaud-banking-console

# Install all dependencies
npm run install:all

# Start MongoDB (local or Docker)
# docker run -d -p 27017:27017 mongo:7

# Seed database + start both servers
./start.bat --no-seed   # Windows
# or
npm run dev             # Unix (concurrently runs server + client)

# App runs at:
#   Web:  http://localhost:3000
#   API:  http://localhost:5000/api/v1
#   Health: http://localhost:5000/api/v1/ready
```

### Demo Credentials (seeded)

| Role | Email | Password |
|------|-------|----------|
| Customer | aarav.sharma@mangaud.demo | Customer@123 |
| Customer | priya.nair@mangaud.demo | Customer@123 |
| Teller | teller@mangaud.demo | Teller@123 |
| Loan Officer | loanofficer@mangaud.demo | Officer@123 |
| Branch Manager | manager@mangaud.demo | Manager@123 |
| Auditor | auditor@mangaud.demo | Auditor@123 |
| Administrator | admin@mangaud.demo | Admin@123 |

---

## 🏗️ Project Structure

```
mangaud-banking-console/
├── client/                     # React 18 + CRA + TypeScript
│   ├── src/
│   │   ├── components/         # Reusable UI (Button, Card, Modal, Table, etc.)
│   │   ├── pages/              # Route-level pages (Dashboard, Accounts, Cards, Loans, etc.)
│   │   ├── store/              # Zustand stores (auth, accounts, permissions)
│   │   ├── services/           # API client (Axios + interceptors)
│   │   ├── hooks/              # Custom hooks
│   │   ├── utils/              # Formatters, validators, cn()
│   │   ├── types/              # Shared TypeScript types
│   │   └── App.tsx             # Routes + RBAC guards
│   ├── playwright.config.ts    # E2E config (channel: chrome)
│   └── e2e/                    # Playwright smoke tests
│
├── server/
│   ├── src/
│   │   ├── config/             # Env validation, RBAC matrix, permissions
│   │   ├── controllers/        # Route handlers (thin, delegate to services)
│   │   ├── middleware/         # Auth, RBAC, validation, error handling
│   │   ├── models/             # Mongoose schemas (User, Account, Loan, etc.)
│   │   ├── routes/             # Express routers
│   │   ├── services/           # Business logic (account, loan, payment, etc.)
│   │   ├── utils/              # Logger, formatters, database helpers
│   │   ├── index.ts            # App entry, static hosting in prod
│   │   └── scripts/            # Seed, migrate, fix-cors
│   ├── src/tests/              # Vitest unit + integration tests (72 tests)
│   └── scripts/                # start.bat, stop.bat, seed, migrate
│
├── .github/workflows/ci.yml    # CI: typecheck → test → build
├── .gitignore
└── README.md
```

---

## 🔐 RBAC Matrix (6 Roles, 62 Permissions)

| Permission | Customer | Teller | Loan Officer | Manager | Auditor | Admin |
|------------|:--------:|:------:|:------------:|:-------:|:-------:|:-----:|
| `account:read:own` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `account:read:any` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `account:open` | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| `account:open:any` | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| `account:close:own` | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| `account:freeze:any` | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| `payment:send:own` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `payment:receive:any` | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| `card:issue:own` | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| `loan:apply:own` | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| `loan:approve` | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ |
| `loan:disburse` | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| `audit:read:any` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `user:manage` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

*Branch scoping enforced on all `*:any` staff permissions.*

---

## 🧪 Testing

```bash
# Unit + integration tests (server)
cd server && npm test
# → 72 tests, 4 test files, ~4s

# RBAC audit (structural, no DB)
npx tsx src/tests/auditRbac.ts

# Client typecheck + build
cd ../client && npm run typecheck && npm run build

# E2E smoke tests (requires running servers)
cd client && npx playwright test
# 9/9 passing: hub, login grid, all 6 role logins
```

---

## 🚀 Production Deployment

### 1. Build
```bash
npm run build   # builds server/dist + client/build
```

### 2. Environment (server/.env)
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/mangaud
JWT_ACCESS_SECRET=your-32-char-random-string
JWT_REFRESH_SECRET=your-32-char-random-string
CLIENT_URL=https://app.yourdomain.com
TRUST_PROXY_HOOPS=1
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=6000
LOG_LEVEL=info
```

### 2. Run
```bash
npm run build && npm start
# API + SPA served on single port (default 5000)
```

### 3. Reverse Proxy (nginx example)
```nginx
server {
    listen 443 ssl;
    server_name app.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🏛️ References

Implementation is a MERN stack with our own code; these are the libraries and sources actually used:

- [React](https://react.dev/) + [Create React App](https://create-react-app.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Zustand](https://zustand-demo.pmnd.rs/)
- [React Router](https://reactrouter.com/)
- [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/)
- [Express](https://expressjs.com/) + [helmet](https://helmetjs.github.io/)
- [Mongoose](https://mongoosejs.com/) over MongoDB
- [JSON Web Tokens](https://jwt.io/)
- [Vitest](https://vitest.dev/) + [Playwright](https://playwright.dev/)
- [Lucide React](https://lucide.dev/) icons, [react-hot-toast](https://react-hot-toast.com/)
- Security posture informed by the [OWASP Top 10](https://owasp.org/Top10/)
- UX patterns informed curiously by retail-banking apps (N26, Monzo, Chime) — patterns only, no code

---

## 🤝 Contributing

1. Fork → branch → PR
2. `npm run typecheck && npm test` must pass
3. Conventional commits (`feat:`, `fix:`, `chore:`)

---

## 🙏 Acknowledgments

- React, Express, Mongoose, Tailwind, Zustand, React Hook Form, Zod, Vitest, Playwright
- Inspired by real banking UX patterns (N26, Monzo, Chime)
- Security patterns from OWASP, NIST

---

**Built with ❤️ as a reference implementation. Not a bank. Use responsibly.**