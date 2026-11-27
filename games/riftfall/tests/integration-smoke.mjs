import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createGameServer } from '../scripts/serve.mjs';

const output = fileURLToPath(new URL('../test-results/', import.meta.url));
const results = [];
const errors = [];
const gameServer = createGameServer();
const parentServer = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><html lang="en"><title>Launcher origin test</title><body></body></html>');
});
let browser;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}
async function closeServer(server) {
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(() => resolve()));
}
async function record(name, operation) {
  const started = Date.now();
  try {
    const detail = await operation();
    results.push({ name, passed: true, durationMs: Date.now() - started, ...(detail || {}) });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, durationMs: Date.now() - started, error: error.message });
    throw error;
  }
}
async function readyFrame(page) {
  const element = await page.waitForSelector('iframe#game');
  const frame = await element.contentFrame();
  await frame.waitForFunction(() => Boolean(window.riftfall), { timeout: 30_000 });
  await frame.locator('#loading-screen').waitFor({ state: 'hidden' });
  await frame.locator('#lobby').waitFor({ state: 'visible' });
  return frame;
}
async function startPractice(frame) {
  await frame.selectOption('#mode-select', 'practice');
  await frame.click('#ready-button');
  await frame.locator('#match-hud').waitFor({ state: 'visible' });
  await frame.waitForFunction(() => (window.riftfall.getState()?.elapsed || 0) > .2);
}
const state = frame => frame.evaluate(() => window.riftfall.getState());
async function send(page, targetOrigin, command) {
  await page.evaluate(({ targetOrigin, command }) => {
    document.getElementById('game').contentWindow.postMessage({ type: `riftfall:${command}`, version: 1 }, targetOrigin);
  }, { targetOrigin, command });
}

