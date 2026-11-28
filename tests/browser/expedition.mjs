import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserFixture, waitRandom, leaveRandom } from "./support.mjs";
process.env.BROWSER_RESULTS ||= "test-results/browser-expedition";
const f = await browserFixture(),
  { run, base } = f;
const prefs = () => {
  HTMLCanvasElement.prototype.requestPointerLock = undefined;
  if (location.protocol === "https:")
    localStorage.setItem(
      "random-eras.settings.v2",
      JSON.stringify({
        quality: "low",
        resolution: 0.5,
        fps: "30",
        master: 0,
        attackInput: "click",
      }),
    );
};
async function ready(p) {
  await p.goto(base + "/games/random-eras/");
  await p.waitForFunction(() => window.randomEras?.version === "0.5.0");
}
try {
  await run(
    "expedition-world-replay-and-photo",
    async (p) => {
      await ready(p);
      await p.click("#home-play");
      await p.selectOption("#world-size", "small");
      await p.fill("#world-seed", "MEGA-BROWSER");
      await p.selectOption("#frontier-rules", "expedition");
      await p.click("#play-frontier");
      await waitRandom(p, "frontier");
      const state = await p.evaluate(() => randomEras.getState());
      assert.equal(state.expedition.bosses.length, 3);
      assert.deepEqual(
        state.expedition.objectives.map((o) => o.kind),
        ["siege", "escort", "disrupt"],
      );
      await p.waitForFunction(() => randomEras.getState().chronicle.count > 8);
      assert.match(await p.locator("#hud-objective").textContent(), /Defeat/);
      await p.keyboard.press("KeyP");
      await p.locator("#chronicle-dialog[open]").waitFor();
      assert.equal(
        await p.evaluate(() => randomEras.getState().chronicle.mode),
        "photo",
      );
      const time = await p.evaluate(() => randomEras.getState().time);
      await p.locator("#photo-yaw").fill("90");
      await p.locator("#photo-distance").fill("13");
      await p.evaluate(() => new Promise(requestAnimationFrame));
      assert.equal(await p.evaluate(() => randomEras.getState().time), time);
      const downloaded = p.waitForEvent("download");
      await p.locator("[data-film=capture]").click();
      const download = await downloaded;
      const png = await readFile(await download.path());
      assert.ok(png.length > 10000);
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      await p.locator("[data-film=close]").last().click();
      await p.click("#pause");
      await p.click("#watch-chronicle-pause-dialog");
      await p.locator("#replay-controls").waitFor({ state: "visible" });
      await p
        .locator("#film-seek")
        .fill(
          String(await p.evaluate(() => randomEras.getState().chronicle.start)),
        );
      await p.locator("#film-seek").dispatchEvent("input");
      assert.equal(
        await p.evaluate(() => randomEras.getState().chronicle.playing),
        false,
      );
      await p.screenshot({ path: f.out + "/expedition-replay.png" });
      await p.locator("[data-film=close]").last().click();
      await p.locator("#pause-dialog[open]").waitFor();
      await p.click("#quit");
      await p.waitForFunction(() => !randomEras.getState().active);
    },
    { init: prefs },
  );

  await run(
    "expedition-mobile-finisher-and-hud",
    async (p) => {
      await ready(p);
      await p.locator("[data-play-training]").first().tap();
      await waitRandom(p, "training");
      await p.waitForFunction(() => randomEras.getState().time > 0.3);
      for (let i = 0; i < 3; i++) {
        await p.waitForFunction(
          () =>
            randomEras.getState().player.phase === "IDLE" &&
            !randomEras.getState().player.guarding &&
            randomEras.getState().player.stamina >= 22,
        );
        const n = await p.evaluate(
          () => randomEras.getState().training.fixedHits,
        );
        await p.locator("[data-touch=attack]").tap();
        await p.waitForFunction(
          (n) => randomEras.getState().training.fixedHits > n,
          n,
        );
      }
      await p.waitForFunction(
        () => !document.querySelector("#finisher-button").disabled,
      );
      await p.locator("#finisher-button").tap();
      await p.waitForFunction(
        () => randomEras.getState().player.finishers === 1,
      );
      await p.waitForFunction(
        () => randomEras.getState().training.fixedHits >= 4,
      );
      assert.equal(
        await p.locator("#finisher-button kbd").textContent(),
        "TAP",
      );
      for (const [width, height] of [
        [320, 568],
        [390, 844],
        [844, 390],
      ]) {
        await p.setViewportSize({ width, height });
        for (const id of [
          ".touch-stick",
          "[data-touch=attack]",
          "[data-touch=pickup]",
          "#focus-button",
          "#finisher-button",
        ]) {
          const r = await p.locator(id).boundingBox();
          assert.ok(
            r &&
              r.x >= 0 &&
              r.y >= 0 &&
              r.x + r.width <= width + 1 &&
              r.y + r.height <= height + 1,
            id,
          );
        }
        await p.screenshot({
          path: f.out + `/expedition-hud-${width}x${height}.png`,
        });
      }
      await p.locator("#pause").tap();
      await p.locator("#photo-mode-pause-dialog").tap();
      await p.locator("#chronicle-dialog[open]").waitFor();
      await p.screenshot({ path: f.out + "/expedition-mobile-photo.png" });
      await p.locator("[data-film=close]").last().tap();
      await p.locator("#pause-dialog[open]").waitFor();
      await p.locator("#quit").tap();
    },
    { mobile: true, init: prefs },
  );

  for (const connection of ["local", "internet"])
    await run(
      `expedition-coop-${connection}-invite-start-and-guest-input`,
      async (p, context) => {
        const q = await context.newPage();
        for (const [page, name] of [
          [p, "Co-op Host"],
          [q, "Co-op Guest"],
        ]) {
          await ready(page);
          await page.locator("[data-go=loadout]").first().click();
          await page.fill("#profile-name", name);
          await page.locator("#profile-name").dispatchEvent("change");
          await page.locator("#loadout-screen [data-go=home]").click();
          await page.click("#home-play");
          await page.selectOption("#world-size", "small");
          await page.fill("#world-seed", "COOP-BROWSER");
          await page.click("#open-expedition-coop");
        }
        await p.selectOption("#coop-capacity", "2");
        await p.selectOption("#coop-transport", connection);
        await p.click("#coop-host");
        await p.click("#coop-new-invite");
        await p.waitForFunction(
          () =>
            document
              .querySelector("#coop-output")
              .value.startsWith("EXP1.RE5.") ||
            /No connection addresses|failed|unavailable/i.test(
              document.querySelector("#coop-status").textContent,
            ),
        );
        const invite = await p.inputValue("#coop-output");
        assert.ok(
          invite.startsWith("EXP1.RE5."),
          await p.locator("#coop-status").textContent(),
        );
        await q.fill("#coop-input", invite);
        await q.click("#coop-join");
        await q.waitForFunction(
          () =>
            document
              .querySelector("#coop-output")
              .value.startsWith("EXP1.RE5.") &&
            document.querySelector("#coop-output").value.includes("answer."),
        );
        await p.fill("#coop-input", await q.inputValue("#coop-output"));
        await p.click("#coop-answer");
        await p.waitForFunction(
          () => !document.querySelector("#coop-start").disabled,
        );
        await p.click("#coop-start");
        await Promise.all([
          waitRandom(p, "frontier"),
          waitRandom(q, "frontier"),
        ]);
        await q.waitForFunction(
          () =>
            randomEras.getState().party.self === "ally-1" &&
            randomEras.getState().party.members.length === 2,
        );
        assert.equal(
          await p.evaluate(() => randomEras.getState().party.role),
          "host",
        );
        assert.equal(
          await q.evaluate(() => randomEras.getState().party.role),
          "guest",
        );
        const before = await q.evaluate(() => randomEras.getState().player);
        await q.keyboard.down("KeyW");
        await q.waitForFunction(
          (a) =>
            Math.hypot(
              randomEras.getState().player.x - a.x,
              randomEras.getState().player.z - a.z,
            ) > 0.5,
          before,
          { timeout: 30000 },
        );
        await q.keyboard.up("KeyW");
        await p.waitForFunction((a) => {
          const peer = randomEras
            .getState()
            .party.members.find((m) => m.id === "ally-1");
          return peer && Math.hypot(peer.x - a.x, peer.z - a.z) > 0.5;
        }, before);
        assert.equal(
          await p.evaluate(
            () =>
              randomEras.getState().party.members.find((m) => m.id === "ally-1")
                .name,
          ),
          "Co-op Guest",
        );
        await q.screenshot({
          path: f.out + `/expedition-coop-${connection}-guest.png`,
        });
        await leaveRandom(p);
        await q.locator("#pause-dialog[open]").waitFor();
        assert.match(
          await q.locator("#pause-note").textContent(),
          /host disconnected/i,
        );
      },
      { init: prefs },
    );
} finally {
  await f.close();
}
