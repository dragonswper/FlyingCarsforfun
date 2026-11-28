import { REGIONS } from "./world.js";

export const RELICS = Object.freeze([
  {
    id: "quickstep",
    name: "Wayfarer Boots",
    detail: "Move 12% faster.",
    stat: "speed",
    value: 1.12,
  },
  {
    id: "leech",
    name: "Ember Heart",
    detail: "Clean hits restore 3 health.",
    stat: "leech",
    value: 3,
  },
  {
    id: "timeshard",
    name: "Hourglass Shard",
    detail: "Focus lasts 5.5 seconds.",
    stat: "focusDuration",
    value: 5.5,
  },
  {
    id: "reach",
    name: "Longshadow Grip",
    detail: "Melee reach increases by 12%.",
    stat: "reach",
    value: 1.12,
  },
  {
    id: "resolve",
    name: "Warden Seal",
    detail: "Basic attacks cost 15% less stamina.",
    stat: "stamina",
    value: 0.85,
  },
  {
    id: "vitality",
    name: "Sunstone Pendant",
    detail: "Gain 25 maximum health and heal 25.",
    stat: "vitality",
    value: 25,
  },
]);
export const ARMOR_STYLES = Object.freeze([
  { id: "plain", name: "Wanderer", requirement: "Available", color: "#899397" },
  {
    id: "sunforged",
    name: "Sunforged",
    requirement: "Defeat one captain",
    field: "bosses",
    amount: 1,
    color: "#b98a43",
  },
  {
    id: "voidguard",
    name: "Voidguard",
    requirement: "Defeat three captains",
    field: "bosses",
    amount: 3,
    color: "#675d83",
  },
  {
    id: "riftborn",
    name: "Riftborn",
    requirement: "Win an Expedition",
    field: "expeditionWins",
    amount: 1,
    color: "#579e98",
  },
]);
export const WEAPON_FINISHES = Object.freeze([
  {
    id: "steel",
    name: "Tempered steel",
    requirement: "Available",
    color: null,
  },
  {
    id: "obsidian",
    name: "Obsidian",
    requirement: "Land 100 hits",
    field: "hits",
    amount: 100,
    color: "#515168",
  },
  {
    id: "aurora",
    name: "Aurora",
    requirement: "Parry 20 attacks",
    field: "parries",
    amount: 20,
    color: "#89c6bd",
  },
]);
export const cosmeticUnlocked = (item, career) =>
  !item.field || (career[item.field] || 0) >= item.amount;

const modifierCache = new WeakMap();
export function relicModifiers(actor) {
  const key = (actor.relics || []).join(","),
    cached = modifierCache.get(actor);
  if (cached?.key === key) return cached.values;
  const values = { speed: 1, reach: 1, stamina: 1, leech: 0, focusDuration: 4 };
  for (const id of actor.relics || []) {
    const relic = RELICS.find((r) => r.id === id);
    if (relic && relic.stat in values) values[relic.stat] = relic.value;
  }
  modifierCache.set(actor, { key, values });
  return values;
}

function spot(world, origin, distance = 3, angle = 0) {
  for (let step = 0; step < 32; step++) {
    const a = angle + step * 2.39996,
      r = distance + Math.floor(step / 8) * 1.4;
    const point = {
      x: origin.x + Math.sin(a) * r,
      z: origin.z + Math.cos(a) * r,
    };
    if (world.canMove(point.x, point.z, 0.65)) return point;
  }
  return { x: origin.x, z: origin.z };
}
function event(game, type, entity, extra = {}) {
  game.events.push({ type, x: entity.x, z: entity.z, ...extra });
}
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const livingHumans = (game) =>
  game.actors.filter((a) => a.human && a.alive && !a.disconnected);

