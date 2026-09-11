import { test, expect } from '@playwright/test';

test('user can login and reach dashboard', async ({ page }) => {
  await page.goto('/login');

  await page.getByPlaceholder('tu@email.com').fill('test@example.com');
  await page.getByPlaceholder('••••••••').fill('password123');
  await page.getByRole('button', { name: /iniciar sesión/i }).click();

  await page.waitForURL('**/dashboard');
  await expect(page.getByText(/Dashboard|Inicio|Prospectos/i)).toBeVisible();
});
