// Circuit : spline fermée échantillonnée tous les ~3 m, génération de la géométrie (piste, falaises,
// arches, balises) et requêtes rapides (projection d'une position sur la piste).
import * as THREE from 'three';
import { toon, outlineMaterial, smoothNormalsClone, mergeColored, paint } from './toon.js';
import { clamp, lerp, noise1, mulberry32 } from './util.js';
import { rockMaterial, facadeMaterial } from './materials.js';

export { rockMaterial } from './materials.js';

// Tube balayé le long d'un chemin plan (XY) avec rayon variable et bruit : arches et ponts naturels.
function sweepTube(path, radii, radialSegs, noiseAmp, seed) {
  const pos = [];
  const idx = [];
  const B = new THREE.Vector3(0, 0, 1);
  const T = new THREE.Vector3();
  const Nn = new THREE.Vector3();
  const n = path.length;
  for (let k = 0; k < n; k++) {
    const a = path[Math.max(0, k - 1)], b = path[Math.min(n - 1, k + 1)];
    T.subVectors(b, a).normalize();
    Nn.crossVectors(B, T).normalize();
    for (let j = 0; j <= radialSegs; j++) {
      const ang = (j / radialSegs) * Math.PI * 2;
      const jj = j % radialSegs;
      const rn = 1 + noiseAmp * noise1(seed + k * 0.9 + jj * 7.13) + noiseAmp * 0.5 * noise1(seed * 3.1 + k * 2.3 + jj * 3.7);
      const r = radii[k] * rn;
      const cx = Math.cos(ang) * r, cy = Math.sin(ang) * r;
      pos.push(path[k].x + Nn.x * cx + B.x * cy, path[k].y + Nn.y * cx + B.y * cy, path[k].z + Nn.z * cx + B.z * cy);
    }
  }
  const rs = radialSegs + 1;
  for (let k = 0; k < n - 1; k++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = k * rs + j, b = (k + 1) * rs + j, c = (k + 1) * rs + j + 1, d = k * rs + j + 1;
      idx.push(a, d, b, d, c, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const cssColor = (c) => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c);

function makeRoadTexture(r) {
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = cssColor(r.base);
  g.fillRect(0, 0, W, H);
  const rnd = mulberry32(42);
  // grain du revêtement
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = rnd() < 0.5 ? r.speckDark : r.speckLight;
    g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 3, 2 + rnd() * 3);
  }
  // ondulations transversales : très efficaces pour percevoir la vitesse
  for (let k = 0; k < 8; k++) {
    const y = (k / 8) * H + rnd() * 20;
    g.fillStyle = k % 2 ? r.rippleDark : r.rippleLight;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + k) * 5);
    for (let x = W; x >= 0; x -= 16) g.lineTo(x, y + 9 + Math.sin(x * 0.04 + k * 2) * 5);
    g.closePath();
    g.fill();
  }
  // sillons de trajectoire
  const gm = /rgba?\(([^)]+)\)/.exec(r.groove || '');
  const gp = gm ? gm[1].split(',').map((v) => v.trim()) : ['90', '50', '20', '0.22'];
  const gc = gp.slice(0, 3).join(',');
  const ga = gp[3] !== undefined ? parseFloat(gp[3]) : 0.22;
  for (const cx of [0.32, 0.68]) {
    const grd = g.createLinearGradient(cx * W - 30, 0, cx * W + 30, 0);
    grd.addColorStop(0, `rgba(${gc},0)`);
    grd.addColorStop(0.5, `rgba(${gc},${ga})`);
    grd.addColorStop(1, `rgba(${gc},0)`);
    g.fillStyle = grd;
    g.fillRect(cx * W - 30, 0, 60, H);
  }
  // ligne centrale pointillée (pistes urbaines)
  if (r.line) {
    g.fillStyle = cssColor(r.line);
    for (let y = 0; y < H; y += 128) g.fillRect(W / 2 - 3, y, 6, 64);
  }
  // bordures alternées (vibreurs)
  const kw = 12;
  for (let y = 0; y < H; y += 64) {
    g.fillStyle = cssColor((y / 64) % 2 === 0 ? r.kerbA : r.kerbB);
    g.fillRect(0, y, kw, 64);
    g.fillRect(W - kw, y, kw, 64);
  }
  g.fillStyle = 'rgba(30,20,10,0.5)';
  g.fillRect(kw, 0, 3, H);
  g.fillRect(W - kw - 3, 0, 3, H);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeCheckerTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const g = c.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#f5f0e6';
    g.fillRect(x * 16, y * 16, 16, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

export class Track {
  constructor(def) {
    this.def = def;
    this.theme = def.theme;
    this.railed = this.theme.edge === 'rails';     // barrières continues : impossible de sortir de la piste
    this.elevated = this.theme.elevated || null;   // piste suspendue au-dessus du vide / de l'eau
    const cps = def.points;
    this.nCP = cps.length;
    const pts = cps.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.curve.arcLengthDivisions = 8000;
    this.length = this.curve.getLength();
    const N = Math.round(this.length / 3);
    this.N = N;
    this.step = this.length / N;

    this.px = new Float32Array(N); this.py = new Float32Array(N); this.pz = new Float32Array(N);
    this.tx = new Float32Array(N); this.tz = new Float32Array(N);
    this.rx = new Float32Array(N); this.rz = new Float32Array(N);
    this.width = new Float32Array(N); this.wallH = new Float32Array(N);
    this.curv = new Float32Array(N); this.tParam = new Float32Array(N);

    const P = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const t = this.curve.getUtoTmapping(i / N);
      this.curve.getPoint(t, P);
      this.px[i] = P.x; this.py[i] = P.y; this.pz[i] = P.z;
      const tt = t * this.nCP;
      this.tParam[i] = tt;
      const i0 = Math.floor(tt) % this.nCP, i1 = (i0 + 1) % this.nCP;
      const f = tt - Math.floor(tt);
      const sm = f * f * (3 - 2 * f);
      this.width[i] = lerp(cps[i0][3], cps[i1][3], sm);
      this.wallH[i] = lerp(cps[i0][4], cps[i1][4], sm);
    }
    // tangentes horizontales par différences finies
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      let dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      this.tx[i] = dx; this.tz[i] = dz;
      // droite = T x haut = (-tz, 0, tx)
      this.rx[i] = -dz; this.rz[i] = dx;
    }
    // courbure signée (positive = virage à gauche), lissée
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 3 + N) % N, b = (i + 3) % N;
      const cr = this.tz[a] * this.tx[b] - this.tx[a] * this.tz[b];
      raw[i] = Math.asin(clamp(cr, -1, 1)) / (6 * this.step);
    }
    const W = 6;
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -W; k <= W; k++) s += raw[(i + k + N) % N];
      this.curv[i] = s / (2 * W + 1);
    }

    let minY = Infinity, maxY = -Infinity, sumY = 0;
    for (let i = 0; i < N; i++) { minY = Math.min(minY, this.py[i]); maxY = Math.max(maxY, this.py[i]); sumY += this.py[i]; }
    this.minY = minY; this.maxY = maxY; this.avgY = sumY / N;
    this.obstacles = [];
    this.archSpans = []; // positions (index) des arches, pour le son "whoosh"
    this.group = new THREE.Group();
    this.group.name = 'track';
  }

  // Indice d'échantillon le plus proche d'un paramètre "at" (indice de point de contrôle fractionnaire).
  indexAt(at) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.N; i++) {
      let d = Math.abs(this.tParam[i] - at);
      d = Math.min(d, this.nCP - d);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  wrapS(s) {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  // Point de la piste à une distance s et un décalage latéral lat.
  sample(s, lat = 0, out = {}) {
    s = this.wrapS(s);
    const fi = s / this.step;
    const i0 = Math.floor(fi) % this.N, i1 = (i0 + 1) % this.N;
    const f = fi - Math.floor(fi);
    const tx = lerp(this.tx[i0], this.tx[i1], f), tz = lerp(this.tz[i0], this.tz[i1], f);
    const l = Math.hypot(tx, tz) || 1;
    out.tx = tx / l; out.tz = tz / l;
    out.rx = -out.tz; out.rz = out.tx;
    out.x = lerp(this.px[i0], this.px[i1], f) + out.rx * lat;
    out.z = lerp(this.pz[i0], this.pz[i1], f) + out.rz * lat;
    out.y = lerp(this.py[i0], this.py[i1], f);
    out.width = lerp(this.width[i0], this.width[i1], f);
    out.wallH = lerp(this.wallH[i0], this.wallH[i1], f);
    out.curv = lerp(this.curv[i0], this.curv[i1], f);
    out.index = i0;
    return out;
  }

  curvAt(s) {
    const i = Math.floor(this.wrapS(s) / this.step) % this.N;
    return this.curv[i];
  }

  // Projette une position monde sur la piste. hint = indice précédent (-1 = recherche complète).
  query(x, z, hint, out = {}) {
    const N = this.N;
    let best = 0, bd = Infinity;
    if (hint < 0 || hint === undefined) {
      for (let i = 0; i < N; i++) {
        const dx = x - this.px[i], dz = z - this.pz[i];
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    } else {
      for (let k = -45; k <= 45; k++) {
        const i = (hint + k + N) % N;
        const dx = x - this.px[i], dz = z - this.pz[i];
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    }
    let i0 = best;
    let along = (x - this.px[i0]) * this.tx[i0] + (z - this.pz[i0]) * this.tz[i0];
    if (along < 0) {
      i0 = (i0 - 1 + N) % N;
      along = (x - this.px[i0]) * this.tx[i0] + (z - this.pz[i0]) * this.tz[i0];
    }
    const i1 = (i0 + 1) % N;
    const f = clamp(along / this.step, 0, 1);
    out.index = i0;
    out.s = (i0 + f) * this.step;
    out.lateral = (x - this.px[i0]) * this.rx[i0] + (z - this.pz[i0]) * this.rz[i0];
    out.y = lerp(this.py[i0], this.py[i1], f);
    out.width = lerp(this.width[i0], this.width[i1], f);
    out.wallH = lerp(this.wallH[i0], this.wallH[i1], f);
    out.tx = this.tx[i0]; out.tz = this.tz[i0];
    out.rx = this.rx[i0]; out.rz = this.rz[i0];
    return out;
  }

  // ---------------------------------------------------------------- géométrie
  build() {
    const th = this.theme;
    this.buildRoad();
    this.buildWalls();
    this.buildArches();
    this.buildBoulders();
    this.buildMarkers();
    if (this.railed) this.buildRails();
    if (this.elevated && this.elevated.pylons) this.buildPylons();
    this.buildStartLine();
    return this.group;
  }

  buildRoad() {
    const N = this.N, th = this.theme;
    const roadPos = [], roadUV = [], roadIdx = [];
    const shPos = [], shCol = [], shIdx = [];
    const elev = !!this.elevated;
    const cIn = new THREE.Color(elev ? th.elevated.deckColor || 0x555a66 : th.shoulder);
    const cOut = new THREE.Color(elev ? th.elevated.deckColor || 0x555a66 : th.ground.base);
    if (elev) cOut.multiplyScalar(0.7);
    const TEX_LEN = 30;
    for (let k = 0; k <= N; k++) {
      const i = k % N;
      const e = this.width[i] / 2;
      const x = this.px[i], y = this.py[i], z = this.pz[i], rx = this.rx[i], rz = this.rz[i];
      const v = (k * this.step) / TEX_LEN;
      roadPos.push(x - rx * e, y, z - rz * e, x + rx * e, y, z + rz * e);
      roadUV.push(0, v, 1, v);
      // bas-côtés : gauche (ext, int) puis droite (int, ext)
      // piste au sol : bas-côtés en pente douce ; piste suspendue : flanc vertical du tablier
      const o = elev ? e + 0.25 : e + 10, dy = elev ? -3.2 : -1.1;
      shPos.push(x - rx * o, y + dy, z - rz * o, x - rx * e, y - 0.02, z - rz * e);
      shPos.push(x + rx * e, y - 0.02, z + rz * e, x + rx * o, y + dy, z + rz * o);
      shCol.push(cOut.r, cOut.g, cOut.b, cIn.r, cIn.g, cIn.b, cIn.r, cIn.g, cIn.b, cOut.r, cOut.g, cOut.b);
    }
    for (let k = 0; k < N; k++) {
      const a = 2 * k, b = a + 1, c = a + 2, d = a + 3;
      roadIdx.push(a, b, c, b, d, c);
      const s = 4 * k, n = s + 4;
      // gauche
      shIdx.push(s, s + 1, n, s + 1, n + 1, n);
      // droite
      shIdx.push(s + 2, s + 3, n + 2, s + 3, n + 3, n + 2);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(roadUV, 2));
    rg.setIndex(roadIdx);
    rg.computeVertexNormals();
    this.roadTexture = makeRoadTexture(th.road);
    const road = new THREE.Mesh(rg, toon({ map: this.roadTexture }));
    road.name = 'road';
    this.group.add(road);

    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(shPos, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(shCol, 3));
    sg.setIndex(shIdx);
    sg.computeVertexNormals();
    const sh = new THREE.Mesh(sg, toon({ vertexColors: true, side: elev ? THREE.DoubleSide : THREE.FrontSide }));
    this.group.add(sh);
    if (elev) {
      // dessous du tablier
      const ug = new THREE.BufferGeometry();
      const up = [], ui = [];
      for (let k = 0; k <= N; k++) {
        const i = k % N;
        const e = this.width[i] / 2 + 0.25;
        const x = this.px[i], y = this.py[i] - 3.2, z = this.pz[i], rx = this.rx[i], rz = this.rz[i];
        up.push(x - rx * e, y, z - rz * e, x + rx * e, y, z + rz * e);
      }
      for (let k = 0; k < N; k++) { const a = 2 * k; ui.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      ug.setAttribute('position', new THREE.Float32BufferAttribute(up, 3));
      ug.setIndex(ui);
      ug.computeVertexNormals();
      this.group.add(new THREE.Mesh(ug, toon({ color: cOut })));
    }
  }

  // Profil d'une falaise en un échantillon : liste de [décalage latéral depuis le bord, hauteur relative].
  wallProfile(i, side) {
    const s = i * this.step;
    const H = this.wallH[i];
    // pied des falaises : sous la piste, ou jusqu'au sol lointain si la piste est suspendue
    const foot = this.elevated ? this.elevated.floorY - this.py[i] - 5 : -2.5;
    const outer = this.elevated ? foot : -9;
    if (this.theme.wallStyle === 'city') {
      // façades verticales avec un retrait (balcon) puis toits plats
      const step = 2.5 + 2 * Math.sign(noise1(s / 90 + side * 13));
      return [
        [0.4, foot], [0.4, 0.2 * H], [0.4, 0.45 * H], [0.4, 0.68 * H], [0.6, 0.7 * H],
        [step + 0.6, 0.7 * H], [step + 0.6, H], [40, H], [70, H], [70.5, outer],
      ];
    }
    const o = side * 57.3;
    const big = 2.6 * noise1(s / 70 + o);
    const n = (f, ph) => noise1(s / f + ph + o);
    const rimJ = 1.6 * n(7, 5.5);
    return [
      [0.4, foot],
      [1.5 + 1.1 * n(9, 3.1) + big * 0.4, 0.12 * H],
      [1.2 + 2.0 * n(14, 7.3) + big, 0.32 * H],
      [2.4 + 2.6 * n(11, 1.7) + big, 0.52 * H],
      [2.0 + 3.0 * n(17, 9.9) + big, 0.72 * H],
      [3.6 + 2.6 * n(13, 4.4) + big, 0.9 * H],
      [6.5 + 2.0 * n(20, 2.2) + big, H + rimJ],
      [26 + 5 * n(40, 8.8), H + 1.5 + 2.5 * n(30, 6.1)],
      [62 + 6 * n(55, 3.3), H + 0.5 + 3 * n(45, 1.9)],
      [96, outer],
    ];
  }

  buildWalls() {
    const N = this.N;
    const pos = [], idx = [];
    const K = 10;
    let i = 0;
    // le départ est toujours en zone ouverte : pas de segment à cheval sur la boucle
    while (i < N) {
      if (this.wallH[i] <= 0.8) { i++; continue; }
      const start = Math.max(0, i - 1);
      while (i < N && this.wallH[i] > 0.8) i++;
      const end = Math.min(N - 1, i);
      for (const side of [-1, 1]) {
        const base = pos.length / 3;
        for (let k = start; k <= end; k++) {
          const prof = this.wallProfile(k, side);
          const e = this.width[k] / 2;
          for (const [lo, h] of prof) {
            const l = side * (e + lo);
            pos.push(this.px[k] + this.rx[k] * l, this.py[k] + h, this.pz[k] + this.rz[k] * l);
          }
        }
        const M = end - start + 1;
        for (let k = 0; k < M - 1; k++) {
          for (let j = 0; j < K - 1; j++) {
            const a = base + k * K + j, b = base + (k + 1) * K + j, c = base + k * K + j + 1, d = base + (k + 1) * K + j + 1;
            if (side < 0) idx.push(a, b, c, b, d, c);
            else idx.push(a, c, b, b, c, d);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const th = this.theme;
    this.rockMat = th.wallStyle === 'city' && th.facade
      ? facadeMaterial(th.facade)
      : rockMaterial(th.strata, th.plateau, th.bandH || 7.5, {}, th.glow);
    const walls = new THREE.Mesh(g, this.rockMat);
    walls.name = 'walls';
    this.group.add(walls);
  }

  // Repère local (droite, haut, arrière) d'un échantillon : pour poser des objets sur la piste.
  frameMatrix(i, lat = 0, yOff = 0) {
    const m = new THREE.Matrix4();
    const R = new THREE.Vector3(this.rx[i], 0, this.rz[i]);
    const U = new THREE.Vector3(0, 1, 0);
    const Bk = new THREE.Vector3(-this.tx[i], 0, -this.tz[i]);
    m.makeBasis(R, U, Bk);
    m.setPosition(this.px[i] + R.x * lat, this.py[i] + yOff, this.pz[i] + R.z * lat);
    return m;
  }

  addObstacle(i, lat, r, kind) {
    this.obstacles.push({
      x: this.px[i] + this.rx[i] * lat,
      z: this.pz[i] + this.rz[i] * lat,
      r, lat, index: i, s: i * this.step, kind,
    });
  }

  buildArches() {
    const th = this.theme;
    const stoneGeos = [], clayGeos = [];
    let seed = 1;
    const rnd = mulberry32(777);
    for (const a of this.def.arches) {
      const i0 = this.indexAt(a.at);
      const count = a.count || 1;
      for (let c = 0; c < count; c++) {
        const i = (i0 + Math.round((c * (a.spacing || 0)) / this.step)) % this.N;
        const e = this.width[i] / 2;
        const H = this.wallH[i];
        const path = [], radii = [];
        seed += 13.7;
        if (a.type === 'stone') {
          const thk = a.thick || 4;
          const half = e + thk * 1.8 + 2;
          const hh = a.height || 26;
          path.push(new THREE.Vector3(-half - 1, -6, 0));
          radii.push(thk * 2.0);
          const segs = 22;
          for (let k = 0; k <= segs; k++) {
            const th2 = Math.PI - (k / segs) * Math.PI;
            const sn = Math.sin(th2);
            path.push(new THREE.Vector3(Math.cos(th2) * half, hh * Math.pow(sn, 0.85), Math.sin(k * 0.7) * 0.6));
            radii.push(thk * (1 + 0.85 * Math.pow(1 - sn, 1.5)));
          }
          path.push(new THREE.Vector3(half + 1, -6, 0));
          radii.push(thk * 2.0);
          const g = sweepTube(path, radii, 9, 0.22, seed);
          g.applyMatrix4(this.frameMatrix(i));
          stoneGeos.push(g);
          this.addObstacle(i, -half, thk * 1.75, 'pillar');
          this.addObstacle(i, half, thk * 1.75, 'pillar');
          this.archSpans.push(i);
        } else if (a.type === 'split') {
          const thk = a.thick || 3;
          const half = e + thk * 1.6 + 2;
          const hh = a.height || 20;
          for (const sgn of [-1, 1]) {
            const p2 = [], r2 = [];
            p2.push(new THREE.Vector3(sgn < 0 ? -half - 1 : -1, -6, 0));
            r2.push(thk * 1.9);
            const segs = 16;
            for (let k = 0; k <= segs; k++) {
              const th2 = Math.PI - (k / segs) * Math.PI;
              const sn = Math.sin(th2);
              const cx = sgn < 0 ? -half / 2 : half / 2;
              p2.push(new THREE.Vector3(cx + Math.cos(th2) * (half / 2), hh * Math.pow(sn, 0.8), 0));
              r2.push(thk * (1 + 0.8 * Math.pow(1 - sn, 1.5)));
            }
            p2.push(new THREE.Vector3(sgn < 0 ? 1 : half + 1, -6, 0));
            r2.push(thk * 1.9);
            const g = sweepTube(p2, r2, 9, 0.2, seed + sgn * 5);
            g.applyMatrix4(this.frameMatrix(i));
            stoneGeos.push(g);
          }
          this.addObstacle(i, 0, thk * 1.7, 'pillar');
          this.addObstacle(i, -half, thk * 1.7, 'pillar');
          this.addObstacle(i, half, thk * 1.7, 'pillar');
          this.archSpans.push(i);
        } else if (a.type === 'clay') {
          const thk = 2.4;
          const half = e + 6;
          const hh = (a.height || 17) * (0.9 + rnd() * 0.25);
          const segs = 18;
          path.push(new THREE.Vector3(-half, -5, 0));
          radii.push(thk * 1.5);
          for (let k = 0; k <= segs; k++) {
            const x = -half + (k / segs) * half * 2;
            const u = x / half;
            path.push(new THREE.Vector3(x, hh * (1 - Math.pow(Math.abs(u), 2.2)), 0));
            radii.push(thk * (1 + 0.5 * Math.pow(Math.abs(u), 3)));
          }
          path.push(new THREE.Vector3(half, -5, 0));
          radii.push(thk * 1.5);
          const smooth = this.theme.archClay && this.theme.archClay.smooth;
          const g = sweepTube(path, radii, smooth ? 10 : 6, smooth ? 0 : 0.06, seed);
          g.applyMatrix4(this.frameMatrix(i));
          clayGeos.push(g);
          this.addObstacle(i, -half, thk * 1.4, 'pillar');
          this.addObstacle(i, half, thk * 1.4, 'pillar');
          this.archSpans.push(i);
        } else if (a.type === 'bridge') {
          if (H < 10) continue;
          const half = e + 16;
          const yb = H * (0.45 + rnd() * 0.35);
          const sag = 4 + rnd() * 4;
          const segs = 14;
          for (let k = 0; k <= segs; k++) {
            const u = k / segs * 2 - 1;
            path.push(new THREE.Vector3(u * half, yb - sag * (1 - u * u) + (Math.abs(u) > 0.8 ? (Math.abs(u) - 0.8) * 25 : 0), 0));
            radii.push(4 + 2.5 * Math.pow(Math.abs(u), 2));
          }
          const g = sweepTube(path, radii, 8, 0.28, seed);
          g.applyMatrix4(this.frameMatrix(i));
          stoneGeos.push(g);
          this.archSpans.push(i);
        }
      }
    }
    if (stoneGeos.length) {
      const g = mergeColored(stoneGeos);
      const as = th.archStone || { strata: th.strata.slice().reverse(), top: th.plateau, bandH: 4.5, glow: th.glow };
      const mat = rockMaterial(as.strata, as.top, as.bandH || 4.5, {}, as.glow);
      const m = new THREE.Mesh(g, mat);
      m.name = 'stoneArches';
      this.group.add(m);
      this.group.add(new THREE.Mesh(smoothNormalsClone(g), outlineMaterial(0.35)));
    }
    if (clayGeos.length) {
      const g = mergeColored(clayGeos);
      const ac = th.archClay;
      const mat = rockMaterial(ac.strata, ac.top, ac.bandH || 2.2, {}, ac.glow);
      const m = new THREE.Mesh(g, mat);
      m.name = 'clayArches';
      this.group.add(m);
      this.group.add(new THREE.Mesh(smoothNormalsClone(g), outlineMaterial(0.25)));
    }
    this.archSpans.sort((a, b) => a - b);
  }

  static rockGeometry(seed = 1, detail = 1) {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.attributes.position;
    const map = new Map();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = Math.round(x * 1000) + ',' + Math.round(y * 1000) + ',' + Math.round(z * 1000);
      let s = map.get(k);
      if (s === undefined) {
        s = 1 + 0.28 * noise1(seed + x * 3.1 + y * 5.7 + z * 2.3) + 0.12 * noise1(seed * 2 + x * 9 + z * 7);
        map.set(k, s);
      }
      p.setXYZ(i, x * s, y * s * 0.8, z * s);
    }
    g.computeVertexNormals();
    return g;
  }

  buildBoulders() {
    const list = this.def.boulders || [];
    if (!list.length) return;
    const geo = Track.rockGeometry(3, 1);
    const mat = toon({ color: this.theme.rockColors[0] });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const out = new THREE.InstancedMesh(smoothNormalsClone(geo), outlineMaterial(0.08), list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    list.forEach((b, k) => {
      const i = this.indexAt(b.at);
      p.set(this.px[i] + this.rx[i] * b.lat, this.py[i] + b.r * 0.35, this.pz[i] + this.rz[i] * b.lat);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), k * 1.7);
      s.set(b.r, b.r * 1.1, b.r);
      m.compose(p, q, s);
      mesh.setMatrixAt(k, m);
      out.setMatrixAt(k, m);
      this.addObstacle(i, b.lat, b.r * 0.95, 'boulder');
    });
    this.group.add(mesh, out);
  }

  // Balises de bord de piste + mâts à bannières : des repères verticaux qui défilent = sensation de vitesse.
  buildMarkers() {
    const N = this.N;
    const spacing = Math.round(12 / this.step);
    const count = Math.floor(N / spacing) * 2;
    const geo = new THREE.CylinderGeometry(0.35, 0.5, 1.1, 6);
    geo.translate(0, 0.45, 0);
    const mesh = new THREE.InstancedMesh(geo, toon({ color: 0xffffff }), count);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    let n = 0;
    for (let i = 0, k = 0; i < N - spacing / 2; i += spacing, k++) {
      for (const side of [-1, 1]) {
        const lat = side * (this.width[i] / 2 + 0.9);
        m.makeTranslation(this.px[i] + this.rx[i] * lat, this.py[i] - 0.1, this.pz[i] + this.rz[i] * lat);
        mesh.setMatrixAt(n, m);
        c.set(this.theme.markerColors[k % 2]);
        mesh.setColorAt(n, c);
        n++;
      }
    }
    mesh.count = n;
    this.group.add(mesh);

    // mâts à bannière dans les zones ouvertes
    const pole = new THREE.CylinderGeometry(0.18, 0.25, 10, 6);
    pole.translate(0, 5, 0);
    paint(pole, 0x5a4636);
    const flag = new THREE.BoxGeometry(0.12, 3.2, 1.6);
    flag.translate(0, 8, 0.85);
    paint(flag, 0xffffff);
    const pg = mergeColored([pole, flag]);
    const pSpacing = Math.round(70 / this.step);
    const maxPoles = Math.ceil(N / pSpacing) * 2;
    const poles = new THREE.InstancedMesh(pg, toon({ vertexColors: true }), maxPoles);
    const flagCols = this.theme.flagColors;
    n = 0;
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0, k = 0; i < N; i += pSpacing, k++) {
      if (this.wallH[i] > 2 || !this.theme.poles || this.railed) continue;
      for (const side of [-1, 1]) {
        const lat = side * (this.width[i] / 2 + 7);
        p.set(this.px[i] + this.rx[i] * lat, this.py[i] - 1, this.pz[i] + this.rz[i] * lat);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(this.tx[i], this.tz[i]));
        m.compose(p, q, sc);
        poles.setMatrixAt(n, m);
        c.set(flagCols[(k + (side > 0 ? 1 : 0)) % flagCols.length]);
        poles.setColorAt(n, c);
        n++;
      }
    }
    poles.count = n;
    this.group.add(poles);
    const pOut = new THREE.InstancedMesh(smoothNormalsClone(pg), outlineMaterial(0.07), maxPoles);
    pOut.instanceMatrix = poles.instanceMatrix;
    pOut.count = n;
    this.group.add(pOut);
  }

  // Barrières continues le long des deux bords (pistes urbaines, suspendues...)
  buildRails() {
    const N = this.N, th = this.theme;
    const base = [], glow = [], bi = [], gi = [];
    const stepK = 2;
    let row = 0;
    for (let k = 0; k <= N; k += stepK) {
      const i = k % N;
      const e = this.width[i] / 2 + 0.3;
      for (const side of [-1, 1]) {
        const x = this.px[i] + this.rx[i] * e * side, z = this.pz[i] + this.rz[i] * e * side, y = this.py[i];
        base.push(x, y - 0.1, z, x, y + 0.85, z);
        glow.push(x, y + 0.85, z, x, y + 1.2, z);
      }
      row++;
    }
    for (let r = 0; r < row - 1; r++) {
      for (let sd = 0; sd < 2; sd++) {
        const a = (r * 2 + sd) * 2, b = a + 1, c = ((r + 1) * 2 + sd) * 2, d = c + 1;
        bi.push(a, c, b, b, c, d);
        gi.push(a, c, b, b, c, d);
      }
    }
    const mk = (pos, idx) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const dark = new THREE.Color(th.elevated ? th.elevated.deckColor || 0x3a3e4a : 0x3a3e4a).multiplyScalar(0.8);
    this.group.add(new THREE.Mesh(mk(base, bi), toon({ color: dark, side: THREE.DoubleSide })));
    this.group.add(new THREE.Mesh(mk(glow, gi), new THREE.MeshBasicMaterial({ color: th.railColor, side: THREE.DoubleSide })));
  }

  // Piliers sous une piste suspendue
  buildPylons() {
    const N = this.N, el = this.elevated;
    const spacing = Math.round(48 / this.step);
    const geo = new THREE.CylinderGeometry(1, 1.35, 1, 8);
    geo.translate(0, -0.5, 0);
    const count = Math.ceil(N / spacing) * 2;
    const mesh = new THREE.InstancedMesh(geo, toon({ color: el.pylonColor || 0x888888 }), count);
    const out = new THREE.InstancedMesh(smoothNormalsClone(geo), outlineMaterial(0.06), count);
    out.instanceMatrix = mesh.instanceMatrix;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < N; i += spacing) {
      if (this.wallH[i] > 5) continue; // dans un canyon d'immeubles, les façades portent la piste
      const e = this.width[i] / 2;
      const top = this.py[i] - 3.1;
      const len = top - el.floorY;
      if (len < 2) continue;
      for (const side of [-1, 1]) {
        p.set(this.px[i] + this.rx[i] * e * 0.55 * side, top, this.pz[i] + this.rz[i] * e * 0.55 * side);
        sc.set(1.7, len, 1.7);
        m.compose(p, q, sc);
        mesh.setMatrixAt(n, m);
        n++;
      }
    }
    mesh.count = out.count = n;
    this.group.add(mesh, out);
  }

  buildStartLine() {
    const i = 0;
    const e = this.width[i] / 2;
    const g = new THREE.PlaneGeometry(e * 2, 5);
    const mat = new THREE.MeshBasicMaterial({ map: makeCheckerTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.Mesh(g, mat);
    // PlaneGeometry dans XY, couché au sol : axe X = largeur, aligné sur la droite de la piste.
    const holder = new THREE.Group();
    holder.add(m);
    m.rotation.set(-Math.PI / 2, 0, 0);
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(this.frameMatrix(i, 0, 0.06));
    this.group.add(holder);
  }
}