export function initializeExpedition(game, makeActor, players = 1) {
  const count = Math.max(
    1,
    Math.min(4, Number.isSafeInteger(players) ? players : 1),
  );
  game.player.human = true;
  game.cores[0].health = game.cores[0].maxHealth = 400;
  game.player.stats.expeditions = 1;
  for (let seat = 1; seat < count; seat++) {
    const at = spot(game.world, game.player.spawn, 2.2, seat * 2.1);
    const ally = makeActor(
      `ally-${seat}`,
      0,
      { ...at, facing: game.player.facing },
      game.player.weaponId,
      game.world.regions[0],
      `Wanderer ${seat + 1}`,
    );
    ally.human = true;
    ally.avatar = "knight";
    ally.inventory = [...new Set([game.player.weaponId, "knight-dagger"])];
    ally.stats.expeditions = 1;
    game.actors.push(ally);
  }
  const kinds = ["siege", "escort", "disrupt"];
  const eras = ["ironwood", "sunscar", "glassreach"];
  const names = [
    "Morrow, the Iron Warden",
    "Akhir, Sunforged Captain",
    "Veyra, the Null Sentinel",
  ];
  const objectives = [];
  for (const [index, fort] of game.world.forts.entries()) {
    if (index === 0) continue;
    const order = index - 1,
      team = index,
      region = fort.region;
    const guard = game.actors.find((a) => a.team === team);
    guard.role = "shield";
    guard.name = `${region.faction} Shield`;
    guard.health = guard.maxHealth = 135;
    for (const [offset, role, weapon] of [
      [0, "flanker", "redcanopy-blade"],
      [1, "support", "ash-spear"],
    ]) {
      const at = spot(game.world, fort.spawn, 3 + offset, order + offset * 2.4);
      const npc = makeActor(
        `squad-${team}-${offset}`,
        team,
        { ...at, facing: fort.spawn.yaw + Math.PI },
        weapon,
        region,
        `${region.faction} ${role === "support" ? "Mender" : "Flanker"}`,
      );
      npc.role = role;
      npc.health = npc.maxHealth = role === "flanker" ? 80 : 90;
      game.actors.push(npc);
    }
    const at = spot(game.world, fort.spawn, 5, order + Math.PI);
    const captain = makeActor(
      `captain-${team}`,
      team,
      { ...at, facing: fort.spawn.yaw + Math.PI },
      ["iron-axe", "pulse-mace", "plasma-blade"][order],
      region,
      names[order],
    );
    Object.assign(captain, {
      role: "captain",
      boss: true,
      scale: 1.32,
      health: 280 * (1 + (count - 1) * 0.45),
      maxHealth: 280 * (1 + (count - 1) * 0.45),
      specialAt: 4,
      specialUntil: 0,
    });
    game.actors.push(captain);
    const nodes = Array.from({ length: 3 }, (_, n) => ({
      id: `node-${team}-${n}`,
      ...spot(game.world, fort.spawn, 5 + n * 1.5, n * 2.1),
      health: 45,
      active: false,
      channel: 0,
    }));
    const ownRoad = game.world.paths.slice(0, 4).map((segment) => segment[1]);
    const enemyRoad = game.world.paths
      .slice(index * 4, index * 4 + 4)
      .map((segment) => segment[1])
      .reverse();
    const start = { x: ownRoad[0].x, z: ownRoad[0].z };
    objectives.push({
      id: `objective-${team}`,
      team,
      kind: kinds[order],
      eraId: eras[order],
      bossId: captain.id,
      x: fort.x,
      z: fort.z,
      unlocked: false,
      complete: false,
      nodes,
      wagon: {
        ...start,
        start: { ...start },
        health: 180,
        maxHealth: 180,
        active: false,
        arrived: false,
        retryAt: 0,
      },
      route: [
        ...ownRoad.slice(1),
        ...enemyRoad.slice(1),
        { x: fort.spawn.x, z: fort.spawn.z },
      ],
      routeIndex: 0,
    });
  }
  game.campaign = {
    version: 1,
    phase: 0,
    phaseAt: 60,
    shiftEvery: 60,
    completed: 0,
    objectives,
    players: count,
  };
  for (const actor of game.actors) {
    actor.relics = [];
    actor.relicChoices = [];
    actor.relicRewards = 0;
    actor.riposteUntil = 0;
    actor.squadHealAt = 0;
  }
}

function offerRelics(actor, offset = actor.relics.length) {
  actor.relicChoices = Array.from(
    { length: RELICS.length },
    (_, i) => RELICS[(i + offset) % RELICS.length].id,
  )
    .filter((id) => !actor.relics.includes(id))
    .slice(0, 3);
}

export function chooseRelic(actor, id) {
  if (
    typeof id !== "string" ||
    !actor.relicChoices?.includes(id) ||
    actor.relics.includes(id)
  )
    return false;
  const relic = RELICS.find((r) => r.id === id);
  if (!relic) return false;
  actor.relics.push(id);
  actor.relicChoices = [];
  actor.relicRewards = Math.max(0, (actor.relicRewards || 1) - 1);
  if (actor.relicRewards) offerRelics(actor);
  if (id === "vitality") {
    actor.maxHealth += 25;
    if (actor.alive)
      actor.health = Math.min(actor.maxHealth, actor.health + 25);
  }
  return true;
}

