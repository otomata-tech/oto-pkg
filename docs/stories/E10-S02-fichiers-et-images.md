# Story E10-S02 — Fichiers et images : port S3, téléversement, bloc `file`

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E10 — Contenus riches |
| **Parcours** | 4.4 Concevoir et mettre à jour ; 4.2 Faire (l'assistant lit ce qu'une page joint) |
| **Statut** | 🟢 Ready |
| **Priorité** | Should |
| **Vague** | E10, après 1.0.0 |
| **Référence UI** | N/A : style du paquet. Bloc image existant (`ImageDuBloc`, `ui/noeud/rendu-des-blocs.tsx`) ; dialogue de dépôt d'E10-S01 (`ui/coque/import-de-fichier.tsx`, créé par E10-S01) ; dialogue natif du design system (`Dialog`, `ui/ds/react/dialog.tsx`) |
| **Conventions** | database, supabase, security, api, uploads, forms, portage, a11y, state, mcp, deploy, stack, testing |
| **Estimation** | L (trois lots, trois fusions : a port, table et routes M ; b écran M ; c assistant, partage, corbeille, duplication, transfert M) |
| **Dépend de** | ADR-016 ; E05-S10 ✅ (corbeille, partage public, duplication) ; E10-S04 (mêmes fichiers de types de bloc) ; E10-S01 (`import-de-fichier.tsx`, dialogue d'import CSV d'AC-b5) ; E10-S06 (choix du « + » et de `/`, groupe « Insérer »). Ordre commun : E10-S04, E10-S01, E10-S06, E10-S02, E10-S03, E10-S05 |
| **Porteuse de migration** | **Oui** (Ⓜ) : table `platform.files`, type de bloc `file`, `block_search_text`, `duplicate_subtree`, lecture publique d'un fichier |

## Contexte

Aucun fichier ne peut être déposé aujourd'hui. Le bloc `image` n'accepte qu'une adresse `https`
externe (`src` ≤ 2 000 caractères, `IMAGE_SRC_MAX`). L'éditeur ne propose pas de l'insérer :
`rg -n '"image"' packages/plateforme/ui/noeud/editeur` ne trouve que `modele.ts` l. 155, en lecture.
JB a choisi le 2026-09-28 un port S3 générique (fiche D111, ADR-016).

**Refs :**
- PRD : FR-CONC-08
- Architecture : § 4 (`blocks`, `node_shares`), § 5 ; ADR-016 (tout), ADR-013 (partage),
  ADR-012 (ports), ADR-011 § 2 et § 5 (types de bloc, aller-retour), ADR-009 (texte seulement)
- Décisions : D111 (port S3), D113 (50 Mo, 10 Go), D116 (groupe « Insérer »), D118 (duplication,
  ouverte, sous l'option recommandée)
- `uploads-patterns.md` (toutes sections)

## Périmètre

### Dans cette story
- Le port `FileStore` (cinq opérations), son adaptateur S3 et son adaptateur en mémoire.
- La table `platform.files`, l'envoi en trois temps, la lecture par redirection.
- Le bloc `file`, l'image interne (`image.data.file_id`), leur rendu, leur édition, leur markdown.
- La lecture publique d'un fichier par le jeton d'un lien.
- La purge (envois abandonnés, corbeille), la duplication d'une page, le transfert d'une
  organisation.

### Hors périmètre
- Extraction du texte d'un PDF ou d'un document bureautique pour `find` : plus tard (epic E10, OUT).
- Aperçu en ligne des documents bureautiques : plus tard (epic E10, OUT).
- Envoi d'octets par un assistant : les six outils ne portent que du texte (ADR-009). Le dépôt
  par lien de Claude Code est E10-S05.
- Écran de quota : aucun (D113).
- Libérer le quota d'un fichier que plus aucun bloc ni aucune version ne cite : V2. Il vit
  jusqu'à la purge de son nœud (ADR-016 § 6).
- Analyse antivirus des fichiers déposés : V2 (canal ouvert, § Sécurité).
- Objets laissés dans un bucket réel par `pnpm test:cleanup` et `pnpm demo:seed`, qui suppriment
  des organisations en SQL : tâche de suite (nettoyage par préfixe `<org_id>/`). Les tests
  n'utilisent que l'adaptateur en mémoire.
- « Joindre le fichier » au dialogue d'import d'E10-S01 (annoncé par HN-E10S01-1) : non livré ici.
  L'import ne garde pas le fichier d'origine ; un fichier se joint par « Fichier » du « + ».
- Import de fichiers `.xlsx` : plus tard (epic E10, OUT).

## Critères d'acceptation

### Lot a — Port, table, routes

- [ ] **AC-a1 — Port.**
  **Given** le paquet monté par un hôte
  **When** le service a besoin du stockage
  **Then** `fileStore()` (`server/files/store.ts`) rend un `FileStore` à cinq opérations : URL
  présignée d'envoi, URL présignée de lecture, `head`, `copy` (côté bucket), suppression. Deux
  adaptateurs : S3 signé en SigV4 (`server/files/s3.ts`) et mémoire (`server/files/memory.ts`,
  tests).
  **And** sans l'une des cinq variables `PLATFORM_STORAGE_*`, `fileStore()` rend `null`. Tout
  `POST files` est alors refusé par `not_enabled`, avec un message qui nomme les cinq variables.
  `GET files` rend `{ enabled: false }`.
- [ ] **AC-a2 — Migration** (additive, `platform` seul, `pnpm check:migrations`) : voir
  § Migrations prévues.
  **Given** la migration appliquée
  **When** un bloc `file` est écrit avec `data` = `{file_id, name, size, mime}`
  **Then** `blocks_type_check` l'accepte, et `block_search_text` indexe `name`.
  Le texte alternatif d'une image est déjà indexé (`when 'image' then p_data ->> 'alt'`, ligne de
  base `20260928100000`) : inchangé.
