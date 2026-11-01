// Décor piloté par le thème du circuit : ciel (soleils, étoiles, planète géante), lumière, sol (dunes,
// eau, lave, mer de nuages, sol urbain), montagnes ou skyline, décors procéduraux, zone de départ,
// météo et trafic aérien.
import * as THREE from 'three';
import { toon, outlineMaterial, smoothNormalsClone, mergeColored, paint } from './toon.js';
import { PROP_TYPES } from './props.js';
import { Weather, Traffic } from './weather.js';
import { clamp, lerp, smoothstep, noise2, mulberry32 } from './util.js';

function makeSky(theme) {
  const geo = new THREE.SphereGeometry(5000, 32, 16);
  const suns = (theme.suns || []).slice(0, 2);
  const sunU = (k) => {
    const s = suns[k];
    return {
      dir: new THREE.Vector3(...(s ? s.dir : [0, 1, 0])).normalize(),
      col: new THREE.Color(s ? s.color : 0xffffff),
      glow: new THREE.Color(s ? s.glow || s.color : 0xffffff),
      size: s ? s.size || 1 : 0,
    };
  };
  const s0 = sunU(0), s1 = sunU(1);
  const pl = theme.planet;
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(theme.skyTop) },
      horizon: { value: new THREE.Color(theme.skyHorizon) },
      s0Dir: { value: s0.dir }, s0Col: { value: s0.col }, s0Glow: { value: s0.glow }, s0Size: { value: s0.size },
      s1Dir: { value: s1.dir }, s1Col: { value: s1.col }, s1Glow: { value: s1.glow }, s1Size: { value: s1.size },
      uStars: { value: theme.stars || 0 },
      pDir: { value: new THREE.Vector3(...(pl ? pl.dir : [0, 1, 0])).normalize() },
      pSize: { value: pl ? pl.size : 0 },
      pCol: { value: new THREE.Color(pl ? pl.color : 0xffffff) },
      pCol2: { value: new THREE.Color(pl ? pl.color2 || pl.color : 0xffffff) },
      pBands: { value: pl ? pl.bands || 6 : 0 },
      pRing: { value: pl && pl.ring ? 1 : 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon;
      uniform vec3 s0Dir; uniform vec3 s0Col; uniform vec3 s0Glow; uniform float s0Size;
      uniform vec3 s1Dir; uniform vec3 s1Col; uniform vec3 s1Glow; uniform float s1Size;
      uniform float uStars;
      uniform vec3 pDir; uniform float pSize; uniform vec3 pCol; uniform vec3 pCol2; uniform float pBands; uniform float pRing;
      varying vec3 vDir;
      float hash3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      vec3 sun(vec3 col, vec3 d, vec3 dir, vec3 c, vec3 g, float size) {
        if (size <= 0.0) return col;
        float s = dot(d, dir);
        float r = 0.0185 * size;               // rayon angulaire (radians)
        float cr = cos(r);
        col += g * smoothstep(cos(r * 14.0), 1.0, s) * 0.35;
        return mix(col, c, smoothstep(cr - 0.00025, cr, s));
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, top, pow(smoothstep(-0.03, 0.55, h), 0.75));
        if (uStars > 0.0) {
          float st = step(0.9965, hash3(floor(d * 260.0)));
          col += vec3(st) * uStars * smoothstep(0.02, 0.35, h);
        }
        if (pSize > 0.0) {
          float cs = dot(d, pDir);
          vec3 pu = normalize(cross(pDir, vec3(0.0, 1.0, 0.0)));
          vec3 pv = cross(pu, pDir);
          vec3 off = d - pDir * cs;
          float sr = sin(pSize);
          float lu = dot(off, pu) / sr, lv = dot(off, pv) / sr;
          float inside = step(cos(pSize), cs);
          if (pRing > 0.5) {
            float er = length(vec2(lu, lv * 3.2));
            float ring = step(1.35, er) * step(er, 1.85) * (1.0 - inside * step(0.0, lv));
            col = mix(col, mix(pCol, pCol2, 0.5) * 1.05, ring * 0.75 * step(0.0, cs));
          }
          if (inside > 0.5) {
            float band = step(0.0, sin(lv * pBands * 3.14159 + sin(lu * 3.0) * 0.6));
            vec3 pc = mix(pCol, pCol2, band);
            float shade = smoothstep(-1.1, 0.4, lu * 0.8 + lv * 0.3);
            col = mix(col, pc * (0.45 + 0.55 * shade), 0.92);
          }
        }
        col = sun(col, d, s0Dir, s0Col, s0Glow, s0Size);
        col = sun(col, d, s1Dir, s1Col, s1Glow, s1Size);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.name = 'sky';
  return sky;
}

