import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../src/world.js";
import { createGame, stepGame } from "../src/simulation.js";
import { makeFlick, CombatTuning } from "../src/combat.js";
import {
  chooseRelic,
  relicModifiers,
  objectiveStrike,
  updateExpedition,
} from "../src/expedition.js";
import {
  packExpedition,
  applyExpeditionSnapshot,
} from "../src/expedition-snapshot.js";
import {
  createExpeditionParty,
  sanitizeExpeditionInput,
} from "../src/expedition-party.js";
import { parseMessage } from "../src/network.js";
import { createChronicle } from "../src/chronicle.js";

const game = (players) =>
  createGame(createWorld("RIFTBOUND-QA", "frontier", { preset: "small" }), {
    expedition: true,
    coopPlayers: players || 1,
  });
function quiet(g) {
  for (const actor of g.actors) if (!actor.human) actor.disconnected = true;
}
function tick(g, seconds, input = {}) {
  for (let t = 0; t < seconds; t += 0.05) stepGame(g, 0.05, input);
}

test("Expedition creates captains, specialist squads, three distinct objectives and up to four allies", () => {
  for (const players of [1, 2, 3, 4]) {
    const g = game(players);
    assert.equal(g.actors.filter((a) => a.human).length, players);
    assert.equal(g.actors.filter((a) => a.boss).length, 3);
    assert.equal(g.actors.filter((a) => a.role === "support").length, 3);
    assert.deepEqual(
      g.campaign.objectives.map((o) => o.kind),
      ["siege", "escort", "disrupt"],
    );
    assert.equal(g.cores[0].maxHealth, 400);
    assert.ok(g.actors.every((a) => Number.isFinite(a.facing)));
    for (const objective of g.campaign.objectives) {
      assert.ok(
        objective.route.every(
          (p) => Number.isFinite(p.x) && Number.isFinite(p.z),
        ),
      );
      assert.equal(objective.nodes.length, 3);
    }
  }
});

test("captain defeat grants one relic choice to every ally and the captain stays defeated", () => {
  const g = game(2),
    boss = g.actors.find((a) => a.boss);
  quiet(g);
  boss.disconnected = false;
  boss.stagger = 10;
  Object.assign(boss, {
    x: g.player.x + Math.sin(g.player.facing) * 2,
    z: g.player.z + Math.cos(g.player.facing) * 2,
    health: 1,
  });
  stepGame(g, 0.05, {
    gesture: makeFlick(0, -1, CombatTuning.MinFlickVelocity),
  });
  tick(g, 1);
  assert.equal(boss.alive, false);
  assert.equal(g.campaign.objectives[0].unlocked, true);
  assert.ok(
    g.actors
      .filter((a) => a.human)
      .every((a) => a.relicChoices.length === 3 && a.stats.bosses === 1),
  );
  tick(g, 14);
  assert.equal(boss.alive, false);
  assert.equal(g.player.stats.bosses, 1);
  const reward = g.player.relicChoices[0];
  assert.equal(chooseRelic(g.player, reward), true);
  assert.equal(chooseRelic(g.player, reward), false);
  assert.deepEqual(g.player.relics, [reward]);
});

test("ward seals require actual strikes; completed tasks expose the rival core", () => {
  const g = game();
  quiet(g);
  const task = g.campaign.objectives[0];
  task.unlocked = true;
  objectiveStrike(g, g.player, { damage: 31 }, () => true);
  assert.ok(task.nodes.every((n) => n.health === 14));
  objectiveStrike(g, g.player, { damage: 31 }, () => true);
  tick(g, 0.1);
  assert.equal(task.complete, true);
  assert.equal(g.campaign.completed, 1);
  assert.equal(g.player.stats.objectives, 1);
  tick(g, 0.3);
  assert.equal(g.player.stats.objectives, 1);
});

test("caravan needs a nearby escort; disrupted relays channel and cancel on damage", () => {
  const g = game();
  quiet(g);
  const escort = g.campaign.objectives[1];
  escort.unlocked = true;
  escort.wagon.active = true;
  escort.route = [{ x: escort.wagon.x + 1, z: escort.wagon.z }];
  const before = escort.wagon.x;
  tick(g, 0.5);
  assert.equal(escort.wagon.x, before);
  Object.assign(g.player, { x: escort.wagon.x, z: escort.wagon.z + 1.5 });
  tick(g, 1);
  assert.equal(escort.complete, true);
  const relay = g.campaign.objectives[2];
  relay.unlocked = true;
  const node = relay.nodes[0];
  Object.assign(g.player, { x: node.x + 1, z: node.z });
  stepGame(g, 0.05, { interact: true });
  assert.ok(node.channel > g.time);
  g.player.health--;
  tick(g, 0.1);
  assert.equal(node.channel, 0);
  for (const beacon of relay.nodes) {
    Object.assign(g.player, { x: beacon.x + 1, z: beacon.z });
    stepGame(g, 0.05, { interact: true });
    tick(g, 1.6);
    assert.equal(beacon.active, true);
  }
  assert.equal(relay.complete, true);
});

