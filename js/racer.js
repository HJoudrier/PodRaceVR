// Concurrents : le joueur (physique libre) et les pilotes IA (pilotage dans le repère de la piste).
import * as THREE from 'three';
import { physicsFromStats } from './config.js';
import { DamageSystem } from './damage.js';
import { buildPod, animatePod, ENGINE_Z, COCKPIT_Z } from './podModel.js';
import { clamp, lerp, damp, wrapAngle } from './util.js';

const HOVER = 1.7;
export const FRONT_R = 2.7;
export const REAR_R = 1.3;

export class Racer {
  constructor({ name, pod, stats, isPlayer, settings, aiSkill = 1 }) {
    this.name = name;
    this.podDef = pod;
    this.stats = stats;
    this.isPlayer = isPlayer;
    this.phys = physicsFromStats(stats);
    this.damage = new DamageSystem(this.phys.armor, settings.breakdownRate);
    this.model = buildPod(pod.look, { player: isPlayer });
    this.aiSkill = aiSkill;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;            // vitesse vers l'avant (m/s)
    this.bank = 0;
    this.throttle = 0; this.brake = 0; this.steer = 0; this.boost = false;
    this.leverL = 0; this.leverR = 0;

    // repère piste
    this.hint = -1;
    this.trackS = 0;
    this.lateral = 0;
    this.distance = 0;         // distance totale parcourue le long de la piste (tours inclus)
    this.maxLapIndex = 0;
    this.lapStart = 0;
    this.lapTimes = [];
    this.bestLap = Infinity;
    this.finished = false;
    this.finishTime = Infinity;
    this.place = 0;

    this.offTrack = false;
    this.scraping = 0;
    this.wrongWayTime = 0;
    this.destroyed = false;
    this.respawnTimer = 0;
    this.hitCooldown = 0;
    this.groundY = 0;

    // IA
    this.ai = {
      lat: 0, latVel: 0, targetLat: 0, offset: (Math.random() - 0.5) * 8,
      repairTimer: 0, mistakeTimer: 3 + Math.random() * 5, mistake: 0,
    };
  }

  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  right(out = new THREE.Vector3()) { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }

  // centres des deux cercles de collision (avant : réacteurs, arrière : cockpit)
  collisionCircles() {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    return [
      { x: this.pos.x - fx * ENGINE_Z, z: this.pos.z - fz * ENGINE_Z, r: FRONT_R },
      { x: this.pos.x - fx * COCKPIT_Z, z: this.pos.z - fz * COCKPIT_Z, r: REAR_R },
    ];
  }

  placeOnTrack(track, s, lat) {
    const p = track.sample(s, lat);
    this.pos.set(p.x, p.y + HOVER, p.z);
    this.yaw = Math.atan2(-p.tx, -p.tz);
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.hint = p.index;
    this.trackS = track.wrapS(s);
    this.lateral = lat;
    this.ai.lat = lat;
    this.ai.latVel = 0;
    this.groundY = p.y;
  }

  // ------------------------------------------------------------------ joueur : physique libre
  updatePlayerPhysics(dt, input, track, ctx) {
    const f = this.damage.factors();
    const ph = this.phys;
    const repairing = input.repair;
    this.boost = !!input.boost && !repairing && f.canBoost && input.throttle > 0.2;
    const throttle = input.throttle * (repairing ? 0.7 : 1);
    this.throttle = throttle;
    this.brake = input.brake;
    this.leverL = input.leverL ?? throttle;
    this.leverR = input.leverR ?? throttle;

    const offF = this.offTrack ? 0.72 : 1;
    const vmax = ph.maxSpeed * f.topSpeed * (this.boost ? 1.13 : 1) * offF;
    const acc = ph.accel * f.thrust * (this.boost ? 1.3 : 1);

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let vF = this.vel.x * fx + this.vel.z * fz;
    let vR = this.vel.x * rx + this.vel.z * rz;

    let a = 0;
    if (throttle > 0 && vF >= -1) a += acc * throttle * Math.max(0, 1 - (vF / vmax) * (vF / vmax));
    if (vF > vmax) a -= (vF - vmax) * 1.2;
    a -= 0.06 * vF * (1 - throttle);              // traînée
    if (this.offTrack) a -= 0.25 * vF;            // sable
    if (input.brake > 0) {
      if (vF > 1) a -= ph.brake * input.brake;
      else if (vF > -18) a -= 14 * input.brake;   // petite marche arrière
    }
    if (vF < 0 && input.brake <= 0) a += Math.min(-vF * 2, 10) * 1;
    vF += a * dt;

    // direction
    const sp = Math.abs(vF);
    const steerIn = clamp(input.steer * f.steer + f.steerBias + f.imbalance * 0.3, -1.4, 1.4);
    let yawRate = ph.turnRate * steerIn * clamp(sp / 25, 0, 1) * (1 - 0.32 * clamp(sp / 230, 0, 1));
    if (input.brake > 0.1 && sp > 30) yawRate *= 1 + 0.35 * input.brake; // freinage aérodynamique
    if (vF < 0) yawRate = -yawRate;
    this.yaw -= yawRate * dt;
    this.steer = damp(this.steer, input.steer, 8, dt);

    // adhérence latérale (dérapage contrôlé)
    const grip = ph.grip * (this.offTrack ? 0.6 : 1) * (0.6 + 0.4 * f.steer);
    vR *= Math.exp(-grip * dt);

    const nfx = -Math.sin(this.yaw), nfz = -Math.cos(this.yaw);
    const nrx = Math.cos(this.yaw), nrz = -Math.sin(this.yaw);
    this.vel.set(nfx * vF + nrx * vR, 0, nfz * vF + nrz * vR);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.speed = vF;

    this.resolveTrack(dt, track, ctx);

    // inclinaison visuelle
    const targetBank = -yawRate * 0.42 - vR * 0.004;
    this.bank = damp(this.bank, clamp(targetBank, -0.6, 0.6), 6, dt);
  }

