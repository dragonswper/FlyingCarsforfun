import { createChronicleUI } from "./chronicle-ui.js";
import { setupExpeditionUI } from "./expedition-ui.js";
import { createExpeditionParty } from "./expedition-party.js";
import { createExpeditionLobby } from "./expedition-lobby-ui.js";
import {
  packExpedition,
  applyExpeditionSnapshot,
} from "./expedition-snapshot.js";
import "./expedition.css";
import "./style.css";
import "./campaign.css";
import { recordCareer } from "./career.js";
import { EraWeather } from "./era-dressing.js";
import { createWorld, worldSettings } from "./world.js";
import { prepareWorld } from "./world-loader.js";
import { paintWorldMap } from "./world-map.js";
import {
  WEAPONS,
  createGame,
  equipWeapon,
  getWeapon,
  nearbyPickup,
  stepGame,
} from "./simulation.js";
import {
  createHostSession,
  createGuestSession,
  smoothRemoteMovement,
} from "./network.js";
import {
  AttackPhase,
  CombatTuning,
  comboProgress,
  isSwinging,
  makeFlick,
} from "./combat.js";
import { createRelativeMouse } from "./mouse-swing.js";
import { createTouchControls } from "./touch-controls.js";
import { FlowTuning, actorTimeScale, validCombatFlow } from "./combat-flow.js";
import "./combat-flow.css";
import { createSwingAudio } from "./swing-audio.js";
import { createSettingsStore, keyLabel } from "./settings.js";
import {
  cleanSeed,
  createInterface,
  newSeed,
  showLoading,
  writeLedger,
} from "./interface.js";

const element = (id) => document.getElementById(id);
const menu = element("menu");
const gameScreen = element("game");
const canvas = element("game-canvas");
const minimap = element("minimap");
const mapContext = minimap.getContext("2d");
const mapLayer = document.createElement("canvas");
mapLayer.width = minimap.width;
mapLayer.height = minimap.height;
const arenaDialog = element("arena-dialog");
const controlsDialog = element("controls-dialog");
const pauseDialog = element("pause-dialog");
const endDialog = element("end-dialog");
const settingsDialog = element("settings-dialog");
const mapDialog = element("map-dialog");
const scoreDialog = element("score-dialog");
const weaponSelect = element("arena-weapon");
const networkOutput = element("network-output");
const networkInput = element("network-input");
const networkConnect = element("network-connect");
const reticle = element("hud-reticle");
const swipeArrow = element("reticle-swipe");
const comboArrow = element("reticle-combo");
const keys = new Set();
const mouse = createRelativeMouse(canvas);
const swingAudio = createSwingAudio();
const store = createSettingsStore(undefined, {
  touch: matchMedia("(pointer: coarse)").matches,
});
const { state: settings } = store;
const view = { yaw: 0, pitch: -0.16, firstPerson: true, actorId: undefined };
const cameraAim = { yaw: view.yaw, pitch: view.pitch };
const GESTURE_LIFETIME_MS = 160;
const MAX_GESTURE_LIFETIME_MS = 500;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const localActor = () =>
  coopParty.started
    ? match?.actors.find((actor) => actor.id === coopParty.self)
    : networkRole === "guest"
      ? match?.rival
      : match?.player;
const remoteActor = () =>
  networkRole === "guest" ? match?.player : match?.rival;
const isOnline = () => ["online", "coop"].includes(match?.versus);
const canPlay = () =>
  match?.status === "playing" &&
  !pauseDialog.open &&
  !controlsDialog.open &&
  !settingsDialog.open &&
  !scoreDialog.open &&
  !mapDialog.open &&
  !chronicle.active &&
  !expeditionUI.relicDialog.open;
const isCapturing = () =>
  mouse.isCaptured() || touch.enabled || touch.mouseDragEnabled;
const modal = (dialog) => {
  if (!dialog.open) dialog.showModal();
};
const close = (dialog) => {
  if (dialog.open) dialog.close();
};

const impacts = [];
let impactKick = 0;
let impactUntil = 0;
let impactCaption = "";
let eventSequence = 0;
let heardEvent = 0;
let lastRegion;
let nextFoot = 0;
let nextLandscape = 0;
const recentImpacts = [];

let match;
let renderer;
let network;
let networkRole;
const remoteMovement = { moveX: 0, moveZ: 0 };
let remoteInput = {};
let remoteInputAt = 0;
let guestGesture;
let pendingFocus = false,
  guestFocus = false;
let pendingFinisher = false,
  guestFinisher = false,
  pendingRelic,
  pendingEquip;
let photoReturnToPause = false;
let snapshotAt = 0;
let networkStepAt = 0;
let lastFrame = 0;
let lastDrawAt = 0;
let frameSeconds = 0;
let accumulated = 0;
let frameRequest;
let pendingGesture;
let lastSwoosh = 0;
let guarding = false;
let interact = false;
let aimX = 0.65;
let aimY = 0.15;
let notice = "";
let noticeUntil = 0;
let hudAt = 0;
let lastInventory = "";
let blockUnlock = false;
let matchStarting = false;
let pitSeed = newSeed();
let selfReady = false;
let peerReady = false;
let peerName = "Friend";
let peerHeraldry;
let arenaStarting = false;

const touch = createTouchControls(canvas, {
  canPlay,
  onAttack() {
    const player = localActor();
    const now = performance.now(),
      progress = getComboProgress(player, now);
    if (canAttack(player, progress))
      queueAttack(
        player,
        makeFlick(aimX, aimY, CombatTuning.MinFlickVelocity),
        progress,
        now,
      );
  },
  onPickup() {
    interact = true;
  },
  onWeapon() {
    const player = localActor();
    if (player?.inventory.length > 1)
      selectWeapon(
        (player.inventory.indexOf(player.weaponId) + 1) %
          player.inventory.length,
      );
  },
  onView() {
    if (match?.world.mode !== "arena") setPerspective(!view.firstPerson);
  },
});

for (const weapon of WEAPONS) {
  const option = document.createElement("option");
  option.value = weapon.id;
  option.textContent = `${weapon.name} · ${weapon.weight} kg`;
  weaponSelect.append(option);
}
weaponSelect.value = "steel-longsword";

function releaseInput() {
  keys.clear();
  mouse.reset();
  touch.reset();
  pendingFocus = false;
  pendingFinisher = false;
  pendingRelic = pendingEquip = undefined;
  pendingGesture = undefined;
  if (match && networkRole !== "guest") localActor().combat.buffered = null;
  Object.assign(cameraAim, { yaw: view.yaw, pitch: view.pitch });
  interact = false;
  guarding = false;
}

function setPerspective(firstPerson) {
  view.firstPerson = firstPerson;
  gameScreen.dataset.view = firstPerson ? "first-person" : "third-person";
  canvas.setAttribute(
    "aria-label",
    firstPerson ? "First-person game view" : "Third-person game view",
  );
}

function pointerAllowed() {
  return (
    !gameScreen.hidden &&
    !element("error-dialog").open &&
    (matchStarting || canPlay())
  );
}

function unlockPointer() {
  if (!mouse.isCaptured()) return;
  blockUnlock = true;
  document.exitPointerLock?.();
}

function capturePointer() {
  swingAudio.unlock();
  if (touch.enabled) return;
  if (!canvas.requestPointerLock) {
    touch.allowMouseDrag();
    return;
  }
  mouse
    .capture()
    .then(() => {
      // Browser capture may finish after loading failed or a menu was opened.
      if (!pointerAllowed()) unlockPointer();
    })
    .catch(() => {
      if (!pointerAllowed()) return;
      touch.allowMouseDrag();
      if (!mouse.isCaptured() && canPlay())
        flash("Hold and drag the game to look around.");
    });
}

function openError(message, webgl = false) {
  element("error-dialog").dataset.webgl = String(webgl);
  element("webgl-help").hidden = !webgl;
  element("error-message").textContent = message;
  modal(element("error-dialog"));
}

