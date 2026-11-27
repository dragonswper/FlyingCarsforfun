import assert from "node:assert/strict";
import { browserFixture, waitRandom, leaveRandom } from "./support.mjs";

const fixture = await browserFixture();
const { run, base } = fixture;
const randomUrl = base + "/games/random-eras/";
const carPreferences = () => {
  localStorage.setItem(
    "boost-circuit.v1",
    JSON.stringify({
      username: "Browser Driver",
      body: "striker",
      arena: "coast",
      quality: "mobile",
      sound: false,
      musicEnabled: false,
      vehicleRevision: 2,
      performanceRevision: 1,
      rendering: { resolutionScale: 50, shadows: "off", grass: "off" },
      matchRules: { scoreLimit: 1 },
    }),
  );
};
async function randomReady(p) {
  await p.goto(randomUrl, { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.randomEras);
  assert.equal(await p.locator("#startup-status").isVisible(), false);
}
async function carReady(p) {
  await p.goto(base + "/");
  await p.waitForFunction(() => window.boostCircuit, null, { timeout: 120000 });
}
const point = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

try {
  await run("hub-library", async (p, context) => {
    await p.goto(base + "/hub/");
    await p.waitForFunction(
      () => document.querySelectorAll(".game-card").length === 5,
    );
    await p.locator('[data-favourite="random-eras"]').click();
    await p.locator('[data-view="favourites"]').click();
    assert.equal(await p.locator(".game-card").count(), 1);
    await p.reload();
    assert.equal(await p.locator(".game-card").count(), 1);
    await p.locator('[data-view="library"]').click();
    await p.fill("#search-input", "Skybreak");
    assert.equal(await p.locator(".game-card").count(), 2);
    await p.click("#reset-filters");
    await p.click("#add-game-top");
    await p.fill("#game-title", "QA game link");
    await p.fill("#game-url", base + "/?custom=qa");
    await p.locator("#add-form button[type=submit]").click();
    assert.equal(await p.locator(".game-card").count(), 6);
    await p
      .locator("[data-details]")
      .filter({ hasText: "QA game link" })
      .click();
    await p.click("#remove-game");
    assert.equal(await p.locator(".game-card").count(), 5);
    for (const [width, height] of [
      [390, 844],
      [844, 390],
      [1000, 650],
    ]) {
      await p.setViewportSize({ width, height });
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    const opened = context.waitForEvent("page");
    await p.locator('.card-play[data-game="random-eras"]').click();
    const game = await opened;
    await game.waitForFunction(() => window.randomEras);
    assert.equal(new URL(game.url()).pathname, "/games/random-eras/");
    await game.close();
    await p.locator('[data-view="recent"]').click();
    assert.match(
      await p.locator(".card-title").first().textContent(),
      /Random/,
    );
  });

  await run("random-desktop-modes-and-saves", async (p) => {
    await randomReady(p);
    await p.locator("[data-open-settings]").first().click();
    await p.selectOption("[data-setting=quality]", "low");
    await p.selectOption("[data-setting=fps]", "30");
    await p.click("[data-settings-tab=controls]");
    await p.selectOption("[data-setting=attackInput]", "click");
    await p.locator("#rebind-controls button").first().click();
    await p.keyboard.press("KeyI");
    await p.locator("#settings-dialog [data-close]").click();
    await p.locator("[data-go=loadout]").first().click();
    await p.fill("#profile-name", "Browser Knight");
    await p.locator("#profile-name").dispatchEvent("change");
    await p.locator("#loadout-screen [data-go=home]").click();
    await p.reload();
    await p.waitForFunction(() => window.randomEras);
    assert.equal(
      await p.evaluate(
        () =>
          JSON.parse(localStorage.getItem("random-eras.settings.v2")).keys
            .forward,
      ),
      "KeyI",
    );
    assert.match(
      await p.locator("[data-profile-name]").first().textContent(),
      /Browser Knight/,
    );
    for (const name of ["modes", "lobby", "loadout", "career", "credits"]) {
      await p.locator(`[data-go=${name}]`).first().click();
      await p.locator("#" + name + "-screen").waitFor({ state: "visible" });
      await p
        .locator("#" + name + "-screen [data-go=home]")
        .first()
        .click();
    }
    await p.locator("[data-play-training]").first().click();
    await waitRandom(p, "training");
    const before = await p.evaluate(() => randomEras.getState().player);
    await p.keyboard.down("KeyI");
    await p.waitForFunction(
      (a) =>
        Math.hypot(
          randomEras.getState().player.x - a.x,
          randomEras.getState().player.z - a.z,
        ) > 0.65,
      before,
    );
    await p.keyboard.up("KeyI");
    const swings = await p.evaluate(() => randomEras.getState().player.swings);
    await p.locator("#game-canvas").click();
    await p.waitForFunction(
      (n) => randomEras.getState().player.swings > n,
      swings,
    );
    await p.keyboard.press("KeyV");
    assert.equal(
      await p.evaluate(() => randomEras.getState().camera.firstPerson),
      false,
    );
    await p.keyboard.press("Tab");
    await p.locator("#score-dialog[open]").waitFor();
    await p.locator("#score-dialog [data-close]").click();
    await leaveRandom(p);
    await p.click("#home-play");
    await p.selectOption("#world-size", "small");
    await p.fill("#world-seed", "BROWSER-QA");
    await p.click("#play-frontier");
    await waitRandom(p, "frontier");
    await p.keyboard.press("KeyM");
    await p.locator("#map-dialog[open]").waitFor();
    await p.locator("#map-dialog [data-close]").click();
    await leaveRandom(p);
    await p.locator("[data-open-arena]").first().click();
    await p.click("#practice");
    await waitRandom(p, "arena");
    await leaveRandom(p);
    await p.locator("[data-go=career]").first().click();
    assert.match(await p.locator("#career-ledger").textContent(), /Sessions/);
  });

  for (const mobile of [false, true])
    await run(
      "random-focus-" + (mobile ? "touch" : "keyboard"),
      async (p) => {
        await randomReady(p);
        await p
          .locator("[data-play-training]")
          .first()
          [mobile ? "tap" : "click"]();
        await waitRandom(p, "training");
        if (!mobile) {
          // Keep synthetic repeated clicks off the HUD. Native pointer-lock
          // movement/attacks are covered in the separate desktop mode case.
          await p.mouse.move(500, 325);
          await p.mouse.down({ button: "right" });
          await p.mouse.up({ button: "right" });
          await p.waitForFunction(
            () =>
              randomEras.getState().input.captured ||
              randomEras.getState().input.dragLook,
          );
        }
        const attack = async () => {
          if (mobile) await p.locator("[data-touch=attack]").tap();
          else {
            await p.mouse.down();
            await p.mouse.up();
          }
        };
        for (let hit = 1; hit <= 5; hit++) {
          await p.waitForFunction(
            () =>
              randomEras.getState().player.phase === "IDLE" &&
              !randomEras.getState().player.guarding &&
              randomEras.getState().player.stamina >= 22,
          );
          const previous = await p.evaluate(
            () => randomEras.getState().training.fixedHits,
          );
          await attack();
          await p.waitForFunction(
            (n) => randomEras.getState().training.fixedHits > n,
            previous,
          );
          assert.equal(
            await p.evaluate(() => randomEras.getState().player.flow.count),
            hit,
          );
          if (hit === 4) {
            const until = await p.evaluate(
              () => randomEras.getState().time + 1.1,
            );
            await p.waitForFunction(
              (t) => randomEras.getState().time >= t,
              until,
            );
          }
        }
        await p.waitForFunction(
          () => !document.querySelector("#focus-button").disabled,
        );
        assert.match(await p.locator("#combo-count").textContent(), /5 HIT/);
        if (mobile) await p.locator("#focus-button").tap();
        else await p.keyboard.press("KeyF");
        await p.waitForFunction(
          () => randomEras.getState().player.flow.remaining > 0,
        );
        assert.equal(
          await p.evaluate(() => randomEras.getState().player.timeScale),
          1,
        );
        const start = await p.evaluate(() => randomEras.getState());
        await p.waitForFunction(
          (t) => randomEras.getState().time > t + 0.5,
          start.time,
        );
        const during = await p.evaluate(() => randomEras.getState());
        assert.ok(
          during.sceneTime - start.sceneTime < (during.time - start.time) * 0.5,
        );
        await p.waitForFunction(
          () =>
            randomEras.getState().player.phase === "IDLE" &&
            !randomEras.getState().player.guarding &&
            randomEras.getState().player.stamina >= 22,
        );
        const hits = await p.evaluate(
          () => randomEras.getState().training.fixedHits,
        );
        await attack();
        await p.waitForFunction(
          (n) => randomEras.getState().training.fixedHits > n,
          hits,
        );
        assert.equal(
          await p.evaluate(() => randomEras.getState().player.flow.charge),
          0,
        );
        await p.screenshot({
          path:
            fixture.out +
            "/random-focus-active-" +
            (mobile ? "touch" : "keyboard") +
            ".png",
        });
        await p.waitForFunction(
          () => randomEras.getState().player.flow.remaining === 0,
        );
        assert.equal(
          await p.evaluate(() => randomEras.getState().player.flow.charge),
          0,
        );
      },
      {
        mobile,
        init: () => {
          // CDP mouse presses can warp the native locked cursor in headless
          // Chromium. Exercise Focus with real drag-look input instead.
          HTMLCanvasElement.prototype.requestPointerLock = undefined;
          localStorage.setItem(
            "random-eras.settings.v2",
            JSON.stringify({
              quality: "low",
              fps: "30",
              attackInput: "click",
              master: 0,
            }),
          );
        },
      },
    );

  await run(
    "random-touch-movement-combat-camera",
    async (p) => {
      await randomReady(p);
      await p.locator("[data-play-training]").first().tap();
      await waitRandom(p, "training");
      const cdp = await p.context().newCDPSession(p);
      const touch = (type, points) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
      const stick = point(await p.locator(".touch-stick").boundingBox()),
        before = await p.evaluate(() => randomEras.getState().player);
      await touch("touchStart", [{ id: 1, ...stick }]);
      await touch("touchMove", [{ id: 1, x: stick.x, y: stick.y - 30 }]);
      await p.waitForFunction(
        (a) =>
          Math.hypot(
            randomEras.getState().player.x - a.x,
            randomEras.getState().player.z - a.z,
          ) > 0.4,
        before,
      );
      await touch("touchEnd", []);
      await p.waitForFunction(() => randomEras.getState().touch.forward === 0);
      const yaw = await p.evaluate(() => randomEras.getState().camera.yaw);
      await touch("touchStart", [{ id: 2, x: 500, y: 190 }]);
      await touch("touchMove", [{ id: 2, x: 580, y: 185 }]);
      await touch("touchEnd", []);
      await p.waitForFunction(
        (v) => Math.abs(randomEras.getState().camera.yaw - v) > 0.04,
        yaw,
      );
      const swings = await p.evaluate(
        () => randomEras.getState().player.swings,
      );
      await p.locator("[data-touch=attack]").tap();
      await p.waitForFunction(
        (n) => randomEras.getState().player.swings > n,
        swings,
      );
      const guard = point(await p.locator("[data-touch=guard]").boundingBox());
      await touch("touchStart", [{ id: 3, ...guard }]);
      await p.waitForFunction(() => randomEras.getState().player.guarding);
      await touch("touchCancel", []);
      await p.waitForFunction(
        () =>
          !randomEras.getState().player.guarding &&
          !randomEras.getState().touch.guard,
      );
      await p.locator("[data-touch=view]").tap();
      assert.equal(
        await p.evaluate(() => randomEras.getState().camera.firstPerson),
        false,
      );
      for (const [width, height] of [
        [320, 568],
        [390, 844],
        [844, 390],
      ]) {
        await p.setViewportSize({ width, height });
        for (const selector of [
          ".touch-stick",
          "[data-touch=attack]",
          "#health",
          "#hud-map",
          ".hud-flow",
          "#focus-button",
        ]) {
          const b = await p.locator(selector).boundingBox();
          assert.ok(
            b &&
              b.x >= 0 &&
              b.y >= 0 &&
              b.x + b.width <= width + 1 &&
              b.y + b.height <= height + 1,
            selector + " is outside the screen",
          );
        }
        await p.screenshot({
          path: fixture.out + `/random-touch-${width}.png`,
        });
      }
      await p.locator("#pause").tap();
      await p.locator("#resume").tap();
      assert.equal(
        await p.evaluate(() => randomEras.getState().touch.forward),
        0,
      );
    },
    { mobile: true },
  );

  await run(
    "random-blocked-storage-and-pointer-fallback",
    async (p) => {
      await randomReady(p);
      await p.locator("[data-open-settings]").first().click();
      await p.click("[data-settings-tab=controls]");
      await p.selectOption("[data-setting=attackInput]", "click");
      await p.locator("#settings-dialog [data-close]").click();
      await p.locator("[data-go=career]").first().click();
      await p.locator("#career-screen [data-go=home]").click();
      await p.locator("[data-play-training]").first().click();
      await waitRandom(p, "training");
      await p.locator("#game-canvas").click();
      const before = await p.evaluate(() => randomEras.getState().camera.yaw);
      await p.mouse.move(430, 290);
      await p.mouse.down();
      await p.mouse.move(520, 290, { steps: 5 });
      await p.mouse.up();
      await p.waitForFunction(
        (n) => Math.abs(randomEras.getState().camera.yaw - n) > 0.02,
        before,
      );
      await p.waitForFunction(
        () => randomEras.getState().player.phase === "IDLE",
      );
      const swings = await p.evaluate(
        () => randomEras.getState().player.swings,
      );
      await p.mouse.down();
      await p.mouse.up();
      await p.waitForFunction(
        (n) => randomEras.getState().player.swings > n,
        swings,
      );
      await p.waitForFunction(() => randomEras.getState().time > 1);
      await leaveRandom(p);
    },
    {
      init: () => {
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          get() {
            throw new DOMException("Storage denied", "SecurityError");
          },
        });
        HTMLCanvasElement.prototype.requestPointerLock = undefined;
      },
    },
  );

  await run(
    "random-entry-download-recovery",
    async (p) => {
      await p.route("**/games/random-eras/assets/index-*.js", (r) =>
        r.abort("failed"),
      );
      await p.goto(randomUrl, { waitUntil: "domcontentloaded" });
      await p.locator("#startup-reload").waitFor({ state: "visible" });
      await p.unrouteAll();
      await p.click("#startup-reload");
      await p.waitForFunction(() => window.randomEras);
      assert.equal(await p.locator("#startup-status").isVisible(), false);
      await p.locator("[data-play-training]").first().click();
      await waitRandom(p, "training");
    },
    { allowErrors: true },
  );

  await run(
    "random-render-download-recovery",
    async (p) => {
      await randomReady(p);
      await p.route("**/games/random-eras/assets/render-*.js", (r) =>
        r.abort("failed"),
      );
      await p.locator("[data-play-training]").first().click();
      await p.locator("#error-dialog[open]").waitFor();
      assert.match(await p.locator("#error-message").textContent(), /Reload/i);
      await p.unrouteAll();
      await p.click("#error-reload");
      await p.waitForFunction(() => window.randomEras);
      await p.locator("[data-play-training]").first().click();
      await waitRandom(p, "training");
    },
    { allowErrors: true },
  );

  for (const id of ["riftfall", "skybreak"])
    await run(id + "-movement-weapons-building-modes", async (p) => {
      await p.goto(base + "/games/" + id + "/");
      await p.waitForFunction(() => window.riftfall, null, { timeout: 60000 });
      assert.equal(await p.locator("#error-panel").isVisible(), false);
      await p.click("#settings-button");
      await p.selectOption("#quality", "low");
      await p.uncheck("#audio-toggle");
      await p.locator("[data-close=settings-dialog]").last().click();
      await p.reload();
      await p.waitForFunction(() => window.riftfall);
      assert.equal(await p.locator("#quality").inputValue(), "low");
      await p.click("#locker-button");
      await p.locator("[data-outfit=mint]").click();
      await p.locator("[data-close=locker-dialog]").click();
      assert.match(
        await p.locator("#selected-outfit-name").textContent(),
        /Mint/i,
      );
      await p.selectOption("#mode-select", "practice");
      await p.click("#ready-button");
      await p.waitForFunction(
        () => window.riftfall.getState()?.mode === "practice",
      );
      await p.locator("#game-canvas").click({ position: { x: 400, y: 250 } });
      const initial = await p.evaluate(() => riftfall.getState());
      await p.keyboard.down("KeyW");
      await p.waitForFunction(
        (a) =>
          Math.hypot(
            riftfall.getState().position.x - a.x,
            riftfall.getState().position.z - a.z,
          ) > 0.4,
        initial.position,
      );
      await p.keyboard.up("KeyW");
      const ammo = await p.evaluate(() => riftfall.getState().ammo);
      await p.mouse.click(400, 250);
      await p.waitForFunction((n) => riftfall.getState().ammo < n, ammo);
      await p.keyboard.press("KeyR");
      await p.waitForFunction(() => riftfall.getState().reloading);
      await p.waitForFunction(() => !riftfall.getState().reloading, null, {
        timeout: 30000,
      });
      assert.equal(await p.evaluate(() => riftfall.getState().ammo), 24);
      await p.keyboard.press("KeyQ");
      await p.waitForFunction(() => riftfall.getState().building);
      const wood = await p.evaluate(() => riftfall.getState().wood);
      await p.mouse.click(400, 250);
      await p.waitForFunction((n) => riftfall.getState().wood === n - 20, wood);
      await p.keyboard.press("Escape");
      await p.locator("#pause-dialog[open]").waitFor();
      const paused = await p.evaluate(() => riftfall.getState().elapsed);
      await p.waitForTimeout(200);
      assert.equal(await p.evaluate(() => riftfall.getState().elapsed), paused);
      await p.click("#resume-button");
      await p.waitForFunction((n) => riftfall.getState().elapsed > n, paused);
      await p.keyboard.press("Escape");
      await p.locator("#pause-dialog[open]").waitFor();
      await p.click("#leave-button");
      const modes = await p
        .locator("#mode-select option")
        .evaluateAll((ns) => ns.map((n) => n.value));
      for (const mode of modes.filter((m) => m !== "practice")) {
        await p.selectOption("#mode-select", mode);
        await p.click("#ready-button");
        await p.waitForFunction((m) => riftfall.getState()?.mode === m, mode);
        await p.keyboard.press("Escape");
        await p.locator("#pause-dialog[open]").waitFor();
        await p.click("#leave-button");
      }
    });

  await run("skybreak-classic-move-build-pause", async (p) => {
    await p.goto(base + "/games/skybreak-classic/");
    await p.waitForFunction(() => window.skybreakClassic);
    await p.click("#play");
    await p.waitForFunction(() => skybreakClassic.getState().active);
    const before = await p.evaluate(() => skybreakClassic.getState().position);
    await p.keyboard.down("KeyW");
    await p.waitForFunction(
      (a) =>
        Math.hypot(
          skybreakClassic.getState().position.x - a.x,
          skybreakClassic.getState().position.z - a.z,
        ) > 0.5,
      before,
    );
    await p.keyboard.up("KeyW");
    await p.keyboard.press("Digit2");
    await p.mouse.click(500, 325);
    await p.waitForFunction(() => skybreakClassic.getState().wood === 290);
    await p.keyboard.press("Escape");
    await p.waitForFunction(() => !skybreakClassic.getState().active);
    await p.click("#play");
    await p.waitForFunction(() => skybreakClassic.getState().active);
  });
  await run(
    "skybreak-classic-no-pointer-lock",
    async (p) => {
      await p.goto(base + "/games/skybreak-classic/");
      await p.waitForFunction(() => window.skybreakClassic);
      await p.click("#play");
      await p.waitForFunction(
        () =>
          skybreakClassic.getState().active &&
          skybreakClassic.getState().dragFallback,
      );
      await p.keyboard.press("Escape");
      await p.waitForFunction(() => !skybreakClassic.getState().active);
    },
    {
      init: () => {
        HTMLCanvasElement.prototype.requestPointerLock = undefined;
      },
    },
  );

  await run(
    "boost-circuit-garage-and-game-modes",
    async (p) => {
      await carReady(p);
      await p.click("#garage-button");
      await p.selectOption("#wheel-finish", "gold");
      await p.fill("#loadout-name", "Browser Gold");
      await p.click("#loadout-save");
      assert.match(
        await p.locator(".loadout-row").first().textContent(),
        /Browser Gold/,
      );
      await p.click(".garage-close");
      for (const mode of ["free", "training", "doubles"]) {
        await p.click(mode === "doubles" ? "#open-play" : "#open-training");
        await p.click(`[data-mode=${mode}]`);
        await p.click("#play-button");
        await p.waitForFunction(
          (m) =>
            boostCircuit.getState().active &&
            boostCircuit.getState().mode === m,
          mode,
          { timeout: 60000 },
        );
        await p.keyboard.down("KeyW");
        await p.waitForFunction(() => boostCircuit.getState().speed > 3);
        await p.keyboard.up("KeyW");
        await p.click("#pause-button");
        await p.click("#leave-button");
      }
      for (const mode of ["hoops", "course", "targets"]) {
        await p.click("#open-play");
        await p.click("#overdrive-modes");
        await p.click(`[data-arcade=${mode}]`);
        await p.waitForFunction(
          (m) =>
            boostCircuit.getState().active &&
            (m === "hoops"
              ? boostCircuit.getState().mode === m
              : boostCircuit.getOverdrive().arcade?.mode === m),
          mode,
          { timeout: 120000 },
        );
        if (mode === "hoops") {
          assert.equal(
            await p.evaluate(() => boostCircuit.getState().players.length),
            4,
          );
          await p.click("#pause-button");
          await p.click("#leave-button");
        } else {
          await p.keyboard.press("KeyR");
          await p.click("#end-practice-button");
          await p.locator("#arcade-dialog").waitFor({ state: "visible" });
          await p.click(".arcade-back");
        }
      }
      await p.click("#open-play");
      await p.click("[data-mode=duel]");
      await p.click("#play-button");
      await p.waitForFunction(() => boostCircuit.getState().active);
      await p.keyboard.down("KeyW");
      await p.keyboard.down("ShiftLeft");
      await p.waitForFunction(
        () => boostCircuit.getState().phase === "goal",
        null,
        { timeout: 60000 },
      );
      await p.keyboard.up("KeyW");
      await p.keyboard.up("ShiftLeft");
      await p.waitForFunction(
        () => boostCircuit.getState().phase === "ended",
        null,
        { timeout: 20000 },
      );
      await p.click("#menu-button");
      await p.click("#open-play");
      await p.click("#replay-studio-button");
      await p.locator(".replay-library-row").first().waitFor();
      await p
        .locator(".replay-library-row")
        .first()
        .getByRole("button", { name: "WATCH", exact: true })
        .click();
      await p.waitForFunction(() => boostCircuit.getOverdrive().replay.active);
      await p.selectOption(".replay-camera", "wide");
      await p.locator(".replay-seek").fill("1");
      await p.locator(".replay-seek").dispatchEvent("input");
      assert.ok(
        (await p.evaluate(() => boostCircuit.getOverdrive().replay.time)) > 0.9,
      );
      await p.click(".replay-close");
    },
    { init: carPreferences },
  );
} finally {
  await fixture.close();
}
