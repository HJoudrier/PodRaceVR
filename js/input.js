// Entrées unifiées : clavier, manette (Gamepad API), écran tactile et manettes Meta Quest (WebXR).
import { clamp } from './util.js';

const EDGE_KEYS = ['cycle', 'camera', 'pause', 'reset', 'confirm', 'back'];

export class Input {
  constructor() {
    this.keys = new Set();
    this.tapped = new Set(); // appuis brefs mémorisés jusqu'à la prochaine lecture
    this.prev = {};
    this.kbSteer = 0;
    this.vrControl = 'standard';
    this.gameActive = false;
    this.state = { throttle: 0, brake: 0, steer: 0, boost: false, repair: false, leverL: null, leverR: null };
    for (const k of EDGE_KEYS) this.state[k] = false;
    this.source = 'keyboard';
    this.resetHold = 0;
    this.touch = null; // TouchControls, branché par main.js

    window.addEventListener('keydown', (e) => {
      if (this.gameActive && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.tapped.add(e.code);
      this.keys.add(e.code);
      this.source = 'keyboard';
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  edge(name, pressed) {
    const was = this.prev[name] || false;
    this.prev[name] = pressed;
    return pressed && !was;
  }

  poll(dt, xrSession) {
    const held = this.keys;
    const tapped = this.tapped;
    const k = { has: (c) => held.has(c) || tapped.has(c) };
    const s = this.state;
    let throttle = 0, brake = 0, steer = 0, boost = false, repair = false;
    let cycle = false, camera = false, pause = false, reset = false, confirm = false, back = false;
    let leverL = null, leverR = null;

    // --- clavier
    const up = k.has('ArrowUp') || k.has('KeyW') || k.has('KeyZ');
    const down = k.has('ArrowDown') || k.has('KeyS');
    const left = k.has('ArrowLeft') || k.has('KeyA') || k.has('KeyQ');
    const right = k.has('ArrowRight') || k.has('KeyD');
    const target = (right ? 1 : 0) - (left ? 1 : 0);
    const rate = target === 0 ? 7 : Math.sign(target) !== Math.sign(this.kbSteer) ? 9 : 4.5;
    this.kbSteer += clamp(target - this.kbSteer, -rate * dt, rate * dt);
    if (up) throttle = 1;
    if (down) brake = 1;
    steer = this.kbSteer;
    boost = k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight');
    repair = k.has('KeyR');
    cycle = k.has('Tab') || k.has('KeyE');
    camera = k.has('KeyC');
    pause = k.has('Escape') || k.has('KeyP');
    reset = k.has('Backspace') || k.has('KeyT');
    confirm = k.has('Enter');
    back = k.has('Escape');

    // --- manettes classiques
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected || gp.mapping !== 'standard') continue;
      const b = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
      const pr = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
      const ax = gp.axes[0] || 0;
      const st = Math.abs(ax) > 0.12 ? Math.sign(ax) * ((Math.abs(ax) - 0.12) / 0.88) : 0;
      if (Math.abs(st) > Math.abs(steer)) steer = st;
      throttle = Math.max(throttle, b(7));
      brake = Math.max(brake, b(6));
      if (pr(0) || pr(5)) boost = true;
      if (pr(2)) repair = true;
      if (pr(3) || pr(4)) cycle = true;
      if (pr(1)) { camera = true; back = true; }
      if (pr(9)) pause = true;
      if (pr(8) || pr(10)) reset = true;
      if (pr(0)) confirm = true;
      if (b(7) > 0.05 || Math.abs(ax) > 0.3 || pr(0)) this.source = 'gamepad';
    }

    // --- commandes tactiles (téléphone / tablette)
    let touchTaps = null;
    if (this.touch && this.touch.visible) {
      const { state: t, taps } = this.touch.read();
      throttle = Math.max(throttle, t.throttle);
      brake = Math.max(brake, t.brake);
      if (Math.abs(t.steer) > Math.abs(steer)) steer = t.steer;
      if (t.boost) boost = true;
      if (t.repair) repair = true;
      touchTaps = taps;
      if (this.touch.pointers.size || taps.size) this.source = 'touch';
    }

    // --- manettes VR (mapping xr-standard)
    if (xrSession) {
      let L = null, R = null;
      for (const src of xrSession.inputSources) {
        if (!src.gamepad) continue;
        if (src.handedness === 'left') L = src.gamepad;
        else if (src.handedness === 'right') R = src.gamepad;
      }
      const bv = (gp, i) => (gp && gp.buttons[i] ? gp.buttons[i].value : 0);
      const bp = (gp, i) => !!(gp && gp.buttons[i] && gp.buttons[i].pressed);
      const stickX = (gp) => {
        if (!gp) return 0;
        const v = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0;
        return Math.abs(v) > 0.15 ? Math.sign(v) * ((Math.abs(v) - 0.15) / 0.85) : 0;
      };
      const sx = Math.abs(stickX(L)) > Math.abs(stickX(R)) ? stickX(L) : stickX(R);
      if (L || R) this.source = 'xr';
      if (this.vrControl === 'leviers') {
        // deux leviers de poussée : la différence entre les gâchettes fait tourner le pod
        leverL = bv(L, 0);
        leverR = bv(R, 0);
        throttle = Math.max(throttle, (leverL + leverR) / 2, Math.max(leverL, leverR) * 0.8);
        const diff = (leverL - leverR) * 1.7;
        const st = clamp(diff + sx, -1, 1);
        if (Math.abs(st) > Math.abs(steer)) steer = st;
        brake = Math.max(brake, bv(L, 1), bv(R, 1));
      } else {
        throttle = Math.max(throttle, bv(R, 0));
        brake = Math.max(brake, bv(L, 0));
        if (Math.abs(sx) > Math.abs(steer)) steer = sx;
        if (bv(L, 1) > 0.6 || bv(R, 1) > 0.6) repair = true;
      }
      if (bp(R, 4)) { boost = true; confirm = true; }
      if (bp(R, 5)) { pause = true; back = true; }
      if (bp(L, 4)) repair = true;
      if (bp(L, 5)) cycle = true;
      if (bp(L, 3) || bp(R, 3)) reset = true;
    }

    s.throttle = clamp(throttle, 0, 1);
    s.brake = clamp(brake, 0, 1);
    s.steer = clamp(steer, -1, 1);
    s.boost = boost;
    s.repair = repair;
    s.leverL = leverL;
    s.leverR = leverR;
    s.cycle = this.edge('cycle', cycle);
    s.camera = this.edge('camera', camera);
    s.pause = this.edge('pause', pause);
    s.reset = this.edge('reset', reset);
    s.confirm = this.edge('confirm', confirm);
    s.back = this.edge('back', back);
    // un appui bref doit déclencher l'action même si la touche est déjà relâchée
    if (tapped.size) {
      const t = (c) => tapped.has(c);
      if (t('Tab') || t('KeyE')) s.cycle = true;
      if (t('KeyC')) s.camera = true;
      if (t('Escape') || t('KeyP')) s.pause = true;
      if (t('Backspace') || t('KeyT')) s.reset = true;
      if (t('Enter')) s.confirm = true;
      if (t('Escape')) s.back = true;
      tapped.clear();
    }
    if (touchTaps && touchTaps.size) {
      if (touchTaps.has('cycle')) s.cycle = true;
      if (touchTaps.has('camera')) s.camera = true;
      if (touchTaps.has('pause')) s.pause = true;
      if (touchTaps.has('reset')) s.reset = true;
    }
    return s;
  }
}
