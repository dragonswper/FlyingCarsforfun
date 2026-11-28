import { createHostSession, createGuestSession } from "./network.js";
import { makeFlick, CombatTuning } from "./combat.js";
import { RELICS, ARMOR_STYLES, WEAPON_FINISHES } from "./expedition.js";

export function sanitizeExpeditionInput(value) {
  const v = value && typeof value === "object" ? value : {};
  const axis = (n) => (Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0);
  const input = {
    moveX: axis(v.moveX),
    moveZ: axis(v.moveZ),
    facing: Number.isFinite(v.facing)
      ? Math.atan2(Math.sin(v.facing), Math.cos(v.facing))
      : 0,
    aimX: axis(v.aimX),
    aimY: axis(v.aimY),
    guard: v.guard === true,
    sprint: v.sprint === true,
    cancelCombo: v.cancelCombo === true,
    focus: v.focus === true,
    finisher: v.finisher === true,
    interact: v.interact === true,
  };
  if (Number.isInteger(v.equip) && v.equip >= 0 && v.equip < 9)
    input.equip = v.equip;
  if (RELICS.some((relic) => relic.id === v.relic)) input.relic = v.relic;
  if (
    v.gesture &&
    Number.isFinite(v.gesture.velocity) &&
    v.gesture.velocity >= CombatTuning.MinFlickVelocity
  ) {
    input.gesture = makeFlick(
      axis(v.gesture.x),
      axis(v.gesture.y),
      Math.min(10000, v.gesture.velocity),
    );
    const combo = v.gesture.combo;
    if (
      input.gesture &&
      Number.isSafeInteger(combo?.swingId) &&
      combo.swingId >= 0 &&
      Number.isFinite(combo.progress) &&
      combo.progress >= 0 &&
      combo.progress <= 1
    )
      input.gesture.combo = {
        swingId: combo.swingId,
        progress: combo.progress,
      };
  }
  return input;
}

