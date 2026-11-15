// Arena IDs are part of the shared match contract. All fields use the same
// regulation collision layout; environments are original decorative artwork.
export const ARENAS = Object.freeze({
  champions: Object.freeze({name:'CHAMPIONS FIELD',subtitle:'The original stadium',
    sky:'#192e49',fog:'#293e56',sun:'#dcecff',ambient:'#c2e9ff',ground:'#192c35',
    stripes:['#285b57','#235450'],ink:'#cfe9d6a0',caption:'BOOST CIRCUIT',trim:'#101d2c',ramp:'#37585e',grass:true}),
  snow: Object.freeze({name:'WINTERLIGHT PARK',subtitle:'Snow · Christmas lights · Mountain village',
    sky:'#a8c7df',fog:'#b9d2e2',sun:'#fff0da',ambient:'#e2f3ff',ground:'#52728a',
    stripes:['#d9e8ef','#cfdee9'],ink:'#416a84e0',caption:'WINTERLIGHT',trim:'#304d65',ramp:'#a1bacd',surround:'#cbdde8'}),
  city: Object.freeze({name:'NEON CITY',subtitle:'After-dark skyline · Rooftop lights',
    sky:'#081429',fog:'#14283d',sun:'#b5d5ff',ambient:'#a4c5eb',ground:'#172536',
    stripes:['#20434d','#1b3945'],ink:'#a6e4e9e0',caption:'NEON CITY',trim:'#152332',ramp:'#294957',surround:'#152638',grass:true}),
  woods: Object.freeze({name:'EVERGREEN GROVE',subtitle:'Forest clearing · Pines · Golden-hour light',
    sky:'#a2b5ac',fog:'#a7bbb0',sun:'#ffe4b4',ambient:'#dbedd5',ground:'#384b32',
    stripes:['#3c6442','#355b3b'],ink:'#e0ebc5e0',caption:'EVERGREEN',trim:'#493e2e',ramp:'#61745a',surround:'#3e5638',grass:true}),
  festival:Object.freeze({name:'FROSTVALE FESTIVAL',subtitle:'Supplied Christmas village · Mountain road · Festive lights',
    sky:'#14283e',fog:'#54728b',sun:'#ffe6c5',ambient:'#b9d7ed',ground:'#526a7a',
    stripes:['#d2e0ea','#c5d6e4'],ink:'#4c6c86e0',caption:'FROSTVALE',trim:'#31475b',ramp:'#a5bdcf',surround:'#cbddea'})
});
export const ARENA_IDS = Object.freeze(Object.keys(ARENAS));
export const normalizeArena = value => typeof value==='string'&&Object.hasOwn(ARENAS,value)?value:'champions';
export const arenaName = value => ARENAS[normalizeArena(value)].name;
