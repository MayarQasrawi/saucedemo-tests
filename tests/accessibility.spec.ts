import { Page, Locator, TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../fixtures';
import { InventoryPage } from '../pages/InventoryPage';
import { USERS, PASSWORD, CUSTOMER } from '../test-data/users';

// 8. Accessibility
//
// Three layers, because an automated scanner alone finds only ~30-40% of real issues:
//   A. axe-core scan of every page/state against WCAG 2.2 A + AA
//   B. Keyboard-only checks (WCAG 2.1.1 Keyboard, 2.4.3 Focus Order, 2.4.7 Focus Visible)
//   C. Screen-reader semantics (names, roles, live announcements) and reflow
//
// Tests marked test.fail() document a real, known defect. They pass while the bug exists and
// turn red ("expected to fail, but passed") once it's fixed - that's the signal to remove the marker.

/** Run axe, attach the full report to the HTML report, and fail with a readable summary */
async function expectNoA11yViolations(builder: AxeBuilder, testInfo: TestInfo, name: string) {
  const results = await builder.analyze();
  await testInfo.attach(`axe-${name}`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });
  const summary = results.violations.map(
    (v) => `${v.id} [${v.impact}] ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(summary, `axe violations on ${name}`).toEqual([]);
}

/** data-test of whatever element currently has keyboard focus */
const focusedTestId = (page: Page) =>
  page.evaluate(() => document.activeElement?.getAttribute('data-test') ?? document.activeElement?.tagName);

/** The CSS that can draw a focus ring - if none of it changes on focus, the user can't see focus */
const focusStyle = (el: Locator) =>
  el.evaluate((e) => {
    const s = getComputedStyle(e);
    return [s.outlineStyle, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor].join(' | ');
  });

/** Every page a user can land on; '/' is the login page, the rest need a session */
const PAGES = [
  { name: 'login', path: '/' },
  { name: 'inventory', path: '/inventory.html' },
  { name: 'product details', path: '/inventory-item.html?id=4' },
  { name: 'cart', path: '/cart.html' },
  { name: 'checkout step one', path: '/checkout-step-one.html' },
  { name: 'checkout step two', path: '/checkout-step-two.html' },
  { name: 'checkout complete', path: '/checkout-complete.html' },
];

/** Go straight to a page; logged-in pages get an item in the cart so they render real content */
async function openPage(page: Page, loggedIn: InventoryPage, path: string) {
  if (path === '/') {
    await page.context().clearCookies();
  } else {
    await loggedIn.addToCart('sauce-labs-backpack');
  }
  await page.goto(path);
  expect(new URL(page.url()).pathname, 'not bounced to login').toBe(path.split('?')[0]);
  if (path !== '/') await expect(loggedIn.cartLink).toBeVisible(); // logged-in pages actually rendered
}

test.describe('A. axe WCAG 2.2 AA scan', () => {
  test('login page (and its error state)', async ({ loginPage, makeAxeBuilder }, testInfo) => {
    await loginPage.goto();
    await expectNoA11yViolations(makeAxeBuilder(), testInfo, 'login');

    await loginPage.loginButton.click(); // empty submit -> error banner
    await expect(loginPage.error).toBeVisible();
    await expectNoA11yViolations(makeAxeBuilder(), testInfo, 'login-error');
  });

  test('inventory page', async ({ loggedIn, makeAxeBuilder }, testInfo) => {
    await loggedIn.addToCart('sauce-labs-backpack'); // also scan the badge + "Remove" state
    await expectNoA11yViolations(makeAxeBuilder(), testInfo, 'inventory');
  });

  test('side menu open', async ({ page, loggedIn, makeAxeBuilder }, testInfo) => {
    await page.getByRole('button', { name: 'Open Menu' }).click();
    await expect(page.getByTestId('logout-sidebar-link')).toBeVisible();
    await expectNoA11yViolations(makeAxeBuilder(), testInfo, 'menu');
  });

  test('product details page', async ({ page, loggedIn, makeAxeBuilder }, testInfo) => {
    await page.getByTestId('item-4-title-link').click();
    await expect(page).toHaveURL(/inventory-item\.html/);
    await expectNoA11yViolations(makeAxeBuilder(), testInfo, 'item-details');
  });

  test('cart and every checkout step', async ({ page, loggedIn, cartPage, checkoutPage, makeAxeBuilder }, testInfo) => {
    await loggedIn.addToCart('sauce-labs-backpack');
    await loggedIn.openCart();
    await expectNoA11yViolations(makeAxeBuilder(), testInfo, 'cart');

    await cartPage.checkout();
    await expectNoA11yViolations(makeAxeBuilder(), testInfo, 'checkout-step-one');

    await checkoutPage.continue(); // empty form -> validation error
    await expect(checkoutPage.error).toBeVisible();
    await expectNoA11yViolations(makeAxeBuilder(), testInfo, 'checkout-step-one-error');

    await checkoutPage.fillInfo(CUSTOMER);
    await checkoutPage.continue();
    await expect(page).toHaveURL(/checkout-step-two\.html/);
    await expectNoA11yViolations(makeAxeBuilder(), testInfo, 'checkout-step-two');

    await checkoutPage.finish();
    await expect(page).toHaveURL(/checkout-complete\.html/);
    await expectNoA11yViolations(makeAxeBuilder(), testInfo, 'checkout-complete');
  });

  // Best practices aren't WCAG requirements, so they're kept apart from the scans above.
  // One test per page, so a fix on one page turns its own test red instead of hiding behind the others.
  for (const { name, path } of PAGES) {
    test(`best practice: ${name} page has a level-one heading`, async ({ page, loggedIn, makeAxeBuilder }, testInfo) => {
      test.fail(true, 'BUG: no page has an <h1>; screen-reader users cannot jump to the main heading');
      await openPage(page, loggedIn, path);
      await expectNoA11yViolations(makeAxeBuilder().withRules(['page-has-heading-one']), testInfo, `h1-${name}`);
    });
  }
});

test.describe('B. Keyboard only', () => {
  test('user can log in with Tab, typing and Enter', async ({ page, loginPage }) => {
    await loginPage.goto();

    await page.keyboard.press('Tab');
    expect(await focusedTestId(page)).toBe('username');
    await page.keyboard.type(USERS.standard);

    await page.keyboard.press('Tab');
    expect(await focusedTestId(page)).toBe('password');
    await page.keyboard.type(PASSWORD);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/inventory\.html/);
  });

  test('sort dropdown works from the keyboard', async ({ page, loggedIn }) => {
    await loggedIn.sortSelect.focus();
    await page.keyboard.press('ArrowDown'); // A-Z -> Z-A
    await expect(loggedIn.sortSelect).toHaveValue('za');
  });

  test('menu opens with Enter, moves focus inside, closes with Escape', async ({ page, loggedIn }) => {
    const burger = page.getByRole('button', { name: 'Open Menu' });
    await burger.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('inventory-sidebar-link')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('logout-sidebar-link')).toBeHidden();
  });

  test('closing the menu returns focus to the menu button', async ({ page, loggedIn }) => {
    test.fail(true, 'BUG: after Escape focus drops to <body>, keyboard user loses their place (WCAG 2.4.3)');
    const burger = page.getByRole('button', { name: 'Open Menu' });
    await burger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('inventory-sidebar-link')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(burger).toBeFocused({ timeout: 2000 });
  });

  test('cart link is reachable with Tab', async ({ page, loggedIn }) => {
    test.fail(true, 'BUG: cart is an <a> without href, so Tab skips it - keyboard users cannot check out (WCAG 2.1.1)');
    await expect(loggedIn.cartLink).toBeVisible(); // the locator itself is sound, so a failure below is the real bug

    // Walk the whole tab cycle rather than assuming where the cart sits in the DOM
    const visited: (string | undefined)[] = [];
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press('Tab');
      const id = await focusedTestId(page);
      if (id === visited[0]) break; // wrapped around to the first stop
      visited.push(id);
    }
    expect(visited, 'sanity: Tab moves through the page').toContain('product-sort-container');
    expect(visited, 'elements reached with Tab').toContain('shopping-cart-link');
  });

  test('focus is not lost after "Add to cart" becomes "Remove"', async ({ page, loggedIn }) => {
    test.fail(true, 'BUG: the button is replaced, focus falls back to <body> (WCAG 2.4.3)');
    await page.getByTestId('add-to-cart-sauce-labs-backpack').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('remove-sauce-labs-backpack')).toBeFocused({ timeout: 2000 });
  });

  test('focused elements have a visible focus indicator', async ({ page, loginPage }) => {
    test.fail(true, 'BUG: outline is set to none with no replacement, focus is invisible (WCAG 2.4.7)');
    await loginPage.goto();
    const before = await focusStyle(loginPage.loginButton);

    // Focus via keyboard so :focus-visible applies (mouse focus may legitimately hide it)
    await loginPage.password.focus();
    await page.keyboard.press('Tab');
    await expect(loginPage.loginButton).toBeFocused();

    expect(await focusStyle(loginPage.loginButton)).not.toBe(before);
  });
});

test.describe('C. Screen-reader semantics and reflow', () => {
  test('login and checkout fields have accessible names', async ({ page, loginPage, loggedIn, cartPage }) => {
    // getByRole + name only matches if a screen reader would announce that name
    await page.context().clearCookies();
    await loginPage.goto();
    await expect(page.getByRole('textbox', { name: 'Username' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();

    await loginPage.login(USERS.standard, PASSWORD);
    await loggedIn.addToCart('sauce-labs-backpack');
    await loggedIn.openCart();
    await cartPage.checkout();
    for (const name of ['First Name', 'Last Name', 'Zip/Postal Code']) {
      await expect(page.getByRole('textbox', { name })).toBeVisible();
    }
  });

  test('error messages are announced (role="alert")', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login(USERS.lockedOut, PASSWORD);
    await expect(page.getByRole('alert')).toContainText('Sorry, this user has been locked out');
  });

  test('cart announces how many items it holds', async ({ loggedIn }) => {
    await expect(loggedIn.cartLink).toHaveAccessibleName('Cart, empty');
    await loggedIn.addToCart('sauce-labs-backpack');
    await expect(loggedIn.cartLink).toHaveAccessibleName(/Cart, 1 item/);
  });

  test('product images have meaningful alt text', async ({ page, loggedIn }) => {
    // "Meaningful" = names the product shown, so "image1" or a copy-pasted alt fails
    const cards = page.getByTestId('inventory-item');
    await expect(cards).toHaveCount(6);
    for (const card of await cards.all()) {
      const productName = (await card.getByTestId('inventory-item-name').textContent())!.trim();
      await expect(card.locator('img.inventory_item_img')).toHaveAttribute('alt', productName);
    }
  });

  test('each "Add to cart" button says which product it adds', async ({ page, loggedIn }) => {
    test.fail(true, 'BUG: all 6 buttons are named just "Add to cart" - ambiguous in a screen reader\'s button list (WCAG 2.4.6)');
    await expect(page.getByRole('button', { name: 'Add to cart', exact: true })).toHaveCount(0);
  });

  for (const { name, path } of PAGES) {
    test(`${name} page reflows at 320px wide without horizontal scrolling (WCAG 1.4.10)`, async ({ page, loggedIn }) => {
      await openPage(page, loggedIn, path);
      await page.setViewportSize({ width: 320, height: 640 });
      const [scrollWidth, viewport] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      expect(scrollWidth).toBeLessThanOrEqual(viewport);
    });
  }
});
