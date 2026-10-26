import { Page, Locator } from '@playwright/test';
import { test, expect } from '../fixtures';
import { USERS, PASSWORD, CUSTOMER } from '../test-data/users';

// Every payload tries to set window.__xss, so we can tell if any of them actually ran
const XSS_PAYLOADS = [
  '<script>window.__xss=1</script>',
  '<img src=x onerror="window.__xss=1">',
  '"><svg onload="window.__xss=1">',
  "'; window.__xss=1; //",
  'javascript:window.__xss=1',
];

/** Records any alert/confirm/prompt the page opens */
function trackDialogs(page: Page): string[] {
  const dialogs: string[] = [];
  page.on('dialog', async (d) => {
    dialogs.push(d.message());
    await d.dismiss();
  });
  return dialogs;
}

/**
 * Looks for a payload that either ran, or landed in the DOM as live markup
 * (a <script>, an on* handler or a javascript: link). Inputs are skipped,
 * because a payload sitting inside an input's value is just text.
 */
async function detectXss(page: Page) {
  // let any injected <img src=x> finish failing, so its onerror has had its chance
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));

  return page.evaluate(() => {
    const injected = [...document.querySelectorAll('body *')].filter(
      (el) =>
        el.tagName !== 'INPUT' &&
        ((el.tagName === 'SCRIPT' && el.textContent?.includes('__xss')) ||
          [...el.attributes].some(
            (a) => (a.name.startsWith('on') || a.name === 'href' || a.name === 'src') && a.value.includes('__xss'),
          )),
    ).length;
    return { ran: (window as any).__xss !== undefined, injected };
  });
}

async function expectNoScriptRan(page: Page, dialogs: string[]) {
  expect(await detectXss(page)).toEqual({ ran: false, injected: 0 });
  expect(dialogs).toEqual([]);
}

/**
 * Fires two clicks on the same element back to back, before the app can
 * re-render. Unlike dblclick(), the second click can't land on whatever
 * button the next page happens to put at the same coordinates.
 */
async function clickTwice(button: Locator) {
  await button.evaluate((el: HTMLElement) => {
    el.click();
    el.click();
  });
}

// 1. Empty and whitespace-only inputs
test.describe('Empty and whitespace-only inputs', () => {
  test('login with both fields empty asks for the username first', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login('', '');

    await expect(loginPage.error).toHaveText('Epic sadface: Username is required');
    await expect(page).not.toHaveURL(/inventory/);
  });

  test('login with whitespace-only credentials is rejected', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login('   ', '   ');

    await expect(loginPage.error).toHaveText(
      'Epic sadface: Username and password do not match any user in this service',
    );
    await expect(page).not.toHaveURL(/inventory/);
  });

  test('login with valid username padded by spaces is rejected', async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login(`  ${USERS.standard}  `, PASSWORD);

    await expect(loginPage.error).toBeVisible();
    await expect(page).not.toHaveURL(/inventory/);
  });

  test('checkout info with all fields empty shows the first-name error', async ({ page, atCheckoutInfo }) => {
    await atCheckoutInfo.continue();

    await expect(atCheckoutInfo.error).toHaveText('Error: First Name is required');
    await expect(page).toHaveURL(/checkout-step-one\.html/);
  });

  test('checkout info with whitespace-only fields is rejected', async ({ page, atCheckoutInfo }) => {
    test.fail(true, 'Known bug: SauceDemo accepts "   " as a name and postal code');

    await atCheckoutInfo.fillInfo({ firstName: '   ', lastName: '   ', postalCode: '   ' });
    await atCheckoutInfo.continue();

    await expect(atCheckoutInfo.error).toBeVisible({ timeout: 2000 });
    await expect(page).toHaveURL(/checkout-step-one\.html/);
  });
});

// 2. Special characters and XSS
// SauceDemo has no search box, so we use the free-text inputs it does have.
// Note: SauceDemo never shows these values back on the page, so today these tests
// mostly guard against a future change that starts rendering or evaluating them.
test.describe('Special characters and XSS', () => {
  // Proves detectXss() really catches an injection, so the tests below can't pass by accident
  test('XSS detector catches a real injection', async ({ page, loginPage }) => {
    await loginPage.goto();
    await page.evaluate(() =>
      document.body.insertAdjacentHTML('beforeend', '<img src=x onerror="window.__xss=1">'),
    );

    await expect.poll(() => detectXss(page)).toEqual({ ran: true, injected: 1 });
  });

  for (const payload of XSS_PAYLOADS) {
    test(`login does not execute ${payload}`, async ({ page, loginPage }) => {
      const dialogs = trackDialogs(page);
      await loginPage.goto();
      await loginPage.login(payload, payload);

      await expect(loginPage.error).toHaveText(
        'Epic sadface: Username and password do not match any user in this service',
      );
      await expect(loginPage.username).toHaveValue(payload); // kept as plain text
      await expectNoScriptRan(page, dialogs);
    });
  }

  test('checkout info does not execute XSS payloads', async ({ page, atCheckoutInfo }) => {
    const dialogs = trackDialogs(page);

    await atCheckoutInfo.fillInfo({
      firstName: XSS_PAYLOADS[0],
      lastName: XSS_PAYLOADS[1],
      postalCode: XSS_PAYLOADS[2],
    });
    await atCheckoutInfo.continue();
    await expect(page).toHaveURL(/checkout-step-two\.html/);
    await expectNoScriptRan(page, dialogs);

    await atCheckoutInfo.finish();
    await expect(atCheckoutInfo.completeHeader).toHaveText('Thank you for your order!');
    await expectNoScriptRan(page, dialogs);
  });

  test('checkout accepts real-world names with accents, apostrophes and emoji', async ({ page, atCheckoutInfo }) => {
    await atCheckoutInfo.fillInfo({ firstName: 'José-María', lastName: "O'Brien 😀", postalCode: 'SW1A 1AA' });
    await atCheckoutInfo.continue();

    await expect(page).toHaveURL(/checkout-step-two\.html/);
  });
});

