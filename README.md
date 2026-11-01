# PodRace VR

Course de podracers en 3D, style cartoon (cel shading), jouable dans le navigateur (ordinateur, **téléphone, tablette**)
**et en réalité virtuelle sur Meta Quest 3** (WebXR, directement dans le navigateur du casque).
HTML + CSS + JavaScript, sans étape de build.

> Jeu de fan non officiel. Pilotes, podracers et circuit sont des créations originales inspirées de l'univers.

## Contenu

- **16 circuits sur 16 planètes**, à choisir dans le hangar (bouton **CHOISIR LE CIRCUIT**). Chaque circuit a son tracé,
  ses canyons étroits avec tireurs embusqués, ses arches, son ciel, sa lumière, son décor et sa météo :

| Planète | Circuit | Ambiance |
|---|---|---|
| Tatooine | Boucle des Dunes | dunes, deux soleils, canyons des pillards, arches d'argile, tribunes et dômes |
| Hoth | Échine de Glace | neige, gorges de glace bleutée, pics de glace, blizzard |
| Endor | Sentiers des Séquoias | forêt de séquoias géants, géante gazeuse dans le ciel, pollen |
| Mustafar | Rivières de Lave | basalte noir, lacs de lave, falaises veinées de lave lumineuse, cendres et braises |
| Naboo | Prairies des Lacs | collines vertes, lacs, palais à coupoles, tracé vallonné |
| Coruscant | Couloirs Aériens | piste suspendue entre les gratte-ciel éclairés, barrières lumineuses, trafic aérien |
| Kamino | Océan des Tempêtes | piste sur pilotis au-dessus de l'océan, cités sur pilotis, pluie battante |
| Dagobah | Marais Brumeux | brume très dense, arbres noueux, eaux croupies, lucioles |
| Geonosis | Flèches Rouges | désert rouge, flèches rocheuses, trois canyons, planète à anneau |
| Bespin | Mer de Nuages | piste flottante au coucher du soleil, mer de nuages, tours de la cité, trafic |
| Kashyyyk | Forêt des Géants | arbres de 100 à 250 m, lagons turquoise |
| Jakku | Cimetière de Vaisseaux | désert pâle, épaves géantes, arches de carcasses métalliques |
| Crait | Plaine de Sel | croûte de sel blanc sur sol rouge, sillons écarlates, cristaux |
| Scarif | Lagons Tropicaux | îlots de sable, palmiers, lagons, arches marines |
| Yavin 4 | Temples de la Jungle | jungle, temples à degrés, géante gazeuse orange, lucioles |
| Felucia | Jardins Fongiques | champignons géants multicolores, roches violettes, spores lumineuses |

- Les tracés des 15 nouvelles planètes sont générés à partir de quelques paramètres (forme, longueur, relief,
  position des canyons) et validés automatiquement : pas de chevauchement, départ dégagé, virages praticables.
- **Sensation de vitesse** : pods à 550–850 km/h au ras du sol, lignes de vitesse, poussière, balises et mâts qui défilent,
  parois de canyon toutes proches, vent et moteurs synthétisés (effet Doppler sur les concurrents), « whoosh » sous les arches,
  champ de vision qui s'élargit et vibrations à l'écran, vibrations du cockpit en VR.
- **Flou de mouvement** (option *Flou de vitesse* : Aucun / Léger / Normal / Fort) : flou radial centré sur le point vers
  lequel on fonce, nul au centre et de plus en plus fort vers les bords et avec la vitesse (encore plus en boost).
  Votre pod et le cockpit restent nets : seul le décor qui défile est flouté. Il est désactivé en VR, où un flou plein
  écran provoque de l'inconfort et coûte cher ; le réglage allonge en revanche les traînées de vitesse, aussi en VR.
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

### Sur téléphone ou tablette

