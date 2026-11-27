import { AttackPhase, CombatTuning, Cuts, advanceCombat, createCombatState, isSwinging, makeFlick } from './combat.js';

export const WEAPONS = Object.freeze([
  { id: 'bronze-sword', name: 'Bronze Sword', era: 'Bronze Age', weight: 1.3, damage: 24, reach: 2.85, windup: 0.17, swing: 0.24, recovery: 0.26, stamina: 17, color: '#ddad6b', description: 'Quick strikes with a short reach.' },
  { id: 'iron-axe', name: 'Iron Axe', era: 'Iron Age', weight: 3.2, damage: 39, reach: 3.05, windup: 0.30, swing: 0.30, recovery: 0.43, stamina: 27, color: '#a4afbb', description: 'A heavy swing with high impact.' },
  { id: 'steel-longsword', name: 'Steel Longsword', era: 'Medieval', weight: 2.1, damage: 31, reach: 3.45, windup: 0.24, swing: 0.25, recovery: 0.34, stamina: 22, color: '#d4def0', description: 'A long reach with a measured swing.' },
  { id: 'plasma-blade', name: 'Plasma Blade', era: 'Future', weight: 0.8, damage: 26, reach: 3.05, windup: 0.14, swing: 0.21, recovery: 0.32, stamina: 20, color: '#73eed6', description: 'A light blade that follows the mouse closely.' },
  { id: 'knight-dagger', name: 'Knight’s Dagger', era: 'Medieval', weight: 0.62, damage: 16, reach: 1.85, windup: 0.12, swing: 0.18, recovery: 0.20, stamina: 11, color: '#d4cfb8', description: 'An agile close-range blade.' },
  { id: 'stone-club', name: 'Knapped Club', era: 'Stone', weight: 2.7, damage: 34, reach: 2.5, windup: 0.27, swing: 0.29, recovery: 0.38, stamina: 24, color: '#bbb195', description: 'A heavy stone head on a short haft.', form: 'club' },
  { id: 'ash-spear', name: 'Ash Spear', era: 'Ancient', weight: 2.4, damage: 28, reach: 4.05, windup: 0.28, swing: 0.25, recovery: 0.42, stamina: 24, color: '#a99268', description: 'Reach across a gap. Leave room to recover.', form: 'spear' },
  { id: 'redcanopy-blade', name: 'Redcanopy Blade', era: 'Feudal', weight: 1.35, damage: 27, reach: 3.22, windup: 0.16, swing: 0.21, recovery: 0.29, stamina: 19, color: '#db9e83', description: 'A quick curved blade that favors follow-ups.', form: 'curved' },
  { id: 'pulse-mace', name: 'Pulse Mace', era: 'Futuristic', weight: 3.8, damage: 43, reach: 2.77, windup: 0.34, swing: 0.28, recovery: 0.47, stamina: 31, color: '#88d7cf', description: 'A short, heavy blow with a long reset.', form: 'mace' },
].map(Object.freeze));

const WEAPON_BY_ID = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
const REGION_WEAPON = {
  flintwake: 'stone-club', redcanopy: 'redcanopy-blade', ashline: 'ash-spear',
  ironwood: 'steel-longsword',
  sunscar: 'bronze-sword',
  frostfall: 'iron-axe',
  glassreach: 'plasma-blade',
};
const ACTOR_RADIUS = 0.47;
const CORE_RADIUS = 0.85;
const STAMINA_REGEN = 22;
const EMPTY_INPUT = Object.freeze({});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const axis = (value) => Number.isFinite(value) ? clamp(value, -1, 1) : 0;
const distance = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const heading = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const regionId = (region) => typeof region === 'object' ? region?.id : region;

export function getWeapon(id) {
  return WEAPON_BY_ID.get(id) || WEAPONS[0];
}

function seedValue(seed) {
  let value = 2166136261;
  for (const character of String(seed)) {
    value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  }
  return value >>> 0;
}

function random(game) {
  game.randomState = (Math.imul(game.randomState, 1664525) + 1013904223) >>> 0;
  return game.randomState / 4294967296;
}