export function expeditionKill(game, attacker, target) {
  if (!game.campaign || !target.boss || target.rewarded) return;
  target.rewarded = true;
  const objective = game.campaign.objectives.find(
    (o) => o.bossId === target.id,
  );
  objective.unlocked = true;
  for (const human of game.actors.filter((a) => a.human)) {
    human.stats.bosses = (human.stats.bosses || 0) + 1;
    // Preserve unclaimed choices if allies defeat another captain meanwhile.
    human.relicRewards = (human.relicRewards || 0) + 1;
    if (!human.relicChoices.length)
      offerRelics(
        human,
        (objective.team + human.relics.length) % RELICS.length,
      );
  }
  event(game, "captain-down", target, {
    actorId: attacker.id,
    targetId: target.id,
    name: target.name,
  });
}

export function objectiveStrike(game, actor, weapon, inRange) {
  if (!game.campaign) return false;
  let struck = false;
  for (const objective of game.campaign.objectives) {
    if (
      actor.team === 0 &&
      objective.unlocked &&
      !objective.complete &&
      objective.kind === "siege"
    ) {
      for (const node of objective.nodes)
        if (node.health > 0 && inRange(node, 0.6)) {
          node.health = Math.max(0, node.health - weapon.damage);
          struck = true;
          event(game, "seal-hit", node, {
            actorId: actor.id,
            damage: weapon.damage,
          });
        }
    }
    if (
      actor.team !== 0 &&
      objective.kind === "escort" &&
      objective.wagon.active &&
      objective.wagon.health > 0 &&
      inRange(objective.wagon, 1)
    ) {
      objective.wagon.health = Math.max(
        0,
        objective.wagon.health - weapon.damage * 0.6,
      );
      struck = true;
      event(game, "wagon-hit", objective.wagon, {
        actorId: actor.id,
        damage: weapon.damage * 0.6,
      });
    }
  }
  return struck;
}

export function nearestHuman(game, actor) {
  return (
    livingHumans(game).sort((a, b) => gap(actor, a) - gap(actor, b))[0] ||
    game.player
  );
}