test("rifts change eras on schedule and relic effects stay within the chosen run", () => {
  const g = game();
  quiet(g);
  tick(g, 60.1);
  assert.equal(g.campaign.phase, 1);
  assert.ok(g.campaign.objectives.every((o) => o.currentEra));
  g.player.relicChoices = ["timeshard"];
  assert.equal(chooseRelic(g.player, "timeshard"), true);
  assert.equal(relicModifiers(g.player).focusDuration, 5.5);
  g.player.flow.charge = 100;
  stepGame(g, 0.05, { focus: true });
  assert.equal(g.player.flow.remaining, 5.5);
  const fresh = game();
  assert.deepEqual(fresh.player.relics, []);
  assert.equal(relicModifiers(fresh.player).focusDuration, 4);
});

test("three clean hits unlock a stamina-paid finisher; parries open a single riposte window", () => {
  const g = createGame(createWorld("FINISHER", "training"));
  g.player.flow.count = 3;
  g.player.flow.window = 3;
  stepGame(g, 0.05, { finisher: true });
  assert.equal(g.player.stats.finishers, 1);
  assert.equal(g.player.stamina, 65);
  assert.equal(g.player.combat.finisher, true);
  assert.equal(g.player.flow.count, 0);
  const poor = createGame(createWorld("NO-FREE-FINISH", "training"));
  stepGame(poor, 0.05, { finisher: true });
  assert.equal(poor.player.stats.swings, 0);
  const counter = createGame(createWorld("RIPOSTE", "training"));
  counter.player.riposteUntil = 2;
  stepGame(counter, 0.05, {
    gesture: makeFlick(0, -1, CombatTuning.MinFlickVelocity),
  });
  assert.equal(counter.player.stats.ripostes, 1);
  assert.equal(counter.player.riposteUntil, 0);
  assert.equal(counter.player.combat.riposte, true);
});

test("co-op snapshots preserve all player seats and reject malformed world or combat data", () => {
  const host = game(4),
    guest = game(4);
  stepGame(host, 0.05);
  const packet = JSON.parse(JSON.stringify(packExpedition(host)));
  assert.equal(applyExpeditionSnapshot(guest, packet), true);
  assert.equal(guest.actors.filter((a) => a.human).length, 4);
  for (const mutate of [
    (p) => (p.actors[0].x = Infinity),
    (p) => (p.actors[0].flow.charge = 1000),
    (p) => (p.campaign.objectives[0].nodes = []),
    (p) => (p.actors[0].inventory = null),
  ]) {
    const invalid = structuredClone(packet);
    mutate(invalid);
    assert.equal(applyExpeditionSnapshot(guest, invalid), false);
  }
});

test("replay poses interpolate without changing gameplay and recorder memory remains bounded", () => {
  const g = createGame(createWorld("FILM", "training"));
  const book = createChronicle({ seconds: 2, hz: 10 });
  for (let i = 0; i < 50; i++) {
    g.time = i * 0.1;
    g.sceneTime = g.time;
    g.player.x = i;
    book.record(g);
  }
  assert.ok(book.count <= 22);
  const x = g.player.x;
  const shown = book.sample(book.end - 0.05);
  assert.ok(shown.player.x < x && shown.player.x > x - 1);
  shown.player.x = -100;
  assert.equal(g.player.x, x);
  book.clear();
  assert.equal(book.count, 0);
});

test("co-op input sanitization rejects forged actions and invalid gesture vectors", () => {
  const safe = sanitizeExpeditionInput({
    moveX: Infinity,
    moveZ: 999,
    focus: "yes",
    finisher: true,
    relic: "admin",
    equip: 100,
    gesture: { x: 1, y: 0, velocity: Infinity },
  });
  assert.equal(safe.moveX, 0);
  assert.equal(safe.moveZ, 1);
  assert.equal(safe.focus, false);
  assert.equal(safe.finisher, true);
  assert.equal(safe.relic, undefined);
  assert.equal(safe.gesture, undefined);
});

