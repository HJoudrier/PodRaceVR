// Données du jeu : podracers, pilotes, conversion des caractéristiques en physique, réglages.
import { lerp, clamp } from './util.js';

export const STAT_KEYS = ['accel', 'topSpeed', 'handling', 'braking', 'armor'];
export const STAT_LABELS = {
  accel: 'Accélération',
  topSpeed: 'Vitesse max',
  handling: 'Maniabilité',
  braking: 'Freinage',
  armor: 'Robustesse',
};

export const TUNING_POINTS = 3; // points de réglage libres (on peut en gagner en baissant une caractéristique)
export const TUNING_MIN = -3;
export const TUNING_MAX = 3;

// 8 podracers originaux, chacun avec un style et un profil différent.
export const PODS = [
  {
    id: 'comete', name: 'Comète Rouge',
    desc: 'Le pod polyvalent par excellence. Aucun point faible, aucun excès.',
    base: { accel: 6, topSpeed: 6, handling: 6, braking: 5, armor: 5 },
    look: { c1: 0xc8322a, c2: 0xf2ece0, c3: 0x3a3a44, engine: 'round', len: 5.6, rad: 0.82, spacing: 3.8, intake: 'ring', fins: 2, cockpit: 'capsule', binder: 0x6fd0ff, flame: 0xff9a3a },
  },
  {
    id: 'scarabee', name: 'Scarabée Blindé',
    desc: 'Un char d\'assaut volant. Encaisse les tirs et les chocs sans broncher.',
    base: { accel: 4, topSpeed: 5, handling: 4, braking: 6, armor: 9 },
    look: { c1: 0x3f6b3a, c2: 0xc19a4b, c3: 0x2b2b2b, engine: 'box', len: 5.2, rad: 0.95, spacing: 4.0, intake: 'split', fins: 4, cockpit: 'tub', binder: 0x9bff7a, flame: 0xffb347 },
  },
  {
    id: 'fennec', name: 'Fennec',
    desc: 'Léger et nerveux : des départs foudroyants, mais une carrosserie fragile.',
    base: { accel: 8, topSpeed: 5, handling: 7, braking: 5, armor: 3 },
    look: { c1: 0xe8812c, c2: 0xf6e3bf, c3: 0x5b3b25, engine: 'tapered', len: 4.6, rad: 0.7, spacing: 3.4, intake: 'ring', fins: 1, cockpit: 'wedge', binder: 0xffe36f, flame: 0xff7b2a },
  },
  {
    id: 'lame', name: 'Lame de Dune',
    desc: 'Deux fuseaux interminables taillés pour la vitesse pure.',
    base: { accel: 5, topSpeed: 9, handling: 5, braking: 5, armor: 4 },
    look: { c1: 0x2f63b8, c2: 0xd9dde4, c3: 0x1d2633, engine: 'round', len: 7.0, rad: 0.68, spacing: 3.6, intake: 'scoop', fins: 3, cockpit: 'wedge', binder: 0x7fb4ff, flame: 0x7fc8ff },
  },
  {
    id: 'krayt', name: 'Krayt',
    desc: 'Monstrueux moteurs jumelés. Très rapide, mais lourd à placer en virage.',
    base: { accel: 6, topSpeed: 8, handling: 3, braking: 5, armor: 6 },
    look: { c1: 0xd8cdb2, c2: 0x7a6a55, c3: 0x302822, engine: 'twin', len: 6.2, rad: 0.62, spacing: 4.2, intake: 'ring', fins: 2, cockpit: 'tub', binder: 0xff6fd8, flame: 0xffa040 },
  },
  {
    id: 'mirage', name: 'Mirage',
    desc: 'Une maniabilité de rêve pour se faufiler dans les canyons étroits.',
    base: { accel: 6, topSpeed: 5, handling: 9, braking: 4, armor: 4 },
    look: { c1: 0x6b3fa0, c2: 0xf0c75a, c3: 0x2a1f3a, engine: 'tapered', len: 5.0, rad: 0.75, spacing: 3.6, intake: 'split', fins: 2, cockpit: 'capsule', binder: 0xd38bff, flame: 0xff8ad8 },
  },
  {
    id: 'bantha', name: 'Bantha Express',
    desc: 'Robuste et prévisible, avec d\'excellents aérofreins.',
    base: { accel: 4, topSpeed: 6, handling: 4, braking: 7, armor: 7 },
    look: { c1: 0x7a4a2a, c2: 0xe6c34a, c3: 0x3a2a1c, engine: 'box', len: 5.8, rad: 1.0, spacing: 4.2, intake: 'ring', fins: 2, cockpit: 'tub', binder: 0xffd36f, flame: 0xffb050 },
  },
  {
    id: 'sirocco', name: 'Sirocco',
    desc: 'Vif et rapide, il pardonne peu les erreurs de trajectoire.',
    base: { accel: 7, topSpeed: 7, handling: 5, braking: 6, armor: 3 },
    look: { c1: 0x1f8f8a, c2: 0xf4f0e6, c3: 0x16302f, engine: 'round', len: 5.4, rad: 0.78, spacing: 3.6, intake: 'split', fins: 3, cockpit: 'capsule', binder: 0x6fffe0, flame: 0x8affea },
  },
];

