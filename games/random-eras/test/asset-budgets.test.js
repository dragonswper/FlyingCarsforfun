import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../public/", import.meta.url));

function gltf(name) {
  const file = readFileSync(root + name);
  assert.equal(file.toString("ascii", 0, 4), "glTF");
  return JSON.parse(file.subarray(20, 20 + file.readUInt32LE(12)));
}

function triangles(doc, index) {
  const node = doc.nodes[index];
  const primitives = doc.meshes[node.mesh]?.primitives ?? [];
  return (
    primitives.reduce((count, primitive) => {
      assert.equal(primitive.mode ?? 4, 4);
      return (
        count +
        doc.accessors[primitive.indices ?? primitive.attributes.POSITION]
          .count /
          3
      );
    }, 0) +
    (node.children ?? []).reduce(
      (count, child) => count + triangles(doc, child),
      0,
    )
  );
}

function webpSize(file) {
  const type = file.toString("ascii", 12, 16);
  if (type === "VP8X")
    return [1 + file.readUIntLE(24, 3), 1 + file.readUIntLE(27, 3)];
  if (type === "VP8L") {
    const dimensions = file.readUInt32LE(21);
    return [1 + (dimensions & 0x3fff), 1 + ((dimensions >>> 14) & 0x3fff)];
  }
  assert.equal(type, "VP8 ");
  return [file.readUInt16LE(26) & 0x3fff, file.readUInt16LE(28) & 0x3fff];
}

test("Blender exports fit the runtime triangle, texture and file budgets", () => {
  const knight = gltf("knight.glb");
  assert.ok(
    knight.scenes[knight.scene].nodes.reduce(
      (n, index) => n + triangles(knight, index),
      0,
    ) < 15000,
  );
  assert.ok(statSync(root + "knight.glb").size < 2_000_000);
  for (const [name, max] of [
    ["weapons.glb", 2000],
    ["map-kit.glb", 1500],
    ["era-props.glb", 1500],
  ]) {
    const doc = gltf(name);
    for (const index of doc.scenes[doc.scene].nodes) {
      assert.ok(triangles(doc, index) < max, doc.nodes[index].name);
      if (name === "weapons.glb") {
        const children = doc.nodes[index].children.map(
          (child) => doc.nodes[child].name,
        );
        assert.ok(children.includes(doc.nodes[index].name + "_grip"));
        assert.ok(children.includes(doc.nodes[index].name + "_tip"));
      }
    }
    assert.equal(doc.images?.length ?? 0, 0);
  }
  let size = 0;
  for (const entry of readdirSync(root, { recursive: true })) {
    const info = statSync(root + entry);
    if (!info.isFile()) continue;
    size += info.size;
    if (entry.endsWith(".webp"))
      assert.ok(
        Math.max(...webpSize(readFileSync(root + entry))) <= 1024,
        entry,
      );
  }
  assert.ok(size < 8_000_000);
});

test("original Expedition props keep their named groups and small, self-contained geometry", () => {
  const doc = gltf("assets/expedition-props.glb");
  const names = doc.scenes[doc.scene].nodes.map(
    (index) => doc.nodes[index].name,
  );
  assert.deepEqual(
    [...names].sort(),
    [
      "wagon",
      "seal",
      "beacon",
      "portal",
      "crown",
      "relic",
      "standard",
      "totem",
      "obelisk",
    ].sort(),
  );
  for (const index of doc.scenes[doc.scene].nodes)
    assert.ok(triangles(doc, index) < 1500, doc.nodes[index].name);
  assert.equal(doc.images?.length ?? 0, 0);
  assert.ok(doc.buffers.every((buffer) => !buffer.uri));
  assert.ok(statSync(root + "assets/expedition-props.glb").size < 160_000);
  assert.ok(doc.nodes.filter((node) => /^wheel/.test(node.name)).length >= 4);
});