export function updateExpedition(game, dt, inputs, hurt) {
  const campaign = game.campaign;
  if (!campaign) return;
  if (game.time >= campaign.phaseAt) {
    campaign.phase++;
    campaign.phaseAt += campaign.shiftEvery;
    event(game, "era-shift", game.player, { phase: campaign.phase });
    for (const objective of campaign.objectives) {
      const era =
        REGIONS[
          (REGIONS.findIndex((r) => r.id === objective.eraId) +
            campaign.phase) %
            REGIONS.length
        ];
      objective.currentEra = era.id;
    }
  }
  for (const actor of game.actors) {
    if (actor.human) {
      const input = inputs[actor.id] || {};
      if (input.relic) chooseRelic(actor, input.relic);
      const home = game.cores[0];
      if (
        actor.alive &&
        !actor.disconnected &&
        input.interact &&
        gap(actor, home) < 3 &&
        home.health > 0 &&
        home.health < home.maxHealth &&
        actor.stamina >= 30
      ) {
        home.health = Math.min(home.maxHealth, home.health + 50);
        actor.stamina -= 30;
      }
    }
    if (!actor.alive || actor.disconnected) continue;
    if (actor.role === "support" && actor.clock >= actor.squadHealAt) {
      const ally = game.actors
        .filter(
          (a) =>
            a !== actor &&
            a.alive &&
            a.team === actor.team &&
            gap(a, actor) < 7 &&
            a.health < a.maxHealth,
        )
        .sort((a, b) => a.health / a.maxHealth - b.health / b.maxHealth)[0];
      if (ally) {
        ally.health = Math.min(ally.maxHealth, ally.health + 18);
        actor.squadHealAt = actor.clock + 6;
        event(game, "mend", ally, { actorId: actor.id });
      }
    }
    if (actor.boss) {
      actor.enraged = actor.health <= actor.maxHealth * 0.5;
      if (actor.specialUntil && actor.clock >= actor.specialUntil) {
        for (const target of livingHumans(game))
          if (gap(target, actor) < 3.7)
            hurt(target, actor.enraged ? 25 : 18, actor);
        event(game, "captain-slam", actor, { actorId: actor.id });
        actor.specialUntil = 0;
        actor.specialAt = actor.clock + (actor.enraged ? 5 : 8);
      } else if (
        !actor.specialUntil &&
        actor.clock >= actor.specialAt &&
        livingHumans(game).some((p) => gap(p, actor) < 6)
      ) {
        actor.specialUntil = actor.clock + 0.95;
        event(game, "captain-windup", actor, { actorId: actor.id });
      }
    }
  }
  for (const objective of campaign.objectives) {
    if (
      (objective.currentEra || objective.eraId) === "sunscar" &&
      game.time >= (objective.hazardAt || 0)
    ) {
      objective.hazardAt = game.time + 3;
      const boss = game.actors.find((a) => a.id === objective.bossId);
      for (const human of livingHumans(game))
        if (gap(human, objective) < 3.2) hurt(human, 8, boss);
    }
    if (!objective.unlocked || objective.complete) continue;
    const humans = livingHumans(game);
    if (objective.kind === "siege")
      objective.complete = objective.nodes.every((n) => n.health === 0);
    if (objective.kind === "escort") {
      const wagon = objective.wagon;
      if (wagon.health <= 0) {
        if (!wagon.retryAt) wagon.retryAt = game.time + 8;
        if (game.time >= wagon.retryAt) {
          Object.assign(wagon, wagon.start, {
            health: wagon.maxHealth,
            retryAt: 0,
          });
          objective.routeIndex = 0;
        }
      }
      for (const human of humans)
        if (inputs[human.id]?.interact && gap(human, wagon) < 3) {
          wagon.active = true;
          if (
            wagon.health > 0 &&
            wagon.health < wagon.maxHealth &&
            human.stamina >= 25
          ) {
            wagon.health = Math.min(wagon.maxHealth, wagon.health + 55);
            human.stamina -= 25;
          }
        }
      if (
        wagon.active &&
        wagon.health > 0 &&
        humans.some((p) => gap(p, wagon) < 7)
      ) {
        const to = objective.route[objective.routeIndex];
        if (to) {
          const d = gap(wagon, to);
          if (d < 0.5) objective.routeIndex++;
          else {
            const step = Math.min(d, dt * 3);
            wagon.x += ((to.x - wagon.x) / d) * step;
            wagon.z += ((to.z - wagon.z) / d) * step;
          }
        } else {
          wagon.arrived = true;
          objective.complete = true;
        }
      }
    }
    if (objective.kind === "disrupt") {
      for (const node of objective.nodes) {
        if (node.active) continue;
        const human = humans.find((p) => gap(p, node) < 2.7);
        if (human && inputs[human.id]?.interact && !node.channel) {
          node.channel = game.time + 1.5;
          node.owner = human.id;
          node.ownerHealth = human.health;
        }
        const owner = game.actors.find((a) => a.id === node.owner);
        if (
          node.channel &&
          (!owner?.alive ||
            gap(owner, node) > 2.7 ||
            owner.health < node.ownerHealth)
        ) {
          node.channel = 0;
          node.owner = null;
        }
        if (node.channel && game.time >= node.channel) {
          node.active = true;
          node.channel = 0;
          event(game, "beacon-active", node, { actorId: node.owner });
        }
      }
      objective.complete = objective.nodes.every((n) => n.active);
    }
    if (objective.complete && !objective.announced) {
      objective.announced = true;
      campaign.completed++;
      for (const human of game.actors.filter((a) => a.human))
        human.stats.objectives = (human.stats.objectives || 0) + 1;
      event(game, "objective-complete", objective, { team: objective.team });
    }
  }
}

export function expeditionTask(game, actor) {
  if (!game.campaign) return null;
  const objective = game.campaign.objectives
    .filter((o) => game.cores[o.team]?.health > 0)
    .sort((a, b) => gap(a, actor) - gap(b, actor))[0];
  if (!objective) return "All rival strongholds cleared";
  const captain = game.actors.find((a) => a.id === objective.bossId);
  const prefix = `${Math.round(gap(actor, objective))}m · `;
  if (!objective.unlocked)
    return prefix + `Defeat ${captain.name} (${Math.ceil(captain.health)} HP)`;
  if (objective.complete) return prefix + "The core is exposed — destroy it";
  if (objective.kind === "siege")
    return (
      prefix +
      `Break the three ward seals (${objective.nodes.filter((n) => n.health === 0).length}/3)`
    );
  if (objective.kind === "escort")
    return `Escort caravan · ${Math.round(gap(actor, objective.wagon))}m away · E to start/repair · stay within 7m`;
  return (
    prefix +
    `Disrupt the relays (${objective.nodes.filter((n) => n.active).length}/3) · E, then hold position`
  );
}
