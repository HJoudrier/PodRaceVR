// Modèles procéduraux de podracers : deux réacteurs reliés par un arc d'énergie, câbles, cockpit ouvert.
import * as THREE from 'three';
import { toon, outlineMaterial, smoothNormalsClone, mergeColored, paint, radialTexture } from './toon.js';

export const ENGINE_Z = -7.2;
export const COCKPIT_Z = 3.6;
// position de l'œil du pilote (repère du pod)
export const EYE = new THREE.Vector3(0, 0.82, COCKPIT_Z + 0.55);

let shadowTex = null;
const darkInterior = 0x1c140f;

function engineGeometry(look) {
  const L = look.len, R = look.rad;
  const parts = [];
  const rears = [];
  const lathe = (R2, yOff) => {
    const taper = look.engine === 'tapered';
    const prof = taper
      ? [[0.42, -0.5], [0.6, -0.47], [0.8, -0.38], [0.93, -0.15], [1.0, 0.12], [1.0, 0.3], [1.07, 0.44], [0.98, 0.5], [0.8, 0.47]]
      : [[0.55, -0.5], [0.78, -0.46], [0.95, -0.36], [1.0, -0.1], [1.0, 0.25], [0.93, 0.4], [1.08, 0.46], [1.0, 0.5], [0.82, 0.47]];
    const pts = prof.map(([r, y]) => new THREE.Vector2(r * R2, y * L));
    const g = new THREE.LatheGeometry(pts, 14);
    g.rotateX(-Math.PI / 2);
    g.translate(0, yOff, 0);
    parts.push(paint(g, look.c1));
    for (const zf of [-0.08, 0.18]) {
      const b = new THREE.CylinderGeometry(R2 * 1.035, R2 * 1.035, L * 0.07, 14, 1, true);
      b.rotateX(Math.PI / 2);
      b.translate(0, yOff, zf * L);
      parts.push(paint(b, look.c2));
    }
    const disc = new THREE.CircleGeometry(R2 * 0.84, 14);
    disc.rotateY(Math.PI);
    disc.translate(0, yOff, -0.465 * L);
    parts.push(paint(disc, darkInterior));
    const ring = new THREE.TorusGeometry(R2 * (taper ? 0.42 : 0.55), R2 * 0.09, 6, 14);
    ring.translate(0, yOff, 0.5 * L);
    parts.push(paint(ring, look.c3));
    rears.push(new THREE.Vector3(0, yOff, 0.5 * L + 0.02));
    return R2;
  };

  if (look.engine === 'box') {
    const body = new THREE.BoxGeometry(R * 1.8, R * 1.5, L * 0.78);
    body.translate(0, 0, 0.06 * L);
    parts.push(paint(body, look.c1));
    const stripe = new THREE.BoxGeometry(R * 1.84, R * 0.3, L * 0.6);
    stripe.translate(0, R * 0.5, 0.08 * L);
    parts.push(paint(stripe, look.c2));
    const intake = new THREE.CylinderGeometry(R * 0.98, R * 0.9, L * 0.2, 14);
    intake.rotateX(Math.PI / 2);
    intake.translate(0, 0, -0.4 * L);
    parts.push(paint(intake, look.c3));
    const disc = new THREE.CircleGeometry(R * 0.8, 14);
    disc.rotateY(Math.PI);
    disc.translate(0, 0, -0.505 * L);
    parts.push(paint(disc, darkInterior));
    const noz = new THREE.CylinderGeometry(R * 0.75, R * 0.6, L * 0.12, 12);
    noz.rotateX(Math.PI / 2);
    noz.translate(0, 0, 0.47 * L);
    parts.push(paint(noz, look.c3));
    rears.push(new THREE.Vector3(0, 0, 0.53 * L + 0.02));
  } else if (look.engine === 'twin') {
    lathe(R, R * 0.72);
    lathe(R, -R * 0.72);
    const plate = new THREE.BoxGeometry(R * 0.5, R * 1.5, L * 0.6);
    paint(plate, look.c3);
    parts.push(plate);
  } else {
    lathe(R, 0);
  }

  // ailerons arrière
  for (let f = 0; f < look.fins; f++) {
    const a = (f / look.fins) * Math.PI * 2 + Math.PI / 2;
    const fin = new THREE.BoxGeometry(0.07, R * 0.85, L * 0.24);
    fin.translate(0, R * (look.engine === 'twin' ? 1.6 : 1.15), 0.3 * L);
    fin.rotateZ(a - Math.PI / 2);
    parts.push(paint(fin, look.c2));
  }
  if (look.intake === 'split') {
    for (const rz of [0, Math.PI / 2]) {
      const v = new THREE.BoxGeometry(R * 1.7, 0.07, 0.5);
      v.rotateZ(rz);
      v.translate(0, 0, -0.45 * L);
      parts.push(paint(v, look.c3));
    }
  } else if (look.intake === 'scoop') {
    const sc = new THREE.BoxGeometry(R * 0.7, R * 0.4, L * 0.35);
    sc.translate(0, R * 1.0, -0.2 * L);
    parts.push(paint(sc, look.c2));
  }
  return { geo: mergeColored(parts), rears };
}

