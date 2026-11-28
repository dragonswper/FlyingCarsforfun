import { REGIONS, worldSettings } from "./world.js";
import { prepareWorld } from "./world-loader.js";
import { paintWorldMap } from "./world-map.js";
import { readCareer } from "./career.js";
import { keyLabel } from "./settings.js";
import { getWeapon } from "./simulation.js";

const element = (id) => document.getElementById(id);
const all = (selector) => document.querySelectorAll(selector);
const ERA_ORDER = [
  "flintwake",
  "sunscar",
  "ironwood",
  "redcanopy",
  "frostfall",
  "ashline",
  "glassreach",
];
const MOVEMENT = {
  forward: "Forward",
  back: "Back",
  left: "Left",
  right: "Right",
  sprint: "Sprint",
  pickup: "Pick up",
  focus: "Focus",
  finisher: "Finisher",
  relic: "Relic choices",
  photo: "Photo mode",
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const newSeed = () =>
  crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase();
export const cleanSeed = (input) =>
  String(input)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 24);
export const eraName = (id) =>
  REGIONS.find((region) => region.id === id)?.era ?? "Random";
export const dailySeed = () => {
  // A Brisbane calendar date keeps the day's map identical across players.
  const brisbane = new Date(Date.now() + 10 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return "DAY-" + brisbane.replaceAll("-", "");
};

function writeEraOptions(select, first = "Random") {
  select.replaceChildren();
  select.add(new Option(first, "random"));
  for (const id of ERA_ORDER) select.add(new Option(eraName(id), id));
}

export function writeLedger(list, entries) {
  list.replaceChildren(
    ...entries.map(([label, value]) => {
      const row = document.createElement("div");
      const title = document.createElement("dt");
      const data = document.createElement("dd");
      title.textContent = label;
      data.textContent = value;
      row.append(title, data);
      return row;
    }),
  );
}

export function createInterface(
  store,
  { onStart, onSettings, onExport, onCopySeed },
) {
  const { state } = store;
  const menus = ["home", "modes", "lobby", "loadout", "career", "credits"];
  const seedInput = element("world-seed");
  const sizeSelect = element("world-size");
  const eraSelect = element("world-era");
  const settingsDialog = element("settings-dialog");
  const statuses = element("settings-status");
  const daily = { worldSeed: dailySeed(), era: "ironwood", preset: "medium" };
  const camp = { ready: false, bots: [true, true, true], preview: null };
  let screen = "home";
  let keyToBind;
  let previewId = 0;
  let loadoutView;
  let previewFrame;

  writeEraOptions(eraSelect);
  writeEraOptions(element("arena-era"), "Random age");
  const url = new URLSearchParams(location.search);
  seedInput.value = cleanSeed(url.get("seed") ?? "") || newSeed();
  const shared = worldSettings({
    preset: url.get("size"),
    era: url.get("era"),
  });
  sizeSelect.value = shared.preset;
  eraSelect.value = shared.era;

  function worldConfig() {
    seedInput.value = cleanSeed(seedInput.value) || newSeed();
    return {
      worldSeed: seedInput.value,
      preset: sizeSelect.value,
      era: eraSelect.value,
      expedition: element("frontier-rules")?.value !== "classic",
    };
  }

  function announce(author, message) {
    const log = element("camp-chat-log");
    const paragraph = document.createElement("p");
    if (author) {
      const name = document.createElement("strong");
      name.textContent = author + " ";
      paragraph.append(name);
    }
    paragraph.append(message);
    log.append(paragraph);
    if (log.childElementCount > 35) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  function drawRoster() {
    const area = element("camp-players");
    area.replaceChildren();
    const seats = [
      { name: state.playerName, label: "Host · Local", ready: camp.ready },
      ...camp.bots.map((present, index) => ({
        name: present
          ? (camp.preview?.forts[index + 1]?.region.faction ??
            `Rival ${index + 1}`)
          : "Open seat",
        label: present ? "Bot rival" : "Auto-fills at start",
        ready: present,
        index,
      })),
    ];
    for (const entry of seats) {
      const item = document.createElement("li");
      const seal = document.createElement("span");
      seal.textContent = entry.name.slice(0, 1);
      const name = document.createElement("strong");
      name.textContent = entry.name;
      const details = document.createElement("span");
      details.textContent = entry.label;
      if (entry.ready) details.classList.add("ready");
      if (entry.index !== undefined) {
        const button = document.createElement("button");
        button.className = "back-link";
        button.type = "button";
        button.textContent = camp.bots[entry.index] ? "×" : "+";
        button.title = camp.bots[entry.index]
          ? "Remove bot from lobby preview"
          : "Add bot to lobby preview";
        button.addEventListener("click", () => {
          camp.bots[entry.index] = !camp.bots[entry.index];
          drawRoster();
          area.children[entry.index + 1].querySelector("button")?.focus();
        });
        item.append(seal, name, details, button);
      } else {
        item.append(seal, name, details);
      }
      area.append(item);
    }
    element("camp-ready").textContent = camp.ready ? "Unready" : "Ready";
    element("camp-start").disabled = !camp.ready;
    element("camp-status").textContent = camp.ready
      ? "Ready to start"
      : "Local camp · Mark ready to start";
  }

  async function previewCamp() {
    const ticket = ++previewId;
    const config = worldConfig();
    element("camp-seed").textContent = config.worldSeed;
    element("camp-size").textContent =
      config.preset[0].toUpperCase() + config.preset.slice(1);
    element("camp-era").textContent = eraName(config.era);
    const preview = await prepareWorld(config.worldSeed, "frontier", config);
    if (ticket !== previewId || screen !== "lobby") return;
    camp.preview = preview;
    element("camp-era").textContent = preview.regions[0].era;
    paintWorldMap(element("camp-map"), preview);
    drawRoster();
    announce(null, `The camp is set to ${preview.regions[0].name}.`);
  }

  function go(next, { focus = true } = {}) {
    if (!menus.includes(next)) return;
    if (screen === "lobby" && next !== screen) previewId++;
    screen = next;
    for (const name of menus) element(`${name}-screen`).hidden = next !== name;
    if (screen === "lobby") {
      drawRoster();
      previewCamp().catch(() =>
        announce(null, "The map preview is unavailable."),
      );
    }
    cancelAnimationFrame(previewFrame);
    if (screen === "loadout") {
      loadoutView ??= import("./loadout-view.js")
        .then(({ createLoadoutView }) =>
          createLoadoutView(element("loadout-preview"), () => state),
        )
        .catch(() => null);
      loadoutView.then((draw) => {
        if (!draw || screen !== "loadout") return;
        const render = (time) => {
          if (screen !== "loadout" || element("menu").hidden) return;
          draw(time);
          previewFrame = requestAnimationFrame(render);
        };
        previewFrame = requestAnimationFrame(render);
      });
    }
    if (screen === "career") {
      const career = readCareer();
      const favorite = Object.entries(career.visits).sort(
        (a, b) => b[1] - a[1],
      )[0];
      writeLedger(element("career-ledger"), [
        ["Sessions", career.matches],
        ["Hits landed", career.hits],
        ["Fighters downed", career.kills],
        ["Captains defeated", career.bosses],
        ["Objectives cleared", career.objectives],
        ["Expedition wins", career.expeditionWins],
        ["Ripostes", career.ripostes],
        ["Finishers", career.finishers],
        ["Longest chain", career.longestCombo],
        ["Best hit combo", career.longestHitCombo],
        ["Most played age", favorite[1] ? eraName(favorite[0]) : "—"],
      ]);
    }
    scrollTo({ top: 0, behavior: "instant" });
    if (focus)
      element(`${next}-screen`)
        .querySelector("button")
        ?.focus({ preventScroll: true });
  }

  for (const node of all("[data-go]"))
    node.addEventListener("click", () => go(node.dataset.go));
  document.addEventListener("keydown", (event) => {
    if (
      event.code === "Escape" &&
      !element("menu").hidden &&
      !document.querySelector("dialog[open]") &&
      screen !== "home"
    ) {
      go("home");
    }
  });

  element("daily-seed").textContent = daily.worldSeed;
  prepareWorld(daily.worldSeed, "frontier", daily)
    .then((world) => paintWorldMap(element("daily-map"), world))
    .catch(() => {});
  element("play-daily").addEventListener("click", () =>
    onStart("frontier", daily),
  );
  for (const button of all("[data-play-training]"))
    button.addEventListener("click", () => onStart("training"));
  element("play-frontier").addEventListener("click", () =>
    onStart("frontier", worldConfig()),
  );
  document
    .querySelector('[data-mode="frontier"]')
    .addEventListener("click", () => seedInput.focus());
  element("roll-world").addEventListener("click", () => {
    seedInput.value = newSeed();
    seedInput.focus();
  });
  element("copy-world")?.addEventListener("click", async () => {
    seedInput.value = worldConfig().worldSeed;
    try {
      await navigator.clipboard.writeText(seedInput.value);
      element("copy-world").textContent = "Copied";
      setTimeout(() => {
        element("copy-world").textContent = "Copy seed";
      }, 1100);
    } catch {
      seedInput.focus();
      seedInput.select();
    }
  });
  element("camp-ready").addEventListener("click", () => {
    camp.ready = !camp.ready;
    drawRoster();
  });
  element("camp-start").addEventListener("click", async () => {
    if (!camp.ready) return;
    // The chosen configuration is captured before the countdown begins.
    const config = worldConfig();
    element("camp-start").disabled = true;
    await onStart("frontier", { ...config, countdown: true });
    drawRoster();
  });
  element("camp-chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = element("camp-chat-input");
    const value = input.value.trim();
    if (value) announce(state.playerName, value);
    input.value = "";
  });

  const eraTabs = element("era-tabs");
  for (const id of ERA_ORDER) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.era = id;
    button.textContent = eraName(id);
    button.addEventListener("click", () => {
      store.set("theme", id);
      eraSelect.value = id;
    });
    eraTabs.append(button);
  }
  eraSelect.addEventListener("change", () => {
    if (eraSelect.value !== "random") store.set("theme", eraSelect.value);
  });

  const loadout = element("loadout-weapon");
  for (const id of ["steel-longsword", "knight-dagger"])
    loadout.add(new Option(getWeapon(id).name, id));
  loadout.addEventListener("change", () => store.set("weapon", loadout.value));
  element("profile-name").addEventListener("change", (event) =>
    store.set("playerName", event.target.value),
  );

  function applyAppearance() {
    const root = document.documentElement;
    root.style.setProperty("--ui-scale", state.uiScale);
    root.dataset.contrast = String(state.contrast);
    root.dataset.reducedMotion = String(state.reducedMotion);
    root.dataset.reticleTheme = state.reticleTheme;
    element("menu").dataset.era = state.theme;
    for (const button of eraTabs.children)
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.era === state.theme),
      );
    for (const name of all("[data-profile-name]"))
      name.textContent = state.playerName;
    for (const letter of all("[data-profile-letter]"))
      letter.textContent = state.playerName[0].toUpperCase();
    element("profile-title").textContent = state.title;
    element("profile-name").value = state.playerName;
    loadout.value = state.weapon;
    const weapon = getWeapon(state.weapon);
    element("loadout-detail").textContent =
      `${weapon.weight} kg · ${weapon.description}`;
  }

  const keyButtons = new Map();
  for (const [action, label] of Object.entries(MOVEMENT)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ink-button";
    button.addEventListener("click", () => {
      keyToBind = action;
      statuses.textContent = `Press a key for ${label.toLowerCase()}. Escape cancels.`;
    });
    element("rebind-controls").append(button);
    keyButtons.set(action, button);
  }
  function syncSettings() {
    for (const control of all("[data-setting]")) {
      const key = control.dataset.setting;
      if (control.type === "checkbox") control.checked = state[key];
      else control.value = state[key];
      const label = document.querySelector(`[data-value="${key}"]`);
      if (label) {
        const multiplier = [
          "sensitivity",
          "swingDistance",
          "swipeSpeed",
          "swingResponse",
        ].includes(key);
        label.textContent = multiplier
          ? state[key].toFixed(2) + "×"
          : Math.round(state[key] * 100) + "%";
      }
    }
    element("controls-attack").textContent =
      state.attackInput === "click" ? "Left click" : "Make a long, quick swipe";
    for (const [action, button] of keyButtons)
      button.textContent =
        MOVEMENT[action] + " · " + keyLabel(state.keys[action]);
  }

  for (const button of all("[data-open-settings]"))
    button.addEventListener("click", () => {
      statuses.textContent = "";
      if (button.closest("#controls-dialog")) settingsTab("controls");
      if (!settingsDialog.open) settingsDialog.showModal();
    });
  function settingsTab(name) {
    for (const button of all("[data-settings-tab]"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.settingsTab === name),
      );
    for (const panel of all("[data-setting-panel]"))
      panel.hidden = panel.dataset.settingPanel !== name;
  }
  for (const button of all("[data-settings-tab]"))
    button.addEventListener("click", () =>
      settingsTab(button.dataset.settingsTab),
    );
  for (const control of all("[data-setting]"))
    control.addEventListener("input", () =>
      store.set(
        control.dataset.setting,
        control.type === "checkbox" ? control.checked : control.value,
      ),
    );
  settingsDialog.addEventListener("close", () => {
    keyToBind = undefined;
  });
  settingsDialog.addEventListener("keydown", (event) => {
    if (!keyToBind) return;
    if (event.code === "Escape") {
      event.preventDefault();
      keyToBind = undefined;
      statuses.textContent = "";
      return;
    }
    if (
      [
        "Tab",
        "KeyV",
        "KeyM",
        "ShiftRight",
        "AltLeft",
        "AltRight",
        "ControlLeft",
        "ControlRight",
        "MetaLeft",
        "MetaRight",
      ].includes(event.code) ||
      /^(Digit|F\d)/.test(event.code) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    const keys = { ...state.keys };
    const other = Object.keys(keys).find(
      (key) => key !== keyToBind && keys[key] === event.code,
    );
    if (other) keys[other] = keys[keyToBind];
    keys[keyToBind] = event.code;
    store.set("keys", keys);
    keyToBind = undefined;
    statuses.textContent = "Key binding saved.";
  });

  element("fullscreen-setting").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      statuses.textContent = "";
    } catch {
      statuses.textContent = "Fullscreen is unavailable here.";
    }
  });
  element("reset-combat").addEventListener("click", () => {
    for (const [key, value] of Object.entries({
      swingDistance: 1,
      swipeSpeed: 1,
      swingResponse: 1,
      bufferWindow: 0.3,
    }))
      store.set(key, value);
    statuses.textContent = "Combat settings reset.";
  });
  element("export-terrain").addEventListener("click", () => {
    statuses.textContent = onExport();
  });
  element("copy-match-seed")?.addEventListener("click", async () => {
    statuses.textContent = await onCopySeed();
  });

  store.subscribe((key, values) => {
    applyAppearance();
    syncSettings();
    if (screen === "lobby" && key === "playerName") drawRoster();
    onSettings(key, values);
  });
  applyAppearance();
  syncSettings();
  settingsTab("video");
  if (url.has("seed")) go("modes", { focus: false });
  return { go, worldConfig };
}

export async function showLoading({ countdown = false } = {}) {
  const screen = element("game-loading");
  const progress = element("loading-progress");
  const message = element("loading-step");
  const tip = element("loading-tip");
  screen.hidden = false;
  progress.value = 0;
  tip.textContent = "Each world can be shared by its seed.";
  if (countdown)
    for (let i = 3; i > 0; i--) {
      message.textContent = `Starting in ${i}…`;
      await pause(850);
    }
  message.textContent = "Generating terrain…";
  return {
    prepare() {
      message.textContent = "Preparing the world…";
      tip.textContent =
        "Attack again near the end of a swing to queue a follow-up.";
      progress.value = 2;
    },
    done() {
      progress.value = 3;
      screen.hidden = true;
    },
  };
}
