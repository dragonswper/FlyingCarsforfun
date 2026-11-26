import {Simulation} from '../physics.js';
import {expansionDialog, uiNode as el} from '../academy/ui.js';
import {ArcadeDirector} from './arcade.js';
const storage = 'boost-circuit.arcade.v1';
export class ArcadeUI {
  constructor(view, hooks) {
    this.view = view;
    this.hooks = hooks;
    this.director = null;
    this.generation = 0;
    this.launching = false;
    try {
      this.records = JSON.parse(localStorage.getItem(storage) || '{}');
    } catch {
      this.records = {};
    }
    this.dialog = expansionDialog(
      'arcade-dialog',
      'Change the game',
      '<p class="expansion-description">Original modes and Blender venues. Hoops is also available in dedicated-server matchmaking and private lobbies. Target shooting and the obstacle course are solo challenges.</p><div class="overdrive-mode-cards"></div><p class="arcade-status" role="status"></p>',
      '<button type="button" class="arcade-back">BACK</button>',
    );
    this.dialog.querySelector('.expansion-kicker').textContent =
      'OVERDRIVE · NEW MODES';
    this.dialog.querySelector('.arcade-back').onclick = () =>
      this.dialog.close();
    this.dialog.addEventListener('close', () => {
      if (this.launching) this.generation++;
    });
    const list = this.dialog.querySelector('.overdrive-mode-cards');
    for (const [id, title, desc] of [
      [
        'hoops',
        'SKYLINE HOOPS',
        '2v2 car basketball. Drop the ball through the elevated ring.',
      ],
      [
        'targets',
        'FOUNDRY TARGET RANGE',
        'Hit eight elevated targets before the 90-second clock expires.',
      ],
      [
        'course',
        'VELOCITY OBSTACLE COURSE',
        'Beat eight gates and jump real hurdles. Each contact adds a two-second penalty.',
      ],
    ]) {
      const b = el('button');
      b.type = 'button';
      b.dataset.arcade = id;
      b.append(el('strong', title), el('span', desc));
      b.onclick = () => this.launch(id);
      list.append(b);
    }
    this.result = expansionDialog(
      'arcade-result',
      'Challenge complete',
      '<p class="arcade-score"></p><p class="arcade-record"></p>',
      '<button type="button" class="arcade-retry primary">RETRY</button><button type="button" class="arcade-exit">MODES</button>',
    );
    this.result.querySelector('.expansion-kicker').textContent =
      'SOLO CHALLENGE';
    this.result.querySelector('.arcade-retry').onclick = () => this.retry();
    this.result.querySelector('.arcade-exit').onclick = () => this.exit();
    this.result.addEventListener('close', () => {
      if (this.active && this.director.status === 'result') this.exit();
    });
    this.entry = el(
      'button',
      'OVERDRIVE MODES · HOOPS / TARGETS / COURSE',
      'academy-entry',
    );
    this.entry.type = 'button';
    this.entry.id = 'overdrive-modes';
    document
      .getElementById('play-screen')
      .insertBefore(this.entry, document.getElementById('cup-button'));
    this.entry.onclick = () => this.open();
    this.hud = el('div', undefined, 'academy-hud arcade-hud');
    this.hud.id = 'arcade-hud';
    this.hud.hidden = true;
    this.hud.innerHTML = '<strong></strong><span></span><small></small>';
    document.getElementById('hud').append(this.hud);
  }
  get active() {
    return !!this.director;
  }
  open() {
    if (this.hooks.online()) return;
    this.dialog.showModal();
  }
  async launch(mode) {
    if (this.launching || this.hooks.online()) return;
    this.launching = true;
    const token = ++this.generation;
    this.dialog.setAttribute('aria-busy', 'true');
    this.dialog.querySelector('.arcade-status').textContent =
      'Preparing the original venue…';
    try {
      const sim = new Simulation({
        mode: mode === 'hoops' ? 'hoops' : 'free',
        arcade: mode === 'hoops' ? undefined : mode,
        arena:
          mode === 'hoops'
            ? 'skyline'
            : mode === 'course'
              ? 'velocity'
              : 'range',
        duration: this.hooks.settings.duration,
        difficulty: this.hooks.settings.difficulty,
        botStyle: this.hooks.settings.botStyle,
      });
      if (
        !(await this.hooks.launch(
          sim,
          () => token === this.generation && !this.hooks.online(),
        ))
      )
        return;
      if (mode !== 'hoops') {
        this.director = new ArcadeDirector(sim, mode);
        this.view.arcadeDirector = this.director;
        if (mode === 'course') this.hooks.carCamera();
      }
      this.launching = false;
      this.dialog.close();
      this.hooks.resetView();
      this.renderHUD();
    } catch {
      this.dialog.querySelector('.arcade-status').textContent =
        'This venue could not load. Try again.';
    } finally {
      this.launching = false;
      this.dialog.removeAttribute('aria-busy');
    }
  }
  worldChanged(world) {
    if (this.director?.sim !== world) {
      this.director = null;
      this.view.arcadeDirector = null;
      this.hud.hidden = true;
    }
  }
  clear() {
    this.generation++;
    this.director = null;
    this.view.arcadeDirector = null;
    this.hud.hidden = true;
    this.result.close();
  }
  canStep() {
    return !this.active || this.director.status === 'running';
  }
  step(dt) {
    if (!this.active) return;
    this.director.step(dt);
    if (this.director.status === 'result' && !this.result.open) {
      const s = this.director.state(),
        old = Number(this.records[s.mode]) || 0;
      this.records[s.mode] = Math.max(old, s.points);
      try {
        localStorage.setItem(storage, JSON.stringify(this.records));
      } catch {}
      this.result.querySelector('h2').textContent = s.completed
        ? 'CHALLENGE COMPLETE'
        : 'TIME UP';
      this.result.querySelector('.arcade-score').textContent =
        `${s.points.toLocaleString()} POINTS · ${s.index} / ${s.total} ${s.mode === 'course' ? 'GATES' : 'TARGETS'}`;
      this.result.querySelector('.arcade-record').textContent =
        `BEST ${this.records[s.mode].toLocaleString()} · ${s.time.toFixed(2)}s${s.penalty ? ' + ' + s.penalty + 's PENALTY' : ''}`;
      this.hooks.clearInput();
      this.result.showModal();
    }
  }
  renderHUD() {
    this.hud.hidden = !this.active;
    if (!this.active) return;
    const s = this.director.state();
    const hint=document.querySelector('#practice-tools > span');if(hint?.lastChild)hint.lastChild.textContent=s.mode==='course'?' TO RETRY COURSE':' TO RESET SHOT';
    document.getElementById('end-practice-button').textContent='EXIT CHALLENGE';
    this.hud.querySelector('strong').textContent =
      s.mode === 'course' ? 'VELOCITY COURSE' : 'FOUNDRY TARGET RANGE';
    this.hud.querySelector('span').textContent =
      `${s.points} PTS · ${s.index} / ${s.total} · ${Math.ceil(s.remaining)}s`;
    this.hud.querySelector('small').textContent =
      s.mode === 'course'
        ? 'Follow the gold ring. Jump the orange hurdles. R retries.'
        : 'Drive into the ball and hit the gold target. R resets your shot.';
    document.getElementById('clock').textContent = Math.ceil(s.remaining) + 's';
  }
  action(name) {
    if (!this.active) return false;
    if (name === 'reset') {
      if (this.director.mode === 'course') this.retry();
      else {
        this.director.resetBall();
        this.hooks.resetView();
      }
      return true;
    }
    return false;
  }
  retry() {
    if (!this.active) return;
    this.director.restart();
    this.result.close();
    this.hooks.resetView();
    this.hooks.resume();
  }
  exit() {
    this.clear();
    this.hooks.leave();
    this.open();
  }
  state() {
    return this.director?.state() ?? null;
  }
  dispose() {
    this.clear();
    this.dialog.remove();
    this.result.remove();
    this.hud.remove();
  }
}
