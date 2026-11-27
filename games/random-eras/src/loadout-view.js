import { DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { loadWeaponArt } from './weapon-art.js';

export async function createLoadoutView(canvas, readSettings) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  const models = await loadWeaponArt();
  const scene = new Scene();
  const camera = new PerspectiveCamera(36, 1.25, 0.05, 16);
  const key = new DirectionalLight('#fff0cc', 2.1);
  key.position.set(-2, 3, 4);
  scene.add(key, new HemisphereLight('#f2dab7', '#7b5f50', 1.65));
  let weapon;
  let activeId;
  function draw(now) {
    if (!canvas.offsetWidth || document.hidden) return;
    const { weapon: id, reducedMotion } = readSettings();
    if (activeId !== id) {
      weapon?.removeFromParent();
      const art = models.get(id);
      if (!art) return;
      weapon = art.root.clone(true);
      activeId = id;
      const height = art.tip?.y ?? 1;
      weapon.position.y = -height * .45;
      camera.position.set(.25, .13, Math.max(1.8, height * 2.2));
      camera.lookAt(0, 0, 0);
      scene.add(weapon);
    }
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    weapon.rotation.set(.08, reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches ? .43 : now * .0007, -.20);
    renderer.render(scene, camera);
  }
  return draw;
}