- [ ] **AC-a3 — Demande d'envoi.**
  **Given** une personne connectée
  **When** elle envoie `POST /api/plateforme/files` avec `{node, name, mime, size}`
  (`fileRequestSchema`)
  **Then** le service purge d'abord les lignes `pending` de plus d'une heure de l'organisation
  (AC-a6). Il vérifie ensuite, dans cet ordre, et refuse au premier échec :
  1. le stockage configuré, sinon `not_enabled` ;
  2. l'écriture sur le nœud, sinon `forbidden` (message de `reservedTo`), ou `not_found` pour un
     nœud illisible ;
  3. le type admis (`FILE_TYPES`, `schemas/files.ts`), sinon `invalid_arguments`, avec la liste
     des extensions admises ;
  4. la taille, de 1 octet à 50 Mo (`FILE_MAX_BYTES` = 52 428 800), sinon `too_large` ;
  5. le quota : la somme des `size` des lignes `pending` et `ready` de l'organisation, plus
     `size`, ne dépasse pas 10 Go (`ORG_QUOTA_BYTES` = 10 737 418 240), sinon `too_large` avec
     `details.reason = "quota"`. Le calcul et l'insertion se font sous un verrou consultatif de
     l'organisation, dans la même transaction : deux demandes simultanées ne dépassent pas le quota.

  Le service crée la ligne `pending` et rend `{ id, upload: { url, headers } }`. L'URL d'envoi
  vaut 5 minutes. `content-length` et `content-type` sont signés dans l'URL (ADR-016 § 4).
- [ ] **AC-a4 — Confirmation.**
  **Given** une ligne `pending` créée par la même personne
  **When** elle envoie `POST /api/plateforme/files/<id>/complete`
  **Then** le service vérifie l'écriture sur le nœud, lit l'objet (`head`), et passe la ligne à
  `ready` si sa taille et son type sont ceux de la ligne.
  **And** un objet absent rend `conflict`. Une taille ou un type différent rend `conflict` ;
  l'objet et la ligne sont alors supprimés. Une ligne inconnue, déjà `ready` ou d'une autre
  personne rend `not_found`.
- [ ] **AC-a5 — Lecture.**
  **Given** une personne connectée qui lit le nœud d'un fichier `ready`
  **When** elle ouvre `GET /api/plateforme/files/<id>`
  **Then** la réponse est une redirection 302, avec `Cache-Control: private, no-store`, vers une
  URL présignée de 60 s. Cette URL fixe `response-content-type` (le `mime` de la ligne) et
  `response-content-disposition`. Ces valeurs ne sont jamais lues de l'objet.
  - `inline` pour une image hors `svg`.
  - `inline` pour un PDF demandé par `?disposition=inline` (« Aperçu », HN-E10S02-5).
  - `attachment; filename*=UTF-8''<nom>` pour tout le reste, `svg` compris.

  **And** un fichier d'une autre organisation, `pending`, inconnu, ou dont le nœud est illisible
  ou à la corbeille rend `not_found`, la même réponse. Sans session : 401 `forbidden` (H04).
- [ ] **AC-a6 — Purge des envois abandonnés.**
  **Given** une ligne `pending` de plus d'une heure
  **When** un `POST files` de la même organisation arrive, ou que la corbeille est purgée
  (`purgeTrash`)
  **Then** la ligne est supprimée, puis son objet après le commit. Un objet déjà absent n'est pas
  une erreur. Un échec du bucket est journalisé (`[platform] files: orphan <clé>`) sans faire
  échouer la requête.
