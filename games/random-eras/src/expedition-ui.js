import {
  RELICS,
  ARMOR_STYLES,
  WEAPON_FINISHES,
  cosmeticUnlocked,
  expeditionTask,
} from "./expedition.js";
import { readCareer } from "./career.js";
import { keyLabel } from "./settings.js";

export function setupExpeditionUI(
  {
    store,
    getGame,
    getActor,
    chooseRelic,
    finisher,
    photo,
    replay,
    openCoop,
    unlock,
  },
  root = document,
) {
  const $ = (id) => root.getElementById(id);
  const panel = root.createElement("section");
  panel.id = "expedition-hud";
  panel.className = "hud-panel expedition-hud";
  panel.innerHTML =
    '<strong id="expedition-task"></strong><span id="expedition-shift"></span><div class="expedition-actions"><button id="finisher-button" type="button" disabled>FINISHER <kbd>G</kbd></button><button id="relic-button" type="button" hidden>CHOOSE RELIC <kbd>R</kbd></button></div><span id="riposte-status" hidden>RIPOSTE READY</span>';
  $("game").append(panel);
  const relicDialog = root.createElement("dialog");
  relicDialog.id = "relic-dialog";
  relicDialog.className = "game-modal";
  relicDialog.innerHTML =
    '<div class="modal-card"><h2>Choose a relic</h2><p>One reward per captain. Relics last for this Expedition.</p><div id="relic-choices"></div><button type="button" id="relic-close">Return</button></div>';
  root.body.append(relicDialog);
  $("relic-close").addEventListener("click", () => relicDialog.close());
  function openRelics() {
    const actor = getActor();
    if (!actor?.relicChoices?.length) return;
    unlock();
    $("relic-choices").replaceChildren();
    for (const id of actor.relicChoices) {
      const relic = RELICS.find((r) => r.id === id);
      if (!relic) continue;
      const button = root.createElement("button");
      button.type = "button";
      button.className = "relic-choice";
      const title = root.createElement("strong"),
        detail = root.createElement("span");
      title.textContent = relic.name;
      detail.textContent = relic.detail;
      button.append(title, detail);
      button.dataset.relic = id;
      button.addEventListener("click", () => {
        chooseRelic(id);
        relicDialog.close();
      });
      $("relic-choices").append(button);
    }
    relicDialog.showModal();
  }
  $("relic-button").addEventListener("click", openRelics);
  $("finisher-button").addEventListener("click", finisher);
  function tools(parent) {
    const owner = parent.closest("dialog").id;
    for (const [label, id, fn] of [
      ["Photo mode", "photo-mode", photo],
      ["Replay last 30 seconds", "watch-chronicle", replay],
    ]) {
      const button = root.createElement("button");
      button.type = "button";
      button.className = "button button-secondary";
      button.textContent = label;
      button.id = id + "-" + owner;
      button.addEventListener("click", fn);
      parent.append(button);
    }
  }
  tools($("pause-dialog").querySelector(".modal-card"));
  tools($("end-dialog").querySelector(".modal-card"));
  const coop = root.createElement("button");
  coop.type = "button";
  coop.id = "open-expedition-coop";
  coop.className = "choice-card";
  coop.innerHTML =
    "<strong>Co-op Expedition</strong><span>Two to four wanderers. One shared Frontier.</span><small>Invite friends · Shared objectives</small>";
  coop.addEventListener("click", openCoop);
  for (const button of root.querySelectorAll("[data-open-coop]"))
    button.addEventListener("click", openCoop);
  $("modes-screen").querySelector(".mode-choices").append(coop);
  const rule = root.createElement("label");
  rule.textContent = "Frontier rules ";
  rule.innerHTML +=
    '<select id="frontier-rules"><option value="expedition">Expedition · Captains, relics and rifts</option><option value="classic">Classic Frontier</option></select>';
  $("modes-screen").querySelector(".option-grid").append(rule);
  const cosmetics = root.createElement("div");
  cosmetics.className = "option-grid";
  cosmetics.innerHTML =
    '<label>Armor style<select id="armor-style"></select></label><label>Weapon finish<select id="weapon-finish"></select></label><p id="cosmetic-status"></p>';
  $("loadout-screen").querySelector(".loadout-card").append(cosmetics);
  function refreshCosmetics() {
    const career = readCareer();
    for (const [id, list, key] of [
      ["armor-style", ARMOR_STYLES, "armorStyle"],
      ["weapon-finish", WEAPON_FINISHES, "weaponFinish"],
    ]) {
      const select = $(id);
      select.replaceChildren();
      for (const item of list) {
        const open = cosmeticUnlocked(item, career);
        const option = new Option(
          item.name + (open ? "" : " · " + item.requirement),
          item.id,
        );
        option.disabled = !open;
        select.add(option);
      }
      select.value = store.state[key];
      if (select.selectedOptions[0]?.disabled) {
        store.set(key, list[0].id);
        select.value = list[0].id;
      }
    }
    $("cosmetic-status").textContent =
      `Captains defeated ${career.bosses} · Expedition victories ${career.expeditionWins}`;
  }
  $("armor-style").addEventListener("change", () =>
    store.set("armorStyle", $("armor-style").value),
  );
  $("weapon-finish").addEventListener("change", () =>
    store.set("weaponFinish", $("weapon-finish").value),
  );
  for (const button of root.querySelectorAll('[data-go="loadout"]'))
    button.addEventListener("click", refreshCosmetics);
  refreshCosmetics();
  return {
    openRelics,
    relicDialog,
    refreshCosmetics,
    update() {
      const game = getGame(),
        actor = getActor();
      if (!game || !actor) {
        panel.hidden = true;
        return;
      }
      for (const [button, action] of [
        ["finisher-button", "finisher"],
        ["relic-button", "relic"],
      ]) {
        const label = $(button).querySelector("kbd"),
          text = $("game").classList.contains("touch-game")
            ? "TAP"
            : keyLabel(store.state.keys[action]);
        if (label.textContent !== text) label.textContent = text;
      }
      if (game.campaign) {
        $("hud-objective").textContent = expeditionTask(game, actor);
        $("hud-cores").textContent =
          `Home core ${Math.ceil((game.cores[0].health / game.cores[0].maxHealth) * 100)}% · Rift shift ${Math.ceil(Math.max(0, game.campaign.phaseAt - game.time))}s · E near home core to repair`;
      }
      panel.hidden = false;
      $("expedition-task").textContent =
        expeditionTask(game, actor) ||
        "Build a three-hit combo to unlock a finisher";
      $("expedition-shift").textContent = game.campaign
        ? `Rift shift in ${Math.ceil(Math.max(0, game.campaign.phaseAt - game.time))}s · Objectives ${game.campaign.completed}/3`
        : "Perfect parries open a brief counterattack window";
      $("finisher-button").disabled =
        !actor.alive ||
        actor.flow.count < 3 ||
        actor.stamina < 35 ||
        actor.guarding ||
        actor.combat.phase !== "IDLE";
      $("relic-button").hidden = !actor.relicChoices?.length;
      $("riposte-status").hidden = !(actor.riposteUntil > actor.clock);
    },
  };
}
