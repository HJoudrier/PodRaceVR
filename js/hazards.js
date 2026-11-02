// Jets de flammes : latéraux (balaient la moitié de la piste) ou geysers verticaux, en cycle
// repos -> alerte (lueur, étincelles) -> flammes. Ils brûlent les glisseurs qui passent dedans.
import * as THREE from 'three';
import { toon, mergeColored, paint, outlineMaterial, smoothNormalsClone } from './toon.js';
import { mulberry32 } from './util.js';

export const FLAME_STYLES = {
  fire: { core: 0xffe08a, edge: 0xc8300a, glow: 0xff7a2a, idle: 0x3a1408, label: 'FLAMMES' },
  toxic: { core: 0xeaff9a, edge: 0x2f8a1a, glow: 0x9aff4a, idle: 0x10300a, label: 'SPORES TOXIQUES' },
  plasma: { core: 0xe0f4ff, edge: 0x2a5ad8, glow: 0x6ab0ff, idle: 0x0a1838, label: 'PLASMA' },
};

const FIRE = 1.3;   // durée des flammes (s)
const WARN = 0.75;  // durée de l'alerte (s)

export class Hazards {
  constructor(scene, track, effects, audio) {
    this.scene = scene;
    this.track = track;
    this.effects = effects;
    this.audio = audio;
    this.jets = [];
    this.time = 0;
    this.meshes = [];
    this.fxScale = 1;
  }

