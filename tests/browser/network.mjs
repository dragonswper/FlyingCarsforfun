import assert from "node:assert/strict";
import { browserFixture, waitRandom, leaveRandom } from "./support.mjs";
process.env.BROWSER_RESULTS ||= "test-results/browser-network";
const f = await browserFixture(),
  { run, base } = f;
const carPreferences = () => {
  localStorage.setItem(
    "boost-circuit.v1",
    JSON.stringify({
      username: "QA Driver",
      body: "striker",
      arena: "coast",
      quality: "mobile",
      sound: false,
      musicEnabled: false,
      vehicleRevision: 2,
      performanceRevision: 1,
      rendering: { resolutionScale: 50, shadows: "off", grass: "off" },
    }),
  );
};
async function random(p) {
  await p.goto(base + "/games/random-eras/");
  await p.waitForFunction(() => window.randomEras);
  await p.locator("[data-open-arena]").first().click();
}
async function car(p) {
  await p.goto(base + "/");
  await p.waitForFunction(() => window.boostCircuit, null, { timeout: 120000 });
  await p.click("#open-multiplayer");
  await p.click("#open-custom-lobby");
  await p.selectOption("#party-connection", "server");
  await p.fill("#party-server-url", base);
  await p.locator("#party-server-url").dispatchEvent("change");
}
try {
  await run("random-two-tab-invite-ready-and-match", async (p, context) => {
    const q = await context.newPage();
    await random(p);
    await random(q);
    await p.click("#local-match");
    await p.waitForFunction(
      () => document.querySelector("#network-output").value.length > 10,
    );
    const invite = await p.inputValue("#network-output");
    await q.click("#join-match");
    await q.fill("#network-input", invite);
    await q.click("#network-connect");
    await q.waitForFunction(
      () => document.querySelector("#network-output").value.length > 10,
    );
    const answer = await q.inputValue("#network-output");
    await p.fill("#network-input", answer);
    await p.click("#network-connect");
    await p.waitForFunction(
      () => randomEras.getState().network.status === "connected",
    );
    await q.waitForFunction(
      () => randomEras.getState().network.status === "connected",
    );
    await q.click("#practice");
    await p.click("#practice");
    await Promise.all([waitRandom(p, "arena"), waitRandom(q, "arena")]);
    assert.equal(
      await p.evaluate(() => randomEras.getState().network.role),
      "host",
    );
    assert.equal(
      await q.evaluate(() => randomEras.getState().network.role),
      "guest",
    );
    await q.screenshot({ path: f.out + "/random-online-guest.png" });
    await leaveRandom(p);
    await q.waitForFunction(
      () => randomEras.getState().network.status !== "connected",
    );
  });
  await run(
    "boost-private-server-join-teams-chat-and-match",
    async (p, context) => {
      const guest = await f.browser.newContext({
        viewport: { width: 1000, height: 650 },
      });
      await guest.addInitScript(carPreferences);
      const q = await guest.newPage(),
        guestErrors = [];
      q.setDefaultTimeout(20000);
      q.on("pageerror", (e) => guestErrors.push(e.message));
      q.on("console", (m) => {
        if (m.type() === "error") guestErrors.push(m.text());
      });
      try {
        await car(p);
        await p.selectOption("#party-arena", "coast");
        await p.selectOption("#party-mode", "custom");
        await p.click("#party-create");
        await p.waitForFunction(
          () => document.querySelector("#party-code").value.length > 5,
          null,
          { timeout: 30000 },
        );
        const code = await p.inputValue("#party-code");
        await car(q);
        await q.fill("#party-invite-input", code);
        await q.locator("#party-join-form button[type=submit]").click();
        await p.waitForFunction(
          () => boostCircuit.getLobby().members.length === 2,
          null,
          { timeout: 45000 },
        );
        await q.waitForFunction(
          () => boostCircuit.getLobby().members.length === 2,
        );
        await p.selectOption("#party-team", "0");
        await q.selectOption("#party-team", "1");
        await p.click("#party-ready");
        await q.click("#party-ready");
        await p.waitForFunction(
          () => !document.querySelector("#party-start").disabled,
          null,
          { timeout: 90000 },
        );
        await p.click("#party-start");
        await Promise.all([
          p.waitForFunction(() => boostCircuit.getState().active, null, {
            timeout: 120000,
          }),
          q.waitForFunction(() => boostCircuit.getState().active, null, {
            timeout: 120000,
          }),
        ]);
        await q.keyboard.down("KeyW");
        await q.waitForFunction(() => boostCircuit.getState().speed > 5, null, {
          timeout: 20000,
        });
        await q.keyboard.up("KeyW");
        assert.equal(
          await q.evaluate(() => boostCircuit.getState().network.role),
          "guest",
        );
        assert.equal(
          await p.evaluate(() => boostCircuit.getState().players.length),
          2,
        );
        await q.click("#hud-chat-button");
        await q.fill("#chat-text", "QA private-room message");
        await q.click("#chat-send");
        await q.locator("#chat-dialog").waitFor({ state: "hidden" });
        await p.click("#hud-chat-button");
        await p.waitForFunction(() =>
          document
            .querySelector("#chat-log")
            .textContent.includes("QA private-room message"),
        );
        await p.click("#chat-back");
        await p.screenshot({ path: f.out + "/boost-dedicated-host.png" });
        await q.screenshot({ path: f.out + "/boost-dedicated-guest.png" });
        assert.deepEqual(guestErrors, [], "Guest browser errors");
      } finally {
        await guest.close();
      }
    },
    { init: carPreferences },
  );
} finally {
  await f.close();
}
