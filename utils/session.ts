import { Page } from '@playwright/test';

/**
 * Plants session state by hand, without going through the login form.
 * SauceDemo keeps the logged-in user in a `session-username` cookie and the
 * cart in localStorage (`cart-contents`), so this is all an attacker would need.
 */
export async function forgeSession(
  page: Page,
  state: { username?: string; localStorage?: Record<string, string> },
) {
  if (state.username !== undefined) {
    await page.context().addCookies([
      { name: 'session-username', value: encodeURIComponent(state.username), url: 'https://www.saucedemo.com' },
    ]);
  }
  if (state.localStorage) {
    // localStorage is per-origin, so we need to be on the site before writing to it
    await page.goto('/');
    await page.evaluate((items) => {
      for (const [key, value] of Object.entries(items)) localStorage.setItem(key, value);
    }, state.localStorage);
  }
}
