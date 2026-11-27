import { chromium } from 'playwright';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createGameServer } from '../scripts/serve.mjs';

const output = fileURLToPath(new URL('../test-results/', import.meta.url));
await mkdir(output, { recursive: true });
let executablePath = process.env.RIFTFALL_BROWSER;
if (!executablePath && process.platform === 'win32') {
  for (const candidate of ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe']) {
    try { await access(candidate); executablePath = candidate; break; } catch { /* Try the next installed Chromium browser. */ }
  }
}
const server = createGameServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [], requests = [], checks = [];
try {
  browser = await chromium.launch({ executablePath, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', req => requests.push(req.url()));
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.riftfall, { timeout: 30000 });
  assert.equal(await page.locator('#error-panel').isVisible(), false);
  assert.equal(await page.locator('#loading-screen').isVisible(), false);
  await page.screenshot({ path: path.join(output, 'lobby.png') });
  checks.push('3D lobby initializes with local engine and no runtime errors');

  await page.locator('#locker-button').click();
  await page.locator('[data-outfit="mint"]').click();
  assert.equal(await page.locator('[data-outfit="mint"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-close="locker-dialog"]').click();
  assert.match(await page.locator('#selected-outfit-name').textContent(), /Mint/i);
  await page.locator('#settings-button').click();
  await page.locator('#quality').selectOption('low');
  await page.locator('#audio-toggle').uncheck();
  await page.locator('[data-close="settings-dialog"]').last().click();
  await page.reload();
  await page.waitForFunction(() => !!window.riftfall);
  assert.match(await page.locator('#selected-outfit-name').textContent(), /Mint/i);
  assert.equal(await page.locator('#quality').inputValue(), 'low');
  checks.push('Outfit and settings survive a reload');

  await page.locator('#mode-select').selectOption('practice');
  await page.locator('#ready-button').click();
  await page.waitForFunction(() => window.riftfall.getState()?.mode === 'practice');
  const state = () => page.evaluate(() => window.riftfall.getState());
  assert.equal((await state()).remaining, 8);
  assert.equal((await state()).health, 100);
  assert.equal((await state()).ammo, 24);
  await page.locator('#game-canvas').click({ position: { x: 720, y: 450 } });
  await page.waitForTimeout(200);
  const beforeMove = await state();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(180);
  assert.ok((await state()).position.z > beforeMove.position.z + 1);
  checks.push('Practice starts with seven targets; WASD changes the player position');

  const beforeShot = (await state()).ammo;
  await page.mouse.click(720, 450);
  await page.waitForTimeout(200);
  assert.ok((await state()).ammo < beforeShot, 'A primary click consumes rifle ammo');
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => window.riftfall.getState()?.reloading);
  await page.waitForFunction(() => !window.riftfall.getState()?.reloading, { timeout: 6000 });
  assert.equal((await state()).ammo, 24);
  checks.push('Firing consumes ammo and reload transfers reserve rounds');

  await page.keyboard.press('KeyQ');
  await page.waitForFunction(() => window.riftfall.getState()?.building);
  const beforeBuild = (await state()).wood;
  await page.mouse.click(720, 450);
  await page.waitForTimeout(250);
  assert.equal((await state()).wood, beforeBuild - 20);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.riftfall.getState()?.buildType === 'ramp');
  await page.keyboard.press('Digit1');
  checks.push('Building places cover, costs wood, and switches to ramps');
  await page.screenshot({ path: path.join(output, 'match.png') });

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('pause-dialog').open);
  const paused = await state();
  await page.waitForTimeout(400);
  assert.equal((await state()).elapsed, paused.elapsed);
  await page.locator('#resume-button').click();
  await page.waitForTimeout(300);
  assert.ok((await state()).elapsed > paused.elapsed);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('pause-dialog').open);
  await page.locator('#leave-button').click();
  assert.equal(await page.locator('#lobby').isVisible(), true);
  assert.equal(await page.locator('#match-hud').isVisible(), false);
  checks.push('Escape pauses simulation; resume and return to lobby work');

  await page.locator('#mode-select').selectOption('skirmish');
  await page.locator('#ready-button').click();
  await page.waitForFunction(() => window.riftfall.getState()?.mode === 'skirmish');
  await page.waitForTimeout(16000);
  const battle = await state();
  assert.ok(battle.health < 100 || battle.shield < 50, 'Bots can damage the player in skirmish');
  checks.push('Skirmish bots inflict damage');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('pause-dialog').open);
  await page.locator('#leave-button').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'mobile-lobby.png') });
  assert.ok(await page.locator('#ready-button').isVisible());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  checks.push('Narrow lobby remains usable without horizontal overflow');
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.ok(requests.every(url => url.startsWith(origin) || url.startsWith('data:')), 'Game requests only its local assets');
  const result = { passed: true, browser: await browser.version(), checks, errors, externalRequests: requests.filter(url => !url.startsWith(origin) && !url.startsWith('data:')) };
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ passed: false, checks, errors, failure: error.stack }, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
