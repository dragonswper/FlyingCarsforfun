import { createChronicle } from "./chronicle.js";

export function createChronicleUI(
  { getGame, getActor, getRenderer, unlock, opened, focus },
  root = document,
) {
  const book = createChronicle();
  const dialog = root.createElement("dialog");
  dialog.className = "chronicle-tools";
  dialog.id = "chronicle-dialog";
  dialog.innerHTML = `<header><h2 id="chronicle-title">Photo mode</h2><button type="button" data-film="close" aria-label="Close photo/replay tools">×</button></header><p id="chronicle-note"></p><label>Orbit<input id="photo-yaw" type="range" min="-180" max="180" step="1" value="0"></label><label>Height<input id="photo-pitch" type="range" min="-10" max="70" step="1" value="20"></label><label>Distance<input id="photo-distance" type="range" min="3" max="20" step=".5" value="7"></label><div id="replay-controls" hidden><label>Moment<input id="film-seek" type="range" min="0" max="30" step=".05" value="0"></label><button type="button" data-film="play">Pause replay</button><label>Speed<select id="film-speed"><option value=".25">¼ speed</option><option value=".5">½ speed</option><option value="1" selected>Normal</option></select></label></div><div class="screen-actions"><button type="button" data-film="capture">Save photo</button><button type="button" data-film="close">Return</button></div><p id="photo-status" role="status"></p>`;
  root.body.append(dialog);
  const $ = (id) => root.getElementById(id);
  let mode = "photo",
    playing = true,
    time = 0,
    last = 0;
  const playButton = dialog.querySelector('[data-film="play"]');
  const syncPlay = () => {
    playButton.textContent = playing ? "Pause replay" : "Play replay";
  };
  function open(replay = false) {
    if (!getGame()) return;
    if (replay && book.count < 2) {
      $("photo-status").textContent =
        "Play for a moment before opening a replay.";
      return;
    }
    unlock();
    opened();
    mode = replay ? "replay" : "photo";
    time = book.start;
    last = 0;
    playing = true;
    syncPlay();
    $("chronicle-title").textContent = replay
      ? "Combat chronicle"
      : "Photo mode";
    $("chronicle-note").textContent =
      getGame().versus === "online" || getGame().versus === "coop"
        ? "Online play continues while you use these tools."
        : "Solo play is paused.";
    $("replay-controls").hidden = !replay;
    $("film-seek").min = String(book.start);
    $("film-seek").max = String(book.end);
    $("film-seek").value = String(book.start);
    $("photo-yaw").value = String(
      (Math.atan2(Math.sin(getActor().facing), Math.cos(getActor().facing)) *
        180) /
        Math.PI,
    );
    root.body.classList.add("chronicle-view");
    dialog.show();
    $("photo-status").textContent = "";
  }
  function close() {
    dialog.close();
    root.body.classList.remove("chronicle-view");
    focus();
  }
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  for (const button of dialog.querySelectorAll('[data-film="close"]'))
    button.addEventListener("click", close);
  playButton.addEventListener("click", () => {
    playing = !playing;
    syncPlay();
  });
  $("film-seek").addEventListener("input", () => {
    time = Number($("film-seek").value);
    playing = false;
    syncPlay();
  });
  dialog
    .querySelector('[data-film="capture"]')
    .addEventListener("click", () => {
      try {
        const url = getRenderer().capture();
        const link = root.createElement("a");
        link.href = url;
        link.download = `random-eras-${mode}-${Date.now()}.png`;
        link.click();
        $("photo-status").textContent = "Photo saved.";
      } catch {
        $("photo-status").textContent =
          "Photo capture is unavailable in this browser.";
      }
    });
  return {
    dialog,
    book,
    open,
    close,
    get active() {
      return dialog.open;
    },
    get mode() {
      return mode;
    },
    frame(game, now) {
      if (!dialog.open) {
        if (game?.status === "playing") book.record(game);
        return { game, photo: null };
      }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (mode === "replay" && playing) {
        time = Math.min(book.end, time + dt * Number($("film-speed").value));
        if (time === book.end) {
          playing = false;
          syncPlay();
        }
        $("film-seek").value = String(time);
      }
      const shown = mode === "replay" ? book.sample(time) || game : game;
      const actor =
        shown.actors.find((a) => a.id === getActor()?.id) || shown.player;
      return {
        game: shown,
        photo: {
          x: actor.x,
          z: actor.z,
          yaw: (Number($("photo-yaw").value) * Math.PI) / 180,
          pitch: (Number($("photo-pitch").value) * Math.PI) / 180,
          distance: Number($("photo-distance").value),
        },
      };
    },
    state() {
      return {
        active: dialog.open,
        mode,
        count: book.count,
        start: book.start,
        end: book.end,
        time,
        playing,
      };
    },
  };
}
