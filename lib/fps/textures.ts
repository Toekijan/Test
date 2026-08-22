import * as THREE from "three";

/**
 * Procedural PBR-ish texture generation. No external asset pipeline is available,
 * so every material map (albedo/normal/roughness/AO) is synthesized on <canvas>
 * at load time. Normal maps are derived from a height field via a Sobel filter
 * so surfaces still catch rim/point light correctly.
 */

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  return { canvas, ctx };
}

// Simple deterministic value-noise (no deps).
function makeNoise2D(seed: number) {
  const rand = (x: number, y: number) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
    return s - Math.floor(s);
  };
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const tl = rand(xi, yi);
    const tr = rand(xi + 1, yi);
    const bl = rand(xi, yi + 1);
    const br = rand(xi + 1, yi + 1);
    const u = smooth(xf);
    const v = smooth(yf);
    return lerp(lerp(tl, tr, u), lerp(bl, br, u), v);
  };
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves: number) {
  let total = 0;
  let amp = 0.5;
  let freq = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    total += noise(x * freq, y * freq) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total / max;
}

function heightToNormalMap(height: Float32Array, size: number, strength = 2.2): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const u = at(x, y - 1);
      const d = at(x, y + 1);
      const nx = (l - r) * strength;
      const ny = (u - d) * strength;
      const nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const i = (y * size + x) * 4;
      data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, size, size);
}

export interface PbrMapSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  aoMap: THREE.CanvasTexture;
}

// Tiling is applied per-geometry via world-space UV remapping (see world.ts's
// remapBoxUV) rather than a single material.repeat, since a shared material is
// reused across boxes of very different proportions (a 34-unit wall and a
// 1.2-unit crate) — a uniform repeat stretches/aliases badly on the elongated
// ones. Keep the texture's own repeat at identity.
function finalize(tex: THREE.CanvasTexture) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return tex;
}

