# HoverRush VR

Course de glisseurs en 3D, style cartoon (cel shading), jouable dans le navigateur (ordinateur, **téléphone, tablette**)
**et en réalité virtuelle sur Meta Quest 3** (WebXR, directement dans le navigateur du casque).
HTML + CSS + JavaScript, sans étape de build.

> Jeu indépendant : les glisseurs, les pilotes, les planètes et les circuits sont des créations originales, sans lien avec une œuvre existante.

## Contenu

- **16 circuits sur 16 planètes**, à choisir dans le hangar (bouton **CHOISIR LE CIRCUIT**). Chaque circuit a son
  style de tracé (**rapide** : longues courbes et lignes droites ; **technique** : virages serrés enchaînés, piste
  étroite ; **mixte**), ses mécaniques et son ambiance :

| Planète | Circuit | Style | Mécaniques |
|---|---|---|---|
| Sablor | Boucle des Dunes | mixte | le classique : canyons des pillards, arches de pierre et d'argile, rochers |
| Glacia | Échine de Glace | mixte | grotte de glace souterraine, 2 sauts au-dessus des crevasses, courte gorge gardée |
| Sylvara | Sentiers des Séquoias | technique | piste étroite entre les séquoias, passerelle sur un ravin, tronc creux, 2 sauts |
| Pyrax | Rivières de Lave | mixte | 2 ponts sur la lave, saut au-dessus d'un fleuve de lave, tube de lave, jets de flammes et geysers |
| Verdalis | Prairies des Lacs | rapide | 2 longs ponts sur les lacs, tunnel sous l'eau |
| Urbion | Couloirs Aériens | technique | circuit urbain à angles droits, 3 tunnels à travers les tours, toits gardés, trafic |
| Thalassa | Océan des Tempêtes | rapide | lignes droites sur pilotis, 2 sauts entre plateformes au-dessus de l'océan, passage dans la cité |
| Brumel | Marais Brumeux | technique | le plus sinueux : brume dense, 3 ponts bas sur le marais, racine-tremplin |
| Rubira | Flèches Rouges | technique | 3 canyons infestés de pillards, 2 sauts au-dessus des gouffres, fonderie en feu |
| Nimbos | Mer de Nuages | rapide | 3 sauts entre plateformes flottantes au-dessus des nuages, 2 traversées de la cité |
| Arborea | Forêt des Géants | technique | passerelles de bois arquées au-dessus des lagons, tronc creux, saut |
| Rouillon | Cimetière de Vaisseaux | rapide | 2 traversées de coques d'épaves, épaves en feu, saut |
| Salinas | Plaine de Sel | rapide | le plus rapide : piste très large, 2 sauts au-dessus des crevasses, grotte de cristaux rouges |
| Lagonia | Lagons Tropicaux | mixte | d'île en île : 3 ponts au-dessus des lagons, 2 sauts au-dessus de l'eau, falaise gardée |
| Zaruta | Temples de la Jungle | technique | souterrain sous un temple éclairé aux torches, pont sur la rivière, 2 sauts, ruines gardées |
| Myceli | Jardins Fongiques | technique | geysers et jets de spores toxiques, tunnel organique lumineux, 2 sauts |

- **Mécaniques de parcours** :
  - **Tunnels et souterrains** : grottes de glace, tubes de lave, tunnel sous un lac, coques d'épaves, troncs creux,
    passages à travers les immeubles. Rangées de lumières qui défilent, son des moteurs qui résonne, pas de météo dedans.
  - **Sauts** : tremplin puis trou au-dessus du vide, de l'eau ou de la lave. Il faut arriver assez vite (environ
    150 km/h minimum), sinon c'est la chute : le glisseur est repêché après le trou, avec le temps perdu.
  - **Ponts** au-dessus de l'eau, des marais, de la lave ou des ravins, avec barrières.
  - **Jets de flammes** (feu, spores toxiques) : latéraux ou en geysers, avec une alerte lumineuse avant chaque
    salve. Ils brûlent le glisseur et peuvent enflammer un moteur.
  - **Canyons avec tireurs embusqués** : seulement sur 7 circuits (Sablor, Glacia, Pyrax, Urbion, Rubira,
    Lagonia, Zaruta).
- Les tracés générés sont validés automatiquement : pas de chevauchement, départ dégagé, virages praticables,
  sauts placés sur des portions assez droites.
- **Sensation de vitesse** : glisseurs à 550–850 km/h au ras du sol, lignes de vitesse, poussière, balises et mâts qui défilent,
  parois de canyon toutes proches, vent et moteurs synthétisés (effet Doppler sur les concurrents), « whoosh » sous les arches,
  champ de vision qui s'élargit et vibrations à l'écran, vibrations du cockpit en VR.
- **Flou de mouvement** (option *Flou de vitesse* : Aucun / Léger / Normal / Fort) : flou radial centré sur le point vers
  lequel on fonce, nul au centre et de plus en plus fort vers les bords et avec la vitesse (encore plus en boost).
  Votre glisseur et le cockpit restent nets : seul le décor qui défile est flouté. Il est désactivé en VR, où un flou plein
  écran provoque de l'inconfort et coûte cher ; le réglage allonge en revanche les traînées de vitesse, aussi en VR.
