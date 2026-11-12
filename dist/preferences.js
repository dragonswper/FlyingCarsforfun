const bounded=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
export function normalizeInterface(value={}){return {scale:bounded(value?.scale,70,120,100),nameplates:value?.nameplates!==false,speed:value?.speed===true};}
export const CAMERA_FIELDS=Object.freeze([
 {key:'fov',label:'Field of view',min:60,max:110,step:1,value:110,unit:'° horizontal'},
 {key:'distance',label:'Distance',min:100,max:400,step:10,value:270,unit:'cm'},
 {key:'height',label:'Height',min:40,max:200,step:10,value:100,unit:'cm'},
 {key:'angle',label:'Camera angle',min:-15,max:0,step:1,value:-3,unit:'°'},
 {key:'stiffness',label:'Stiffness',min:0,max:1,step:.05,value:.45,unit:''}
]);
export const CAMERA_DEFAULTS=Object.freeze(Object.fromEntries(CAMERA_FIELDS.map(f=>[f.key,f.value])));
export function normalizeCamera(value={}){return Object.fromEntries(CAMERA_FIELDS.map(f=>[f.key,bounded(value?.[f.key],f.min,f.max,f.value)]));}
export function verticalFov(horizontal,aspect){return 2*Math.atan(Math.tan(horizontal*Math.PI/360)/Math.max(.1,aspect))*180/Math.PI;}
export const CONTROL_FIELDS=Object.freeze([
 {key:'steeringSensitivity',label:'Steering sensitivity',min:.5,max:2,step:.05,value:1,unit:'×'},
 {key:'aerialSensitivity',label:'Aerial sensitivity',min:.5,max:2,step:.05,value:1,unit:'×'},
 {key:'deadzone',label:'Controller deadzone',min:.05,max:.35,step:.01,value:.12,unit:''},
 {key:'dodgeDeadzone',label:'Dodge deadzone',min:.1,max:1,step:.05,value:.5,unit:''}
]);
export const CONTROL_DEFAULTS=Object.freeze({...Object.fromEntries(CONTROL_FIELDS.map(f=>[f.key,f.value])),invertPitch:false});
export function normalizeControls(value={}){return {...Object.fromEntries(CONTROL_FIELDS.map(f=>[f.key,bounded(value?.[f.key],f.min,f.max,f.value)])),invertPitch:value?.invertPitch===true};}
export const BINDING_LABELS=Object.freeze({forward:'Drive forward / pitch down',reverse:'Brake, reverse / pitch up',left:'Steer / yaw left',right:'Steer / yaw right',jump:'Jump / dodge / recover',boost:'Boost',drift:'Powerslide',rollLeft:'Air roll left',rollRight:'Air roll right',camera:'Toggle ball camera',scoreboard:'Scoreboard',reset:'Reset practice',next:'Next training shot'});
export const DEFAULT_BINDINGS=Object.freeze({forward:'KeyW',reverse:'KeyS',left:'KeyA',right:'KeyD',jump:'Space',boost:'ShiftLeft',drift:'ControlLeft',rollLeft:'KeyQ',rollRight:'KeyE',camera:'KeyC',scoreboard:'Tab',reset:'KeyR',next:'KeyT'});
const ALIASES={forward:['ArrowUp'],reverse:['ArrowDown'],left:['ArrowLeft'],right:['ArrowRight'],jump:['Mouse2'],boost:['ShiftRight','Mouse0'],drift:['ControlRight']};
export const validBinding=code=>typeof code==='string'&&/^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right)|Control(Left|Right)|Tab|Backquote|Minus|Equal|Bracket(Left|Right)|Backslash|Semicolon|Quote|Comma|Period|Slash|Mouse[012])$/.test(code);
export function bindingCodes(bindings,action){const primary=bindings[action]||DEFAULT_BINDINGS[action];return [primary,...(primary===DEFAULT_BINDINGS[action]?ALIASES[action]||[]:[])];}
export function bindingConflict(bindings,action,code){return Object.keys(DEFAULT_BINDINGS).find(other=>other!==action&&bindingCodes(bindings,other).includes(code));}
export function normalizeBindings(value={}){const bindings=Object.fromEntries(Object.keys(DEFAULT_BINDINGS).map(action=>[action,validBinding(value?.[action])?value[action]:DEFAULT_BINDINGS[action]]));for(const action of Object.keys(bindings))if(bindingConflict(bindings,action,bindings[action]))return {...DEFAULT_BINDINGS};return bindings;}
export function bindingName(code){const special={Space:'Space',Tab:'Tab',Mouse0:'Left mouse',Mouse1:'Middle mouse',Mouse2:'Right mouse',ShiftLeft:'Left Shift',ShiftRight:'Right Shift',ControlLeft:'Left Ctrl',ControlRight:'Right Ctrl'};return special[code]||code.replace(/^Key|^Digit/,'').replace(/^Arrow/,'Arrow ');}