export const AI_PILOTS = [
  'Rekko Valt', 'Ma\'Dura Fenn', 'Gorvak le Rouge', 'Silla Tremm',
  'Zuu Okkan', 'Ven Darro', 'Pax Kerrig', 'Oona Vash',
];

export function finalStats(base, tuning) {
  const s = {};
  for (const k of STAT_KEYS) s[k] = clamp(base[k] + (tuning ? tuning[k] || 0 : 0), 1, 10);
  return s;
}

export function tuningPointsLeft(tuning) {
  let used = 0;
  for (const k of STAT_KEYS) used += tuning[k] || 0;
  return TUNING_POINTS - used;
}

// Conversion caractéristiques (1..10) -> paramètres physiques (unités : mètres, secondes).
export function physicsFromStats(s) {
  const n = (v) => (v - 1) / 9;
  return {
    accel: lerp(24, 58, n(s.accel)),          // m/s²
    maxSpeed: lerp(150, 232, n(s.topSpeed)),  // m/s (540 à 835 km/h)
    turnRate: lerp(0.95, 1.75, n(s.handling)),// rad/s
    grip: lerp(2.2, 5.2, n(s.handling)),      // adhérence latérale
    latAccel: lerp(120, 205, n(s.handling)),  // accélération latérale max (IA)
    brake: lerp(45, 125, n(s.braking)),       // m/s²
    armor: lerp(1.35, 0.42, n(s.armor)),      // multiplicateur de dégâts
    mass: lerp(0.85, 1.6, n(s.armor)),
  };
}

export const DIFFICULTY = {
  facile: { label: 'Facile', ai: 0.86, raiderCooldown: 1.6, raiderSpread: 1.6, rubber: 0.6 },
  normal: { label: 'Normal', ai: 0.95, raiderCooldown: 1.0, raiderSpread: 1.0, rubber: 0.35 },
  pilote: { label: 'Pilote', ai: 1.02, raiderCooldown: 0.75, raiderSpread: 0.75, rubber: 0.15 },
};

export const BREAKDOWNS = {
  faible: { label: 'Faibles', rate: 0.5 },
  normale: { label: 'Normales', rate: 1.0 },
  elevee: { label: 'Fréquentes', rate: 1.8 },
};

export const RAIDERS = {
  off: { label: 'Absents', active: false, rate: 0 },
  normaux: { label: 'Normaux', active: true, rate: 1.0 },
  agressifs: { label: 'Agressifs', active: true, rate: 1.7 },
};

export const DEFAULT_SETTINGS = {
  podId: 'comete',
  trackId: 'tatooine',
  tuning: { accel: 0, topSpeed: 0, handling: 0, braking: 0, armor: 0 },
  laps: 3,
  opponents: 5,
  difficulty: 'normal',
  breakdowns: 'normale',
  raiders: 'normaux',
  camera: 'chase',
  vignette: true,
  vrControl: 'standard',
  vrRate: 72,
  volume: 0.8,
  touch: 'auto',          // commandes tactiles : auto (téléphone/tablette), on, off
  touchSteer: 'joystick', // joystick | tilt (inclinaison du téléphone)
  autoThrottle: false,    // accélération automatique (le pouce droit reste libre)
  quality: 'auto',        // auto | basse | moyenne | haute
};

const STORAGE_KEY = 'podracevr-settings-v1';
export function loadSettings() {
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch (e) { s = null; }
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (s && typeof s === 'object') {
    for (const k of Object.keys(out)) if (k in s) out[k] = s[k];
    out.tuning = { ...DEFAULT_SETTINGS.tuning, ...(s.tuning || {}) };
  }
  if (!PODS.find((p) => p.id === out.podId)) out.podId = DEFAULT_SETTINGS.podId;
  return out;
}
export function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) { /* stockage indisponible */ }
}
