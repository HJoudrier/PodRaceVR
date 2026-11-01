// Effets visuels : particules (étincelles, feu, fumée, poussière), éclairs, lignes de vitesse.
import * as THREE from 'three';
import { clamp } from './util.js';

const VERT = `
  attribute float psize;
  attribute float palpha;
  attribute vec3 pcolor;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    // les particules très proches de l'œil disparaissent (confort VR + coût de remplissage)
    float nearFade = smoothstep(1.2, 6.0, dist);
    gl_PointSize = min(420.0, psize * nearFade * uScale * projectionMatrix[1][1] / max(0.2, dist));
    vColor = pcolor;
    vAlpha = palpha * nearFade;
  }`;
const FRAG = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.15, d) * vAlpha;
    gl_FragColor = vec4(vColor, a);
    #include <colorspace_fragment>
  }`;

class ParticlePool {
  constructor(scene, n, additive) {
    this.n = n;
    this.cursor = 0;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n);
    this.a0 = new Float32Array(n);
    this.c0 = new Float32Array(n * 3); this.c1 = new Float32Array(n * 3);
    this.drag = new Float32Array(n); this.grav = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('palpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    this.geo = g;
    this.alive = 0;
    scene.add(this.points);
  }

  spawn(x, y, z, vx, vy, vz, life, s0, s1, a0, c0, c1, drag = 1, grav = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.c0[i3] = c0.r; this.c0[i3 + 1] = c0.g; this.c0[i3 + 2] = c0.b;
    this.c1[i3] = c1.r; this.c1[i3 + 1] = c1.g; this.c1[i3 + 2] = c1.b;
    this.drag[i] = drag; this.grav[i] = grav;
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; }
        continue;
      }
      alive++;
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const i3 = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= dr; this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt; this.vel[i3 + 2] *= dr;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = this.a0[i] * (1 - t) * Math.min(1, t * 8 + 0.3);
      this.col[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      this.col[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      this.col[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
    }
    this.alive = alive;
    const a = this.geo.attributes;
    a.position.needsUpdate = true; a.pcolor.needsUpdate = true; a.palpha.needsUpdate = true; a.psize.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}

const C = (h) => new THREE.Color(h);
const COL = {
  sparkA: C(0xfff3b0), sparkB: C(0xff6a1a),
  fireA: C(0xffe08a), fireB: C(0xc8300a),
  smokeA: C(0x6a6058), smokeB: C(0x2a2522),
  greyA: C(0xb0a89c), greyB: C(0x7a7068),
  dustA: C(0xd8b07a), dustB: C(0xc79a66),
  flash: C(0xffffff),
};

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.add = new ParticlePool(scene, 2400, true);
    this.norm = new ParticlePool(scene, 1800, false);
    this.quality = 1;
    this.lineStretch = 1; // allongement des traînées (réglage « flou de vitesse »)

    // lignes de vitesse : fines barres étirées dans le sens du déplacement
    this.LINES = 170;
    const lg = new THREE.BoxGeometry(1, 1, 1);
    lg.translate(0, 0, 0.5);
    this.lineMat = new THREE.MeshBasicMaterial({ color: 0xfff1d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.lines = new THREE.InstancedMesh(lg, this.lineMat, this.LINES);
    this.lines.frustumCulled = false;
    this.lines.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.lines.renderOrder = 7;
    scene.add(this.lines);
    this.linePos = [];
    for (let i = 0; i < this.LINES; i++) this.linePos.push(new THREE.Vector3(1e6, 0, 0));
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
    this._f = new THREE.Vector3(); this._r = new THREE.Vector3(); this._u = new THREE.Vector3(0, 1, 0);
    this._z = new THREE.Vector3(0, 0, 1); this._d = new THREE.Vector3();
  }

  // 0.5 (basse) .. 1 (haute) : nombre de lignes de vitesse
  setQuality(f) {
    this.quality = f;
    this.lines.count = Math.round(this.LINES * (0.45 + 0.55 * f));
  }

  setPixelScale(halfHeight) {
    this.add.mat.uniforms.uScale.value = halfHeight;
    this.norm.mat.uniforms.uScale.value = halfHeight;
  }

  clear() {
    this.add.clear();
    this.norm.clear();
    for (const p of this.linePos) p.set(1e6, 0, 0);
  }

  sparks(pos, dir, n = 20, speed = 30) {
    for (let k = 0; k < n; k++) {
      const vx = (Math.random() - 0.5) * speed + (dir ? dir.x * speed * 0.6 : 0);
      const vy = Math.random() * speed * 0.6 + (dir ? dir.y * speed * 0.6 : 0);
      const vz = (Math.random() - 0.5) * speed + (dir ? dir.z * speed * 0.6 : 0);
      this.add.spawn(pos.x, pos.y, pos.z, vx, vy, vz, 0.25 + Math.random() * 0.35, 0.35, 0.08, 1, COL.sparkA, COL.sparkB, 1.5, 25);
    }
  }

  flash(pos, color = 0xffffff, size = 6) {
    const c = C(color);
    this.add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.12, size, size * 1.6, 1, c, c, 0, 0);
  }

  // jet de flammes : particules projetées le long de dir sur une longueur len
  flameJet(pos, dir, len, style, n = 6, strength = 1) {
    const c0 = this._fc0 || (this._fc0 = new THREE.Color()), c1 = this._fc1 || (this._fc1 = new THREE.Color());
    c0.set(style.core); c1.set(style.edge);
    const sp = len * 2.4;
    for (let k = 0; k < n; k++) {
      const j = 0.22 * sp;
      this.add.spawn(
        pos.x + (Math.random() - 0.5) * 0.8, pos.y + (Math.random() - 0.5) * 0.8, pos.z + (Math.random() - 0.5) * 0.8,
        dir.x * sp * (0.7 + Math.random() * 0.5) + (Math.random() - 0.5) * j,
        dir.y * sp * (0.7 + Math.random() * 0.5) + (Math.random() - 0.5) * j + 2,
        dir.z * sp * (0.7 + Math.random() * 0.5) + (Math.random() - 0.5) * j,
        0.42 + Math.random() * 0.2, 3.2 * strength, 8.5 * strength, 0.95, c0, c1, 1.0, -3);
    }
  }

  fire(pos, vel) {
    for (let k = 0; k < 2; k++) {
      this.add.spawn(pos.x + (Math.random() - 0.5) * 0.6, pos.y + (Math.random() - 0.5) * 0.6, pos.z + (Math.random() - 0.5) * 0.6,
        vel.x * 0.85 + (Math.random() - 0.5) * 4, vel.y + 2 + Math.random() * 3, vel.z * 0.85 + (Math.random() - 0.5) * 4,
        0.35 + Math.random() * 0.25, 1.4, 0.4, 0.9, COL.fireA, COL.fireB, 2.5, -4);
    }
  }

  smoke(pos, vel, dark = 0.5) {
    const a = dark > 0.5 ? COL.smokeA : COL.greyA;
    const b = dark > 0.5 ? COL.smokeB : COL.greyB;
    this.norm.spawn(pos.x, pos.y, pos.z,
      vel.x * 0.7 + (Math.random() - 0.5) * 3, vel.y + 1.5 + Math.random() * 2, vel.z * 0.7 + (Math.random() - 0.5) * 3,
      0.9 + Math.random() * 0.8, 1.0, 4.5, 0.55 + dark * 0.3, a, b, 1.6, -1.5);
  }

  dust(pos, vel, amount = 1) {
    this.norm.spawn(pos.x + (Math.random() - 0.5) * 3, pos.y, pos.z + (Math.random() - 0.5) * 3,
      vel.x * 0.25 + (Math.random() - 0.5) * 6, 1 + Math.random() * 3, vel.z * 0.25 + (Math.random() - 0.5) * 6,
      0.8 + Math.random() * 0.8, 1.5, 6 + amount * 3, 0.3 * amount, COL.dustA, COL.dustB, 1.2, 0);
  }

  impactDust(pos) {
    for (let k = 0; k < 6; k++) {
      this.norm.spawn(pos.x, pos.y + 0.3, pos.z, (Math.random() - 0.5) * 10, 3 + Math.random() * 6, (Math.random() - 0.5) * 10,
        0.8 + Math.random() * 0.6, 1.5, 5, 0.6, COL.dustA, COL.dustB, 2, 2);
    }
  }

  explosion(pos) {
    for (let k = 0; k < 70; k++) {
      const v = 8 + Math.random() * 25;
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI - Math.PI / 2;
      this.add.spawn(pos.x, pos.y, pos.z, Math.cos(th) * Math.cos(ph) * v, Math.abs(Math.sin(ph)) * v, Math.sin(th) * Math.cos(ph) * v,
        0.5 + Math.random() * 0.7, 3, 1, 1, COL.fireA, COL.fireB, 2.2, 3);
    }
    for (let k = 0; k < 40; k++) {
      this.norm.spawn(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 18, Math.random() * 12, (Math.random() - 0.5) * 18,
        1.5 + Math.random() * 1.5, 3, 12, 0.8, COL.smokeA, COL.smokeB, 1.2, -2);
    }
    this.sparks(pos, null, 50, 50);
    this.flash(pos, 0xffe0a0, 25);
  }

  // dt, position caméra, vecteur vitesse du joueur, vitesse scalaire, boost
  update(dt, camPos, vel, speed, boost, groundY) {
    this.add.update(dt);
    this.norm.update(dt);

    const op = clamp((speed - 55) / 160, 0, 1) * 0.42 + (boost ? 0.25 : 0);
    this.lineMat.opacity = op;
    this.lines.visible = op > 0.01;
    if (!this.lines.visible) return;
    const f = this._f;
    if (speed > 1) f.copy(vel).normalize(); else f.set(0, 0, -1);
    const r = this._r.crossVectors(f, this._u).normalize();
    const len = speed * 0.065 * (boost ? 1.5 : 1) * this.lineStretch;
    this._q.setFromUnitVectors(this._z, this._d.copy(f).negate());
    for (let i = 0; i < this.lines.count; i++) {
      const p = this.linePos[i];
      const rx = p.x - camPos.x, ry = p.y - camPos.y, rz = p.z - camPos.z;
      const along = rx * f.x + ry * f.y + rz * f.z;
      if (along < -6 || rx * rx + ry * ry + rz * rz > 260 * 260) {
        // tranche horizontale autour du pilote : sur les côtés et près du sol (pas de « pluie » dans le ciel)
        const side = Math.random() < 0.5 ? -1 : 1;
        const lat = side * (2.5 + Math.random() * 22);
        const dist = 25 + Math.random() * 170;
        p.set(
          camPos.x + f.x * dist + r.x * lat,
          groundY + 0.4 + Math.random() * Math.random() * 14,
          camPos.z + f.z * dist + r.z * lat
        );
        if (p.y < groundY + 0.3) p.y = groundY + 0.3 + Math.random() * 2;
      }
      this._s.set(0.045, 0.045, len);
      this._m.compose(p, this._q, this._s);
      this.lines.setMatrixAt(i, this._m);
    }
    this.lines.instanceMatrix.needsUpdate = true;
  }
}
