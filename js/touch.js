// Commandes tactiles pour téléphone / tablette : joystick flottant ou inclinaison du téléphone
// pour diriger, gros boutons gaz / frein / boost / réparer, boutons rapides (pause, caméra...).
import { clamp } from './util.js';

const STICK_RANGE = 58;     // déplacement (px) du doigt pour braquer à fond
const TILT_RANGE = 24;      // inclinaison (degrés) pour braquer à fond
const TILT_DEAD = 2.5;

// Vecteur gravité (repère de l'écran) à partir des angles beta/gamma d'un événement deviceorientation.
// angle = rotation de l'affichage (0, 90, 180, 270). Renvoie l'angle de « volant » en degrés
// (positif = téléphone tourné dans le sens horaire = virage à droite), ou null si le téléphone est à plat.
export function tiltAngle(beta, gamma, screenAngle) {
  const b = (beta * Math.PI) / 180, g = (gamma * Math.PI) / 180;
  const gx = Math.sin(g) * Math.cos(b);
  const gy = -Math.sin(b);
  const a = (((screenAngle % 360) + 360) % 360) * Math.PI / 180;
  const sx = gx * Math.cos(a) - gy * Math.sin(a);
  const sy = gx * Math.sin(a) + gy * Math.cos(a);
  if (Math.hypot(sx, sy) < 0.22) return null;
  return (Math.atan2(sx, -sy) * 180) / Math.PI;
}

function screenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  if (typeof window.orientation === 'number') return window.orientation;
  return 0;
}

