// Real Babylon rendering/picking plus controlled simulation steps, without product test hooks.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createGameServer } from '../scripts/serve.mjs';
import assert from 'node:assert/strict';

const server = createGameServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const output = fileURLToPath(new URL('../test-results/world-results.json', import.meta.url));
const checks = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.RIFTFALL_BROWSER || (process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : undefined), headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.addInitScript(() => {
    let wrapped;
    Object.defineProperty(window, 'RiftWorld', { configurable: true, get: () => wrapped, set: Original => {
      wrapped = class extends Original { constructor(...args) { super(...args); window.__qaWorld = this; } };
    } });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => !!window.riftfall);
  const ramp = await page.evaluate(() => {
    const w = window.__qaWorld;
    w.engine.stopRenderLoop();
    w.start({ mode: 'practice', quality: 'low' });
    w.obstacles = [];
    w.bots.forEach(bot => bot.root.dispose()); w.bots = [];
    w.hero.root.position.set(0, 0, -5); w.yaw = 0; w.buildType = 'ramp'; w.building = true;
    w.placeBuild();
    w.hero.root.position.set(0, 0, -2); w.building = false; w.keys.add('KeyW');
    for (let i = 0; i < 20; i++) w.update(1 / 60);
    w.keys.clear();
    const walkedHeight = w.hero.root.position.y;
    w.keys.add('Space'); w.update(1 / 60); w.keys.clear();
    for (let i = 0; i < 10; i++) w.update(1 / 60);
    const jumpHeight = w.hero.root.position.y;
    for (let i = 0; i < 80; i++) w.update(1 / 60);
    return { walkedHeight, jumpHeight, landedHeight: w.hero.root.position.y, supportHeight: w.supportHeight(w.hero.root.position.x, w.hero.root.position.z) };
  });
  assert.ok(ramp.walkedHeight > 1, JSON.stringify(ramp));
  assert.ok(ramp.jumpHeight > ramp.walkedHeight + .5, JSON.stringify(ramp));
  assert.ok(Math.abs(ramp.landedHeight - ramp.supportHeight) < .1, JSON.stringify(ramp));
  checks.push('Controlled simulation: player walks up a placed ramp, jumps and lands on its surface');
  const shot = await page.evaluate(() => {
    const w = window.__qaWorld, B = window.BABYLON;
    w.start({ mode: 'practice', quality: 'low' });
    const target = w.bots[0];
    w.camera.position.copyFrom(target.root.position.add(new B.Vector3(0, 1.35, -6)));
    w.camera.setTarget(target.root.position.add(new B.Vector3(0, 1.35, 0)));
    w.scene.render(); w.shoot();
    return { health: target.health, ammo: w.ammo };
  });
  assert.ok(shot.health < 100, JSON.stringify(shot));
  assert.equal(shot.ammo, 23);
  checks.push('Real Babylon ray picking: an unobstructed rifle shot damages a target');
  const victory = await page.evaluate(() => {
    const w = window.__qaWorld;
    w.start({ mode: 'skirmish', quality: 'low' });
    for (const bot of w.bots) w.damageBot(bot, 1000, true);
    return { state: window.riftfall.getState(), resultOpen: document.getElementById('result-dialog').open, title: document.getElementById('result-title').textContent, score: document.getElementById('result-score').textContent };
  });
  assert.equal(victory.state.running, false);
  assert.equal(victory.state.paused, true);
  assert.equal(victory.state.kills, 7);
  // The app ignores callbacks for simulations started directly by this QA harness;
  // exercise its result dialog through an actual UI-started match next.
  await page.locator('#ready-button').click();
  const uiVictory = await page.evaluate(() => {
    const w = window.__qaWorld;
    for (const bot of w.bots) w.damageBot(bot, 1000, true);
    return { open: document.getElementById('result-dialog').open, title: document.getElementById('result-title').textContent };
  });
  assert.equal(uiVictory.open, true);
  assert.equal(uiVictory.title, 'VICTORY!');
  await page.locator('#replay-button').click();
  const replay = await page.evaluate(() => ({ state: window.riftfall.getState(), heldKeys: window.__qaWorld.keys.size }));
  assert.equal(replay.state.running, true); assert.equal(replay.state.kills, 0); assert.equal(replay.state.ammo, 24); assert.equal(replay.heldKeys, 0);
  checks.push('Controlled eliminations trigger victory and clean replay state');
  assert.deepEqual(errors, []);
  await mkdir(fileURLToPath(new URL('../test-results/', import.meta.url)), { recursive: true });
  const result = { passed: true, checks, ramp, shot, errors, scope: 'Real browser with controlled simulation steps; not a full human-played match.' };
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await writeFile(output, JSON.stringify({ passed: false, checks, failure: error.stack }, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
