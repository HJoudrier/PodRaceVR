// Système d'avaries : moteurs gauche/droit, direction, coque. Dégâts, pannes aléatoires, réparation.
import { clamp } from './util.js';

export const SYSTEMS = ['engineL', 'engineR', 'steering', 'hull'];
export const SYSTEM_LABELS = {
  engineL: 'Moteur gauche',
  engineR: 'Moteur droit',
  steering: 'Direction',
  hull: 'Coque',
};
export const SYSTEM_SHORT = { engineL: 'MOT G', engineR: 'MOT D', steering: 'DIR', hull: 'COQUE' };

const REPAIR_RATE = { engineL: 13, engineR: 13, steering: 15, hull: 9 };

export class DamageSystem {
  constructor(armorMult = 1, breakdownRate = 1) {
    this.armorMult = armorMult;
    this.breakdownRate = breakdownRate;
    this.reset();
  }

  reset(level = 100) {
    this.health = { engineL: level, engineR: level, steering: level, hull: level };
    this.fire = { engineL: false, engineR: false };
    this.jam = 0;          // dérive de la direction bloquée (-1..1)
    this.heat = 0;         // surchauffe liée au boost (0..100+)
    this.target = 'engineL';
    this.repairing = false;
    this.repairHold = 0;   // durée de réparation continue sur la cible
    this.events = [];      // messages pour l'interface
    this.lastHitTime = -10;
  }

  // Coefficients appliqués à la physique.
  factors() {
    const h = this.health;
    const eng = (k) => {
      let e = h[k] <= 0 ? 0.12 : 0.3 + 0.7 * (h[k] / 100);
      if (this.fire[k]) e *= 0.65;
      return e;
    };
    const eL = eng('engineL'), eR = eng('engineR');
    const avg = (eL + eR) / 2;
    const hullF = 0.9 + 0.1 * (h.hull / 100);
    return {
      eL, eR,
      thrust: avg,
      topSpeed: (0.5 + 0.5 * avg) * hullF,
      steer: 0.35 + 0.65 * (h.steering / 100),
      steerBias: this.jam * 0.38,
      imbalance: eL - eR,     // >0 : moteur gauche plus fort -> le glisseur tire à droite
      canBoost: h.engineL > 25 && h.engineR > 25 && !this.fire.engineL && !this.fire.engineR,
    };
  }

  emit(type, system, text) {
    this.events.push({ type, system, text });
  }

  hullFraction() { return this.health.hull / 100; }

  // amount : intensité du choc ; side : -1 gauche, +1 droite, 0 inconnu ; kind : 'wall' | 'laser' | 'racer' | 'obstacle'
  applyHit(amount, side = 0, kind = 'wall', time = 0) {
    if (amount <= 0) return;
    const a = amount * this.armorMult;
    const h = this.health;
    h.hull = clamp(h.hull - a * 0.5, 0, 100);
    const wL = side < 0 ? 3 : 1, wR = side > 0 ? 3 : 1, wS = kind === 'laser' ? 1.0 : 1.4;
    const r = Math.random() * (wL + wR + wS);
    const sys = r < wL ? 'engineL' : r < wL + wR ? 'engineR' : 'steering';
    const pass = 0.55 + 0.45 * (1 - h.hull / 100);
    const before = h[sys];
    h[sys] = clamp(h[sys] - a * pass, 0, 100);
    this.lastHitTime = time;
    // un gros choc peut déclencher immédiatement une avarie
    if (a > 9 && Math.random() < a / 45) this.triggerBreakdown(sys);
    if (before > 0 && h[sys] <= 0) this.emit('dead', sys, `${SYSTEM_LABELS[sys]} HORS SERVICE`);
    return sys;
  }

  triggerBreakdown(sys) {
    if (sys === 'engineL' || sys === 'engineR') {
      if (!this.fire[sys]) {
        this.fire[sys] = true;
        this.emit('fire', sys, `FEU ${sys === 'engineL' ? 'MOTEUR GAUCHE' : 'MOTEUR DROIT'} !`);
      }
    } else if (sys === 'steering') {
      if (this.jam === 0) {
        this.jam = (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.55);
        this.emit('jam', 'steering', 'DIRECTION BLOQUÉE !');
      }
    }
    if (!this.repairing) this.target = sys;
  }

