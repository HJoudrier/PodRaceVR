# PodRace VR — Tatooine

Course de podracers en 3D, style cartoon (cel shading), jouable dans le navigateur **et en réalité virtuelle
sur Meta Quest 3** (WebXR, directement dans le navigateur du casque). HTML + CSS + JavaScript, sans étape de build.

> Jeu de fan non officiel. Pilotes, podracers et circuit sont des créations originales inspirées de l'univers.

## Contenu

- **Circuit de Tatooine** (~6,7 km) généré à partir d'une spline : ligne droite des tribunes, dunes,
  *Gorge des Pillards* et *Défilé du Krayt* (canyons étroits de 20 à 28 m), ponts naturels au-dessus des canyons,
  arches de pierre (dont une à pilier central), colonnade d'arches d'argile, plaine de rochers.
- **Sensation de vitesse** : pods à 550–850 km/h au ras du sol, lignes de vitesse, poussière, balises et mâts qui défilent,
  parois de canyon toutes proches, vent et moteurs synthétisés (effet Doppler sur les concurrents), « whoosh » sous les arches,
  champ de vision qui s'élargit et vibrations à l'écran, vibrations du cockpit en VR.
- **8 podracers** aux formes et caractéristiques différentes ; jusqu'à 7 adversaires pilotés par l'IA.
- **Atelier de réglage** : accélération, vitesse max, maniabilité, freinage, robustesse (armure).
  3 points libres, et on peut baisser une caractéristique pour en renforcer une autre.
- **Dégâts** : chocs contre les parois, les piliers, les rochers et les autres pods, tirs de blaster des **pillards**
  postés sur les crêtes. Les dégâts touchent le moteur gauche, le moteur droit, la direction et la coque.
  Un pod abîmé **accélère moins, tourne moins bien et plafonne en vitesse**. Un moteur plus faible que l'autre fait dériver le pod.
- **Avaries en course** : incendie moteur, direction bloquée (le pod tire d'un côté), injecteur encrassé, surchauffe due au boost.
- **Réparation pendant la course** : maintenir la touche de réparation ; le système le plus urgent est choisi
  automatiquement (on peut en changer). Pendant la réparation la poussée est limitée à 70 % et le boost est coupé.
  Coque à zéro : le pod explose et repart quelques secondes plus tard.
- **Nombre de tours réglable** (1 à 10), difficulté, fréquence des avaries, agressivité des pillards.

## Lancer le jeu

Les modules ES nécessitent un serveur HTTP (ouvrir `index.html` directement ne fonctionne pas) :

```bash
python3 -m http.server 8000
```

puis ouvrir <http://localhost:8000>.

### Sur Meta Quest 3

WebXR exige une page en **HTTPS** (ou `localhost`). Deux possibilités :

1. **GitHub Pages** : *Settings → Pages → Deploy from a branch*, choisir la branche et le dossier racine `/`.
   Ouvrir l'URL obtenue dans le navigateur du Quest, régler son pod puis appuyer sur **COURIR EN VR**.
2. **En local, casque branché en USB** (mode développeur activé) :

```bash
adb reverse tcp:8000 tcp:8000
```

puis ouvrir `http://localhost:8000` dans le navigateur du casque.

La course se joue **assis**, dans le cockpit : les réacteurs sont devant vous, le tableau de bord affiche vitesse,
position, carte et état des systèmes. Maintenir le bouton Meta recentre la vue.

## Commandes

| Action | Clavier | Manette | Quest 3 (standard) | Quest 3 (leviers) |
|---|---|---|---|---|
| Accélérer | ↑ / W / Z | Gâchette droite | Gâchette droite | Les deux gâchettes |
| Freiner / reculer | ↓ / S | Gâchette gauche | Gâchette gauche | Poignées |
| Diriger | ← → / A D / Q | Stick gauche | Stick | Différence entre les gâchettes (+ stick) |
| Boost | Espace / Maj | A / RB | A | A |
| Réparer (maintenir) | R | X | X ou poignées | X |
| Système à réparer | Tab / E | Y / LB | Y | Y |
| Caméra poursuite / cockpit | C | B | — | — |
| Se replacer sur la piste | T / Retour arrière | Select / clic stick | Clic d'un stick | Clic d'un stick |
| Pause | Échap / P | Start | B | B |

Le mode **leviers** reproduit le pilotage d'un podracer : chaque gâchette commande un réacteur, pousser davantage
le réacteur gauche fait tourner à droite et inversement.

## Confort en VR

- Caméra toujours à l'horizontale (aucun roulis ni tangage imposé), seul le décor défile.
- Vignette de confort optionnelle qui resserre le champ de vision dans les virages serrés et les frottements.
- Fréquence d'affichage réglable (72 / 90 / 120 Hz), rendu fovéal fixe activé.

## Architecture

```
index.html            interface (hangar, HUD, pause, résultats)
css/style.css         style cartoon de l'interface
lib/                  three.js r170 (MIT) embarqué, fonctionne hors ligne
js/main.js            rendu, boucle de jeu, caméras, menus, session WebXR
js/tracks/tatooine.js définition du circuit (points de contrôle, largeurs, falaises, arches, rochers, couleurs)
js/track.js           spline, géométrie de la piste, falaises, arches, requêtes de position sur la piste
js/environment.js     ciel aux deux soleils, dunes, mesas, montagnes, rochers, tribunes et portique de départ
js/podModel.js        modèles procéduraux des podracers et leur animation
js/racer.js           physique du joueur, pilotage de l'IA, collisions avec le décor
js/damage.js          systèmes, avaries, incendies, réparation
js/raiders.js         pillards et tirs de blaster
js/race.js            grille, compte à rebours, tours, collisions entre pods, classement
js/effects.js         particules, lignes de vitesse
js/audio.js           sons synthétisés (WebAudio)
js/input.js           clavier, manette, manettes Quest
js/hud.js             HUD écran et HUD du cockpit (VR)
js/ui.js              hangar : choix du pod, réglages, options
js/config.js          podracers, pilotes, équilibrage, réglages par défaut
```

Pour ajouter un nouvel univers, il suffit de créer un fichier dans `js/tracks/` sur le modèle de `tatooine.js`
(points de contrôle `[x, y, z, largeur, hauteur des falaises]`, arches, rochers, palette de couleurs).

Performances visées pour le Quest 3 : une centaine d'appels de rendu par œil, ~300 000 triangles, pas d'ombres
dynamiques ni de post-traitement (l'aspect cartoon vient de `MeshToonMaterial` et de contours par coque inversée).