  build() {
    const t = this.track;
    const rnd = mulberry32(77);
    for (const Z of t.flameZones) {
      const style = FLAME_STYLES[Z.color || t.theme.flames || 'fire'] || FLAME_STYLES.fire;
      for (let c = 0; c < Z.count; c++) {
        const i = (Z.i0 + Math.round(((c + 0.5) / Z.count) * Z.n)) % t.N;
        const e = t.width[i] / 2;
        const period = 3.4 + rnd() * 0.9;
        const offset = c * 1.05 + rnd() * 0.4; // décalage : vague de jets à traverser
        if (Z.kind === 'geyser') {
          // alternance gauche / droite : il reste toujours un couloir libre
          const lat = (c % 2 ? 1 : -1) * e * 0.45 + (rnd() - 0.5) * 2;
          this.jets.push({
            kind: 'geyser', i, lat, style, period, offset,
            x: t.px[i] + t.rx[i] * lat, y: t.py[i], z: t.pz[i] + t.rz[i] * lat,
            dx: 0, dy: 1, dz: 0, len: 18, radius: 3.2, state: 0,
          });
        } else {
          const side = c % 2 ? 1 : -1;
          const bl = side * (e + 0.7);
          this.jets.push({
            kind: 'side', i, side, style, period, offset,
            x: t.px[i] + t.rx[i] * bl, y: t.py[i] + 1.6, z: t.pz[i] + t.rz[i] * bl,
            dx: -side * t.rx[i], dy: 0, dz: -side * t.rz[i], len: e * 1.15, radius: 2.6, state: 0,
            // zone brûlée, en coordonnées latérales de la piste
            latMin: side > 0 ? e - e * 1.15 : -e, latMax: side > 0 ? e : -e + e * 1.15,
          });
        }
      }
    }
    if (!this.jets.length) return this;

    // buses (métal sombre) + anneau lumineux dont la couleur suit l'état du jet
    const sideGeo = mergeColored([
      paint(new THREE.BoxGeometry(2.2, 3.4, 2.6).translate(0, 1.0, 0), 0x3a3634),
      paint(new THREE.CylinderGeometry(0.9, 1.1, 1.6, 10).rotateZ(Math.PI / 2).translate(-1.1, 1.6, 0), 0x2a2624),
    ]);
    const ventGeo = mergeColored([
      paint(new THREE.CylinderGeometry(3.2, 3.6, 0.5, 14).translate(0, 0.05, 0), 0x2a2624),
      paint(new THREE.CylinderGeometry(2.2, 2.2, 0.56, 12).translate(0, 0.05, 0), 0x141210),
    ]);
    const sides = this.jets.filter((j) => j.kind === 'side');
    const vents = this.jets.filter((j) => j.kind === 'geyser');
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const mk = (geo, list, glowGeo) => {
      if (!list.length) return;
      const body = new THREE.InstancedMesh(geo, toon({ vertexColors: true }), list.length);
      const outl = new THREE.InstancedMesh(smoothNormalsClone(geo), outlineMaterial(0.06), list.length);
      outl.instanceMatrix = body.instanceMatrix;
      const glow = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), list.length);
      glow.instanceMatrix = body.instanceMatrix;
      const col = new THREE.Color();
      list.forEach((j, k) => {
        // la buse latérale s'ouvre vers -X local : on fait tourner -X sur la direction du jet
        q.setFromAxisAngle(up, j.kind === 'side' ? Math.atan2(j.dz, -j.dx) : 0);
        p.set(j.x, j.kind === 'side' ? j.y - 1.6 : j.y, j.z);
        m.compose(p, q, s);
        body.setMatrixAt(k, m);
        glow.setColorAt(k, col.set(j.style.idle));
        j.glowMesh = glow; j.glowIndex = k;
      });
      this.scene.add(body, outl, glow);
      this.meshes.push(body, outl, glow);
    };
    mk(sideGeo, sides, new THREE.CylinderGeometry(0.75, 0.75, 0.2, 12).rotateZ(Math.PI / 2).translate(-1.95, 1.6, 0));
    mk(ventGeo, vents, new THREE.TorusGeometry(2.6, 0.22, 6, 18).rotateX(Math.PI / 2).translate(0, 0.36, 0));
    return this;
  }

  stateAt(j, time) {
    const ph = (time + j.offset) % j.period;
    const fireStart = j.period - FIRE;
    if (ph >= fireStart) return 2;
    if (ph >= fireStart - WARN) return 1;
    return 0;
  }

  // Zones à éviter pour l'IA : jets qui seront actifs au moment où elle passera.
  dangerAhead(s, speed, out) {
    const t = this.track, L = t.length;
    for (const j of this.jets) {
      let ds = j.i * t.step - s;
      if (ds < -L / 2) ds += L;
      if (ds < -6 || ds > 170) continue;
      const tArrive = this.time + Math.max(0, ds) / Math.max(20, speed);
      const st = this.stateAt(j, tArrive);
      if (st === 0 && this.stateAt(j, tArrive + 0.4) === 0) continue;
      if (j.kind === 'geyser') out.push({ lat: j.lat, clear: j.radius + 4.5, ds });
      else out.push({ lat: (j.latMin + j.latMax) / 2, clear: (j.latMax - j.latMin) / 2 + 4, ds });
    }
    return out;
  }

  update(dt, race, camPos) {
    if (!this.jets.length) return;
    this.time += dt;
    const fx = this.effects;
    const col = new THREE.Color();
    const pos = new THREE.Vector3(), dir = new THREE.Vector3();
    for (const r of race.racers) r.flameCd = Math.max(0, (r.flameCd || 0) - dt);
    let dirty = false;
    for (const j of this.jets) {
      const st = this.stateAt(j, this.time);
      const near = (j.x - camPos.x) ** 2 + (j.z - camPos.z) ** 2 < 450 * 450;
      if (st !== j.state) {
        if (st === 2 && near && race.player.pos.distanceTo(pos.set(j.x, j.y, j.z)) < 300) this.audio.flameBurst(pos);
        j.state = st;
      }
      // lueur de la buse
      if (st === 2) col.set(j.style.core);
      else if (st === 1) col.set(Math.floor(this.time * 10) % 2 ? j.style.glow : j.style.idle);
      else col.set(j.style.idle);
      j.glowMesh.setColorAt(j.glowIndex, col);
      dirty = true;
      if (!near) continue;
      pos.set(j.x, j.y + (j.kind === 'geyser' ? 0.4 : 0), j.z);
      dir.set(j.dx, j.dy, j.dz);
      if (st === 1 && Math.random() < 0.35) fx.flameJet(pos, dir, 4, j.style, 1, 0.5);
      if (st === 2) {
        fx.flameJet(pos, dir, j.len, j.style, Math.max(3, Math.round(10 * this.fxScale)), 1);
        // glisseurs touchés
        for (const r of race.racers) {
          if (r.destroyed || r.flameCd > 0) continue;
          for (const c of r.collisionCircles()) {
            let hit = false;
            if (j.kind === 'geyser') {
              hit = (c.x - j.x) ** 2 + (c.z - j.z) ** 2 < (j.radius + c.r) ** 2;
            } else {
              const ax = c.x - j.x, az = c.z - j.z;
              const along = ax * j.dx + az * j.dz;
              if (along > -1 && along < j.len) {
                const px = ax - j.dx * along, pz = az - j.dz * along;
                hit = px * px + pz * pz < (j.radius + c.r) ** 2;
              }
            }
            if (hit) { race.onFlame(r, j); r.flameCd = 0.55; break; }
          }
        }
      }
    }
    if (dirty) for (const m of this.meshes) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  dispose() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      if (!m.material.userData.shared) m.material.dispose();
    }
    this.meshes = [];
    this.jets = [];
  }
}