async function startMatch(
  mode,
  {
    worldSeed = newSeed(),
    arenaWeapon = weaponSelect.value,
    online = false,
    expedition = element("frontier-rules")?.value !== "classic",
    coopPlayers = 1,
    preset = "medium",
    era = "random",
    countdown = false,
  } = {},
) {
  if (matchStarting) return false;
  matchStarting = true;
  const session = network;
  let loading;
  try {
    if (!online) {
      disconnect();
      coopParty.close();
    }
    if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
    frameRequest = undefined;
    close(arenaDialog);
    close(pauseDialog);
    close(controlsDialog);
    close(endDialog);
    close(settingsDialog);
    close(scoreDialog);
    close(mapDialog);
    menu.hidden = true;
    gameScreen.hidden = false;
    canvas.focus({ preventScroll: true });
    if (!online) capturePointer();
    const prepared = prepareWorld(worldSeed, mode, { preset, era });
    const graphics = import("./render.js");
    const armor = import("./knight.js")
      .then(({ loadKnight }) => loadKnight())
      .catch(() => null);
    const mapKit = import("./map-kit.js")
      .then(({ loadMapKit }) => loadMapKit())
      .catch((error) => {
        console.warn("Map kit unavailable", error);
        return null;
      });
    const preparation = Promise.all([prepared, graphics]);
    // The loading animation delays the await; catch early network rejections now
    // and let the normal startup error handler present them after the animation.
    preparation.catch(() => {});
    loading = await showLoading({ countdown });
    const [world, { createRenderer }] = await preparation;
    loading.prepare();
    renderer ??= createRenderer(canvas);
    renderer.setQuality(settings.quality, settings.resolution);
    match = createGame(world, {
      arenaWeapon,
      startingWeapon: settings.weapon,
      versus: online ? "online" : "bot",
      expedition: expedition && mode === "frontier",
      coopPlayers,
    });
    chronicle.book.clear();
    for (const member of coopParty.started ? coopParty.members() : []) {
      const actor = match.actors.find((a) => a.id === member.id);
      if (actor) {
        actor.name = member.name;
        Object.assign(actor, member.appearance || {});
      }
    }
    localActor().armorStyle = settings.armorStyle;
    localActor().weaponFinish = settings.weaponFinish;
    localActor().heraldry = settings.heraldry;
    if (!coopParty.started)
      match.player.name =
        online && networkRole === "guest" ? peerName : settings.playerName;
    else localActor().name = settings.playerName;
    if (online && !coopParty.started) remoteActor().heraldry = peerHeraldry;
    if (online && !coopParty.started)
      match.rival.name =
        networkRole === "guest" ? settings.playerName : peerName;
    const [avatar, kit] = await Promise.race([
      Promise.all([armor, mapKit]),
      new Promise((resolve) => setTimeout(() => resolve([]), 3200)),
    ]);
    if (
      online &&
      !coopParty.started &&
      (network !== session || session?.status !== "connected")
    ) {
      returnToMenu();
      openError(
        "The Arena connection closed before the duel began. Start a new invite to try again.",
      );
      return false;
    }
    renderer.setWorld(world, kit);
    Object.assign(view, {
      yaw: localActor().facing,
      pitch: -0.16,
      actorId:
        networkRole === "guest" || coopParty.role === "guest"
          ? localActor().id
          : undefined,
    });
    setPerspective(
      mode !== "frontier" || settings.frontierView === "first-person",
    );
    aimX = 0.65;
    aimY = 0.15;
    notice = "";
    noticeUntil = 0;
    if (!avatar || !kit)
      flash(
        "Some models are still loading. Simple shapes will fill in for now.",
      );
    hudAt = 0;
    lastInventory = null;
    networkStepAt = 0;
    snapshotAt = performance.now();
    lastSwoosh = 0;
    lastRegion = localActor().regionId;
    nextFoot = nextLandscape = 0;
    impacts.length = recentImpacts.length = 0;
    impactKick = impactUntil = eventSequence = heardEvent = 0;
    accumulated = 0;
    lastFrame = 0;
    lastDrawAt = 0;
    frameSeconds = 0;
    releaseInput();
    drawMapBase(world);
    updateHud(performance.now());
    updateCombatFeedback(localActor(), performance.now());
    renderer.draw(match, view, 0);
    frameRequest = requestAnimationFrame(frame);
    return true;
  } catch (error) {
    console.error(error);
    returnToMenu();
    const webgl = /webgl/i.test(error?.message ?? "");
    openError(
      webgl
        ? "This game needs WebGL 2. Check hardware acceleration or try a current desktop browser."
        : /dynamically imported|module script|Loading chunk|load.*module/i.test(
              error?.message ?? "",
            )
          ? "The game files changed or could not download. Reload to get the latest version."
          : "The world could not load. Reload the game and try again.",
      webgl,
    );
    return false;
  } finally {
    loading?.done();
    element("game-loading").hidden = true;
    matchStarting = false;
  }
}

function disconnect() {
  const previous = network;
  network = undefined;
  networkRole = undefined;
  remoteInput = {};
  remoteMovement.moveX = remoteMovement.moveZ = 0;
  remoteInputAt = 0;
  guestGesture = undefined;
  guestFocus = guestFinisher = false;
  selfReady = peerReady = arenaStarting = false;
  peerName = "Friend";
  peerHeraldry = undefined;
  previous?.close();
}

function saveCareer() {
  const player = localActor();
  if (!match || !player?.stats || match.careerSaved || match.time < 1) return;
  recordCareer(player.stats, player.regionId);
  match.careerSaved = true;
}

function returnToMenu() {
  saveCareer();
  if (chronicle.active) chronicle.close();
  coopParty.close();
  expeditionUI.relicDialog.close();
  if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
  frameRequest = undefined;
  unlockPointer();
  releaseInput();
  disconnect();
  match = undefined;
  close(pauseDialog);
  close(controlsDialog);
  close(endDialog);
  close(settingsDialog);
  close(scoreDialog);
  close(mapDialog);
  gameScreen.hidden = true;
  menu.hidden = false;
  swingAudio.landscape(
    settings.theme,
    settings.master * settings.music,
    0,
    false,
  );
  ui.go("home");
  element("home-play").focus({ preventScroll: true });
}

function showPause() {
  if (match?.status !== "playing" || pauseDialog.open) return;
  unlockPointer();
  releaseInput();
  element("pause-note").textContent = isOnline()
    ? "Online play continues while this menu is open."
    : "Resume when you’re ready.";
  modal(pauseDialog);
}

function resume() {
  close(pauseDialog);
  canvas.focus({ preventScroll: true });
  capturePointer();
}

function controls() {
  if (match?.status === "playing" && !pauseDialog.open) showPause();
  modal(controlsDialog);
}

function showScore() {
  if (!match) return;
  unlockPointer();
  releaseInput();
  const list = element("score-list");
  list.replaceChildren();
  for (const actor of match.actors) {
    const item = document.createElement("li");
    const core = match.cores[actor.team];
    const role = actor === localActor() ? " (you)" : "";
    item.textContent = `${actor.name}${role} · ${Math.ceil(actor.health)} HP${core ? ` · ${Math.ceil((core.health / core.maxHealth) * 100)}% core` : ""}`;
    list.append(item);
  }
  modal(scoreDialog);
}

function getComboProgress(player, now) {
  // Between snapshots, estimate the local guest's progress so the short window stays usable.
  const lead =
    networkRole === "guest" || coopParty.role === "guest"
      ? clamp((now - snapshotAt) / 1000, 0, 0.075) *
        actorTimeScale(match, player)
      : 0;
  return comboProgress(player.combat, getWeapon(player.weaponId), lead);
}

function canAttack(player, combo) {
  return (
    player.alive &&
    !guarding &&
    !player.stagger &&
    (player.combat.phase === AttackPhase.IDLE || combo !== null)
  );
}

