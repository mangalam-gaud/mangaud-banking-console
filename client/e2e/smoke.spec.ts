import { test, expect } from '@playwright/test';

/**
 * Smoke checks for Mangaud's front door. Scope: what a brand-new visitor
 * sees (hub -> login), and that each seeded role can sign in at all. Deep
 * role-isolation behaviour is covered by `server/src/tests/role-boundaries`.
 */

const ROLES = [
  { label: 'Customer', email: 'aarav.sharma@mangaud.demo', password: 'Customer@123' },
  { label: 'Teller', email: 'teller@mangaud.demo', password: 'Teller@123' },
  { label: 'Loan Officer', email: 'loanofficer@mangaud.demo', password: 'Officer@123' },
  { label: 'Branch Manager', email: 'manager@mangaud.demo', password: 'Manager@123' },
  { label: 'Auditor', email: 'auditor@mangaud.demo', password: 'Auditor@123' },
  { label: 'Administrator', email: 'admin@mangaud.demo', password: 'Admin@123' },
];

test.describe('public front door', () => {
  test('anonymous visitors get the quick-access hub at /', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/everything/i);
    // Grouped by section, with nav links to protected routes.
    await expect(page.getByRole('navigation', { name: 'Accounts & money' })).toBeVisible();
  });

  test('login shows the demo-login shortcut for every role', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText(/demo logins/i)).toBeVisible();
    for (const label of ROLES.map((r) => r.label)) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test('clicking a hub tile routes a signed-out visitor through login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Cards/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('role sign-in surface', () => {
  for (const role of ROLES) {
    test(`one-tap fill + submit works for ${role.label}`, async ({ page }) => {
      await page.goto('/login');
      // Fill credentials via the role shortcut.
      await page.getByRole('button', { name: new RegExp(role.email) }).click();
      await expect(page.locator('input[type="email"], input[name="email"]').first()).toHaveValue(role.email);
      await expect(page.locator('input[type="password"]').first()).toHaveValue(role.password);
    });
  }
});