- [ ] **AC-a7 — État du stockage.**
  **Given** une personne connectée
  **When** l'écran appelle `GET /api/plateforme/files`
  **Then** la réponse vaut `{ data: { enabled } }` (HN-E10S02-6).

### Lot b — Écran

- [ ] **AC-b1 — Image.**
  **Given** un rédacteur dans l'éditeur, stockage activé
  **When** il colle une image du presse-papiers, glisse un fichier image, ou choisit « Image » dans
  le groupe « Insérer » du « + » (E10-S06)
  **Then** un bloc local montre un aperçu (`URL.createObjectURL`, révoqué au démontage) et une
  progression (`XMLHttpRequest`, `upload.onprogress`).
  **And** après `complete`, et seulement alors, le bloc `image` avec `data.file_id` est écrit par
  `writeNode`. L'image servie remplace l'aperçu.
  **And** le texte alternatif se saisit dans le bloc (« Décrire l'image pour l'assistant »). Il
  est facultatif ; un signal « Sans description » reste visible tant qu'il est vide.
- [ ] **AC-b2 — Fichier.**
  **Given** un fichier d'un autre type admis, glissé ou choisi (« Fichier » dans « Insérer »)
  **When** l'envoi se termine
  **Then** un bloc `file` affiche une carte : icône du type, nom, taille lisible, « Télécharger ».
  **And** un PDF propose en plus « Aperçu », qui ouvre `…/files/<id>?disposition=inline` dans un
  nouvel onglet.
- [ ] **AC-b3 — Largeur et agrandissement.**
  **Given** une image dans une page
  **When** le rédacteur choisit « Petite », « Moyenne » ou « Pleine » (`data.width` : `small`,
  `medium`, `full` ; défaut `full`)
  **Then** la largeur est écrite et rendue.
  **And** en lecture, un clic ouvre l'image dans le dialogue natif du design system (`Dialog`).
  `Échap` le ferme et rend le focus à l'image.
- [ ] **AC-b4 — Limites et refus.**
  **Given** le choix d'un fichier
  **When** le sélecteur s'ouvre
  **Then** les types et la limite de 50 Mo sont affichés avant la sélection.
  **And** un refus du service s'affiche dans le bloc local, traduit par son code
  (`invalid_arguments`, `too_large`, quota, `forbidden`, `not_enabled`, `conflict`). Le bloc reste
  retirable. « Annuler » interrompt l'envoi (`AbortController`) et retire le bloc local.
  **And** un glisser qui porte des fichiers (`dataTransfer.types` contient `Files`) est un dépôt,
  jamais un déplacement de bloc (`useGlisser`).
- [ ] **AC-b5 — CSV joint.**
  **Given** un bloc `file` de type `csv`
  **When** un rédacteur choisit « Convertir en tableau »
  **Then** l'écran lit les octets par la route de lecture et ouvre le dialogue d'import d'E10-S01
  sur ce contenu. Le tableau est créé sous la page, sous les droits d'E10-S01 (D120), et un bloc
  `reference` vers lui est inséré après le bloc `file`.
- [ ] **AC-b6 — Fichiers désactivés.**
  **Given** `GET files` rend `enabled: false`
  **When** le rédacteur ouvre le « + » ou colle une image
  **Then** « Image » et « Fichier » n'apparaissent pas. Un collage d'image affiche « Les fichiers
  ne sont pas activés sur cette plateforme. »
  **And** les images `https` existantes s'affichent toujours.
- [ ] **AC-b7 — Fichier indisponible.**
  **Given** une ligne `ready` dont l'objet a disparu du bucket
  **When** le bloc se rend
  **Then** l'image (`onError`) ou la carte affiche « Fichier indisponible », sans casser la page.

### Lot c — Assistant, partage, corbeille, duplication, transfert

- [ ] **AC-c1 — `read`.**
  **Given** une page avec une image interne et un fichier
  **When** un assistant la lit par `read`
  **Then** l'image se rend `![<alt>](<origine>/api/plateforme/files/<id>)`, et le fichier
  `[<nom> (<taille>, <type>)](<origine>/api/plateforme/files/<id>)`. `<origine>` est celle de la
  requête MCP (`requestOrigin`, HN-E10S02-3). Le lien exige une session ; l'assistant lit le nom
  et le texte alternatif, jamais les octets (ADR-009).
  **And** `parseMarkdown` relit ces deux formes par le chemin `/api/plateforme/files/<uuid>`,
  quelle que soit l'origine (aller-retour, ADR-011 § 5).
