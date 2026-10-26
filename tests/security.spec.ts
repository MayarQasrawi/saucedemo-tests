import { test, expect } from '../fixtures';
import { USERS } from '../test-data/users';
import { XSS_PAYLOADS } from '../test-data/security-payloads';
import { trackDialogs, expectNoScriptRan } from '../utils/xss';
import { forgeSession } from '../utils/session';

// These are client-side behavioral tests. SauceDemo has no backend, database or
// server: auth, cart and session all live in JavaScript, cookies and localStorage.
// So only Access Control and XSS are covered here. SQL injection and OS command
// injection guards were left out on purpose: with no backend to exercise, they
// would always pass and prove nothing.

const PROTECTED_PAGES = [
  'inventory.html',
  'inventory-item.html',
  'cart.html',
  'checkout-step-one.html',
  'checkout-step-two.html',
  'checkout-complete.html',
];

test.describe('Access Control', () => {
  // Each test gets a fresh browser context = no session cookie.
  for (const path of PROTECTED_PAGES) {
    test(`opening /${path} without logging in is blocked`, async ({ page, loginPage }) => {
      await page.goto(`/${path}`);

      await expect(page).toHaveURL(/saucedemo\.com\/?$/); // bounced back to login
      await expect(loginPage.loginButton).toBeVisible();
      await expect(loginPage.error).toHaveText(
        `Epic sadface: You can only access '/${path}' when you are logged in.`,
      );
      await expect(page.getByTestId('inventory-container')).toHaveCount(0);
    });
  }

  test('a hand-made session cookie does not grant access', async ({ page, inventoryPage }) => {
    // Known issue: auth is client-side only, so the app trusts whatever the
    // session-username cookie says. Anyone can "log in" without a password.
    test.fail(true, 'Known issue: a forged session-username cookie is accepted without logging in');

    await forgeSession(page, { username: USERS.standard });
    await page.goto('/inventory.html');

    await expect(page).not.toHaveURL(/inventory\.html/, { timeout: 2000 });
    await expect(inventoryPage.title).toHaveCount(0);
  });

  test('a forged locked_out_user cookie does not reach the inventory', async ({ page, inventoryPage }) => {
    await forgeSession(page, { username: USERS.lockedOut });
    await page.goto('/inventory.html');

    await expect(page).not.toHaveURL(/inventory\.html/);
    await expect(inventoryPage.title).toHaveCount(0);
  });

  test('opening checkout step two directly with an empty cart cannot place an order', async ({
    page, loggedIn, checkoutPage,
  }) => {
    // Known issue: step two never checks that step one was done or that the cart
    // has items, so it shows a $0.00 order with a working Finish button.
    test.fail(true, 'Known issue: checkout step two can be opened directly and finished with an empty cart');

    await page.goto('/checkout-step-two.html');

    // either bounced back, or there is nothing to finish
    await expect(checkoutPage.finishButton).toHaveCount(0, { timeout: 2000 });
    await expect(checkoutPage.completeHeader).toHaveCount(0);
  });

  test('opening checkout complete directly does not show an order confirmation', async ({
    page, loggedIn, checkoutPage,
  }) => {
    // Known issue: the confirmation page is static and shows for anyone with a session.
    test.fail(true, 'Known issue: checkout-complete.html shows "Thank you for your order!" with no order placed');

    await page.goto('/checkout-complete.html');

    await expect(checkoutPage.completeHeader).toHaveCount(0, { timeout: 2000 });
  });

  test('Back button and old URLs after logout do not show protected content', async ({ page, loggedIn, loginPage }) => {
    await page.getByTestId('item-4-title-link').click();
    await expect(page).toHaveURL(/inventory-item\.html/);

    await page.getByRole('button', { name: 'Open Menu' }).click();
    await page.getByTestId('logout-sidebar-link').click();
    await expect(loginPage.loginButton).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/saucedemo\.com\/?$/);
    await expect(page.getByTestId('inventory-item')).toHaveCount(0);
    await expect(page.getByTestId('inventory-container')).toHaveCount(0);

    for (const path of ['inventory.html', 'inventory-item.html?id=4', 'cart.html']) {
      await page.goto(`/${path}`);
      await expect(page).toHaveURL(/saucedemo\.com\/?$/);
      await expect(loginPage.loginButton).toBeVisible();
    }
  });

  for (const id of ['999', '-1', 'abc']) {
    test(`inventory-item.html?id=${id} shows "not found" without leaking another product`, async ({
      page, loggedIn,
    }) => {
      const errors: Error[] = [];
      page.on('pageerror', (e) => errors.push(e));

      await page.goto(`/inventory-item.html?id=${id}`);

      await expect(page.getByTestId('inventory-item-name')).toHaveText(/not found/i);
      await expect(page.getByTestId('inventory-item-price')).not.toHaveText(/\$\d/);
      expect(errors).toEqual([]);
    });
  }
});

// Only the new vectors live here; the form-field XSS tests are in edge-cases.spec.ts.
// Pass condition for all: the payload stays plain text and nothing runs.
test.describe('XSS', () => {
  for (const payload of XSS_PAYLOADS) {
    test(`?id= in the URL does not execute ${payload}`, async ({ page, loggedIn }) => {
      const dialogs = trackDialogs(page);
      await page.goto(`/inventory-item.html?id=${encodeURIComponent(payload)}`);
      await expect(page.getByTestId('inventory-item-name')).toBeVisible();

      await expectNoScriptRan(page, dialogs);
    });

    test(`cart-contents in localStorage does not execute ${payload}`, async ({ page, loggedIn }) => {
      const dialogs = trackDialogs(page);
      await forgeSession(page, { localStorage: { 'cart-contents': JSON.stringify([4, payload]) } });
      await page.goto('/cart.html');
      await expect(page.getByTestId('title')).toHaveText('Your Cart');

      await expectNoScriptRan(page, dialogs);
    });

    test(`forged session-username cookie does not execute ${payload}`, async ({ page }) => {
      const dialogs = trackDialogs(page);
      await forgeSession(page, { username: payload });
      for (const path of ['inventory.html', 'cart.html']) {
        await page.goto(`/${path}`);
        await expectNoScriptRan(page, dialogs);
      }
    });

    test(`sort option rewritten through the DOM does not execute ${payload}`, async ({ page, loggedIn }) => {
      const dialogs = trackDialogs(page);
      await loggedIn.sortSelect.evaluate((select: HTMLSelectElement, value) => {
        select.options[1].value = value;
      }, payload);
      await loggedIn.sortSelect.selectOption({ index: 1 });
      // Note: an unknown sort value crashes the page to blank, but that is a
      // robustness bug, not XSS. Here we only care that nothing ran.

      await expectNoScriptRan(page, dialogs);
    });
  }
});
