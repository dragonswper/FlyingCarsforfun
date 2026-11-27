function rgb(value) {
  const integer = parseInt(value.slice(1), 16);
  return [integer >> 16 & 255, integer >> 8 & 255, integer & 255];
}

export function paintWorldMap(canvas, world, overlay = 'biome', { markers = true, border = 0 } = {}) {
  const target = canvas.getContext('2d');
  if (!target) return;
  target.fillStyle = '#27221b';
  target.fillRect(0, 0, canvas.width, canvas.height);
  const canvasWidth = canvas.width - border * 2;
  const canvasHeight = canvas.height - border * 2;
  const bins = 88;
  const samples = document.createElement('canvas');
  samples.width = samples.height = bins;
  const ctx = samples.getContext('2d');
  if (!ctx) return;
  const picture = ctx.createImageData(bins, bins);
  const palette = world.regions.map((region) => [rgb(region.ground), rgb(region.groundLight)]);
  const density = new Uint8Array(22 * 22);
  for (const prop of world.props) {
    const a = Math.max(0, Math.min(21, Math.floor((prop.x / world.size + .5) * 22)));
    const b = Math.max(0, Math.min(21, Math.floor((prop.z / world.size + .5) * 22)));
    density[b * 22 + a]++;
  }
  for (let row = 0; row < bins; row++) for (let col = 0; col < bins; col++) {
    const x = world.size * ((col + .5) / bins - .5);
    const z = world.size * ((row + .5) / bins - .5);
    const elevation = world.height(x, z);
    const grade = world.height(x + 1, z + 1) - elevation;
    const contour = elevation / 2.05;
    const tone = Math.max(.12, Math.min(.88, .31 + elevation * .046 + grade * .18))
      * (contour - Math.floor(contour) < .11 ? .77 : 1);
    const weights = world.biomeWeights(x, z);
    const route = world.pathAt(x, z);
    const water = world.waterAt(x, z) !== null;
    const wet = [66, 113, 116];
    const track = [190, 163, 103];
    const at = (row * bins + col) * 4;
    for (let channel = 0; channel < 3; channel++) {
      let c = weights.reduce((sum, weight, i) => sum
        + weight * (palette[i][0][channel] * (1 - tone) + palette[i][1][channel] * tone), 0);
      if (overlay === 'height') c = 38 + Math.max(0, Math.min(204, elevation * 14));
      if (overlay === 'slope') c = [56, 72, 67][channel] + Math.min(1, Math.abs(grade)) * [153, 90, 27][channel];
      if (overlay === 'scatter') c = c * .62 + Math.min(6, density[Math.floor(row / 4) * 22 + Math.floor(col / 4)]) * 23;
      if (overlay === 'paths' || overlay === 'cores') c *= .65;
      if (overlay !== 'height' && overlay !== 'slope') {
        const strength = route * (overlay === 'paths' ? .89 : .37);
        c = water ? wet[channel] : c * (1 - strength) + track[channel] * strength;
        if (overlay === 'biome') {
          const paper = [215, 188, 139][channel];
          const ink = water ? wet[channel] : c * (route > .6 ? .63 : .86);
          c = paper * .67 + ink * .33 + (Math.sin(col * 11.7 + row * 8.3) + 1) * 2.3;
        }
      }
      picture.data[at + channel] = c;
    }
    picture.data[at + 3] = 255;
  }
  ctx.putImageData(picture, 0, 0);
  target.imageSmoothingEnabled = true;
  target.drawImage(samples, border, border, canvasWidth, canvasHeight);

  if (!markers) return;
  for (const [slot, fort] of world.forts.entries()) {
    const x = border + (fort.x / world.size + .5) * canvasWidth;
    const z = border + (fort.z / world.size + .5) * canvasHeight;
    const size = Math.max(2, Math.min(canvasWidth, canvasHeight) * .034);
    target.fillStyle = slot === 0 ? '#f5dfad' : '#c67352';
    target.strokeStyle = '#31241d';
    target.lineWidth = 1.6;
    target.beginPath();
    target.moveTo(x, z - size);
    target.lineTo(x + size, z);
    target.lineTo(x, z + size);
    target.lineTo(x - size, z);
    target.closePath();
    target.fill();
    target.stroke();
    if (overlay === 'biome' && canvasWidth > 240) {
      target.font = `${Math.max(13, Math.round(canvasWidth / 24))}px Caveat, cursive`;
      target.textAlign = 'center';
      target.fillStyle = '#453121';
      target.fillText(fort.region.name, x, z + size + 13, canvasWidth / 2 - 10);
    }
    if (overlay === 'cores') target.strokeRect(x - size * 2, z - size * 2, size * 4, size * 4);
  }
}