function makeActor(id, team, spawn, weaponId, region, name) {
  const facing = Number.isFinite(spawn.yaw) ? spawn.yaw + Math.PI : (spawn.facing || 0);
  return {
    id, team, name, regionId: regionId(region), x: spawn.x, z: spawn.z, facing,
    spawn: { x: spawn.x, z: spawn.z, facing },
    health: 100, maxHealth: 100, stamina: 100, maxStamina: 100,
    stats: { swings: 0, hits: 0, damage: 0, blocks: 0, parries: 0, kills: 0, chain: 0, longestCombo: 0, recordedSwing: 0 },
    alive: true, guarding: false, aimX: 0.65, aimY: 0.15, speed: 0,
    combat: createCombatState(), regenDelay: 0, guardTime: 0, guardLocked: false, stagger: 0,
    weaponId, inventory: [weaponId], respawnAt: 0, attackAt: 0, routeAt: 0,
    route: [], routeGoal: null, approachSide: team % 2 ? -1 : 1,
  };
}

export function createGame(world, { arenaWeapon, startingWeapon = 'steel-longsword', versus } = {}) {
  const arena = world.mode === 'arena';
  const training = world.mode === 'training';
  const game = {
    world, actors: [], cores: [], pickups: [], events: [], status: 'playing', time: 0,
    player: null, rival: null, versus: arena && (versus === 'online' || versus === true) ? 'online' : 'bot',
    randomState: seedValue(world.seed), hitStop: 0,
    training: training ? { swings: 0, fixedHits: 0, movingHits: 0, combos: 0, guardUsed: false } : null,
  };

  world.spawns.forEach((spawn, index) => {
    const fort = world.forts[index];
    const region = spawn.region || fort?.region || world.regionAt(spawn.x, spawn.z);
    const human = index === 0 || (arena && game.versus === 'online');
    const weapon = getWeapon(arena ? arenaWeapon : human ? startingWeapon : REGION_WEAPON[regionId(region)]);
    const name = index === 0 ? 'You' : spawn.drill ? (spawn.drill === 'fixed' ? 'Fixed target' : 'Moving target')
      : arena ? 'Challenger' : `${region?.faction || 'Frontier'} Guard`;
    const actor = makeActor(index === 0 ? 'player' : `rival-${index}`, index, spawn, weapon.id, region, name);
    if (human) actor.avatar = 'knight';
    if (spawn.drill) actor.drill = spawn.drill;
    if (human && !arena) {
      const gear = training ? WEAPONS.map(({ id }) => id) : ['steel-longsword', 'knight-dagger'];
      actor.inventory = [...new Set([weapon.id, ...gear])];
    }
    game.actors.push(actor);
  });
  game.player = game.actors[0];
  game.rival = arena ? game.actors[1] : null;

  world.forts.forEach((fort, index) => {
    game.cores.push({
      id: `${fort.id}-core`, fortId: fort.id, team: index, regionId: regionId(fort.region),
      x: fort.core.x, z: fort.core.z, maxHealth: fort.core.maxHealth, health: fort.core.maxHealth,
    });
  });

  world.props.forEach((prop, index) => {
    if (prop.kind !== 'pickup') return;
    const item = prop.item || 'weapon';
    const weapon = item === 'weapon' ? (prop.weaponId ? getWeapon(prop.weaponId) : WEAPONS[Math.floor(random(game) * WEAPONS.length)]) : null;
    game.pickups.push({
      id: prop.id || `pickup-${index}`, x: prop.x, z: prop.z, item,
      weaponId: weapon?.id, available: true,
    });
  });

  return game;
}

export function equipWeapon(game, index) {
  const player = game.player;
  const weaponId = player.inventory[index];
  if (!player.alive || player.combat.phase !== AttackPhase.IDLE || !weaponId || game.world.mode === 'arena') return false;
  player.weaponId = weaponId;
  return true;
}

function emit(game, type, entity, details = {}) {
  game.events.push({ type, x: entity.x, z: entity.z, ...details });
}

function lineClear(world, from, to, endClearance = 0) {
  const gap = distance(from, to);
  const travel = gap - endClearance;
  if (travel <= 0) return true;
  const steps = Math.ceil(travel / 0.65);
  for (let step = 1; step <= steps; step++) {
    if (step === steps && !endClearance) break;
    const fraction = (step / steps) * (travel / gap);
    if (!world.canMove(from.x + (to.x - from.x) * fraction, from.z + (to.z - from.z) * fraction, ACTOR_RADIUS)) {
      return false;
    }
  }
  return true;
}