/** Brushed / grimy concrete floor panel. */
export function makeConcreteMaps(): PbrMapSet {
  const size = 512;
  const noise = makeNoise2D(11);
  const { canvas, ctx } = makeCanvas(size);
  const height = new Float32Array(size * size);
  const base = 58;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(noise, x / 90, y / 90, 5);
      const grain = fbm(noise, x / 6 + 500, y / 6 + 500, 2) * 0.08;
      const v = base + n * 46 + grain * 40;
      height[y * size + x] = n;
      const shade = Math.max(0, Math.min(255, v));
      ctx.fillStyle = `rgb(${shade},${shade * 0.98},${shade * 0.94})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // panel seams
  ctx.strokeStyle = "rgba(10,10,10,0.5)";
  ctx.lineWidth = 2;
  const cell = size / 4;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  // scuff streaks
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.08})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    const x0 = Math.random() * size;
    const y0 = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + (Math.random() - 0.5) * 120, y0 + (Math.random() - 0.5) * 40);
    ctx.stroke();
  }

  const map = finalize(new THREE.CanvasTexture(canvas));
  map.colorSpace = THREE.SRGBColorSpace;

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = size;
  normalCanvas.height = size;
  normalCanvas.getContext("2d")!.putImageData(heightToNormalMap(height, size, 3.2), 0, 0);
  const normalMap = finalize(new THREE.CanvasTexture(normalCanvas));

  const { canvas: roughCanvas, ctx: roughCtx } = makeCanvas(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(noise, x / 40 + 1000, y / 40 + 1000, 3);
      const v = 150 + n * 90;
      roughCtx.fillStyle = `rgb(${v},${v},${v})`;
      roughCtx.fillRect(x, y, 1, 1);
    }
  }
  const roughnessMap = finalize(new THREE.CanvasTexture(roughCanvas));

  const { canvas: aoCanvas, ctx: aoCtx } = makeCanvas(size);
  aoCtx.fillStyle = "#fff";
  aoCtx.fillRect(0, 0, size, size);
  aoCtx.strokeStyle = "rgba(0,0,0,0.35)";
  aoCtx.lineWidth = 4;
  for (let i = 0; i <= 4; i++) {
    aoCtx.beginPath();
    aoCtx.moveTo(i * cell, 0);
    aoCtx.lineTo(i * cell, size);
    aoCtx.stroke();
    aoCtx.beginPath();
    aoCtx.moveTo(0, i * cell);
    aoCtx.lineTo(size, i * cell);
    aoCtx.stroke();
  }
  const aoMap = finalize(new THREE.CanvasTexture(aoCanvas));

  return { map, normalMap, roughnessMap, aoMap };
}

/** Industrial metal-panel wall with rivets and rust streaks. */
export function makeMetalPanelMaps(): PbrMapSet {
  const size = 512;
  const noise = makeNoise2D(77);
  const { canvas, ctx } = makeCanvas(size);
  const height = new Float32Array(size * size);
  const panelCols = 3;
  const panelRows = 3;
  const pw = size / panelCols;
  const ph = size / panelRows;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(noise, x / 30, y / 30, 4);
      const brushed = Math.sin(x * 0.9) * 0.02;
      const v = 90 + n * 30 + brushed * 60;
      height[y * size + x] = n * 0.3 + (Math.abs((x % pw) - pw / 2) < 2 || Math.abs((y % ph) - ph / 2) < 2 ? 0.4 : 0);
      const shade = Math.max(0, Math.min(255, v));
      ctx.fillStyle = `rgb(${shade * 0.85},${shade * 0.87},${shade * 0.9})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // panel bevels
  ctx.strokeStyle = "rgba(5,5,8,0.8)";
  ctx.lineWidth = 3;
  for (let i = 0; i <= panelCols; i++) {
    ctx.beginPath();
    ctx.moveTo(i * pw, 0);
    ctx.lineTo(i * pw, size);
    ctx.stroke();
  }
  for (let j = 0; j <= panelRows; j++) {
    ctx.beginPath();
    ctx.moveTo(0, j * ph);
    ctx.lineTo(size, j * ph);
    ctx.stroke();
  }
  // rivets
  for (let py = 0; py < panelRows; py++) {
    for (let px = 0; px < panelCols; px++) {
      const cx = px * pw + 14;
      const cy = py * ph + 14;
      for (const [ox, oy] of [
        [0, 0],
        [pw - 28, 0],
        [0, ph - 28],
        [pw - 28, ph - 28],
      ]) {
        const rx = cx + ox;
        const ry = cy + oy;
        const grad = ctx.createRadialGradient(rx - 1, ry - 1, 0, rx, ry, 4);
        grad.addColorStop(0, "#e8e8ea");
        grad.addColorStop(1, "#3a3a3e");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(rx, ry, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // rust streaks
  for (let i = 0; i < 14; i++) {
    const x0 = Math.random() * size;
    ctx.fillStyle = `rgba(90,45,20,${0.05 + Math.random() * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(x0, Math.random() * size, 3 + Math.random() * 4, 30 + Math.random() * 80, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const map = finalize(new THREE.CanvasTexture(canvas));
  map.colorSpace = THREE.SRGBColorSpace;

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = size;
  normalCanvas.height = size;
  normalCanvas.getContext("2d")!.putImageData(heightToNormalMap(height, size, 1.6), 0, 0);
  const normalMap = finalize(new THREE.CanvasTexture(normalCanvas));

  const { canvas: roughCanvas, ctx: roughCtx } = makeCanvas(size);
  roughCtx.fillStyle = "#777";
  roughCtx.fillRect(0, 0, size, size);
  for (let i = 0; i < 300; i++) {
    roughCtx.fillStyle = `rgba(${Math.random() > 0.5 ? 40 : 210},${Math.random() > 0.5 ? 40 : 210},${Math.random() > 0.5 ? 40 : 210},0.15)`;
    roughCtx.fillRect(Math.random() * size, Math.random() * size, 2, 20 + Math.random() * 40);
  }
  const roughnessMap = finalize(new THREE.CanvasTexture(roughCanvas));

  const { canvas: aoCanvas, ctx: aoCtx } = makeCanvas(size);
  aoCtx.fillStyle = "#fff";
  aoCtx.fillRect(0, 0, size, size);
  aoCtx.strokeStyle = "rgba(0,0,0,0.5)";
  aoCtx.lineWidth = 6;
  for (let i = 0; i <= panelCols; i++) {
    aoCtx.beginPath();
    aoCtx.moveTo(i * pw, 0);
    aoCtx.lineTo(i * pw, size);
    aoCtx.stroke();
  }
  for (let j = 0; j <= panelRows; j++) {
    aoCtx.beginPath();
    aoCtx.moveTo(0, j * ph);
    aoCtx.lineTo(size, j * ph);
    aoCtx.stroke();
  }
  const aoMap = finalize(new THREE.CanvasTexture(aoCanvas));

  return { map, normalMap, roughnessMap, aoMap };
}

/** Hazard-striped/painted trim strip used as an accent. */
export function makeHazardTrimMaps(): PbrMapSet {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  const stripe = size / 8;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#e8b400" : "#111111";
    ctx.save();
    ctx.translate(i * stripe, 0);
    ctx.transform(1, 0, -0.6, 1, 0, 0);
    ctx.fillRect(-40, 0, stripe + 80, size);
    ctx.restore();
  }
  const map = finalize(new THREE.CanvasTexture(canvas));
  map.colorSpace = THREE.SRGBColorSpace;

  const height = new Float32Array(size * size).fill(0.5);
  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = size;
  normalCanvas.height = size;
  normalCanvas.getContext("2d")!.putImageData(heightToNormalMap(height, size, 0.2), 0, 0);
  const normalMap = finalize(new THREE.CanvasTexture(normalCanvas));

  const { canvas: roughCanvas, ctx: roughCtx } = makeCanvas(size);
  roughCtx.fillStyle = "#555";
  roughCtx.fillRect(0, 0, size, size);
  const roughnessMap = finalize(new THREE.CanvasTexture(roughCanvas));

  const { canvas: aoCanvas, ctx: aoCtx } = makeCanvas(size);
  aoCtx.fillStyle = "#fff";
  aoCtx.fillRect(0, 0, size, size);
  const aoMap = finalize(new THREE.CanvasTexture(aoCanvas));

  return { map, normalMap, roughnessMap, aoMap };
}

/** Wood-crate texture for cover props. */
export function makeCrateMaps(): PbrMapSet {
  const size = 256;
  const noise = makeNoise2D(33);
  const { canvas, ctx } = makeCanvas(size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const grain = Math.sin(x * 0.25 + fbm(noise, x / 20, y / 100, 3) * 4) * 0.5 + 0.5;
      const n = fbm(noise, x / 60, y / 60, 3);
      const v = 95 + grain * 28 + n * 22;
      height[y * size + x] = grain * 0.5 + n * 0.3;
      ctx.fillStyle = `rgb(${v + 14},${v * 0.86 + 12},${v * 0.66 + 8})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.strokeStyle = "rgba(20,10,5,0.7)";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, size - 8, size - 8);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();

  const map = finalize(new THREE.CanvasTexture(canvas));
  map.colorSpace = THREE.SRGBColorSpace;

  const normalCanvas = document.createElement("canvas");
  normalCanvas.width = size;
  normalCanvas.height = size;
  normalCanvas.getContext("2d")!.putImageData(heightToNormalMap(height, size, 2.0), 0, 0);
  const normalMap = finalize(new THREE.CanvasTexture(normalCanvas));

  const { canvas: roughCanvas, ctx: roughCtx } = makeCanvas(size);
  roughCtx.fillStyle = "#8a8a8a";
  roughCtx.fillRect(0, 0, size, size);
  const roughnessMap = finalize(new THREE.CanvasTexture(roughCanvas));

  const { canvas: aoCanvas, ctx: aoCtx } = makeCanvas(size);
  aoCtx.fillStyle = "#fff";
  aoCtx.fillRect(0, 0, size, size);
  const aoMap = finalize(new THREE.CanvasTexture(aoCanvas));

  return { map, normalMap, roughnessMap, aoMap };
}

export function makeSkyGradientTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#0a1a33");
  grad.addColorStop(0.35, "#1c3a63");
  grad.addColorStop(0.62, "#a8623a");
  grad.addColorStop(0.78, "#e8935a");
  grad.addColorStop(1, "#2a2018");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Soft radial-gradient blob used as a cheap fake contact shadow under props/
 * characters — a backstop that guarantees objects read as grounded even where
 * the real-time shadow map or SSAO don't resolve a hard contact shadow.
 */
export function makeBlobShadowTexture(): THREE.CanvasTexture {
  // Opaque grayscale (not alpha-based) so it composites via THREE.MultiplyBlending:
  // white edges leave the floor untouched, the dark center darkens it. Sidesteps
  // canvas-alpha/premultiply edge cases that made an alpha-transparent version a
  // silent no-op in testing.
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "#3a3a3a");
  grad.addColorStop(0.55, "#7a7a7a");
  grad.addColorStop(1, "#ffffff");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