function cloudTexture(c1, c2) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#' + new THREE.Color(c2).getHexString();
  g.fillRect(0, 0, S, S);
  const rnd = mulberry32(9);
  for (let k = 0; k < 70; k++) {
    const x = rnd() * S, y = rnd() * S, r = 14 + rnd() * 40;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grd.addColorStop(0, '#' + new THREE.Color(c1).getHexString());
      grd.addColorStop(0.7, '#' + new THREE.Color(c1).getHexString());
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x + ox, y + oy, r, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(14, 14);
  return t;
}

// Grille spatiale des échantillons de piste : distance rapide à la piste pour le terrain et le décor.
class TrackGrid {
  constructor(track, cell = 60, every = 4) {
    this.track = track;
    this.cell = cell;
    this.map = new Map();
    for (let i = 0; i < track.N; i += every) {
      const k = this.key(Math.floor(track.px[i] / cell), Math.floor(track.pz[i] / cell));
      let arr = this.map.get(k);
      if (!arr) { arr = []; this.map.set(k, arr); }
      arr.push(i);
    }
  }
  key(cx, cz) { return cx * 100003 + cz; }
  nearest(x, z, maxR = 300) {
    const c = this.cell, t = this.track;
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    const rr = Math.ceil(maxR / c);
    let bd = maxR * maxR, bi = -1;
    for (let dx = -rr; dx <= rr; dx++) {
      for (let dz = -rr; dz <= rr; dz++) {
        const arr = this.map.get(this.key(cx + dx, cz + dz));
        if (!arr) continue;
        for (const i of arr) {
          const ex = x - t.px[i], ez = z - t.pz[i];
          const d = ex * ex + ez * ez;
          if (d < bd) { bd = d; bi = i; }
        }
      }
    }
    return { d: Math.sqrt(bd), i: bi };
  }
}

function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (m.userData && m.userData.shared) continue;
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}

export class Environment {
  constructor(scene, track, opts = {}) {
    this.scene = scene;
    this.density = opts.density ?? 1; // densité du décor selon la qualité graphique
    this.track = track;
    this.theme = track.theme;
    this.grid = new TrackGrid(track);
    let cx = 0, cz = 0;
    for (let i = 0; i < track.N; i++) { cx += track.px[i]; cz += track.pz[i]; }
    this.center = new THREE.Vector3(cx / track.N, 0, cz / track.N);
    this.group = new THREE.Group();
    this.group.name = 'environment';
    scene.add(this.group);
    const th = this.theme;
    this.elevated = th.elevated || null;
    this.waterLevel = track.waterLevel !== null ? track.waterLevel : -Infinity;
    this.amp = (th.dunes && th.dunes.amp) ?? 1;
    this.freq = (th.dunes && th.dunes.freq) ?? 1;
    // niveau de base des dunes : autour de la piste, ou juste au-dessus de l'eau pour faire apparaître lacs et lagons
    this.baseline = th.water && !this.elevated ? this.waterLevel + 4.5 * this.amp : track.avgY;
  }

  dunes(x, z) {
    const f = this.freq;
    const r = 1 - Math.abs(noise2(x * 0.0017 * f + 3.3, z * 0.0024 * f - 1.2));
    return (10 * r * r - 4 + 3 * noise2(x * 0.006 * f, z * 0.005 * f) + 1.2 * noise2(x * 0.02, z * 0.017)) * this.amp;
  }

  heightAt(x, z) {
    if (this.elevated) return this.elevated.floorY;
    const n = this.grid.nearest(x, z, 300);
    const d = this.baseline + this.dunes(x, z);
    if (n.i < 0) return d - 1.6;
    const t = this.track;
    let ty = t.py[n.i] - 1.6;
    // sous un pont ou le trou d'un saut, le sol plonge : eau, lave ou ravin
    if (t.deck[n.i] || t.gap[n.i]) {
      ty = t.waterLevel !== null ? Math.min(t.waterLevel - 7, t.py[n.i] - 12) : t.py[n.i] - 38;
    }
    const b = smoothstep(95, 285, n.d);
    return lerp(ty, d - 1.6, b);
  }

