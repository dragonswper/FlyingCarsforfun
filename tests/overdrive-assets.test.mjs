import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {validateOriginalArena} from '../dist/original-arena-assets.js';
const loader = new GLTFLoader();
for (const id of ['skyline', 'range', 'velocity'])
  test(
    id +
      ' is an original calibrated Blender venue with eight material batches and no embedded textures',
    async () => {
      const bytes = readFileSync(
          new URL('../dist/assets/maps/' + id + '.glb', import.meta.url),
        ),
        report = JSON.parse(
          readFileSync(
            new URL('../dist/assets/maps/' + id + '.json', import.meta.url),
          ),
        ),
        doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12))),
        scene = (
          await loader.parseAsync(
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.length,
            ),
            '',
          )
        ).scene;
      assert.equal(validateOriginalArena(scene, id), true);
      assert.equal(doc.meshes.length, 8);
      assert.equal(doc.images, undefined);
      assert.ok(report.triangles < 25000);
      assert.ok(report.sourceProps > 1000);
      assert.equal(
        report.sha256,
        createHash('sha256').update(bytes).digest('hex'),
      );
      assert.ok(bytes.length < 1.5e6);
      assert.ok(
        statSync(new URL('../' + report.sourceBlend, import.meta.url)).size >
          50000,
      );
    },
  );
test('Hoops uses an original Blender basket whose rim and backboard match the authoritative dimensions', async () => {
  const bytes = readFileSync(
      new URL('../dist/assets/overdrive/hoops-basket.glb', import.meta.url),
    ),
    gltf = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
      '',
    );
  const rim = gltf.scene.getObjectByName('Hoops_Rim'),
    board = gltf.scene.getObjectByName('Hoops_Backboard');
  assert.ok(rim && board);
  rim.geometry.computeBoundingBox();
  board.geometry.computeBoundingBox();
  assert.ok(Math.abs(rim.position.y - 5.8) < 0.001);
  assert.ok(Math.abs(board.position.z - 6) < 0.001);
  assert.ok(
    Math.abs(
      board.geometry.boundingBox.max.x - board.geometry.boundingBox.min.x - 14,
    ) < 0.001,
  );
  assert.equal(rim.userData.originalArtwork, true);
  assert.ok(bytes.length < 100000);
});
