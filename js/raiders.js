// Pillards embusqués sur les crêtes des canyons, qui tirent des traits laser sur les glisseurs.
import * as THREE from 'three';
import { toon, outlineMaterial, smoothNormalsClone, mergeColored, paint } from './toon.js';
import { clamp, mulberry32 } from './util.js';

const BOLT_SPEED = 290;
const MAX_BOLTS = 90;

function raiderGeometry(look) {
  const parts = [];
  const robe = new THREE.ConeGeometry(0.75, 2.0, 8);
  robe.translate(0, 1.0, 0);
  parts.push(paint(robe, look.robe));
  const sash = new THREE.CylinderGeometry(0.5, 0.58, 0.25, 8);
  sash.translate(0, 1.15, 0);
  parts.push(paint(sash, look.sash));
  const head = new THREE.SphereGeometry(0.36, 10, 8);
  head.translate(0, 2.25, 0);
  parts.push(paint(head, look.head));
  for (const sx of [-1, 1]) {
    const eye = new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8);
    eye.rotateX(Math.PI / 2);
    eye.translate(sx * 0.14, 2.3, -0.32);
    parts.push(paint(eye, 0x1d1712));
  }
  const tube = new THREE.CylinderGeometry(0.05, 0.05, 0.35, 6);
  tube.rotateX(0.5);
  tube.translate(0, 2.05, -0.33);
  parts.push(paint(tube, 0x6b5a45));
  const rifle = new THREE.BoxGeometry(0.12, 0.14, 1.9);
  rifle.translate(0.35, 1.55, -0.75);
  parts.push(paint(rifle, 0x3b2e24));
  const arm = new THREE.CylinderGeometry(0.11, 0.11, 0.8, 6);
  arm.rotateX(Math.PI / 2.3);
  arm.translate(0.32, 1.6, -0.3);
  parts.push(paint(arm, look.robe));
  const g = mergeColored(parts);
  g.scale(2.4, 2.4, 2.4);
  return g;
}

export class Raiders {
  constructor(scene, track, effects, audio) {
    this.scene = scene;
    this.track = track;
    this.effects = effects;
    this.audio = audio;
    this.list = [];
    this.bolts = [];
    this.active = true;
    this.rate = 1;
    this.cooldownMul = 1;
    this.spread = 1;
  }

  build() {
    const t = this.track;
    const rnd = mulberry32(2024);
    let i = 0;
    while (i < t.N) {
      if (t.wallH[i] < 24) { i++; continue; }
      const side = rnd() < 0.5 ? -1 : 1;
      const prof = t.wallProfile(i, side);
      const rim = prof[6], pl = prof[7];
      const lo = rim[0] + 1.6;
      const f = clamp((lo - rim[0]) / (pl[0] - rim[0]), 0, 1);
      const h = rim[1] + (pl[1] - rim[1]) * f;
      const e = t.width[i] / 2;
      const lat = side * (e + lo);
      const pos = new THREE.Vector3(t.px[i] + t.rx[i] * lat, t.py[i] + h, t.pz[i] + t.rz[i] * lat);
      this.list.push({
        pos, index: i, side,
        yaw: Math.atan2(t.rx[i] * side, t.rz[i] * side), // regarde vers la piste par défaut
        cd: 1 + rnd() * 3,
        muzzle: new THREE.Vector3(),
      });
      i += Math.round((95 + rnd() * 90) / t.step);
    }

    const geo = raiderGeometry(t.theme.raiders);
    this.name = t.theme.raiders.name || 'PILLARD';
    this.mesh = new THREE.InstancedMesh(geo, toon({ vertexColors: true }), this.list.length);
    this.outline = new THREE.InstancedMesh(smoothNormalsClone(geo), outlineMaterial(0.05), this.list.length);
    this.outline.instanceMatrix = this.mesh.instanceMatrix;
    this.mesh.frustumCulled = false;
    this.outline.frustumCulled = false;
    this.scene.add(this.mesh, this.outline);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this._up = new THREE.Vector3(0, 1, 0);
    this.list.forEach((r, k) => this.updateMatrix(r, k));

    // traits laser
    const bGeo = new THREE.CylinderGeometry(0.17, 0.17, 5, 6);
    bGeo.rotateX(Math.PI / 2);
    const gGeo = new THREE.CylinderGeometry(0.5, 0.5, 6, 6);
    gGeo.rotateX(Math.PI / 2);
    this.boltMesh = new THREE.InstancedMesh(bGeo, new THREE.MeshBasicMaterial({ color: 0xffd0c0, fog: false }), MAX_BOLTS);
    this.glowMesh = new THREE.InstancedMesh(gGeo, new THREE.MeshBasicMaterial({ color: 0xff2a10, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), MAX_BOLTS);
    for (const m of [this.boltMesh, this.glowMesh]) {
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m);
    }
    for (let k = 0; k < MAX_BOLTS; k++) this.bolts.push({ alive: false, pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, floor: 0, near: false });
    return this;
  }

  updateMatrix(r, k) {
    this._q.setFromAxisAngle(this._up, r.yaw);
    this._m.compose(r.pos, this._q, this._s);
    this.mesh.setMatrixAt(k, this._m);
  }

  dispose() {
    for (const m of [this.mesh, this.outline, this.boltMesh, this.glowMesh]) {
      if (!m) continue;
      this.scene.remove(m);
      m.geometry.dispose();
      if (!m.material.userData.shared) m.material.dispose();
    }
    this.list = [];
    this.bolts = [];
  }