function queueAttack(player, gesture, progress, now) {
  if (!gesture || pendingGesture) return;
  if (progress !== null)
    gesture.combo = { swingId: player.combat.swingId, progress };
  pendingGesture = { value: gesture, at: now };
}

function sampleMouse(now, dt) {
  // A click between frames gets a chance to reach the simulation on a slow renderer.
  const lifetime = clamp(
    dt * 1000,
    GESTURE_LIFETIME_MS,
    MAX_GESTURE_LIFETIME_MS,
  );
  if (pendingGesture && now - pendingGesture.at > lifetime)
    pendingGesture = undefined;
  if (!canPlay() || !isCapturing()) return;
  const player = localActor();
  const { phase } = player.combat;
  const progress = getComboProgress(player, now);
  const canFlick =
    !touch.enabled &&
    settings.attackInput === "swipe" &&
    canAttack(player, progress);
  const dragged = touch.state.consumeLook();
  mouse.addDelta(dragged.dx, dragged.dy);
  const { dx, dy, gesture } = mouse.sample(
    dt,
    canFlick,
    settings.swingDistance,
    settings.swipeSpeed,
  );
  const magnitude = Math.hypot(dx, dy);
  if (magnitude) {
    const response = Math.min((magnitude * settings.swingResponse) / 17, 1);
    aimX += (dx / magnitude - aimX) * response;
    aimY += (dy / magnitude - aimY) * response;
  }
  queueAttack(player, gesture, progress, now);

  // Keep ordinary aim responsive at every speed. Soften the turn when the weapon cuts.
  const look =
    settings.sensitivity *
    (gesture || phase === AttackPhase.ACTIVE_SWING ? 0.45 : 1);
  cameraAim.yaw = wrapAngle(cameraAim.yaw - dx * 0.0029 * look);
  cameraAim.pitch = clamp(
    cameraAim.pitch + dy * 0.0025 * look * (settings.invert ? -1 : 1),
    -0.71,
    0.61,
  );
  const blend = 1 - Math.exp(-17 * Math.min(dt, 0.07));
  view.yaw = wrapAngle(view.yaw + wrapAngle(cameraAim.yaw - view.yaw) * blend);
  view.pitch += (cameraAim.pitch - view.pitch) * blend;
}

function makeInput() {
  if (!canPlay()) return { facing: view.yaw, aimX, aimY, cancelCombo: true };
  const bound = settings.keys;
  const forward = clamp(
    Number(keys.has(bound.forward) || keys.has("ArrowUp")) -
      Number(keys.has(bound.back) || keys.has("ArrowDown")) +
      touch.state.forward,
    -1,
    1,
  );
  const side = clamp(
    Number(keys.has(bound.right) || keys.has("ArrowRight")) -
      Number(keys.has(bound.left) || keys.has("ArrowLeft")) +
      touch.state.x,
    -1,
    1,
  );
  const sin = Math.sin(view.yaw);
  const cos = Math.cos(view.yaw);
  return {
    moveX: forward * sin - side * cos,
    moveZ: forward * cos + side * sin,
    facing: view.yaw,
    aimX,
    aimY,
    interact,
    bufferWindow: settings.bufferWindow,
    guard: guarding || touch.state.guard,
    sprint:
      touch.state.sprint ||
      keys.has(bound.sprint) ||
      (bound.sprint === "ShiftLeft" && keys.has("ShiftRight")),
    gesture: pendingGesture?.value,
    focus: pendingFocus,
    finisher: pendingFinisher,
    relic: pendingRelic,
    equip: pendingEquip,
    cancelCombo: !isCapturing(),
  };
}

canvas.addEventListener("mousedown", (event) => {
  if (!canPlay()) return;
  event.preventDefault();
  const captured = isCapturing();
  if (!captured) capturePointer();
  if (event.button === 2) {
    guarding = true;
    pendingGesture = undefined;
    mouse.reset();
  }
  if (event.button === 0 && captured && settings.attackInput === "click") {
    const player = localActor();
    const now = performance.now();
    const progress = getComboProgress(player, now);
    if (canAttack(player, progress)) {
      const speed = CombatTuning.MinFlickVelocity;
      const gesture = makeFlick(aimX, aimY, speed) ?? makeFlick(1, 0, speed);
      queueAttack(player, gesture, progress, now);
    }
  }
});
window.addEventListener("mouseup", (event) => {
  if (event.button === 2) guarding = false;
});
canvas.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("blur", releaseInput);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseInput();
});
document.addEventListener("pointerlockchange", () => {
  if (mouse.isCaptured() && !pointerAllowed()) {
    unlockPointer();
    return;
  }
  if (mouse.isCaptured()) touch.useLockedMouse();
  mouse.reset();
  pendingGesture = undefined;
  hudAt = 0;
  if (
    !isCapturing() &&
    !blockUnlock &&
    !matchStarting &&
    match?.status === "playing"
  )
    showPause();
  blockUnlock = false;
});
document.addEventListener("keydown", (event) => {
  if (event.code === "Escape" && canPlay()) {
    event.preventDefault();
    showPause();
    return;
  }
  if (!canPlay()) return;
  const { code } = event;
  if (
    code.startsWith("Arrow") ||
    code === "Tab" ||
    code === "KeyV" ||
    code === "KeyM" ||
    Object.values(settings.keys).includes(code)
  )
    event.preventDefault();
  keys.add(code);
  if (event.repeat) return;
  if (code === "KeyM" && match.world.mode === "frontier") {
    unlockPointer();
    releaseInput();
    paintWorldMap(element("field-map"), match.world, "biome", { border: 8 });
    modal(mapDialog);
  }
  if (code === "Tab") showScore();
  if (code === settings.keys.pickup) interact = true;
  if (code === settings.keys.focus) pendingFocus = true;
  if (code === settings.keys.finisher) pendingFinisher = true;
  if (code === settings.keys.relic) expeditionUI.openRelics();
  if (code === settings.keys.photo) chronicle.open(false);
  if (code === "KeyV" && match.world.mode !== "arena")
    setPerspective(!view.firstPerson);
  if (/^Digit[1-9]$/.test(code)) selectWeapon(Number(code.at(-1)) - 1);
});
document.addEventListener("keyup", (event) => keys.delete(event.code));

for (const button of document.querySelectorAll("[data-controls]"))
  button.addEventListener("click", controls);
for (const button of document.querySelectorAll("[data-open-arena]"))
  button.addEventListener("click", () => {
    element("network-panel").hidden = true;
    pitSeed = newSeed();
    refreshArenaLobby();
    modal(arenaDialog);
  });
for (const button of document.querySelectorAll("[data-close]")) {
  button.addEventListener("click", () => close(button.closest("dialog")));
}
element("practice").addEventListener("click", readyArena);
element("arena-roll").addEventListener("click", () => {
  pitSeed = newSeed();
  arenaConfigChanged();
});
element("arena-era").addEventListener("change", arenaConfigChanged);
weaponSelect.addEventListener("change", arenaConfigChanged);
element("pause").addEventListener("click", showPause);
element("focus-button").addEventListener("click", () => {
  if (canPlay()) {
    pendingFocus = true;
    canvas.focus({ preventScroll: true });
  }
});
element("error-reload").addEventListener("click", () => location.reload());
element("resume").addEventListener("click", resume);
element("quit").addEventListener("click", returnToMenu);
element("leave-end").addEventListener("click", returnToMenu);
element("replay").addEventListener("click", () =>
  startMatch(match.world.mode, match.world.settings),
);
pauseDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  resume();
});
endDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  returnToMenu();
});

function selectWeapon(index) {
  if (coopParty.role === "guest") pendingEquip = index;
  else equipWeapon(match, index, localActor());
}

function flash(text, now = performance.now()) {
  notice = text;
  noticeUntil = now + 2100;
  hudAt = 0;
}

