import "./touch-controls.css";
import { createTouchState } from "./touch-state.js";

export function createTouchControls(
  canvas,
  { canPlay, onAttack, onPickup, onWeapon, onView },
) {
  const state = createTouchState();
  let enabled = matchMedia("(pointer: coarse)").matches;
  let moveId,
    lookId,
    previous,
    dragging = false,
    allowDrag = false;
  const root = document.createElement("div");
  root.className = "touch-controls";
  root.setAttribute("aria-label", "Touch game controls");
  root.innerHTML = `<div class="touch-move"><button type="button" class="touch-stick" aria-label="Move joystick; push fully to sprint"><span class="touch-stick-thumb"></span></button><span class="touch-move-label">Move · sprint</span></div><span class="touch-look-hint">Drag to look</span><div class="touch-actions"><div class="touch-tools"><button type="button" data-touch="pickup">Pick up</button><button type="button" data-touch="weapon">Weapon</button><button type="button" data-touch="view">View</button></div><div class="touch-combat"><button type="button" data-touch="guard" aria-pressed="false">Guard</button><button type="button" data-touch="attack">Attack</button></div></div>`;
  canvas.parentElement.append(root);
  const stick = root.querySelector(".touch-stick"),
    thumb = root.querySelector(".touch-stick-thumb");
  function sync() {
    root.hidden = !enabled;
    canvas.parentElement.classList.toggle("touch-game", enabled);
  }
  function reset() {
    state.reset();
    moveId = lookId = previous = undefined;
    dragging = false;
    thumb.style.transform = "";
    for (const button of root.querySelectorAll("button")) {
      button.classList.remove("held");
      if (button.hasAttribute("aria-pressed"))
        button.setAttribute("aria-pressed", "false");
    }
  }
  function enable() {
    if (!enabled) {
      enabled = true;
      reset();
      sync();
    }
  }
  function move(event) {
    const box = stick.getBoundingClientRect(),
      radius = box.width * 0.38;
    state.move(
      (event.clientX - box.x - box.width / 2) / radius,
      (event.clientY - box.y - box.height / 2) / radius,
    );
    thumb.style.transform = `translate(${state.x * 25}px, ${-state.forward * 25}px)`;
  }
  stick.addEventListener("pointerdown", (event) => {
    if (!canPlay() || moveId !== undefined) return;
    event.preventDefault();
    moveId = event.pointerId;
    stick.setPointerCapture(moveId);
    move(event);
  });
  stick.addEventListener("pointermove", (event) => {
    if (event.pointerId === moveId) {
      event.preventDefault();
      move(event);
    }
  });
  function stopMove(event) {
    if (event.pointerId !== moveId) return;
    moveId = undefined;
    state.move(0, 0);
    thumb.style.transform = "";
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    stick.addEventListener(type, stopMove);

  canvas.addEventListener("pointerdown", (event) => {
    if (!canPlay()) return;
    if (event.pointerType === "touch") enable();
    if (!enabled && !allowDrag) return;
    if (lookId !== undefined) return;
    // Touch-look must not synthesize an attack. Mouse fallback still needs its
    // compatibility mousedown/mouseup events for click attacks and held guard.
    if (event.pointerType === "touch") event.preventDefault();
    lookId = event.pointerId;
    previous = { x: event.clientX, y: event.clientY };
    dragging = true;
    canvas.setPointerCapture(lookId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== lookId || !previous) return;
    event.preventDefault();
    state.look(event.clientX - previous.x, event.clientY - previous.y);
    previous = { x: event.clientX, y: event.clientY };
  });
  function stopLook(event) {
    if (event.pointerId !== lookId) return;
    lookId = previous = undefined;
    dragging = false;
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(type, stopLook);

  for (const button of root.querySelectorAll("[data-touch]")) {
    button.addEventListener("pointerdown", (event) => {
      if (!canPlay()) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      button.classList.add("held");
      if (button.dataset.touch === "guard") {
        state.guardDown(event.pointerId);
        button.setAttribute("aria-pressed", "true");
      } else
        ({
          attack: onAttack,
          pickup: onPickup,
          weapon: onWeapon,
          view: onView,
        })[button.dataset.touch]?.();
    });
    const release = (event) => {
      state.release(event.pointerId);
      button.classList.remove("held");
      if (button.dataset.touch === "guard")
        button.setAttribute("aria-pressed", String(state.guard));
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      button.addEventListener(type, release);
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  }
  window.addEventListener("blur", reset);
  window.addEventListener("resize", reset);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reset();
  });
  sync();
  return {
    state,
    reset,
    get enabled() {
      return enabled;
    },
    get dragging() {
      return dragging;
    },
    get mouseDragEnabled() {
      return allowDrag;
    },
    useLockedMouse() {
      allowDrag = false;
    },
    allowMouseDrag() {
      allowDrag = true;
    },
  };
}
