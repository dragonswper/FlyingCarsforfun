// A bounded pose recorder: no input controls, tokens, world meshes or peer codes.
// Replays are presentation-only and never replace authoritative simulation state.
const copy = (value) => structuredClone(value);
const wrap = (value) => Math.atan2(Math.sin(value), Math.cos(value));
export function createChronicle({ seconds = 30, hz = 10 } = {}) {
  const frames = [];
  let next = 0,
    world;
  function record(game) {
    if (game.world !== world) {
      frames.length = 0;
      world = game.world;
      next = 0;
    }
    if (game.time < next) return;
    next = game.time + 1 / hz;
    frames.push({
      time: game.time,
      sceneTime: game.sceneTime,
      actors: game.actors.map((actor) => {
        const {
          id,
          team,
          name,
          regionId,
          x,
          z,
          facing,
          health,
          maxHealth,
          stamina,
          maxStamina,
          speed,
          alive,
          weaponId,
          avatar,
          heraldry,
          armorStyle,
          weaponFinish,
          combat,
          flow,
          drill,
          boss,
          scale,
          role,
          clock,
          specialUntil,
          enraged,
        } = actor;
        return copy({
          id,
          team,
          name,
          regionId,
          x,
          z,
          facing,
          health,
          maxHealth,
          stamina,
          maxStamina,
          speed,
          alive,
          weaponId,
          avatar,
          heraldry,
          armorStyle,
          weaponFinish,
          combat,
          flow,
          drill,
          boss,
          scale,
          role,
          clock,
          specialUntil,
          enraged,
        });
      }),
      cores: copy(game.cores),
      pickups: copy(game.pickups),
      campaign: copy(game.campaign),
    });
    while (
      frames.length > Math.ceil(seconds * hz) + 2 ||
      (frames.length > 1 && frames[0].time < game.time - seconds)
    )
      frames.shift();
  }
  function sample(time) {
    if (!frames.length) return null;
    const t = Math.min(frames.at(-1).time, Math.max(frames[0].time, time));
    let index = frames.findIndex((frame) => frame.time >= t);
    if (index < 0) index = frames.length - 1;
    const b = frames[index],
      a = frames[Math.max(0, index - 1)],
      alpha = b.time === a.time ? 0 : (t - a.time) / (b.time - a.time);
    const actors = a.actors.map((actor) => {
      const other = b.actors.find((next) => next.id === actor.id);
      if (!other) return copy(actor);
      return {
        ...copy(actor),
        x: actor.x + (other.x - actor.x) * alpha,
        z: actor.z + (other.z - actor.z) * alpha,
        facing: actor.facing + wrap(other.facing - actor.facing) * alpha,
      };
    });
    return {
      world,
      time: t,
      sceneTime: a.sceneTime + (b.sceneTime - a.sceneTime) * alpha,
      actors,
      player: actors[0],
      cores: a.cores,
      pickups: a.pickups,
      campaign: a.campaign,
    };
  }
  return {
    record,
    sample,
    clear() {
      frames.length = 0;
      next = 0;
      world = null;
    },
    get start() {
      return frames[0]?.time || 0;
    },
    get end() {
      return frames.at(-1)?.time || 0;
    },
    get count() {
      return frames.length;
    },
  };
}
