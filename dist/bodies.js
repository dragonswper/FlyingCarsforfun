export const BODY_NAMES=Object.freeze({fennec:'FENNEC',striker:'STRIKER GT',rally:'RALLY RS',bottled:'BOTTLED CAR'});
export const BODY_TYPES=Object.freeze(Object.keys(BODY_NAMES));

// One optional-asset load per room. Ready/Start callers await this promise;
// failed downloads require an explicit retry instead of a heartbeat retry loop.
export function prepareRoomVehicles(session,load,render=()=>{},retry=false){
 if(session.assetsReady)return Promise.resolve();if(session.assetsPromise)return session.assetsPromise;if(session.assetsError&&!retry)return Promise.reject(new Error(session.assetsError));
 session.loadingAssets=true;session.assetsError='';const bodies=[...new Set([session.look?.body,session.remoteLook?.body].filter(Boolean))];
 session.assetsPromise=Promise.all(bodies.map(body=>Promise.resolve().then(()=>load(body)))).then(()=>{session.assetsReady=true;}).catch(error=>{session.assetsError='A vehicle could not load. Select Ready or Start again to retry.';throw error;}).finally(()=>{session.loadingAssets=false;session.assetsPromise=null;render();});render();return session.assetsPromise;
}