// 3. Rapid / repeated clicks (impatient users)
test.describe('Rapid and repeated clicks', () => {
  // Add/Remove is one toggle button: odd clicks = in cart, even clicks = not in cart
  for (const clicks of [2, 3, 5]) {
    test(`clicking Add to cart ${clicks} times in a row leaves a consistent cart`, async ({
      page, loggedIn, cartPage,
    }) => {
      // matches the button whether it currently says Add or Remove
      const toggle = page.locator('button[data-test$="-sauce-labs-backpack"]');
      for (let i = 0; i < clicks; i++) {
        await toggle.click();
      }
      const inCart = clicks % 2 === 1;

      if (inCart) {
        await expect(loggedIn.cartBadge).toHaveText('1');
        await expect(page.getByTestId('remove-sauce-labs-backpack')).toBeVisible();
      } else {
        await expect(loggedIn.cartBadge).toHaveCount(0);
        await expect(page.getByTestId('add-to-cart-sauce-labs-backpack')).toBeVisible();
      }

      // the cart page agrees with the badge
      await loggedIn.openCart();
      await expect(cartPage.items).toHaveCount(inCart ? 1 : 0);
    });
  }

  test('double-clicking Login logs in once without errors', async ({ page, loginPage, inventoryPage }) => {
    await loginPage.goto();
    await loginPage.username.fill(USERS.standard);
    await loginPage.password.fill(PASSWORD);
    await clickTwice(loginPage.loginButton);

    await expect(page).toHaveURL(/inventory\.html$/);
    await expect(inventoryPage.title).toHaveText('Products');
  });

  test('double-clicking Continue and Finish places a single order', async ({
    page, inventoryPage, atCheckoutInfo,
  }) => {
    await atCheckoutInfo.fillInfo(CUSTOMER);

    await clickTwice(atCheckoutInfo.continueButton);
    await expect(page).toHaveURL(/checkout-step-two\.html/);
    await expect(atCheckoutInfo.itemPrices).toHaveCount(1); // not duplicated

    await clickTwice(atCheckoutInfo.finishButton);
    await expect(atCheckoutInfo.completeHeader).toHaveText('Thank you for your order!');
    await expect(inventoryPage.cartBadge).toHaveCount(0); // cart emptied once, not left half-done
  });
});

// 4. Checkout with an empty cart
test.describe('Checkout with an empty cart', () => {
  test('cart page shows no items', async ({ loggedIn, cartPage }) => {
    await loggedIn.openCart();
    await expect(cartPage.items).toHaveCount(0);
  });

  test('checkout button is disabled when the cart is empty', async ({ loggedIn, cartPage }) => {
    test.fail(true, 'Known bug: SauceDemo lets you check out an empty cart and "order" $0.00');

    await loggedIn.openCart();
    await expect(cartPage.items).toHaveCount(0);

    // a positive assertion, so it can't pass early before a click has had time to navigate
    await expect(cartPage.checkoutButton).toBeDisabled({ timeout: 2000 });
  });
});

// 5. Duplicate sign-ups
// SauceDemo has no registration, so we cover the closest cases: logging in twice and adding an item twice
test.describe('Duplicate logins and items', () => {
  test('logging in again while already logged in keeps the cart as it was', async ({
    page, loggedIn, loginPage,
  }) => {
    await loggedIn.addToCart('sauce-labs-backpack');
    await expect(loggedIn.cartBadge).toHaveText('1');

    await loginPage.goto();
    await loginPage.login(USERS.standard, PASSWORD);
    await expect(page).toHaveURL(/inventory\.html$/);

    // the cart is neither lost nor duplicated
    await expect(loggedIn.cartBadge).toHaveText('1');
  });

  test('the same item cannot be added to the cart twice', async ({ page, loggedIn, cartPage }) => {
    await loggedIn.addToCart('sauce-labs-backpack');

    // from the product details page the button already says Remove
    await page.getByTestId('item-4-title-link').click();
    await expect(page.getByTestId('remove')).toBeVisible();
    await expect(page.getByTestId('add-to-cart')).toHaveCount(0);

    await loggedIn.openCart();
    await expect(cartPage.items).toHaveCount(1);
  });
});
