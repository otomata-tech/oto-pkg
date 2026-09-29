# Epic E11 — Retours de la démo

| Champ | Valeur |
|-------|--------|
| **ID** | E11 |
| **Priorité** | P1 (retours du 2026-09-29 sur l'hôte de démo, fiche D132) |
| **Statut** | 🟢 Ready |
| **Parcours** | 4.2 Faire ; 4.4 Concevoir et mettre à jour ; tableaux et file de travail |
| **PRD Refs** | FR-TASK-02, FR-CONC-04, FR-CONC-12 ; tableaux (`docs/prd.md` § Tableau) |
| **Référence UI** | N/A : style du paquet (`ui/tableau/`, `ui/contexte/`, `ui/noeud/editeur/`, `ui/public/`) |
| **Dépendances** | E10 (S05 dépend d'E10-S01, S06 d'E10-S04 et E10-S06, S07 passe après toutes) |

## Objectif

Deux sources de retours, relevées le 2026-09-29 :

- le rapport de tests d'un assistant sur l'organisation Démo (une todo multi-projets bâtie par
  MCP, tickets FB-0001 à FB-0010) ;
- les retours du responsable d'Oto sur les écrans de l'hôte de démo.

Un assistant ne doit plus écraser une ligne sans le savoir, ni tourner en boucle sur des ctx
périmés, ni rester bloqué sur un brouillon. Une personne doit comprendre ce qu'elle lit à l'écran.

## Périmètre

### IN
- Tableaux côté assistant (S01) : `create_only`, colonne obligatoire stricte, recherche par mots,
  message de `limit`, révision dans `table.schema`, auteur rendu, décision de revue par l'agent
  en option par tableau, preuve en option par tableau (FB-0001, FB-0002, FB-0003, FB-0009,
  FB-0010 parties 1 et 2 ; fiche D133). Leurs réglages à l'écran (S08).
- Brouillons et suppression depuis un assistant (S02) : abandon d'un brouillon, corbeille,
  suppression de lignes, avec confirmation en deux temps (FB-0007, FB-0010 partie 3).
- Contexte et conversations (S03) : invalidation ciblée des ctx, plus de taille par bloc sous un
  plafond de 35 000 caractères et coupe dite, `move_block` dans une section, `append` qui prolonge
  une liste (FB-0005, FB-0006, FB-0008 ; fiche D134).
- Routage des procédures (S04), en service et en SQL, sans embeddings : sans étapes servies,
  l'assistant propose toujours jusqu'à trois procédures proches (FB-0004).
- Écrans (S05) : détail des cellules au survol, lignes à revoir visibles, Contexte sans ligne
  « Organisation », ancre des nouveautés, télécharger en CSV ou `.md` à côté de « Partager »,
  y compris pour le visiteur d'une page publique.
- Éditeur (S06) : une puce par élément de liste, modifier un lien dans un panneau.
- Branchement (S09) : « Brancher mon Claude, ChatGPT ou Mistral », un guide par onglet d'assistant.
- Rail (S10) : espace Privé dès la première connexion, équipes où l'on est membre, créateur
  inscrit comme responsable, vue « Contexte » dans le menu engrenage (`/context`), écrans allégés.
- Publication directe (S02) et écrans d'un contenu (S05) : fiches D135, D136.
- Adresses en anglais (S07) : routes, paramètres, ancres et préfixe d'API.

### OUT
- Historique des valeurs d'une cellule : une table de versions de lignes, plus tard.
- Clé auto-incrémentée d'un tableau (FB-0001 : `create_only` seul, fiche D132).
- Routage par embeddings (ADR-003 tient).
- Renommer les chemins des nœuds (`contexte`, `private/<handle>/contexte`) : ce sont des données.
- Garder le lien rendu pendant l'édition d'un bloc : cela demanderait un éditeur riche.

## Stories

| ID | Titre | Estimation | Statut | Dépendances |
|----|-------|-----------|--------|-------------|
| E11-S01 | Tableaux : créer sans écraser, colonne obligatoire stricte, recherche par mots, révision et auteur, revue décidée par l'agent, preuve par tableau, réglages à l'écran | L | 🟢 Ready | E10-S01 ; lot g après E11-S02 |
| E11-S02 | Publication directe, brouillons refusés, corbeille et suppression de lignes depuis un assistant | L | 🟢 Ready (Ⓜ, amende ADR-011 § 3 et le défaut de `publish`) | E11-S01, E11-S03 |
| E11-S03 | Contexte et conversations : invalidation ciblée des ctx, plafond seul et coupe dite, déplacer et compléter une liste | L | 🟢 Ready (Ⓜ, amende ADR-002 § 2 et § 7) | E11-S04 ; lot c : E10-S04 |
| E11-S04 | Routage des procédures : trois candidates proposées, égalités, formulations, fautes de frappe (routage et `find`) | L | 🔵 In progress (Ⓜ, amende ADR-003 § 2) | — |
| E11-S05 | Écrans d'un contenu : encarts repliables à droite, cellules, lignes à revoir, télécharger, résumé, page et tableau vides | L | 🟢 Ready | E10-S01, E10-S06, E11-S01, E11-S02, E11-S10 |
| E11-S06 | Éditeur : une puce par élément de liste, modifier un lien dans un panneau | M | 🟢 Ready | E10-S04, E10-S06 |
| E11-S07 | Adresses en anglais : routes, paramètres, ancres, préfixe d'API | L | 🟢 Ready (cassante) | toutes les autres stories E10 et E11 |
| E11-S09 | Brancher mon Claude, ChatGPT ou Mistral : un guide par onglet, grande fenêtre et `/connect` | M | 🔵 In progress | — |
| E11-S10 | Rail : espace Privé dès la première connexion, équipes où l'on est membre, créateur inscrit, vue Contexte dans le menu | L | 🟢 Ready (Ⓜ) | E11-S09, E10-S01 |
| E11-S14 | Harnais de test sans Supabase : 16 suites sur Postgres nu, 7 gardent le projet (décision du 2026-09-29) | L | 🔵 In progress (lot a) | lots b et c : E11-S03, E11-S10, E10-S02, E10-S04 |

Les identifiants E11-S08, S11, S12 et S13 ont été fondus le 2026-09-29 dans S01 (lot g), S10
(lots a à c), S05 (lots e à h) et S02 (lots a à c) : moins de stories, plus longues.

Livraison avec l'epic E10 dans une seule version du paquet, 1.1.0, avec un seul fichier de
migration `<horodatage>_v1_1_0.sql` (fiches D131, D145, D124) : `.method/sprint/status.md § Contenus riches et retours de la démo`.
