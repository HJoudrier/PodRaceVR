// Sons synthétisés en temps réel (WebAudio) : moteurs, vent, blasters, chocs, alarmes, réparation.
import { clamp } from './util.js';

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.ai = [];
    this.running = false;
    this.repairT = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    // bruit blanc partagé
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // courbe de distorsion
    const n = 1024;
    this.curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * 2 - 1;
      this.curve[i] = Math.tanh(x * 3.2);
    }
    this.buildLoops();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  noiseSource() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  }

  buildLoops() {
    const ctx = this.ctx;
    // vent : clé de la sensation de vitesse
    const wn = this.noiseSource();
    this.windBP = ctx.createBiquadFilter();
    this.windBP.type = 'bandpass';
    this.windBP.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wn.connect(this.windBP).connect(this.windGain).connect(this.master);
    wn.start();
    const hn = this.noiseSource();
    this.hissHP = ctx.createBiquadFilter();
    this.hissHP.type = 'highpass';
    this.hissHP.frequency.value = 3000;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    hn.connect(this.hissHP).connect(this.hissGain).connect(this.master);
    hn.start();
    // frottement contre les parois
    const sn = this.noiseSource();
    const sbp = ctx.createBiquadFilter();
    sbp.type = 'bandpass';
    sbp.frequency.value = 2400;
    sbp.Q.value = 1.5;
    this.scrapeGain = ctx.createGain();
    this.scrapeGain.gain.value = 0;
    sn.connect(sbp).connect(this.scrapeGain).connect(this.master);
    sn.start();
    // moteurs du joueur (un par réacteur, gauche/droite)
    this.engines = [-0.55, 0.55].map((pan) => this.makeEngineVoice(pan));
  }

  makeEngineVoice(pan) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth';
    const o3 = ctx.createOscillator(); o3.type = 'square';
    const mix = ctx.createGain(); mix.gain.value = 0.25;
    const g3 = ctx.createGain(); g3.gain.value = 0.5;
    o1.connect(mix); o2.connect(mix); o3.connect(g3).connect(mix);
    const nz = this.noiseSource();
    const nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.value = 0.0;
    nz.connect(nbp).connect(ng).connect(mix);
    const shaper = ctx.createWaveShaper(); shaper.curve = this.curve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    const trem = ctx.createGain(); trem.gain.value = 1;
    const out = ctx.createGain(); out.gain.value = 0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    mix.connect(shaper).connect(lp).connect(trem).connect(out);
    if (p) { p.pan.value = pan; out.connect(p).connect(this.master); } else out.connect(this.master);
    // trémolo rapide = crépitement du réacteur
    const lfo = ctx.createOscillator(); lfo.frequency.value = 28;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.25;
    lfo.connect(lfoG).connect(trem.gain);
    for (const o of [o1, o2, o3, lfo]) o.start();
    nz.start();
    return { o1, o2, o3, nbp, ng, lp, out, lfo };
  }

  makeAIVoice() {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 1.5;
    const g = ctx.createGain(); g.gain.value = 0;
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    const pn = ctx.createPanner();
    pn.panningModel = 'equalpower';
    pn.distanceModel = 'inverse';
    pn.refDistance = 12;
    pn.maxDistance = 2000;
    pn.rolloffFactor = 1.3;
    o1.connect(lp); o2.connect(g2).connect(lp);
    lp.connect(g).connect(pn).connect(this.master);
    o1.start(); o2.start();
    return { o1, o2, lp, g, pn, base: 36 + Math.random() * 14 };
  }

  startRace(aiCount) {
    if (!this.ctx) return;
    this.stopRace();
    for (let i = 0; i < aiCount; i++) this.ai.push(this.makeAIVoice());
    this.running = true;
  }

  stopRace() {
    if (!this.ctx) return;
    for (const v of this.ai) {
      try { v.o1.stop(); v.o2.stop(); v.g.disconnect(); } catch (e) { /* déjà arrêté */ }
    }
    this.ai = [];
    this.running = false;
    this.silence();
  }

  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0, t, 0.1);
    this.hissGain.gain.setTargetAtTime(0, t, 0.1);
    this.scrapeGain.gain.setTargetAtTime(0, t, 0.05);
    for (const e of this.engines) e.out.gain.setTargetAtTime(0, t, 0.1);
  }

  setPanner(pn, p) {
    const t = this.ctx.currentTime;
    if (pn.positionX) {
      pn.positionX.setValueAtTime(p.x, t); pn.positionY.setValueAtTime(p.y, t); pn.positionZ.setValueAtTime(p.z, t);
    } else pn.setPosition(p.x, p.y, p.z);
  }

  // listener : {pos, fwd, vel}, player : racer, ais : racers
  update(dt, listener, player, ais, paused) {
    if (!this.ctx || paused) { this.silence(); return; }
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.setValueAtTime(listener.pos.x, t); L.positionY.setValueAtTime(listener.pos.y, t); L.positionZ.setValueAtTime(listener.pos.z, t);
      L.forwardX.setValueAtTime(listener.fwd.x, t); L.forwardY.setValueAtTime(listener.fwd.y, t); L.forwardZ.setValueAtTime(listener.fwd.z, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else {
      L.setPosition(listener.pos.x, listener.pos.y, listener.pos.z);
      L.setOrientation(listener.fwd.x, listener.fwd.y, listener.fwd.z, 0, 1, 0);
    }
    if (!player) return;
    const sp = Math.abs(player.speed);
    const k = clamp(sp / 230, 0, 1.3);
    this.windGain.gain.setTargetAtTime(0.75 * k * k, t, 0.1);
    this.windBP.frequency.setTargetAtTime(250 + sp * 7, t, 0.1);
    this.hissGain.gain.setTargetAtTime(0.22 * Math.max(0, k - 0.45) * (player.boost ? 1.8 : 1), t, 0.1);
    this.scrapeGain.gain.setTargetAtTime(player.scraping > 0.5 ? 0.45 : 0, t, 0.03);

    const d = player.damage;
    const hs = [d.health.engineL, d.health.engineR];
    const fires = [d.fire.engineL, d.fire.engineR];
    this.engines.forEach((e, i) => {
      const thr = player.destroyed ? 0 : (i === 0 ? player.leverL : player.leverR);
      const f = 34 + sp * 0.5 + thr * 14 + (player.boost ? 18 : 0);
      e.o1.frequency.setTargetAtTime(f, t, 0.05);
      e.o2.frequency.setTargetAtTime(f * 1.012, t, 0.05);
      e.o3.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      e.nbp.frequency.setTargetAtTime(400 + sp * 6, t, 0.05);
      e.ng.gain.setTargetAtTime(0.4 + thr * 0.6, t, 0.05);
      e.lp.frequency.setTargetAtTime(260 + sp * 7 + thr * 900, t, 0.05);
      e.lfo.frequency.setTargetAtTime(18 + sp * 0.12, t, 0.1);
      let g = player.destroyed ? 0 : 0.16 + thr * 0.14;
      // moteur endommagé : ratés
      if ((hs[i] < 40 || fires[i]) && Math.random() < 0.18) g *= 0.25;
      if (hs[i] <= 0) g *= 0.3;
      e.out.gain.setTargetAtTime(g, t, 0.03);
    });

    // concurrents : son spatialisé + effet Doppler (accentué)
    const c = 650;
    ais.forEach((r, i) => {
      const v = this.ai[i];
      if (!v) return;
      this.setPanner(v.pn, r.pos);
      const dx = listener.pos.x - r.pos.x, dy = listener.pos.y - r.pos.y, dz = listener.pos.z - r.pos.z;
      const dist = Math.hypot(dx, dy, dz) || 1;
      const vs = (r.vel.x * dx + r.vel.z * dz) / dist;          // source vers l'auditeur
      const vl = (listener.vel.x * dx + listener.vel.z * dz) / dist;
      const dop = clamp((c - vl) / (c - vs), 0.55, 1.9);
      const f = (v.base + r.speed * 0.5 + r.throttle * 10) * dop;
      v.o1.frequency.setTargetAtTime(f, t, 0.04);
      v.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
      v.lp.frequency.setTargetAtTime(500 + r.speed * 5, t, 0.05);
      v.g.gain.setTargetAtTime(r.destroyed || dist > 900 ? 0 : 0.35, t, 0.05);
    });

    // cliquetis de réparation
    if (player.damage.repairing && !player.destroyed) {
      this.repairT -= dt;
      if (this.repairT <= 0) { this.click(); this.repairT = 0.09; }
    }
  }

  env(g, t0, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  spatial(pos) {
    const pn = this.ctx.createPanner();
    pn.panningModel = 'equalpower';
    pn.distanceModel = 'inverse';
    pn.refDistance = 20;
    pn.rolloffFactor = 1;
    this.setPanner(pn, pos);
    pn.connect(this.master);
    return pn;
  }

  blaster(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(1700, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.22);
    const g = ctx.createGain();
    this.env(g, t, 0.005, 0.5, 0.25);
    const out = this.spatial(pos);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.3);
  }

  nearMiss(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(2600, t);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    const g = ctx.createGain();
    this.env(g, t, 0.01, 0.35, 0.32);
    o.connect(g).connect(this.spatial(pos));
    o.start(t); o.stop(t + 0.35);
  }

  noiseBurst(dur, freq, peak, pos, type = 'lowpass', sweepTo = null) {
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.005, peak, dur);
    s.connect(f).connect(g).connect(pos ? this.spatial(pos) : this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  boltImpact(pos) { if (this.ctx) this.noiseBurst(0.25, 1800, 0.4, pos, 'bandpass'); }
  hit(strong = 0.5) {
    if (!this.ctx) return;
    this.noiseBurst(0.18 + strong * 0.3, 900 + strong * 600, clamp(0.3 + strong, 0.3, 1.2), null, 'lowpass', 120);
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = ctx.createGain(); this.env(g, t, 0.005, clamp(0.4 + strong, 0.4, 1.2), 0.3);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.35);
  }
  blasterHit() { if (this.ctx) { this.noiseBurst(0.35, 2500, 0.7, null, 'bandpass', 300); this.hit(0.3); } }
  explosion(pos) { if (this.ctx) this.noiseBurst(1.6, 2500, 1.4, pos, 'lowpass', 60); }
  whoosh() { if (this.ctx) this.noiseBurst(0.7, 500, 0.55, null, 'bandpass', 2600); }
  boostOn() { if (this.ctx) this.noiseBurst(0.6, 300, 0.4, null, 'bandpass', 3000); }

  tone(freq, dur, type = 'sine', peak = 0.4, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); this.env(g, t, 0.01, peak, dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  beep(go = false) { this.tone(go ? 1180 : 590, go ? 0.6 : 0.22, 'square', 0.25); }
  alarm() {
    for (let i = 0; i < 3; i++) {
      this.tone(880, 0.1, 'square', 0.18, i * 0.24);
      this.tone(660, 0.1, 'square', 0.18, i * 0.24 + 0.12);
    }
  }
  click() { if (this.ctx) this.noiseBurst(0.03, 3500, 0.18, null, 'highpass'); }
  done() { this.tone(990, 0.12, 'triangle', 0.25); this.tone(1320, 0.18, 'triangle', 0.25, 0.1); }
  lap() { this.tone(784, 0.15, 'triangle', 0.3); this.tone(1046, 0.25, 'triangle', 0.3, 0.14); }
  finish() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.3, i * 0.15)); }
}