function cockpitGeometry(look) {
  const parts = [];
  const wide = look.cockpit === 'tub' ? 1.15 : 1.0;
  const W = 1.7 * wide;
  const floor = new THREE.BoxGeometry(W, 0.28, 2.3);
  floor.translate(0, -0.32, 0.5);
  parts.push(paint(floor, look.c1));
  for (const sx of [-1, 1]) {
    const wall = new THREE.BoxGeometry(0.18, 0.62, 2.3);
    wall.translate(sx * (W / 2 - 0.09), 0.1, 0.5);
    parts.push(paint(wall, look.c1));
    const trim = new THREE.BoxGeometry(0.22, 0.08, 2.3);
    trim.translate(sx * (W / 2 - 0.09), 0.43, 0.5);
    parts.push(paint(trim, look.c2));
    // petites prises d'air latérales
    const pod = new THREE.CylinderGeometry(0.22, 0.28, 1.3, 8);
    pod.rotateX(Math.PI / 2);
    pod.translate(sx * (W / 2 + 0.2), -0.1, 0.9);
    parts.push(paint(pod, look.c3));
  }
  const back = new THREE.BoxGeometry(W, 1.1, 0.22);
  back.translate(0, 0.2, 1.62);
  parts.push(paint(back, look.c1));
  const seat = new THREE.BoxGeometry(0.9, 0.9, 0.18);
  seat.translate(0, 0.25, 1.38);
  parts.push(paint(seat, look.c3));
  // arceau de sécurité derrière le pilote
  const hoop = new THREE.TorusGeometry(0.62 * wide, 0.06, 6, 14, Math.PI);
  hoop.translate(0, 0.45, 1.72);
  parts.push(paint(hoop, look.c3));
  // nez
  let nose;
  if (look.cockpit === 'wedge') {
    nose = new THREE.BoxGeometry(W, 0.6, 2.6, 1, 1, 1);
    const p = nose.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      if (z < 0) { p.setX(i, p.getX(i) * 0.35); if (p.getY(i) > 0) p.setY(i, p.getY(i) - 0.45); }
    }
    nose.computeVertexNormals();
    nose.translate(0, -0.05, -1.95);
  } else {
    nose = new THREE.CylinderGeometry(0.18, W / 2, 2.6, 10);
    nose.rotateX(-Math.PI / 2);
    nose.scale(1, 0.55, 1);
    nose.translate(0, -0.05, -1.95);
  }
  parts.push(paint(nose, look.c1));
  const stripe = new THREE.BoxGeometry(0.25, 0.05, 2.4);
  stripe.translate(0, look.cockpit === 'wedge' ? -0.05 : 0.27, -1.75);
  parts.push(paint(stripe, look.c2));
  // tableau de bord
  const dash = new THREE.BoxGeometry(W - 0.2, 0.42, 0.3);
  dash.rotateX(-0.45);
  dash.translate(0, 0.28, -0.38);
  parts.push(paint(dash, look.c3));
  return mergeColored(parts);
}

function pilotGeometry(look) {
  const parts = [];
  const torso = new THREE.BoxGeometry(0.62, 0.65, 0.38);
  torso.translate(0, 0.3, 1.05);
  parts.push(paint(torso, 0x8a6a4a));
  const head = new THREE.SphereGeometry(0.24, 12, 8);
  head.translate(0, 0.84, 0.95);
  parts.push(paint(head, look.c2));
  const goggles = new THREE.BoxGeometry(0.36, 0.1, 0.1);
  goggles.translate(0, 0.86, 0.73);
  parts.push(paint(goggles, 0x222a33));
  for (const sx of [-1, 1]) {
    const arm = new THREE.CylinderGeometry(0.07, 0.07, 0.75, 6);
    arm.rotateX(Math.PI / 2.6);
    arm.translate(sx * 0.3, 0.4, 0.5);
    parts.push(paint(arm, 0x8a6a4a));
  }
  return mergeColored(parts);
}

function shadowTexture() {
  if (!shadowTex) shadowTex = radialTexture(128, 'rgba(40,20,5,0.75)', 'rgba(40,20,5,0)');
  return shadowTex;
}

