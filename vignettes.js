import * as THREE from 'three';
import { WORLD, STRATA, COL } from '../config.js';

export const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const bump = (x, z, cx, cz, rx, rz, H) => {
  const dx = (x - cx) / rx, dz = (z - cz) / rz;
  const t = 1 - (dx * dx + dz * dz);
  return t <= 0 ? 0 : H * t * t * (3 - 2 * t);
};
const terrace = (h, s) => {
  const u = h / s, f = Math.floor(u);
  return s * (f + sstep(0.78, 1, u - f));
};

export const PIT = { cx: 81, cz: -30, hx: 13, hz: 11, depth: 8 };
export const DAM = { cx: 27, zc: -36, x0: 10, x1: 44, crest: 8, water: 6.3 };

export function H(x, z) {
  let h = 0;
  // Zona A: colina do emboque
  h += bump(x, z, -90, -38, 14, 20, 15) + bump(x, z, -99, -47, 6, 8, 5);
  // Zona F: encosta em bancadas
  h += terrace(bump(x, z, -27, -38, 20, 20, 12.6), 2.4);
  // Zona H: vale da barragem
  {
    const a = Math.abs(x - DAM.cx);
    const m = sstep(-28, -40, z);
    const side = sstep(5, 13, a) * (1 - sstep(19, 24, a)) * 13;
    const rise = Math.max(0, -36 - z) * 0.1 * (1 - sstep(4, 10, a));
    const back = sstep(-46, -52, z) * (1 - sstep(-54, -58, z)) * 13 * (1 - sstep(19, 24, a));
    h += (rise + side) * m + back;
  }
  // Zona D: escavação urbana
  {
    const dx = Math.max(Math.abs(x - PIT.cx) - PIT.hx, 0);
    const dz = Math.max(Math.abs(z - PIT.cz) - PIT.hz, 0);
    const d = Math.hypot(dx, dz);
    let p = -PIT.depth * (1 - sstep(0, 1.2, d));
    if (x >= 84 && x <= 91 && z > PIT.cz + PIT.hz - 2.5 && z <= -8) {
      const r = -PIT.depth + ((z - (PIT.cz + PIT.hz)) / (-8 - (PIT.cz + PIT.hz))) * PIT.depth;
      p = Math.max(p, Math.min(0, r));
    }
    h += p;
  }
  return h;
}

// fronteiras entre camadas (y) — levemente onduladas
const BASE = [-2.2, -7, -12, -17, -22];
const nz = (x, z, k) =>
  Math.sin(x * 0.07 + z * 0.045 + k * 1.7) * 0.5 +
  Math.sin(x * 0.031 - z * 0.06 + k * 2.3) * 0.35 +
  Math.sin(x * 0.13 + z * 0.11 + k) * 0.15;
export function bounds(x, z) {
  const b = BASE.map((y, i) => y + nz(x, z, i + 1) * (0.9 + i * 0.25));
  const naTop = -9.6 + nz(x, z, 9) * 0.35;
  // [fundo topo→argila, argila→areia, areia→NA, NA, NA→silte, silte→rocha alt, rocha alt→rocha]
  return { b1: b[0], b2: b[1], naTop, naBot: naTop - 0.55, b3: b[2], b4: b[3], b5: b[4] };
}

const cTop = new THREE.Color(COL.clay), cGrass = new THREE.Color(COL.grass);
const strataC = STRATA.map((s) => new THREE.Color(s.cor));
function colorOf(x, y, z, out) {
  if (y > -0.25) {
    const g = sstep(0.4, 4.5, y);
    out.copy(cTop).lerp(cGrass, g);
    const n = nz(x * 1.7, z * 1.7, 3) * 0.018;
    out.r += n; out.g += n; out.b += n;
    return out;
  }
  const B = bounds(x, z);
  if (y > B.b1) return out.copy(strataC[0]);
  if (y > B.b2) return out.copy(strataC[1]);
  if (y > B.naTop) return out.copy(strataC[2]);
  return out.copy(strataC[2]);
}

export function createTerrain() {
  const group = new THREE.Group();
  const W = WORLD.w, D = WORLD.d;
  const nx = W, nzc = D;
  const verts = (nx + 1) * (nzc + 1);
  const pos = new Float32Array(verts * 3), col = new Float32Array(verts * 3);
  const idx = [];
  const c = new THREE.Color();
  for (let j = 0; j <= nzc; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = -W / 2 + i, z = -D / 2 + j, y = H(x, z);
      const k = j * (nx + 1) + i;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      colorOf(x, y, z, c);
      if (y > -0.25) { const sl = Math.abs(H(x + 1, z) - H(x - 1, z)) + Math.abs(H(x, z + 1) - H(x, z - 1)); const dk = 1 - Math.min(0.28, sl * 0.075); c.multiplyScalar(dk); }
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
  }
  for (let j = 0; j < nzc; j++) {
    for (let i = 0; i < nx; i++) {
      const v00 = j * (nx + 1) + i, v10 = v00 + 1, v01 = v00 + nx + 1, v11 = v01 + 1;
      idx.push(v00, v01, v10, v10, v01, v11);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const top = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  top.receiveShadow = true; top.castShadow = true;
  group.add(top);

  // paredes laterais com as camadas de solo (o "corte" do diorama)
  const edges = [
    { pts: (t) => [-W / 2 + t, D / 2], n: W }, // frente, x crescente
    { pts: (t) => [W / 2 - t, -D / 2], n: W }, // fundo, x decrescente
    { pts: (t) => [-W / 2, -D / 2 + t], n: D }, // esquerda, z crescente
    { pts: (t) => [W / 2, D / 2 - t], n: D }, // direita, z decrescente
  ];
  const wpos = [], wcol = [], widx = [];
  let vi = 0;
  const layerCols = [0, 1, 2, 3, 4, 5, 6, 7];
  for (const e of edges) {
    for (let t = 0; t < e.n; t++) {
      const [xa, za] = e.pts(t), [xb, zb] = e.pts(t + 1);
      const ya = H(xa, za), yb = H(xb, zb);
      const Ba = bounds(xa, za), Bb = bounds(xb, zb);
      const colsA = [ya, Ba.b1, Ba.b2, Ba.naTop, Ba.naBot, Ba.b3, Ba.b4, Ba.b5, WORLD.bottom];
      const colsB = [yb, Bb.b1, Bb.b2, Bb.naTop, Bb.naBot, Bb.b3, Bb.b4, Bb.b5, WORLD.bottom];
      for (let L = 0; L < 8; L++) {
        const cc = strataC[layerCols[L]];
        const q = [
          [xa, colsA[L], za], [xa, colsA[L + 1], za],
          [xb, colsB[L], zb], [xb, colsB[L + 1], zb],
        ];
        for (const p of q) { wpos.push(p[0], p[1], p[2]); wcol.push(cc.r, cc.g, cc.b); }
        widx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
        vi += 4;
      }
    }
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  wg.setAttribute('color', new THREE.Float32BufferAttribute(wcol, 3));
  wg.setIndex(widx);
  wg.computeVertexNormals();
  const walls = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  walls.receiveShadow = true; walls.castShadow = false;
  group.add(walls);

  // base: sombra suave embaixo do diorama
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const cx = cv.getContext('2d');
  const gr = cx.createRadialGradient(128, 128, 20, 128, 128, 128);
  gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  cx.fillStyle = gr; cx.fillRect(0, 0, 256, 256);
  const sh = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.5, D * 1.9),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false })
  );
  sh.rotation.x = -Math.PI / 2; sh.position.y = WORLD.bottom - 0.5;
  group.add(sh);
  return group;
}