function findRoute(world, from, to, endClearance) {
  const spacing = 1.65;
  const width = Math.floor(world.size / spacing);
  const offset = (width - 1) * spacing * 0.5;
  const coordinate = (index) => ({ x: (index % width) * spacing - offset, z: Math.floor(index / width) * spacing - offset });
  const nearest = (point, clearance = 0) => {
    const column = Math.round((point.x + offset) / spacing);
    const row = Math.round((point.z + offset) / spacing);
    let best = -1;
    let bestDistance = Infinity;
    for (let z = Math.max(0, row - 2); z <= Math.min(width - 1, row + 2); z++) {
      for (let x = Math.max(0, column - 2); x <= Math.min(width - 1, column + 2); x++) {
        const index = z * width + x;
        const cell = coordinate(index);
        const gap = distance(point, cell);
        if (gap < bestDistance && world.canMove(cell.x, cell.z, ACTOR_RADIUS) && lineClear(world, cell, point, clearance)) {
          best = index;
          bestDistance = gap;
        }
      }
    }
    return best;
  };

  const start = nearest(from);
  const goal = nearest(to, endClearance);
  if (start < 0 || goal < 0 || start === goal) return [];

  const visited = new Int32Array(width * width).fill(-1);
  const open = new Int32Array(width * width);
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  visited[start] = start;
  open[0] = start;
  let count = 1;
  for (let cursor = 0; cursor < count && visited[goal] < 0; cursor++) {
    const current = open[cursor];
    const currentCell = coordinate(current);
    for (const [dx, dz] of directions) {
      const x = current % width + dx;
      const z = Math.floor(current / width) + dz;
      if (x < 0 || z < 0 || x >= width || z >= width) continue;
      const next = z * width + x;
      if (visited[next] >= 0) continue;
      const nextCell = coordinate(next);
      if (!world.canMove(nextCell.x, nextCell.z, ACTOR_RADIUS) || !lineClear(world, currentCell, nextCell)) continue;
      visited[next] = current;
      open[count++] = next;
    }
  }
  if (visited[goal] < 0) return [];

  const waypoints = [];
  for (let index = goal; index !== start; index = visited[index]) waypoints.push(coordinate(index));
  waypoints.push(coordinate(start));
  return waypoints.reverse();
}

function routeHeading(game, actor, target, endClearance, targetVisible) {
  if (targetVisible) {
    actor.route = [];
    actor.routeGoal = null;
    return heading(actor, target);
  }
  if (game.time >= actor.routeAt && (!actor.routeGoal || distance(target, actor.routeGoal) > 2 || actor.route.length === 0)) {
    actor.route = findRoute(game.world, actor, target, endClearance);
    actor.routeAt = game.time + 1.2;
    actor.routeGoal = { x: target.x, z: target.z };
  }
  while (actor.route.length && distance(actor, actor.route[0]) < 0.55) actor.route.shift();
  for (let index = Math.min(7, actor.route.length - 1); index >= 1; index--) {
    if (lineClear(game.world, actor, actor.route[index])) {
      actor.route.splice(0, index);
      break;
    }
  }
  if (actor.route.length) return heading(actor, actor.route[0]);

  const direct = heading(actor, target);
  for (const turn of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
    const angle = direct + turn * actor.approachSide;
    if (game.world.canMove(actor.x + Math.sin(angle) * 1.1, actor.z + Math.cos(angle) * 1.1, ACTOR_RADIUS)) return angle;
  }
  return direct;
}

const BOT_STYLES = Object.freeze({
  flintwake: [0.25, 0.76, 0.24], sunscar: [0.44, 0.84, 0.20], ironwood: [0.36, 0.92, 0.12],
  redcanopy: [0.59, 0.62, 0.30], frostfall: [0.21, 1.15, 0.10],
  ashline: [0.52, 0.82, 0.29], glassreach: [0.67, 0.53, 0.23],
});

