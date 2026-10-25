import { test, expect } from '../fixtures';

const ITEMS = ['sauce-labs-backpack', 'sauce-labs-bike-light', 'sauce-labs-bolt-t-shirt'];

// 4. Cart
test('badge shows 3 after adding three items and 2 after removing one', async ({ loggedIn, cartPage }) => {
  await expect(loggedIn.cartBadge).toHaveCount(0); // starts empty

  for (const item of ITEMS) {
    await loggedIn.addToCart(item);
  }
  await expect(loggedIn.cartBadge).toHaveText('3');

  await loggedIn.removeFromCart(ITEMS[0]);
  await expect(loggedIn.cartBadge).toHaveText('2');

  // Extra check: the cart page agrees with the badge
  await loggedIn.openCart();
  await expect(cartPage.items).toHaveCount(2);
});
