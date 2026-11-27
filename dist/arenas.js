// Arena IDs are part of the shared match contract. All fields use the same
// regulation collision layout; environments are original decorative artwork.
export const ARENAS = Object.freeze({
  champions: Object.freeze({name:'CHAMPIONS FIELD',subtitle:'The original stadium',
    sky:'#192e49',fog:'#293e56',sun:'#dcecff',ambient:'#c2e9ff',ground:'#192c35',
    stripes:['#419b57','#33864b'],ink:'#cfe9d6a0',caption:'BOOST CIRCUIT',trim:'#101d2c',ramp:'#37585e',grass:true}),
  snow: Object.freeze({name:'WINTERLIGHT PARK',subtitle:'Snow · Christmas lights · Mountain village',
    sky:'#a8c7df',fog:'#b9d2e2',sun:'#fff0da',ambient:'#e2f3ff',ground:'#52728a',
    stripes:['#e6f4fa','#d8eaf4'],ink:'#416a84e0',caption:'WINTERLIGHT',trim:'#304d65',ramp:'#a1bacd',surround:'#cbdde8'}),
  city: Object.freeze({name:'NEON CITY',subtitle:'After-dark skyline · Rooftop lights',
    sky:'#081429',fog:'#14283d',sun:'#b5d5ff',ambient:'#a4c5eb',ground:'#172536',
    stripes:['#287965','#216653'],ink:'#a6e4e9e0',caption:'NEON CITY',trim:'#152332',ramp:'#294957',surround:'#152638',grass:true}),
  woods: Object.freeze({name:'EVERGREEN GROVE',subtitle:'Forest clearing · Pines · Golden-hour light',
    sky:'#a2b5ac',fog:'#a7bbb0',sun:'#ffe4b4',ambient:'#dbedd5',ground:'#384b32',
    stripes:['#589b46','#47873a'],ink:'#e0ebc5e0',caption:'EVERGREEN',trim:'#493e2e',ramp:'#61745a',surround:'#3e5638',grass:true}),
  harbour:Object.freeze({name:'HARBOURWORKS',subtitle:'Dockside stadium · Steel grandstands · Harbour cranes',
    sky:'#8d9b9f',fog:'#a2ada8',sun:'#ffe0ae',ambient:'#d6e4e7',ground:'#303c3c',
    stripes:['#388e62','#2d7b53'],ink:'#e5e5c9d0',caption:'HARBOURWORKS',trim:'#202e36',ramp:'#526462',surround:'#3a4544',grass:true}),
  festival:Object.freeze({name:'FROSTVALE FESTIVAL',subtitle:'Supplied Christmas village · Mountain road · Festive lights',
    sky:'#14283e',fog:'#54728b',sun:'#ffe6c5',ambient:'#b9d7ed',ground:'#526a7a',
    stripes:['#d2e0ea','#c5d6e4'],ink:'#4c6c86e0',caption:'FROSTVALE',trim:'#31475b',ramp:'#a5bdcf',surround:'#cbddea'}),
  yuletide:Object.freeze({name:'YULETIDE MARKET',subtitle:'Christmas · Clocktower square · Lantern-lit chalets',holiday:'Christmas',model:'yuletide.glb',cover:'yuletide-cover.webp',
    sky:'#718da5',fog:'#9eb7c6',sun:'#ffe3b6',ambient:'#d6e8f1',ground:'#536e79',
    stripes:['#9bc8be','#85b3a8'],ink:'#f4f1dbe0',caption:'YULETIDE MARKET',trim:'#283f44',ramp:'#93aaa9',surround:'#b8cbd0'}),
  halloween:Object.freeze({name:'HALLOWEEN HOLLOW',subtitle:'Halloween · Pumpkin lanterns · Gothic manor',holiday:'Halloween',model:'halloween.glb',cover:'halloween-cover.webp',
    sky:'#241e39',fog:'#4c4159',sun:'#d6c6ed',ambient:'#c0c5dc',ground:'#28372c',
    stripes:['#548444','#34513c'],ink:'#eadfc1e0',caption:'HALLOWEEN HOLLOW',trim:'#282637',ramp:'#555c50',surround:'#27392e',grass:true}),
  coast:Object.freeze({name:'SUNSET COAST',subtitle:'Seaside promenade · Lighthouse · Palm-lined stands',model:'coast.glb',cover:'coast-cover.webp',
    sky:'#c99589',fog:'#d9b7a0',sun:'#ffd6a0',ambient:'#dce7df',ground:'#6c7259',
    stripes:['#35765c','#2d6b54'],ink:'#fff0d3e0',caption:'SUNSET COAST',trim:'#2a5156',ramp:'#75958a',surround:'#c1a17c',grass:true}),
  canyon:Object.freeze({name:'RED ROCK CANYON',subtitle:'Sandstone arch · Desert mesas · Timber rail trestle',model:'canyon.glb',cover:'canyon-cover.webp',
    sky:'#88a3b9',fog:'#c9ac8d',sun:'#ffe3b7',ambient:'#e4ddc9',ground:'#74583c',
    stripes:['#8d7954','#826e4b'],ink:'#fff0cbe0',caption:'RED ROCK CANYON',trim:'#4b4136',ramp:'#a38965',surround:'#9f744d'}),
  orbital:Object.freeze({name:'ORBITAL STATION',subtitle:'Observation ring · Solar wings · Earthrise',model:'orbital.glb',cover:'orbital-cover.webp',
    sky:'#050c1d',fog:'#101d34',sun:'#d6e7ff',ambient:'#b7d3eb',ground:'#122b3e',
    stripes:['#214251','#1d3a49'],ink:'#cdf0f5e0',caption:'ORBITAL STATION',trim:'#172738',ramp:'#425f70',surround:'#121f31'}),
  skyline:Object.freeze({name:'SKYLINE COURT',subtitle:'Original Blender city arena · Hoops court',model:'skyline.glb',sky:'#192f53',fog:'#6a7c96',sun:'#e4d9d0',ambient:'#b9d0e5',ground:'#182c40',stripes:['#368c9c','#2c798b'],ink:'#e8f3fce0',caption:'SKYLINE COURT',trim:'#1c354c',ramp:'#53778b',surround:'#263d54'}),
  range:Object.freeze({name:'THE FOUNDRY',subtitle:'Original Blender training and target venue',model:'range.glb',sky:'#547c84',fog:'#acc1bb',sun:'#fff0c5',ambient:'#cee4da',ground:'#263c34',stripes:['#5e9c56','#4c8946'],ink:'#eff7dce0',caption:'THE FOUNDRY',trim:'#304e49',ramp:'#627f70',surround:'#3c5c4e',grass:true}),
  velocity:Object.freeze({name:'VELOCITY PARK',subtitle:'Original Blender precision-driving venue',model:'velocity.glb',sky:'#484b77',fog:'#9897b8',sun:'#efc5aa',ambient:'#d7d4e9',ground:'#2e3048',stripes:['#647fb4','#546fa2'],ink:'#f3e9dbe0',caption:'VELOCITY PARK',trim:'#333a55',ramp:'#68748d',surround:'#41445f'})

});
export const ARENA_IDS = Object.freeze(Object.keys(ARENAS));
export const normalizeArena = value => typeof value==='string'&&Object.hasOwn(ARENAS,value)?value:'champions';
export const arenaName = value => ARENAS[normalizeArena(value)].name;

// Choose a real arena on the authority, never independently on each client.
// A rematch avoids the previous field; every other field has equal chance.
export function randomArena(previous,random=Math.random) {
 const choices=ARENA_IDS.filter(id=>id!==previous);
 const sample=Number(random());
 const index=Number.isFinite(sample)?Math.max(0,Math.min(choices.length-1,Math.floor(sample*choices.length))):0;
 return choices[index];
}