function getAiInput(game, actor) {
  const player = game.player;
  const arena = game.world.mode === 'arena';
  const ownCore = game.cores[actor.team];
  const weapon = getWeapon(actor.weaponId);
  const playerDistance = distance(actor, player);
  const raid = game.time > 38 + actor.team * 14;
  const defend = playerDistance < 10 || (distance(player, ownCore || actor.spawn) < 7.5 && playerDistance < 15);
  const target = (arena || defend) && player.alive ? player : raid ? game.cores[0] : actor.spawn;
  const spacing = distance(actor, target);
  const fighting = target !== actor.spawn;
  const core = target === game.cores[0];
  const endClearance = core ? CORE_RADIUS + ACTOR_RADIUS : 0;
  const reachable = spacing < weapon.reach + (core ? 0.65 : 0.3);
  const targetVisible = lineClear(game.world, actor, target, endClearance);
  const [orbit, patience, feintChance] = BOT_STYLES[actor.regionId] ?? BOT_STYLES.ironwood;
  const duel = target === player;
  let moveX = 0;
  let moveZ = 0;
  let facing = fighting ? heading(actor, target) : actor.spawn.facing;
  let attack = false;
  const swinging = isSwinging(actor.combat);
  const guard = duel && isSwinging(player.combat) && playerDistance < 4.6 && !swinging && actor.stamina > 22
    && Math.sin(game.time / patience * 3.1 + actor.team) > 0.14;

  if (spacing > (fighting ? weapon.reach * 0.75 : 1.05) || (fighting && !targetVisible)) {
    const direction = routeHeading(game, actor, target, endClearance, targetVisible);
    moveX = Math.sin(direction);
    moveZ = Math.cos(direction);
    if (!reachable || !targetVisible) facing = direction;
  } else if (duel && !swinging) {
    const retreat = actor.stamina < weapon.stamina + 11 || (player.guarding && spacing < 2.1) ? 0.58 : 0;
    moveX = Math.cos(facing) * actor.approachSide * orbit - Math.sin(facing) * retreat;
    moveZ = -Math.sin(facing) * actor.approachSide * orbit - Math.cos(facing) * retreat;
  }

  if (fighting && reachable && targetVisible && !guard && actor.combat.phase === AttackPhase.IDLE && game.time >= actor.attackAt) {
    const feint = duel && random(game) < feintChance;
    attack = !feint && actor.stamina >= weapon.stamina;
    actor.feintUntil = feint ? game.time + 0.22 : 0;
    actor.attackAt = game.time + (feint ? 0.32 : patience + random(game) * 0.42) + (player.guarding && !feint ? 0.16 : 0);
    if (random(game) > 0.54) actor.approachSide *= -1;
  }

  const aimX = guard ? player.combat.gesture.x : actor.approachSide * 0.8;
  const aimY = guard ? -player.combat.gesture.y : game.time < actor.feintUntil ? 0.95 : Math.sin(game.time * 1.8) * 0.80;
  const gesture = attack ? makeFlick(aimX, aimY, CombatTuning.MinFlickVelocity) : null;
  return { moveX, moveZ, facing, gesture, guard, aimX, aimY };
}

function getTrainingInput(game, actor) {
  if (actor.drill === 'fixed') return EMPTY_INPUT;
  const facing = heading(actor, game.player);
  // Predictable strafes let players track a route and make small corrections before a flick.
  const fast = actor.drill === 'quick';
  const phase = game.time * (fast ? 1.55 : 0.82) + actor.team;
  const targetX = actor.spawn.x + Math.sin(phase) * (fast ? 2.45 : 1.45);
  const targetZ = actor.spawn.z + Math.sin(phase * 0.5) * (fast ? 0.45 : 0.2);
  return { facing, moveX: clamp((targetX - actor.x) * 0.62, -0.68, 0.68), moveZ: clamp((targetZ - actor.z) * 0.6, -0.4, 0.4) };
}