export function isTouchDevice() {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export class TouchControls {
  constructor(root) {
    this.root = root;
    this.visible = false;
    this.steerMode = 'joystick';
    this.autoThrottle = false;
    this.pointers = new Map();
    this.taps = new Set();
    this.used = false;            // un doigt a touché les commandes depuis le début
    this.tilt = { steer: 0, ok: false, listening: false, permission: 'unknown' };
    this.state = { throttle: 0, brake: 0, steer: 0, boost: false, repair: false };
    this.base = root.querySelector('.t-stick-base');
    this.knob = root.querySelector('.t-stick-knob');
    this.zone = root.querySelector('.t-stick-zone');

    const opts = { passive: false };
    root.addEventListener('pointerdown', (e) => this.onDown(e), opts);
    root.addEventListener('pointermove', (e) => this.onMove(e), opts);
    root.addEventListener('pointerup', (e) => this.onUp(e), opts);
    root.addEventListener('pointercancel', (e) => this.onUp(e), opts);
    root.addEventListener('lostpointercapture', (e) => this.onUp(e));
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    // évite zoom / défilement / sélection pendant la course
    root.addEventListener('touchstart', (e) => e.preventDefault(), opts);
    root.addEventListener('touchmove', (e) => e.preventDefault(), opts);
  }

  configure({ steerMode, autoThrottle }) {
    this.steerMode = steerMode === 'tilt' ? 'tilt' : 'joystick';
    this.autoThrottle = !!autoThrottle;
    this.root.classList.toggle('tilt', this.steerMode === 'tilt');
    this.root.classList.toggle('auto-throttle', this.autoThrottle);
    if (this.steerMode === 'tilt') this.startTilt();
  }

  // Doit être appelé pendant un geste de l'utilisateur (clic) pour iOS.
  requestTiltPermission() {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function' && this.tilt.permission !== 'granted') {
      DOE.requestPermission()
        .then((r) => { this.tilt.permission = r; if (r === 'granted') this.startTilt(); })
        .catch(() => { this.tilt.permission = 'denied'; });
    } else {
      this.startTilt();
    }
  }

  startTilt() {
    if (this.tilt.listening || !('DeviceOrientationEvent' in window)) return;
    this.tilt.listening = true;
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta === null || e.gamma === null) return;
      const ang = tiltAngle(e.beta, e.gamma, screenAngle());
      if (ang === null) return;
      this.tilt.ok = true;
      const a = Math.abs(ang) < TILT_DEAD ? 0 : Math.sign(ang) * (Math.abs(ang) - TILT_DEAD);
      this.tilt.steer = clamp(a / (TILT_RANGE - TILT_DEAD), -1, 1);
    });
  }

  setVisible(v) {
    if (v === this.visible) return;
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
    document.body.classList.toggle('touch-race', v);
    if (!v) this.releaseAll();
  }

  releaseAll() {
    for (const p of this.pointers.values()) if (p.el) p.el.classList.remove('down');
    this.pointers.clear();
    this.base.classList.remove('active');
    this.zone.classList.remove('active');
    this.taps.clear();
  }

  targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('[data-act]') : null;
  }

  onDown(e) {
    e.preventDefault();
    this.used = true;
    const t = e.target.closest('[data-act],[data-tap],.t-stick-zone');
    if (!t) return;
    try { this.root.setPointerCapture(e.pointerId); } catch (err) { /* pointeur déjà relâché */ }
    if (t.dataset.tap) {
      this.taps.add(t.dataset.tap);
      t.classList.add('down');
      this.pointers.set(e.pointerId, { kind: 'tap', el: t });
    } else if (t.dataset.act) {
      t.classList.add('down');
      this.pointers.set(e.pointerId, { kind: 'btn', act: t.dataset.act, el: t });
    } else if (this.steerMode === 'joystick') {
      // joystick flottant : il apparaît sous le pouce
      const zr = this.zone.getBoundingClientRect();
      this.pointers.set(e.pointerId, { kind: 'stick', x0: e.clientX, y0: e.clientY, x: e.clientX });
      this.base.style.left = e.clientX - zr.left + 'px';
      this.base.style.top = e.clientY - zr.top + 'px';
      this.base.classList.add('active');
      this.zone.classList.add('active');
      this.knob.style.transform = 'translate(-50%, -50%)';
    }
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.kind === 'stick') {
      p.x = e.clientX;
      const dx = clamp(p.x - p.x0, -STICK_RANGE, STICK_RANGE);
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), -50%)`;
    } else if (p.kind === 'btn') {
      // glisser le pouce d'un bouton à l'autre (ex. gaz -> frein)
      const t = this.targetAt(e.clientX, e.clientY);
      if (t && t.dataset.act !== p.act) {
        p.el.classList.remove('down');
        p.el = t;
        p.act = t.dataset.act;
        t.classList.add('down');
      }
    }
  }

  onUp(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (p.el) p.el.classList.remove('down');
    this.pointers.delete(e.pointerId);
    if (p.kind === 'stick') {
      this.base.classList.remove('active');
      this.zone.classList.remove('active');
    }
  }

  // État courant des commandes + appuis brefs (consommés).
  read() {
    const s = this.state;
    let throttle = false, brake = false, boost = false, repair = false, steer = 0;
    for (const p of this.pointers.values()) {
      if (p.kind === 'btn') {
        if (p.act === 'throttle') throttle = true;
        else if (p.act === 'brake') brake = true;
        else if (p.act === 'boost') { boost = true; throttle = true; }
        else if (p.act === 'repair') repair = true;
      } else if (p.kind === 'stick') {
        const d = clamp((p.x - p.x0) / STICK_RANGE, -1, 1);
        // courbe progressive : précision au centre, braquage franc en bout de course
        steer = Math.sign(d) * Math.pow(Math.max(0, Math.abs(d) - 0.06) / 0.94, 1.35);
      }
    }
    if (this.steerMode === 'tilt' && this.tilt.ok) steer = this.tilt.steer;
    if (this.autoThrottle && !brake) throttle = true;
    s.throttle = throttle ? 1 : 0;
    s.brake = brake ? 1 : 0;
    s.boost = boost;
    s.repair = repair;
    s.steer = steer;
    const taps = new Set(this.taps);
    this.taps.clear();
    return { state: s, taps };
  }
}
