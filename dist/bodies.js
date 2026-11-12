export const BODY_NAMES=Object.freeze({fennec:'FENNEC',striker:'STRIKER GT',rally:'RALLY RS',bottled:'BOTTLED CAR',octane:'OCTANE',che:'cHe',bike:'CYBERPUNK BIKE',c17:'C-17 GLOBEMASTER',randy:'RANDY MARSH',ridiculous:'RIDICULOUS VEHICLE',viking:'VIKING BATTLE VEHICLE',scifi:'SCI-FI THREE-WHEELER',golfcart:'WOODEN GOLF CART',rickshaw:'AUTORICKSHAW',ifv:'INFANTRY FIGHTING VEHICLE'});
export const BODY_TYPES=Object.freeze(Object.keys(BODY_NAMES));
export const CUSTOM_BODY_FILES=Object.freeze({octane:'octane.glb',che:'che.glb',bike:'bike.glb',c17:'c17.glb',scifi:'scifi.glb',golfcart:'golfcart.glb',rickshaw:'rickshaw.glb',ifv:'ifv.glb'});
export const FIXED_FINISH_BODIES=Object.freeze(['che','bike','c17','randy','ridiculous','viking','scifi','golfcart','rickshaw','ifv']);

// One optional-asset load per room. Ready/Start callers await this promise;
// failed downloads require an explicit retry instead of a heartbeat retry loop.
export function prepareRoomVehicles(session,load,render=()=>{},retry=false){
 if(session.assetsReady)return Promise.resolve();if(session.assetsPromise)return session.assetsPromise;if(session.assetsError&&!retry)return Promise.reject(new Error(session.assetsError));
 session.loadingAssets=true;session.assetsError='';const bodies=[...new Set([session.look?.body,session.remoteLook?.body].filter(Boolean))];
 session.assetsPromise=Promise.all(bodies.map(body=>Promise.resolve().then(()=>load(body)))).then(()=>{session.assetsReady=true;}).catch(error=>{session.assetsError='A vehicle could not load. Select Ready or Start again to retry.';throw error;}).finally(()=>{session.loadingAssets=false;session.assetsPromise=null;render();});render();return session.assetsPromise;
}
