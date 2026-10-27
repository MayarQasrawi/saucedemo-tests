# SauceDemo Playwright Test Suite

[![Playwright Tests](https://github.com/MayarQasrawi/saucedemo-tests/actions/workflows/playwright.yml/badge.svg)](https://github.com/MayarQasrawi/saucedemo-tests/actions/workflows/playwright.yml)

End-to-end, accessibility, edge-case and security tests for [SauceDemo](https://www.saucedemo.com), written in TypeScript with [Playwright](https://playwright.dev) and [axe-core](https://github.com/dequelabs/axe-core).

**99 tests across 7 spec files.** All 99 pass. 17 of them are marked `test.fail()` because they record real defects in SauceDemo (see [Known defects](#known-defects)).

---

## Contents

- [What is covered](#what-is-covered)
- [Getting started](#getting-started)
- [Running the tests](#running-the-tests)
- [Project structure](#project-structure)
- [Design decisions](#design-decisions)
- [Known defects](#known-defects)
- [Reports and debugging](#reports-and-debugging)

---

## What is covered

| Spec file | Tests | Focus |
|---|---:|---|
| [`login.spec.ts`](tests/login.spec.ts) | 5 | Successful login, plus data-driven negative cases (wrong password, empty fields, locked-out user) with exact error messages |
| [`cart.spec.ts`](tests/cart.spec.ts) | 1 | Cart badge count updates when items are added and removed |
| [`sorting.spec.ts`](tests/sorting.spec.ts) | 1 | Price (low to high) sort really returns ascending prices |
| [`checkout.spec.ts`](tests/checkout.spec.ts) | 5 | Full purchase flow, required-field validation, and `item total + tax = total` checked in cents |
| [`edge-cases.spec.ts`](tests/edge-cases.spec.ts) | 22 | Empty and whitespace input, special characters and XSS payloads in forms, rapid and double clicks, empty-cart checkout, duplicate logins and items |
| [`accessibility.spec.ts`](tests/accessibility.spec.ts) | 31 | WCAG 2.2 A/AA axe scans of every page and state, keyboard-only navigation, screen-reader semantics, and reflow at 320px |
| [`security.spec.ts`](tests/security.spec.ts) | 34 | Access control on protected pages, forged sessions, direct URL access to checkout steps, back-button after logout, and XSS through URL, localStorage, cookies and the DOM |

### Accessibility approach

Automated scanners catch only about 30–40% of real accessibility issues, so the suite tests in three layers:

1. **axe-core scan** of every page and UI state (error messages, open menu, each checkout step) against WCAG 2.0, 2.1 and 2.2 levels A and AA. The full axe report is attached to the HTML report for every scan.
2. **Keyboard-only checks**: login with Tab and Enter, sort dropdown, menu focus management, cart reachability and visible focus (WCAG 2.1.1, 2.4.3, 2.4.7).
3. **Screen-reader semantics and reflow**: accessible names, `role="alert"` on errors, alt text, unambiguous button names, and no horizontal scroll at 320px (WCAG 1.4.10).

### Security scope

SauceDemo has no backend: auth, cart and session state live in client-side JavaScript, cookies and `localStorage`. The security tests therefore cover only **access control** and **XSS**. SQL injection and OS command injection were left out on purpose, because with no server to reach they would always pass and prove nothing.

XSS detection is done by [`utils/xss.ts`](utils/xss.ts). Every payload in [`test-data/security-payloads.ts`](test-data/security-payloads.ts) tries to set `window.__xss`. A test fails if that flag is set, if a payload lands in the DOM as live markup (a `<script>`, an `on*` handler or a `javascript:` URL), or if any dialog opens. A dedicated test checks that the detector does catch a real injection, so a passing XSS test is meaningful.

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org) 18 or later
- npm

### Install

```bash
git clone https://github.com/MayarQasrawi/saucedemo-tests
cd saucedemo-tests
npm ci
npx playwright install chromium
```

No environment variables or credentials are needed. The tests run against the public site at `https://www.saucedemo.com` with SauceDemo's published demo accounts.

---

## Running the tests

| Command | What it does |
|---|---|
| `npm test` | Run the whole suite headless |
| `npm run test:headed` | Run with a visible browser |
| `npm run test:ui` | Open Playwright UI mode to pick, watch and rerun tests |
| `npm run test:debug` | Step through tests in the Playwright Inspector |
| `npm run test:a11y` | Accessibility tests only |
| `npm run test:edge` | Edge-case tests only |
| `npm run test:security` | Security tests only |
| `npm run report` | Open the last HTML report |

Run a single file or filter by title:

```bash
npx playwright test tests/checkout.spec.ts
npx playwright test -g "locked_out_user"
```

---

## Project structure

```
.
├── fixtures/
│   └── index.ts               # Custom fixtures: page objects, logged-in state, axe builder
├── pages/                     # Page Object Model
│   ├── LoginPage.ts
│   ├── InventoryPage.ts
│   ├── CartPage.ts
│   └── CheckoutPage.ts        # Also exports parseMoney() and toCents()
├── test-data/
│   ├── users.ts               # Demo accounts, password and checkout customer
│   └── security-payloads.ts   # XSS payloads
├── utils/
│   ├── session.ts             # forgeSession(): plant cookies/localStorage without logging in
│   └── xss.ts                 # Dialog tracking and XSS detection helpers
├── tests/                     # Spec files (see "What is covered")
└── playwright.config.ts
```

---

## Design decisions

**Page Object Model.** Each page class in [`pages/`](pages/) owns its locators and actions, so a UI change is fixed in one place rather than in every test.

**Stable locators.** SauceDemo marks elements with `data-test="..."`. The config sets `testIdAttribute: 'data-test'`, so tests use `page.getByTestId(...)` instead of CSS classes or text that may change.

**Fixtures for setup state.** [`fixtures/index.ts`](fixtures/index.ts) extends Playwright's `test` with ready-made states, so tests start where they need to be and skip repeated setup:

| Fixture | Gives you |
|---|---|
| `loginPage`, `inventoryPage`, `cartPage`, `checkoutPage` | Page objects bound to the current page |
| `loggedIn` | Logged in as `standard_user`, on the products page |
| `atCheckoutInfo` | Logged in with the backpack in the cart, on checkout step one |
| `makeAxeBuilder` | An axe scanner preset to the WCAG 2.2 A/AA tags |

Import `test` and `expect` from `../fixtures`, not from `@playwright/test`, to get these.

**Data-driven tests.** Login errors, checkout validation, XSS payloads and per-page accessibility checks loop over data arrays, so adding a case means adding one row.

**Money in cents.** Price checks convert to integer cents with `toCents()` to avoid floating-point errors such as `0.1 + 0.2 !== 0.3`.

**Configuration** ([`playwright.config.ts`](playwright.config.ts)):

- Fully parallel, Desktop Chrome (Chromium)
- 2 retries on CI, none locally
- Screenshot on failure, trace kept on failure
- `list` reporter in the terminal plus an HTML report

---

## Known defects

Tests that document a real bug are marked with `test.fail(true, '<reason>')`. Such a test **passes while the bug exists**. When the bug is fixed it turns red with *"expected to fail, but passed"*, which is the signal to remove the marker.

| Area | Defect | Reference |
|---|---|---|
| Accessibility | No page has an `<h1>` (one test per page, 7 tests) | Best practice |
| Accessibility | Focus drops to `<body>` after the menu closes with Escape | WCAG 2.4.3 |
| Accessibility | Cart link is an `<a>` without `href`, so Tab skips it | WCAG 2.1.1 |
| Accessibility | Focus is lost when "Add to cart" switches to "Remove" | WCAG 2.4.3 |
| Accessibility | Focus outline is removed with no replacement | WCAG 2.4.7 |
| Accessibility | All six "Add to cart" buttons share the same accessible name | WCAG 2.4.6 |
| Validation | Checkout accepts whitespace-only name and postal code | — |
| Business logic | An empty cart can be checked out for $0.00 | — |
| Security | A hand-made `session-username` cookie grants access without logging in | Access control |
| Security | Checkout step two can be opened directly and finished with an empty cart | Access control |
| Security | `checkout-complete.html` shows "Thank you for your order!" with no order placed | Access control |

---

## Reports and debugging

After a run, open the HTML report:

```bash
npm run report
```

The report includes:

- A screenshot and a trace for every failed test (open the trace to replay each step, with DOM snapshots and network calls)
- The full axe-core violation list, attached as JSON to every accessibility scan

Output is written to `playwright-report/` and `test-results/`. Both are git-ignored.