  // Panne spontanée (usure, poussière dans les injecteurs, câble qui lâche...)
  spontaneous() {
    const r = Math.random();
    if (r < 0.38) {
      const sys = Math.random() < 0.5 ? 'engineL' : 'engineR';
      this.health[sys] = clamp(this.health[sys] - 22, 0, 100);
      this.emit('fault', sys, `AVARIE ${sys === 'engineL' ? 'MOTEUR GAUCHE' : 'MOTEUR DROIT'} : injecteur encrassé`);
      if (!this.repairing) this.target = sys;
    } else if (r < 0.62) {
      const sys = Math.random() < 0.5 ? 'engineL' : 'engineR';
      this.health[sys] = clamp(this.health[sys] - 12, 0, 100);
      this.triggerBreakdown(sys);
    } else {
      this.health.steering = clamp(this.health.steering - 20, 0, 100);
      this.triggerBreakdown('steering');
    }
  }

  cycleTarget() {
    const i = SYSTEMS.indexOf(this.target);
    this.target = SYSTEMS[(i + 1) % SYSTEMS.length];
    this.repairHold = 0;
  }

  // Système le plus urgent à réparer.
  mostUrgent() {
    let best = null, score = -1;
    for (const k of SYSTEMS) {
      let s = 100 - this.health[k];
      if (this.fire[k]) s += 80;
      if (k === 'steering' && this.jam !== 0) s += 70;
      if (k === 'hull') s *= 0.6;
      if (s > score) { score = s; best = k; }
    }
    return score > 1 ? best : null;
  }

  needsRepair(k) {
    return this.health[k] < 99.5 || (this.fire[k] || false) || (k === 'steering' && this.jam !== 0);
  }

  update(dt, repairInput, autoTarget, boosting) {
    const h = this.health;
    // incendies : le moteur se consume tant qu'il n'est pas éteint
    for (const k of ['engineL', 'engineR']) {
      if (this.fire[k]) {
        h[k] = clamp(h[k] - 3.2 * dt, 0, 100);
        h.hull = clamp(h.hull - 0.6 * dt, 0, 100);
      }
    }
    // surchauffe du boost
    if (boosting) this.heat += 17 * dt;
    else this.heat = Math.max(0, this.heat - 11 * dt);
    if (this.heat > 100) {
      this.heat = 70;
      const sys = h.engineL < h.engineR ? 'engineL' : 'engineR';
      h[sys] = clamp(h[sys] - 10, 0, 100);
      this.emit('heat', sys, 'SURCHAUFFE !');
      this.triggerBreakdown(sys);
    }
    // avaries liées à l'état des systèmes
    const rate = this.breakdownRate;
    for (const k of ['engineL', 'engineR']) {
      const p = Math.max(0, (55 - h[k]) / 55) * 0.1 * rate;
      if (!this.fire[k] && Math.random() < p * dt) this.triggerBreakdown(k);
    }
    if (this.jam === 0 && Math.random() < Math.max(0, (60 - h.steering) / 60) * 0.09 * rate * dt) this.triggerBreakdown('steering');
    // pannes spontanées : environ une toutes les 50 s
    if (Math.random() < 0.02 * rate * dt) this.spontaneous();

    // réparation
    this.repairing = !!repairInput;
    if (this.repairing) {
      if (autoTarget && !this.needsRepair(this.target)) {
        const u = this.mostUrgent();
        if (u) { this.target = u; this.repairHold = 0; }
      }
      const k = this.target;
      this.repairHold += dt;
      h[k] = clamp(h[k] + REPAIR_RATE[k] * dt, 0, 100);
      if ((k === 'engineL' || k === 'engineR') && this.fire[k] && this.repairHold > 0.9) {
        this.fire[k] = false;
        this.emit('fixed', k, 'Incendie éteint');
      }
      if (k === 'steering' && this.jam !== 0 && this.repairHold > 1.2) {
        this.jam = 0;
        this.emit('fixed', k, 'Direction débloquée');
      }
      if (h[k] >= 100 && !this.fire[k] && !(k === 'steering' && this.jam !== 0)) {
        if (this._lastDone !== k) this.emit('done', k, `${SYSTEM_LABELS[k]} réparé`);
        this._lastDone = k;
        if (autoTarget) {
          const u = this.mostUrgent();
          if (u) { this.target = u; this.repairHold = 0; }
        }
      } else {
        this._lastDone = null;
      }
    } else {
      this.repairHold = 0;
      if (autoTarget && !this.needsRepair(this.target)) {
        const u = this.mostUrgent();
        if (u) this.target = u;
      }
    }
  }

  anyProblem() {
    return this.fire.engineL || this.fire.engineR || this.jam !== 0 ||
      this.health.engineL < 60 || this.health.engineR < 60 || this.health.steering < 60;
  }
}