  configure(raiderCfg, diff) {
    this.active = raiderCfg.active;
    this.rate = raiderCfg.rate;
    this.cooldownMul = diff.raiderCooldown;
    this.spread = diff.raiderSpread;
    this.mesh.visible = this.outline.visible = this.active;
  }

  reset() {
    for (const b of this.bolts) b.alive = false;
    this.list.forEach((r) => (r.cd = 1 + Math.random() * 3));
  }

  fire(r, target, k) {
    const b = this.bolts.find((x) => !x.alive);
    if (!b) return;
    // le pillard se tourne vers sa cible
    const dx = target.pos.x - r.pos.x, dz = target.pos.z - r.pos.z;
    r.yaw = Math.atan2(-dx, -dz);
    this.updateMatrix(r, k);
    this.mesh.instanceMatrix.needsUpdate = true;
    const fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw);
    r.muzzle.set(r.pos.x + fx * 4.4 + Math.cos(r.yaw) * 0.85, r.pos.y + 3.7, r.pos.z + fz * 4.4 - Math.sin(r.yaw) * 0.85);
    // visée avec anticipation + imprécision
    const dist = r.muzzle.distanceTo(target.pos);
    const tFlight = dist / BOLT_SPEED;
    const err = (2.5 + dist * 0.03) * this.spread * (target.isPlayer ? 1 : 1.4);
    const aim = new THREE.Vector3(
      target.pos.x + target.vel.x * tFlight + (Math.random() - 0.5) * 2 * err,
      target.pos.y + (Math.random() - 0.5) * err * 0.6,
      target.pos.z + target.vel.z * tFlight + (Math.random() - 0.5) * 2 * err
    );
    b.alive = true;
    b.pos.copy(r.muzzle);
    b.prev.copy(r.muzzle);
    b.vel.subVectors(aim, r.muzzle).normalize().multiplyScalar(BOLT_SPEED);
    b.life = 2.2;
    b.floor = target.groundY - 0.2;
    b.near = false;
    this.effects.flash(r.muzzle, 0xff5a30, 5);
    this.audio.laser(r.muzzle);
  }

  update(dt, race) {
    const racers = race.racers;
    if (this.active && race.state === 'race') {
      this.list.forEach((r, k) => {
        r.cd -= dt;
        if (r.cd > 0) return;
        const cands = [];
        let playerCand = null;
        for (const o of racers) {
          if (o.destroyed || o.finished) continue;
          const dx = o.pos.x - r.pos.x, dy = o.pos.y - r.pos.y, dz = o.pos.z - r.pos.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < 45 || d > 320) continue;
          const approaching = -(dx * o.vel.x + dz * o.vel.z) > 0;
          if (!approaching && d > 110) continue;
          cands.push(o);
          if (o.isPlayer) playerCand = o;
        }
        if (!cands.length) { r.cd = 0.4; return; }
        const target = playerCand && Math.random() < 0.72 ? playerCand : cands[Math.floor(Math.random() * cands.length)];
        this.fire(r, target, k);
        r.cd = (1.5 + Math.random() * 1.9) * this.cooldownMul / Math.max(0.1, this.rate);
      });
    }

    // déplacement et collisions des traits
    const player = race.player;
    let n = 0;
    for (const b of this.bolts) {
      if (!b.alive) continue;
      b.prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead) {
        for (const o of racers) {
          if (o.destroyed) continue;
          const dx0 = o.pos.x - b.pos.x, dz0 = o.pos.z - b.pos.z;
          if (dx0 * dx0 + dz0 * dz0 > 400) continue;
          for (const c of o.collisionCircles()) {
            if (segSphere(b.prev, b.pos, c.x, o.pos.y, c.z, c.r + 0.35)) {
              race.onLaserHit(o, b.pos.clone(), b.vel);
              dead = true;
              break;
            }
          }
          if (dead) break;
        }
      }
      if (!dead && b.pos.y < b.floor) {
        this.effects.impactDust(b.pos);
        this.effects.sparks(b.pos, null, 8, 18);
        if (player && b.pos.distanceTo(player.pos) < 60) this.audio.boltImpact(b.pos);
        dead = true;
      }
      // frôlement : sifflement près du joueur
      if (!dead && !b.near && player && b.pos.distanceToSquared(player.pos) < 100) {
        b.near = true;
        this.audio.nearMiss(b.pos);
      }
      if (dead) { b.alive = false; continue; }
      this._q.setFromUnitVectors(FWD, TMP.copy(b.vel).normalize());
      this._m.compose(b.pos, this._q, this._s);
      this.boltMesh.setMatrixAt(n, this._m);
      this.glowMesh.setMatrixAt(n, this._m);
      n++;
    }
    this.boltMesh.count = this.glowMesh.count = n;
    this.boltMesh.instanceMatrix.needsUpdate = true;
    this.glowMesh.instanceMatrix.needsUpdate = true;
  }
}

const FWD = new THREE.Vector3(0, 0, 1);
const TMP = new THREE.Vector3();

function segSphere(a, b, cx, cy, cz, r) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = cx - a.x, acy = cy - a.y, acz = cz - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz || 1e-6;
  const t = clamp((acx * abx + acy * aby + acz * abz) / ab2, 0, 1);
  const px = a.x + abx * t - cx, py = a.y + aby * t - cy, pz = a.z + abz * t - cz;
  return px * px + py * py + pz * pz < r * r;
}