const impactLabels = {
  hit: "Hit",
  "core-hit": "Core struck",
  block: "Blocked",
  parry: "Parry",
  "guard-break": "Guard broken",
};

function reactToImpact(event, now) {
  impacts.push(event);
  if (event.actorId !== localActor().id && event.targetId !== localActor().id)
    return;
  const weight = event.weaponId ? getWeapon(event.weaponId).weight : 1;
  impactKick = clamp(0.44 + weight * 0.14, 0, 1);
  impactUntil = now + 430;
  impactCaption = impactLabels[event.type];
  reticle.dataset.impact = event.type;
  swingAudio.impact(event.surface, weight);
}

function processEvents(events, now) {
  const id = localActor().id;
  const team = localActor().team;
  for (const event of events) {
    if (Object.hasOwn(impactLabels, event.type)) {
      reactToImpact(event, now);
      if (isOnline() && (networkRole === "host" || coopParty.role === "host")) {
        recentImpacts.push({ ...event, sequence: ++eventSequence });
        if (recentImpacts.length > 12) recentImpacts.shift();
      }
    }
    if (event.type === "captain-down")
      flash("Captain defeated. Choose your relic with R.", now);
    if (event.type === "objective-complete")
      flash("The stronghold core is exposed.", now);
    if (event.type === "core-locked" && event.actorId === id)
      flash(
        "Defeat the captain and finish this stronghold’s objective first.",
        now,
      );
    if (event.type === "era-shift")
      flash("The rifts shift into a new age.", now);
    if (
      event.type === "captain-windup" &&
      Math.hypot(event.x - localActor().x, event.z - localActor().z) < 7
    )
      flash("Captain slam — leave the glowing circle!", now);
    if (event.type === "seal-hit") swingAudio.impact("stone", 1);
    if (event.type === "pickup" && event.actorId === id)
      flash(`Picked up ${event.name}`, now);
    if (event.type === "core-hit" && event.team === team)
      flash("Your core is under attack!", now);
    if (event.type === "core-destroyed" && event.team !== team)
      flash("Rival core destroyed", now);
    if (event.type === "parry" && event.targetId === id)
      flash("Perfect parry — release Guard, then attack for a riposte!", now);
    if (event.type === "block" && event.targetId === id)
      flash(event.directional ? "Directed guard" : "Guarded hit", now);
    if (event.type === "respawn" && event.actorId === id) {
      view.yaw = cameraAim.yaw = localActor().facing;
      flash("Respawned at your stronghold", now);
    }
  }
}

function frame(now) {
  frameRequest = undefined;
  if (!match) return;
  const frameTime = lastFrame ? (now - lastFrame) / 1000 : 0;
  const elapsed = Math.min(frameTime, 0.07);
  lastFrame = now;
  if (frameTime > 0 && frameTime < 0.5)
    frameSeconds = frameSeconds
      ? frameSeconds + (frameTime - frameSeconds) * 0.08
      : frameTime;
  if (match.status === "playing") {
    sampleMouse(now, frameTime);
    if (coopParty.started && coopParty.role === "guest") {
      if (
        now >= networkStepAt ||
        pendingGesture ||
        pendingFocus ||
        pendingFinisher ||
        pendingRelic ||
        pendingEquip !== undefined
      ) {
        if (coopParty.sendInput(makeInput())) {
          pendingGesture = undefined;
          pendingFocus = pendingFinisher = false;
          pendingRelic = pendingEquip = undefined;
          interact = false;
        }
        networkStepAt = now + 33;
      }
    } else if (isOnline() && networkRole === "guest") {
      if (
        now >= networkStepAt ||
        pendingGesture ||
        pendingFocus ||
        pendingFinisher
      ) {
        const sent = network?.send({ type: "input", input: makeInput() });
        if (sent) {
          pendingGesture = undefined;
          pendingFocus = pendingFinisher = false;
        }
        networkStepAt = now + 33;
      }
    } else if (canPlay() || isOnline()) {
      accumulated += elapsed;
      while (accumulated >= 1 / 60 && match.status === "playing") {
        const input = makeInput();
        const packetAge = now - remoteInputAt;
        const movement = smoothRemoteMovement(
          remoteMovement,
          remoteInput,
          packetAge,
          1 / 60,
        );
        const peer =
          packetAge < 500
            ? {
                ...remoteInput,
                ...movement,
                gesture: guestGesture,
                focus: guestFocus,
                finisher: guestFinisher,
              }
            : { ...movement, cancelCombo: true };
        const frozen = match.hitStop > 1e-7;
        stepGame(
          match,
          1 / 60,
          input,
          peer,
          coopParty.started ? coopParty.inputs(now) : {},
        );
        processEvents(match.events, now);
        if (!frozen) {
          guestGesture = undefined;
          guestFocus = guestFinisher = pendingFocus = pendingFinisher = false;
          pendingRelic = pendingEquip = undefined;
          if (coopParty.started) coopParty.consume();
          pendingGesture = undefined;
          interact = false;
        }
        accumulated -= 1 / 60;
      }
      if (isOnline() && (now >= networkStepAt || match.status !== "playing")) {
        sendSnapshot();
        networkStepAt = now + (coopParty.started ? 80 : 50);
      }
    }
  }
  const listening = localActor();
  if (now >= nextLandscape) {
    nextLandscape = now + 850;
    swingAudio.landscape(
      lastRegion,
      settings.master * settings.music,
      settings.master * settings.ambience,
      canPlay(),
    );
  }
  if (canPlay() && listening.speed > 1.5 && now >= nextFoot) {
    nextFoot = now + clamp(2100 / listening.speed, 240, 560);
    const surface =
      match.world.pathAt(listening.x, listening.z) > 0.52 ? "stone" : "wood";
    swingAudio.footstep(surface, listening.speed > 7);
  }
  impactKick *= Math.exp(-elapsed * 16);
  updateCombatFeedback(localActor(), now);
  if (
    settings.fps === "0" ||
    !lastDrawAt ||
    now - lastDrawAt >= 1000 / Number(settings.fps) - 0.6
  ) {
    const presentation = chronicle.frame(match, now);
    renderer.draw(
      presentation.game,
      {
        ...view,
        photo: presentation.photo,
        impactKick,
        impacts,
        reducedMotion: settings.reducedMotion,
      },
      lastDrawAt ? (now - lastDrawAt) / 1000 : elapsed,
    );
    impacts.length = 0;
    lastDrawAt = now;
  }
  if (now >= hudAt) {
    updateHud(now);
    expeditionUI.update();
    hudAt = now + 100;
  }
  if (match.status !== "playing" && !endDialog.open && !chronicle.active)
    finish();
  frameRequest = requestAnimationFrame(frame);
}

function setText(id, text) {
  const node = element(id);
  if (node.textContent !== text) node.textContent = text;
}

function setMeter(id, value, maximum) {
  const meter = element(id);
  meter.max = maximum;
  meter.value = value;
  setText(`${id}-value`, String(Math.ceil(value)));
}

function showSwipe(arrow, gesture) {
  if (arrow.hidden !== !gesture) arrow.hidden = !gesture;
  // CSS rotates clockwise because screen Y points down.
  const angle = gesture ? `${-gesture.angle}deg` : "";
  if (arrow.style.getPropertyValue("--swipe-angle") !== angle)
    arrow.style.setProperty("--swipe-angle", angle);
}

