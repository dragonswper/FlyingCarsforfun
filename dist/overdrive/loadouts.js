import {BODY_TYPES, BODY_NAMES} from '../bodies.js';
import {garageStyle, WHEEL_COLOURS, DECALS} from '../garage-style.js';
import {clubStyle} from '../club/style.js';
const key = 'boost-circuit.loadouts.v1';
export function cleanLoadouts(raw) {
  return Array.from({length: 5}, (_, index) => {
    const slot = raw?.[index];
    if (
      !slot ||
      !BODY_TYPES.includes(slot.body) ||
      !['blue', 'ivory', 'violet', 'mint'].includes(slot.paint)
    )
      return null;
    return {
      name: [...String(slot.name || 'LOADOUT ' + (index + 1))]
        .filter((c) => c.charCodeAt(0) >= 32 && !['<', '>'].includes(c))
        .slice(0, 24)
        .join(''),
      body: slot.body,
      paint: slot.paint,
      style: garageStyle(slot.style),
      club: clubStyle(slot.club),
    };
  });
}
export class GarageLoadouts {
  constructor(settings, hooks) {
    this.settings = settings;
    this.hooks = hooks;
    try {
      this.slots = cleanLoadouts(JSON.parse(localStorage.getItem(key) || '[]'));
    } catch {
      this.slots = cleanLoadouts([]);
    }
    this.element = document.createElement('section');
    this.element.className = 'garage-loadouts';
    this.element.innerHTML =
      '<h3>FINISH & SAVED LOADOUTS</h3><div class="overdrive-fields"><label>WHEEL FINISH<select id="wheel-finish"></select></label><label>BODY PATTERN<select id="body-decal"></select></label></div><p class="overdrive-note">Patterns apply to paintable bodies. Original fixed finishes keep their artwork.</p><div class="loadout-save"><label>NAME<input id="loadout-name" maxlength="24" placeholder="My loadout"></label><label>SLOT<select id="loadout-slot"></select></label><button type="button" id="loadout-save">SAVE CURRENT</button></div><div class="loadout-list"></div><p id="loadout-status" role="status"></p>';
    document
      .querySelector('#garage-dialog .garage-content')
      .append(this.element);
    const wheels = this.element.querySelector('#wheel-finish'),
      decal = this.element.querySelector('#body-decal');
    for (const [id] of Object.entries(WHEEL_COLOURS))
      wheels.add(new Option(id.toUpperCase(), id));
    for (const [id, name] of Object.entries(DECALS))
      decal.add(new Option(name, id));
    wheels.value = settings.garageStyle.wheels;
    decal.value = settings.garageStyle.decal;
    for (let i = 0; i < 5; i++)
      this.element
        .querySelector('#loadout-slot')
        .add(new Option('SLOT ' + (i + 1), String(i)));
    for (const control of [wheels, decal])
      control.onchange = () =>
        this.apply({
          ...this.current(),
          style: garageStyle({wheels: wheels.value, decal: decal.value}),
        });
    this.element.querySelector('#loadout-save').onclick = () => {
      const i = Number(this.element.querySelector('#loadout-slot').value);
      this.slots[i] = {
        ...this.current(),
        name:
          this.element.querySelector('#loadout-name').value ||
          'LOADOUT ' + (i + 1),
      };
      this.slots = cleanLoadouts(this.slots);
      const saved = this.persist();
      this.render();
      if (saved) this.status('Saved on this browser.');
    };
    this.render();
  }
  current() {
    return {
      body: this.settings.body,
      paint: this.settings.paint,
      style: garageStyle(this.settings.garageStyle),
      club: clubStyle(this.hooks.club()),
    };
  }
  persist() {
    try {
      localStorage.setItem(key, JSON.stringify(this.slots));
      return true;
    } catch {
      this.status(
        'Browser storage is unavailable. This loadout cannot be saved.',
      );
      return false;
    }
  }
  status(t) {
    this.element.querySelector('#loadout-status').textContent = t;
  }
  async apply(slot) {
    this.status('Preparing your vehicle…');
    try {
      await this.hooks.apply(slot);
      this.element.querySelector('#wheel-finish').value =
        this.settings.garageStyle.wheels;
      this.element.querySelector('#body-decal').value =
        this.settings.garageStyle.decal;
      this.status('Loadout applied.');
    } catch {
      this.status('This vehicle could not load. Try again.');
    }
  }
  render() {
    const list = this.element.querySelector('.loadout-list');
    list.replaceChildren();
    for (let i = 0; i < 5; i++) {
      const slot = this.slots[i],
        row = document.createElement('div');
      row.className = 'loadout-row';
      const title = document.createElement('strong');
      title.textContent = slot
        ? `${slot.name} · ${BODY_NAMES[slot.body]}`
        : `SLOT ${i + 1} · EMPTY`;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'EQUIP';
      button.disabled = !slot;
      button.dataset.loadout = String(i);
      button.onclick = () => this.apply(slot);
      row.append(title, button);
      list.append(row);
    }
  }
}
