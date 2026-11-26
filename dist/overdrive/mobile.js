import {expansionDialog} from '../academy/ui.js';
import {touchPreferences} from '../touch-controls.js';
import {PAD_BUTTONS} from '../gamepad-preferences.js';
export const MOBILE_PRESETS = Object.freeze({
  battery: {
    name: 'BATTERY SAVER',
    quality: 'mobile',
    rendering: {
      resolutionScale: 60,
      frameLimit: 30,
      shadows: 'off',
      grass: 'off',
      lighting: 'basic',
    },
  },
  balanced: {
    name: 'BALANCED MOBILE',
    quality: 'mobile',
    rendering: {
      resolutionScale: 85,
      frameLimit: 60,
      shadows: 'off',
      grass: 'off',
      lighting: 'basic',
    },
  },
  quality: {
    name: 'SHARP MOBILE',
    quality: 'balanced',
    rendering: {
      resolutionScale: 100,
      frameLimit: 60,
      shadows: 'preset',
      grass: 'low',
      lighting: 'preset',
    },
  },
});
export class MobileOptions {
  constructor(settings, hooks) {
    this.settings = settings;
    this.hooks = hooks;
    this.element = document.createElement('section');
    this.element.className = 'overdrive-mobile';
    this.element.innerHTML =
      '<h3>THUMB CONTROL & MOBILE PERFORMANCE</h3><div class="overdrive-fields"><label>STEERING SENSITIVITY<input id="touch-sensitivity" type="range" min="0.5" max="2" step="0.05"><output></output></label><label>JOYSTICK DEAD ZONE<input id="touch-deadzone" type="range" min="0.02" max="0.3" step="0.01"><output></output></label><label class="overdrive-check"><input id="touch-floating" type="checkbox"> ANCHOR JOYSTICK AT THUMB TOUCH</label></div><p class="overdrive-note">The floating anchor works inside your steering pad. Your HUD layout and other fingers keep their own controls.</p><div class="mobile-preset-buttons"></div><p class="overdrive-note">Battery Saver caps rendering at 30 FPS. Balanced and Sharp target 60; actual frame rate depends on your phone. Online physics stays at 120 Hz.</p><h3>CONTROLLER PROMPTS</h3><label>PROMPT STYLE<select id="prompt-family"><option value="auto">AUTO DETECT</option><option value="xbox">XBOX</option><option value="playstation">PLAYSTATION</option></select></label><div class="controller-legend"></div>';
    this.dialog = expansionDialog(
      'mobile-tuning-dialog',
      'Tune your controls',
      '',
      '<button type="button" class="mobile-tuning-back">BACK TO OPTIONS</button>',
    );
    this.dialog.querySelector('.expansion-kicker').textContent =
      'MOBILE & CONTROLLER';
    this.dialog.querySelector('.expansion-body').append(this.element);
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.id = 'mobile-tuning-button';
    entry.textContent = 'MOBILE PERFORMANCE & THUMB CONTROLS';
    document.getElementById('panel-controls').append(entry);
    entry.onclick = () => {
      this.legend();
      this.dialog.showModal();
    };
    this.dialog.querySelector('.mobile-tuning-back').onclick = () =>
      this.dialog.close();
    for (const [field, id] of [
      ['sensitivity', 'touch-sensitivity'],
      ['deadzone', 'touch-deadzone'],
    ]) {
      const input = this.element.querySelector('#' + id);
      input.value = settings.touch[field];
      const output = input.parentNode.querySelector('output');
      output.textContent = String(settings.touch[field]);
      input.oninput = () => {
        settings.touch = touchPreferences({
          ...settings.touch,
          [field]: Number(input.value),
        });
        output.textContent = input.value;
        hooks.touch(settings.touch);
        hooks.save();
      };
    }
    const floating = this.element.querySelector('#touch-floating');
    floating.checked = settings.touch.floating;
    floating.onchange = () => {
      settings.touch = touchPreferences({
        ...settings.touch,
        floating: floating.checked,
      });
      hooks.touch(settings.touch);
      hooks.save();
    };
    const buttons = this.element.querySelector('.mobile-preset-buttons');
    for (const [id, preset] of Object.entries(MOBILE_PRESETS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = preset.name;
      b.dataset.mobilePreset = id;
      b.onclick = () => hooks.preset(preset);
      buttons.append(b);
    }
    const family = this.element.querySelector('#prompt-family');
    family.value = ['xbox', 'playstation'].includes(settings.promptFamily)
      ? settings.promptFamily
      : 'auto';
    family.onchange = () => {
      settings.promptFamily = family.value;
      hooks.prompts(family.value);
      hooks.save();
      this.legend();
    };
    this.legend();
    document
      .getElementById('settings-dialog')
      .addEventListener('toggle', () => this.legend());
  }
  legend() {
    const family =
        this.settings.promptFamily === 'auto'
          ? this.hooks.family()
          : this.settings.promptFamily === 'playstation'
            ? 'PLAYSTATION'
            : 'XBOX',
      list = this.element.querySelector('.controller-legend');
    list.replaceChildren();
    for (const [key, label] of [
      ['jump', 'JUMP / FLIP'],
      ['boost', 'BOOST'],
      ['drift', 'POWERSLIDE'],
      ['camera', 'BALL CAM'],
      ['chat', 'CHAT'],
    ]) {
      const row = document.createElement('div');
      row.textContent =
        label +
        ' · ' +
        ((PAD_BUTTONS[this.settings.gamepad.buttons[key]] || 'UNBOUND').split(
          ' / ',
        )[family === 'PLAYSTATION' ? 1 : 0] || 'UNBOUND');
      list.append(row);
    }
  }
}
