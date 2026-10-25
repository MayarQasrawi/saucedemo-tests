import { test, expect } from '../fixtures';
import { parseMoney, toCents } from '../pages/CheckoutPage';
import { USERS, PASSWORD, CUSTOMER } from '../test-data/users';

// 5. Full checkout, starting from the login page
test('full checkout: login -> "Thank you for your order"', async ({
  page, loginPage, inventoryPage, cartPage, checkoutPage,
}) => {
  await loginPage.goto();
  await loginPage.login(USERS.standard, PASSWORD);
  await expect(page).toHaveURL(/inventory\.html/);

  await inventoryPage.addToCart('sauce-labs-backpack');
  await inventoryPage.openCart();
  await cartPage.checkout();

  await checkoutPage.fillInfo(CUSTOMER);
  await checkoutPage.continue();
  await expect(page).toHaveURL(/checkout-step-two\.html/);

  await checkoutPage.finish();
  await expect(page).toHaveURL(/checkout-complete\.html/);
  await expect(checkoutPage.completeHeader).toHaveText('Thank you for your order!');
});

// 6. Checkout form validation
test.describe('Checkout info validation', () => {
  test.beforeEach(async ({ loggedIn, cartPage }) => {
    await loggedIn.addToCart('sauce-labs-backpack');
    await loggedIn.openCart();
    await cartPage.checkout();
  });

  // Leave ONE field empty each time, so we know exactly which rule fired
  const cases = [
    { field: 'firstName', error: 'Error: First Name is required' },
    { field: 'lastName', error: 'Error: Last Name is required' },
    { field: 'postalCode', error: 'Error: Postal Code is required' },
  ] as const;

  for (const c of cases) {
    test(`shows error when ${c.field} is empty`, async ({ page, checkoutPage }) => {
      await checkoutPage.fillInfo({ ...CUSTOMER, [c.field]: '' });
      await checkoutPage.continue();

      await expect(checkoutPage.error).toHaveText(c.error);
      await expect(page).toHaveURL(/checkout-step-one\.html/); // did not move on
    });
  }
});

// 7. Price math on the overview page
test('item total + tax = total', async ({ page, loggedIn, cartPage, checkoutPage }) => {
  await loggedIn.addToCart('sauce-labs-backpack');
  await loggedIn.addToCart('sauce-labs-bolt-t-shirt');
  await loggedIn.openCart();
  await cartPage.checkout();
  await checkoutPage.fillInfo(CUSTOMER);
  await checkoutPage.continue();
  await expect(page).toHaveURL(/checkout-step-two\.html/);

  const itemTotal = parseMoney(await checkoutPage.subtotal.textContent());
  const tax = parseMoney(await checkoutPage.tax.textContent());
  const total = parseMoney(await checkoutPage.total.textContent());

  // Main assertion (in cents, not floats)
  expect(toCents(itemTotal + tax)).toBe(toCents(total));

  // Bonus: item total really equals the sum of the listed item prices
  const prices = (await checkoutPage.itemPrices.allTextContents()).map(parseMoney);
  const sum = prices.reduce((a, b) => a + b, 0);
  expect(toCents(sum)).toBe(toCents(itemTotal));
});