// A star of encrypted WebRTC data channels. One host owns the shared simulation;
// each guest receives a fixed seat and sends input only for that seat.
export function createExpeditionParty({
  onStart,
  onSnapshot,
  onStatus,
  onLeave,
} = {}) {
  const peers = new Map();
  let role = null,
    self = "player",
    config = null,
    capacity = 4,
    started = false,
    epoch = 0;
  const status = (text) => onStatus?.(text);
  const unwrap = (code) => {
    if (
      typeof code !== "string" ||
      code.length > 65536 ||
      !code.trim().startsWith("EXP1.")
    )
      throw Error("Use a Co-op Expedition invite or response code.");
    return code.trim().slice(5);
  };
  function appearance(value) {
    return {
      heraldry: ["blue", "amber", "umber"].includes(value?.heraldry)
        ? value.heraldry
        : "blue",
      armorStyle: ARMOR_STYLES.some((x) => x.id === value?.armorStyle)
        ? value.armorStyle
        : "plain",
      weaponFinish: WEAPON_FINISHES.some((x) => x.id === value?.weaponFinish)
        ? value.weaponFinish
        : "steel",
    };
  }
  function members() {
    if (role === "guest")
      return (
        peers.get("host")?.roster || [
          {
            id: "player",
            name: config?.name || "Host",
            appearance: appearance(config?.appearance),
            connected: true,
          },
          { id: self, name: peers.get("host")?.name || "You", connected: true },
        ]
      );
    return [
      {
        id: "player",
        name: config?.name || "Host",
        appearance: appearance(config?.appearance),
        connected: true,
      },
      ...Array.from(peers, ([id, p]) => ({
        id,
        name: p.name || `Wanderer ${id.slice(-1)}`,
        appearance: appearance(p.appearance),
        connected: p.session.status === "connected",
      })),
    ];
  }
  function broadcast(message) {
    for (const peer of peers.values())
      if (peer.session.status === "connected") peer.session.send(message);
  }
  function message(id, data) {
    if (!data || typeof data !== "object") return;
    const peer = peers.get(id);
    if (!peer) return;
    if (role === "host") {
      if (data.type === "coop-profile" && !started) {
        peer.profileReady = true;
        peer.appearance = appearance(data.appearance);
        peer.name =
          typeof data.name === "string"
            ? data.name.trim().slice(0, 20) || "Wanderer"
            : "Wanderer";
        broadcast({ type: "coop-roster", members: members() });
        status(
          "Player connected. Create another seat or start the Expedition.",
        );
      }
      if (
        data.type === "coop-input" &&
        started &&
        Number.isSafeInteger(data.sequence) &&
        data.sequence > (peer.sequence || 0)
      ) {
        const input = sanitizeExpeditionInput(data.input);
        peer.input = input;
        peer.sequence = data.sequence;
        peer.at = performance.now();
        peer.actions ??= {};
        for (const key of [
          "gesture",
          "focus",
          "finisher",
          "interact",
          "equip",
          "relic",
        ])
          if (input[key] !== undefined && input[key] !== false)
            peer.actions[key] ??= input[key];
        if (input.guard || input.cancelCombo) delete peer.actions.gesture;
      }
    } else {
      if (
        data.type === "coop-seat" &&
        !started &&
        /^ally-[1-3]$/.test(data.id) &&
        data.config &&
        /^[A-Z0-9-]{1,24}$/.test(data.config.worldSeed) &&
        ["small", "medium", "large"].includes(data.config.preset)
      ) {
        self = data.id;
        config = data.config;
        status("Connected. Waiting for the host to start.");
      }
      if (data.type === "coop-roster" && Array.isArray(data.members)) {
        peer.roster = data.members.slice(0, 4);
      }
      if (
        data.type === "coop-start" &&
        !started &&
        config &&
        Number.isInteger(data.players) &&
        data.players >= 2 &&
        data.players <= 4
      ) {
        started = true;
        onStart?.(
          {
            ...config,
            coopPlayers: data.players,
            online: true,
            expedition: true,
            countdown: true,
          },
          self,
        );
      }
      if (data.type === "coop-snapshot" && started) onSnapshot?.(data);
    }
  }
  function connection(id, next) {
    const peer = peers.get(id);
    if (!peer) return;
    if (next === "connected") {
      if (role === "host") peer.session.send({ type: "coop-seat", id, config });
      else
        peer.session.send({
          type: "coop-profile",
          name: peer.name,
          appearance: peer.appearance,
        });
      status(
        "Connected. The host can start once all expected players have joined.",
      );
    } else if (
      next === "closed" ||
      next === "failed" ||
      next === "disconnected"
    ) {
      peer.input = {};
      onLeave?.(role === "host" ? id : "host");
      status(
        role === "host"
          ? "A player disconnected. Their slot is inactive."
          : "The host connection was lost. Return to the menu to reconnect.",
      );
    }
  }
  function close() {
    epoch++;
    for (const peer of peers.values()) peer.session.close();
    peers.clear();
    role = null;
    self = "player";
    config = null;
    started = false;
  }
  return {
    close,
    members,
    async host(worldConfig, maxPlayers = 4, name = "Host", look = {}) {
      close();
      role = "host";
      config = {
        ...worldConfig,
        name: String(name).slice(0, 20),
        appearance: appearance(look),
      };
      capacity = Math.max(2, Math.min(4, Number(maxPlayers) || 4));
      status("Create an invite for each friend. Each invite has its own seat.");
    },
    async invite(transport) {
      if (role !== "host" || started)
        throw Error("Host a new Expedition first.");
      if (peers.size >= capacity - 1)
        throw Error("Every available seat already has an invite.");
      const id = "ally-" + (peers.size + 1),
        ticket = epoch;
      const session = createHostSession({
        transport,
        onMessage: (data) => {
          if (ticket === epoch) message(id, data);
        },
        onStatus: (next) => {
          if (ticket === epoch) connection(id, next);
        },
      });
      peers.set(id, { session, input: {}, at: 0 });
      const code = await session.createInvite();
      if (epoch !== ticket) throw Error("Lobby closed.");
      return { id, code: "EXP1." + code };
    },
    async answer(id, code) {
      const peer = peers.get(id);
      if (role !== "host" || !peer) throw Error("Choose the matching seat.");
      await peer.session.acceptAnswer(unwrap(code));
    },
    async join(code, name = "Wanderer", look = {}) {
      const incoming = unwrap(code);
      close();
      role = "guest";
      const id = "host",
        ticket = epoch;
      const session = createGuestSession({
        onMessage: (data) => {
          if (ticket === epoch) message(id, data);
        },
        onStatus: (next) => {
          if (ticket === epoch) connection(id, next);
        },
      });
      peers.set(id, {
        session,
        name: String(name).slice(0, 20),
        appearance: appearance(look),
        input: {},
        at: 0,
      });
      const answer = await session.acceptInvite(incoming);
      if (ticket !== epoch) throw Error("Lobby closed.");
      return "EXP1." + answer;
    },
    start() {
      if (
        role !== "host" ||
        started ||
        !peers.size ||
        [...peers.values()].some(
          (p) => p.session.status !== "connected" || !p.profileReady,
        )
      )
        throw Error("Connect every invited player before starting.");
      started = true;
      const players = peers.size + 1;
      broadcast({ type: "coop-start", players });
      onStart?.(
        {
          ...config,
          coopPlayers: players,
          online: true,
          expedition: true,
          countdown: true,
        },
        "player",
      );
    },
    sendInput(input) {
      const peer = peers.get("host");
      if (!peer) return false;
      peer.sequence = (peer.sequence || 0) + 1;
      return (
        role === "guest" &&
        peer.session.send({
          type: "coop-input",
          sequence: peer.sequence,
          input: sanitizeExpeditionInput(input),
        })
      );
    },
    sendSnapshot(snapshot) {
      if (role === "host") broadcast({ type: "coop-snapshot", ...snapshot });
    },
    inputs(now = performance.now()) {
      return Object.fromEntries(
        [...peers].map(([id, p]) => {
          if (now - p.at >= 500) p.actions = {};
          return [
            id,
            now - p.at < 500
              ? { ...p.input, ...p.actions }
              : { cancelCombo: true },
          ];
        }),
      );
    },
    consume() {
      for (const peer of peers.values()) {
        peer.actions = {};
        for (const key of [
          "gesture",
          "focus",
          "finisher",
          "interact",
          "equip",
          "relic",
        ])
          delete peer.input[key];
      }
    },
    get role() {
      return role;
    },
    get self() {
      return self;
    },
    get active() {
      return Boolean(role);
    },
    get started() {
      return started;
    },
    get connected() {
      return [...peers.values()].every(
        (p) =>
          p.session.status === "connected" &&
          (role !== "host" || p.profileReady),
      );
    },
  };
}