function moveActor(game, actor, input, dt, sprint) {
  let x = axis(input.moveX);
  let z = axis(input.moveZ);
  const magnitude = Math.hypot(x, z);
  if (!magnitude) {
    actor.speed = 0;
    return;
  }
  if (magnitude > 1) {
    x /= magnitude;
    z /= magnitude;
  }

  const speed = sprint ? 8.7 : actor.guarding ? 3.2 : isSwinging(actor.combat) ? 4.25 : 6.3;
  const startX = actor.x;
  const startZ = actor.z;
  const nextX = startX + x * speed * dt;
  const nextZ = startZ + z * speed * dt;
  const clear = (atX, atZ) => game.world.canMove(atX, atZ, ACTOR_RADIUS) && game.actors.every((other) => {
    if (other === actor || !other.alive) return true;
    const nextDistance = Math.hypot(atX - other.x, atZ - other.z);
    return nextDistance >= ACTOR_RADIUS * 1.9 || nextDistance > distance(actor, other);
  });

  if (clear(nextX, nextZ)) {
    actor.x = nextX;
    actor.z = nextZ;
  } else {
    if (clear(nextX, startZ)) actor.x = nextX;
    if (clear(actor.x, nextZ)) actor.z = nextZ;
  }
  actor.speed = Math.hypot(actor.x - startX, actor.z - startZ) / dt;
}

function inStrike(game, actor, target, radius, weapon, gesture, endClearance = 0) {
  const range = distance(actor, target);
  if (range > weapon.reach + radius) return false;
  const side = gesture.direction === 'RIGHT' ? 1 : gesture.direction === 'LEFT' ? -1 : 0;
  const strikeAngle = actor.facing - side * 0.26;
  const angle = heading(actor, target) - strikeAngle;
  return (range < 0.95 || Math.cos(angle) > Cuts[gesture.direction].cone) && lineClear(game.world, actor, target, endClearance);
}

function recordContact(actor, damage) {
  actor.stats.damage += damage;
  if (actor.stats.recordedSwing === actor.combat.swingId) return;
  actor.stats.recordedSwing = actor.combat.swingId;
  actor.stats.hits++;
}

function damageActor(game, attacker, target, weapon, gesture) {
  const rules = Cuts[gesture.direction];
  const facingAttack = Math.cos(heading(target, attacker) - target.facing) > 0.25;
  const blocked = target.guarding && facingAttack;
  const directional = Math.hypot(target.aimX - gesture.x, target.aimY + gesture.y) < 0.88;
  const parried = blocked && target.guardTime <= CombatTuning.ParryWindow;
  const guardCost = parried ? 6 : rules.guardCost * (directional ? 0.7 : 1) * (0.8 + weapon.weight * 0.12);
  const broken = blocked && target.stamina <= guardCost;
  let type = 'hit';
  let damage = Math.round(weapon.damage * rules.damage);
  if (blocked) {
    target.stamina = Math.max(0, target.stamina - guardCost);
    target.regenDelay = 0.5;
    if (broken) {
      type = 'guard-break';
      target.guarding = false;
      target.guardLocked = true;
      target.stagger = CombatTuning.GuardBreak;
      damage = Math.round(damage * 0.7);
    } else if (parried) {
      type = 'parry';
      damage = 0;
      attacker.stagger = Math.max(attacker.stagger, 0.42);
      attacker.combat = { ...createCombatState(), swingId: attacker.combat.swingId, bufferWindow: attacker.combat.bufferWindow };
    } else {
      type = 'block';
      damage = Math.round(damage * (directional ? 0.12 : 0.30));
    }
  } else if (!target.drill) {
    target.stagger = Math.max(target.stagger, rules.stagger);
  }
  recordContact(attacker, Math.min(damage, target.health));
  if (type === 'block') target.stats.blocks++;
  if (type === 'parry') target.stats.parries++;
  target.health = Math.max(0, target.health - damage);
  if (target.health === 0 && !target.drill) attacker.stats.kills++;
  if (game.training && attacker === game.player && target.drill) {
    if (target.drill === 'fixed') game.training.fixedHits++;
    else game.training.movingHits++;
  }
  const surface = blocked ? 'metal' : target.drill ? 'wood' : 'armor';
  game.hitStop = Math.max(game.hitStop, (2 + Math.round(Math.min(3, weapon.weight * 0.8))) / 60);
  emit(game, type, target, { actorId: attacker.id, targetId: target.id, weaponId: weapon.id, damage, directional, surface });
  if (target.health === 0) downActor(game, target, attacker.id);
}

