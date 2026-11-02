// Déroulement d'une course : grille, compte à rebours, tours, collisions, dégâts, classement.
import * as THREE from 'three';
import { PODS, AI_PILOTS, STAT_KEYS, finalStats, DIFFICULTY, BREAKDOWNS, RAIDERS } from './config.js';
import { Racer } from './racer.js';
import { engineRearWorld } from './podModel.js';
import { SYSTEM_LABELS } from './damage.js';
import { clamp, shuffle, formatTime } from './util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Race {
  constructor({ scene, track, env, effects, audio, raiders, hazards, settings, hud, cockpitHud }) {
    this.scene = scene;
    this.track = track;
    this.env = env;
    this.effects = effects;
    this.audio = audio;
    this.raiders = raiders;
    this.hazards = hazards || null;
    this.settings = settings;
    this.hud = hud;
    this.cockpitHud = cockpitHud;
    this.laps = settings.laps;
    this.difficulty = DIFFICULTY[settings.difficulty] || DIFFICULTY.normal;
    this.breakdown = BREAKDOWNS[settings.breakdowns] || BREAKDOWNS.normale;
    this.raiderCfg = RAIDERS[settings.raiders] || RAIDERS.normaux;
    this.racers = [];
    this.time = 0;
    this.state = 'countdown';
    this.countdown = 4.2;
    this.lastBeep = 99;
    this.finishOrder = [];
    this.archIndex = 0;
    this.endTimer = 0;
    this.haptic = null;   // vibration du téléphone (branchée par main.js)
    this.fxScale = 1;     // densité des particules selon la qualité graphique
    this.build();
  }

  build() {
    const s = this.settings;
    const playerPod = PODS.find((p) => p.id === s.podId) || PODS[0];
    const player = new Racer({
      name: 'Vous', pod: playerPod, stats: finalStats(playerPod.base, s.tuning), isPlayer: true,
      settings: { breakdownRate: this.breakdown.rate },
    });
    this.player = player;
    const others = shuffle(PODS.filter((p) => p.id !== playerPod.id));
    const names = shuffle(AI_PILOTS);
    const n = clamp(s.opponents, 1, 7);
    const ais = [];
    for (let i = 0; i < n; i++) {
      const pod = others[i % others.length];
      // l'IA répartit aussi ses points de réglage
      const tuning = {};
      let pts = 3;
      for (const k of STAT_KEYS) tuning[k] = 0;
      while (pts > 0) { const k = STAT_KEYS[Math.floor(Math.random() * 5)]; if (tuning[k] < 2) { tuning[k]++; pts--; } }
      ais.push(new Racer({
        name: names[i], pod, stats: finalStats(pod.base, tuning), isPlayer: false,
        settings: { breakdownRate: this.breakdown.rate * 0.7 },
        aiSkill: 0.95 + Math.random() * 0.08,
      }));
    }
    // grille : le joueur part au milieu du peloton
    const grid = ais.slice();
    grid.splice(Math.floor(grid.length / 2) + (grid.length % 2), 0, player);
    this.racers = grid;
    const L = this.track.length;
    // grille en quinconce sur 3 colonnes : chaque pod a la voie libre devant lui
    grid.forEach((r, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const lat = [-13, 0, 13][(col + row) % 3];
      const s0 = L - 20 - row * 30 - col * 7;
      r.placeOnTrack(this.track, s0, lat);
      r.distance = s0 - L; // négatif : la ligne n'est pas encore franchie
      r.trackS = this.track.wrapS(s0);
      r.lapStart = 0;
      this.scene.add(r.model.root);
      this.scene.add(r.model.shadow);
    });
    this.raiders.configure(this.raiderCfg, this.difficulty);
    this.raiders.reset();
    this.updatePlaces();
  }

  dispose() {
    for (const r of this.racers) {
      this.scene.remove(r.model.root);
      this.scene.remove(r.model.shadow);
      r.model.root.traverse((o) => { if (o.geometry && o.geometry !== undefined) o.geometry.dispose?.(); });
    }
    this.racers = [];
  }

  displayLap(r) {
    return clamp(Math.floor(r.distance / this.track.length) + 1, 1, this.laps);
  }

  // ------------------------------------------------------------------ événements de dégâts
  onImpact(racer, amount, side, kind, lat, obstacle) {
    const sys = racer.damage.applyHit(amount, side, kind, this.time);
    const fwd = racer.forward(_v);
    _v2.copy(racer.pos);
    if (obstacle) _v2.set(obstacle.x, racer.pos.y, obstacle.z).lerp(racer.pos, 0.5);
    else { const r = racer.right(new THREE.Vector3()); _v2.addScaledVector(r, side * 2.5).addScaledVector(fwd, -4); }
    this.effects.sparks(_v2, null, Math.min(40, 8 + amount), 25);
    if (racer.isPlayer) {
      if (this.haptic) this.haptic(Math.round(clamp(15 + amount * 1.5, 15, 90)));
      this.audio.hit(clamp(amount / 40, 0.1, 1));
      this.shake = Math.max(this.shake || 0, clamp(amount / 30, 0.2, 1));
      if (amount > 12) this.flashDamage = 0.5;
    }
    this.checkDestroyed(racer);
  }

  onScrape(racer, side) {
    if (Math.random() < 0.5) {
      const r = racer.right(_v);
      _v2.copy(racer.pos).addScaledVector(r, side * 2.6);
      _v2.y -= 0.5;
      this.effects.sparks(_v2, racer.vel.clone().multiplyScalar(-0.02), 2, 15);
    }
    if (racer.isPlayer) this.shake = Math.max(this.shake || 0, 0.15);
  }

  onLaserHit(racer, point, boltVel) {
    const r = racer.right(_v);
    const side = Math.sign((point.x - racer.pos.x) * r.x + (point.z - racer.pos.z) * r.z) || 1;
    racer.damage.applyHit(11 + Math.random() * 7, side, 'laser', this.time);
    this.effects.sparks(point, null, 25, 30);
    this.effects.flash(point, 0xff6a30, 7);
    if (racer.isPlayer) {
      if (this.haptic) this.haptic([45, 30, 45]);
      this.audio.laserHit();
      this.shake = Math.max(this.shake || 0, 0.6);
      this.flashDamage = 0.6;
      const msg = `TOUCHÉ PAR UN ${this.raiders.name || 'PILLARD'} !`;
      this.hud.alert(msg);
      this.cockpitHud.alert(msg);
    }
    this.checkDestroyed(racer);
  }

  checkDestroyed(racer) {
    if (racer.destroyed) return;
    if (racer.damage.health.hull <= 0) {
      racer.destroyed = true;
      racer.respawnTimer = 3;
      this.effects.explosion(racer.pos.clone().addScaledVector(racer.forward(_v), 4));
      this.audio.explosion(racer.pos);
      if (racer.isPlayer) {
        if (this.haptic) this.haptic([200, 80, 300]);
        this.hud.message('GLISSEUR DÉTRUIT', "L'équipe de dépannage répare… retour en piste", 2.8, 'danger');
        this.cockpitHud.message('GLISSEUR DÉTRUIT', 'Retour en piste…', 2.8, '#ff6644');
      }
    }
  }

  respawn(racer) {
    // après une chute : on repart après le trou, sans réparation gratuite ; après une explosion : un peu en arrière
    const fell = racer.respawnAt !== undefined;
    const back = fell ? racer.respawnAt : racer.distance - 20;
    const s = this.track.wrapS(back);
    racer.placeOnTrack(this.track, s, 0);
    racer.distance = back;
    racer.trackS = s;
    racer.destroyed = false;
    racer.respawnAt = undefined;
    if (!fell) {
      racer.damage.reset(65);
      racer.damage.health.hull = 55;
    } else if (racer.damage.health.hull < 25) {
      racer.damage.health.hull = 25;
    }
    racer.hitCooldown = 1.5;
  }

  // Chute dans le trou d'un saut (vide, eau ou lave) : le pod réapparaît après la réception.
  onFall(racer, J) {
    if (racer.destroyed) return;
    const t = this.track;
    racer.destroyed = true;
    racer.respawnTimer = 2.2;
    let dsLand = J ? J.land * t.step - t.wrapS(racer.distance) : 40;
    if (dsLand < 0) dsLand += t.length;
    racer.respawnAt = racer.distance + dsLand + 30;
    const w = t.theme.water;
    const p = racer.pos.clone();
    if (w && w.lava) {
      p.y = t.waterLevel + 1;
      this.effects.explosion(p);
      this.audio.explosion(p);
    } else if (w) {
      p.y = t.waterLevel + 0.5;
      for (let k = 0; k < 3; k++) this.effects.impactDust(p);
      this.effects.sparks(p, null, 10, 12);
      this.audio.splash(p);
    }
    if (racer.isPlayer) {
      if (this.haptic) this.haptic([120, 60, 200]);
      const sub = w ? (w.lava ? 'Englouti par la lave…' : "Plouf ! L'équipe de secours vous repêche…") : 'Trop lent pour franchir le saut…';
      this.hud.message('CHUTE !', sub, 2.2, 'danger');
      this.cockpitHud.message('CHUTE !', sub, 2.2, '#ff6644');
    }
  }

  // Réception brutale après un saut
  onLand(racer, vImpact) {
    const dmg = (vImpact - 15) * 0.6;
    if (dmg > 0.5) racer.damage.applyHit(dmg, 0, 'landing', this.time);
    if (racer.isPlayer) {
      this.shake = Math.max(this.shake || 0, Math.min(1, vImpact / 28));
      this.audio.hit(Math.min(0.8, vImpact / 40));
      if (this.haptic) this.haptic(Math.round(Math.min(90, vImpact * 3)));
    }
    this.effects.impactDust(new THREE.Vector3(racer.pos.x, racer.groundY + 0.3, racer.pos.z));
    this.checkDestroyed(racer);
  }

  // Traversée d'un jet de flammes
  onFlame(racer, jet) {
    racer.damage.applyHit(7 + Math.random() * 6, jet.side ? -jet.side : 0, 'flame', this.time);
    if (Math.random() < 0.35) racer.damage.triggerBreakdown(Math.random() < 0.5 ? 'engineL' : 'engineR');
    this.effects.flash(racer.pos, jet.style.glow, 8);
    if (racer.isPlayer) {
      const msg = jet.style.label === 'FLAMMES' ? 'BRÛLÉ PAR LES FLAMMES !' : `TOUCHÉ : ${jet.style.label} !`;
      this.hud.alert(msg);
      this.cockpitHud.alert(msg);
      this.shake = Math.max(this.shake || 0, 0.5);
      this.flashDamage = 0.5;
      this.audio.hit(0.4);
      if (this.haptic) this.haptic([40, 20, 40]);
    }
    this.checkDestroyed(racer);
  }

  // Remet le joueur au centre de la piste (bouton "replacer").
  resetPlayer() {
    const p = this.player;
    if (p.destroyed || this.state !== 'race') return;
    const s = this.track.wrapS(p.distance);
    const keepDist = p.distance;
    p.placeOnTrack(this.track, s, 0);
    p.distance = keepDist;
    p.trackS = s;
    p.hitCooldown = 1;
  }

  // ------------------------------------------------------------------ collisions entre pods
  racerCollisions() {
    const rs = this.racers;
    for (let i = 0; i < rs.length; i++) {
      const a = rs[i];
      if (a.destroyed) continue;
      for (let j = i + 1; j < rs.length; j++) {
        const b = rs[j];
        if (b.destroyed) continue;
        const dx0 = a.pos.x - b.pos.x, dz0 = a.pos.z - b.pos.z;
        if (dx0 * dx0 + dz0 * dz0 > 625) continue;
        const ca = a.collisionCircles(), cb = b.collisionCircles();
        for (const p of ca) for (const q of cb) {
          const dx = p.x - q.x, dz = p.z - q.z;
          const d = Math.hypot(dx, dz);
          const minD = p.r + q.r;
          if (d >= minD || d < 1e-4) continue;
          const nx = dx / d, nz = dz / d;
          const ma = a.phys.mass, mb = b.phys.mass;
          const over = minD - d;
          this.pushRacer(a, nx * over * mb / (ma + mb), nz * over * mb / (ma + mb));
          this.pushRacer(b, -nx * over * ma / (ma + mb), -nz * over * ma / (ma + mb));
          const vrx = a.vel.x - b.vel.x, vrz = a.vel.z - b.vel.z;
          const vn = vrx * nx + vrz * nz;
          if (vn < 0) {
            const jImp = (-(1 + 0.35) * vn) / (1 / ma + 1 / mb);
            this.impulseRacer(a, (jImp / ma) * nx, (jImp / ma) * nz);
            this.impulseRacer(b, (-jImp / mb) * nx, (-jImp / mb) * nz);
            const sev = -vn;
            if (sev > 4 && (a.hitCooldown <= 0 || b.hitCooldown <= 0)) {
              const sideA = Math.sign(-nx * a.right(_v).x - nz * a.right(_v).z) || 1;
              const sideB = Math.sign(nx * b.right(_v).x + nz * b.right(_v).z) || 1;
              this.onImpact(a, (sev - 2) * 0.45 * (mb / ma), sideA, 'racer');
              this.onImpact(b, (sev - 2) * 0.45 * (ma / mb), sideB, 'racer');
              a.hitCooldown = b.hitCooldown = 0.35;
            }
          }
        }
      }
    }
  }

  pushRacer(r, dx, dz) {
    if (r.isPlayer) { r.pos.x += dx; r.pos.z += dz; return; }
    const smp = this.track.sample(r.distance, 0, r._push || (r._push = {}));
    r.ai.lat += dx * smp.rx + dz * smp.rz;
    r.distance += (dx * smp.tx + dz * smp.tz) * 0.5;
    r.pos.x += dx; r.pos.z += dz;
  }

  impulseRacer(r, dvx, dvz) {
    if (r.isPlayer) { r.vel.x += dvx; r.vel.z += dvz; return; }
    const smp = this.track.sample(r.distance, 0, r._push || (r._push = {}));
    r.speed = Math.max(0, r.speed + dvx * smp.tx + dvz * smp.tz);
    r.ai.latVel += (dvx * smp.rx + dvz * smp.rz) * 0.8;
    r.vel.x += dvx; r.vel.z += dvz;
  }

  // ------------------------------------------------------------------ boucle
  update(dt, input) {
    const p = this.player;
    this.shake = Math.max(0, (this.shake || 0) - dt * 2.5);
    this.flashDamage = Math.max(0, (this.flashDamage || 0) - dt);

    if (this.state === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown - 0.2);
      if (n !== this.lastBeep && n <= 3 && n >= 1) {
        this.lastBeep = n;
        this.audio.beep(false);
        this.hud.message(String(n), '', 0.9, 'count');
        this.cockpitHud.message(String(n), '', 0.9);
      }
      const lit = clamp(Math.floor((4.2 - this.countdown) / 0.8), 0, 5);
      this.env.setStartLights(lit, false);
      // les moteurs grondent sur la grille
      for (const r of this.racers) {
        r.throttle = r.isPlayer ? input.throttle * 0.6 : 0.3 + Math.random() * 0.2;
        r.leverL = r.leverR = r.throttle;
      }
      if (this.countdown <= 0.2) {
        this.state = 'race';
        this.time = 0;
        this.env.setStartLights(5, true);
        this.audio.beep(true);
        this.hud.message('PARTEZ !', '', 1.2, 'go');
        this.cockpitHud.message('PARTEZ !', '', 1.2, '#7dff8a');
        // départ canon : petit bonus si le joueur accélérait au bon moment
        if (input.throttle > 0.5) p.vel.copy(p.forward(_v)).multiplyScalar(12);
      }
      this.syncAll(dt);
      return;
    }

    this.time += dt;
    // physique en sous-pas pour la stabilité à haute vitesse
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    let pin = input;
    if (p.finished) pin = p.autopilotInput(this.track, 60, this);
    for (let k = 0; k < steps; k++) {
      if (!p.destroyed) p.updatePlayerPhysics(h, pin, this.track, this);
      for (const r of this.racers) if (!r.isPlayer && !r.destroyed) r.updateAI(h, this.track, this);
      this.racerCollisions();
    }
    // avaries du joueur
    if (!p.destroyed) {
      const wasBoost = this._wasBoost;
      p.damage.update(dt, pin.repair, true, p.boost);
      if (p.boost && !wasBoost) this.audio.boostOn();
      this._wasBoost = p.boost;
      if (input.cycle) p.damage.cycleTarget();
      if (input.reset) this.resetPlayer();
    }
    // événements d'avaries -> interface
    for (const r of this.racers) {
      const ev = r.damage.events;
      if (!ev.length) continue;
      if (r.isPlayer) {
        for (const e of ev) {
          if (e.type === 'fire' || e.type === 'jam' || e.type === 'fault' || e.type === 'heat' || e.type === 'dead') {
            this.hud.alert(e.text);
            this.cockpitHud.alert(e.text);
            this.audio.alarm();
          } else if (e.type === 'done' || e.type === 'fixed') {
            this.audio.done();
          }
        }
      }
      ev.length = 0;
    }
    // destructions / réapparitions
    for (const r of this.racers) {
      if (!r.destroyed && r.damage.health.hull <= 0) this.checkDestroyed(r);
      if (r.destroyed) {
        r.respawnTimer -= dt;
        if (r.respawnTimer <= 0) this.respawn(r);
      }
    }
    this.raiders.update(dt, this);
    if (this.hazards) this.hazards.update(dt, this, this.camPos || this.player.pos);
    this.playerCovered = !!this.track.tunnel[this.player.hint];
    this.updateLaps();
    this.updatePlaces();
    this.passArches();
    this.emitEffects(dt);
    this.syncAll(dt);

    if (p.finished) {
      this.endTimer += dt;
      if (this.endTimer > 4 && this.state !== 'finished') this.state = 'finished';
    }
  }

  passArches() {
    const p = this.player;
    const spans = this.track.archSpans;
    if (!spans.length) return;
    const idx = Math.floor(p.trackS / this.track.step);
    for (const a of spans) {
      let d = a - idx;
      if (d < -this.track.N / 2) d += this.track.N;
      if (d > 0 && d < 3 && this._lastArch !== a && Math.abs(p.speed) > 60) {
        this._lastArch = a;
        this.audio.whoosh();
      }
    }
  }

  updateLaps() {
    const L = this.track.length;
    for (const r of this.racers) {
      if (r.finished) continue;
      const lapIdx = Math.floor(r.distance / L); // 0 pendant le 1er tour
      if (lapIdx > r.maxLapIndex) {
        r.maxLapIndex = lapIdx;
        if (lapIdx >= 1) {
          const lt = this.time - r.lapStart;
          r.lapTimes.push(lt);
          r.bestLap = Math.min(r.bestLap, lt);
          r.lapStart = this.time;
          if (lapIdx >= this.laps) {
            r.finished = true;
            r.finishTime = this.time;
            this.finishOrder.push(r);
            if (r.isPlayer) {
              const place = this.finishOrder.length;
              this.audio.finish();
              this.hud.message(place === 1 ? 'VICTOIRE !' : `ARRIVÉE : ${place}e`, formatTime(r.finishTime), 4, place === 1 ? 'go' : '');
              this.cockpitHud.message(place === 1 ? 'VICTOIRE !' : `ARRIVÉE : ${place}e`, formatTime(r.finishTime), 4);
            }
          } else if (r.isPlayer) {
            this.audio.lap();
            const last = lapIdx === this.laps - 1;
            this.hud.message(last ? 'DERNIER TOUR' : `TOUR ${lapIdx + 1}`, 'Tour : ' + formatTime(lt), 2, last ? 'danger' : '');
            this.cockpitHud.message(last ? 'DERNIER TOUR' : `TOUR ${lapIdx + 1}`, formatTime(lt), 2);
          }
        }
      }
    }
  }

  updatePlaces() {
    const sorted = this.racers.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.distance - a.distance;
    });
    sorted.forEach((r, i) => (r.place = i + 1));
    this.sorted = sorted;
  }

  emitEffects(dt) {
    const fx = this.effects;
    for (const r of this.racers) {
      if (r.destroyed) continue;
      const spd = Math.abs(r.speed);
      // panache de poussière soulevé par les réacteurs
      const near = r.isPlayer || r.pos.distanceToSquared(this.player.pos) < 400 * 400;
      if (near && spd > 20) {
        const rate = spd * (r.offTrack ? 0.6 : 0.22) * (r.isPlayer ? 0.6 : 1) * this.fxScale;
        r._dustAcc = (r._dustAcc || 0) + rate * dt;
        while (r._dustAcc > 1) {
          r._dustAcc -= 1;
          const f = r.forward(_v);
          // joueur : derrière le cockpit pour ne pas traverser sa propre caméra
          const off = r.isPlayer ? -7 : 5;
          _v2.set(r.pos.x + f.x * off, r.groundY + 0.3, r.pos.z + f.z * off);
          fx.dust(_v2, r.vel, r.offTrack ? 1.4 : 0.8);
        }
      }
      // fumée / feu des moteurs endommagés
      const d = r.damage;
      for (let k = 0; k < 2; k++) {
        const key = k === 0 ? 'engineL' : 'engineR';
        const h = d.health[key];
        const burning = d.fire[key];
        if (h > 65 && !burning) continue;
        if (!near) continue;
        engineRearWorld(r.model, k, _v);
        const intensity = burning ? 1 : (65 - h) / 65;
        r['_sm' + k] = (r['_sm' + k] || 0) + dt * (6 + intensity * 30);
        while (r['_sm' + k] > 1) {
          r['_sm' + k] -= 1;
          fx.smoke(_v, r.vel, intensity);
        }
        if (burning) fx.fire(_v, r.vel);
      }
    }
  }

  syncAll(dt) {
    for (const r of this.racers) r.syncModel(this.time, dt, { levelCockpit: r.isPlayer && this.levelPlayerCockpit });
  }

  results() {
    const L = this.track.length;
    const list = this.racers.map((r) => {
      let t = r.finishTime;
      let est = false;
      if (!r.finished) {
        const remain = this.laps * L - r.distance;
        const avg = Math.max(60, r.distance / Math.max(1, this.time));
        t = this.time + remain / avg;
        est = true;
      }
      return { r, t, est };
    });
    list.sort((a, b) => a.t - b.t);
    return list.map((x, i) => ({
      place: i + 1, name: x.r.name, pod: x.r.podDef.name, time: x.t, estimated: x.est,
      best: x.r.bestLap, isPlayer: x.r.isPlayer,
    }));
  }
}