- [ ] **AC-c2 — `write`.**
  **Given** un bloc `file` ou `image` avec `file_id`, écrit par `write` ou par l'écran
  **When** `writeNode` (`server/nodes/write.ts`) le reçoit
  **Then** le service relit la ligne avant la requête. `name`, `size` et `mime` du bloc `file`
  sont repris de la ligne, jamais du client.
  **And** un `file_id` inconnu, `pending` ou d'un autre nœud rend `invalid_arguments`
  (« File <id> is not attached to <chemin>: upload it to this page first. »).
- [ ] **AC-c3 — `find`.**
  **Given** un fichier publié
  **When** un assistant cherche son nom par `find`
  **Then** le bloc est trouvé. Le texte alternatif d'une image est déjà indexé (AC-a2).
- [ ] **AC-c4 — Partage public.**
  **Given** un nœud couvert par un lien actif, dont un bloc **publié** cite un fichier
  **When** un visiteur sans session ouvre
  `GET /api/plateforme/public/<jeton>/files/<id>` (extension d'`isPublicRoute`)
  **Then** il reçoit la même redirection qu'en AC-a5, avec `PUBLIC_HEADERS`. La décision vient de
  `platform.public_file_by_token` (`security definer`, sous `anon`), sous la règle de
  `public_node_by_token` : lien actif, nœud dans le périmètre, lisible par l'auteur du lien.
  **And** un fichier hors périmètre, cité seulement par un brouillon ou par une version ancienne,
  ou dont le jeton est inconnu ou désactivé rend `not_found`, la même réponse (ADR-016 § 7,
  ADR-013).
  **And** la page publique (`ui/public/page-publique.tsx`) donne aux blocs ces adresses par jeton.
- [ ] **AC-c5 — Corbeille.**
  **Given** un nœud à la corbeille depuis plus de 30 jours
  **When** `purgeTrash` le purge
  **Then** dans la même transaction, avant les nœuds, `purgeTrash` supprime les lignes `files` des
  nœuds purgés et récupère leurs clés (`returning`). Les objets sont supprimés après le commit,
  comme en AC-a6.
  **And** retirer un bloc ne supprime pas son fichier (ADR-016 § 6).
- [ ] **AC-c6 — Duplication** (HN-E10S02-2, fiche D118).
  **Given** une page dont les blocs citent des fichiers
  **When** une personne la duplique (`duplicateNode`, E05-S10)
  **Then** `duplicate_subtree` crée, pour chaque fichier d'un nœud copié, une ligne neuve `pending`
  sous le nœud copié. Il réécrit le `file_id` des blocs copiés et de l'instantané de
  `node_versions`, puis rend les paires (ancien, nouveau).
  **And** après le commit, le service copie chaque objet (`copy`) et passe sa ligne à `ready`. Une
  copie en échec laisse la ligne `pending`, purgée ensuite (AC-a6) ; le bloc affiche « Fichier
  indisponible » (AC-b7).
  **And** aucun fichier n'est cité par deux nœuds (test).
- [ ] **AC-c7 — Transfert** (HN-E10S02-4).
  **Given** une organisation avec des fichiers `ready`
  **When** `pnpm org:export --out <f>.org-export.json` s'exécute avec les variables de stockage
  **Then** `files` est dans `TABLES` (lignes `ready` seulement), et chaque objet est écrit dans
  `<f>.org-export.json.files/<id>`.
  **And** `pnpm org:import` réécrit les lignes sous les nouveaux identifiants (le `file_id` des
  blocs et des versions par `deepReplace`). Il envoie chaque objet sous `<nouvel org_id>/<nouvel
  id>` dans le bucket de la cible. Sans variables de stockage, l'export et l'import de fichiers
  échouent avec un message qui les nomme, avant toute écriture.
  **And** la suite d'isolation reçoit une ligne `files` dans A et dans B.

## Sécurité : canaux

| Canal | État | Test |
|-------|------|------|
| Fichier servi en `text/html` depuis l'origine de l'hôte | Fermé : aucun type HTML admis ; les octets viennent de l'origine du bucket, jamais de l'hôte | Types refusés ; la réponse de la route est une 302, sans corps |
| Script d'un `svg` | Fermé : rendu par `<img>`, `attachment` à la navigation | Disposition de l'URL d'un `svg` |
| Type déclaré par le client | Fermé : type et taille signés dans l'URL d'envoi, contrôlés par `head` ; type de lecture fixé par `response-content-type` | Taille ou type différent à `complete` |
| Nom d'origine dans la clé | Fermé : clé `<org_id>/<id>` | Unitaire sur la clé |
| Autre organisation, nœud illisible, fichier `pending` | Fermé : `not_found` | Intégration |
| Fichier d'un autre nœud cité dans un bloc | Fermé : refusé par `writeNode` ; la duplication copie | AC-c2, AC-c6 |
| Fichier d'un brouillon ou hors périmètre par un lien public | Fermé : fichier cité par un bloc publié du périmètre seulement | AC-c4 |
| URL de lecture présignée | **Ouvert** : rejouable 60 s par qui la détient | Durée de 60 s vérifiée |
| URL d'envoi | **Ouvert** : réutilisable 5 min, même après `complete` (même type, même taille) | Durée de 5 min vérifiée |
| Clés du bucket | **Ouvert** : accès complet au bucket, dans `server/` seulement, jamais dans `ui/` ; jamais la clé `service_role` | `rg PLATFORM_STORAGE packages/plateforme/ui` vide |
| Contenu malveillant d'un type admis (macro, PDF piégé) | **Ouvert** : aucune analyse (hors périmètre) | — |
| `X-Content-Type-Options: nosniff` | **Ouvert** : dépend du fournisseur S3 ; seules les images sont `inline` | — |

## Implémentation

### Migrations prévues
Une migration `packages/plateforme/migrations/<horodatage>_files.sql`, additive, `platform` seul :
- table `files` : `id uuid pk default gen_random_uuid()`, `org_id uuid not null` → `orgs`
  (`on delete cascade`), `node_id uuid not null` → `nodes` (`on delete cascade`, filet de
  sécurité : la purge lit les clés avant), `name text not null` (1 à 255), `mime text not null`,
  `size bigint not null check (size between 1 and 52428800)`,
  `status text not null check (status in ('pending','ready'))`, `created_by uuid`,
  `created_at timestamptz not null default now()`. Pas de `sha256` (HN-E10S02-7) ;
- index `files (org_id, status)` (quota, purge) et `files (node_id)` (corbeille, duplication) ;
- RLS activée, policies d'isolation par organisation (ADR-012 § 3) ; droits `authenticated` et
  `service_role` sur le modèle d'E01-S12 c ;
- `blocks_type_check` : `file` ajouté ;
- `block_search_text` : `when 'file' then p_data ->> 'name'` ;
- `duplicate_subtree` remplacée (AC-c6), mêmes droits ;
- `public_file_by_token(p_org uuid, p_token text, p_file uuid)` : `security definer`,
  `search_path` vide, `REVOKE` puis `GRANT` à `anon` ; rend la clé, le `mime` et le nom, ou rien.

### Schémas Zod partagés
- `packages/plateforme/schemas/files.ts` : `FILE_TYPES` (extension ↔ mime : `png`, `jpeg`/`jpg`,
  `gif`, `webp`, `svg`, `pdf`, `csv`, `txt`, `md`, `docx`, `xlsx`, `pptx`, `odt`, `ods`, `zip`),
  `IMAGE_TYPES`, `FILE_MAX_BYTES`, `ORG_QUOTA_BYTES`, `fileRequestSchema`, `fileIdSchema`,
  `fileReadQuerySchema` (`disposition`). Exportés par `schemas/index.ts` (fichier d'ajout).
- `schemas/blocks.ts` : bloc `file` (`{file_id, name, size, mime}`) ; `image.data` = `src`
  (`https`) **ou** `file_id`, et `width` facultatif (`small`, `medium`, `full`).

### Fichiers à créer
- `migrations/` : `<horodatage>_files.sql`.
- `server/` : `files/store.ts` (port, `fileStore()`), `files/s3.ts`, `files/memory.ts`,
  `files/service.ts` (demande, confirmation, lecture, lecture publique, purge, copie).
- `schemas/` : `files.ts`.
- `api/` : `files.ts` (`GET files`, `POST files`, `POST files/<id>/complete`, `GET files/<id>`).
- `ui/` : `noeud/fichier-du-bloc.tsx` (carte, image interne, états), `noeud/editeur/envoi-de-fichier.ts`
  (demande, envoi XHR, confirmation, annulation).
- `scripts/lib/org-transfer-files.mjs` : lecture et écriture des objets pour l'export et l'import.
- Tests : voir § Tests attendus.

### Fichiers à modifier
- `schemas/` : `blocks.ts`, `blocks-render.ts` (markdown d'AC-c1), `index.ts` (fichier d'ajout).
- `server/` : `nodes/markdown-parse.ts`, `nodes/links.ts` (`case "file"`), `procedures-check.ts`
  (`file` : `name` ; `image` : `file_id` sans `src`), `nodes/write.ts` (AC-c2),
  `nodes/trash.ts` (`purgeTrash`, AC-c5), `nodes/duplicate.ts` (AC-c6), `shares.ts`
  (`readPublicFile`), `index.ts` (fichier d'ajout).
- `api/` : `handler.ts`. Table de dispatch (fichier d'ajout), **et** `RouteResult` étendu par
  `redirect?: string` pour la 302 : changement hors ajout, nommé au rayon d'impact.
  `public.ts` : `isPublicRoute` et `publicResponse` étendus à `public/<jeton>/files/<id>`.
- `ui/` : `noeud/rendu-des-blocs.tsx` (`ImageDuBloc`, `case "file"`, prop `adresseDeFichier`),
  `noeud/editeur/modele.ts`, `noeud/editeur/champ-de-bloc.tsx`, le choix « Insérer » d'E10-S06,
  `public/page-publique.tsx` (adresses par jeton).
- Hôte et outillage : `scripts/lib/org-transfer.mjs` (`TABLES` : ligne `files`),
  `scripts/org-export.mjs`, `scripts/org-import.mjs`, `.env.example` (cinq variables, vides),
  `packages/plateforme/README.md`. Le README décrit les variables, le CORS du bucket (`PUT` et
  `GET` depuis l'origine de l'hôte, en-têtes `content-type`), l'exemple de Supabase Storage par
  son point d'accès S3 avec des clés d'accès S3 (jamais `service_role`), et la CSP d'un hôte
  (`img-src` et `connect-src` admettent l'origine du bucket).
- Tests partagés : `tests/helpers/block-cases.ts`, `tests/integration/isolation/donnees.ts`
  (`seedRows`, `PARENTS` inchangé : `files` porte `org_id`), `tests/integration/isolation/tables.test.ts`
  (`created_by` déjà dans `AUTHORS` ; aucune entrée `CREATION`, la RLS n'exige pas d'état),
  `tests/integration/isolation-par-table.test.ts`, `tests/integration/org-transfer.test.ts`.
- Dépendance : `aws4fetch`, version exacte, dans `dependencies` du paquet et `devDependencies` de
  la racine (scripts), justifiée dans le rapport pour `tech-stack.md`. Pas de SDK AWS.

### Points de départ
- Oto, `oto_mcp/media_store.py` (`C:\apps\oto-backend`). On reprend : la lecture par URL
  présignée courte, le bucket privé sans ACL publique, cinq variables (`OTO_MCP_S3_*` : endpoint,
  région, bucket, deux clés). On retire : `boto3` (Python ; ici `aws4fetch`), le téléversement
  par le serveur (ici, envoi direct au bucket), les images publiques par ACL (ici, tout passe par
  une route qui décide), le nommage propre à Oto.
- Banc (`C:\apps\mcp-test`) : aucun.

### Patterns à suivre
- `uploads-patterns.md` : URL signée au-delà de 1 Mo, nom d'origine jamais dans la clé, contrôle
  côté serveur, progression, annulation, dépôt accessible au clavier, limites affichées avant.
- `uploads-patterns.md § Règles` (« `next/image` ») ne s'applique pas à `ui/`, qui n'importe pas
  Next : c'est l'exception déjà écrite sur `<img>` dans `ImageDuBloc`.
- `supabase-patterns.md § Couplage à Supabase` : aucun appel à `supabase.storage`, aucune
  nouvelle dépendance à Supabase.
- `security-patterns.md § Droits dans le service` : chaque refus est décidé avant la requête.
- `database-patterns.md` : RLS d'isolation, migration additive, règles `SECURITY DEFINER`.
- `tech-stack.md` : dépendance justifiée et épinglée.

## Rayon d'impact

### Appelants
- Types de bloc : `rg -n '"mermaid"' packages tests -l` rend, dans le paquet, `schemas/blocks.ts`,
  `schemas/blocks-render.ts`, `server/nodes/markdown-parse.ts` et `ui/noeud/rendu-des-blocs.tsx`.
  Dans les tests, il rend `tests/helpers/block-cases.ts`, `tests/unit/blocks-render.test.ts`,
  `tests/unit/nodes-parse.test.ts`, `tests/unit/nodes-links.test.ts`,
  `tests/unit/ui-editeur-modele.test.ts`, `tests/unit/schemas/blocks.test.ts`,
  `tests/integration/components/ecran-de-noeud.test.tsx` et
  `tests/integration/components/editeur-de-blocs.test.tsx`. Chacun reçoit `file`.
- Image : `rg -n '"image"' packages/plateforme` rend `schemas/blocks.ts` (l. 23, l. 128),
  `schemas/blocks-render.ts` (l. 122), `server/nodes/markdown-parse.ts` (l. 192),
  `server/nodes/links.ts` (l. 33), `server/procedures-check.ts` (l. 110),
  `ui/noeud/rendu-des-blocs.tsx` (`case "image"`) et `ui/noeud/editeur/modele.ts` (l. 155).
  Chacun reçoit `file_id`.
- `IMAGE_SRC_MAX` (`server/nodes/limits.ts`) : inchangé pour `src`.
- Écriture des blocs : `rg -n "writeNode\(" packages/plateforme -l` rend `api/nodes.ts`,
  `mcp/server.ts` et `server/nodes/write.ts`. Le contrôle d'AC-c2 dans `writeNode` couvre donc
  l'écran et `write`.
- Purge : `rg -n "purgeTrash\(" packages` rend `server/nodes/trash.ts` seulement (définition,
  `trashNode`, `listTrash`). `rg -n "purge" packages/plateforme/server -l` rend aussi
  `server/index.ts` (export) et `nodes/publish.ts`, `tables/evolution-checks.ts`,
  `tables/evolution-publish.ts`, sans rapport (lignes d'un tableau).
- Duplication : `rg -n "duplicate_subtree" packages/plateforme -g '!*.sql'` rend
  `server/nodes/duplicate.ts` et `server/database.ts` (types générés, à régénérer). La fonction
  recopie `blocks` et `node_versions` avec le même `data`, donc le même `file_id` sans AC-c6.
- Partage public : `rg -n "readPublicNode\(" packages src` rend `server/shares.ts`,
  `api/public.ts` et `src/app/p/[jeton]/[[...chemin]]/page.tsx`. `rg -n "isPublicRoute" packages`
  rend `api/public.ts` et `api/handler.ts`. Une route sous `src/app/p/[jeton]/files/` serait
  captée à la place d'une sous-page de chemin `files/…` : aucun segment de chemin n'est réservé
  (`rg -n -i "reserved" packages/plateforme/server/nodes/segments.ts` ne trouve rien). D'où la
  route du paquet (C1).
- Réponses de la porte : `rg -n "new Response\(|Response.redirect" packages/plateforme/api` ne
  trouve rien. Toutes les routes rendent du JSON (`RouteResult`). La 302 demande d'étendre
  `RouteResult`, pour `files` seulement.
- Transfert : `org-export.mjs` écrit un seul JSON (`writeFileSync`, `org-export.mjs` l. 97) ;
  `deepReplace` (`org-transfer.mjs`) remplace déjà les uuid dans `blocks.data` et
  `node_versions.blocks`.

### Doublons
- `component-registry.md` : le dépôt de fichier d'E10-S01 (`import-de-fichier.tsx`) est réutilisé
  pour le choix du fichier. `Dialog` (`ui/ds/react/dialog.tsx`) est réutilisé pour
  l'agrandissement. La carte de fichier n'existe pas : `rg -n "Télécharger" packages/plateforme/ui`
  ne trouve rien.
- Stockage : `rg -n -i "presign|filestore|\bs3\b" packages/plateforme` ne trouve qu'un
  commentaire (`server/admin/journal.ts` l. 10 : « retiré : l'export S3 »). Verdict : créer le
  port.
- Signature S3 dans les scripts : `scripts/lib/org-transfer-files.mjs` appelle `aws4fetch`
  directement, sans reprendre `server/files/s3.ts`. Les scripts sont du `.mjs` sans compilation et
  n'importent pas le TypeScript du paquet (`rg -n "packages/plateforme" scripts/*.mjs` : seulement
  `cli/index.mjs`). Verdict : laisser les deux ; les quatre appels restent minces.

### Effet produit
- Schéma `platform` et RLS : une table, un type de bloc, deux fonctions modifiées, une fonction
  publique. Ⓜ : la migration s'applique et fusionne avant toute autre fusion
  (`.method/sprint/vagues.md § Base de test et migrations`).
- Hôte : cinq variables nouvelles, facultatives. Sans elles, rien ne change. Aucun fichier de
  l'hôte n'est ajouté.
- Migrations copiées par l'hôte : une de plus (`pnpm check:migrations`).
- MCP : `read` rend deux formes nouvelles, `write` les accepte. Liste d'outils inchangée.
- Partage public, corbeille, duplication, transfert d'organisation, suite d'isolation : touchés
  (lot c).
- Porte HTTP : `RouteResult.redirect`, lu par la seule ressource `files`.

### Refacto
- Écarté : unifier `image` et `file` en un seul bloc. L'image a un rendu, une largeur et un texte
  alternatif propres, et le type `image` existe déjà dans les contenus publiés.

## Hypothèses

- **HN-E10S02-1** : 50 Mo par fichier (52 428 800 octets) et 10 Go par organisation
  (10 737 418 240 octets), en constantes, sans écran de quota. Le quota compte `pending` et
  `ready` (source : JB, fiche D113 ; `pending` compté : le plus simple qui ferme le dépassement
  par envois simultanés).
- **HN-E10S02-2** : un fichier appartient à un seul nœud. La duplication crée une ligne neuve et
  copie l'objet par l'opération `copy` du port (source : pilote, décision C9 → fiche D118, ouverte ;
  ADR-016 § 1 amendé par le pilote).
- **HN-E10S02-3** : l'adresse servie à l'assistant est absolue, sur l'origine de la requête MCP
  (`requestOrigin`, `server/identity.ts`). Un humain qui la reçoit dans la conversation peut
  l'ouvrir (source : même règle que l'adresse de retour des emails, `origin` d'`api/handler.ts`).
- **HN-E10S02-4** : les octets du transfert vont dans un dossier `<out>.files/` à côté du JSON
  (source : pilote, décision C10).
- **HN-E10S02-5** : « Aperçu » d'un PDF par `?disposition=inline`. Le PDF vient de l'origine du
  bucket, jamais de l'hôte : la règle d'ADR-016 § 5 tient (source : AC-b2 ; `uploads-patterns.md
  § Validation`).
- **HN-E10S02-6** : l'écran apprend l'état du stockage par `GET files` plutôt que par une
  propriété posée par l'hôte, pour n'ajouter aucun fichier à l'hôte (source : le plus simple ;
  C1).
- **HN-E10S02-7** : pas de colonne `sha256` : aucun comportement ne la lit (source :
  `CLAUDE.md § Justifier une surface nouvelle` ; ADR-016 § 3 amendé par le pilote).
- **HN-E10S02-8** : un bloc n'est écrit qu'après `complete`. Aucun brouillon ne cite une ligne
  `pending` (source : le plus simple ; AC-a6 purge sans casser de bloc).

## Actions JB

- Créer le bucket privé et ses clés d'accès S3, régler son CORS (README du paquet), poser les
  cinq variables `PLATFORM_STORAGE_*` du projet (ADR-016 § 2) avant la campagne visuelle. Les
  tests n'en ont pas besoin (adaptateur en mémoire).
- Trancher la fiche D118 (duplication). La story avance sous l'option recommandée.

## Tests attendus

### Unit tests
- [ ] Signature SigV4 de l'adaptateur S3 sur les vecteurs de test publiés ; `content-length` et
  `content-type` signés ; durées de 5 min et 60 s ; `response-content-*` dans l'URL de lecture.
- [ ] `FILE_TYPES`, limites, clé d'objet sans nom d'origine ; `fileStore()` à `null` sans l'une
  des cinq variables.
- [ ] Rendu et relecture markdown des blocs `file` et `image` internes (aller-retour).
- [ ] `org-transfer` : ligne `files` de `TABLES`, chemins `<out>.files/<id>`.

### Integration tests
- [ ] Envoi sur l'adaptateur mémoire : chaque code d'AC-a3 dans l'ordre ; quota avec `pending` ;
  deux demandes simultanées sous le verrou ; objet absent, taille ou type différent à `complete` ;
  `pending` purgé au `POST` suivant.
- [ ] Lecture : droit exigé ; autre organisation, `pending`, corbeille → `not_found` ; disposition
  `attachment` pour `svg`, `pdf` (sans `disposition=inline`), `zip` ; `inline` pour `png`.
- [ ] `writeNode` : `file_id` d'un autre nœud, inconnu ou `pending` → `invalid_arguments` ;
  métadonnées reprises de la ligne.
- [ ] Partage public : fichier publié du périmètre servi ; brouillon seul, hors périmètre, jeton
  désactivé → `not_found`.
- [ ] Purge de la corbeille : lignes et objets supprimés ; échec du bucket journalisé.
- [ ] Duplication : lignes neuves, `file_id` réécrits (blocs et version), objets copiés ; aucun
  fichier cité par deux nœuds ; copie en échec → `pending`.
- [ ] Isolation (`isolation-par-table.test.ts`, `isolation/tables.test.ts`) et transfert
  (`org-transfer.test.ts`) avec `files`.
- [ ] Éditeur (composants) : collage d'image, dépôt de fichier, glisser de fichier distinct du
  glisser de bloc, progression, annulation, refus affiché, stockage désactivé, fichier
  indisponible, agrandissement au clavier (`Échap`).

### MCP (`InMemoryTransport`)
- [ ] `read` d'une page avec image interne et fichier : formes exactes d'AC-c1.
- [ ] `write` qui relit ces formes : accepté sur le même nœud, refusé ailleurs (texte exact
  d'AC-c2).

### E2E tests (si applicable)
- [ ] Avec un bucket réel (campagne visuelle, après l'action de JB) : déposer une image et un PDF,
  les relire, les voir par un lien public, dans les deux thèmes.

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Notes