function downActor(game, target, attackerId) {
  if (!target.alive) return;
  target.alive = false;
  target.speed = 0;
  target.combat = { ...createCombatState(), swingId: target.combat.swingId };
  target.guarding = false;
  target.respawnAt = game.time + (target.drill ? 1 : 2.5);
  emit(game, 'actor-down', target, { actorId: target.id, attackerId });
}

function damageCore(game, attacker, core, weapon) {
  const damage = Math.round(weapon.damage * (attacker.team === 0 ? 1.25 : 0.48));
  recordContact(attacker, Math.min(damage, core.health));
  core.health = Math.max(0, core.health - damage);
  emit(game, 'core-hit', core, { actorId: attacker.id, targetId: core.id, team: core.team, damage, weaponId: weapon.id, surface: 'stone' });
  if (core.health !== 0) return;
  const defender = game.actors[core.team];
  if (defender) downActor(game, defender, attacker.id);
  emit(game, 'core-destroyed', core, { actorId: attacker.id, targetId: core.id, team: core.team });
}

function connectStrike(game, actor, weapon, gesture) {
  for (const target of game.actors) {
    if (target.team !== actor.team && target.alive && inStrike(game, actor, target, ACTOR_RADIUS, weapon, gesture)) {
      damageActor(game, actor, target, weapon, gesture);
    }
  }
  for (const core of game.cores) {
    if (core.team !== actor.team && core.health > 0 && inStrike(game, actor, core, CORE_RADIUS, weapon, gesture, CORE_RADIUS + ACTOR_RADIUS)) {
      damageCore(game, actor, core, weapon);
    }
  }
}

function updateActor(game, actor, input, dt) {
  if (!actor.alive) {
    if ((actor.drill || game.cores[actor.team]?.health > 0) && game.time >= actor.respawnAt) {
      Object.assign(actor, actor.spawn, { health: actor.maxHealth, stamina: actor.maxStamina, alive: true, stagger: 0, guardTime: 0, guardLocked: false, route: [], routeGoal: null });
      emit(game, 'respawn', actor, { actorId: actor.id });
    }
    return;
  }

  const weapon = getWeapon(actor.weaponId);
  if (Number.isFinite(input.facing)) actor.facing = input.facing;
  const aimAlpha = 1 - Math.exp(-dt * (17 / (1 + weapon.weight * 0.52)));
  actor.aimX += (axis(input.aimX) - actor.aimX) * aimAlpha;
  actor.aimY += (axis(input.aimY) - actor.aimY) * aimAlpha;
  actor.stagger = Math.max(0, actor.stagger - dt);
  if (!input.guard) actor.guardLocked = false;
  const guarded = actor.guarding;
  actor.guarding = Boolean(input.guard && !actor.guardLocked && actor.stamina > 0 && !actor.stagger && !isSwinging(actor.combat));
  actor.guardTime = actor.guarding && guarded ? actor.guardTime + dt : 0;
  if (actor.guarding) {
    actor.stamina = Math.max(0, actor.stamina - CombatTuning.GuardDrain * dt);
    actor.regenDelay = 0.5;
    if (!actor.stamina) {
      actor.guarding = false;
      actor.guardLocked = true;
      actor.stagger = CombatTuning.GuardBreak;
      emit(game, 'guard-break', actor, { targetId: actor.id, surface: 'metal', damage: 0 });
    }
  }
  if (game.versus !== 'online') actor.combat.bufferWindow = input.bufferWindow;
  const combat = advanceCombat(actor.combat, weapon, dt, {
    gesture: input.gesture,
    canAttack: !actor.stagger && !input.guard && !input.cancelCombo && actor.stamina >= weapon.stamina,
    cancelBuffer: Boolean(actor.stagger || input.guard || input.cancelCombo),
    allowLateCombo: game.versus === 'online' && actor === game.rival,
  });
  if (combat.started) {
    actor.stats.swings++;
    actor.stats.chain = actor.combat.gesture.combo ? actor.stats.chain + 1 : 1;
    actor.stats.longestCombo = Math.max(actor.stats.longestCombo, actor.stats.chain);
    actor.stamina -= weapon.stamina;
    actor.regenDelay = 0.5;
    emit(game, 'swing', actor, { actorId: actor.id, weaponId: weapon.id });
    if (game.training && actor === game.player) {
      game.training.swings++;
      if (actor.combat.gesture.combo) game.training.combos++;
    }
  }

  const sprint = Boolean(input.sprint && actor.stamina > 5 && !actor.guarding && !isSwinging(actor.combat)
    && (axis(input.moveX) || axis(input.moveZ)));
  moveActor(game, actor, actor.stagger ? EMPTY_INPUT : input, dt, sprint && !actor.stagger);

  if (sprint) {
    actor.stamina = Math.max(0, actor.stamina - 24 * dt);
    actor.regenDelay = 0.35;
  } else {
    actor.regenDelay = Math.max(0, actor.regenDelay - dt);
    if (!actor.regenDelay) actor.stamina = Math.min(actor.maxStamina, actor.stamina + STAMINA_REGEN * (actor.guarding ? 0.36 : 1) * dt);
  }

  return combat.strike && { weapon, gesture: combat.strike };
}