function updateCombatFeedback(player, now) {
  const { combat } = player;
  const gesture = isSwinging(combat) ? combat.gesture : null;
  const direction = gesture?.direction ?? "";
  if (reticle.dataset.phase !== combat.phase)
    reticle.dataset.phase = combat.phase;
  if (reticle.dataset.direction !== direction)
    reticle.dataset.direction = direction;
  reticle.classList.toggle("guarding", player.guarding);
  reticle.style.setProperty(
    "--vitality",
    `${(player.health / player.maxHealth) * 100}%`,
  );
  reticle.style.setProperty(
    "--endurance",
    `${(player.stamina / player.maxStamina) * 100}%`,
  );
  if (now >= impactUntil && reticle.dataset.impact)
    delete reticle.dataset.impact;
  reticle.classList.toggle(
    "buffer-open",
    getComboProgress(player, now) !== null,
  );
  showSwipe(swipeArrow, gesture);
  showSwipe(comboArrow, combat.buffered);

  if (
    combat.phase === AttackPhase.ACTIVE_SWING &&
    combat.swingId !== lastSwoosh
  ) {
    lastSwoosh = combat.swingId;
    swingAudio.play(gesture.velocity);
  }
  setText(
    "hud-caption",
    settings.captions
      ? now < impactUntil
        ? impactCaption
        : combat.phase === AttackPhase.ACTIVE_SWING
          ? `${direction[0]}${direction.slice(1).toLowerCase()} swing`
          : ""
      : "",
  );
}

function updateHud(now) {
  const player = localActor();
  const rival = remoteActor();
  const { world } = match;
  const arena = world.mode === "arena";
  const training = world.mode === "training";
  const guide = element("yard-tip");
  guide.hidden = !training || !settings.yardGuide;
  if (!guide.hidden) {
    const drills = match.training;
    setText(
      "yard-tip",
      !drills.fixedHits
        ? "Make small corrections, then cut through the near target."
        : !drills.movingHits
          ? "Track a moving target before changing direction."
          : !drills.combos
            ? "Cut again as the extra ring closes."
            : !drills.guardUsed
              ? "Raise the shield. Watch the stamina arc drain."
              : "The yard is yours. Leave through the menu when ready.",
    );
  }
  const region = world.regionAt(player.x, player.z);
  if (world.mode === "frontier" && lastRegion !== region.id) {
    lastRegion = region.id;
    flash(`${region.name} · ${EraWeather[region.id].note}`, now);
  }
  const startingRegion = world.regions.find(({ id }) => id === player.regionId);
  setText(
    "hud-mode",
    training ? "TRAINING" : arena ? "ARENAS · 1V1" : "FRONTIER",
  );
  setText(
    "hud-region",
    training ? "Training Yard" : arena ? "The Pit" : region.name,
  );
  setText(
    "hud-faction",
    training
      ? "Harmless targets"
      : arena
        ? `${region.era} · ${isOnline() ? "Online duel" : "Practice duel"}`
        : startingRegion.faction,
  );
  setText(
    "hud-objective",
    training
      ? "Practice on fixed and moving targets"
      : arena
        ? "Defeat your challenger"
        : "Defend your core. Destroy rival cores.",
  );
  const ownCore = match.cores[0];
  const remaining = match.cores.filter(
    (core) => core.team && core.health > 0,
  ).length;
  setText(
    "hud-cores",
    training
      ? `Fixed hits ${match.training.fixedHits} · Moving hits ${match.training.movingHits} · Combos ${match.training.combos}`
      : arena
        ? ""
        : `Your core ${Math.ceil((100 * ownCore.health) / ownCore.maxHealth)}% · Rival cores ${remaining}`,
  );
  setMeter("health", player.health, player.maxHealth);
  setMeter("stamina", player.stamina, player.maxStamina);
  element("rival-vitals").hidden = !rival;
  if (rival) setMeter("rival-health", rival.health, rival.maxHealth);
  const weapon = getWeapon(player.weaponId);
  setText("hud-weapon", weapon.name);
  setText("hud-weapon-detail", `${weapon.era} · ${weapon.weight} kg`);
  const inventory = arena ? "" : `${player.inventory.join(",")}:${weapon.id}`;
  if (inventory !== lastInventory) {
    const row = element("hud-inventory");
    row.replaceChildren();
    if (!arena)
      player.inventory.forEach((weaponId, index) => {
        const slot = document.createElement("kbd");
        slot.textContent = index + 1;
        slot.title = getWeapon(weaponId).name;
        slot.classList.toggle("equipped", weaponId === weapon.id);
        row.append(slot);
      });
    lastInventory = inventory;
  }
  const flow = player.flow;
  element("focus-threat").hidden = actorTimeScale(match, player) === 1;
  setText("combo-count", `${flow.count} HIT COMBO`);
  setText("combo-best", `BEST ${flow.best}`);
  element("combo-timer").value = flow.window;
  element("focus-meter").value =
    flow.remaining > 0
      ? (flow.remaining / (flow.duration || FlowTuning.FocusDuration)) * 100
      : flow.charge;
  element("focus-button").disabled =
    flow.charge < 100 || flow.remaining > 0 || !canPlay();
  element("focus-button").setAttribute(
    "aria-pressed",
    String(flow.remaining > 0),
  );
  element("focus-button").classList.toggle("ready", flow.charge === 100);
  setText(
    "focus-value",
    flow.remaining > 0
      ? `${flow.remaining.toFixed(1)}s`
      : flow.charge === 100
        ? "READY"
        : `${Math.round(flow.charge)}%`,
  );
  setText("focus-key", touch.enabled ? "TAP" : keyLabel(settings.keys.focus));
  gameScreen.classList.toggle(
    "focus-active",
    flow.remaining > 0 && !settings.reducedMotion,
  );
  const pickup = arena ? null : nearbyPickup(match, player);
  let message = now < noticeUntil ? notice : "";
  if (!player.alive && !arena && match.status === "playing")
    message = `The watch found you. Back in ${Math.ceil(player.respawnAt - match.time)}s.`;
  else if (!message && !isCapturing() && canPlay())
    message = "Click the game to capture the mouse, or hold and drag to look";
  else if (!message && pickup) {
    const item = pickup.weaponId
      ? getWeapon(pickup.weaponId).name
      : pickup.item === "medkit"
        ? "Medkit"
        : "Stamina Tonic";
    message = `[E] Pick up ${item}`;
  }
  setText("hud-message", message);
  setText("hud-seed", `SEED ${world.seed}`);
  const bound = settings.keys;
  const directions = [bound.forward, bound.left, bound.back, bound.right].map(
    keyLabel,
  );
  const movement = directions.join(
    directions.every((key) => key.length === 1) ? "" : "/",
  );
  const attack =
    settings.attackInput === "click" ? "LMB Swing" : "Long Swipe to Swing";
  setText(
    "hud-controls",
    arena
      ? `${movement} Move · ${attack} · RMB Guard · Tab Status`
      : `${movement} Move · ${attack} · RMB Guard · ${keyLabel(bound.pickup)} Pick up · V Camera · Tab Status`,
  );
  if (touch.enabled)
    setText(
      "hud-controls",
      "Left stick to move · Drag the field to look · Tap Attack to swing",
    );
  element("hud-map").hidden = !settings.minimap;
  element("hud-dev").hidden = !settings.counters;
  if (settings.counters) {
    const stats = renderer.stats();
    setText(
      "hud-dev",
      `${Math.round(1 / (frameSeconds || 1 / 60))} FPS · ${stats.detailedChunks}/${stats.chunks} detailed chunks · ${stats.props} props`,
    );
  }
  if (settings.minimap) drawMap(world, player);
}

function mapPosition(world, x, z) {
  const width = minimap.width - 12;
  return [
    6 + (x / world.size + 0.5) * width,
    6 + (z / world.size + 0.5) * width,
  ];
}

function drawMapBase(world) {
  paintWorldMap(mapLayer, world, settings.terrainOverlay, {
    markers: false,
    border: 6,
  });
}

