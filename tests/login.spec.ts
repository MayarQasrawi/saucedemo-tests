import { test, expect } from '../fixtures';
import { USERS, PASSWORD } from '../test-data/users';

test.describe('Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  // 1. Positive
  test('standard_user lands on the products page', async ({ page, loginPage, inventoryPage }) => {
    await loginPage.login(USERS.standard, PASSWORD);

    await expect(page).toHaveURL(/\/inventory\.html$/);
    await expect(inventoryPage.title).toHaveText('Products');
  });

  // 2. Negative (data-driven: same steps, different data)
  const negativeCases = [
    {
      name: 'wrong password',
      user: USERS.standard,
      pass: 'wrong_password',
      error: 'Epic sadface: Username and password do not match any user in this service',
    },
    {
      name: 'empty username',
      user: '',
      pass: PASSWORD,
      error: 'Epic sadface: Username is required',
    },
    {
      name: 'empty password',
      user: USERS.standard,
      pass: '',
      error: 'Epic sadface: Password is required',
    },
    {
      name: 'locked_out_user',
      user: USERS.lockedOut,
      pass: PASSWORD,
      error: 'Epic sadface: Sorry, this user has been locked out.',
    },
  ];

  for (const c of negativeCases) {
    test(`shows exact error for ${c.name}`, async ({ page, loginPage }) => {
      await loginPage.login(c.user, c.pass);

      await expect(loginPage.error).toHaveText(c.error); // exact match
      await expect(page).not.toHaveURL(/inventory/);
    });
  }
});
