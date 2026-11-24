import test from 'node:test';import assert from 'node:assert/strict';
import {RenderPacer,AdaptiveGraphics} from '../dist/performance.js';
import {renderingPreferences} from '../dist/render-settings.js';

test('frame limit defaults to 60, accepts saved selections and rejects invalid values',()=>{
 assert.equal(renderingPreferences().frameLimit,60);assert.equal(renderingPreferences({frameLimit:'120'}).frameLimit,120);
 for(const value of [-1,999,'invalid',Infinity,null])assert.equal(renderingPreferences({frameLimit:value}).frameLimit,60);
 assert.equal(renderingPreferences({frameLimit:0}).frameLimit,0);
});
test('render pacing honors the chosen budget on 60–240 Hz displays without capping physics/input',()=>{
 for(const hz of [60,90,120,144,240])for(const limit of [0,30,60,90,120,144]){
  const pacer=new RenderPacer({limit});let draws=0,steps=0,accumulator=0;
  for(let frame=0;frame<hz*10;frame++){
   if(pacer.draw(frame*1000/hz))draws++;
   accumulator+=1/hz;while(accumulator>=1/120-1e-10){steps++;accumulator-=1/120;}
  }
  assert.ok(Math.abs(draws-Math.min(limit||hz,hz)*10)<=1,`${hz} Hz at ${limit}: ${draws}`);assert.equal(steps,1200);
 }
 const mobile=new RenderPacer({mobile:true,limit:144});let draws=0;for(let i=0;i<1440;i++)if(mobile.draw(i*1000/144))draws++;assert.equal(draws,600);
});
test('auto quality evaluates the selected target instead of reducing quality for an intentional 30 FPS cap',()=>{
 const graphics=new AdaptiveGraphics('auto');for(let i=0;i<900;i++)graphics.observe(1/30,30);assert.equal(graphics.scale,1);
 for(let i=0;i<900;i++)graphics.observe(1/15,30);assert.ok(graphics.scale<1);
});
