import assert from 'node:assert/strict';
import test from 'node:test';
import { CombatTuning } from '../src/combat.js';
import { createSwingAudio } from '../src/swing-audio.js';

test('combat swooshes increase playback pitch with sampled velocity', (t) => {
  const original = globalThis.AudioContext;
  t.after(() => { globalThis.AudioContext = original; });
  const rates = [];
  const connect = (next) => next;
  const disconnect = () => {};
  globalThis.AudioContext = class {
    state = 'running';
    sampleRate = 4000;
    destination = {};
    createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    createBufferSource() {
      return { connect, disconnect, playbackRate: { value: 1 }, start() { rates.push(this.playbackRate.value); } };
    }
    createBiquadFilter() { return { connect, disconnect, frequency: {}, Q: {} }; }
    createGain() { return { connect, disconnect, gain: {} }; }
  };

  const audio = createSwingAudio();
  audio.unlock();
  audio.play(CombatTuning.MinFlickVelocity);
  audio.play(CombatTuning.MinFlickVelocity * 2.2);
  assert.equal(rates.length, 2);
  assert.ok(rates[1] > rates[0]);
  audio.setVolume(0);
  audio.play(CombatTuning.MinFlickVelocity * 3);
  assert.equal(rates.length, 2);
});