  // Projection sur la piste, hauteur, murs du canyon, limites du désert.
  resolveTrack(dt, track, ctx) {
    const q = track.query(this.pos.x, this.pos.z, this.hint, this._q || (this._q = {}));
    this.hint = q.index;
    const e = q.width / 2;
    this.scraping = Math.max(0, this.scraping - dt * 4);

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    // décalage latéral des points avant (réacteurs) et arrière (cockpit)
    const dF = -ENGINE_Z, dR = -COCKPIT_Z;
    const latF = q.lateral + (fx * q.rx + fz * q.rz) * dF;
    const latR = q.lateral + (fx * q.rx + fz * q.rz) * dR;
    const pts = [[latF, FRONT_R], [latR, REAR_R], [q.lateral, 2.2]];
    let hardLimit, wall;
    if (q.wallH > 5) { hardLimit = e + 0.4; wall = true; }
    else { hardLimit = e + 72; wall = false; }

    for (const [lat, r] of pts) {
      const over = Math.abs(lat) + r - hardLimit;
      if (over > 0) {
        const sgn = Math.sign(lat);
        this.pos.x -= q.rx * sgn * over;
        this.pos.z -= q.rz * sgn * over;
        const vn = (this.vel.x * q.rx + this.vel.z * q.rz) * sgn;
        if (vn > 0) {
          this.vel.x -= q.rx * sgn * vn * 1.35;
          this.vel.z -= q.rz * sgn * vn * 1.35;
          const loss = clamp(vn / 120, 0.02, 0.45);
          this.vel.multiplyScalar(1 - loss);
          // rotation vers la direction de la piste
          const trackYaw = Math.atan2(-q.tx, -q.tz);
          const dy = wrapAngle(trackYaw - this.yaw);
          const travelling = Math.abs(dy) < Math.PI / 2 ? trackYaw : trackYaw + Math.PI;
          this.yaw += wrapAngle(travelling - this.yaw) * clamp(vn / 80, 0.05, 0.4);
          if (this.hitCooldown <= 0 && vn > 6) {
            const dmg = vn * (wall ? 0.55 : 0.35);
            ctx.onImpact(this, dmg, sgn, wall ? 'wall' : 'rocks', lat);
            this.hitCooldown = 0.25;
          }
        }
        // frottement continu contre la paroi
        this.scraping = 1;
        const spd = Math.abs(this.speed);
        if (spd > 20) {
          this.damage.applyHit(spd * 0.012 * dt, sgn, 'wall', ctx.time);
          ctx.onScrape(this, sgn, lat);
        }
      }
    }

    // sortie de piste (sable)
    this.offTrack = !wall && Math.abs(q.lateral) > e + 3;

    // obstacles (piliers d'arches, rochers)
    for (const ob of track.obstacles) {
      let ds = Math.abs(ob.s - q.s);
      ds = Math.min(ds, track.length - ds);
      if (ds > 30) continue;
      for (const c of this.collisionCircles()) {
        const dx = c.x - ob.x, dz = c.z - ob.z;
        const d = Math.hypot(dx, dz);
        const minD = c.r + ob.r;
        if (d < minD && d > 1e-3) {
          const nx = dx / d, nz = dz / d;
          this.pos.x += nx * (minD - d);
          this.pos.z += nz * (minD - d);
          const vn = -(this.vel.x * nx + this.vel.z * nz);
          if (vn > 0) {
            this.vel.x += nx * vn * 1.4;
            this.vel.z += nz * vn * 1.4;
            this.vel.multiplyScalar(0.55);
            if (this.hitCooldown <= 0) {
              const side = Math.sign((ob.x - this.pos.x) * Math.cos(this.yaw) + (ob.z - this.pos.z) * -Math.sin(this.yaw)) || 1;
              ctx.onImpact(this, vn * 0.42 + 5, side, 'obstacle', null, ob);
              this.hitCooldown = 0.4;
            }
          }
        }
      }
    }

    // hauteur : piste, bas-côtés, sable
    let gy = q.y;
    const al = Math.abs(q.lateral);
    if (al > e) gy -= Math.min(1.2, (al - e) * 0.11);
    this.groundY = gy;
    const target = gy + HOVER + Math.sin(ctx.time * 2.1 + this.name.length) * 0.08;
    this.pos.y = damp(this.pos.y, target, 10, dt);

    // progression le long de la piste
    this.advanceDistance(q.s, track);
    this.lateral = q.lateral;
    // sens interdit
    const dot = fx * q.tx + fz * q.tz;
    if (dot < -0.35 && this.speed > 8) this.wrongWayTime += dt; else this.wrongWayTime = Math.max(0, this.wrongWayTime - dt * 2);
    this.hitCooldown -= dt;
  }

