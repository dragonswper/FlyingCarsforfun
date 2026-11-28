import { REGIONS } from "./world.js";
import { RELICS } from "./expedition.js";
import { AttackPhase } from "./combat.js";
import { validCombatFlow } from "./combat-flow.js";
import { WEAPONS } from "./simulation.js";

export function packExpedition(game) {
  return {
    time: game.time,
    sceneTime: game.sceneTime,
    status: game.status,
    campaign: game.campaign,
    cores: game.cores,
    pickups: game.pickups,
    actors: game.actors.map(({ route, routeGoal, spawn, ...actor }) => actor),
  };
}
export function applyExpeditionSnapshot(game, data) {
  const number = (value, min, max) =>
    Number.isFinite(value) && value >= min && value <= max;
  const point = (p) =>
    p &&
    number(p.x, -game.world.limit - 2, game.world.limit + 2) &&
    number(p.z, -game.world.limit - 2, game.world.limit + 2);
  const combat = (c) =>
    c &&
    Object.values(AttackPhase).includes(c.phase) &&
    number(c.elapsed, 0, 10) &&
    Number.isSafeInteger(c.swingId) &&
    c.swingId >= 0 &&
    [c.gesture, c.buffered].every(
      (g) =>
        g == null ||
        (g &&
          ["LEFT", "RIGHT", "UP", "DOWN"].includes(g.direction) &&
          ["x", "y", "angle", "velocity"].every((k) => Number.isFinite(g[k]))),
    );
  if (
    !data ||
    !number(data.time, game.time, 86400) ||
    !number(data.sceneTime, 0, data.time + 0.01) ||
    !["playing", "won", "lost", "draw"].includes(data.status)
  )
    return false;
  if (
    !Array.isArray(data.actors) ||
    data.actors.length !== game.actors.length ||
    data.actors.length > 24
  )
    return false;
  const ids = new Set(game.actors.map((a) => a.id));
  for (const actor of data.actors) {
    if (
      !actor ||
      !ids.delete(actor.id) ||
      !point(actor) ||
      !number(actor.facing, -100, 100) ||
      !number(actor.clock, 0, 86400) ||
      !number(actor.maxHealth, 1, 2000) ||
      !number(actor.health, 0, actor.maxHealth) ||
      !number(actor.maxStamina, 1, 200) ||
      !number(actor.stamina, 0, actor.maxStamina) ||
      !combat(actor.combat) ||
      !validCombatFlow(actor.flow) ||
      !WEAPONS.some((w) => w.id === actor.weaponId) ||
      !Number.isInteger(actor.team) ||
      actor.team < 0 ||
      actor.team > 3 ||
      typeof actor.alive !== "boolean" ||
      !number(actor.riposteUntil ?? 0, 0, 86400) ||
      !number(actor.scale ?? 1, 0.5, 2) ||
      !Array.isArray(actor.inventory) ||
      actor.inventory.length > 9 ||
      actor.inventory.some((id) => !WEAPONS.some((w) => w.id === id)) ||
      !actor.stats ||
      !["swings", "hits", "kills", "longestCombo", "damage"].every((k) =>
        number(actor.stats[k], 0, 1e8),
      ) ||
      typeof actor.name !== "string" ||
      actor.name.length > 80 ||
      !Array.isArray(actor.relics) ||
      actor.relics.length > 6 ||
      !Number.isInteger(actor.relicRewards ?? 0) ||
      (actor.relicRewards ?? 0) < 0 ||
      (actor.relicRewards ?? 0) > 3 ||
      !Array.isArray(actor.relicChoices) ||
      actor.relicChoices.length > 3 ||
      [...actor.relics, ...actor.relicChoices].some(
        (id) => !RELICS.some((r) => r.id === id),
      )
    )
      return false;
  }
  if (
    !Array.isArray(data.cores) ||
    data.cores.length !== 4 ||
    data.cores.some(
      (core, i) =>
        !point(core) ||
        core.team !== i ||
        !number(core.maxHealth, 1, 2000) ||
        !number(core.health, 0, core.maxHealth),
    )
  )
    return false;
  const c = data.campaign;
  if (
    !c ||
    c.version !== 1 ||
    !Number.isSafeInteger(c.phase) ||
    c.phase < 0 ||
    !number(c.phaseAt, data.time, 86460) ||
    !Array.isArray(c.objectives) ||
    c.objectives.length !== 3
  )
    return false;
  for (const [index, o] of c.objectives.entries()) {
    if (
      !o ||
      o.team !== index + 1 ||
      o.bossId !== game.campaign.objectives[index].bossId ||
      !REGIONS.some((r) => r.id === o.eraId) ||
      (o.currentEra && !REGIONS.some((r) => r.id === o.currentEra)) ||
      !["siege", "escort", "disrupt"].includes(o.kind) ||
      !point(o) ||
      !Array.isArray(o.nodes) ||
      o.nodes.length !== 3 ||
      o.nodes.some(
        (n) =>
          !point(n) ||
          !number(n.health, 0, 45) ||
          !number(n.channel, 0, data.time + 2),
      ) ||
      !point(o.wagon) ||
      !number(o.wagon.health, 0, 180) ||
      !Array.isArray(o.route) ||
      o.route.length > 12 ||
      o.route.some((p) => !point(p))
    )
      return false;
  }
  if (
    !Array.isArray(data.pickups) ||
    data.pickups.length > 200 ||
    data.pickups.some((p) => !point(p))
  )
    return false;
  game.actors = data.actors;
  game.player = game.actors.find((a) => a.id === "player");
  game.cores = data.cores;
  game.pickups = data.pickups;
  game.campaign = c;
  game.time = data.time;
  game.sceneTime = data.sceneTime;
  game.status = data.status;
  return true;
}
