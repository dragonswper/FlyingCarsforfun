import {Simulation} from '../physics.js';
import {appearance} from '../network-protocol.js';
import {arenaName} from '../arenas.js';
import {expansionDialog, uiNode as el} from '../academy/ui.js';
import {validateReplay, ReplayRecorder, REPLAY_BYTES} from './codec.js';
import {ReplayTimeline} from './timeline.js';
import {ReplayStore} from './store.js';
const colours = {
  blue: '#299bff',
  ivory: '#e8efec',
  mint: '#53dbbd',
  violet: '#a985fc',
};
const clock = (time) =>
  `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
export class ReplayStudio {
  constructor(view, settings, hooks) {
    Object.assign(this, {view, settings, hooks});
    this.recorder = new ReplayRecorder();
    this.store = new ReplayStore();
    this.active = false;
    this.cameraKeys = new Set();
    this.generation = 0;
    this.loading = false;
    this.library = expansionDialog(
      'replay-library',
      'Replay Studio',
      '<p class="expansion-description">The latest five saved matches stay on this browser, within a 40 MB budget. Recordings keep up to 15 minutes. Export files to keep them permanently or review them on another device.</p><label class="overdrive-check"><input id="replay-record" type="checkbox"> RECORD MY MATCHES LOCALLY</label><div class="replay-list"></div><p class="replay-status" role="status"></p>',
      '<button type="button" class="replay-import">IMPORT REPLAY</button><button type="button" class="replay-export-current">EXPORT LATEST</button><button type="button" class="replay-library-close">BACK</button>',
    );
    this.library.querySelector('.expansion-kicker').textContent =
      'MATCH FILM · LOCAL STORAGE';
    this.library.querySelector('#replay-record').checked =
      settings.recordReplays !== false;
    this.library.querySelector('#replay-record').onchange = (e) => {
      settings.recordReplays = e.target.checked;
      hooks.save();
    };
    this.library.querySelector('.replay-library-close').onclick = () =>
      this.library.close();
    this.library.addEventListener('close', () => {
      if (this.loading && !this.active && !this.entering) this.generation++;
    });
    this.file = el('input');
    this.file.type = 'file';
    this.file.accept = '.json,application/json';
    this.file.hidden = true;
    this.library.append(this.file);
    this.file.onchange = () => this.import(this.file.files[0]);
    this.library.querySelector('.replay-import').onclick = () =>
      this.file.click();
    this.library.querySelector('.replay-export-current').onclick = () =>
      this.latest
        ? this.export(this.latest)
        : this.status('Finish a recorded match or import a replay first.');
    this.toolbar = el('section', undefined, 'replay-toolbar');
    this.toolbar.id = 'replay-studio-toolbar';
    this.toolbar.hidden = true;
    this.toolbar.innerHTML =
      '<div class="replay-toolbar-heading"><strong>REPLAY STUDIO</strong><span class="replay-time"></span><button type="button" class="replay-close">EXIT REPLAY</button></div><input class="replay-seek" type="range" min="0" max="1" step="0.01" value="0" aria-label="Replay timeline"><div class="replay-toolbar-actions"><button type="button" class="replay-play">PAUSE</button><label>SPEED<select class="replay-speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label><label>CAMERA<select class="replay-camera"><option value="orbit">ORBIT</option><option value="free">FREE CAMERA</option><option value="chase">CHASE CAR</option><option value="wide">WIDE FIELD</option></select></label><label>FOCUS<select class="replay-focus"></select></label><button type="button" class="replay-prev-goal">PREV GOAL</button><button type="button" class="replay-next-goal">NEXT GOAL</button></div><small>Drag the field to orbit · Scroll to zoom · Space pauses · Arrow keys seek · Free camera: WASD / Q / E or controller sticks · Visual replay</small>';
    document.body.append(this.toolbar);
    this.toolbar.querySelector('.replay-close').onclick = () => this.exit();
    this.toolbar.querySelector('.replay-play').onclick = () => {
      this.playing = !this.playing;
      this.render();
    };
    this.toolbar.querySelector('.replay-seek').oninput = (e) =>
      this.seek(Number(e.target.value));
    this.toolbar.querySelector('.replay-speed').onchange = (e) =>
      (this.speed = Number(e.target.value));
    this.toolbar.querySelector('.replay-camera').onchange = (e) =>
      (this.view.replayDirector.mode = e.target.value);
    this.toolbar.querySelector('.replay-focus').onchange = (e) =>
      (this.view.replayDirector.focus =
        e.target.value === 'ball' ? null : Number(e.target.value));
    this.toolbar.querySelector('.replay-next-goal').onclick = () =>
      this.goal(1);
    this.toolbar.querySelector('.replay-prev-goal').onclick = () =>
      this.goal(-1);
    this.entry = el(
      'button',
      'REPLAY STUDIO · REVIEW YOUR MATCHES',
      'academy-entry',
    );
    this.entry.type = 'button';
    this.entry.id = 'replay-studio-button';
    document
      .getElementById('play-screen')
      .insertBefore(this.entry, document.getElementById('play-button'));
    this.entry.onclick = () => this.open();
    this.listeners = [];
    const listen = (o, t, f, opt) => {
      o.addEventListener(t, f, opt);
      this.listeners.push([o, t, f, opt]);
    };
    const canvas = document.getElementById('arena');
    listen(canvas, 'pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.drag = {id: e.pointerId, x: e.clientX, y: e.clientY};
      canvas.setPointerCapture?.(e.pointerId);
    });
    listen(window, 'pointermove', (e) => {
      if (!this.active || this.drag?.id !== e.pointerId) return;
      const d = this.view.replayDirector;
      d.yaw -= (e.clientX - this.drag.x) * 0.005;
      d.pitch = Math.max(
        0.08,
        Math.min(1.35, d.pitch + (e.clientY - this.drag.y) * 0.004),
      );
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    });
    for (const t of ['pointerup', 'pointercancel'])
      listen(window, t, (e) => {
        if (this.drag?.id === e.pointerId) this.drag = null;
      });
    listen(
      canvas,
      'wheel',
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        this.view.replayDirector.distance = Math.max(
          4,
          Math.min(45, this.view.replayDirector.distance + e.deltaY * 0.015),
        );
      },
      {passive: false},
    );
    listen(window, 'keydown', (e) => {
      if (
        !this.active ||
        document.querySelector('dialog[open]') ||
        ['INPUT', 'SELECT'].includes(e.target.tagName)
      )
        return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) {
        e.preventDefault();
        this.cameraKeys.add(e.code);
      }
      if (e.code === 'Space') {
        e.preventDefault();
        this.playing = !this.playing;
      }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        this.seek(this.time + (e.code === 'ArrowRight' ? 5 : -5));
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        this.exit();
      }
    });
    listen(window, 'keyup', (e) => this.cameraKeys.delete(e.code));
    listen(window, 'blur', () => this.cameraKeys.clear());
  }
  status(t) {
    this.library.querySelector('.replay-status').textContent = t;
  }
  async open() {
    if (this.hooks.online()) return;
    this.library.showModal();
    await this.list();
  }
  async list() {
    const target = this.library.querySelector('.replay-list');
    target.replaceChildren();
    try {
      const rows = await this.store.list();
      if (!rows.length)
        target.append(
          el(
            'p',
            'Play a match with recording enabled to start your film library.',
          ),
        );
      for (const row of rows) {
        const clip = row.clip,
          card = el('article', undefined, 'replay-library-row'),
          info = el('div');
        info.append(
          el(
            'strong',
            `${clip.mode.toUpperCase()} · ${clip.score[0]} — ${clip.score[1]}`,
          ),
          el(
            'small',
            `${arenaName(clip.arena)} · ${clock(clip.frames.at(-1).time - clip.frames[0].time)}${clip.truncated ? ' · LAST 15 MIN' : ''}`,
          ),
        );
        card.append(info);
        for (const [label, fn] of [
          ['WATCH', () => this.play(clip)],
          ['EXPORT', () => this.export(clip)],
          [
            'DELETE',
            async () => {
              await this.store.remove(row.id);
              this.list();
            },
          ],
        ]) {
          const button = el('button', label);
          button.type = 'button';
          button.onclick = fn;
          card.append(button);
        }
        target.append(card);
      }
    } catch (e) {
      this.status(e.message);
    }
  }
  startRecording(sim, localLook) {
    if (this.active || this.settings.recordReplays === false) {
      this.recorder.clear();
      return;
    }
    const local = sim.localPlayerId ?? 0;
    const roster = sim.cars.map((c) => {
      const look = appearance(
        c.id === local
          ? localLook
          : {
              body: c.appearance?.body || 'fennec',
              name: c.playerName,
              style: c.appearance?.style,
            },
      );
      return {
        id: c.id,
        team: c.team,
        body: c.appearance?.body || look.body,
        color:
          c.appearance?.color ||
          (c.id === local
            ? colours[look.paint]
            : c.team
              ? '#ff9345'
              : '#299bff'),
        name: c.playerName || look.name,
        style: look.style,
      };
    });
    this.recorder.start(sim, roster);
  }
  capture(snapshot, sim) {
    if (!this.active) this.recorder.capture(snapshot, sim.elapsed);
  }
  event(event, sim) {
    if (!this.active && event.type === 'goal')
      this.recorder.bookmark(
        sim.elapsed,
        (event.team ? 'ORANGE' : 'BLUE') + ' GOAL',
      );
  }
  async finish(sim) {
    if (this.active) return;
    const clip = this.recorder.finish(sim.score);
    if (!clip) return;
    this.latest = clip;
    try {
      await this.store.save(clip);
    } catch (e) {
      this.hooks.notice(e.message);
    }
  }
  async play(raw) {
    if (this.loading || this.hooks.online()) return;
    this.loading = true;
    const token = ++this.generation;
    this.status('Loading the recorded field and vehicles…');
    try {
      const clip = validateReplay(raw),
        world = new Simulation({
          mode: clip.mode,
          arena: clip.arena,
          rules: clip.rules,
          dedicated: true,
          replay: true,
          players: clip.roster,
        });
      world.phase = 'playing';
      world.localPlayerId = clip.roster[0].id;
      for (const c of world.cars) {
        const p = clip.roster.find((p) => p.id === c.id);
        c.playerName = p.name;
        c.appearance = {body: p.body, color: p.color, style: p.style};
      }
      this.entering = true;
      if (
        !(await this.hooks.launch(
          world,
          clip.roster,
          () => token === this.generation && !this.hooks.online(),
        ))
      )
        return;
      this.active = true;
      this.clip = clip;
      this.world = world;
      this.timeline = new ReplayTimeline(clip);
      this.time = 0;
      this.playing = true;
      this.speed = 1;
      this.view.replayDirector = {
        mode: 'orbit',
        focus: null,
        position: {x: 0, y: 8, z: -15},
        yaw: 0.6,
        pitch: 0.45,
        distance: 14,
      };
      this.toolbar.hidden = false;
      this.library.close();
      this.hooks.hideHUD();
      this.toolbar.querySelector('.replay-seek').max = this.timeline.duration;
      const focus = this.toolbar.querySelector('.replay-focus');
      focus.replaceChildren(new Option('BALL', 'ball'));
      for (const p of clip.roster) focus.add(new Option(p.name, String(p.id)));
      this.render();
    } catch (e) {
      this.status(e.message || 'This replay could not load.');
    } finally {
      this.loading = this.entering = false;
    }
  }
  update(dt) {
    if (!this.active) return;
    const pad = Array.from(navigator.getGamepads?.() || []).find(
      (p) => p?.connected,
    );
    if (pad) {
      const d = this.view.replayDirector,
        x = pad.axes[2] || 0,
        y = pad.axes[3] || 0;
      if (Math.abs(x) > 0.15) d.yaw -= x * dt * 2;
      if (Math.abs(y) > 0.15)
        d.pitch = Math.max(0.08, Math.min(1.35, d.pitch + y * dt));
    }
    if (this.playing) {
      this.time = Math.min(this.timeline.duration, this.time + dt * this.speed);
      if (this.time === this.timeline.duration) this.playing = false;
    }
    const d = this.view.replayDirector;
    if (d?.mode === 'free') {
      const held = (code) => (this.cameraKeys.has(code) ? 1 : 0);
      const pad = navigator.getGamepads?.()?.find?.((p) => p?.connected);
      const axis = (i) =>
        Math.abs(pad?.axes[i] || 0) > 0.15 ? pad.axes[i] : 0;
      const forward = held('KeyW') - held('KeyS') - axis(1);
      const right = held('KeyD') - held('KeyA') + axis(0);
      const speed = Math.min(dt, 0.05) * 14;
      d.yaw -= axis(2) * Math.min(dt, 0.05) * 2;
      d.pitch = Math.max(
        -1.35,
        Math.min(1.35, d.pitch + axis(3) * Math.min(dt, 0.05) * 2),
      );
      d.position.x = Math.max(
        -80,
        Math.min(
          80,
          d.position.x +
            (right * Math.cos(d.yaw) - forward * Math.sin(d.yaw)) * speed,
        ),
      );
      d.position.z = Math.max(
        -90,
        Math.min(
          90,
          d.position.z +
            (forward * Math.cos(d.yaw) + right * Math.sin(d.yaw)) * speed,
        ),
      );
      d.position.y = Math.max(
        0.5,
        Math.min(70, d.position.y + (held('KeyE') - held('KeyQ')) * speed),
      );
    }
    this.world.elapsed = this.timeline.start + this.time;
    this.render();
  }
  sample() {
    return this.timeline.sample(this.time);
  }
  render() {
    if (!this.active) return;
    this.toolbar.querySelector('.replay-seek').value = this.time;
    this.toolbar.querySelector('.replay-time').textContent =
      clock(this.time) + ' / ' + clock(this.timeline.duration);
    this.toolbar.querySelector('.replay-play').textContent = this.playing
      ? 'PAUSE'
      : 'PLAY';
  }
  seek(seconds) {
    if (this.active)
      this.time = Math.max(0, Math.min(this.timeline.duration, seconds));
    if (this.view.replayDirector) this.view.replayDirector.snap = true;
    this.render();
  }
  goal(dir) {
    const target =
      dir > 0
        ? this.clip.bookmarks.find(
            (b) => b.time > this.timeline.start + this.time + 2.2,
          )
        : [...this.clip.bookmarks]
            .reverse()
            .find((b) => b.time < this.timeline.start + this.time - 0.2);
    if (target) this.seek(Math.max(0, target.time - this.timeline.start - 2));
  }
  exit() {
    if (!this.active) return;
    this.active = false;
    this.cameraKeys.clear();
    this.generation++;
    this.view.replayDirector = null;
    this.toolbar.hidden = true;
    this.hooks.leave();
    this.open();
  }
  export(clip) {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(clip)], {type: 'application/json'}),
      ),
      a = el('a');
    a.href = url;
    a.download = 'boost-circuit-replay-' + clip.id + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async import(file) {
    if (!file) return;
    try {
      if (file.size > REPLAY_BYTES)
        throw Error('Replay files must be smaller than 16 MB.');
      const clip = validateReplay(JSON.parse(await file.text()));
      this.latest = clip;
      await this.store.save(clip);
      await this.list();
      this.status('Replay imported. Choose Watch to review it.');
    } catch (e) {
      this.status(e.message || 'This replay file could not be read.');
    } finally {
      this.file.value = '';
    }
  }
  state() {
    return {
      active: this.active,
      recording: this.recorder.active,
      time: this.time || 0,
      duration: this.timeline?.duration || 0,
      bookmarks: this.clip?.bookmarks.length || 0,
      camera: this.active
        ? {
            mode: this.view.replayDirector.mode,
            position: {...this.view.replayDirector.position},
          }
        : null,
    };
  }
  dispose() {
    this.generation++;
    for (const [o, t, f, opt] of this.listeners)
      o.removeEventListener(t, f, opt);
    this.library.remove();
    this.toolbar.remove();
  }
}