  advanceDistance(s, track) {
    let ds = s - this.trackS;
    const L = track.length;
    if (ds < -L / 2) ds += L;
    if (ds > L / 2) ds -= L;
    this.distance += ds;
    this.trackS = s;
  }

  // Planification commune (IA et pilote automatique) : vitesse cible selon les virages à venir,
  // trajectoire latérale (corde des virages, évitement des obstacles et des autres pods).
  planLine(track, race, s, lat, skill, repairing) {
    const ai = this.ai;
    const ph = this.phys;
    const f = this.damage.factors();
    const L = track.length;
    let vmax = ph.maxSpeed * f.topSpeed * skill;
    if (repairing) vmax *= 0.72;
    const aLat = ph.latAccel * skill * (0.6 + 0.4 * f.steer);
    const brake = ph.brake * 0.85;
    let vt = vmax;
    for (const d of [8, 20, 35, 55, 80, 110, 145, 190, 240, 300, 370]) {
      const k = Math.abs(track.curvAt(s + d)) + 1e-5;
      const vc = Math.sqrt(aLat / k);
      const allowed = Math.sqrt(vc * vc + 2 * brake * d);
      if (allowed < vt) vt = allowed;
    }
    const here = track.sample(s, 0, this._plan || (this._plan = {}));
    const e = here.width / 2;
    const lim = e - FRONT_R - 0.8;
    const kAhead = track.curvAt(s + 60);
    let target = -Math.sign(kAhead) * clamp(Math.abs(kAhead) * 260, 0, 1) * (e - 6) + ai.offset + (ai.mistake || 0);

    // autres concurrents : dépasser par le côté le plus libre, sinon ne pas leur rentrer dedans
    if (race) {
      for (const o of race.racers) {
        if (o === this || o.destroyed) continue;
        let ds = (o.distance - this.distance) % L;
        if (ds > L / 2) ds -= L;
        if (ds < -L / 2) ds += L;
        if (ds <= 0 || ds > 130) continue;
        const olat = o.lateral;
        if (ds < 50 && Math.abs(olat - target) < 6.5) {
          const pl = olat - 7.5, pr = olat + 7.5;
          const okL = pl > -lim, okR = pr < lim;
          if (okL && (!okR || Math.abs(lat - pl) < Math.abs(lat - pr))) target = pl;
          else if (okR) target = pr;
        }
        // freinage anticipé derrière un pod plus lent (on garde ~17 m entre les centres)
        if (Math.abs(olat - lat) < 6.5) {
          const os = Math.max(0, o.speed);
          vt = Math.min(vt, Math.sqrt(os * os + 2 * brake * Math.max(0, ds - 17)));
        }
      }
    }
    // piliers d'arches et rochers (prioritaires sur tout le reste) : on choisit la trajectoire libre
    // la plus proche de la trajectoire souhaitée, en tenant compte de tous les obstacles à venir
    const obsIn = this._obsIn || (this._obsIn = []);
    obsIn.length = 0;
    for (const ob of track.obstacles) {
      let ds = ob.s - s;
      if (ds < -L / 2) ds += L;
      if (ds > L / 2) ds -= L;
      if (ds < -4 || ds > 230) continue;
      if (Math.abs(ob.lat) > e + ob.r) continue;
      obsIn.push({ ob, ds, clear: ob.r + FRONT_R + 2.5 });
    }
    if (obsIn.length) {
      // on ne combine que les obstacles proches les uns des autres (les suivants seront traités ensuite)
      obsIn.sort((a, b) => a.ds - b.ds);
      const horizon = obsIn[0].ds + 90;
      while (obsIn.length && obsIn[obsIn.length - 1].ds > horizon) obsIn.pop();
      const ok = (c) => c >= -lim && c <= lim && obsIn.every((o) => Math.abs(c - o.ob.lat) >= o.clear);
      if (!ok(target)) {
        let best = null, bc = Infinity;
        const tryC = (c) => {
          if (!ok(c)) return;
          const cost = Math.abs(c - target) + 0.6 * Math.abs(c - lat);
          if (cost < bc) { bc = cost; best = c; }
        };
        for (const o of obsIn) { tryC(o.ob.lat - o.clear); tryC(o.ob.lat + o.clear); }
        tryC(-lim); tryC(lim); tryC(0);
        if (best === null) {
          // aucune ligne totalement libre : on évite au moins l'obstacle le plus proche
          const o = obsIn[0];
          const left = o.ob.lat - o.clear, right = o.ob.lat + o.clear;
          best = left > -lim && (right > lim || Math.abs(lat - left) < Math.abs(lat - right)) ? left : right;
        }
        target = best;
      }
    }
    return { vt, vmax, targetLat: clamp(target, -lim, lim), lim, here, brake };
  }