export function buildPod(look, { player = false } = {}) {
  const root = new THREE.Group();
  root.name = 'pod';
  const mat = toon({ vertexColors: true });

  // --- réacteurs
  const enginePair = new THREE.Group();
  enginePair.position.set(0, 0.15, ENGINE_Z);
  root.add(enginePair);
  const { geo: eGeo, rears } = engineGeometry(look);
  const eOutline = smoothNormalsClone(eGeo);
  const flameMat = new THREE.MeshBasicMaterial({ color: look.flame, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameGeo = new THREE.ConeGeometry(look.rad * 0.42, 1, 10, 1, true);
  flameGeo.translate(0, 0.5, 0);
  flameGeo.rotateX(Math.PI / 2);
  const glowGeo = new THREE.CircleGeometry(look.rad * 0.48, 14);
  const engines = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set((sx * look.spacing) / 2, 0, 0);
    g.add(new THREE.Mesh(eGeo, mat));
    g.add(new THREE.Mesh(eOutline, outlineMaterial(0.045)));
    const flames = [];
    for (const r of rears) {
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(r);
      g.add(glow);
      const fl = new THREE.Mesh(flameGeo, flameMat);
      fl.position.copy(r);
      g.add(fl);
      flames.push(fl);
    }
    enginePair.add(g);
    engines.push({ group: g, rears, flames, side: sx, phase: Math.random() * 10 });
  }

  // --- arc d'énergie entre les réacteurs (ruban recalculé à chaque image)
  const BSEG = 12;
  const binderGeo = new THREE.BufferGeometry();
  binderGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((BSEG + 1) * 4 * 3), 3));
  const bIdx = [];
  for (let k = 0; k < BSEG; k++) {
    const a = k * 4;
    bIdx.push(a, a + 4, a + 1, a + 1, a + 4, a + 5); // ruban vertical
    bIdx.push(a + 2, a + 6, a + 3, a + 3, a + 6, a + 7); // ruban horizontal
  }
  binderGeo.setIndex(bIdx);
  const binderMat = new THREE.MeshBasicMaterial({ color: look.binder, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const binder = new THREE.Mesh(binderGeo, binderMat);
  binder.frustumCulled = false;
  root.add(binder);

  // --- câbles
  const cableGeo = new THREE.BufferGeometry();
  cableGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
  const cables = new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: 0x2a2018 }));
  cables.frustumCulled = false;
  root.add(cables);

  // --- cockpit
  const cockpit = new THREE.Group();
  cockpit.position.set(0, 0, COCKPIT_Z);
  root.add(cockpit);
  const cGeo = cockpitGeometry(look);
  cockpit.add(new THREE.Mesh(cGeo, mat));
  const cOut = new THREE.Mesh(smoothNormalsClone(cGeo), outlineMaterial(0.035));
  cockpit.add(cOut);
  const pGeo = pilotGeometry(look);
  const pilot = new THREE.Group();
  pilot.add(new THREE.Mesh(pGeo, mat));
  pilot.add(new THREE.Mesh(smoothNormalsClone(pGeo), outlineMaterial(0.025)));
  cockpit.add(pilot);

  // leviers de poussée (animés)
  const levers = [];
  const leverGeo = mergeColored([
    paint(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 6).translate(0, 0.15, 0), 0x777777),
    paint(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8).translate(0, 0.32, 0), look.c2),
  ]);
  for (const sx of [-1, 1]) {
    const lv = new THREE.Mesh(leverGeo, mat);
    lv.position.set(sx * 0.62, 0.05, 0.12);
    cockpit.add(lv);
    levers.push(lv);
  }
  const dashAnchor = new THREE.Object3D();
  dashAnchor.position.set(0, 0.47, -0.22);
  dashAnchor.rotation.x = -0.45;
  cockpit.add(dashAnchor);

  // --- ombre portée
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(6.5, 17).rotateX(-Math.PI / 2).translate(0, 0, -2.5),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
  );
  shadow.renderOrder = 1;

  return {
    root, enginePair, engines, binder, binderSeg: BSEG, cables, cockpit, pilot, levers, dashAnchor, shadow,
    flameMat, look, player,
    flameBase: new THREE.Color(look.flame), flameBoost: new THREE.Color(0x9fd8ff),
  };
}

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

