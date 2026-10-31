// Décor : ciel aux deux soleils, dunes, mesas, montagnes à l'horizon, rochers, zone de départ.
import * as THREE from 'three';
import { toon, outlineMaterial, smoothNormalsClone, mergeColored, paint } from './toon.js';
import { Track, rockMaterial } from './track.js';
import { clamp, lerp, smoothstep, noise2, mulberry32 } from './util.js';

function makeSky(theme) {
  const geo = new THREE.SphereGeometry(5000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(theme.skyTop) },
      horizon: { value: new THREE.Color(theme.skyHorizon) },
      sunDir: { value: new THREE.Vector3(...theme.sunDir).normalize() },
      sun2Dir: { value: new THREE.Vector3(...theme.sun2Dir).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sun2Dir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, top, pow(smoothstep(-0.03, 0.55, h), 0.75));
        float s1 = dot(d, sunDir);
        float s2 = dot(d, sun2Dir);
        col += vec3(1.0, 0.8, 0.55) * smoothstep(0.975, 1.0, s1) * 0.35;
        col += vec3(1.0, 0.65, 0.4) * smoothstep(0.985, 1.0, s2) * 0.25;
        col = mix(col, vec3(1.0, 0.98, 0.9), smoothstep(0.99905, 0.9992, s1));
        col = mix(col, vec3(1.0, 0.88, 0.62), smoothstep(0.99945, 0.9996, s2));
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
  // distance horizontale à l'échantillon le plus proche (dans un rayon max), et indice
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

export class Environment {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.theme = track.theme;
    this.grid = new TrackGrid(track);
    let cx = 0, cz = 0;
    for (let i = 0; i < track.N; i++) { cx += track.px[i]; cz += track.pz[i]; }
    this.center = new THREE.Vector3(cx / track.N, 0, cz / track.N);
    this.group = new THREE.Group();
    this.group.name = 'environment';
    scene.add(this.group);
  }

  dunes(x, z) {
    const r = 1 - Math.abs(noise2(x * 0.0017 + 3.3, z * 0.0024 - 1.2));
    return 10 * r * r - 4 + 3 * noise2(x * 0.006, z * 0.005) + 1.2 * noise2(x * 0.02, z * 0.017);
  }

  heightAt(x, z) {
    const n = this.grid.nearest(x, z, 300);
    const d = this.dunes(x, z);
    if (n.i < 0) return d - 1.6;
    const ty = this.track.py[n.i] - 1.6;
    const b = smoothstep(95, 285, n.d);
    return lerp(ty, d - 1.6, b);
  }

  build() {
    const th = this.theme;
    this.sky = makeSky(th);
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
    this.scene.background = new THREE.Color(th.skyHorizon);

    const hemi = new THREE.HemisphereLight(th.hemiSky, th.hemiGround, 1.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(th.sunColor, 2.3);
    sun.position.set(...th.sunDir).multiplyScalar(1000);
    this.scene.add(sun);
    this.sun = sun;

    this.buildTerrain();
    this.buildMountains();
    this.buildMesas();
    this.buildRocks();
    this.buildStartArea();
    return this;
  }

  buildTerrain() {
    const th = this.theme;
    const size = 9200, seg = 184;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    g.translate(this.center.x, 0, this.center.z);
    const p = g.attributes.position;
    const cols = new Float32Array(p.count * 3);
    const cS = new THREE.Color(th.sand), cD = new THREE.Color(th.sandDark), cL = new THREE.Color(th.sandLight);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const y = this.heightAt(x, z);
      p.setY(i, y);
      const dn = this.dunes(x, z);
      const t = clamp((dn + 4) / 12, 0, 1);
      c.copy(cD).lerp(cS, smoothstep(0.1, 0.5, t)).lerp(cL, smoothstep(0.6, 0.95, t));
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, toon({ vertexColors: true }));
    m.name = 'terrain';
    this.group.add(m);
  }

  buildMountains() {
    const th = this.theme;
    const R = 4300, segs = 160;
    const pos = [], col = [], idx = [];
    const cTop = new THREE.Color(th.mountains).lerp(new THREE.Color(th.fog), 0.35);
    const cBot = new THREE.Color(th.fog);
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const x = this.center.x + Math.cos(a) * R, z = this.center.z + Math.sin(a) * R;
      const kk = k % segs;
      const hgt = 90 + 260 * Math.max(0, noise2(kk * 0.11, 3.7) * 0.6 + noise2(kk * 0.37, 9.1) * 0.4 + 0.25);
      pos.push(x, -40, z, x, hgt, z);
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

  buildMesas() {
    const th = this.theme;
    const rnd = mulberry32(99);
    const geo = new THREE.CylinderGeometry(1, 1.25, 1, 11, 4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const s = 1 + 0.12 * noise2(a * 3, y * 4) + (y > 0.45 ? 0 : 0.08 * noise2(a * 9, y * 9));
      p.setXYZ(i, x * s, y, z * s);
    }
    geo.translate(0, 0.5, 0);
    geo.computeVertexNormals();
    const count = 34;
    const mesh = new THREE.InstancedMesh(geo, rockMaterial(th.strata, th.plateau, 9), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    let n = 0, guard = 0;
    while (n < count && guard++ < 3000) {
      const a = rnd() * Math.PI * 2;
      const r = 600 + rnd() * 2600;
      const x = this.center.x + Math.cos(a) * r * 1.2, z = this.center.z + Math.sin(a) * r;
      const rad = 50 + rnd() * 150;
      const near = this.grid.nearest(x, z, rad + 180);
      if (near.i >= 0) continue;
      const h = 35 + rnd() * 110;
      v.set(x, this.heightAt(x, z) - 6, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6);
      s.set(rad, h, rad * (0.6 + rnd() * 0.6));
      m.compose(v, q, s);
      mesh.setMatrixAt(n++, m);
    }
    mesh.count = n;
    mesh.name = 'mesas';
    this.group.add(mesh);
  }

  buildRocks() {
    const t = this.track;
    const rnd = mulberry32(1234);
    const geo = Track.rockGeometry(5, 1);
    const count = 700;
    const mesh = new THREE.InstancedMesh(geo, toon({ color: 0xffffff }), count);
    const out = new THREE.InstancedMesh(smoothNormalsClone(geo), outlineMaterial(0.06), count);
    out.instanceMatrix = mesh.instanceMatrix;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    const c = new THREE.Color();
    const palette = [0xb27447, 0xc08656, 0x9c6239, 0xc9946a];
    let n = 0, guard = 0;
    while (n < count && guard++ < 20000) {
      const i = Math.floor(rnd() * t.N);
      const H = t.wallH[i];
      const side = rnd() < 0.5 ? -1 : 1;
      const e = t.width[i] / 2;
      let lat, size;
      if (H > 2) {
        // dans les canyons : éboulis au pied des falaises, sur le plateau
        if (rnd() < 0.5) continue;
        lat = side * (e + 30 + rnd() * 50);
        size = 1 + rnd() * 3;
        v.set(t.px[i] + t.rx[i] * lat, t.py[i] + H + 0.5, t.pz[i] + t.rz[i] * lat);
      } else {
        const far = rnd() < 0.3;
        lat = side * (e + (far ? 60 + rnd() * 220 : 11 + rnd() * 60));
        size = far ? 3 + rnd() * 9 : 0.6 + rnd() * 2.8;
        const x = t.px[i] + t.rx[i] * lat, z = t.pz[i] + t.rz[i] * lat;
        v.set(x, this.heightAt(x, z) + size * 0.25, z);
      }
      q.setFromEuler(new THREE.Euler(rnd() * 0.5, rnd() * 6, rnd() * 0.5));
      s.set(size * (0.8 + rnd() * 0.5), size * (0.6 + rnd() * 0.7), size * (0.8 + rnd() * 0.5));
      m.compose(v, q, s);
      mesh.setMatrixAt(n, m);
      c.set(palette[n % palette.length]);
      mesh.setColorAt(n, c);
      n++;
    }
    mesh.count = n;
    out.count = n;
    this.rockOutline = out;
    this.group.add(mesh, out);
  }

  buildStartArea() {
    const t = this.track;
    const i0 = 0;
    const e = t.width[i0] / 2;
    const adobe = 0xe3c08f, adobeDark = 0xc9a070;

    // Portique de départ avec feux
    const parts = [];
    const tower = (lat) => {
      const g = new THREE.BoxGeometry(3, 22, 3);
      g.translate(lat, 11, 0);
      parts.push(paint(g, 0x8a6a4a));
      const cap = new THREE.BoxGeometry(4, 1.2, 4);
      cap.translate(lat, 22.6, 0);
      parts.push(paint(cap, 0x5b4632));
    };
    tower(-e - 3);
    tower(e + 3);
    const beam = new THREE.BoxGeometry(2 * e + 10, 3, 2.4);
    beam.translate(0, 19, 0);
    parts.push(paint(beam, 0x6f5236));
    const banner = new THREE.BoxGeometry(2 * e - 4, 2.2, 0.3);
    banner.translate(0, 16.4, -0.2);
    parts.push(paint(banner, 0xd9542f));
    const gantryGeo = mergeColored(parts);
    const gantry = new THREE.Group();
    gantry.add(new THREE.Mesh(gantryGeo, toon({ vertexColors: true })));
    gantry.add(new THREE.Mesh(smoothNormalsClone(gantryGeo), outlineMaterial(0.12)));
    gantry.matrixAutoUpdate = false;
    gantry.matrix.copy(t.frameMatrix(i0, 0, 0));
    this.group.add(gantry);

    // 5 feux de départ
    this.startLights = [];
    const lightGeo = new THREE.SphereGeometry(0.9, 12, 8);
    for (let k = 0; k < 5; k++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x331111 });
      const l = new THREE.Mesh(lightGeo, mat);
      l.position.set((k - 2) * 4, 19, -1.4);
      gantry.add(l);
      this.startLights.push(l);
    }

    // Tribunes (côté droit) et bâtiments à dôme (côté gauche)
    const stands = [];
    for (let k = 0; k < 4; k++) {
      const s = -120 + k * 70;
      const i = Math.floor(t.wrapS(s) / t.step);
      const m = t.frameMatrix(i, 0, 0);
      for (let tier = 0; tier < 4; tier++) {
        const g = new THREE.BoxGeometry(14 - tier * 0, 3 + tier * 3, 55);
        g.translate(e + 26 + tier * 6, (3 + tier * 3) / 2 - 1, 0);
        paint(g, tier % 2 ? adobe : adobeDark);
        g.applyMatrix4(m);
        stands.push(g);
      }
      const awn = new THREE.BoxGeometry(10, 0.5, 52);
      awn.translate(e + 44, 16, 0);
      paint(awn, k % 2 ? 0x2f6fd0 : 0xd9542f);
      awn.applyMatrix4(m);
      stands.push(awn);
      const pole = new THREE.CylinderGeometry(0.4, 0.4, 16, 6);
      pole.translate(e + 40, 8, 24);
      paint(pole, 0x5a4636);
      pole.applyMatrix4(m);
      stands.push(pole);
    }
    const domes = [];
    const rnd = mulberry32(5);
    for (let k = 0; k < 12; k++) {
      const s = -260 + k * 55 + rnd() * 20;
      const i = Math.floor(t.wrapS(s) / t.step);
      const m = t.frameMatrix(i, 0, 0);
      const rr = 6 + rnd() * 9;
      const lat = -(e + 34 + rnd() * 70);
      const base = new THREE.CylinderGeometry(rr, rr * 1.05, rr * 0.7, 14);
      base.translate(lat, rr * 0.35 - 1.5, 0);
      paint(base, adobe);
      const dome = new THREE.SphereGeometry(rr, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.translate(lat, rr * 0.7 - 1.5, 0);
      paint(dome, k % 3 === 0 ? 0xf0dcb8 : adobe);
      const door = new THREE.BoxGeometry(rr * 0.5, rr * 0.6, 1);
      door.translate(lat + rr * 0.95, rr * 0.3 - 1.5, 0);
      paint(door, 0x4a3524);
      for (const g of [base, dome, door]) { g.applyMatrix4(m); domes.push(g); }
    }
    const bg = mergeColored([...stands, ...domes]);
    this.group.add(new THREE.Mesh(bg, toon({ vertexColors: true })));
    this.group.add(new THREE.Mesh(smoothNormalsClone(bg), outlineMaterial(0.15)));
  }

  // n = nombre de feux rouges allumés (0..5), go = vert
  setStartLights(n, go = false) {
    if (!this.startLights) return;
    this.startLights.forEach((l, k) => {
      l.material.color.set(go ? 0x3cff6a : k < n ? 0xff2a1a : 0x331111);
    });
  }

  update(camera) {
    if (this.sky) camera.getWorldPosition(this.sky.position);
  }
}