Ouvrez l'adresse du jeu (par exemple celle de GitHub Pages, voir ci-dessous) dans Chrome ou Safari.
Les commandes tactiles apparaissent automatiquement sur les écrans tactiles (option **Tactile** : Auto / Activé / Désactivé).
Au lancement de la course, le jeu passe en plein écran et en paysage quand le navigateur le permet (Android ;
sur iPhone, tournez simplement le téléphone).

- **Direction** : *Joystick* (glisser le pouce gauche à gauche / à droite, le joystick apparaît sous le pouce)
  ou *Inclinaison* (tourner le téléphone comme un volant ; sur iPhone, autoriser l'accès aux capteurs de mouvement).
- **GAZ**, **FREIN**, **BOOST**, **🔧 RÉPARER** : boutons à maintenir. On peut glisser le pouce d'un bouton à l'autre
  (de GAZ vers FREIN) sans le lever.
- Boutons rapides en haut : **⟳🔧** système à réparer, **↺** se replacer sur la piste, **🎥** caméra, **⏸** pause.
- Option **Accélérateur automatique** : le pod accélère tout seul (freiner coupe les gaz), pratique en mode inclinaison
  ou pour jouer d'une main.
- Le téléphone vibre lors des chocs et des tirs (Android).
- Option **Qualité** (Auto / Basse / Moyenne / Haute) : résolution de rendu et densité des effets.
  *Auto* choisit *Moyenne* sur téléphone ; passez en *Basse* si le jeu saccade.

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

Sur écran tactile, voir la section *Sur téléphone ou tablette* ci-dessus.

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
js/tracks/tatooine.js circuit de Tatooine (points de contrôle dessinés à la main)
js/tracks/planets.js  les 15 autres planètes (paramètres du tracé + thème)
js/tracks/common.js   thème par défaut, fusion des thèmes, générateur de tracés, arches et rochers automatiques
js/tracks/index.js    catalogue des circuits et aperçus pour le menu
js/materials.js       matériaux calculés dans le shader : strates rocheuses (veines de lave), façades à fenêtres
js/props.js           décors procéduraux (arbres, champignons, flèches, cristaux, immeubles, épaves, nuages...)
js/weather.js         météo autour du pilote et trafic aérien
js/track.js           spline, géométrie de la piste, falaises, arches, requêtes de position sur la piste
js/environment.js     ciel aux deux soleils, dunes, mesas, montagnes, rochers, tribunes et portique de départ
js/podModel.js        modèles procéduraux des podracers et leur animation
js/racer.js           physique du joueur, pilotage de l'IA, collisions avec le décor
js/damage.js          systèmes, avaries, incendies, réparation
js/raiders.js         pillards et tirs de blaster
js/race.js            grille, compte à rebours, tours, collisions entre pods, classement
js/effects.js         particules, lignes de vitesse
js/audio.js           sons synthétisés (WebAudio)
js/input.js           clavier, manette, écran tactile, manettes Quest
js/touch.js           commandes tactiles (joystick flottant, inclinaison, boutons)
js/hud.js             HUD écran et HUD du cockpit (VR)
js/ui.js              hangar : choix du pod, réglages, options
js/config.js          podracers, pilotes, équilibrage, réglages par défaut
```

Pour ajouter un circuit, ajoutez une entrée dans `js/tracks/planets.js` : un `layout` (graine, rayon, harmoniques
de forme, relief, indices des canyons, largeurs) et un `theme` qui ne redéfinit que ce qui change par rapport au
thème par défaut (`js/tracks/common.js`) : ciel, soleils, planète dans le ciel, sol, eau ou lave, piste suspendue,
barrières, strates des falaises, façades, décors, météo, trafic, couleurs des tireurs. On peut aussi donner
directement des `points` dessinés à la main, comme pour Tatooine.

Performances visées pour le Quest 3 : moins de 150 appels de rendu par œil et 180 000 à 450 000 triangles selon le
circuit (densité du décor réduite en qualité Moyenne/Basse), pas d'ombres dynamiques ni de post-traitement
(l'aspect cartoon vient de `MeshToonMaterial` et de contours par coque inversée).