// Animation : roulis, oscillations, flammes, arc d'énergie, câbles.
export function animatePod(pod, st, time, dt) {
  const look = pod.look;
  pod.enginePair.rotation.z = st.bank;
  pod.enginePair.position.y = 0.15 + Math.sin(time * 2.3 + look.len) * 0.07;
  pod.cockpit.rotation.z = st.bank * (st.levelCockpit ? 0 : 0.35);
  // vibrations du cockpit proportionnelles à la vitesse (la caméra VR, elle, reste stable)
  const vib = (st.speedFactor || 0) * 0.007 + (st.boost ? 0.004 : 0);
  pod.cockpit.position.y = Math.sin(time * 1.9 + 1.3) * 0.05 + (Math.random() - 0.5) * vib;
  pod.cockpit.position.x = (Math.random() - 0.5) * vib * 0.6;
  for (let k = 0; k < 2; k++) {
    const e = pod.engines[k];
    const h = st.engineHealth ? st.engineHealth[k] : 1;
    const shake = (1 - h) * 0.05 + (st.fire && st.fire[k] ? 0.04 : 0) + (st.speedFactor || 0) * 0.025;
    e.group.position.y = Math.sin(time * 3.1 + e.phase) * 0.06 + (Math.random() - 0.5) * shake;
    e.group.rotation.x = Math.sin(time * 2.2 + e.phase) * 0.012;
    e.group.rotation.y = -st.steer * 0.04 * e.side * 0;
    const thr = st.destroyed ? 0 : st.throttle;
    const len = (0.5 + thr * 2.4 + (st.boost ? 2.8 : 0)) * (0.82 + Math.random() * 0.3) * (0.35 + 0.65 * h);
    for (const fl of e.flames) {
      fl.scale.set(st.boost ? 1.25 : 1, st.boost ? 1.25 : 1, Math.max(0.05, len));
      fl.visible = !st.destroyed;
    }
  }
  pod.flameMat.color.copy(pod.flameBase).lerp(pod.flameBoost, st.boost ? 0.75 : 0);
  if (pod.levers.length) {
    pod.levers[0].rotation.x = -0.15 - (st.leverL ?? st.throttle) * 0.6;
    pod.levers[1].rotation.x = -0.15 - (st.leverR ?? st.throttle) * 0.6;
  }

  pod.enginePair.updateMatrix();
  pod.engines[0].group.updateMatrix();
  pod.engines[1].group.updateMatrix();

  // arc d'énergie
  const sp = look.spacing / 2 - look.rad * 0.9;
  const bz = ENGINE_Z - look.len * 0.18;
  const bp = pod.binder.geometry.attributes.position;
  const on = !st.destroyed && (st.engineHealth ? Math.min(st.engineHealth[0], st.engineHealth[1]) > 0.02 : true);
  pod.binder.visible = on && !(st.binderFlicker && Math.random() < 0.3);
  if (pod.binder.visible) {
    const Nn = pod.binderSeg;
    const amp = 0.12 + (st.boost ? 0.12 : 0);
    for (let k = 0; k <= Nn; k++) {
      const u = k / Nn;
      const env = Math.sin(u * Math.PI);
      const x = -sp + u * 2 * sp;
      const jy = (Math.random() - 0.5) * amp * 2 * env;
      const jz = (Math.random() - 0.5) * amp * 2 * env;
      _v.set(x, jy + 0.0, bz + jz);
      // suit le roulis de la paire de réacteurs
      _v.z -= ENGINE_Z;
      _v.applyMatrix4(pod.enginePair.matrix);
      const w = 0.07 + 0.05 * env;
      const o = k * 4 * 3;
      bp.array[o] = _v.x; bp.array[o + 1] = _v.y + w; bp.array[o + 2] = _v.z;
      bp.array[o + 3] = _v.x; bp.array[o + 4] = _v.y - w; bp.array[o + 5] = _v.z;
      bp.array[o + 6] = _v.x; bp.array[o + 7] = _v.y; bp.array[o + 8] = _v.z + w;
      bp.array[o + 9] = _v.x; bp.array[o + 10] = _v.y; bp.array[o + 11] = _v.z - w;
    }
    bp.needsUpdate = true;
  }

  // câbles : de l'arrière de chaque réacteur jusqu'au nez du cockpit
  const cp = pod.cables.geometry.attributes.position;
  let o = 0;
  for (let k = 0; k < 2; k++) {
    const e = pod.engines[k];
    _m.multiplyMatrices(pod.enginePair.matrix, e.group.matrix);
    for (const dy of [0.18, -0.22]) {
      _v.set(0, dy, look.len * 0.42).applyMatrix4(_m);
      cp.array[o++] = _v.x; cp.array[o++] = _v.y; cp.array[o++] = _v.z;
      cp.array[o++] = e.side * 0.3; cp.array[o++] = dy * 0.5; cp.array[o++] = COCKPIT_Z - 3.1;
    }
  }
  cp.needsUpdate = true;
}

// Position monde de l'arrière d'un réacteur (pour fumée / feu).
export function engineRearWorld(pod, k, out) {
  const e = pod.engines[k];
  out.copy(e.rears[0]);
  return e.group.localToWorld(out);
}
