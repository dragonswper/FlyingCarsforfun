import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { REGIONS } from "./world.js";
import { ARMOR_STYLES, WEAPON_FINISHES } from "./expedition.js";

let artPromise;
function loadArt() {
  return (artPromise ??= new GLTFLoader()
    .loadAsync(import.meta.env.BASE_URL + "assets/expedition-props.glb")
    .then((gltf) => gltf.scene));
}

export function applyEquipmentStyle(rig, actor, weaponId) {
  const key = `${actor.armorStyle}:${actor.weaponFinish}:${actor.role}:${weaponId}:${Boolean(rig.knight)}`;
  if (rig.equipmentStyle === key) return;
  rig.equipmentStyle = key;
  const armor = ARMOR_STYLES.find(
    (item) => item.id === actor.armorStyle,
  )?.color;
  const finish = WEAPON_FINISHES.find(
    (item) => item.id === actor.weaponFinish,
  )?.color;
  function tint(root, color, metalOnly) {
    if (!color) return;
    root.traverse((part) => {
      if (
        !part.isMesh ||
        Array.isArray(part.material) ||
        (metalOnly && !/steel|iron|plate|mail/i.test(part.material.name))
      )
        return;
      if (!part.userData.styleMaterial) {
        part.material = part.material.clone();
        part.userData.styleMaterial = true;
      }
      part.material.color.set(color);
    });
  }
  if (actor.armorStyle && actor.armorStyle !== "plain" && rig.knight)
    tint(rig.body, armor, true);
  tint(rig.weapons, finish, false);
  if (actor.role) {
    const region = REGIONS.find((r) => r.id === actor.regionId),
      base = new THREE.Color(region?.cloth || "#415d4f"),
      roleColor = {
        support: "#63977b",
        flanker: "#9e6953",
        captain: "#a88c52",
      }[actor.role];
    if (roleColor)
      rig.body.traverse((part) => {
        if (
          part.isMesh &&
          !Array.isArray(part.material) &&
          part.material.color.equals(base)
        ) {
          part.material = part.material.clone();
          part.material.color.set(roleColor);
        }
      });
  }
}

export function createExpeditionView(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const entries = new Map();
  let art, lastWorld;
  function clear() {
    for (const object of entries.values()) {
      object.removeFromParent();
      object.traverse((part) => {
        if (part.isMesh) {
          part.material.dispose();
          if (part.userData.ownedGeometry) part.geometry.dispose();
        }
      });
    }
    entries.clear();
  }
  let loading = false;
  function prepare() {
    if (loading) return;
    loading = true;
    loadArt()
      .then((scene) => {
        art = scene;
        clear();
      })
      .catch(() => {});
  }
  function item(id, kind) {
    let value = entries.get(id);
    if (!value) {
      const prototype = art?.getObjectByName(kind);
      value = prototype
        ? prototype.clone(true)
        : new THREE.Mesh(
            new THREE.OctahedronGeometry(0.5),
            new THREE.MeshLambertMaterial({ color: "#cda961" }),
          );
      if (!prototype) value.userData.ownedGeometry = true;
      value.position.set(0, 0, 0);
      value.traverse((part) => {
        if (part.isMesh) {
          if (prototype) part.material = part.material.clone();
          part.castShadow = false;
        }
      });
      root.add(value);
      entries.set(id, value);
    }
    value.visible = true;
    return value;
  }
  function ring(id, radius, color) {
    let mesh = entries.get(id);
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.045, 5, 64),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.7,
          depthWrite: false,
        }),
      );
      mesh.userData.ownedGeometry = true;
      mesh.rotation.x = -Math.PI / 2;
      root.add(mesh);
      entries.set(id, mesh);
    }
    mesh.visible = true;
    mesh.material.color.set(color);
    return mesh;
  }
  function at(object, world, x, z, lift = 0) {
    object.position.set(x, world.height(x, z) + lift, z);
  }
  return {
    root,
    update(game, viewer = game.player, reducedMotion = false) {
      if (game.world !== lastWorld) {
        clear();
        lastWorld = game.world;
      }
      for (const value of entries.values()) value.visible = false;
      const campaign = game.campaign;
      if (!campaign) return null;
      prepare();
      for (const objective of campaign.objectives) {
        const region = REGIONS.find(
          (r) => r.id === (objective.currentEra || objective.eraId),
        );
        const portal = item("portal-" + objective.team, "portal");
        at(portal, game.world, objective.x + 2, objective.z, 0);
        portal.rotation.y = reducedMotion ? 0 : game.sceneTime * 0.12;
        const kind = {
          flintwake: "totem",
          sunscar: "obelisk",
          ironwood: "standard",
          redcanopy: "standard",
          frostfall: "standard",
          ashline: "obelisk",
          glassreach: "beacon",
        }[region.id];
        for (let n = 0; n < 2; n++) {
          const dressing = item(
            `dressing-${objective.team}-${region.id}-${n}`,
            kind,
          );
          at(dressing, game.world, objective.x + (n ? 5 : -5), objective.z + 3);
        }
        const boundary = ring("boundary-" + objective.team, 18, region.accent);
        at(boundary, game.world, objective.x, objective.z, 0.1);
        const boss = game.actors.find((a) => a.id === objective.bossId);
        if (boss?.alive) {
          const crown = item("crown-" + boss.id, "crown");
          at(crown, game.world, boss.x, boss.z, 2.8);
          crown.rotation.y = boss.facing;
          if (boss.specialUntil > boss.clock) {
            const warning = ring(
              "slam-" + boss.id,
              3.7,
              boss.enraged ? "#ff624a" : "#ffb45b",
            );
            at(warning, game.world, boss.x, boss.z, 0.14);
            warning.material.opacity =
              0.4 + 0.4 * Math.sin(game.sceneTime * 20) ** 2;
          }
        }
        if (!objective.unlocked) continue;
        if (objective.kind === "escort") {
          const wagon = item("wagon-" + objective.team, "wagon");
          at(wagon, game.world, objective.wagon.x, objective.wagon.z, 0.1);
          const next = objective.route[objective.routeIndex];
          if (next)
            wagon.rotation.y = Math.atan2(
              next.x - objective.wagon.x,
              next.z - objective.wagon.z,
            );
          wagon.traverse((part) => {
            if (/wheel/i.test(part.name))
              part.rotation.x =
                game.sceneTime * (objective.wagon.active ? 3 : 0);
          });
        } else
          for (const node of objective.nodes) {
            if (objective.kind === "siege" && !node.health) continue;
            const prop = item(
              node.id,
              objective.kind === "siege" ? "seal" : "beacon",
            );
            at(prop, game.world, node.x, node.z);
            if (node.channel) {
              const pulse = ring("channel-" + node.id, 1.2, "#a8efd3");
              at(pulse, game.world, node.x, node.z, 0.12);
            }
            if (node.active) prop.scale.setScalar(0.72);
          }
        if (game.actors.some((a) => a.human && a.relicChoices?.length)) {
          const chest = item("relic-" + objective.team, "relic");
          at(chest, game.world, objective.x - 2, objective.z, 0.2);
        }
      }
      return campaign.objectives.find(
        (objective) =>
          Math.hypot(objective.x - viewer.x, objective.z - viewer.z) < 20,
      );
    },
    dispose() {
      root.removeFromParent();
      clear();
    },
  };
}
