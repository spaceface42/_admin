import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('standalone admin renders with inlined CSS and no boot errors', async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto(pathToFileURL(resolve('admin.html')).href);

  await expect(page.locator('.login-card')).toBeVisible();
  await expect(page.locator('label', { hasText: 'Content / site repository URL' })).toBeVisible();

  const cardRadius = await page.locator('.login-card').evaluate(el => getComputedStyle(el).borderRadius);
  expect(cardRadius).not.toBe('0px');

  await expect(page.locator('#quickSnippetButtons [data-snippet="p"]')).toBeAttached();
  await expect(page.locator('#quickSnippetButtons [data-snippet="h2"]')).toBeAttached();
  await expect(page.locator('#quickSnippetButtons [data-snippet="button"]')).toBeAttached();

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('built admin is fully standalone', async ({ page }) => {
  await page.goto(pathToFileURL(resolve('admin.html')).href);

  const externalAssets = await page.evaluate(() => ({
    css: [...document.querySelectorAll('link[href*="admin.css"]')].length,
    js: [...document.querySelectorAll('script[src*="admin.js"]')].length,
    style: [...document.querySelectorAll('style')].length,
    script: [...document.querySelectorAll('script:not([src])')].length
  }));

  expect(externalAssets.css).toBe(0);
  expect(externalAssets.js).toBe(0);
  expect(externalAssets.style).toBeGreaterThan(0);
  expect(externalAssets.script).toBeGreaterThan(0);
});
