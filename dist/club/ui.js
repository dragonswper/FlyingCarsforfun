import {Simulation} from '../physics.js';
import {arenaName} from '../arenas.js';
import {expansionDialog, uiNode as el} from '../academy/ui.js';
import {academyProgress} from '../academy/director.js';
import {Career, ACHIEVEMENTS, dailyTasks} from './career.js';
import {
  createCup,
  restoreCup,
  cupFixture,
  finishCupRound,
  CUP_STAGES,
} from './cup.js';
import {
  clubStyle,
  BOOST_STYLES,
  GOAL_STYLES,
  TITLES,
  BANNERS,
  ClubEffects,
} from './style.js';
import {ClubTrophy} from './trophy.js';
const key = 'boost-circuit.club.v1',
  academyKey = 'boost-circuit.academy.v1';
function read(k) {
  try {
    return JSON.parse(localStorage.getItem(k) || '{}');
  } catch {
    return {};
  }
}
export class Clubhouse {
  constructor(view, settings, hooks) {
    Object.assign(this, {view, settings, hooks});
    const raw = read(key);
    this.career = new Career(raw.career, settings);
    this.cup = restoreCup(raw.cup);
    this.style = clubStyle(raw.style);
    this.effects = new ClubEffects(view);
    this.trophy = new ClubTrophy(view.scene);
    this.generation = 0;
    this.launching = false;
    this.currentWorld = null;
    this.careerDialog = expansionDialog(
      'club-career',
      'Your circuit',
      '<div class="club-level"></div><div class="club-tabs" role="group" aria-label="Career sections"><button type="button" data-club-tab="stats">OVERVIEW</button><button type="button" data-club-tab="daily">DAILY CHALLENGES</button><button type="button" data-club-tab="milestones">MILESTONES</button><button type="button" data-club-tab="style">STYLE</button></div><div class="club-content"></div><p class="club-status" role="status"></p>',
      '<button type="button" class="club-export">EXPORT SAVE</button><button type="button" class="club-import">IMPORT SAVE</button><button type="button" class="club-close primary">BACK</button>',
    );
    this.careerDialog.querySelector('.expansion-kicker').textContent =
      'CLUBHOUSE · SAVED ON THIS DEVICE';
    this.tab = 'stats';
    this.careerDialog.querySelectorAll('[data-club-tab]').forEach(
      (b) =>
        (b.onclick = () => {
          this.tab = b.dataset.clubTab;
          this.renderCareer();
        }),
    );
    this.careerDialog.querySelector('.club-close').onclick = () =>
      this.careerDialog.close();
    this.careerDialog.querySelector('.club-export').onclick = () =>
      this.exportSave();
    this.careerDialog.querySelector('.club-import').onclick = () =>
      this.importFile.click();
    this.importFile = el('input');
    this.importFile.type = 'file';
    this.importFile.accept = 'application/json,.json';
    this.importFile.hidden = true;
    this.careerDialog.append(this.importFile);
    this.importFile.onchange = () => this.importSave(this.importFile.files[0]);
    this.cupDialog = expansionDialog(
      'cup-dialog',
      'Circuit Cup',
      '<p class="expansion-description">An offline eight-car knockout. Your three matches are played in full; the other bracket fixtures are simulated results. Difficulty rises each round. Win the final to earn the original Circuit Cup trophy.</p><div class="cup-options"><label>DIVISION<select id="cup-tier"><option value="club">CLUB · ROOKIE → ALL-STAR</option><option value="elite">ELITE · PRO → EXPERT</option></select></label><label>MATCH LENGTH<select id="cup-duration"><option value="120">2 MINUTES</option><option value="300">5 MINUTES</option></select></label></div><div class="cup-bracket"></div><p class="cup-status" role="status"></p>',
      '<button type="button" class="cup-new">NEW CUP</button><button type="button" class="cup-play primary">START CUP</button><button type="button" class="cup-close">BACK</button>',
    );
    this.cupDialog.querySelector('.expansion-kicker').textContent =
      'CIRCUIT CUP · SOLO TOURNAMENT';
    this.cupDialog.querySelector('.cup-new').onclick = () => this.newCup();
    this.cupDialog.querySelector('.cup-play').onclick = () => this.playCup();
    this.cupDialog.querySelector('.cup-close').onclick = () =>
      this.cupDialog.close();
    this.cupDialog.addEventListener('close', () => {
      if (this.launching) {
        this.generation++;
        this.launching = false;
        this.cupDialog.removeAttribute('aria-busy');
      }
      if (
        this.hooks.isPlaying() &&
        this.isCup() &&
        this.hooks.getSim().phase !== 'ended'
      )
        this.hooks.resume();
    });
    this.cupButton = el('button', 'CIRCUIT CUP · KNOCKOUT', 'academy-entry');
    this.cupButton.id = 'cup-button';
    this.cupButton.type = 'button';
    document
      .getElementById('play-screen')
      .insertBefore(this.cupButton, document.getElementById('academy-button'));
    this.cupButton.onclick = () => this.openCup();
    this.resultButton = el('button', 'VIEW CUP BRACKET', 'secondary');
    this.resultButton.id = 'result-cup';
    this.resultButton.type = 'button';
    this.resultButton.hidden = true;
    document.getElementById('result-dialog').append(this.resultButton);
    this.resultButton.onclick = () => this.openCup();
    this.hud = el('div', undefined, 'cup-hud');
    this.hud.id = 'cup-hud';
    this.hud.hidden = true;
    document.getElementById('hud').append(this.hud);
    this.title = el('small', undefined, 'club-title');
    this.title.id = 'club-player-title';
    document.querySelector('.profile-info').append(this.title);
    this.syncAcademy();
    this.applyStyle();
    this.persist();
    if (this.career.data.totals.cups > 0) this.trophy.prepare().catch(() => {});
  }
  persist() {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          career: this.career.data,
          cup: this.cup,
          style: this.style,
        }),
      );
    } catch {}
  }
  reward(r) {
    if (r.xp) {
      this.settings.xp = Math.min(1e9, this.settings.xp + r.xp);
      this.hooks.save();
    }
    this.persist();
    return r;
  }
  syncAcademy(progress = academyProgress(read(academyKey))) {
    return this.reward(this.career.syncAcademy(progress));
  }
  openCareer() {
    this.syncAcademy();
    this.career.refreshDay();
    this.renderCareer();
    this.careerDialog.showModal();
  }
  renderCareer() {
    const data = this.career.data,
      t = data.totals,
      level = Math.floor(this.settings.xp / 1000) + 1;
    this.careerDialog.querySelector('.club-level').textContent =
      `LEVEL ${level} · ${Math.floor(this.settings.xp).toLocaleString()} XP · ${TITLES[this.style.title].name}`;
    this.careerDialog
      .querySelectorAll('[data-club-tab]')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(b.dataset.clubTab === this.tab)),
      );
    const body = this.careerDialog.querySelector('.club-content');
    body.replaceChildren();
    if (this.tab === 'stats') {
      const stats = el('div', undefined, 'club-stats');
      for (const [label, value] of [
        ['MATCHES', t.matches],
        ['VICTORIES', t.wins],
        ['GOALS', t.goals],
        ['SAVES', t.saves],
        ['ASSISTS', t.assists],
        ['CUP WINS', t.cups],
        ['ACADEMY MEDALS', `${t.drills} / 24`],
        ['BEST WIN STREAK', t.bestStreak],
      ]) {
        const card = el('div');
        card.append(el('strong', String(value)), el('small', label));
        stats.append(card);
      }
      body.append(stats);
      body.append(el('h3', 'BY MODE'));
      for (const [mode, row] of Object.entries(data.modes)) {
        const r = el('div', undefined, 'club-row');
        r.append(
          el('strong', mode.toUpperCase()),
          el(
            'span',
            `${row.matches} played · ${row.wins} wins · ${row.goals} goals`,
          ),
        );
        body.append(r);
      }
      if (
        Array.isArray(this.settings.history) &&
        this.settings.history.length
      ) {
        body.append(el('h3', 'RECENT RESULTS'));
        for (const match of this.settings.history.slice(0, 8)) {
          const row = el('div', undefined, 'club-row');
          row.append(
            el(
              'strong',
              (match.won ? 'WIN' : 'LOSS') +
                ' · ' +
                String(match.mode || 'MATCH').toUpperCase(),
            ),
            el(
              'span',
              `${Math.max(0, Number(match.blue) || 0)} — ${Math.max(0, Number(match.orange) || 0)}`,
            ),
          );
          body.append(row);
        }
      }
      body.append(
        el(
          'p',
          'Earlier saves contribute existing match/win/goal totals. Per-mode, save and assist records begin with this update.',
          'expansion-description',
        ),
      );
    }
    if (this.tab === 'daily') {
      body.append(
        el(
          'p',
          `Resets at your device’s local midnight · ${data.daily.day}. Matches against bots and real players both count.`,
          'expansion-description',
        ),
      );
      for (const task of dailyTasks(data.daily.day))
        this.progressCard(
          body,
          task.name,
          `${task.xp} XP · ${data.daily.claimed.includes(task.id) ? 'COMPLETED' : 'IN PROGRESS'}`,
          data.daily.progress[task.id] || 0,
          task.target,
        );
    }
    if (this.tab === 'milestones')
      for (const a of ACHIEVEMENTS)
        this.progressCard(
          body,
          a.name,
          `${a.description} · ${a.xp} XP${data.earned.includes(a.id) ? ' · UNLOCKED' : ''}`,
          t[a.stat],
          a.target,
        );
    if (this.tab === 'style') {
      body.append(
        el(
          'p',
          'Cosmetics affect your view only. They do not change your car’s physics, and are not sent as competitive rankings.',
          'expansion-description',
        ),
      );
      for (const [field, label, options] of [
        ['boost', 'BOOST COLOUR', BOOST_STYLES],
        ['goal', 'GOAL CELEBRATION', GOAL_STYLES],
        ['banner', 'PROFILE BANNER', BANNERS],
        ['title', 'PLAYER TITLE', TITLES],
      ]) {
        const l = el('label', label, 'club-style-field'),
          s = el('select');
        s.id = 'club-style-' + field;
        s.setAttribute('aria-label', label);
        for (const [id, option] of Object.entries(options)) {
          const o = el(
            'option',
            typeof option === 'string' ? option : option.name,
          );
          o.value = id;
          o.disabled =
            !!option.achievement && !data.earned.includes(option.achievement);
          if (o.disabled) o.textContent += ' · LOCKED';
          s.append(o);
        }
        s.value = this.style[field];
        s.onchange = () => {
          this.style[field] = s.value;
          this.applyStyle();
          this.persist();
          this.renderCareer();
        };
        l.append(s);
        body.append(l);
      }
    }
  }
  progressCard(body, name, description, value, target) {
    const row = el('section', undefined, 'club-progress');
    row.append(el('h3', name), el('p', description));
    const progress = el('progress');
    progress.max = target;
    progress.value = Math.min(target, value);
    progress.setAttribute('aria-label', name);
    row.append(progress, el('small', `${Math.min(target, value)} / ${target}`));
    body.append(row);
  }
  applyStyle() {
    if (
      TITLES[this.style.title].achievement &&
      !this.career.data.earned.includes(TITLES[this.style.title].achievement)
    )
      this.style.title = 'driver';
    this.title.textContent = TITLES[this.style.title].name;
    document
      .querySelector('.profile')
      .style.setProperty('--club-banner', BANNERS[this.style.banner].color);
    this.effects.apply(this.hooks.localId(), this.style);
  }
  openCup() {
    if (this.hooks.isOnline()) {
      this.hooks.notice(
        'Leave the online match to enter the solo Circuit Cup.',
      );
      return;
    }
    if (this.isCup() && this.hooks.getSim().phase !== 'ended')
      this.hooks.pause();
    this.renderCup();
    if (!this.cupDialog.open) this.cupDialog.showModal();
  }
  newCup() {
    if (this.launching) return;
    this.cup = createCup({
      name: this.settings.username,
      duration: Number(document.getElementById('cup-duration').value),
      tier: document.getElementById('cup-tier').value,
    });
    this.persist();
    this.renderCup();
  }
  renderCup() {
    const c = this.cup,
      list = this.cupDialog.querySelector('.cup-bracket'),
      status = this.cupDialog.querySelector('.cup-status'),
      play = this.cupDialog.querySelector('.cup-play');
    list.replaceChildren();
    this.cupDialog.querySelector('.cup-new').hidden = !c;
    play.hidden = false;
    if (!c) {
      status.textContent =
        'Create your bracket and start the quarter-final. The bracket is saved between rounds.';
      play.textContent = 'START CUP';
      play.disabled = false;
      return;
    }
    document.getElementById('cup-duration').value = c.duration;
    document.getElementById('cup-tier').value = c.tier;
    for (let r = 0; r < 3; r++) {
      const col = el('section', undefined, 'cup-round');
      col.append(el('h3', CUP_STAGES[r]));
      if (!c.rounds[r].length) col.append(el('p', 'Awaiting qualifiers'));
      for (const game of c.rounds[r]) {
        const card = el('div', undefined, 'cup-game');
        for (const [team, score] of [
          [game.a, game.blue],
          [game.b, game.orange],
        ]) {
          const line = el('div');
          line.classList.toggle('cup-winner', game.winner === team);
          line.append(
            el('span', team),
            el('strong', score === null ? '—' : String(score)),
          );
          card.append(line);
        }
        col.append(card);
      }
      list.append(col);
    }
    const fixture = cupFixture(c);
    status.textContent =
      c.status === 'champion'
        ? 'CUP CHAMPION · Your trophy is on display in the solo showroom.'
        : c.status === 'eliminated'
          ? 'Eliminated. Your results are saved; start a new Cup to try again.'
          : `${fixture.stage} · ${arenaName(fixture.arena)} · ${fixture.difficulty.toUpperCase()} · Saved between rounds. Leaving a match restarts that fixture.`;
    play.hidden = ['champion', 'eliminated'].includes(c.status);
    play.disabled = this.launching;
    play.textContent =
      c.status === 'playing'
        ? 'RETURN TO MATCH'
        : 'PLAY ' + CUP_STAGES[c.round];
  }
  isCup(sim = this.hooks.getSim()) {
    return !!(
      this.cup &&
      sim?.options.cupId === this.cup.id &&
      sim === this.currentWorld
    );
  }
  async playCup() {
    if (this.launching || this.hooks.isOnline()) return;
    if (!this.cup) this.newCup();
    if (['champion', 'eliminated'].includes(this.cup.status)) return;
    if (
      this.cup.status === 'playing' &&
      this.isCup() &&
      this.hooks.getSim().phase !== 'ended'
    ) {
      this.cupDialog.close();
      this.hooks.resume();
      return;
    }
    this.launching = true;
    const token = ++this.generation,
      cup = this.cup;
    this.cupDialog.setAttribute('aria-busy', 'true');
    this.cupDialog.querySelector('.cup-play').disabled = true;
    this.cupDialog.querySelector('.cup-status').textContent =
      'Preparing the next field…';
    try {
      const options = cupFixture(cup),
        world = new Simulation(options);
      world.cars[1].playerName = options.opponent;
      const current = () =>
        token === this.generation && this.cup === cup && !this.hooks.isOnline();
      if (!(await this.hooks.launch(world, current)) || !current()) return;
      this.currentWorld = world;
      cup.status = 'playing';
      this.persist();
      this.launching = false;
      this.cupDialog.close();
      this.renderWorld(world);
    } catch {
      this.cupDialog.querySelector('.cup-status').textContent =
        'The field could not load. Try again.';
    } finally {
      this.launching = false;
      this.cupDialog.removeAttribute('aria-busy');
      this.cupDialog.querySelector('.cup-play').disabled = false;
    }
  }
  worldChanged(world) {
    if (this.launching && world.options.cupId !== this.cup?.id)
      this.generation++;
    if (world !== this.currentWorld && this.cup?.status === 'playing') {
      this.cup.status = 'ready';
      this.persist();
    }
    this.renderWorld(world);
  }
  renderWorld(world) {
    document.getElementById('rematch-button').hidden = this.isCup(world);
    this.resultButton.hidden = !this.isCup(world);
    this.hud.hidden = !this.isCup(world);
    if (this.isCup(world))
      this.hud.textContent =
        'CIRCUIT CUP · ' + CUP_STAGES[world.options.cupRound];
  }
  leaveWorld() {
    this.generation++;
    if (this.cup?.status === 'playing') {
      this.cup.status = 'ready';
      this.persist();
    }
    this.currentWorld = null;
    this.hud.hidden = true;
  }
  matchResult(sim, player, {online = false, won = false, id} = {}) {
    if (
      sim.phase !== 'ended' ||
      !player ||
      !['duel', 'doubles', 'custom','hoops'].includes(sim.options.mode)
    )
      return {xp: 0, unlocked: []};
    const cupWorld = this.isCup(sim),
      record = this.career.recordMatch({
        id: cupWorld ? `${this.cup.id}:${sim.options.cupRound}` : id,
        mode: sim.options.mode,
        won,
        goals: player.goals,
        touches: player.touches,
        saves: player.saves,
        shots: player.shots,
        assists: player.assists,
        demos: player.demos,
        points: player.score,
        conceded: sim.score[1 - player.team],
        overtime: sim.overtime,
      });
    if (cupWorld && finishCupRound(this.cup, sim.score[0], sim.score[1])) {
      if (this.cup.status === 'champion') {
        const bonus = this.career.recordCup(this.cup.id);
        record.xp += bonus.xp;
        record.unlocked.push(...bonus.unlocked);
        this.trophy.prepare().catch(() => {});
      }
      this.resultButton.hidden = false;
    }
    this.reward(record);
    this.applyStyle();
    return record;
  }
  draw(playing) {
    this.effects.apply(this.hooks.localId(), this.style);
    this.trophy.update(
      !playing && !this.view.showroom && this.career.data.totals.cups > 0,
    );
  }
  goal(event, sim) {
    this.effects.goal(event, sim, this.hooks.localId(), this.style);
  }
  exportSave() {
    const data = {
      format: 'boost-circuit-career',
      version: 1,
      club: {career: this.career.data, cup: this.cup, style: this.style},
      academy: academyProgress(read(academyKey)),
      stats: Object.fromEntries(
        ['xp', 'matches', 'wins', 'goals', 'touches'].map((k) => [
          k,
          this.settings[k],
        ]),
      ),
    };
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}),
      ),
      a = el('a');
    a.href = url;
    a.download = 'boost-circuit-save.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.careerDialog.querySelector('.club-status').textContent =
      'Backup downloaded. It contains game progress only, without connection credentials.';
  }
  async importSave(file) {
    if (!file) return;
    const status = this.careerDialog.querySelector('.club-status');
    try {
      if (this.hooks.isPlaying())
        throw Error('Return to the main menu before importing progress.');
      if (file.size > 262144) throw Error('That save is too large.');
      const data = JSON.parse(await file.text());
      if (
        data.format !== 'boost-circuit-career' ||
        data.version !== 1 ||
        !data.club?.career ||
        !data.academy ||
        !data.stats
      )
        throw Error('Choose a Boost Circuit career backup.');
      this.career = new Career(data.club.career);
      this.cup = restoreCup(data.club.cup);
      this.style = clubStyle(data.club.style);
      const progress = academyProgress(data.academy);
      localStorage.setItem(academyKey, JSON.stringify(progress));
      this.hooks.restoreAcademy(progress);
      for (const k of ['xp', 'matches', 'wins', 'goals', 'touches'])
        if (Number.isFinite(data.stats[k]) && data.stats[k] >= 0)
          this.settings[k] = Math.min(1e9, Math.floor(data.stats[k]));
      this.hooks.save();
      this.persist();
      this.applyStyle();
      if (this.career.data.totals.cups > 0)
        this.trophy.prepare().catch(() => {});
      this.renderCareer();
      status.textContent =
        'Progress restored. Your controls, name, audio settings and connections were kept.';
    } catch (e) {
      status.textContent = e.message || 'This save could not be restored.';
    } finally {
      this.importFile.value = '';
    }
  }
  state() {
    return {
      cup: this.cup
        ? {
            id: this.cup.id,
            round: this.cup.round,
            status: this.cup.status,
            arenas: this.cup.arenas,
          }
        : null,
      career: this.career.data,
      style: this.style,
      presentation: {
        trophyLoaded: !!this.trophy.root,
        trophyVisible: !!this.trophy.root?.visible,
      },
    };
  }
  dispose() {
    this.generation++;
    this.trophy.dispose();
    this.careerDialog.remove();
    this.cupDialog.remove();
    this.hud.remove();
    this.title.remove();
  }
}