try {
  await mkdir(output, { recursive: true });
  const gameOrigin = await listen(gameServer);
  const parentOrigin = await listen(parentServer);
  browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(20_000);

  await page.goto(`${gameOrigin}/launcher-example.html`);
  let frame = await readyFrame(page);
  await record('Launcher example receives the real iframe ready event', async () => {
    await page.waitForFunction(() => document.getElementById('status').textContent === 'Game: ready');
    assert.equal(await page.locator('[data-command="pause"]').isEnabled(), true);
    return { status: await page.locator('#status').textContent() };
  });
  await record('Practice starts from the embedded game UI', async () => {
    await startPractice(frame);
    const current = await state(frame);
    assert.equal(current.mode, 'practice');
    return { elapsed: current.elapsed };
  });
  await record('Launcher Pause freezes the local simulation', async () => {
    await page.click('[data-command="pause"]');
    await frame.locator('#pause-dialog').waitFor({ state: 'visible' });
    const before = await state(frame);
    await page.waitForTimeout(350);
    const after = await state(frame);
    assert.equal(after.elapsed, before.elapsed);
    return { elapsedBefore: before.elapsed, elapsedAfter: after.elapsed };
  });
  await record('Launcher Resume advances the local simulation', async () => {
    const before = await state(frame);
    await page.click('[data-command="resume"]');
    await frame.locator('#pause-dialog').waitFor({ state: 'hidden' });
    await frame.waitForFunction(elapsed => window.riftfall.getState().elapsed > elapsed + .1, before.elapsed);
    return { elapsedBefore: before.elapsed, elapsedAfter: (await state(frame)).elapsed };
  });
  await record('Launcher Return to lobby stops the embedded match', async () => {
    await page.click('[data-command="stop"]');
    await frame.locator('#lobby').waitFor({ state: 'visible' });
    await frame.locator('#match-hud').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.getElementById('status').textContent === 'Game: exit');
  });
  await page.screenshot({ path: `${output}/launcher-example.png` });

  await page.goto(parentOrigin);
  const makeParent = configuredOrigin => `<!doctype html><html lang="en"><head><title>Cross-origin launcher</title><style>html,body{margin:0;height:100%;background:#101932}iframe{width:100%;height:100%;border:0}</style></head><body><script>window.bridgeEvents=[];window.addEventListener('message',event=>{if(event.source===document.getElementById('game')?.contentWindow&&event.origin===${JSON.stringify(gameOrigin)})window.bridgeEvents.push({type:event.data?.type,origin:event.origin});});</script><iframe id="game" title="Cross-origin Riftfall" sandbox="allow-scripts allow-same-origin allow-pointer-lock" src="${gameOrigin}/?parentOrigin=${encodeURIComponent(configuredOrigin)}"></iframe></body></html>`;
  await page.setContent(makeParent(parentOrigin));
  frame = await readyFrame(page);
  await record('A different configured parent origin receives ready', async () => {
    assert.notEqual(parentOrigin, gameOrigin);
    await page.waitForFunction(() => window.bridgeEvents.some(event => event.type === 'riftfall:ready'));
    return { parentOrigin, gameOrigin };
  });
  await startPractice(frame);
  await record('Cross-origin parent can pause with its exact configured origin', async () => {
    await send(page, gameOrigin, 'pause');
    await frame.locator('#pause-dialog').waitFor({ state: 'visible' });
    const before = await state(frame);
    await page.waitForTimeout(250);
    assert.equal((await state(frame)).elapsed, before.elapsed);
    await page.waitForFunction(() => window.bridgeEvents.some(event => event.type === 'riftfall:paused'));
  });
  await record('Cross-origin parent can resume and stop with its exact configured origin', async () => {
    const before = await state(frame);
    await send(page, gameOrigin, 'resume');
    await frame.locator('#pause-dialog').waitFor({ state: 'hidden' });
    await frame.waitForFunction(elapsed => window.riftfall.getState().elapsed > elapsed + .1, before.elapsed);
    await send(page, gameOrigin, 'stop');
    await frame.locator('#lobby').waitFor({ state: 'visible' });
    await frame.locator('#match-hud').waitFor({ state: 'hidden' });
  });

  const wrongOrigin = `http://localhost:${new URL(parentOrigin).port}`;
  const wrongFrameUrl = `${gameOrigin}/?parentOrigin=${encodeURIComponent(wrongOrigin)}`;
  await Promise.all([
    frame.waitForURL(wrongFrameUrl),
    page.evaluate(url => { window.bridgeEvents = []; document.getElementById('game').src = url; }, wrongFrameUrl),
  ]);
  frame = await readyFrame(page);
  await startPractice(frame);
  await record('A parent whose origin differs from parentOrigin cannot pause the game', async () => {
    assert.notEqual(new URL(page.url()).origin, wrongOrigin);
    const before = await state(frame);
    await send(page, gameOrigin, 'pause');
    await frame.waitForFunction(elapsed => window.riftfall.getState().elapsed > elapsed + .25, before.elapsed);
    assert.equal(await frame.locator('#pause-dialog').isVisible(), false);
    assert.equal(await page.evaluate(() => window.bridgeEvents.some(event => event.type === 'riftfall:paused')), false);
    return { actualParentOrigin: new URL(page.url()).origin, configuredParentOrigin: wrongOrigin, elapsedBefore: before.elapsed, elapsedAfter: (await state(frame)).elapsed };
  });
  await record('A parent whose origin differs from parentOrigin cannot stop the game', async () => {
    const before = await state(frame);
    await send(page, gameOrigin, 'stop');
    await frame.waitForFunction(elapsed => window.riftfall.getState().elapsed > elapsed + .1, before.elapsed);
    assert.equal(await frame.locator('#match-hud').isVisible(), true);
    assert.equal(await frame.locator('#lobby').isVisible(), false);
  });
  await record('Integration sessions report no uncaught browser errors', async () => assert.deepEqual(errors, []));
  await context.close();
} catch (error) {
  console.error(error.stack || error);
  if (!results.some(result => !result.passed)) results.push({ name: 'Integration harness', passed: false, error: error.message });
  process.exitCode = 1;
} finally {
  await browser?.close();
  await closeServer(gameServer);
  await closeServer(parentServer);
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/integration-results.json`, JSON.stringify({ passed: results.every(result => result.passed), results, browserErrors: errors }, null, 2) + '\n');
  console.log(`Results: ${output}/integration-results.json`);
}
