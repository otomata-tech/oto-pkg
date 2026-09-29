# Epic E10 — Contenus riches : import, fichiers, images, HTML

| Champ | Valeur |
|-------|--------|
| **ID** | E10 |
| **Priorité** | P2 (demande de JB du 2026-09-28, non planifiée dans une vague) |
| **Statut** | 🟢 Ready (six stories relues le 2026-09-28, S03 et S05 fusionnées dans S02 le 2026-09-29, fiche D137 ; ADR-016, ADR-017 acceptés, ADR-018 proposé) |
| **Parcours** | 4.4 Concevoir et mettre à jour ; 4.2 Faire |
| **PRD Refs** | FR-CONC-07 à FR-CONC-11 |
| **Référence UI** | N/A : aucun écran équivalent dans `oto-frontend` ; style du paquet (`ui/noeud/`, `ui/coque/`) |
| **Dépendances** | E05-S11 (éditeur, rail), E07-S04 (tableau créé par `write`), E05-S10 (corbeille, partage public) |

## Objectif

Ce que JB et ses équipes produisent déjà hors de la plateforme doit y entrer en un geste, et
rester lisible par les assistants :

- du **markdown** (un texte copié de Claude, un fichier `.md`) devient une page, faite de vrais
  blocs ;
- un **CSV** devient un tableau typé, à l'écran comme par un assistant ;
- une **image** ou un **fichier** se dépose dans une page ; l'image s'y affiche, un fichier `html`,
  `md` ou `pdf` se voit dans un nouvel onglet, un HTML y étant exécuté isolé ;
- le markdown qu'écrit Claude (tableaux, séparateurs, listes imbriquées, replis, titres profonds,
  barré…) s'affiche dans une page sans balisage visible.

Le markdown et le CSV ne sont **pas** des types de contenu : ce sont des gestes d'import et
d'export vers les types existants (page, tableau). Quatre types de bloc s'ajoutent, par migration
additive (ADR-011 § 2) : `simple_table` (un tableau dans une page, distinct du nœud `table`),
`divider` et `toggle` (S04), et `file` (S02).

## Périmètre

### IN
- Coller et importer du markdown, exporter une page en `.md` ; importer un CSV en tableau, exporter
  un tableau en CSV ; fonction `table.import` derrière `call` (S01).
- Compatibilité markdown des pages : tableau simple, séparateur, repli, listes imbriquées, titres
  à cinq niveaux, marques en ligne (S04, mode strict) ; leur édition à l'écran (S06).
- Port de stockage S3 (ADR-016), téléversement d'images, bloc `file`, conversion d'un CSV joint en
  tableau ; « Voir » dans un nouvel onglet, HTML isolé (ADR-017) ; `read {file}` ; dépôt par lien
  à usage unique : Claude Code envoie un fichier, un `.md` ou un CSV par `curl`, sans le réécrire
  dans l'appel (S02, qui absorbe S03 et S05).

### OUT
- Extraction du texte d'un PDF ou d'un document bureautique pour `find` (plus tard).
- Aperçu en ligne des documents bureautiques.
- Téléversement d'octets par un outil MCP : les six outils ne transportent que du texte (ADR-009) ;
  un assistant dépose par lien (S02 lot f).
- Import de fichiers Excel (`.xlsx`) : un CSV exporté d'Excel suffit en première version.
- Dessin des diagrammes Mermaid et tons des encarts (écartés par JB le 2026-09-28, fiche D114).

## Stories

| ID | Titre | Estimation | Statut | Dépendances |
|----|-------|-----------|--------|-------------|
| E10-S04 | Compatibilité markdown des pages (mode strict) : tableau simple, séparateur, repli, listes imbriquées, titres, texte en ligne | L | 🟢 Ready (Ⓜ ; ordre 1) | E05-S11, M67 |
| E10-S01 | Markdown et CSV : coller, importer, exporter ; mode tolérant ; `table.import` ; conversion d'un tableau simple | L | 🟢 Ready (ordre 2) | E10-S04, E07-S04 |
| E10-S06 | Éditeur des blocs de page : choix du « + » et de `/`, tableau simple, séparateur, repli, listes, préfixes de titre | L | 🟢 Ready (ordre 3) | E10-S04, E10-S01 |
| E10-S02 | Fichiers : port S3, bloc `file`, images, « Voir » (HTML isolé, `.md` en blocs), `read {file}`, dépôt par lien à usage unique | XL | 🟢 Ready (Ⓜ ; ordre 4 ; bucket créé par JB avant la campagne visuelle) | ADR-016, ADR-017, ADR-018, E10-S04, E10-S01, E10-S06 |
| ~~E10-S03~~ | Fusionnée dans E10-S02 (fiche D137) | — | — | — |
| ~~E10-S05~~ | Fusionnée dans E10-S02 (fiche D137) | — | — | — |

Livraison avec l'epic E11 dans une seule version du paquet, 1.0.1, avec un seul fichier de
migration (fiches D131, D124) : `.method/sprint/status.md § Contenus riches et retours de la démo`.
