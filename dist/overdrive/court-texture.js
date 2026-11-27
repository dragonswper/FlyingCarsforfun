import * as T from '../vendor/three.module.js';
import {C} from '../constants.js';
import {HOOPS} from '../hoops-physics.js';
// Original painted hardwood. Generated once, shared by both baskets and retained
// across rematches. No screen-space reflections or per-frame texture uploads.
export function createCourtTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1280;
  const ctx = canvas.getContext('2d'),
    sx = 1024 / (C.halfWidth * 2),
    sz = 1280 / (C.halfLength * 2);
  const x = (v) => (v + C.halfWidth) * sx,
    z = (v) => (C.halfLength - v) * sz;
  let seed = 7319;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.fillStyle = '#ae7134';
  ctx.fillRect(0, 0, 1024, 1280);
  for (let col = 0; col < 64; col++) {
    const px = col * 16;
    for (let row = -1; row < 15; row++) {
      const py = row * 96 + (col % 3) * 32,
        light = 49 + random() * 12;
      ctx.fillStyle = `hsl(${31 + random() * 6} 56% ${light}%)`;
      ctx.fillRect(px, py, 16, 96);
      ctx.strokeStyle = '#663d242c';
      ctx.lineWidth = 0.7;
      ctx.strokeRect(px + 0.5, py + 0.5, 15, 95);
      for (let grain = 0; grain < 9; grain++) {
        ctx.strokeStyle = grain % 2 ? '#f6cf8c28' : '#6c402317';
        ctx.beginPath();
        const gx = px + 1 + random() * 14;
        ctx.moveTo(gx, py + 3);
        ctx.bezierCurveTo(gx - 2, py + 30, gx + 2, py + 60, gx, py + 93);
        ctx.stroke();
      }
    }
  }
  const outline = [
    [-25.6, -49],
    [25.6, -49],
    [38.7, -35],
    [38.7, 35],
    [25.6, 49],
    [-25.6, 49],
    [-38.7, 35],
    [-38.7, -35],
  ];
  const path = (points) => {
    ctx.beginPath();
    points.forEach(([a, b], i) =>
      i ? ctx.lineTo(x(a), z(b)) : ctx.moveTo(x(a), z(b)),
    );
    ctx.closePath();
  };
  path(outline);
  ctx.save();
  ctx.clip();
  function arc(cx, cz, r, sign) {
    for (let i = 0; i <= 72; i++) {
      const a = Math.PI - (i / 72) * Math.PI,
        px = cx + Math.cos(a) * r,
        pz = cz - sign * Math.sin(a) * r;
      if (i) ctx.lineTo(x(px), z(pz));
      else ctx.moveTo(x(px), z(pz));
    }
  }
  for (const sign of [-1, 1]) {
    const blue = sign < 0,
      center = sign * HOOPS.z;
    ctx.beginPath();
    arc(0, center, 25, sign);
    ctx.lineTo(x(25), z(sign * 51.2));
    ctx.lineTo(x(-25), z(sign * 51.2));
    ctx.closePath();
    ctx.fillStyle = blue ? '#2973cf24' : '#f46e1e28';
    ctx.fill();
    ctx.fillStyle = blue ? '#176dc9bd' : '#e87524bd';
    ctx.fillRect(
      x(-11),
      Math.min(z(sign * 49), z(sign * 24)),
      22 * sx,
      25 * sz,
    );
    ctx.strokeStyle = '#fff0ce';
    ctx.lineWidth = 2.6;
    ctx.strokeRect(
      x(-11),
      Math.min(z(sign * 49), z(sign * 24)),
      22 * sx,
      25 * sz,
    );
    ctx.beginPath();
    arc(0, center, 25, sign);
    ctx.stroke();
    for (const a of [-25, 25]) {
      ctx.beginPath();
      ctx.moveTo(x(a), z(center));
      ctx.lineTo(x(a), z(sign * 49));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(x(0), z(sign * 24), 6.5 * sx, 6.5 * sz, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    arc(0, center, 5.8, sign);
    ctx.stroke();
  }
  ctx.strokeStyle = '#fff2d7';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(x(-39), z(0));
  ctx.lineTo(x(39), z(0));
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x(0), z(0), 7 * sx, 7 * sz, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#17354a';
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(x(0), z(0));
  ctx.fillStyle = '#edfaff';
  ctx.font = '900 62px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BC', 0, 0);
  ctx.restore();
  ctx.restore();
  path(outline);
  ctx.strokeStyle = '#163044';
  ctx.lineWidth = 13;
  ctx.stroke();
  ctx.strokeStyle = '#fff0d0';
  ctx.lineWidth = 3;
  ctx.stroke();
  const texture = new T.CanvasTexture(canvas);
  texture.name = 'Original_Hoops_Hardwood';
  texture.flipY = false; // The pitch UV already maps +Z to the image's top.
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