  // Pilote automatique (après l'arrivée, et pour les tests) : vise un point de la trajectoire planifiée.
  autopilotInput(track, cruise = 70, race = null) {
    const q = this._q || track.query(this.pos.x, this.pos.z, this.hint);
    const sp = Math.abs(this.speed);
    const plan = this.planLine(track, race, q.s, q.lateral, 1, false);
    const vt = Math.min(plan.vt, cruise);
    const look = 22 + sp * 0.3;
    const tgt = track.sample(q.s + look, plan.targetLat);
    const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
    const wantYaw = Math.atan2(-dx, -dz);
    const dy = wrapAngle(wantYaw - this.yaw);
    return {
      throttle: sp < vt ? 1 : 0,
      brake: sp > vt + 6 ? clamp((sp - vt) / 25, 0.2, 1) : 0,
      steer: clamp(-dy * 3.2, -1, 1),
      boost: false, repair: this.damage.anyProblem(),
    };
  }

  // ------------------------------------------------------------------ IA : pilotage dans le repère piste
  updateAI(dt, track, race) {
    const ai = this.ai;
    const ph = this.phys;
    const f = this.damage.factors();
    const diff = race.difficulty;
    const L = track.length;
    const s = track.wrapS(this.distance);

    // réparation : l'IA répare quand un système est mal en point
    const dmg = this.damage;
    if (ai.repairTimer <= 0 && (dmg.fire.engineL || dmg.fire.engineR || dmg.jam !== 0 || dmg.health.engineL < 50 || dmg.health.engineR < 50 || dmg.health.steering < 45)) {
      ai.repairTimer = 1.5 + Math.random() * 3;
    }
    const repairing = ai.repairTimer > 0;
    if (repairing) ai.repairTimer -= dt;
    dmg.update(dt, repairing, true, false);

    // erreurs de pilotage occasionnelles
    ai.mistakeTimer -= dt;
    const skill = this.aiSkill * diff.ai;
    if (ai.mistakeTimer <= 0) {
      ai.mistake = (Math.random() - 0.5) * 12 * (1.15 - skill * 0.6);
      ai.mistakeTimer = 4 + Math.random() * 8;
      ai.mistakeEnd = race.time + 0.9;
    }
    if (race.time > (ai.mistakeEnd || 0)) ai.mistake = 0;

    // élastique léger pour garder la course serrée
    const gap = this.distance - race.player.distance;
    const rubber = 1 - clamp(gap / 1500, -1, 1) * 0.06 * diff.rubber / 0.35;
    const plan = this.planLine(track, race, s, ai.lat, skill * rubber, repairing);
    const vt = plan.vt, vmax = plan.vmax, brake = plan.brake, here = plan.here, lim = plan.lim;
    const acc = ph.accel * f.thrust * skill;
    if (this.speed < vt) this.speed += acc * Math.max(0.15, 1 - (this.speed / vmax) ** 2) * dt;
    else this.speed = Math.max(vt, this.speed - brake * dt);
    if (this.speed > vmax) this.speed = damp(this.speed, vmax, 1.5, dt);
    this.throttle = this.speed < vt ? 1 : 0.2;
    this.leverL = this.leverR = this.throttle;
    this.boost = false;
    ai.targetLat = plan.targetLat;

    const latAccMax = 48 + 30 * (ph.turnRate - 0.9);
    let la = (ai.targetLat - ai.lat) * 6 - ai.latVel * 3.9;
    la = clamp(la, -latAccMax, latAccMax);
    // direction bloquée : dérive
    la += dmg.jam * 10;
    ai.latVel += la * dt;
    ai.lat += ai.latVel * dt;
    if (Math.abs(ai.lat) > lim + 0.6) {
      const sgn = Math.sign(ai.lat);
      const vn = Math.abs(ai.latVel);
      ai.lat = sgn * (lim + 0.6);
      if (ai.latVel * sgn > 0) ai.latVel = -ai.latVel * 0.3;
      if (vn > 4 && this.hitCooldown <= 0 && here.wallH > 5) {
        race.onImpact(this, vn * 0.6, sgn, 'wall', ai.lat);
        this.speed *= 0.92;
        this.hitCooldown = 0.4;
      }
    }

    this.distance += this.speed * dt;
    // l'IA aussi peut percuter un pilier ou un rocher si elle est déportée
    for (const ob of track.obstacles) {
      let ds = ob.s - track.wrapS(this.distance - ENGINE_Z);
      if (ds < -L / 2) ds += L;
      if (ds > L / 2) ds -= L;
      if (Math.abs(ds) > ob.r + 1) continue;
      const dl = ai.lat - ob.lat;
      const minD = ob.r + FRONT_R * 0.9;
      if (Math.abs(dl) < minD) {
        const sgn = Math.sign(dl) || 1;
        ai.lat = ob.lat + sgn * minD;
        ai.latVel = sgn * 6;
        if (this.hitCooldown <= 0) {
          race.onImpact(this, this.speed * 0.3 + 5, -sgn, 'obstacle', null, ob);
          this.speed *= 0.45;
          this.hitCooldown = 0.6;
        }
      }
    }
    const p = track.sample(this.distance, ai.lat, here);
    this.groundY = p.y;
    this.pos.set(p.x, p.y + HOVER + Math.sin(race.time * 2.3 + this.name.length) * 0.08, p.z);
    const heading = Math.atan2(-p.tx, -p.tz);
    const slip = Math.atan2(ai.latVel, Math.max(10, this.speed));
    this.yaw = heading - slip;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    this.vel.set(fx * this.speed, 0, fz * this.speed);
    this.trackS = track.wrapS(this.distance);
    this.lateral = ai.lat;
    this.hint = p.index;
    const curv = track.curvAt(this.distance);
    this.steer = clamp(-curv * 150 - ai.latVel * 0.05, -1, 1);
    this.bank = damp(this.bank, clamp(curv * this.speed * 0.9 - ai.latVel * 0.02, -0.6, 0.6), 5, dt);
    this.hitCooldown -= dt;
  }

  // ------------------------------------------------------------------ visuel
  syncModel(time, dt, opts = {}) {
    const m = this.model;
    m.root.visible = !this.destroyed;
    m.root.position.copy(this.pos);
    m.root.rotation.set(0, this.yaw, 0);
    const d = this.damage;
    animatePod(m, {
      throttle: this.throttle, steer: this.steer, boost: this.boost, bank: this.bank,
      engineHealth: [d.health.engineL / 100, d.health.engineR / 100],
      fire: [d.fire.engineL, d.fire.engineR],
      destroyed: this.destroyed,
      levelCockpit: opts.levelCockpit,
      leverL: this.leverL, leverR: this.leverR,
      binderFlicker: d.health.engineL < 30 || d.health.engineR < 30,
      speedFactor: Math.min(1.2, Math.abs(this.speed) / 220),
    }, time, dt);
    m.shadow.visible = !this.destroyed;
    m.shadow.position.set(this.pos.x, this.groundY + 0.12, this.pos.z);
    m.shadow.rotation.y = this.yaw;
    const sh = clamp(1 - (this.pos.y - this.groundY - HOVER) * 0.1, 0.3, 1);
    m.shadow.material.opacity = 0.75 * sh;
  }
}
