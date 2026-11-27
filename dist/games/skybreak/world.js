/* Original browser-game scene and gameplay. No Fortnite binaries or extracted assets. */
(function () {
  'use strict';
  const B = window.BABYLON;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const palette = { violet: '#9858f1', mint: '#36d8bf', ember: '#fb8650' };
  const keyCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyR', 'KeyQ', 'KeyE', 'KeyF', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']);

  class RiftWorld {
    constructor(canvas, callbacks = {}) {
      if (!B) throw new Error('The local 3D engine could not load. Check vendor/babylon.js.');
      this.canvas = canvas;
      this.callbacks = callbacks;
      this.engine = new B.Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
      this.settings = { mode: 'skirmish', outfit: 'violet', sensitivity: 1, quality: 'high' };
      this.keys = new Set();
      this.running = false;
      this.paused = false;
      this.dragging = false;
      this.pointerFallback = !canvas.requestPointerLock;
      this.lastState = 0;
      this.time = 0;
      this.bindInput();
      this.createLobby();
      this.engine.runRenderLoop(() => {
        const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.045);
        if (this.running && !this.paused) this.update(dt);
        else if (!this.running && this.isLobby) this.animateLobby(dt);
        if (this.scene) this.scene.render();
      });
    }

    bindInput() {
      this.listeners = [];
      const listen = (target, event, fn) => {
        target.addEventListener(event, fn);
        this.listeners.push([target, event, fn]);
      };
      listen(window, 'resize', () => this.engine.resize());
      listen(window, 'blur', () => { this.keys.clear(); this.firing = false; this.dragging = false; });
      listen(document, 'visibilitychange', () => {
        if (document.hidden) { this.keys.clear(); this.firing = false; }
      });
      listen(document, 'pointerlockchange', () => {
        if (document.pointerLockElement === this.canvas) this.pointerFallback = false;
        else { this.keys.clear(); this.firing = false; }
      });
      listen(document, 'pointerlockerror', () => {
        if (!this.running || this.paused) return;
        this.pointerFallback = true;
        this.notice('Mouse capture unavailable · click to fire, hold and drag to look.');
      });
      listen(window, 'keydown', event => {
        if (!this.running || this.paused || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
        if (keyCodes.has(event.code)) event.preventDefault();
        this.keys.add(event.code);
        if (event.repeat) return;
        if (event.code === 'KeyR') this.reload();
        if (event.code === 'KeyQ') { this.building = !this.building; this.notice(this.building ? 'BUILD MODE · click to place · E changes piece' : 'RIFLE EQUIPPED'); }
        if (['Digit1', 'Digit2', 'Digit3'].includes(event.code)) this.equip(Number(event.code.slice(-1)));
        if (['Digit4', 'Digit5', 'Digit6'].includes(event.code)) { this.building = true; this.buildType = ['wall', 'ramp', 'floor'][Number(event.code.slice(-1)) - 4]; }
        if (event.code === 'KeyE') this.buildType = ['wall', 'ramp', 'floor'][(['wall', 'ramp', 'floor'].indexOf(this.buildType) + 1) % 3];
        if (event.code === 'KeyF') this.buildRotation = (this.buildRotation + 1) % 4;
      });
      listen(window, 'keyup', event => this.keys.delete(event.code));
      listen(this.canvas, 'contextmenu', event => event.preventDefault());
      listen(this.canvas, 'pointerdown', event => {
        if (!this.running || this.paused) return;
        if (event.button === 0) {
          this.dragging = true;
          const alreadyCaptured = document.pointerLockElement === this.canvas;
          const usingFallback = this.pointerFallback || !this.canvas.requestPointerLock;
          this.capturePointer();
          if (alreadyCaptured || usingFallback) {
            if (this.building) this.placeBuild();
            else { this.firing = true; this.shoot(); }
          }
        }
        if (event.button === 2) this.aiming = true;
      });
      listen(window, 'pointerup', event => {
        if (event.button === 0) { this.dragging = false; this.firing = false; }
        if (event.button === 2) this.aiming = false;
      });
      listen(window, 'pointermove', event => {
        if (!this.running || this.paused) return;
        if (document.pointerLockElement !== this.canvas && !this.dragging) return;
        const sensitivity = clamp(Number(this.settings.sensitivity) || 1, 0.2, 3) * 0.0022;
        this.yaw += event.movementX * sensitivity;
        this.pitch = clamp(this.pitch + event.movementY * sensitivity, -1.1, 1.1);
      });
    }

    capturePointer() {
      if (!this.canvas.requestPointerLock) { this.pointerFallback = true; return; }
      if (document.pointerLockElement === this.canvas || this.pointerFallback) return;
      try {
        const request = this.canvas.requestPointerLock();
        if (request && request.catch) request.catch(() => {
          this.pointerFallback = true;
          this.notice('Mouse capture unavailable · click to fire, hold and drag to look.');
        });
      } catch (_) {
        this.pointerFallback = true;
        this.notice('Mouse capture unavailable · click to fire, hold and drag to look.');
      }
    }

    releasePointer() {
      if (document.pointerLockElement === this.canvas && document.exitPointerLock) document.exitPointerLock();
      this.keys.clear(); this.firing = false; this.dragging = false; this.aiming = false;
    }

    material(name, hex, emissive = 0) {
      const mat = new B.StandardMaterial(name, this.scene);
      mat.diffuseColor = B.Color3.FromHexString(hex);
      mat.specularColor = new B.Color3(0.08, 0.1, 0.15);
      if (emissive) mat.emissiveColor = mat.diffuseColor.scale(emissive);
      return mat;
    }

    box(name, dimensions, position, mat, parent) {
      const mesh = B.MeshBuilder.CreateBox(name, { width: dimensions[0], height: dimensions[1], depth: dimensions[2] }, this.scene);
      mesh.position.set(...position); mesh.material = mat;
      if (parent) mesh.parent = parent;
      return mesh;
    }

    cylinder(name, diameter, height, position, mat, tessellation = 12, diameterTop) {
      const mesh = B.MeshBuilder.CreateCylinder(name, { diameter, diameterTop: diameterTop === undefined ? diameter : diameterTop, height, tessellation }, this.scene);
      mesh.position.set(...position); mesh.material = mat;
      return mesh;
    }

    createScene(lobby) {
      if (this.scene) this.scene.dispose();
      this.scene = new B.Scene(this.engine);
      this.scene.clearColor = B.Color4.FromHexString(lobby ? '#2679b8ff' : '#9ed9edff');
      this.scene.fogMode = B.Scene.FOGMODE_EXP2;
      this.scene.fogDensity = lobby ? 0.011 : 0.005;
      this.scene.fogColor = B.Color3.FromHexString(lobby ? '#2677a5' : '#a9daec');
      this.scene.skipPointerMovePicking = true;
      this.camera = new B.FreeCamera('camera', new B.Vector3(8, 6, -13), this.scene);
      this.camera.minZ = 0.15; this.camera.maxZ = 700;
      this.camera.fov = 0.85;
      const ambient = new B.HemisphericLight('sky', new B.Vector3(0.2, 1, 0.3), this.scene);
      ambient.intensity = lobby ? 0.95 : 0.85;
      ambient.groundColor = B.Color3.FromHexString('#3b4271');
      this.sun = new B.DirectionalLight('sun', new B.Vector3(-0.5, -1, 0.6), this.scene);
      this.sun.position.set(30, 65, -25); this.sun.intensity = lobby ? 1.5 : 1.1;
      this.sun.diffuse = B.Color3.FromHexString(lobby ? '#81caff' : '#fff1c3');
      this.mats = {
        grass: this.material('lush grass', '#73ad58'), grassDark: this.material('grass shadows', '#507b48'),
        sand: this.material('sandstone', '#d2be80'), stone: this.material('slate', '#80939b'),
        trunk: this.material('bark', '#765649'), leaf: this.material('pine', '#397b68'), leafLight: this.material('leaf tips', '#52a579'),
        wall: this.material('house stucco', '#e1c8a5'), roof: this.material('slate roof', '#706789'),
        dark: this.material('midnight steel', '#202b4d'), metal: this.material('gun metal', '#303e53'),
        glass: this.material('azure glass', '#62cdf2', 0.35), wood: this.material('new timber', '#c89d65'),
        blue: this.material('shield glow', '#50bdff', 0.6), yellow: this.material('pickup gold', '#fce178', 0.7),
        pink: this.material('rift pink', '#e77cff', 0.8), white: this.material('ice white', '#e8f4ff'),
        ocean: this.material('ocean', lobby ? '#155583' : '#438dac', 0.15)
      };
      this.shadows = new B.ShadowGenerator(1024, this.sun);
      this.shadows.useBlurExponentialShadowMap = true; this.shadows.blurKernel = 12;
      this.setSettings(this.settings);
      const ocean = B.MeshBuilder.CreateGround('ocean', { width: 1200, height: 1200 }, this.scene);
      ocean.position.y = -5.2; ocean.material = this.mats.ocean; ocean.isPickable = false;
      this.effects = []; this.obstacles = []; this.harvestables = [];
    }

    createActor(name, color, scale = 1) {
      const actor = new B.TransformNode(name, this.scene);
      actor.scaling.setAll(scale);
      const suit = this.material(name + ' suit', color);
      const accent = this.material(name + ' trim', '#bcf8ff', 0.15);
      const parts = [];
      const part = (suffix, dimensions, position, mat) => {
        const mesh = this.box(name + ' ' + suffix, dimensions, position, mat, actor);
        mesh.isPickable = false; this.shadows.addShadowCaster(mesh);
        parts.push(mesh); return mesh;
      };
      part('body', [0.72, 0.88, 0.43], [0, 1.35, 0], suit);
      part('armour', [0.79, 0.35, 0.51], [0, 1.62, 0.015], this.mats.dark);
      part('belt', [0.76, 0.14, 0.48], [0, 0.95, 0.01], this.mats.dark);
      part('buckle', [0.18, 0.12, 0.06], [0, 0.96, 0.28], accent);
      part('head', [0.57, 0.59, 0.56], [0, 2.02, 0], suit);
      part('visor', [0.48, 0.18, 0.06], [0, 2.08, 0.3], this.mats.dark);
      part('visor light', [0.38, 0.045, 0.065], [0, 2.07, 0.34], accent);
      part('crest', [0.13, 0.19, 0.5], [0, 2.39, -0.04], accent);
      const leftLeg = part('left leg', [0.27, 0.83, 0.31], [-0.21, 0.48, 0], this.mats.dark);
      const rightLeg = part('right leg', [0.27, 0.83, 0.31], [0.21, 0.48, 0], this.mats.dark);
      part('left knee', [0.3, 0.23, 0.35], [-0.21, 0.53, 0.055], suit);
      part('right knee', [0.3, 0.23, 0.35], [0.21, 0.53, 0.055], suit);
      part('left boot', [0.32, 0.19, 0.52], [-0.21, 0.1, 0.08], this.mats.dark);
      part('right boot', [0.32, 0.19, 0.52], [0.21, 0.1, 0.08], this.mats.dark);
      const leftArm = part('left arm', [0.28, 0.7, 0.3], [-0.54, 1.37, 0.03], suit);
      const rightArm = part('right arm', [0.28, 0.7, 0.3], [0.54, 1.37, 0.03], suit);
      part('left shoulder', [0.36, 0.25, 0.39], [-0.54, 1.74, 0], this.mats.dark);
      part('right shoulder', [0.36, 0.25, 0.39], [0.54, 1.74, 0], this.mats.dark);
      const rifle = part('rifle', [0.16, 0.19, 0.96], [0.53, 1.3, 0.49], this.mats.metal);
      part('rifle glow', [0.17, 0.055, 0.21], [0.53, 1.39, 0.75], accent);
      const pickaxe=new B.TransformNode(name+' pickaxe',this.scene);pickaxe.parent=actor;pickaxe.position.set(.55,1.15,.4);
      const handle=this.box('pickaxe handle',[.07,1,.07],[0,0,0],this.mats.trunk,pickaxe);
      const blade=this.box('pickaxe head',[.65,.12,.15],[0,.45,0],this.mats.metal,pickaxe);
      handle.isPickable=false;blade.isPickable=false;pickaxe.setEnabled(false);
      return { root: actor, suit, parts, leftLeg, rightLeg, leftArm, rightArm, rifle, pickaxe };
    }

    addTree(x, z, scale = 1) {
      const trunk = this.cylinder('tree trunk', 0.8 * scale, 3.3 * scale, [x, 1.65 * scale, z], this.mats.trunk, 6);
      trunk.metadata = { blocker: true };
      const bottom = this.cylinder('pine canopy', 5.2 * scale, 5.5 * scale, [x, 4.3 * scale, z], this.mats.leaf, 6, 0);
      const crown = this.cylinder('pine crown', 3.9 * scale, 4.5 * scale, [x, 6.7 * scale, z], this.mats.leafLight, 6, 0);
      window.RiftAssets?.place(this.scene, Math.abs(Math.round(x)) % 3 ? 'pine' : 'oak', x, z, 8 * scale, this.shadows, [trunk, bottom, crown]);
      this.harvestables.push({ x, z, r: 1.2 * scale, resource: 'wood', remaining: 100 });
      bottom.metadata = { blocker: true };
      this.obstacles.push({ x, z, r: 0.7 * scale });
    }

    addRock(x, z, scale = 1) {
      const rock = B.MeshBuilder.CreatePolyhedron('rock', { type: 1, size: scale }, this.scene);
      rock.position.set(x, scale * 0.55, z); rock.scaling.set(1.5, 0.9, 1.1);
      rock.rotation.set(0.2, x, 0.1); rock.material = this.mats.stone;
      window.RiftAssets?.place(this.scene, 'rock', x, z, scale * 1.3, this.shadows, [rock]);
      rock.metadata = { blocker: true }; this.obstacles.push({ x, z, r: 1.5 * scale });
    }

    addHouse(x, z, rotation = 0) {
      const house = new B.TransformNode('cabin', this.scene); house.position.set(x, 0, z); house.rotation.y = rotation;
      const wall = this.box('cabin walls', [8, 5, 7], [0, 2.5, 0], this.mats.wall, house);
      wall.metadata = { blocker: true }; wall.receiveShadows = true;
      const roof = this.cylinder('cabin roof', 12, 3.2, [0, 6.3, 0], this.mats.roof, 4, 0);
      roof.parent = house; roof.rotation.y = Math.PI / 4; roof.scaling.z = 0.88;
      this.box('cabin door', [1.8, 3.3, 0.08], [0, 1.65, -3.55], this.mats.trunk, house);
      for (const side of [-1, 1]) this.box('cabin window', [1.4, 1.3, 0.09], [side * 2.6, 3, -3.55], this.mats.glass, house);
      this.box('chimney', [1.2, 3, 1.2], [2.4, 6.2, 0.8], this.mats.stone, house);
      this.obstacles.push({ x, z, r: 5.4 });
      this.shadows.addShadowCaster(wall);
    }

    createLobby() {
      this.isLobby = true;
      this.createScene(true);
      const land = this.cylinder('floating island', 74, 10, [0, -5.4, 11], this.mats.grassDark, 9, 82);
      land.receiveShadows = true; land.isPickable = false;
      for (let i = 0; i < 22; i++) {
        // Keep all scenery behind the podium; a full ring puts trees inside the camera.
        const angle = -1.45 + (i / 21) * 2.9; const radius = 17 + (i % 4) * 5;
        this.addTree(Math.sin(angle) * radius, Math.cos(angle) * radius + 13, 1 + (i % 3) * 0.25);
      }
      this.addHouse(17, 18, -0.4); this.addRock(-10, 9, 3.2); this.addRock(-15, 22, 4);
      for (let i = 0; i < 8; i++) {
        const mount = this.cylinder('far mountain', 55, 35 + i * 3, [(i - 4) * 37, 0, 110 + (i % 2) * 12], this.mats.roof, 5, 0);
        mount.isPickable = false;
      }
      const platform = this.cylinder('landing platform', 7.5, 0.45, [0, 0.2, 0], this.mats.dark, 64);
      platform.receiveShadows = true;
      const ring = B.MeshBuilder.CreateTorus('energy halo', { diameter: 7.1, thickness: 0.07, tessellation: 96 }, this.scene);
      ring.position.y = 0.46; ring.material = this.mats.blue; ring.isPickable = false;
      const inner = B.MeshBuilder.CreateTorus('inner halo', { diameter: 5.8, thickness: 0.035, tessellation: 64 }, this.scene);
      inner.position.y = 0.47; inner.material = this.mats.pink; inner.isPickable = false;
      this.hero = this.createActor('ranger', palette[this.settings.outfit] || palette.violet, 2.05);
      this.hero.root.position.y = 0.46; this.hero.root.rotation.y = Math.PI - 0.35;
      this.hero.rifle.isVisible = false;
      this.camera.position.set(9.2, 5.5, -14.6);
      this.camera.setTarget(new B.Vector3(-1.9, 2.8, 0));
      this.lobbyDust = [];
      for (let i = 0; i < 18; i++) {
        const spark = B.MeshBuilder.CreateSphere('rift particle', { diameter: 0.035 + (i % 3) * 0.025, segments: 4 }, this.scene);
        spark.material = i % 3 ? this.mats.blue : this.mats.pink;
        spark.isPickable = false; this.lobbyDust.push(spark);
      }
      this.addDetails(true);
      this.time = 0;
    }

    addDetails(lobby) {
      for (let i = 0; i < (lobby ? 8 : 22); i++) {
        const a = i * 2.39996, radius = lobby ? 15 + i * 1.5 : 18 + (i % 9) * 5;
        window.RiftAssets?.place(this.scene, 'grass', Math.sin(a) * radius, (lobby ? 14 : 0) + Math.cos(a) * radius, .5 + (i % 3) * .15, this.shadows);
      }
      [[-12, 10], [33, 32], [-30, -28]].forEach(([x,z]) => window.RiftAssets?.place(this.scene, 'logs', x, z, 1.3, this.shadows));
      for (let i=0;i<5;i++) window.RiftAssets?.place(this.scene, 'cloud', (i-2)*45, lobby ? 80 : 100, 6+(i%3)*2, null, [], 36+(i%2)*9);
      // Original floating rift: a strong silhouette and a visual anchor for the lobby.
      const rift = B.MeshBuilder.CreateTorus('sky rift', { diameter: 13, thickness: .18, tessellation: 56 }, this.scene);
      rift.position.set(lobby ? -17 : -35, 30, 62); rift.rotation.x = Math.PI / 2; rift.rotation.z = -.35;
      rift.material = this.mats.pink; rift.isPickable = false;
      for(let i=0;i<7;i++) {
        const shard = B.MeshBuilder.CreatePolyhedron('rift shard', { type: 1, size: .5 }, this.scene);
        shard.position.set(rift.position.x+Math.sin(i*2.4)*6,30+Math.cos(i*2.4)*8,62); shard.scaling.y=2.5; shard.material=this.mats.blue; shard.isPickable=false;
      }
    }

    animateLobby(dt) {
      if (!this.hero) return;
      this.time += dt;
      this.hero.root.position.y = 0.46 + Math.sin(this.time * 1.5) * 0.025;
      this.hero.root.rotation.y = Math.PI - 0.35 + Math.sin(this.time * 0.22) * 0.16;
      this.hero.leftArm.rotation.x = Math.sin(this.time) * 0.035;
      this.lobbyDust.forEach((spark, i) => {
        const a = i * 2.4 + this.time * 0.13;
        spark.position.set(Math.sin(a) * (3 + i % 3), (i * 0.5 + this.time * 0.4) % 7, Math.cos(a) * (3 + i % 3));
      });
    }

    start(options = {}) {
      this.releasePointer(); this.settings = { ...this.settings, ...options };
      this.isLobby = false;
      this.createScene(false);
      this.running = true; this.paused = false; this.elapsed = 0; this.lastState = 0;
      this.pointerFallback = !this.canvas.requestPointerLock;
      this.health = 100; this.shield = 50; this.ammo = 24; this.reserve = 144; this.wood = 300;
      this.weapon = 'rifle'; this.magazines = { rifle: 24, shotgun: 6 }; this.reserves = { rifle: 144, shotgun: 30 }; this.targetsHit = 0;
      this.kills = 0; this.score = 0; this.yaw = 0; this.pitch = 0.065;
      this.shotCooldown = 0; this.reloadTime = 0; this.buildCooldown = 0; this.hitCooldown = 0;
      this.building = false; this.buildType = 'wall'; this.buildRotation = 0;
      this.velocityY = 0; this.moveTime = 0; this.stormRadius = 76; this.stormTick = 0;
      this.pickups = []; this.builds = []; this.bots = []; this.respawns = []; this.targets = [];
      const base = this.cylinder('island rock', 152, 8, [0, -4.1, 0], this.mats.sand, 48, 148);
      base.isPickable = false;
      this.ground = this.cylinder('island grass', 148, 0.2, [0, -0.1, 0], this.mats.grass, 64);
      this.ground.receiveShadows = true; this.ground.metadata = { blocker: true };
      const pathMat = this.material('dust trails', '#b9ac76');
      for (let i = 0; i < 3; i++) {
        const path = this.box('island trail', [i === 2 ? 8 : 90, 0.025, i === 2 ? 105 : 6], [0, 0.025, (i - 1) * 26], pathMat);
        path.isPickable = false; path.receiveShadows = true;
      }
      this.addHouse(-24, 15, 0.25); this.addHouse(23, 24, -0.2); this.addHouse(27, -27, Math.PI / 2);
      for (let i = 0; i < 47; i++) {
        const a = i * 2.39996; const r = 32 + (i % 7) * 5.2;
        const x = Math.sin(a) * r; const z = Math.cos(a) * r;
        if (this.obstacles.some(o => distance(o, { x, z }) < o.r + 4)) continue;
        if (i % 4 === 0) this.addRock(x, z, 1.3 + i % 3);
        else this.addTree(x, z, 0.8 + (i % 4) * 0.18);
      }
      this.hero = this.createActor('player', palette[this.settings.outfit] || palette.violet);
      this.hero.root.position.set(0, 0, -20);
      const botPositions = [[-14, 0], [16, 1], [-3, 24], [-37, -12], [38, 0], [-17, 43], [27, 44]];
      if (this.settings.mode !== 'skybreak') botPositions.forEach((pos, i) => this.spawnBot(pos[0], pos[1], i));
      else this.createTargetCourse();
      this.addDetails(false);
      [[-9, -12, 'shield'], [10, -10, 'ammo'], [-13, 13, 'health'], [14, 28, 'wood'], [0, 40, 'shield'], [-36, 18, 'ammo']].forEach(p => this.addPickup(...p));
      const stormMat = this.material('storm energy', '#ad64ed', 0.6);
      stormMat.alpha = 0.15; stormMat.backFaceCulling = false; stormMat.disableLighting = true;
      this.storm = B.MeshBuilder.CreateCylinder('storm boundary', { diameter: 2, height: 45, tessellation: 100, cap: B.Mesh.NO_CAP }, this.scene);
      this.storm.position.y = 20; this.storm.material = stormMat; this.storm.isPickable = false;
      this.storm.isVisible = this.settings.mode === 'skirmish';
      this.ghostMaterial = this.material('build preview', '#8fe5ff', 0.6); this.ghostMaterial.alpha = 0.35;
      this.ghost = this.box('build preview', [5, 3.8, 0.3], [0, -100, 0], this.ghostMaterial);
      this.ghost.isPickable = false;
      this.updateCamera(1); this.emitState();
      this.notice(this.settings.mode === 'skybreak' ? 'SKYBREAK · hit all 8 targets in 3 minutes · build to reach high targets' : this.settings.mode === 'practice' ? 'PRACTICE · targets respawn · no incoming damage' : 'ISLAND SKIRMISH · eliminate 7 sentries · stay inside the rift');
      // The launcher may show a click-to-play overlay. Capture on a canvas gesture.
    }

    createTargetCourse() {
      const red = this.material('target coral', '#f76b59');
      const positions = [[0,2,-7],[-10,2,0],[14,2,0],[-13,4.8,14],[23,5.5,15],[8,2,34],[-32,2,-11],[1,6.3,48]];
      positions.forEach(([x,y,z], index) => {
        const root = new B.TransformNode('skybreak target '+index, this.scene); root.position.set(x,y,z);
        const disk = B.MeshBuilder.CreateCylinder('target disk', { diameter: 1.6, height: .2, tessellation: 32 }, this.scene);
        disk.parent=root; disk.rotation.x=Math.PI/2; disk.material=red;
        const ring=B.MeshBuilder.CreateTorus('bullseye ring',{diameter:.95,thickness:.17,tessellation:32},this.scene);
        ring.parent=root; ring.rotation.x=Math.PI/2; ring.position.z=-.13; ring.material=this.mats.white;
        const center=B.MeshBuilder.CreateSphere('bullseye center',{diameter:.3,segments:12},this.scene);
        center.parent=root;center.position.z=-.17;center.material=red;
        const target={root,alive:true,index,x,z};
        [disk,ring,center].forEach(m=>m.metadata={target});this.targets.push(target);
        const post=this.box('target stand',[.18,y,.18],[x,y/2,z+.1],this.mats.trunk);post.isPickable=false;
      });
    }

    equip(slot) {
      if(this.reloadTime > 0) this.reloadTime=0;
      if(this.weapon !== 'pickaxe') { this.magazines[this.weapon]=this.ammo; this.reserves[this.weapon]=this.reserve; }
      this.weapon=['rifle','shotgun','pickaxe'][slot-1] || 'rifle'; this.building=false;
      this.ammo=this.magazines[this.weapon] ?? 0; this.reserve=this.reserves[this.weapon] ?? 0;
      this.hero.rifle.isVisible=this.weapon!=='pickaxe';this.hero.rifle.scaling.z=this.weapon==='shotgun'?.65:1;this.hero.pickaxe.setEnabled(this.weapon==='pickaxe'); this.emitState();
    }

    spawnBot(x, z, index) {
      const actor = this.createActor('sentry ' + index, ['#e57579', '#e9b95c', '#75bfa8', '#789ce2'][index % 4]);
      actor.root.position.set(x, 0, z);
      const bot = { ...actor, health: 100, cooldown: 2.5 + index * 0.7, phase: index * 2.8, index, alive: true };
      actor.parts.forEach(mesh => { mesh.isPickable = true; mesh.metadata = { bot, head: mesh.name.endsWith('head') }; });
      const bar = this.box('sentry healthbar', [0.95, 0.08, 0.05], [0, 2.75, 0], this.mats.pink, actor.root);
      bar.isPickable = false; bot.bar = bar;
      this.bots.push(bot);
    }

    addPickup(x, z, type) {
      const mat = type === 'shield' ? this.mats.blue : type === 'health' ? this.mats.pink : this.mats.yellow;
      const mesh = B.MeshBuilder.CreatePolyhedron(type + ' pickup', { type: 1, size: 0.45 }, this.scene);
      mesh.position.set(x, 0.8, z); mesh.material = mat; mesh.isPickable = false;
      const halo = B.MeshBuilder.CreateTorus('pickup ring', { diameter: 1.6, thickness: 0.035, tessellation: 20 }, this.scene);
      halo.position.set(x, 0.06, z); halo.material = mat; halo.isPickable = false;
      this.pickups.push({ mesh, halo, type, x, z });
    }

    validPosition(x, z, radius = .65, skip = null, height = 0) {
      if (Math.hypot(x, z) > 71) return false;
      return !this.obstacles.some(o => {
        if(o === skip) return false;
        if(o.type === 'wall') {
          if(height > o.base+3.8 || height+2 < o.base) return false;
          const dx=x-o.x,dz=z-o.z,side=dx*Math.cos(o.angle)-dz*Math.sin(o.angle),run=dx*Math.sin(o.angle)+dz*Math.cos(o.angle);
          return Math.abs(side)<2.5+radius && Math.abs(run)<.16+radius;
        }
        return Math.hypot(x-o.x,z-o.z)<o.r+radius;
      });
    }

    moveActor(actor, dx, dz, radius = 0.65) {
      const p = actor.root.position;
      if (this.validPosition(p.x + dx, p.z, radius, null, p.y)) p.x += dx;
      if (this.validPosition(p.x, p.z + dz, radius, null, p.y)) p.z += dz;
    }

    supportHeight(x, z, maxHeight = Infinity) {
      let support = 0;
      for (const build of this.builds || []) {
        if (build.type === 'floor') {
          if (Math.abs(x-build.x)<2.5 && Math.abs(z-build.z)<2.5 && build.base+.16<=maxHeight) support=Math.max(support,build.base+.16);
          continue;
        }
        if (build.type !== 'ramp') continue;
        const dx = x - build.x, dz = z - build.z;
        const side = dx * Math.cos(build.angle) - dz * Math.sin(build.angle);
        const run = dx * Math.sin(build.angle) + dz * Math.cos(build.angle);
        // The 5.2-unit plank is pitched 45 degrees. Its -Z edge meets the ground.
        if (Math.abs(side) > 2.43 || Math.abs(run) > 5.2 * Math.SQRT1_2 / 2 + 0.06) continue;
        const height = Math.max(0, (build.base || 0) + 1.7 + run + 0.18 / (2 * Math.SQRT1_2));
        if (height <= maxHeight && height > support) support = height;
      }
      return support;
    }

    update(dt) {
      this.elapsed += dt;
      this.shotCooldown = Math.max(0, this.shotCooldown - dt);
      this.buildCooldown = Math.max(0, this.buildCooldown - dt);
      this.hitCooldown = Math.max(0, this.hitCooldown - dt);
      if (this.reloadTime > 0) {
        this.reloadTime -= dt;
        if (this.reloadTime <= 0) {
          const amount = Math.min((this.weapon === 'shotgun' ? 6 : 24) - this.ammo, this.reserve);
          this.ammo += amount; this.reserve -= amount;
        }
      }
      if (this.firing && !this.building && (document.pointerLockElement === this.canvas || (this.pointerFallback && this.dragging))) this.shoot();
      const p = this.hero.root.position;
      const previousSupport = this.supportHeight(p.x, p.z, p.y + 0.12);
      const previouslyGrounded = Math.abs(p.y - previousSupport) < 0.12 && this.velocityY <= 0;
      let dx = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
      let dz = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
      const moving = !!(dx || dz);
      if (moving) {
        const magnitude = Math.hypot(dx, dz); dx /= magnitude; dz /= magnitude;
        const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 10.5 : 6.7) * dt;
        this.moveActor(this.hero, (Math.cos(this.yaw) * dx + Math.sin(this.yaw) * dz) * speed, (-Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) * speed);
        this.moveTime += dt * 10;
      }
      const walkingSupport = this.supportHeight(p.x, p.z, p.y + 0.5);
      if (previouslyGrounded && Math.abs(walkingSupport - p.y) <= 0.5) p.y = walkingSupport;
      const grounded = Math.abs(p.y - walkingSupport) < 0.12 && this.velocityY <= 0;
      if (this.keys.has('Space') && grounded) this.velocityY = 8;
      this.velocityY -= dt * 21;
      const nextY = p.y + this.velocityY * dt;
      const landingSupport = this.supportHeight(p.x, p.z, Math.max(p.y, nextY) + 0.08);
      if (this.velocityY <= 0 && nextY <= landingSupport && p.y >= landingSupport - 0.08) {
        p.y = landingSupport; this.velocityY = 0;
      } else p.y = Math.max(0, nextY);
      this.hero.root.rotation.y = this.yaw;
      this.animateActor(this.hero, moving ? Math.sin(this.moveTime) * 0.45 : 0);
      this.updateCamera(dt);
      this.updateBots(dt);
      if (this.settings.mode === 'skirmish') {
        this.stormRadius = Math.max(13, 76 - Math.max(0, this.elapsed - 35) * 0.28);
        this.storm.scaling.set(this.stormRadius, 1, this.stormRadius);
        this.stormTick += dt;
        if (this.stormTick >= 1) {
          this.stormTick = 0;
          if (Math.hypot(p.x, p.z) > this.stormRadius) { this.takeDamage(7, true); this.notice('OUTSIDE THE RIFT · return to the safe zone'); }
          this.bots.filter(bot => bot.alive && Math.hypot(bot.root.position.x, bot.root.position.z) > this.stormRadius).forEach(bot => this.damageBot(bot, 6, false));
        }
      }
      if (!this.running) return;
      if (this.settings.mode === 'skybreak' && this.elapsed >= 180) { this.finish(false); return; }
      this.updatePickups(dt);
      this.updateBuildPreview();
      this.updateEffects(dt);
      for (let i = this.respawns.length - 1; i >= 0; i--) {
        this.respawns[i].time -= dt;
        if (this.respawns[i].time <= 0) {
          const entry = this.respawns.splice(i, 1)[0];
          const dead = this.bots.findIndex(b => !b.alive && b.index === entry.index);
          if(dead >= 0) { this.bots[dead].root.dispose(); this.bots.splice(dead,1); }
          this.spawnBot(entry.x, entry.z, entry.index);
        }
      }
      if (this.running && this.elapsed - this.lastState > 0.1) { this.emitState(); this.lastState = this.elapsed; }
    }

    animateActor(actor, step) {
      actor.leftLeg.rotation.x = step; actor.rightLeg.rotation.x = -step;
      actor.leftArm.rotation.x = -step * 0.6; actor.rightArm.rotation.x = step * 0.4 - 0.2;
    }

    updateCamera(dt) {
      const p = this.hero.root.position;
      const range = this.aiming ? 4.2 : 7;
      const targetPosition = new B.Vector3(p.x - Math.sin(this.yaw) * range + Math.cos(this.yaw) * 0.8, p.y + 3.15, p.z - Math.cos(this.yaw) * range - Math.sin(this.yaw) * 0.8);
      const focus=p.add(new B.Vector3(0,1.8,0)),offset=targetPosition.subtract(focus);
      const obstruction=this.scene.pickWithRay(new B.Ray(focus,offset.normalizeToNew(),offset.length()),mesh=>!!mesh.metadata?.blocker);
      if(obstruction?.hit && obstruction.distance<offset.length())targetPosition.copyFrom(focus.add(offset.normalizeToNew().scale(Math.max(.65,obstruction.distance-.35))));
      this.camera.position.copyFrom(B.Vector3.Lerp(this.camera.position, targetPosition, Math.min(1, dt * 16)));
      const direction = new B.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      this.camera.setTarget(this.camera.position.add(direction.scale(70)));
      this.camera.fov = this.aiming ? 0.62 : 0.9;
    }

    updateBots(dt) {
      const player = this.hero.root.position;
      for (const bot of this.bots) {
        if (!bot.alive) continue;
        const p = bot.root.position;
        const range = distance(p, player);
        const practice = this.settings.mode !== 'skirmish';
        const desired = range > 19 && !practice ? Math.atan2(player.x - p.x, player.z - p.z) : bot.phase + Math.sin(this.elapsed * 0.22 + bot.phase) * 1.8;
        bot.root.rotation.y = range < 35 && !practice ? Math.atan2(player.x - p.x, player.z - p.z) : desired;
        const safeDirection = Math.hypot(p.x, p.z) > this.stormRadius - 3 && !practice ? Math.atan2(-p.x, -p.z) : desired;
        const speed = (practice ? 1.1 : range > 19 ? 2.7 : 1.5) * dt;
        this.moveActor(bot, Math.sin(safeDirection) * speed, Math.cos(safeDirection) * speed, 0.65);
        this.animateActor(bot, Math.sin(this.elapsed * 7 + bot.phase) * 0.35);
        bot.bar.scaling.x = Math.max(0.02, bot.health / 100);
        bot.cooldown -= dt;
        if (!practice && this.elapsed>4 && range < 34 && range > 3 && bot.cooldown <= 0) {
          bot.cooldown = 2.3 + Math.random() * 1.6;
          const origin = p.add(new B.Vector3(0, 1.5, 0));
          const target = player.add(new B.Vector3(0, 1.35, 0));
          const ray = new B.Ray(origin, target.subtract(origin).normalize(), B.Vector3.Distance(origin, target));
          const obstruction = this.scene.pickWithRay(ray, mesh => !!(mesh.metadata && mesh.metadata.blocker));
          if (!obstruction || !obstruction.hit) {
            this.tracer(origin, target, false);
            if (Math.random() > (range<12?.4:.65)) this.takeDamage(5 + Math.floor(Math.random() * 4));
          }
        }
      }
    }

    shoot() {
      if (!this.running || this.paused || this.reloadTime > 0 || this.shotCooldown > 0 || this.building) return;
      if(this.weapon === 'pickaxe') { this.harvest(); return; }
      if (this.ammo <= 0) { this.reload(); return; }
      const shotgun=this.weapon==='shotgun';
      this.ammo--; this.shotCooldown=shotgun?.72:.15; this.effect('shot');
      const ray=this.camera.getForwardRay(130);
      const pick=this.scene.pickWithRay(ray,mesh=>!!(mesh.metadata&&(mesh.metadata.bot||mesh.metadata.blocker||mesh.metadata.target)));
      let end=pick?.hit?pick.pickedPoint:ray.origin.add(ray.direction.scale(110));
      const p=this.hero.root.position;
      const origin=p.add(new B.Vector3(Math.sin(this.yaw)*.9+Math.cos(this.yaw)*.5,1.35,Math.cos(this.yaw)*.9-Math.sin(this.yaw)*.5));
      // A camera can see over cover while a muzzle remains behind it.
      const muzzleRay=new B.Ray(origin,end.subtract(origin).normalize(),B.Vector3.Distance(origin,end));
      const obstruction=this.scene.pickWithRay(muzzleRay,mesh=>!!mesh.metadata?.blocker);
      const blocked=obstruction?.hit && obstruction.distance+.15<B.Vector3.Distance(origin,end);
      if(blocked) end=obstruction.pickedPoint;
      this.tracer(origin,end,true);
      if(!blocked && pick?.hit && pick.pickedMesh.metadata.bot) {
        const head=pick.pickedMesh.metadata.head;
        const amount=shotgun?Math.max(10,95-pick.distance*1.9):(head?60:34);
        this.damageBot(pick.pickedMesh.metadata.bot,amount,true);this.effect('hit');this.hitCooldown=.15;
      }
      if(!blocked && pick?.hit && pick.pickedMesh.metadata.target) {
        const target=pick.pickedMesh.metadata.target;
        if(target.alive) { target.alive=false;target.root.setEnabled(false);this.targetsHit++;this.score+=125;this.effect('hit');this.notice(`TARGET ${this.targetsHit} / 8 · +125`);if(this.targetsHit===8)this.finish(true); }
      }
      if(this.ammo===0 && this.reserve>0)this.reload();
      this.emitState();
    }

    harvest() {
      this.shotCooldown=.55;this.effect('build');
      const p=this.hero.root.position;
      const point={x:p.x+Math.sin(this.yaw)*2,z:p.z+Math.cos(this.yaw)*2};
      const resource=this.harvestables.filter(h=>h.remaining>0&&distance(h,p)<3.6&&((h.x-p.x)*Math.sin(this.yaw)+(h.z-p.z)*Math.cos(this.yaw))>0).sort((a,b)=>distance(a,point)-distance(b,point))[0];
      if(!resource) { this.notice('PICKAXE · face a nearby tree to gather wood');return; }
      const amount=Math.min(20,resource.remaining,999-this.wood);
      resource.remaining-=amount;this.wood+=amount;this.effect('pickup');this.notice(amount?`+${amount} WOOD`:'WOOD FULL');this.emitState();
    }

    reload() {
      const capacity=this.weapon==='shotgun'?6:24;
      if(!this.running||this.paused||this.weapon==='pickaxe'||this.reloadTime>0||this.ammo>=capacity)return;
      if(this.reserve<=0){this.notice('NO RESERVE AMMO · find a supply pickup');return;}
      this.reloadTime=this.weapon==='shotgun'?1.8:1.45;this.notice('RELOADING');this.emitState();
    }

    damageBot(bot, amount, credited) {
      if (!bot.alive || !this.running) return;
      bot.health -= amount;
      if (credited) this.score += 15;
      if (bot.health > 0) return;
      bot.alive = false;
      const p = bot.root.position.clone();
      bot.root.setEnabled(false);
      this.addPickup(p.x, p.z, credited && this.kills % 2 === 0 ? 'ammo' : 'wood');
      if (credited) { this.kills++; this.score += 250; this.notice('SENTRY ELIMINATED · +250'); }
      if (this.settings.mode === 'practice') {
        this.respawns.push({ time: 3.5, x: p.x, z: p.z, index: bot.index });
      } else if (this.bots.every(enemy => !enemy.alive)) this.finish(true);
    }

    takeDamage(amount, storm = false) {
      if (!this.running || this.paused) return;
      if (!storm && this.shield > 0) {
        const absorbed = Math.min(this.shield, amount); this.shield -= absorbed; amount -= absorbed;
      }
      this.health = Math.max(0, this.health - amount); this.effect('hurt');
      if (this.health <= 0) this.finish(false);
    }

    updatePickups(dt) {
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const pickup = this.pickups[i];
        pickup.mesh.rotation.y += dt * 1.3;
        pickup.mesh.position.y = 0.8 + Math.sin(this.elapsed * 2 + pickup.x) * 0.18;
        if (distance(this.hero.root.position, pickup) > 1.8) continue;
        if (pickup.type === 'health' && this.health >= 100) continue;
        if (pickup.type === 'shield' && this.shield >= 100) continue;
        if (pickup.type === 'health') this.health = Math.min(100, this.health + 40);
        if (pickup.type === 'shield') this.shield = Math.min(100, this.shield + 40);
        if (pickup.type === 'ammo') { if(this.weapon==='pickaxe')this.reserves.rifle=Math.min(500,this.reserves.rifle+48);else this.reserve=Math.min(500,this.reserve+(this.weapon==='shotgun'?12:48)); }
        if (pickup.type === 'wood') this.wood = Math.min(999,this.wood + 60);
        this.notice(pickup.type === 'ammo' ? 'AMMO COLLECTED' : pickup.type === 'wood' ? '+60 WOOD' : '+40 ' + pickup.type.toUpperCase());
        this.effect('pickup'); pickup.mesh.dispose(); pickup.halo.dispose(); this.pickups.splice(i, 1);
      }
    }

    buildPosition() {
      const p=this.hero.root.position;
      return { x:Math.round((p.x+Math.sin(this.yaw)*5.5)/5)*5,z:Math.round((p.z+Math.cos(this.yaw)*5.5)/5)*5,
        base:Math.max(0,Math.round(p.y/3.8)*3.8),angle:Math.round(this.yaw/(Math.PI/2))*(Math.PI/2)+this.buildRotation*Math.PI/2 };
    }

    canBuild(p) {
      if(Math.hypot(p.x,p.z)>69 || this.wood<20) return false;
      if(this.obstacles.some(o=>o.type!=='wall'&&distance(o,p)<o.r+1.7))return false;
      if(this.builds.some(b=>distance(b,p)<1 && Math.abs((b.base||0)-p.base)<.2 && b.type===this.buildType && (b.type!=='wall'||Math.abs(Math.sin(b.angle-p.angle))<.1)))return false;
      if(p.base>0 && !this.builds.some(b=>distance(b,p)<7.2 && Math.abs((b.base||0)-p.base)<4.2))return false;
      return true;
    }

    updateBuildPreview() {
      if(!this.ghost)return;
      this.ghost.isVisible=this.building;
      if(!this.building)return;
      const p=this.buildPosition();
      this.ghost.position.set(p.x,p.base+(this.buildType==='floor'?.08:this.buildType==='ramp'?1.7:1.9),p.z);
      this.ghost.rotation.set(this.buildType==='floor'?Math.PI/2:this.buildType==='ramp'?Math.PI/4:0,p.angle,0);
      this.ghost.scaling.set(1,this.buildType==='wall'?1:this.buildType==='floor'?5/3.8:5.2/3.8,.6);
      this.ghostMaterial.diffuseColor=B.Color3.FromHexString(this.canBuild(p)?'#7ce5ff':'#ff687d');
    }

    placeBuild() {
      if(!this.running||this.paused||this.buildCooldown>0)return;
      const p=this.buildPosition();
      if(!this.canBuild(p)){this.notice(this.wood<20?'NEED 20 WOOD · harvest trees with 3':'CANNOT BUILD HERE · move or rotate');return;}
      const root=new B.TransformNode('wooden '+this.buildType,this.scene);
      root.position.set(p.x,p.base+(this.buildType==='floor'?.08:this.buildType==='ramp'?1.7:1.9),p.z);
      root.rotation.set(this.buildType==='floor'?Math.PI/2:this.buildType==='ramp'?Math.PI/4:0,p.angle,0);
      const height=this.buildType==='floor'?5:this.buildType==='ramp'?5.2:3.8;
      for(let i=0;i<7;i++){
        const plank=this.box('timber plank',[.67,height,.18],[(i-3)*.7,0,0],this.mats.wood,root);
        plank.metadata={blocker:true};this.shadows.addShadowCaster(plank);plank.receiveShadows=true;
      }
      for(const y of [-height*.3,height*.3]){
        const brace=this.box('timber brace',[5,.14,.2],[0,y,-.13],this.mats.trunk,root);brace.metadata={blocker:true};
      }
      const obstacle=this.buildType==='wall'?{x:p.x,z:p.z,r:2.5,type:'wall',base:p.base,angle:p.angle}:null;
      if(obstacle)this.obstacles.push(obstacle);
      this.builds.push({...p,type:this.buildType,root,obstacle});
      this.wood-=20;this.buildCooldown=.35;this.score+=5;this.effect('build');this.notice(this.buildType.toUpperCase()+' BUILT · −20 WOOD');
      if(this.builds.length>70){const old=this.builds.shift();old.root.dispose();if(old.obstacle)this.obstacles.splice(this.obstacles.indexOf(old.obstacle),1);}
      this.emitState();
    }

    tracer(from, to, friendly) {
      const mesh = B.MeshBuilder.CreateLines('tracer', { points: [from, to] }, this.scene);
      mesh.color = B.Color3.FromHexString(friendly ? '#fff3a0' : '#ff8179');
      mesh.isPickable = false;
      this.effects.push({ mesh, life: friendly ? 0.08 : 0.14 });
      const spark = B.MeshBuilder.CreateSphere('impact', { diameter: 0.12, segments: 4 }, this.scene);
      spark.position.copyFrom(to); spark.material = friendly ? this.mats.yellow : this.mats.pink; spark.isPickable = false;
      this.effects.push({ mesh: spark, life: 0.12 });
    }

    updateEffects(dt) {
      for (let i = this.effects.length - 1; i >= 0; i--) {
        this.effects[i].life -= dt;
        if (this.effects[i].life <= 0) { this.effects[i].mesh.dispose(); this.effects.splice(i, 1); }
      }
    }

    emitState() {
      if (!this.hero || !this.bots || this.health === undefined) return;
      const p = this.hero.root.position;
      const payload = {
        running: this.running, paused: this.paused, health: this.health, shield: this.shield,
        ammo: this.ammo, reserve: this.reserve, wood: this.wood, kills: this.kills,
        remaining: this.settings.mode==='skybreak'?8-this.targetsHit:1+this.bots.filter(bot => bot.alive).length,
        targetsHit:this.targetsHit,targets:this.targets.filter(t=>t.alive).map(t=>({x:t.x,z:t.z})), weapon:this.weapon, builds:this.builds.length, structures:this.builds.map(b=>({x:b.x,z:b.z,type:b.type})),
        stormSeconds: this.settings.mode==='skybreak'?Math.max(0,Math.ceil(180-this.elapsed)):Math.max(0, Math.ceil(35 - this.elapsed)), stormRadius: this.stormRadius,
        position: { x: p.x, y: p.y, z: p.z }, bots: this.bots.filter(bot => bot.alive).map(bot => ({ x: bot.root.position.x, z: bot.root.position.z })),
        mode: this.settings.mode, building: this.building, buildType: this.buildType,
        reloading: this.reloadTime > 0, elapsed: this.elapsed, score: this.score,
        hit: this.hitCooldown > 0, yaw: this.yaw
      };
      if (this.callbacks.onState) this.callbacks.onState(payload);
    }

    finish(won) {
      if (!this.running) return;
      this.running = false; this.paused = true;
      this.releasePointer();
      this.emitState();
      this.hero.rifle.isVisible = false;
      const result = { won, kills: this.kills, score: this.score + (won ? 1000 : 0) + (won && this.settings.mode==='skybreak'?Math.max(0,Math.floor((180-this.elapsed)*10)):0), elapsed: this.elapsed, mode: this.settings.mode, targetsHit: this.targetsHit };
      if (this.callbacks.onEnd) this.callbacks.onEnd(result);
    }

    pause() { if (!this.running) return; this.paused = true; this.releasePointer(); this.emitState(); }
    resume() { if (!this.running) return; this.paused = false; this.emitState(); }
    stop() { this.running = false; this.paused = false; this.releasePointer(); this.createLobby(); }
    setOutfit(outfit) {
      this.settings.outfit = palette[outfit] ? outfit : 'violet';
      if (this.hero) this.hero.suit.diffuseColor = B.Color3.FromHexString(palette[this.settings.outfit]);
    }
    setSettings(settings = {}) {
      this.settings = { ...this.settings, ...settings };
      this.engine.setHardwareScalingLevel(this.settings.quality === 'low' ? 1.65 : Math.max(1, 1 / Math.min(window.devicePixelRatio || 1, 1.5)));
      if (this.scene) this.scene.shadowsEnabled = this.settings.quality !== 'low';
    }
    notice(text) { if (this.callbacks.onNotice) this.callbacks.onNotice(text); }
    effect(type) { if (this.callbacks.onEffect) this.callbacks.onEffect(type); }
    dispose() {
      this.releasePointer();
      this.listeners.forEach(([target, event, fn]) => target.removeEventListener(event, fn));
      this.engine.stopRenderLoop();
      if (this.scene) this.scene.dispose();
      this.engine.dispose();
    }
  }
  window.RiftWorld = RiftWorld;
})();
