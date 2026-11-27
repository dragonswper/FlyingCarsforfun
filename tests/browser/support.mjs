import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, X509Certificate } from "node:crypto";
import assert from "node:assert/strict";
import { createGameServer } from "../../server/adapters/node.mjs";
import { tls } from "../helpers/secure-server.mjs";

export async function browserFixture() {
  const out = resolve(process.env.BROWSER_RESULTS || "test-results/browser");
  await mkdir(out, { recursive: true });
  const app = createGameServer({ tls });
  const address = await app.listen(0, "127.0.0.1");
  const base = "https://127.0.0.1:" + address.port;
  const pin = createHash("sha256")
    .update(
      new X509Certificate(tls.cert).publicKey.export({
        type: "spki",
        format: "der",
      }),
    )
    .digest("base64");
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--ignore-certificate-errors-spki-list=" + pin,
    ],
  });
  const results = [];
  async function run(
    name,
    fn,
    { mobile = false, allowErrors = false, init } = {},
  ) {
    if (
      process.env.BROWSER_FILTER &&
      !name.includes(process.env.BROWSER_FILTER)
    )
      return;
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 844, height: 390 }
        : { width: 1000, height: 650 },
      isMobile: mobile,
      hasTouch: mobile,
    });
    if (init) await context.addInitScript(init);
    const page = await context.newPage(),
      errors = [],
      consoleErrors = [];
    context.on("page", wire);
    wire(page);
    function wire(p) {
      p.setDefaultTimeout(20000);
      p.on("pageerror", (e) => errors.push(e.message));
      p.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text().slice(0, 1000));
      });
    }
    try {
      await fn(page, context);
      if (!allowErrors) {
        assert.deepEqual(errors, [], name + " JavaScript errors");
        assert.deepEqual(consoleErrors, [], name + " console errors");
      }
      await page.screenshot({ path: resolve(out, name + ".png") });
      results.push({ name, pass: true, errors, consoleErrors });
      console.log("PASS " + name);
    } catch (e) {
      await page
        .screenshot({ path: resolve(out, name + "-failure.png") })
        .catch(() => {});
      results.push({
        name,
        pass: false,
        error: e.message,
        stack: e.stack,
        gameState: await page
          .evaluate(() => window.randomEras?.getState() ?? null)
          .catch(() => null),
        errors,
        consoleErrors,
      });
      console.log("FAIL " + name + ": " + e.message);
    } finally {
      // Keep completed results even if a later GPU test or runner is interrupted.
      await writeFile(
        resolve(out, "results.json"),
        JSON.stringify({ browser: "Chromium", results }, null, 2),
      );
      await context.close();
    }
  }
  return {
    run,
    base,
    browser,
    results,
    out,
    async close() {
      await browser.close();
      await app.close();
      await writeFile(
        resolve(out, "results.json"),
        JSON.stringify({ browser: "Chromium", results }, null, 2),
      );
      assert.ok(
        results.every((r) => r.pass),
        "Browser gameplay regression failures; see results.json",
      );
    },
  };
}
export async function waitRandom(page, mode) {
  await page.waitForFunction(
    (m) =>
      window.randomEras?.getState().active &&
      randomEras.getState().mode === m &&
      document.querySelector("#game-loading").hidden,
    mode,
    { timeout: 60000 },
  );
}
export async function leaveRandom(page) {
  await page.evaluate(() => document.exitPointerLock?.());
  await page.locator("#pause").click({ force: true });
  await page.locator("#pause-dialog[open]").waitFor();
  await page.locator("#quit").click();
  await page.waitForFunction(() => !randomEras.getState().active);
}