test("four local peers receive unique co-op seats and action requests are consumed only once", async (t) => {
  const starts = [],
    snapshots = [];
  const host = createExpeditionParty({
    onStart: (config, id) => starts.push({ config, id }),
  });
  const guests = Array.from({ length: 3 }, () =>
    createExpeditionParty({
      onStart: (config, id) => starts.push({ config, id }),
      onSnapshot: (data) => snapshots.push(data),
    }),
  );
  t.after(() => {
    host.close();
    for (const guest of guests) guest.close();
  });
  await host.host(
    { worldSeed: "COOP-QA", preset: "small", era: "ironwood" },
    4,
    "Host",
  );
  const until = async (fn) => {
    for (let i = 0; i < 150 && !fn(); i++)
      await new Promise((r) => setTimeout(r, 10));
    assert.ok(fn());
  };
  for (const [i, guest] of guests.entries()) {
    const invite = await host.invite("local");
    const answer = await guest.join(invite.code, "Friend " + i);
    await host.answer(invite.id, answer);
    await until(
      () =>
        guest.connected && host.connected && guest.self === "ally-" + (i + 1),
    );
    assert.equal(guest.self, "ally-" + (i + 1));
  }
  host.start();
  await until(() => starts.length === 4);
  assert.ok(starts.every((s) => s.config.coopPlayers === 4));
  guests[0].sendInput({ moveX: 1, focus: true, finisher: true });
  await until(() => host.inputs()["ally-1"]?.focus === true);
  host.consume();
  assert.equal(host.inputs()["ally-1"].focus, undefined);
  assert.equal(host.inputs()["ally-1"].moveX, 1);
  host.sendSnapshot({ time: 1, status: "playing" });
  await until(() => snapshots.length === 3);
});

test("captain warnings allow a dodge and home-core repair requires a living nearby player", () => {
  const g = game(),
    boss = g.actors.find((a) => a.boss);
  quiet(g);
  boss.disconnected = false;
  boss.clock = 5;
  Object.assign(boss, { x: g.player.x + 1, z: g.player.z });
  const damage = [];
  const hurt = (...args) => damage.push(args);
  updateExpedition(g, 0.05, {}, hurt);
  assert.ok(boss.specialUntil > boss.clock);
  assert.equal(damage.length, 0);
  const prior = g.player.x;
  g.player.x = boss.x + 8;
  boss.clock = boss.specialUntil + 0.01;
  updateExpedition(g, 0.05, {}, hurt);
  assert.equal(damage.length, 0);
  boss.health = boss.maxHealth * 0.4;
  boss.clock = boss.specialAt + 0.1;
  g.player.x = prior;
  updateExpedition(g, 0.05, {}, hurt);
  boss.clock = boss.specialUntil + 0.01;
  updateExpedition(g, 0.05, {}, hurt);
  assert.equal(damage[0][1], 25);
  Object.assign(g.player, {
    x: g.cores[0].x,
    z: g.cores[0].z,
    stamina: 100,
    alive: false,
  });
  g.cores[0].health = 300;
  updateExpedition(g, 0.05, { player: { interact: true } }, () => {});
  assert.equal(g.cores[0].health, 300);
  g.player.alive = true;
  updateExpedition(g, 0.05, { player: { interact: true } }, () => {});
  assert.equal(g.cores[0].health, 350);
  assert.equal(g.player.stamina, 70);
});

test("full co-op snapshots fit the transport budget and stale snapshots cannot rewind the world", () => {
  const host = game(4),
    guest = game(4);
  quiet(host);
  tick(host, 2);
  const wire = JSON.stringify({
    type: "coop-snapshot",
    ...packExpedition(host),
    impacts: Array.from({ length: 12 }, (_, i) => ({
      type: "hit",
      x: 0,
      z: 0,
      actorId: "player",
      targetId: "captain-1",
      weaponId: "steel-longsword",
      sequence: i,
      damage: 31,
    })),
  });
  assert.ok(wire.length < 32000);
  assert.ok(parseMessage(wire));
  assert.equal(applyExpeditionSnapshot(guest, JSON.parse(wire)), true);
  const stale = JSON.parse(wire);
  stale.time = 0;
  assert.equal(applyExpeditionSnapshot(guest, stale), false);
  for (const objective of host.campaign.objectives) {
    objective.complete = true;
    host.cores[objective.team].health = 0;
  }
  stepGame(host, 0.05);
  assert.equal(host.status, "won");
  assert.ok(
    host.actors
      .filter((a) => a.human)
      .every((a) => a.stats.expeditionWins === 1),
  );
});

test("captain rewards queue without overwriting an unclaimed relic choice", () => {
  const g = game();
  quiet(g);
  for (const boss of g.actors.filter((a) => a.boss)) {
    boss.disconnected = false;
    boss.stagger = 10;
    Object.assign(boss, {
      x: g.player.x + Math.sin(g.player.facing) * 2,
      z: g.player.z + Math.cos(g.player.facing) * 2,
      health: 1,
    });
    stepGame(g, 0.05, {
      gesture: makeFlick(0, -1, CombatTuning.MinFlickVelocity),
    });
    tick(g, 2);
    assert.equal(boss.alive, false);
  }
  assert.equal(g.player.relicRewards, 3);
  const original = g.player.relicChoices.slice();
  for (let i = 0; i < 3; i++)
    assert.equal(chooseRelic(g.player, g.player.relicChoices[0]), true);
  assert.equal(g.player.relics[0], original[0]);
  assert.equal(new Set(g.player.relics).size, 3);
  assert.equal(g.player.relicRewards, 0);
  assert.deepEqual(g.player.relicChoices, []);
});
