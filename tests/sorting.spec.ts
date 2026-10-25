import { test, expect } from '../fixtures';

// 3. Sorting
test('price (low to high) is really in ascending order', async ({ loggedIn }) => {
  await loggedIn.sortBy('lohi');
  // allTextContents() does not auto-wait, so confirm the sort was applied first
  await expect(loggedIn.sortSelect).toHaveValue('lohi');

  const actual = await loggedIn.getPrices();
  const expected = [...actual].sort((a, b) => a - b); // copy, then sort numerically

  expect(actual.length).toBeGreaterThan(1);
  expect(actual).toEqual(expected);
});
