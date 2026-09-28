# ADR-008 — Les écrans viennent d'`oto-frontend`, copiés dans le paquet, sans routeur imposé, sur le jeu de tokens d'`oto-frontend`, sous une seule coque

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-23 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

`oto-frontend` (une SPA : React 19, Vite, TanStack Router et Query, Tailwind v4, design system
maison) couvre déjà 80 à 90 % de l'interface visée : navigateur d'arbre, éditeur de page par
blocs, grille de tableau avec filtres, agrégats et file de revue, procédures, éditeur de Contexte,
équipes et droits, journal. Le paquet doit s'installer dans un ERP qui a son propre routeur
(Next App Router) et son propre thème.

## Décision

1. **Les écrans du paquet (`ui/`) sont copiés d'`oto-frontend`**, fidèles à 90-95 % de
   l'original : le design system (CSS et composants, `ui/ds/`) et chaque écran sont recopiés puis
   adaptés au routeur, à la donnée et aux icônes. Agents, runs, projets et pages héritées ne sont pas
   repris ; l'accueil n'a ni agents ni connecteurs ; l'écran Connecteurs se refait sur notre modèle
   (V2). Méthode : `.method/conventions/portage-ecrans.md`.
2. **Sans routeur imposé** : un écran reçoit la navigation de l'application hôte (liens,
   `onNavigate`, paramètres) et n'importe ni TanStack Router ni `next/navigation` ; l'hôte monte
   l'écran dans sa route et lui passe son rafraîchissement.
3. **Sur le jeu de tokens d'`oto-frontend`** : le contrat `.oto` et ses huit thèmes, portés à
   l'identique dans `ui/styles/oto.css`, s'appliquent sous une racine `CoquilleOto` que l'hôte pose
   une fois, au thème de l'organisation. Classes sémantiques du jeu (`bg-island`, `text-ink`…) ;
   aucune couleur numérotée, aucun token de l'hôte absent du jeu (test + `check:framework`). Le
   client choisit l'un des huit thèmes, avec son logo et son nom affiché ; la favicon prend la
   couleur du thème ; la nuit suit la classe `.dark` de l'hôte.
4. `ui/` **n'importe jamais** `server/`, `migrations/` ni un client de base de données : il parle
   à `api/` par HTTP, même origine, avec la session de l'utilisateur (FR-INST-03, lint + test).
5. Les mêmes composants serviront plus tard aux widgets dans la conversation ; texte seul pour
   l'instant (ADR-009).
6. **Une copie, pas un import** : aucune dépendance au dépôt `oto-frontend`. Un écran porté ne
   change que le routeur, la donnée et les icônes.
7. **Une seule coque** : le rail d'`oto-frontend`, porté dans `ui/`, que l'hôte monte une fois dans
   son layout. L'hôte ne pose aucune autre navigation ; tout nœud de l'arbre (page, tableau,
   procédure, Contexte) s'ouvre à la même adresse de nœud, sans page de liste par genre. Un ERP hôte
   choisit parmi trois niveaux, tous exportés par `ui/` : la coque entière pour sa section
   plateforme ; les morceaux du rail (sections de l'arbre, recherche, menus) dans sa propre coque,
   sans second rail ; ou un écran seul dans l'une de ses pages, comme un tableau dans une fiche
   client. Dans tous les cas, une seule coque est visible.

## Conséquences

### Positives
- Reprise de l'essentiel de l'interface, déjà sur Tailwind v4 et un design system éprouvé.
- Un écran s'embarque dans une page de l'ERP (vue d'un tableau dans une fiche client).

### Négatives
- Le design system d'`oto-frontend` entre dans le paquet, CSS et composants : plus de volume, en
  échange d'une copie fidèle.
- Deux jeux de tokens dans une application hôte qui a le sien : celui de l'hôte pour ses propres
  pages, celui d'Oto pour les écrans du paquet. Un ERP hôte importe
  `@otomata_tech/oto_platform/ui/styles.css` et monte les écrans sous `CoquilleOto`.
- Les valeurs du jeu se vérifient dans `oto-frontend` (`verify-contrast.mjs`) : un thème nouveau
  s'y vérifie d'abord. Deux écarts de contraste du design system porté restent tels quels, par
  fidélité : le contour des champs contre l'îlot et le halo d'un champ refusé et focalisé.

### Neutres
- Un paquet de composants commun à `oto-frontend` et au paquet reste possible ; il remplacerait la
  copie sans changer les écrans.

## Alternatives considérées

### Les tokens de l'hôte, que la marque du client remplit
Un seul jeu dans le dépôt, mais les écrans portés perdent les surfaces (îlot, bureau, carte) et
les huit thèmes vérifiés d'`oto-frontend`. Écartée.

### Réécrire les écrans sur Shadcn/ui
Perte du travail d'`oto-frontend` et de ses écrans. Rejetée.

### Intégrer `oto-frontend` en SPA à côté de l'ERP
Deux applications, deux thèmes, intégration en cadre. Contredit ADR-001. Rejetée.

### Imposer TanStack Router dans le paquet
Incompatible avec l'App Router de l'hôte ; un écran ne peut pas porter son propre routeur.
Rejetée.
