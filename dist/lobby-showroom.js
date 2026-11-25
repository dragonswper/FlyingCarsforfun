import {Simulation, makeCar} from './physics.js';
import {appearance} from './network-protocol.js';
export const PAINT_COLORS = {
  blue: '#299bff',
  ivory: '#e8efec',
  violet: '#a985fc',
  mint: '#53dbbd',
};

export function lobbyDisplayScene(
  members,
  selfId,
  arena,
  fallbacks = new Set(),
) {
  const roster = members
    .slice(0, 8)
    .map((member) => ({...member, look: appearance(member.look)}));
  roster.sort(
    (a, b) => Number(b.id === selfId) - Number(a.id === selfId) || a.id - b.id,
  );
  const scene = new Simulation({mode: 'free', arena});
  scene.localPlayerId = selfId;
  const columns = Math.min(4, roster.length),
    rows = Math.ceil(roster.length / 4);
  scene.cars = roster.map((member, index) => {
    const car = makeCar(member.id, member.team ?? 0),
      row = Math.floor(index / 4),
      count = Math.min(4, roster.length - row * 4);
    car.p.set(((index % 4) - (count - 1) / 2) * 3.6, car.p.y, -5 + row * 4.4);
    car.q.setFromAxisAngle({x: 0, y: 1, z: 0}, Math.PI * 0.68);
    car.appearance = {
      body: fallbacks.has(member.id) ? 'striker' : member.look.body,
      color: PAINT_COLORS[member.look.paint],
    };
    car.playerName = member.look.name;
    return car;
  });
  return {
    scene,
    roster,
    width: Math.max(2.6, (columns - 1) * 3.6 + 2.6),
    depth: Math.max(0, rows - 1) * 4.4,
  };
}

// Lobby-only presentation. Never mutate the authoritative match or its cars.
export class LobbyShowroom {
  constructor({view, settings, isCurrent, onScene, onRoster = () => {}}) {
    Object.assign(this, {view, settings, isCurrent, onScene, onRoster});
    this.generation = 0;
    this.signature = '';
  }
  sync(room) {
    if (
      !room?.connected ||
      !room.party ||
      !room.members.length ||
      !this.isCurrent(room)
    )
      return;
    const signature = JSON.stringify([
      room.code,
      room.id,
      this.settings.arena,
      room.members.map((m) => [m.id, m.look, m.connected, m.team]),
    ]);
    if (signature === this.signature) return this.pending;
    this.signature = signature;
    const generation = ++this.generation;
    this.pending = this.prepare(room, generation);
    return this.pending;
  }
  async prepare(room, generation) {
    this.onRoster(
      room.members,
      room.id,
      room.ownerId ?? 0,
      room.options.maxPeople,
    );
    const fallbacks = new Set();
    await Promise.all(
      room.members.map(async (member) => {
        try {
          await this.view.ensureBody(appearance(member.look).body);
        } catch {
          fallbacks.add(member.id);
        }
      }),
    );
    if (generation !== this.generation || !this.isCurrent(room)) return;
    const display = lobbyDisplayScene(
      room.members,
      room.id,
      this.settings.arena,
      fallbacks,
    );
    this.onScene(display.scene);
    this.view.showroom = {width: display.width, depth: display.depth};
    this.view.sync(
      display.scene,
      PAINT_COLORS[this.settings.paint],
      this.settings.body,
    );
  }
  clear(restore = true) {
    const active = !!this.signature;
    this.generation++;
    this.signature = '';
    this.pending = null;
    this.view.showroom = null;
    this.onRoster([]);
    if (restore && active) {
      const scene = new Simulation({mode: 'free', arena: this.settings.arena});
      this.onScene(scene);
      this.view.sync(
        scene,
        PAINT_COLORS[this.settings.paint],
        this.settings.body,
      );
    }
  }
}
