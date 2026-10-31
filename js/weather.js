// Météo autour du pilote (neige, pluie, cendres, braises, pollen, lucioles, poussière, spores)
// et trafic aérien (vaisseaux qui filent le long du circuit) : deux repères de vitesse bon marché.
import * as THREE from 'three';
import { toon, mergeColored, paint } from './toon.js';

const PRESETS = {
  snow: { n: 900, color: 0xffffff, size: 0.35, vel: [1.5, -5, 0.5], jitter: 1.5, additive: false, alpha: 0.9 },
  rain: { n: 1100, color: 0xbcd6ea, size: 0.16, vel: [2, -38, 0], jitter: 0.5, additive: false, alpha: 0.65 },
  ash: { n: 700, color: 0x3a3230, size: 0.32, vel: [1, -2.5, 0.5], jitter: 1.2, additive: false, alpha: 0.8 },
  embers: { n: 260, color: 0xff7a2a, size: 0.28, vel: [0.5, 3.5, 0], jitter: 2.5, additive: true, alpha: 1 },
  pollen: { n: 420, color: 0xfff0b0, size: 0.18, vel: [0.6, 0.2, 0.3], jitter: 0.8, additive: true, alpha: 0.75 },
  fireflies: { n: 380, color: 0xd8ff6a, size: 0.3, vel: [0, 0.3, 0], jitter: 1.6, additive: true, alpha: 1 },
  dust: { n: 600, color: 0xe0a070, size: 0.25, vel: [7, 0.2, 2], jitter: 1.5, additive: false, alpha: 0.55 },
  saltdust: { n: 500, color: 0xffffff, size: 0.22, vel: [5, 0.3, 1], jitter: 1.2, additive: false, alpha: 0.6 },
  spores: { n: 500, color: 0xffe86a, size: 0.26, vel: [0.3, 0.8, 0.2], jitter: 1.2, additive: true, alpha: 0.9 },
};

const VERT = `
  uniform float uScale; uniform float uSize;
  varying float vFade;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float d = -mv.z;
    vFade = smoothstep(0.8, 3.0, d) * (1.0 - smoothstep(45.0, 70.0, d));
    gl_PointSize = min(64.0, uSize * uScale * projectionMatrix[1][1] / max(0.3, d));
  }`;
const FRAG = `
  uniform vec3 uColor; uniform float uAlpha;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    gl_FragColor = vec4(uColor, smoothstep(0.5, 0.1, d) * uAlpha * vFade);
    #include <colorspace_fragment>
  }`;

class WeatherLayer {
  constructor(scene, preset) {
    const p = PRESETS[preset];
    this.p = p;
    this.box = 120;
    this.pos = new Float32Array(p.n * 3);
    this.phase = new Float32Array(p.n);
    for (let i = 0; i < p.n; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.box;
      this.pos[i * 3 + 1] = (Math.random() - 0.5) * this.box * 0.5;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.box;
      this.phase[i] = Math.random() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uSize: { value: p.size }, uColor: { value: new THREE.Color(p.color) }, uAlpha: { value: p.alpha } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: p.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.geo = g;
    this.t = 0;
    scene.add(this.points);
  }

  update(dt, cam, scale) {
    const p = this.p, B = this.box, H = B * 0.5;
    this.t += dt;
    this.mat.uniforms.uScale.value = scale;
    const a = this.pos;
    for (let i = 0; i < p.n; i++) {
      const i3 = i * 3;
      const ph = this.phase[i];
      a[i3] += (p.vel[0] + Math.sin(this.t * 0.7 + ph) * p.jitter) * dt;
      a[i3 + 1] += (p.vel[1] + Math.sin(this.t * 1.1 + ph * 1.3) * p.jitter * 0.5) * dt;
      a[i3 + 2] += (p.vel[2] + Math.cos(this.t * 0.9 + ph) * p.jitter) * dt;
      // boîte qui suit la caméra : les particules qui sortent réapparaissent de l'autre côté
      let rx = a[i3] - cam.x, ry = a[i3 + 1] - cam.y, rz = a[i3 + 2] - cam.z;
      if (rx > B / 2) a[i3] -= B; else if (rx < -B / 2) a[i3] += B;
      if (ry > H / 2) a[i3 + 1] -= H; else if (ry < -H / 2) a[i3 + 1] += H;
      if (rz > B / 2) a[i3 + 2] -= B; else if (rz < -B / 2) a[i3 + 2] += B;
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.points.parent?.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
  }
}

export class Weather {
  constructor(scene, cfg) {
    const list = !cfg ? [] : Array.isArray(cfg) ? cfg : [cfg];
    this.layers = list.filter((k) => PRESETS[k]).map((k) => new WeatherLayer(scene, k));
  }
  update(dt, cam, scale) { for (const l of this.layers) l.update(dt, cam, scale); }
  dispose() { for (const l of this.layers) l.dispose(); this.layers = []; }
}

// ---------------------------------------------------------------- trafic aérien
function shipGeometry() {
  return mergeColored([
    paint(new THREE.CapsuleGeometry(0.9, 3.2, 3, 8).rotateX(Math.PI / 2), 0xffffff),
    paint(new THREE.BoxGeometry(3.6, 0.2, 1.2).translate(0, 0, -0.8), 0xcccccc),
    paint(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10).rotateX(Math.PI / 2).translate(0, 0, -2.6), 0xffd890),
  ]);
}

export class Traffic {
  constructor(scene, track, cfg) {
    this.track = track;
    const n = cfg.count || 40;
    this.ships = [];
    const L = track.length;
    for (let i = 0; i < n; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.ships.push({
        s: Math.random() * L,
        speed: (60 + Math.random() * 110) * (Math.random() < 0.5 ? 1 : -1),
        lat: side * (45 + Math.random() * 160),
        y: -70 + Math.random() * 150,
        color: cfg.colors[i % cfg.colors.length],
      });
    }
    this.mesh = new THREE.InstancedMesh(shipGeometry(), toon({ vertexColors: true }), n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    const c = new THREE.Color();
    this.ships.forEach((s, i) => { c.set(s.color); this.mesh.setColorAt(i, c); });
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1); this._smp = {};
    this._up = new THREE.Vector3(0, 1, 0);
  }

  update(dt) {
    const t = this.track;
    this.ships.forEach((s, i) => {
      s.s += s.speed * dt;
      const p = t.sample(s.s, s.lat, this._smp);
      this._p.set(p.x, p.y + s.y, p.z);
      const yaw = Math.atan2(p.tx, p.tz) + (s.speed < 0 ? Math.PI : 0);
      this._q.setFromAxisAngle(this._up, yaw);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
