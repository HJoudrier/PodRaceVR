// Circuit n°1 : désert de Tatooine.
// Chaque point de contrôle : [x, y, z, largeur de piste, hauteur des falaises (0 = désert ouvert)].
// Les arches et rochers sont positionnés par "at" = indice (fractionnaire) le long des points de contrôle.
export const TATOOINE = {
  id: 'tatooine',
  name: 'Boucle des Dunes',
  planet: 'Tatooine',
  style: 'mixte',
  sections: [],
  desc: 'Le grand classique : dunes brûlantes, canyons des pillards et arches d\'argile sous deux soleils.',
  points: [
    [0, 0, 0, 46, 0],          // 0  ligne de départ / arrivée
    [0, 0, 400, 46, 0],        // 1
    [40, 2, 800, 44, 0],       // 2
    [200, 6, 1150, 40, 0],     // 3
    [450, 8, 1350, 34, 0],     // 4  entrée du canyon
    [750, 4, 1400, 28, 38],    // 5  Gorge des Pillards
    [1000, 0, 1300, 24, 46],   // 6
    [1150, -4, 1150, 22, 52],  // 7
    [1200, -6, 950, 22, 54],   // 8
    [1350, -6, 800, 25, 46],   // 9
    [1500, -4, 750, 32, 30],   // 10 sortie du canyon
    [1750, -2, 800, 40, 0],    // 11 bassin des arches de pierre
    [1950, 0, 700, 42, 0],     // 12
    [2050, 2, 500, 40, 0],     // 13 colonnade d'argile
    [2050, 4, 200, 40, 0],     // 14
    [1950, 6, -50, 38, 0],     // 15
    [1750, 4, -150, 32, 0],    // 16 entrée du défilé
    [1550, 0, -100, 26, 40],   // 17 Défilé du Krayt
    [1350, -4, -200, 22, 50],  // 18
    [1200, -6, -350, 20, 56],  // 19
    [1000, -6, -350, 22, 50],  // 20
    [850, -2, -250, 28, 32],   // 21
    [650, 2, -350, 38, 0],     // 22 plaine des rochers
    [450, 4, -500, 44, 0],     // 23
    [200, 2, -500, 46, 0],     // 24
    [50, 0, -350, 46, 0],      // 25
    [0, 0, -150, 46, 0],       // 26
  ],
  arches: [
    { at: 2.45, type: 'stone', height: 30, thick: 4.5 },
    { at: 5.55, type: 'bridge' },
    { at: 6.35, type: 'bridge' },
    { at: 7.55, type: 'bridge' },
    { at: 8.65, type: 'bridge' },
    { at: 11.3, type: 'stone', height: 26, thick: 4 },
    { at: 12.05, type: 'split', height: 21, thick: 3.2 },
    { at: 13.2, type: 'clay', count: 6, spacing: 36, height: 17 },
    { at: 17.55, type: 'bridge' },
    { at: 18.6, type: 'bridge' },
    { at: 19.5, type: 'bridge' },
    { at: 20.45, type: 'bridge' },
    { at: 22.55, type: 'clay', count: 3, spacing: 55, height: 19 },
    { at: 24.4, type: 'stone', height: 24, thick: 4 },
  ],
  boulders: [
    { at: 1.6, lat: 11, r: 2.6 },
    { at: 14.4, lat: -9, r: 3.0 },
    { at: 15.3, lat: 8, r: 2.8 },
    { at: 22.75, lat: -10, r: 3.2 },
    { at: 23.45, lat: 9, r: 3.4 },
  ],
  // Le thème par défaut (common.js) est celui de Tatooine : seuls les dômes sont propres à ce circuit.
  theme: { domes: true },
};
