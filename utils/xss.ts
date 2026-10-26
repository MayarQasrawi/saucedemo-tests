import { Page, expect } from '@playwright/test';

/** Records any alert/confirm/prompt the page opens */
export function trackDialogs(page: Page): string[] {
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
export async function detectXss(page: Page) {
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

export async function expectNoScriptRan(page: Page, dialogs: string[]) {
  expect(await detectXss(page)).toEqual({ ran: false, injected: 0 });
  expect(dialogs).toEqual([]);
}