- **8 glisseurs** aux formes et caractéristiques différentes ; jusqu'à 7 adversaires pilotés par l'IA.
- **Atelier de réglage** : accélération, vitesse max, maniabilité, freinage, robustesse (armure).
  3 points libres, et on peut baisser une caractéristique pour en renforcer une autre.
- **Dégâts** : chocs contre les parois, les piliers, les rochers et les autres glisseurs, tirs des **pillards**
  postés sur les crêtes. Les dégâts touchent le moteur gauche, le moteur droit, la direction et la coque.
  Un glisseur abîmé **accélère moins, tourne moins bien et plafonne en vitesse**. Un moteur plus faible que l'autre fait dériver le glisseur.
- **Avaries en course** : incendie moteur, direction bloquée (le glisseur tire d'un côté), injecteur encrassé, surchauffe due au boost.
- **Réparation pendant la course** : maintenir la touche de réparation ; le système le plus urgent est choisi
  automatiquement (on peut en changer). Pendant la réparation la poussée est limitée à 70 % et le boost est coupé.
  Coque à zéro : le glisseur explose et repart quelques secondes plus tard.
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
- Option **Accélérateur automatique** : le glisseur accélère tout seul (freiner coupe les gaz), pratique en mode inclinaison
  ou pour jouer d'une main.
- Le téléphone vibre lors des chocs et des tirs (Android).
- Option **Qualité** (Auto / Basse / Moyenne / Haute) : résolution de rendu et densité des effets.
  *Auto* choisit *Moyenne* sur téléphone ; passez en *Basse* si le jeu saccade.

### Sur Meta Quest 3

WebXR exige une page en **HTTPS** (ou `localhost`). Deux possibilités :

1. **GitHub Pages** : *Settings → Pages → Deploy from a branch*, choisir la branche et le dossier racine `/`.
   Ouvrir l'URL obtenue dans le navigateur du Quest, régler son glisseur puis appuyer sur **COURIR EN VR**.
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

Le mode **leviers** reproduit le pilotage d'un glisseur : chaque gâchette commande un réacteur, pousser davantage
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
js/tracks/sablor.js circuit de Sablor (points de contrôle dessinés à la main)
js/tracks/planets.js  les 15 autres planètes (paramètres du tracé + thème)
js/tracks/common.js   thème par défaut, fusion des thèmes, générateur de tracés, arches et rochers automatiques
js/tracks/index.js    catalogue des circuits et aperçus pour le menu
js/materials.js       matériaux calculés dans le shader : strates rocheuses (veines de lave), façades à fenêtres
js/props.js           décors procéduraux (arbres, champignons, flèches, cristaux, immeubles, épaves, nuages...)
js/weather.js         météo autour du pilote et trafic aérien
js/sections.js        géométrie des tunnels et souterrains (parois, lumières, nervures, collines, façades)
js/hazards.js         jets de flammes et geysers (cycle, collisions, évitement par l'IA)
js/postfx.js          flou de mouvement radial
js/track.js           spline, géométrie de la piste, falaises, arches, requêtes de position sur la piste
js/environment.js     ciel (soleils, étoiles, planète géante), dunes, mesas, montagnes, rochers, tribunes et portique de départ
js/podModel.js        modèles procéduraux des glisseurs et leur animation
js/racer.js           physique du joueur, pilotage de l'IA, collisions avec le décor
js/damage.js          systèmes, avaries, incendies, réparation
js/raiders.js         pillards et tirs
js/race.js            grille, compte à rebours, tours, collisions entre glisseurs, classement
js/effects.js         particules, lignes de vitesse
js/audio.js           sons synthétisés (WebAudio)
js/input.js           clavier, manette, écran tactile, manettes Quest
js/touch.js           commandes tactiles (joystick flottant, inclinaison, boutons)
js/hud.js             HUD écran et HUD du cockpit (VR)
js/ui.js              hangar : choix du glisseur, réglages, options
js/config.js          glisseurs, pilotes, équilibrage, réglages par défaut
```

Pour ajouter un circuit, ajoutez une entrée dans `js/tracks/planets.js` : un `layout` (graine, rayon, harmoniques
de forme, relief, indices des canyons, largeurs — ou des `corners` pour un tracé urbain à angles droits), des
`sections` (`tunnel`, `bridge`, `jump`, `flames`, positionnées par indice de point de contrôle ou par coordonnées)
et un `theme` qui ne redéfinit que ce qui change par rapport au
thème par défaut (`js/tracks/common.js`) : ciel, soleils, planète dans le ciel, sol, eau ou lave, piste suspendue,
barrières, strates des falaises, façades, décors, météo, trafic, couleurs des tireurs. On peut aussi donner
directement des `points` dessinés à la main, comme pour Sablor.

Performances visées pour le Quest 3 : moins de 150 appels de rendu par œil et 180 000 à 450 000 triangles selon le
circuit (densité du décor réduite en qualité Moyenne/Basse), pas d'ombres dynamiques ni de post-traitement
(l'aspect cartoon vient de `MeshToonMaterial` et de contours par coque inversée).