function drawMap(world, player) {
  if (!mapContext) return;
  mapContext.drawImage(mapLayer, 0, 0);
  for (const core of match.cores) {
    const [x, y] = mapPosition(world, core.x, core.z);
    mapContext.fillStyle =
      core.health <= 0 ? "#303735" : core.team ? "#ff946e" : "#8ff9d1";
    mapContext.fillRect(x - 3, y - 3, 6, 6);
    mapContext.strokeStyle = "#202620";
    mapContext.strokeRect(x - 4, y - 4, 8, 8);
  }
  for (const actor of match.actors) {
    if (!actor.alive || actor === player) continue;
    const [x, y] = mapPosition(world, actor.x, actor.z);
    mapContext.fillStyle = actor.team === player.team ? "#8ff9d1" : "#ffd0b0";
    mapContext.fillRect(x - 2, y - 2, 4, 4);
  }
  const [x, y] = mapPosition(world, player.x, player.z);
  mapContext.save();
  mapContext.translate(x, y);
  mapContext.rotate(-view.yaw);
  mapContext.beginPath();
  mapContext.moveTo(0, 6);
  mapContext.lineTo(-4, -4);
  mapContext.lineTo(4, -4);
  mapContext.closePath();
  mapContext.fillStyle = "#fff9db";
  mapContext.strokeStyle = "#1e2422";
  mapContext.lineWidth = 2;
  mapContext.stroke();
  mapContext.fill();
  mapContext.restore();
}

function finish() {
  saveCareer();
  const stats = localActor().stats;
  if (stats)
    writeLedger(element("end-ledger"), [
      ["Damage", stats.damage],
      [
        "Accuracy",
        `${stats.swings ? Math.round((stats.hits / stats.swings) * 100) : 0}%`,
      ],
      ["Best hit combo", stats.longestHitCombo || 0],
      ["Blocks", stats.blocks],
      ["Parries", stats.parries],
      ["Time", `${Math.floor(match.time)}s`],
    ]);
  unlockPointer();
  releaseInput();
  close(controlsDialog);
  close(pauseDialog);
  let status = match.status;
  if (networkRole === "guest" && status !== "draw")
    status = status === "won" ? "lost" : "won";
  const arena = match.world.mode === "arena";
  const titles = arena
    ? { won: "Duel won", lost: "Duel lost", draw: "Draw" }
    : { won: "Frontier secured", lost: "Your core fell" };
  const notes = arena
    ? {
        won: "You defeated your challenger.",
        lost: "Your challenger won this round.",
        draw: "Both fighters fell.",
      }
    : {
        won: "Your stronghold held and all rival cores fell.",
        lost: "Rivals destroyed your stronghold’s core.",
      };
  setText("end-title", titles[status]);
  setText("end-note", notes[status]);
  element("replay").hidden = isOnline();
  modal(endDialog);
}

function sendSnapshot() {
  if (coopParty.started && coopParty.role === "host") {
    coopParty.sendSnapshot({
      ...packExpedition(match),
      impacts: recentImpacts,
    });
    return;
  }
  network?.send({
    type: "snapshot",
    time: match.time,
    sceneTime: match.sceneTime,
    status: match.status,
    actors: match.actors,
    impacts: recentImpacts,
  });
}

function arenaConfig() {
  return {
    worldSeed: pitSeed,
    era: element("arena-era").value,
    arenaWeapon: weaponSelect.value,
  };
}

function updateArenaLabels() {
  const config = arenaConfig();
  const preview = createWorld(pitSeed, "arena", config);
  arenaDialog.dataset.era = preview.regions[0].id;
  setText("arena-seed-label", `PIT-${pitSeed}`);
  setText("arena-era-label", preview.regions[0].era);
}

function refreshArenaLobby() {
  updateArenaLabels();
  const connected = network?.status === "connected";
  const ready = element("practice");
  ready.disabled = Boolean(arenaStarting || (network && !connected));
  ready.textContent = selfReady && connected ? "Unready" : "Ready";
  setText("arena-opponent", network ? peerName : "Pit sparring bot");
  setText("arena-self-status", selfReady ? "Ready ✓" : "Setting up");
  setText(
    "arena-peer-status",
    !network || peerReady
      ? "Ready ✓"
      : connected
        ? "Setting up"
        : "Waiting to connect",
  );
  element("arena-self-status").classList.toggle("is-ready", selfReady);
  element("arena-peer-status").classList.toggle(
    "is-ready",
    !network || peerReady,
  );
  weaponSelect.disabled = networkRole === "guest" || arenaStarting;
  element("arena-era").disabled = weaponSelect.disabled;
  element("arena-roll").disabled = weaponSelect.disabled;
}

function sendArenaConfig() {
  if (networkRole === "host" && network?.status === "connected") {
    network.send({
      type: "arena-config",
      ...arenaConfig(),
      name: settings.playerName,
      heraldry: settings.heraldry,
    });
  }
}

function arenaConfigChanged() {
  selfReady = peerReady = false;
  sendArenaConfig();
  refreshArenaLobby();
}

function readArenaConfig(message) {
  const worldSeed = cleanSeed(message.worldSeed ?? "");
  if (!worldSeed || !WEAPONS.some(({ id }) => id === message.arenaWeapon))
    return null;
  const { era } = worldSettings({ era: message.era });
  return { worldSeed, era, arenaWeapon: message.arenaWeapon };
}

function maybeStartOnlineArena() {
  if (
    networkRole !== "host" ||
    !selfReady ||
    !peerReady ||
    match ||
    arenaStarting
  )
    return;
  const config = arenaConfig();
  if (!network?.send({ type: "start", ...config })) return;
  arenaStarting = true;
  refreshArenaLobby();
  startMatch("arena", { ...config, online: true, countdown: true });
}

function readyArena() {
  if (!network) {
    startMatch("arena", arenaConfig());
  } else if (
    network.send({
      type: "ready",
      ready: !selfReady,
      name: settings.playerName,
      heraldry: settings.heraldry,
    })
  ) {
    selfReady = !selfReady;
    refreshArenaLobby();
    maybeStartOnlineArena();
  }
}

function readRemoteGesture(value) {
  if (
    !value ||
    ![value.x, value.y, value.velocity].every(Number.isFinite) ||
    value.velocity < CombatTuning.MinFlickVelocity
  )
    return null;
  const gesture = makeFlick(
    clamp(value.x, -1, 1),
    clamp(value.y, -1, 1),
    value.velocity,
  );
  const combo = value.combo;
  if (
    gesture &&
    Number.isSafeInteger(combo?.swingId) &&
    Number.isFinite(combo.progress)
  ) {
    gesture.combo = { swingId: combo.swingId, progress: combo.progress };
  }
  return gesture;
}

function validCombatSnapshot(combat) {
  if (
    !combat ||
    !Object.hasOwn(AttackPhase, combat.phase) ||
    !Number.isFinite(combat.elapsed) ||
    combat.elapsed < 0 ||
    !Number.isSafeInteger(combat.swingId) ||
    combat.swingId < 0 ||
    (isSwinging(combat) && !combat.gesture)
  )
    return false;
  return [combat.gesture, combat.buffered].every(
    (gesture) =>
      gesture === null ||
      (gesture &&
        [gesture.x, gesture.y, gesture.angle, gesture.velocity].every(
          Number.isFinite,
        ) &&
        ["LEFT", "RIGHT", "UP", "DOWN"].includes(gesture.direction)),
  );
}

