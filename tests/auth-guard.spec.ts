import { test, expect } from '../fixtures';

// 8. Protected page. Each test gets a fresh browser context = no session cookie.
test('opening /inventory.html without logging in is blocked', async ({ page, loginPage }) => {
  await page.goto('/inventory.html');

  await expect(page).toHaveURL(/saucedemo\.com\/?$/); // bounced back to login
  await expect(loginPage.loginButton).toBeVisible();
  await expect(loginPage.error).toHaveText(
    "Epic sadface: You can only access '/inventory.html' when you are logged in."
  );
  await expect(page.getByTestId('inventory-container')).toHaveCount(0);
});