  // Le décor ne doit ni traverser la colline d'un tunnel ni encombrer un pont.
  blockedBySection(nn) {
    if (nn.i < 0) return false;
    const t = this.track, ne = t.width[nn.i] / 2;
    if (t.tunnel[nn.i] && nn.d < ne + 85) return true;
    if ((t.deck[nn.i] || t.gap[nn.i] || t.embank[nn.i]) && nn.d < ne + 24) return true;
    return false;
  }

  build() {
    const th = this.theme;
    this.sky = makeSky(th);
    this.group.add(this.sky);
    this.scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
    this.scene.background = new THREE.Color(th.skyHorizon);

    this.group.add(new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiIntensity));
    const sun = new THREE.DirectionalLight(th.sunColor, th.sunIntensity);
    sun.position.set(...th.sunDir).multiplyScalar(1000);
    this.group.add(sun);
    this.sun = sun;

    this.buildTerrain();
    if (th.water) this.buildWater();
    if (th.clouds) this.buildClouds();
    this.buildMountains();
    this.buildProps();
    this.buildStartArea();
    this.weather = new Weather(this.group, th.weather);
    this.traffic = th.traffic ? new Traffic(this.group, this.track, th.traffic) : null;
    return this;
  }

  buildTerrain() {
    const th = this.theme;
    const size = 9200, seg = this.elevated ? 40 : 184;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    g.translate(this.center.x, 0, this.center.z);
    const p = g.attributes.position;
    const cols = new Float32Array(p.count * 3);
    const cS = new THREE.Color(th.ground.base), cD = new THREE.Color(th.ground.dark), cL = new THREE.Color(th.ground.light);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      if (this.elevated) {
        p.setY(i, this.elevated.floorY);
        const t = (noise2(x * 0.01, z * 0.01) + 1) / 2;
        c.copy(cD).lerp(cS, t).lerp(cL, Math.max(0, noise2(x * 0.05, z * 0.05)) * 0.6);
      } else {
        const y = this.heightAt(x, z);
        p.setY(i, y);
        if (th.groundByHeight && th.water) {
          // plage près de l'eau, végétation plus haut
          const t = clamp((y - this.waterLevel) / 14, 0, 1);
          c.copy(cD).lerp(cS, smoothstep(0, 0.25, t)).lerp(cL, smoothstep(0.45, 0.8, t));
        } else {
          const t = clamp((this.dunes(x, z) / this.amp + 4) / 12, 0, 1);
          c.copy(cD).lerp(cS, smoothstep(0.1, 0.5, t)).lerp(cL, smoothstep(0.6, 0.95, t));
        }
      }
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, toon({ vertexColors: true }));
    m.name = 'terrain';
    this.group.add(m);
  }

  buildWater() {
    const w = this.theme.water;
    const g = new THREE.PlaneGeometry(14000, 14000, 1, 1);
    g.rotateX(-Math.PI / 2);
    const mat = w.lava
      ? new THREE.MeshBasicMaterial({ color: w.color })
      : toon({ color: w.color, emissive: new THREE.Color(w.color).multiplyScalar(0.15) });
    const m = new THREE.Mesh(g, mat);
    m.position.set(this.center.x, this.waterLevel, this.center.z);
    m.name = 'water';
    this.group.add(m);
  }

  buildClouds() {
    const c = this.theme.clouds;
    const g = new THREE.PlaneGeometry(14000, 14000, 1, 1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: cloudTexture(c.color, c.color2 || c.color) }));
    m.position.set(this.center.x, c.y, this.center.z);
    m.name = 'clouds';
    this.group.add(m);
  }

  buildMountains() {
    const th = this.theme;
    const mt = th.mountains || {};
    if (mt.style === 'none') return;
    const R = 4300, segs = mt.style === 'city' ? 220 : 160;
    const pos = [], col = [], idx = [];
    const cTop = new THREE.Color(mt.color).lerp(new THREE.Color(th.fog), 0.35);
    const cBot = new THREE.Color(th.fog);
    const base = this.elevated ? this.elevated.floorY : this.baseline - 40;
    const hm = mt.height || 1;
    const rnd = mulberry32(31);
    let cityH = 0;
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const x = this.center.x + Math.cos(a) * R, z = this.center.z + Math.sin(a) * R;
      const kk = k % segs;
      let hgt;
      if (mt.style === 'city') {
        if (k % 2 === 0) cityH = (120 + rnd() * 380) * hm;
        hgt = cityH;
      } else {
        hgt = (90 + 260 * Math.max(0, noise2(kk * 0.11, 3.7) * 0.6 + noise2(kk * 0.37, 9.1) * 0.4 + 0.25)) * hm;
      }
      pos.push(x, base, z, x, base + hgt + (this.elevated ? -this.elevated.floorY * 0.6 : 40), z);
      col.push(cBot.r, cBot.g, cBot.b, cTop.r, cTop.g, cTop.b);
    }
    for (let k = 0; k < segs; k++) {
      const a = 2 * k;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    m.renderOrder = -5;
    m.name = 'mountains';
    this.group.add(m);
  }

  // Décors procéduraux décrits par theme.props
  buildProps() {
    const th = this.theme, t = this.track;
    const rnd = mulberry32(1234);
    const N = t.N;
    const floorY = this.elevated ? this.elevated.floorY : null;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3();
    const eul = new THREE.Euler();
    const col = new THREE.Color();
    this.rockOutline = null;
    for (const P of th.props || []) {
      if (!P.count || !PROP_TYPES[P.type]) continue;
      const def = PROP_TYPES[P.type](th, P);
      const count = Math.max(1, Math.round(P.count * this.density));
      const meshes = def.parts.map((part) => new THREE.InstancedMesh(part.geo, part.mat, count));
      meshes.forEach((m, k) => { if (k > 0) m.instanceMatrix = meshes[0].instanceMatrix; });
      const isRock = P.type === 'rock' && !P.scale;
      const avgScale = P.scale ? (P.scale[0] + P.scale[1]) / 2 : isRock ? 2 : def.radius > 1 ? 120 : 10;
      const outlines = [];
      def.parts.forEach((part, k) => {
        if (part.noOutline || P.noOutline) return;
        const om = new THREE.InstancedMesh(smoothNormalsClone(part.geo), outlineMaterial(clamp(0.22 / avgScale, 0.003, 0.08)), count);
        om.instanceMatrix = meshes[0].instanceMatrix;
        outlines.push(om);
      });
      const place = P.place || 'near';
      const band = P.band || [12, 90];
      let n = 0, guard = 0;
      while (n < count && guard++ < count * 30) {
        let x, z, y = null, s;
        let sx, sy, sz;
        if (isRock) {
          // rochers : éboulis près de la piste, gros blocs plus loin, cailloux sur les plateaux
          const i = Math.floor(rnd() * N);
          const H = t.wallH[i], e = t.width[i] / 2, side = rnd() < 0.5 ? -1 : 1;
          if (H > 2) {
            if (rnd() < 0.5) continue;
            const lat = side * (e + 30 + rnd() * 50);
            s = 1 + rnd() * 3;
            x = t.px[i] + t.rx[i] * lat; z = t.pz[i] + t.rz[i] * lat; y = t.py[i] + H + 0.5;
          } else {
            const far = rnd() < 0.3;
            const lat = side * (e + (far ? 60 + rnd() * 220 : 11 + rnd() * 60));
            s = far ? 3 + rnd() * 9 : 0.6 + rnd() * 2.8;
            x = t.px[i] + t.rx[i] * lat; z = t.pz[i] + t.rz[i] * lat;
            const nn = this.grid.nearest(x, z, s + 120);
            if (nn.i >= 0 && nn.d < t.width[nn.i] / 2 + s + 2) continue;
            if (nn.i >= 0 && t.wallH[nn.i] > 2 && nn.d < t.width[nn.i] / 2 + 100) continue;
            if (this.blockedBySection(nn)) continue;
            y = (this.elevated ? floorY : this.heightAt(x, z)) + s * 0.25;
          }
          sx = s * (0.8 + rnd() * 0.5); sy = s * (0.6 + rnd() * 0.7); sz = s * (0.8 + rnd() * 0.5);
        } else {
          s = P.scale ? lerp(P.scale[0], P.scale[1], rnd()) : (def.radius > 1 ? 50 + rnd() * 150 : 10);
          const clearR = s * def.radius;
          if (place === 'far') {
            const a = rnd() * Math.PI * 2;
            const fr = P.far || [600, 2900];
            const r = lerp(fr[0], fr[1], rnd());
            x = this.center.x + Math.cos(a) * r * 1.15; z = this.center.z + Math.sin(a) * r;
            if (this.grid.nearest(x, z, clearR + 180).i >= 0) continue;
          } else {
            const i = Math.floor(rnd() * N);
            const H = t.wallH[i], e = t.width[i] / 2, side = rnd() < 0.5 ? -1 : 1;
            if (place === 'plateau') {
              if (H < 20) continue;
              const lat = side * (e + 24 + rnd() * 40);
              x = t.px[i] + t.rx[i] * lat; z = t.pz[i] + t.rz[i] * lat;
              y = t.py[i] + H + 0.3;
            } else {
              if (H > 2) continue;
              const lat = side * (e + lerp(band[0], band[1], rnd()) + clearR * 0.5);
              x = t.px[i] + t.rx[i] * lat; z = t.pz[i] + t.rz[i] * lat;
            }
            const nn = this.grid.nearest(x, z, clearR + 150);
            if (nn.i >= 0) {
              const ne = t.width[nn.i] / 2;
              const need = place === 'plateau' ? ne + 18 : t.wallH[nn.i] > 2 ? ne + 100 + clearR : ne + clearR + 4;
              if (nn.d < need) continue;
              if (this.blockedBySection(nn)) continue;
            }
          }
          if (P.yRange) y = lerp(P.yRange[0], P.yRange[1], rnd());
          else if (y === null) y = this.elevated ? floorY : this.heightAt(x, z);
          if (!this.elevated && th.water && !P.inWater && !P.yRange && place !== 'plateau' && y < this.waterLevel + 0.4) continue;
          sx = s; sy = s; sz = s;
          if (def.building) { sy = lerp(P.height[0], P.height[1], rnd()); sz = s * (0.7 + rnd() * 0.6); }
          else if (P.type === 'stiltPod') { sy = lerp(P.height[0], P.height[1], rnd()); }
          else if (P.height) sy = s * lerp(P.height[0], P.height[1], rnd());
          y -= sy * (P.sink ?? (def.tilt ? 0.18 : 0.02));
        }
        const tilt = def.tilt || 0;
        eul.set((rnd() - 0.5) * tilt, rnd() * Math.PI * 2, (rnd() - 0.5) * tilt);
        q.setFromEuler(eul);
        v.set(x, y, z);
        sc.set(sx, sy, sz);
        m4.compose(v, q, sc);
        meshes[0].setMatrixAt(n, m4);
        def.parts.forEach((part, k) => {
          if (!part.palette) return;
          col.set(part.palette[Math.floor(rnd() * part.palette.length)]);
          meshes[k].setColorAt(n, col);
        });
        n++;
      }
      for (const m of meshes) { m.count = n; this.group.add(m); }
      for (const o of outlines) { o.count = n; this.group.add(o); }
      if (P.type === 'rock' && outlines.length) this.rockOutline = outlines[0];
    }
  }

  buildStartArea() {
    const t = this.track, th = this.theme;
    const i0 = 0;
    const e = t.width[i0] / 2;
    const G = th.gantry;

    // Portique de départ avec feux
    const parts = [];
    const towerH = this.elevated ? 22 : 22;
    const tower = (lat) => {
      const g = new THREE.BoxGeometry(3, towerH, 3);
      g.translate(lat, towerH / 2, 0);
      parts.push(paint(g, G.frame));
      const cap = new THREE.BoxGeometry(4, 1.2, 4);
      cap.translate(lat, towerH + 0.6, 0);
      parts.push(paint(cap, G.cap));
    };
    tower(-e - 3);
    tower(e + 3);
    const beam = new THREE.BoxGeometry(2 * e + 10, 3, 2.4);
    beam.translate(0, 19, 0);
    parts.push(paint(beam, G.beam));
    const banner = new THREE.BoxGeometry(2 * e - 4, 2.2, 0.3);
    banner.translate(0, 16.4, -0.2);
    parts.push(paint(banner, G.banner));
    const gantryGeo = mergeColored(parts);
    const gantry = new THREE.Group();
    gantry.add(new THREE.Mesh(gantryGeo, toon({ vertexColors: true })));
    gantry.add(new THREE.Mesh(smoothNormalsClone(gantryGeo), outlineMaterial(0.12)));
    gantry.matrixAutoUpdate = false;
    gantry.matrix.copy(t.frameMatrix(i0, 0, 0));
    this.group.add(gantry);

    this.startLights = [];
    const lightGeo = new THREE.SphereGeometry(0.9, 12, 8);
    for (let k = 0; k < 5; k++) {
      const l = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x331111 }));
      l.position.set((k - 2) * 4, 19, -1.4);
      gantry.add(l);
      this.startLights.push(l);
    }

    if (this.elevated) return; // pas de tribunes au-dessus du vide

    const S = th.stands;
    const stands = [];
    for (let k = 0; k < 4; k++) {
      const s = -120 + k * 70;
      const i = Math.floor(t.wrapS(s) / t.step);
      if (t.wallH[i] > 2) continue;
      const m = t.frameMatrix(i, 0, 0);
      for (let tier = 0; tier < 4; tier++) {
        const g = new THREE.BoxGeometry(14, 3 + tier * 3, 55);
        g.translate(e + 26 + tier * 6, (3 + tier * 3) / 2 - 1, 0);
        paint(g, tier % 2 ? S.a : S.b);
        g.applyMatrix4(m);
        stands.push(g);
      }
      const awn = new THREE.BoxGeometry(10, 0.5, 52);
      awn.translate(e + 44, 16, 0);
      paint(awn, S.awnings[k % S.awnings.length]);
      awn.applyMatrix4(m);
      stands.push(awn);
      const pole = new THREE.CylinderGeometry(0.4, 0.4, 16, 6);
      pole.translate(e + 40, 8, 24);
      paint(pole, G.cap);
      pole.applyMatrix4(m);
      stands.push(pole);
    }
    if (th.domes) {
      const rnd = mulberry32(5);
      for (let k = 0; k < 12; k++) {
        const s = -260 + k * 55 + rnd() * 20;
        const i = Math.floor(t.wrapS(s) / t.step);
        const m = t.frameMatrix(i, 0, 0);
        const rr = 6 + rnd() * 9;
        const lat = -(e + 34 + rnd() * 70);
        const base = new THREE.CylinderGeometry(rr, rr * 1.05, rr * 0.7, 14);
        base.translate(lat, rr * 0.35 - 1.5, 0);
        paint(base, S.a);
        const dome = new THREE.SphereGeometry(rr, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
        dome.translate(lat, rr * 0.7 - 1.5, 0);
        paint(dome, k % 3 === 0 ? 0xf0dcb8 : S.a);
        const door = new THREE.BoxGeometry(rr * 0.5, rr * 0.6, 1);
        door.translate(lat + rr * 0.95, rr * 0.3 - 1.5, 0);
        paint(door, 0x4a3524);
        for (const g of [base, dome, door]) { g.applyMatrix4(m); stands.push(g); }
      }
    }
    if (stands.length) {
      const bg = mergeColored(stands);
      this.group.add(new THREE.Mesh(bg, toon({ vertexColors: true })));
      this.group.add(new THREE.Mesh(smoothNormalsClone(bg), outlineMaterial(0.15)));
    }
  }

  // n = nombre de feux rouges allumés (0..5), go = vert
  setStartLights(n, go = false) {
    if (!this.startLights) return;
    this.startLights.forEach((l, k) => {
      l.material.color.set(go ? 0x3cff6a : k < n ? 0xff2a1a : 0x331111);
    });
  }

  update(camera, dt = 0, pixelScale = 400, covered = false) {
    if (this.sky) camera.getWorldPosition(this.sky.position);
    if (this.weather) for (const l of this.weather.layers) l.points.visible = !covered; // pas de pluie dans un tunnel
    if (this.weather && this.weather.layers.length && !covered) {
      camera.getWorldPosition(this._cam || (this._cam = new THREE.Vector3()));
      this.weather.update(dt, this._cam, pixelScale);
    }
    if (this.traffic) this.traffic.update(dt);
  }

  dispose() {
    if (this.weather) this.weather.dispose();
    if (this.traffic) this.traffic.dispose();
    this.scene.remove(this.group);
    disposeTree(this.group);
  }
}

export { disposeTree };