function applyOnlineMessage(message) {
  if (message.type === "ready" && !match && !arenaStarting) {
    peerReady = message.ready === true;
    peerHeraldry = message.heraldry;
    if (typeof message.name === "string")
      peerName = message.name.trim().slice(0, 20) || "Friend";
    refreshArenaLobby();
    maybeStartOnlineArena();
    return;
  }
  if (
    networkRole === "host" &&
    message.type === "input" &&
    message.input &&
    typeof message.input === "object"
  ) {
    const from = message.input;
    remoteInput = {
      moveX: from.moveX,
      moveZ: from.moveZ,
      facing: from.facing,
      aimX: from.aimX,
      aimY: from.aimY,
      guard: from.guard === true,
      sprint: from.sprint === true,
      cancelCombo: from.cancelCombo === true,
    };
    if (remoteInput.guard || remoteInput.cancelCombo) guestGesture = undefined;
    else guestGesture ??= readRemoteGesture(from.gesture);
    if (from.focus === true) guestFocus = true;
    if (from.finisher === true) guestFinisher = true;
    remoteInputAt = performance.now();
  } else if (networkRole === "guest") {
    if (
      (message.type === "arena-config" || message.type === "start") &&
      !match
    ) {
      const config = readArenaConfig(message);
      if (!config) return;
      if (message.type === "start") {
        arenaStarting = true;
        startMatch("arena", { ...config, online: true, countdown: true });
      } else {
        if (typeof message.name === "string")
          peerName = message.name.trim().slice(0, 20) || "Friend";
        peerHeraldry = message.heraldry;
        pitSeed = config.worldSeed;
        element("arena-era").value = config.era;
        weaponSelect.value = config.arenaWeapon;
        selfReady = peerReady = false;
        refreshArenaLobby();
      }
    } else if (
      message.type === "snapshot" &&
      match &&
      match.status === "playing"
    ) {
      const { actors, time, sceneTime, status } = message;
      if (
        !Array.isArray(actors) ||
        actors.length !== 2 ||
        !Number.isFinite(time) ||
        time < match.time ||
        !Number.isFinite(sceneTime) ||
        sceneTime < 0 ||
        sceneTime > time + 0.001 ||
        !["playing", "won", "lost", "draw"].includes(status) ||
        actors.some(
          (actor, index) =>
            !actor ||
            actor.id !== match.actors[index].id ||
            !validCombatSnapshot(actor.combat) ||
            !validCombatFlow(actor.flow) ||
            ![
              "x",
              "z",
              "facing",
              "health",
              "stamina",
              "maxHealth",
              "maxStamina",
            ].every((key) => Number.isFinite(actor[key])),
        )
      )
        return;
      match.actors = actors;
      match.player = actors[0];
      match.rival = actors[1];
      match.time = time;
      match.sceneTime = sceneTime;
      match.status = status;
      snapshotAt = performance.now();
      if (Array.isArray(message.impacts))
        for (const event of message.impacts.slice(-12)) {
          if (
            !event ||
            !Number.isSafeInteger(event.sequence) ||
            event.sequence <= heardEvent ||
            !Object.hasOwn(impactLabels, event.type) ||
            !Number.isFinite(event.x) ||
            !Number.isFinite(event.z)
          )
            continue;
          heardEvent = event.sequence;
          reactToImpact(event, snapshotAt);
        }
    }
  }
}

function onlineStatus(status, detail) {
  if (status === "connected") {
    if (match) {
      flash("Arena connection restored");
    } else {
      sendArenaConfig();
      setText("network-status", "Connected. Both fighters can ready up.");
    }
  } else if (status === "disconnected" || status === "failed") {
    const message =
      detail ||
      "Your opponent disconnected. You can return to the main menu and start a new invite.";
    if (match) {
      remoteInput = {};
      guestGesture = undefined;
      flash(message);
    } else setText("network-status", message);
  } else if (status === "gathering") {
    setText("network-status", "Preparing connection details…");
  } else if (status === "connecting") {
    setText("network-status", "Connecting to your friend…");
  } else if (status === "waiting" && detail && !match) {
    setText("network-status", detail);
    element("network-input-field").hidden = false;
  }
  if (!match) refreshArenaLobby();
}

async function openNetwork(role, transport) {
  disconnect();
  networkRole = role;
  element("network-panel").hidden = false;
  element("network-output-field").hidden = true;
  element("network-input-field").hidden = role === "host";
  networkInput.value = "";
  networkOutput.value = "";
  networkConnect.disabled = false;
  setText(
    "network-input-label",
    role === "host" ? "Friend’s response code" : "Friend’s invite code",
  );
  setText("network-connect", role === "host" ? "Connect" : "Create a response");
  try {
    const create = role === "host" ? createHostSession : createGuestSession;
    const session = create({
      transport,
      onMessage: applyOnlineMessage,
      onStatus: onlineStatus,
    });
    network = session;
    refreshArenaLobby();
    if (role === "host") {
      const code = await session.createInvite();
      if (network !== session) return;
      networkOutput.value = code;
      setText("network-output-label", "Invite code to send");
      setText("network-copy", "Copy invite");
      setText(
        "network-status",
        transport === "local"
          ? "Open this page in another tab, select Join a friend, and exchange the codes."
          : "Send the invite code to your friend, then paste the response they send back.",
      );
      element("network-output-field").hidden = false;
      element("network-input-field").hidden = false;
    } else {
      setText("network-status", "Paste the invite code your friend sent you.");
      networkInput.focus();
    }
  } catch (error) {
    if (networkRole === role && arenaDialog.open)
      setText("network-status", error.message);
  }
}

element("host-match").addEventListener("click", () => openNetwork("host"));
element("join-match").addEventListener("click", () => openNetwork("guest"));
element("local-match").addEventListener("click", () =>
  openNetwork("host", "local"),
);
networkConnect.addEventListener("click", async () => {
  if (!network) return;
  const session = network;
  networkConnect.disabled = true;
  try {
    if (networkRole === "host") {
      await session.acceptAnswer(networkInput.value);
    } else {
      const code = await session.acceptInvite(networkInput.value);
      if (network !== session) return;
      networkOutput.value = code;
      setText("network-output-label", "Response code to send");
      setText("network-copy", "Copy response");
      setText(
        "network-status",
        "Send this response to your friend. Select Ready after they connect.",
      );
      element("network-output-field").hidden = false;
    }
    if (network === session) element("network-input-field").hidden = true;
  } catch (error) {
    if (network === session) setText("network-status", error.message);
  } finally {
    if (network === session) networkConnect.disabled = false;
  }
});
element("network-copy").addEventListener("click", async () => {
  const button = element("network-copy");
  const label = networkRole === "guest" ? "Copy response" : "Copy invite";
  try {
    await navigator.clipboard.writeText(networkOutput.value);
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = label;
    }, 1200);
  } catch {
    networkOutput.select();
    setText(
      "network-status",
      "Code selected. Copy it with Ctrl+C or Command+C.",
    );
  }
});
arenaDialog.addEventListener("close", () => {
  if (!isOnline() && !matchStarting) disconnect();
});

