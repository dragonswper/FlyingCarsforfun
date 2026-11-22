// Finish GPU preparation while the room still shows its loading state. The
// owner check also prevents an old download from changing a newer menu/match.
export async function prepareMatchView(view,options,prepareBodies=async()=>{},isCurrent=()=>true){
 await Promise.all([view.ensureArena(options?.arena),prepareBodies()]);
 if(!isCurrent())return false;
 view.setArena(options?.arena);
 const fieldMap=view.arena?.field?.material?.map;
 if(fieldMap)view.renderer.initTexture(fieldMap);
 await view.prepare();
 return isCurrent();
}
