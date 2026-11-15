import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {EngineModel,audioPreferences} from '../dist/engine-model.js';
import {GameSound} from '../dist/audio.js';

test('the recorded engine loop is a compact, non-silent mono WAV with a documented public-domain source',()=>{
 const bytes=fs.readFileSync(new URL('../dist/assets/audio/engine-loop.wav',import.meta.url));
 const credit=JSON.parse(fs.readFileSync(new URL('../dist/assets/audio/engine-credit.json',import.meta.url)));
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');assert.equal(bytes.readUInt16LE(22),1);assert.equal(bytes.readUInt32LE(24),44100);assert.equal(bytes.readUInt16LE(34),16);assert.ok(bytes.length<100000);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),credit.sha256);assert.equal(credit.license,'CC0 1.0');assert.match(credit.source_page,/opengameart.org/);
 let squared=0,peak=0;for(let i=44;i<bytes.length;i+=2){const value=bytes.readInt16LE(i)/32768;squared+=value*value;peak=Math.max(peak,Math.abs(value));}
 assert.ok(Math.sqrt(squared/((bytes.length-44)/2))>.02);assert.ok(peak<.85);
 const seam=Math.abs(bytes.readInt16LE(44)-bytes.readInt16LE(bytes.length-2))/32768;assert.ok(seam<.08,'The audio loop has a discontinuity');
});
test('engine revs react to throttle, shift with hysteresis and remain bounded while airborne',()=>{
 const model=new EngineModel();for(let i=0;i<120;i++)model.update({speed:0,throttle:1,grounded:false},1/120);
 assert.ok(model.rpm>5000);assert.equal(model.gear,0);
 for(let i=0;i<120;i++)model.update({speed:23,throttle:1},1/120);assert.equal(model.gear,4);assert.ok(model.rpm<6500);
 const gear=model.gear;for(let i=0;i<120;i++)model.update({speed:18.2+Math.sin(i)*.2},1/120);assert.equal(model.gear,gear);
 for(let i=0;i<240;i++)model.update({speed:0,throttle:0},1/120);assert.equal(model.gear,0);assert.ok(model.rpm<1150);
});
test('old sound preferences retain their volume and new controls normalize without enabling unsupported styles',()=>{
 assert.deepEqual(audioPreferences({}),{engineStyle:'sport',engineVolume:85,effectsVolume:80});
 assert.deepEqual(audioPreferences({engineStyle:'unknown',engineVolume:900,effectsVolume:-2}),{engineStyle:'sport',engineVolume:100,effectsVolume:0});
 const sound=new GameSound(()=>({sound:true}),()=>({active:true}),{Context:null});assert.doesNotThrow(()=>{sound.start();sound.update();sound.preview();sound.dispose();});
});