function exportTerrain() {
  if (!match) return "Start a world to export its terrain.";
  const { world } = match;
  const width = world.terrain?.width ?? 57;
  const step = world.size / (width - 1);
  const elevations = [];
  const biomeWeights = [];
  for (let row = 0; row < width; row++)
    for (let column = 0; column < width; column++) {
      const x = column * step - world.size / 2;
      const z = row * step - world.size / 2;
      elevations.push(Number(world.height(x, z).toFixed(4)));
      biomeWeights.push(
        world.biomeWeights(x, z).map((weight) => Number(weight.toFixed(4))),
      );
    }
  const document = {
    version: 1,
    seed: world.seed,
    mode: world.mode,
    settings: world.settings,
    grid: {
      width,
      step,
      origin: [-world.size / 2, -world.size / 2],
      elevations,
      biomeWeights,
    },
    regions: world.regions,
    river: world.river ?? null,
    paths: world.paths ?? [],
    cores: world.forts.map((fort) => fort.core),
    spawns: world.spawns,
    placements: world.props.map((prop) => ({
      ...prop,
      region: prop.region.id,
      y: world.height(prop.x, prop.z),
    })),
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(document)], { type: "application/json" }),
  );
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `random-eras-${world.seed}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return "Terrain exported as JSON.";
}

async function copyWorldLink() {
  if (match?.world.mode !== "frontier")
    return "Start a Frontier world to copy a link.";
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({
    seed: match.world.seed,
    size: match.world.settings.preset,
    era: match.world.settings.era,
  });
  try {
    await navigator.clipboard.writeText(url.href);
    return "World link copied.";
  } catch {
    return `Seed ${match.world.seed} · ${match.world.settings.preset} · ${match.world.settings.era}`;
  }
}

function applySettings(key) {
  if (key === "quality" || key === "resolution")
    renderer?.setQuality(settings.quality, settings.resolution);
  if (key === "master" || key === "effects")
    swingAudio.setVolume(settings.master * settings.effects);
  if (["master", "music", "ambience", "theme"].includes(key)) {
    swingAudio.landscape(
      lastRegion ?? settings.theme,
      settings.master * settings.music,
      settings.master * settings.ambience,
      Boolean(match),
    );
  }
  if (["attackInput", "swingDistance", "swipeSpeed"].includes(key)) {
    mouse.reset();
    pendingGesture = undefined;
  }
  if (match && key === "terrainOverlay") drawMapBase(match.world);
  if (match?.world.mode === "frontier" && key === "frontierView")
    setPerspective(settings.frontierView === "first-person");
  hudAt = 0;
}

const swipeTester = createRelativeMouse(element("swipe-test"));
element("swipe-test").addEventListener("click", async () => {
  try {
    await swipeTester.capture();
    swipeTester.reset();
    let previous = performance.now();
    function testSwipe(now) {
      if (!swipeTester.isCaptured()) return;
      const { velocity, gesture } = swipeTester.sample(
        (now - previous) / 1000,
        true,
        settings.swingDistance,
        settings.swipeSpeed,
      );
      previous = now;
      if (gesture)
        setText(
          "swipe-result",
          `${gesture.direction} · ${Math.round(velocity)} units/s`,
        );
      requestAnimationFrame(testSwipe);
    }
    requestAnimationFrame(testSwipe);
  } catch {
    setText(
      "swipe-result",
      "Mouse capture failed. Open the game in a desktop browser tab.",
    );
  }
});
controlsDialog.addEventListener("close", () => {
  if (swipeTester.isCaptured()) document.exitPointerLock();
});

const coopParty = createExpeditionParty({
  onStatus: (text) => coopLobby.render(text),
  onStart: async (config, self) => {
    coopLobby.close();
    await startMatch("frontier", config);
  },
  onSnapshot: (data) => {
    if (
      match?.versus === "coop" &&
      coopParty.role === "guest" &&
      applyExpeditionSnapshot(match, data)
    ) {
      snapshotAt = performance.now();
      if (Array.isArray(data.impacts))
        for (const event of data.impacts.slice(-12)) {
          if (
            Number.isSafeInteger(event.sequence) &&
            event.sequence > heardEvent &&
            Object.hasOwn(impactLabels, event.type) &&
            Number.isFinite(event.x) &&
            Number.isFinite(event.z)
          ) {
            heardEvent = event.sequence;
            reactToImpact(event, snapshotAt);
          }
        }
    }
  },
  onLeave: (id) => {
    if (match?.versus !== "coop") return;
    if (id === "host") {
      showPause();
      element("pause-note").textContent =
        "The host disconnected. Return to the menu and exchange a new invite.";
    } else {
      const actor = match.actors.find((a) => a.id === id);
      if (actor) {
        actor.disconnected = true;
        actor.alive = false;
      }
    }
  },
});
const coopLobby = createExpeditionLobby({
  party: coopParty,
  config: () => ui.worldConfig(),
  name: () => settings.playerName,
  appearance: () => ({
    heraldry: settings.heraldry,
    armorStyle: settings.armorStyle,
    weaponFinish: settings.weaponFinish,
  }),
});
const chronicle = createChronicleUI({
  getGame: () => match,
  getActor: localActor,
  getRenderer: () => renderer,
  unlock: () => {
    unlockPointer();
    releaseInput();
  },
  opened: () => {
    photoReturnToPause = pauseDialog.open;
    close(pauseDialog);
    close(endDialog);
  },
  focus: () => {
    if (match?.status !== "playing") return;
    if (photoReturnToPause) showPause();
    else {
      canvas.focus({ preventScroll: true });
      capturePointer();
    }
  },
});
const expeditionUI = setupExpeditionUI({
  store,
  getGame: () => match,
  getActor: localActor,
  chooseRelic: (id) => {
    pendingRelic = id;
  },
  finisher: () => {
    if (canPlay()) pendingFinisher = true;
  },
  photo: () => chronicle.open(false),
  replay: () => chronicle.open(true),
  openCoop: () => {
    unlockPointer();
    coopLobby.open();
  },
  unlock: () => {
    unlockPointer();
    releaseInput();
  },
});
const ui = createInterface(store, {
  onStart: startMatch,
  onSettings: applySettings,
  onExport: exportTerrain,
  onCopySeed: copyWorldLink,
});
applySettings("master");
document.addEventListener("click", (event) => {
  if (!event.target.closest?.("#menu button")) return;
  swingAudio.unlock();
  swingAudio.landscape(
    settings.theme,
    settings.master * settings.music,
    0,
    false,
  );
  swingAudio.paper();
});

// Read-only client state supports regression tests and bug diagnosis. It includes
// no invite codes, account credentials, network addresses or server administration.
Object.defineProperty(window, "randomEras", {
  value: Object.freeze({
    version: "0.5.0",
    getState() {
      const player = match ? localActor() : null;
      return {
        active: Boolean(match && !gameScreen.hidden),
        mode: match?.world.mode ?? null,
        time: match?.time ?? 0,
        sceneTime: match?.sceneTime ?? 0,
        paused: match ? !canPlay() : false,
        camera: {
          yaw: view.yaw,
          pitch: view.pitch,
          firstPerson: view.firstPerson,
        },
        input: {
          captured: mouse.isCaptured(),
          dragLook: touch.mouseDragEnabled,
        },
        touch: {
          enabled: touch.enabled,
          x: touch.state.x,
          forward: touch.state.forward,
          guard: touch.state.guard,
        },
        player: player
          ? {
              x: player.x,
              y: player.y,
              z: player.z,
              health: player.health,
              stamina: player.stamina,
              guarding: player.guarding,
              weapon: player.weaponId,
              swings: player.stats.swings,
              hits: player.stats.hits,
              alive: player.alive,
              phase: player.combat.phase,
              comboProgress: getComboProgress(player, performance.now()),
              relics: player.relics,
              relicChoices: player.relicChoices,
              riposteUntil: player.riposteUntil,
              clock: player.clock,
              finishers: player.stats.finishers,
              ripostes: player.stats.ripostes,
              flow: { ...player.flow },
              timeScale: actorTimeScale(match, player),
            }
          : null,
        expedition: match?.campaign
          ? {
              phase: match.campaign.phase,
              nextShift: match.campaign.phaseAt,
              completed: match.campaign.completed,
              objectives: match.campaign.objectives.map((o) => ({
                id: o.id,
                kind: o.kind,
                team: o.team,
                unlocked: o.unlocked,
                complete: o.complete,
                x: o.x,
                z: o.z,
                nodes: o.nodes,
                wagon: o.wagon,
              })),
              bosses: match.actors
                .filter((a) => a.boss)
                .map((a) => ({
                  id: a.id,
                  health: a.health,
                  maxHealth: a.maxHealth,
                  alive: a.alive,
                  x: a.x,
                  z: a.z,
                })),
            }
          : null,
        party: {
          role: coopParty.role,
          self: coopParty.self,
          players: coopParty.members().length,
          connected: coopParty.connected,
          members:
            match?.actors
              .filter((a) => a.human)
              .map((a) => ({
                id: a.id,
                name: a.name,
                x: a.x,
                z: a.z,
                health: a.health,
                alive: a.alive,
              })) || [],
        },
        chronicle: chronicle.state(),
        training: match?.training ? { ...match.training } : null,
        network: {
          role: networkRole ?? "solo",
          status: network?.status ?? "disconnected",
        },
      };
    },
  }),
});

// The independent bootstrap can now release the loading gate.
document.documentElement.dataset.gameReady = "true";
window.dispatchEvent(new Event("random-eras:ready"));