export function nearbyPickup(game) {
  const player = game.player;
  if (!player.alive) return null;
  let nearest = null;
  let range = 2.45;
  for (const pickup of game.pickups) {
    const gap = distance(pickup, player);
    if (pickup.available && gap < range && lineClear(game.world, player, pickup)) {
      nearest = pickup;
      range = gap;
    }
  }
  return nearest;
}

function collectPickup(game) {
  const player = game.player;
  const pickup = nearbyPickup(game);
  if (!pickup) return;
  let name;
  if (pickup.item === 'medkit') {
    if (player.health === player.maxHealth) return;
    player.health = Math.min(player.maxHealth, player.health + 45);
    name = 'Medkit';
  } else if (pickup.item === 'stamina') {
    if (player.stamina === player.maxStamina) return;
    player.stamina = player.maxStamina;
    name = 'Stamina Tonic';
  } else {
    const weapon = getWeapon(pickup.weaponId);
    if (player.combat.phase !== AttackPhase.IDLE) return;
    if (!player.inventory.includes(weapon.id)) player.inventory.push(weapon.id);
    player.weaponId = weapon.id;
    name = weapon.name;
  }
  pickup.available = false;
  emit(game, 'pickup', pickup, { actorId: player.id, item: pickup.item, weaponId: pickup.weaponId, name });
}

export function stepGame(game, elapsed, input = EMPTY_INPUT, rivalInput = EMPTY_INPUT) {
  game.events.length = 0;
  if (game.status !== 'playing' || !Number.isFinite(elapsed) || elapsed <= 0) return game;
  const dt = Math.min(elapsed, 0.05);
  if (game.hitStop > 1e-7) {
    game.hitStop = Math.max(0, game.hitStop - dt);
    return game;
  }
  game.time += dt;
  const actorInputs = [input];
  for (const actor of game.actors.slice(1)) {
    actorInputs.push(game.versus === 'online' ? rivalInput : actor.alive
      ? (actor.drill ? getTrainingInput(game, actor) : getAiInput(game, actor)) : EMPTY_INPUT);
  }
  // Collect both fighters' strikes before applying damage so simultaneous hits resolve together.
  const strikes = game.actors.map((actor, index) => updateActor(game, actor, actorInputs[index], dt));
  for (const [index, strike] of strikes.entries()) {
    if (strike) connectStrike(game, game.actors[index], strike.weapon, strike.gesture);
  }
  if (input.interact) collectPickup(game);
  if (game.training && game.player.guardTime > .2) game.training.guardUsed = true;

  if (game.world.mode === 'arena') {
    if (!game.player.alive && !game.rival.alive) game.status = 'draw';
    else if (!game.player.alive) game.status = 'lost';
    else if (!game.rival.alive) game.status = 'won';
  } else if (game.world.mode === 'frontier' && game.cores[0].health === 0) {
    game.status = 'lost';
  } else if (game.world.mode === 'frontier' && game.cores.every((core) => core.team === 0 || core.health === 0)) {
    game.status = 'won';
  }
  if (game.status !== 'playing') emit(game, 'match-end', game.player, { status: game.status });
  return game;
}
