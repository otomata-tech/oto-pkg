# Story E10-S02 — Fichiers : dépôt, images, « Voir », dépôt par lien à usage unique

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E10 — Contenus riches |
| **Parcours** | 4.4 Concevoir et mettre à jour ; 4.2 Faire (l'assistant lit ce qu'une page joint ; Claude Code range un rapport, un compte rendu, un export) |
| **Statut** | 🟢 Ready (fusion d'E10-S02, E10-S03 et E10-S05, fiche D137) |
| **Priorité** | Should |
| **Vague** | E10, après 1.0.0 |
| **Référence UI** | N/A : style du paquet. Bloc image existant (`ImageDuBloc`, `ui/noeud/rendu-des-blocs.tsx`) ; dialogue de dépôt d'E10-S01 (`ui/coque/import-de-fichier.tsx`, créé par E10-S01) ; dialogue natif du design system (`Dialog`, `ui/ds/react/dialog.tsx`) ; visionneuse : comportement d'un artefact de Claude ouvert seul |
| **Conventions** | database, supabase, security, api, uploads, forms, portage, a11y, state, mcp, deploy, stack, testing |
| **Estimation** | XL (six lots, six fusions : a port, table et routes M ; b écran M ; c « Voir » M ; d assistant S ; e partage, corbeille, duplication, transfert M ; f dépôt par lien L) |
| **Dépend de** | ADR-016, ADR-017, ADR-018 ; E05-S10 ✅ (corbeille, partage public, duplication) ; E10-S04 (mêmes fichiers de types de bloc) ; E10-S01 (`import-de-fichier.tsx`, dialogue d'import CSV, mode tolérant, `table.import`) ; E10-S06 (choix du « + » et de `/`, groupe « Insérer »). Ordre commun : E10-S04, E10-S01, E10-S06, E10-S02 |
| **Porteuse de migration** | **Oui** (Ⓜ) : tables `platform.files` et `platform.upload_tickets`, type de bloc `file`, `block_search_text`, `duplicate_subtree`, lecture publique d'un fichier, `consume_upload_ticket` |

## Contexte

Aucun fichier ne peut être déposé aujourd'hui. Le bloc `image` n'accepte qu'une adresse `https`
externe (`src` ≤ 2 000 caractères, `IMAGE_SRC_MAX`). L'éditeur ne propose pas de l'insérer :
`rg -n '"image"' packages/plateforme/ui/noeud/editeur` ne trouve que `modele.ts` l. 155, en lecture.
JB a choisi le 2026-09-28 un port S3 générique (fiche D111, ADR-016).

JB, 2026-09-29 (fiche D137) : un fichier HTML, comme un PDF ou un `.md`, est **un fichier joint à
une page**, sans rendu dans la page. Sa carte porte « Voir » (icône œil), qui ouvre le fichier dans
un nouvel onglet : le HTML s'y exécute isolé (ADR-017), le `.md` s'y affiche en blocs, le PDF dans
le lecteur du navigateur. Une image reste un fichier rendu dans la page. Partager une page partage
ses fichiers. Il n'y a ni bloc `html` ni « page artefact ». Les trois stories de fichiers (E10-S02,
E10-S03, E10-S05) n'en font plus qu'une.

Un assistant n'envoie pas dans un appel MCP un fichier qu'il a déjà (fiche D117) : `upload.link`,
derrière `call`, rend un lien à usage unique où Claude Code l'envoie par `curl` ; un assistant sans
shell passe l'adresse publique du fichier, sinon un formulaire de dépôt (fiche D130). Aucun outil
n'est ajouté (ADR-002). La route d'envoi est la première porte du paquet qui **écrit au nom d'une
personne sans jeton de session** : le ticket prouve qui et où, le droit se relit à l'envoi
(ADR-018).

**Refs :**
- PRD : FR-CONC-08, FR-CONC-09, FR-CONC-11
- Architecture : § 4 (`blocks`, `node_shares`), § 5 ; ADR-016 (tout), ADR-017 (tout), ADR-018
  (tout), ADR-013 (partage), ADR-012 (ports, § 3), ADR-011 § 2 et § 5 (types de bloc,
  aller-retour), ADR-009 (texte seulement), ADR-002 (fonction derrière `call`, champ facultatif)
- Décisions : D111 (port S3), D112 (HTML par lien public, bannière), D113 (50 Mo, 10 Go), D116
  (groupe « Insérer »), D117 et D130 (dépôt par lien), D118 (duplication, ouverte, sous l'option
  recommandée), D119 (`read {file}`), D135 (publication directe), D137 (fusion)
- `uploads-patterns.md` (toutes sections) ; `security-patterns.md § Droits dans le service`

## Périmètre

### Dans cette story
- Le port `FileStore` (cinq opérations), son adaptateur S3 et son adaptateur en mémoire.
- La table `platform.files`, l'envoi en trois temps, la lecture par redirection.
- Le bloc `file`, l'image interne (`image.data.file_id`), leur rendu, leur édition, leur markdown ;
  le choix au dépôt d'un `.md` ou d'un `.csv` dans une page.
- « Voir » : visionneuse en onglet, route HTML isolée (ADR-017), `.md` rendu en blocs.
- `read {file}` : le texte d'un fichier joint, pour un assistant.
- La lecture publique d'un fichier par le jeton d'un lien, visionneuse comprise.
- La purge (envois abandonnés, corbeille), la duplication d'une page, le transfert d'une
  organisation.
- `upload.link` au catalogue de `call`, la table `upload_tickets`, la route sans session, le
  téléchargement d'une adresse fournie et le formulaire de dépôt.

### Hors périmètre
- Extraction du texte d'un PDF ou d'un document bureautique pour `find`, et indexation du contenu
  d'un fichier texte : plus tard (epic E10, OUT). `find` trouve un fichier par son nom.
- Aperçu en ligne des documents bureautiques : plus tard (epic E10, OUT). Ils n'ont que
  « Télécharger ».
- Envoi d'octets par un outil MCP : les six outils ne portent que du texte (ADR-009) ; un assistant
  dépose par `upload.link` (lot f).
- Écran de quota : aucun (D113).
- Libérer le quota d'un fichier que plus aucun bloc ni aucune version ne cite : V2. Il vit
  jusqu'à la purge de son nœud (ADR-016 § 6).
- Analyse antivirus des fichiers déposés : V2 (canal ouvert, § Sécurité).
- Objets laissés dans un bucket réel par `pnpm test:cleanup` et `pnpm demo:seed`, qui suppriment
  des organisations en SQL : tâche de suite (nettoyage par préfixe `<org_id>/`). Les tests
  n'utilisent que l'adaptateur en mémoire.
- Un fichier lâché sur le rail : seuls le `.md` et le `.csv` y sont admis (import d'E10-S01) ; un
  autre fichier se dépose dans une page.
- Import de fichiers `.xlsx` : plus tard (epic E10, OUT).
- Thème de l'organisation dans un HTML vu, appels réseau d'un HTML vers une API extérieure :
  non, par conception (ADR-017).
- Origine séparée pour les fichiers HTML : écartée par ADR-017.
- Remplacer un fichier joint par `upload.link`, remplacer toutes les lignes d'un tableau
  (`csv replace`) : écartés ; on joint un nouveau fichier et on retire l'ancien bloc, un tableau se
  remplace à l'écran.
- Envoi par lien en plusieurs morceaux, reprise d'un envoi coupé : V2 si le besoin apparaît.
- Rate limiting de la route d'envoi : aucun store partagé dans le paquet ; le jeton de 256 bits en
  tient lieu (AC-f11).
- Commande CLI du paquet avec connexion OAuth de l'appareil : écartée (option B de D117).

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
  4. la taille : de 1 octet à 50 Mo (`FILE_MAX_BYTES` = 52 428 800), et à 4 Mo pour un fichier
     texte (`TEXT_FILE_MAX_BYTES` = 4 194 304 ; `html`, `md`, `txt`, `csv`), sinon `too_large` ;
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
  URL présignée de 60 s. Cette URL fixe `response-content-type` et `response-content-disposition`.
  Ces valeurs ne sont jamais lues de l'objet.
  - `inline` pour une image hors `svg`, au `mime` de la ligne.
  - Sur `?disposition=inline` (« Voir », AC-c1) : `inline` pour un PDF (`application/pdf`), un
    `txt` ou un `csv` (`text/plain; charset=utf-8`).
  - `attachment; filename*=UTF-8''<nom>` pour tout le reste, `html`, `md` et `svg` compris ; un
    `?disposition=inline` sur ces types est ignoré.

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
- [ ] **AC-a8 — Texte d'un fichier.**
  **Given** un fichier texte `ready` (`html`, `md`, `txt`, `csv`)
  **When** un service du paquet en a besoin (AC-c2, AC-c3, AC-d2)
  **Then** `readFileText` (`server/files/service.ts`) vérifie la lecture sur le nœud, obtient une
  URL présignée de lecture et la lit côté serveur (10 s au plus, 4 Mo au plus), puis décode en
  UTF-8 strict, BOM retiré. Aucune opération n'est ajoutée au port.
  **And** un octet invalide rend `invalid_arguments` (« the file is not UTF-8; download it
  instead »), un objet absent `not_found`, un fichier d'un autre type `invalid_arguments`.

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
  **And** un fichier `html`, `md`, `pdf`, `txt` ou `csv` porte en plus « Voir », avec une icône
  œil (lot c). Aucun fichier n'est rendu ni exécuté dans la page.
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
  **Then** les types et les limites (50 Mo, 4 Mo pour un fichier texte) sont affichés avant la
  sélection.
  **And** un refus du service s'affiche dans le bloc local, traduit par son code
  (`invalid_arguments`, `too_large`, quota, `forbidden`, `not_enabled`, `conflict`). Le bloc reste
  retirable. « Annuler » interrompt l'envoi (`AbortController`) et retire le bloc local.
  **And** un glisser qui porte des fichiers (`dataTransfer.types` contient `Files`) est un dépôt,
  jamais un déplacement de bloc (`useGlisser`).
- [ ] **AC-b5 — Choix au dépôt d'un `.md` ou d'un `.csv`.**
  **Given** un rédacteur qui lâche un `.md` ou un `.csv` dans une page, stockage activé
  **When** le fichier est lâché
  **Then** un choix s'ouvre (`Dialog`), le focus sur la première option :
  - pour un `.md` : « Insérer le contenu » (E10-S01 AC-a4, mode tolérant) ou « Joindre comme
    fichier » (AC-b2) ;
  - pour un `.csv` : « Importer en tableau » (dialogue d'import d'E10-S01 ; le tableau est créé
    sous la page, sous les droits d'E10-S01, et un bloc `reference` vers lui est inséré à
    l'endroit du dépôt) ou « Joindre comme fichier ».

  **And** `Échap` ferme le choix sans rien écrire. Stockage désactivé : pas de choix, l'import
  d'E10-S01 s'applique seul. Un fichier choisi par « Fichier » du « + » est joint, sans choix.
- [ ] **AC-b6 — CSV joint.**
  **Given** un bloc `file` de type `csv`
  **When** un rédacteur choisit « Convertir en tableau »
  **Then** l'écran lit les octets par la route de lecture et ouvre le dialogue d'import d'E10-S01
  sur ce contenu. Le tableau est créé sous la page, sous les droits d'E10-S01 : l'écriture sur la page
  suffit (fiche D150, qui amende D120 ; HN-E10S02-78), et un bloc `reference` vers lui est inséré après le
  bloc `file`.
- [ ] **AC-b7 — Fichiers désactivés.**
  **Given** `GET files` rend `enabled: false`
  **When** le rédacteur ouvre le « + » ou colle une image
  **Then** « Image » et « Fichier » n'apparaissent pas. Un collage d'image affiche « Les fichiers
  ne sont pas activés sur cette plateforme. »
  **And** les images `https` existantes s'affichent toujours.
- [ ] **AC-b8 — Fichier indisponible.**
  **Given** une ligne `ready` dont l'objet a disparu du bucket
  **When** le bloc se rend
  **Then** l'image (`onError`) ou la carte affiche « Fichier indisponible », sans casser la page.

### Lot c — « Voir »

- [ ] **AC-c1 — Ouvrir.**
  **Given** la carte d'un fichier qui porte « Voir » (AC-b2)
  **When** on choisit « Voir »
  **Then** un nouvel onglet s'ouvre (`target="_blank"`, `rel="noopener noreferrer"`) :
  - `pdf`, `txt`, `csv` : `GET /api/plateforme/files/<id>?disposition=inline`, affiché par le
    navigateur depuis l'origine du bucket (AC-a5) ;
  - `html`, `md` : la visionneuse, à l'adresse du contenu suivie de `?view=<id>`
    (`/n/<chemin>?view=<id>` ; en public, `/p/<jeton>/<chemin>?view=<id>`, AC-c5).
  - Le bouton a pour nom accessible « Voir <nom du fichier> (nouvel onglet) ».
- [ ] **AC-c2 — Visionneuse.**
  **Given** une adresse `?view=<id>` d'un fichier `html` ou `md` joint au nœud de l'adresse
  **When** la page se rend
  **Then** la visionneuse (`ui/noeud/visionneuse-de-fichier.tsx`) remplace l'écran du nœud, en
  pleine largeur de la zone de contenu, sans marge de lecture. Son en-tête, hors du contenu :
  nom, taille, « Télécharger », et « Ouvrir la page <titre du nœud> ».
  - `md` : `GET /api/plateforme/files/<id>/markdown` rend `{ data: { name, blocks } }`, analysé
    en mode tolérant (E10-S01) à partir de `readFileText` ; les blocs se rendent en lecture seule
    par `rendu-des-blocs.tsx`, comme une page.
  - `html` : la bannière et l'iframe d'AC-c4.
  - un fichier inconnu, d'un autre nœud, `pending`, d'un autre type, ou illisible : « Fichier
    introuvable », la même phrase pour tous. Un fichier qui n'est pas de l'UTF-8 : « Ce fichier
    n'est pas en UTF-8 : téléchargez-le. »
- [ ] **AC-c3 — Route isolée.**
  **Given** un lecteur du nœud
  **When** l'iframe demande `GET /api/plateforme/files/<id>/html`
  **Then** la route sert le texte de `readFileText` avec exactement les en-têtes d'ADR-017 § 1 :
  - `Content-Type: text/html; charset=utf-8` ;
  - `Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms; default-src 'none';
    script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
    style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;
    img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none';
    frame-ancestors 'self'` ;
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
    `Cache-Control: private, no-store`.
  - **Given** une requête sans session **Then** 401, code `forbidden` (H04).
  - **Given** l'un des cas suivants **Then** 404, code `not_found`, même réponse pour tous, sans dire
    lequel : lecture refusée ; fichier d'une autre organisation, `pending`, inconnu, d'un autre
    type ; `Sec-Fetch-Dest` présent et différent de `iframe` (onglet, fenêtre ouverte, lien
    direct).
  - Une erreur se sert en texte brut, avec les mêmes en-têtes : jamais en JSON dans l'iframe.
  - La route ne passe pas par la table de dispatch, qui ne rend que du JSON (`serve`,
    `api/handler.ts`) : une branche avant le dispatch, comme `isPublicRoute`, la sert.
  - **Given** l'hôte de référence **Then** `X-Frame-Options` et `Referrer-Policy` de
    `next.config.ts` ne s'appliquent pas aux deux routes HTML (exclusion dans `headers()`). Le test
    e2e lit les en-têtes **reçus** par le navigateur : le test d'intégration ne voit pas
    `next.config.ts`.
- [ ] **AC-c4 — Iframe et bannière.**
  **Given** la visionneuse d'un fichier `html`
  **Then** au-dessus de l'iframe, hors d'elle, la bannière : « Contenu interactif publié par <nom de
  l'organisation>. N'y saisissez jamais de mot de passe. »
  **And** l'iframe occupe la hauteur restante de la fenêtre. Elle porte
  `sandbox="allow-scripts allow-popups allow-forms"`, sans `allow-same-origin`, avec
  `referrerpolicy="no-referrer"` et sans attribut `allow`. Son `title` vaut le nom du fichier.
  L'écran n'écoute ni n'envoie aucun message à l'iframe.
  **And** si l'iframe charge un second document (navigation), l'écran la remplace par « Ce contenu
  a tenté de quitter la page. » et un bouton « Recharger ».
- [ ] **AC-c5 — Voir en public** (fiche D112).
  **Given** une page publiée dans le périmètre d'un lien, dont un bloc **publié** cite un fichier
  `html` ou `md`
  **When** un visiteur choisit « Voir » sur la page publique
  **Then** `/p/<jeton>/<chemin>?view=<id>` rend la visionneuse d'AC-c2, avec la même bannière. Elle
  lit `GET /api/plateforme/public/<jeton>/files/<id>/markdown` ou charge
  `GET /api/plateforme/public/<jeton>/files/<id>/html` :
  - servies par la porte publique (`isPublicRoute`, `api/public.ts`, étendue), hors session ;
  - sous la décision de `platform.public_file_by_token` (AC-e4) ;
  - avec les en-têtes d'AC-c3, plus `X-Robots-Tag: noindex, nofollow`, le même `sandbox` et la
    même règle `Sec-Fetch-Dest`.

  **And** un fichier hors périmètre, cité seulement par un brouillon, ou un jeton inconnu ou
  désactivé rend `not_found`, la même réponse. « Voir » d'un `pdf`, `txt` ou `csv` en public ouvre
  `…/public/<jeton>/files/<id>?disposition=inline`.
- [ ] **AC-c6 — Isolation vérifiée, un cas par canal** (ADR-017 § 2). Test e2e sur un fichier HTML
  d'essai, ouvert dans la visionneuse. « Constaté » veut dire :
  - une erreur dans la console de l'iframe ;
  - un événement `securitypolicyviolation` ;
  - l'absence de requête (`page.on("request")`) ;
  - l'absence de téléchargement (`page.on("download")`) ;
  - ou une réponse 404.

  L'adresse « extérieure » est une seconde origine locale (autre port), jamais Internet.

  **Canaux fermés :**

  | # | Tentative | Fermé par | Constat |
  |---|-----------|-----------|---------|
  | F1 | `fetch('/api/plateforme/…')`, XHR | origine opaque, `connect-src 'none'` | aucune requête |
  | F2 | `document.cookie` | origine opaque | `SecurityError` |
  | F3 | `localStorage`, `sessionStorage`, `indexedDB` | origine opaque | `SecurityError` |
  | F4 | `parent.document`, `top.document` | origine opaque | `SecurityError` |
  | F5 | image `https://` extérieure, CSS `url()`, `@import` | `img-src`, `style-src`, `font-src` | aucune requête |
  | F6 | envoi d'un formulaire (`action` extérieure) | `form-action 'none'` | aucune requête ; le gestionnaire `onsubmit` s'exécute (`allow-forms`) |
  | F7 | `WebSocket`, `EventSource`, `navigator.sendBeacon` | `connect-src 'none'` | aucune requête |
  | F8 | `<iframe>`, `<object>`, `<embed>` imbriqués | `default-src 'none'` | aucune requête |
  | F9 | `new Worker(URL.createObjectURL(…))` | `script-src` sans `blob:` | erreur |
  | F10 | `top.location = …`, `<a target="_top">` | `sandbox` sans `allow-top-navigation` | l'adresse de l'onglet ne change pas |
  | F11 | `<a download>` | `sandbox` sans `allow-downloads` | aucun téléchargement |
  | F12 | `<base href="https://…">` puis lien relatif | `base-uri 'none'` | violation, lien résolu sur l'origine de la route |
  | F13 | route ouverte hors iframe (`Sec-Fetch-Dest: document`, `window.open` de la route) | contrôle d'AC-c3 | 404 |
  | F14 | fenêtre ouverte : `document.cookie` dans la fenêtre | `sandbox` hérité | `SecurityError` |
  | F15 | `parent.postMessage(…)` | l'écran n'écoute aucun message | rien ne change à l'écran |
  | F16 | `fetch` vers `/api/plateforme/uploads/<jeton>` d'un ticket valide | `connect-src 'none'` ; `Origin` refusé (AC-f4) | aucune requête |

  **Canaux ouverts, acceptés et nommés :**

  | # | Canal | Constat qui garde la limite écrite |
  |---|-------|-------------------------------------|
  | O1 | navigation de l'iframe (`location = …`, `<meta http-equiv="refresh">`) | la requête part ; l'écran montre « Ce contenu a tenté de quitter la page. » |
  | O2 | navigation vers une adresse qui répond 204 | la requête part ; aucun second chargement, l'écran ne voit rien |
  | O3 | fenêtre ouverte sur un clic (`allow-popups`) vers l'extérieur | la requête part depuis la fenêtre |
  | O4 | DNS : `<link rel="dns-prefetch">`, `<link rel="preconnect">` | aucune violation levée (non couvert par la CSP) |
  | O5 | WebRTC : `new RTCPeerConnection({iceServers: [{urls: "stun:…"}]})` | aucune exception (non couvert par `connect-src`) |
  | O6 | les trois CDN admis (adresse IP du lecteur transmise) | requête servie, sans `Referer` |
  | O7 | le script d'un HTML vu par un lien public lit le jeton dans sa propre adresse et peut l'envoyer (O1) ; borné à un rédacteur de la page, sous la bannière | le script lit `/public/<jeton>/files/…` dans `location` (HN-E10S02-86) |

### Lot d — Assistant

- [ ] **AC-d1 — `read` d'une page.**
  **Given** une page avec une image interne et un fichier
  **When** un assistant la lit par `read`
  **Then** l'image se rend `![<alt>](<origine>/api/plateforme/files/<id>)`, et le fichier
  `[<nom> (<taille>, <type>)](<origine>/api/plateforme/files/<id>)`. `<origine>` est celle de la
  requête MCP (`requestOrigin`, HN-E10S02-3). Le lien exige une session ; l'assistant lit le nom
  et le texte alternatif, et le texte d'un fichier texte par AC-d2, jamais les octets d'un autre
  type (ADR-009).
  **And** `parseMarkdown` relit ces deux formes par le chemin `/api/plateforme/files/<uuid>`,
  quelle que soit l'origine (aller-retour, ADR-011 § 5).
- [ ] **AC-d2 — `read {file}`** (fiche D119).
  **Given** `read {path, file: "<id>"}`, l'identifiant d'un fichier texte joint au nœud de `path`
  **Then** le texte de `readFileText` se sert seul, dans une clôture de son type (` ```html `,
  ` ```markdown `, ` ```csv `, ` ```text `, longueur de clôture par `fenceFor`), précédée de
  `<nom> (<taille>)`, découpé par le curseur existant au-delà de 45 000 caractères (`paginate`,
  `read-pages.ts`).
  - Le champ `file` est facultatif, sans défaut (la page entière). Sa description : « Id of one
    text file attached to the page (html, md, txt, csv), from a file link
    /api/plateforme/files/<id>, to read its text alone (default: the whole page). »
  - Il est exclusif de `section`, `outline`, `since_revision` et `draft` : sinon
    `invalid_arguments`, dans le refus existant, qui le nomme.
  - Il se combine avec `cursor`, et entre dans la clé du curseur (`requestKey`).
  - Un fichier inconnu, `pending` ou d'un autre nœud donne `not_found` : « Unknown file <id> in
    <path>: read the page to get its file links. » Un autre type donne `invalid_arguments` :
    « <nom> is a <type> file; only html, md, txt and csv files are read as text. »
  - Le texte servi n'est jamais relu par `write` comme un bloc : il n'a pas de référence de bloc.
- [ ] **AC-d3 — `write`.**
  **Given** un bloc `file` ou `image` avec `file_id`, écrit par `write` ou par l'écran
  **When** `writeNode` (`server/nodes/write.ts`) le reçoit
  **Then** le service relit la ligne avant la requête. `name`, `size` et `mime` du bloc `file`
  sont repris de la ligne, jamais du client.
  **And** un `file_id` inconnu, `pending` ou d'un autre nœud rend `invalid_arguments`
  (« File <id> is not attached to <chemin>: upload it to this page first. »).
  **And** ` ```html ` reste un bloc `code` : `write` n'a aucune forme qui crée un fichier.
- [ ] **AC-d4 — `find`.**
  **Given** un fichier publié
  **When** un assistant cherche son nom par `find`
  **Then** le bloc est trouvé. Le texte alternatif d'une image est déjà indexé (AC-a2) ; le
  contenu d'un fichier ne l'est pas (hors périmètre).

### Lot e — Partage, corbeille, duplication, transfert

- [ ] **AC-e1 — Partage public.**
  **Given** un nœud couvert par un lien actif, dont un bloc **publié** cite un fichier
  **When** un visiteur sans session ouvre
  `GET /api/plateforme/public/<jeton>/files/<id>` (extension d'`isPublicRoute`)
  **Then** il reçoit la même redirection qu'en AC-a5, avec `PUBLIC_HEADERS`. La décision vient de
  `platform.public_file_by_token` (`security definer`, sous `anon`), sous la règle de
  `public_node_by_token` : lien actif, nœud dans le périmètre, lisible par l'auteur du lien.
  **And** un fichier hors périmètre, cité seulement par un brouillon ou par une version ancienne,
  ou dont le jeton est inconnu ou désactivé rend `not_found`, la même réponse (ADR-016 § 7,
  ADR-013).
  **And** la page publique (`ui/public/page-publique.tsx`) donne aux blocs ces adresses par jeton,
  et « Voir » y mène à AC-c5.
- [ ] **AC-e2 — Corbeille.**
  **Given** un nœud à la corbeille depuis plus de 30 jours
  **When** `purgeTrash` le purge
  **Then** dans la même transaction, avant les nœuds, `purgeTrash` supprime les lignes `files` des
  nœuds purgés et récupère leurs clés (`returning`). Les objets sont supprimés après le commit,
  comme en AC-a6.
  **And** retirer un bloc ne supprime pas son fichier (ADR-016 § 6).
- [ ] **AC-e3 — Duplication** (HN-E10S02-2, fiche D118).
  **Given** une page dont les blocs citent des fichiers
  **When** une personne la duplique (`duplicateNode`, E05-S10)
  **Then** `duplicate_subtree` crée, pour chaque fichier d'un nœud copié, une ligne neuve `pending`
  sous le nœud copié. Il réécrit le `file_id` des blocs copiés et de l'instantané de
  `node_versions`, puis rend les paires (ancien, nouveau).
  **And** après le commit, le service copie chaque objet (`copy`) et passe sa ligne à `ready`. Une
  copie en échec laisse la ligne `pending`, purgée ensuite (AC-a6) ; le bloc affiche « Fichier
  indisponible » (AC-b8).
  **And** aucun fichier n'est cité par deux nœuds (test).
- [ ] **AC-e4 — Transfert** (HN-E10S02-4).
  **Given** une organisation avec des fichiers `ready`
  **When** `pnpm org:export --out <f>.org-export.json` s'exécute avec les variables de stockage
  **Then** `files` est dans `TABLES` (lignes `ready` seulement), et chaque objet est écrit dans
  `<f>.org-export.json.files/<id>`.
  **And** `pnpm org:import` réécrit les lignes sous les nouveaux identifiants (le `file_id` des
  blocs et des versions par `deepReplace`). Il envoie chaque objet sous `<nouvel org_id>/<nouvel
  id>` dans le bucket de la cible. Sans variables de stockage, l'export et l'import de fichiers
  échouent avec un message qui les nomme, avant toute écriture.
  **And** la suite d'isolation reçoit une ligne `files` dans A et dans B.

### Lot f — Dépôt par lien à usage unique

- [ ] **AC-f1 — `upload.link`.** **Given** un assistant avec un `ctx` valide **When** il appelle
  `call` avec `upload.link` et :
  - `path` : la page ou le tableau à créer, ou le nœud existant ;
  - `kind` : `file`, `md` ou `csv` ;
  - `mode` : `create` ou `attach` pour `file` ; `create` ou `replace` pour `md` ; `create` ou
    `merge` pour `csv` ;
  - `name`, exigé pour `file` : le nom du fichier, dont l'extension fixe le type (`FILE_TYPES`) ;
  - `title` et `summary`, exigés pour `create`, sous les règles de `write` ;
  - `base_revision`, exigée pour `attach`, `replace` et `merge` ;
  - `key`, facultative, pour un `csv` ;
  - `publish`, facultatif, pour `file` et `md`, sous la règle de `write` en vigueur (défaut et
    droit : fiche D135) ;
  - `source_url`, facultative (AC-f12) ;

  **Then** le service décide tout de suite, avant toute écriture, ce qu'il décidera à l'envoi :
  - `create` : écriture sur le dossier parent, chemin libre, pour un `csv` comme pour une page (fiche
    D150, qui amende D120 : plus de gestion pour un tableau neuf ; HN-E10S02-78) ;
  - `attach`, `replace`, `merge` : écriture sur le nœud, chemin existant, `base_revision` égale à
    la révision courante ;
  - genre : `file` et `md` visent une page (`kind: page`), jamais une procédure, un Contexte ni un
    tableau ; `csv` vise un tableau ;
  - `file` : stockage configuré (sinon `not_enabled`), type admis, quota (AC-a3, avec la taille
    maximale d'un envoi).

  Un refus se donne à ce moment, avec son code : `forbidden` (avec à qui s'adresser, H68),
  `not_found`, `not_enabled`, `conflict` (chemin pris), `stale_revision`, `invalid_arguments`.
- [ ] **AC-f2 — Ce que l'assistant reçoit.** **Given** un `upload.link` accepté sans `source_url`
  **Then** le texte et le contenu structuré portent les mêmes éléments :
  - l'adresse `https://<adresse de l'organisation>/api/plateforme/uploads/<jeton>` ;
  - l'expiration (ISO 8601) ;
  - la commande pour bash : `curl -sS --fail-with-body --data-binary @'<fichier>' '<adresse>'` ;
  - la commande pour PowerShell : `curl.exe -sS --fail-with-body --data-binary "@<fichier>" "<adresse>"` ;
  - la limite du type demandé (AC-f7) ;
  - la phrase « the link works once, for 15 minutes; the file never goes through this
    conversation ».

  **And** la description d'`upload.link` et le contrat de `write` servi par `read`
  (`catalog/contracts.ts`) disent la règle : « to put a file in a page, or a file that already
  exists on your disk, or more than 20,000 characters: with a shell, curl; without a shell,
  source_url; otherwise, give the person the form link ».
- [ ] **AC-f3 — Le ticket.** **Given** un `upload.link` accepté **Then** une ligne
  `upload_tickets` est créée :
  - jeton : 32 octets aléatoires en base64url, 43 caractères, jamais stocké ni journalisé ; seule
    son empreinte SHA-256 (hex) est gardée ;
  - liée à la personne, à l'organisation, au `ctx` de l'appel, à la destination, au type, au mode
    et aux paramètres d'AC-f1 ;
  - valable 15 minutes et un seul envoi.

  **And** les tickets de l'organisation expirés depuis plus de 24 heures sont supprimés dans la
  même transaction.
- [ ] **AC-f4 — Ordre des contrôles.** **Given** `POST /api/plateforme/uploads/<jeton>` sans
  session **When** la porte le reçoit, avant le jeton de session (comme `isPublicRoute`) **Then**
  elle contrôle, dans cet ordre, et s'arrête au premier refus :
  1. la requête porte un en-tête `Origin` : `forbidden`, sans lire le corps ni la base ;
  2. le jeton ne suit pas `^[A-Za-z0-9_-]{43}$` : `not_found`, sans lire le corps ni la base ;
  3. `Content-Length` au-delà de 1 048 576 octets : `too_large`, sans lire le corps ;
  4. le corps est lu par morceaux et coupé à 1 048 576 octets : au-delà, `too_large` ;
  5. le ticket est consommé (AC-f5) ;
  6. l'identité et le droit sont relus (AC-f6) ;
  7. le contenu est contrôlé (AC-f7) ;
  8. le contenu est écrit (AC-f8).

  Les refus 1 à 4 ne consomment pas le ticket. À partir de l'étape 5, le ticket est servi,
  réussi ou non. Le `Content-Type` est ignoré (curl envoie `application/x-www-form-urlencoded`).
- [ ] **AC-f5 — Consommation atomique.** **Given** un jeton bien formé **When** le service le
  consomme **Then** il appelle, sous `anon`, `platform.consume_upload_ticket(p_org, p_hash)` :
  - `p_org` : l'organisation de l'adresse (`resolveOrg`, comme `readPublicNode`) ;
  - la fonction exécute un seul
    `update … set used_at = now() where token_hash = p_hash and org_id = p_org and used_at is null
    and expires_at > now() returning …`, dans sa **propre transaction**, validée avant
    l'écriture ;
  - elle rend la ligne du ticket, ou rien.

  **And** un ticket inconnu, expiré, déjà servi ou d'une autre organisation rend `not_found`
  (404), sans dire lequel. **And** deux envois simultanés du même jeton : un seul passe, l'autre
  rend `not_found`. **And** un échec d'écriture ne rend pas le ticket réutilisable.
- [ ] **AC-f6 — Qui écrit.** **Given** un ticket consommé **Then** le service ouvre
  `createPlatformDb({ caller: { userId: ticket.user_id, email } })` puis
  `resolveIdentity(db, host, { userId, email })`, l'e-mail lu dans `members` par la fonction de
  consommation (ADR-018). **And** une personne qui n'est plus membre : `not_member` ; un droit
  retiré depuis le lien : `forbidden` ; un chemin pris depuis le lien (`create`) : `conflict` ; une
  révision changée depuis le lien : `stale_revision`. Chaque droit est relu par les services
  d'écriture, jamais recopié du ticket.
- [ ] **AC-f7 — Contrôle du contenu.** **Given** un corps lu **Then** :
  - corps vide : `invalid_arguments` ;
  - `file` : octets gardés tels quels ; type fixé par l'extension de `name`, jamais par le corps ;
    taille dans les limites d'AC-a3 et quota relu, sinon `too_large` ;
  - `md` et `csv` : décodés en UTF-8 strict ; un BOM UTF-8 en tête est retiré ; un octet invalide
    rend `invalid_arguments` avec « the file is not UTF-8; convert it first (iconv -f WINDOWS-1252
    -t UTF-8, or Get-Content -Encoding Default | Set-Content -Encoding UTF8) » ;
  - `md` : `\r\n` et `\r` deviennent `\n` ; analysé par `parseMarkdown` en mode tolérant (E10-S01
    AC-a2) ; `OP_TEXT_MAX` et `SECTION_MAX` ne s'appliquent pas, `PAGE_MAX` (300 000 caractères)
    et `BLOCKS_MAX` (1 000 blocs) si, sinon `too_large` ;
  - `csv` : fins de ligne gardées (l'analyseur d'E10-S01 les lit) ; règles d'`table.import`
    (E10-S01 AC-c1, AC-b3), sans la limite de 40 000 caractères, dans la limite de
    `FILTERED_ROWS_MAX` (5 000 lignes), sinon `too_large` ; refus nommés (ligne, colonne, valeur),
    bornés comme tout refus en liste (`MAX_LISTED`, 20, `server/errors.ts`).
- [ ] **AC-f8 — Écriture.** **Given** un contenu accepté **Then** :
  - `file` : le service crée la ligne `files` (`pending`) sous le nœud, envoie l'objet par l'URL
    présignée d'envoi du port, le lit (`head`) et passe la ligne à `ready`, comme AC-a3 et AC-a4 ;
    puis `create` crée la page avec `title`, `summary` et un seul bloc `file`, et `attach` ajoute
    un bloc `file` à la fin de la page. Un échec du bucket laisse la ligne `pending` (purgée,
    AC-a6) et rend `conflict` ;
  - `md` : `create` crée la page avec ses blocs ; `replace` remplace tout le corps par les blocs du
    fichier ;
  - `file` et `md` passent par `writeNode` : révision gardée par `base_revision`, provenance
    `{ origin: "agent", ctx }` du ticket (ADR-011 § 2), publication selon `publish` (D135) ;
  - `csv` : `create` ou `merge` passent par le service de `table.import` (E10-S01), qui pose la
    provenance `{ origin: "import", comment: "Importé de <chemin>" }` ;
  - la réponse est du texte brut, lisible par `curl` : chemin, révision, état (brouillon ou
    publié), adresse de la page, et pour un `md` « N éléments conservés en texte » quand le mode
    tolérant en a gardé.

  **And** un refus est aussi en texte brut, `<code>: <message>`, au statut HTTP de `HTTP_STATUS`
  (`server/errors.ts`), avec les en-têtes `Cache-Control: private, no-store` et
  `X-Robots-Tag: noindex, nofollow`. `--fail-with-body` fait sortir `curl` en erreur et affiche ce
  texte à Claude Code.
- [ ] **AC-f9 — Journal.** **Given** un `upload.link` **Then** il s'inscrit comme tout `call`.
  **Given** un envoi qui a consommé son ticket **Then** une ligne s'écrit sous le `ctx` du ticket :
  `method: "api"`, `tool: "uploads"`, `target` = le chemin, `args` = `{ kind, mode, bytes }`,
  `is_error` et `error` selon l'issue. Le jeton n'apparaît jamais dans le journal. **And** une
  personne qui n'est plus membre : la policy `journal_insert_own` refuse la ligne ; le refus part au
  log serveur (`console.error("[platform] uploads: …")`), pas au journal. Les refus 1 à 4 d'AC-f4 ne
  sont pas journalisés (aucune personne connue).
- [ ] **AC-f10 — Isolation.** **Given** deux organisations A et B **Then** la RLS d'isolation par
  organisation couvre `upload_tickets`. **And** la table entre dans `NEVER_EXPORTED`
  (`scripts/lib/org-transfer.mjs`), par un `push` comme `lexicon` : un ticket ne se transfère pas.
  **And** la suite d'isolation reçoit une ligne dans A et dans B.
- [ ] **AC-f11 — Canaux de sécurité de la route d'envoi.** Chaque canal est nommé, fermé ou ouvert,
  et testé :
  - *fermé* — rejeu : un seul envoi (AC-f5), test « deux fois le même jeton » ;
  - *fermé* — course : deux envois simultanés, un seul passe (AC-f5) ;
  - *fermé* — énumération : 256 bits de hasard, forme contrôlée avant la base, même `not_found` pour
    inconnu, expiré, servi ou autre organisation ; test des quatre cas ;
  - *fermé* — autre organisation : le ticket de A envoyé à l'adresse de B rend `not_found` ;
  - *fermé* — navigateur : toute requête avec `Origin` est refusée (`forbidden`), ce qui ferme un
    POST d'un site tiers ou d'un fichier HTML vu dans la visionneuse qui connaîtrait le jeton ;
    test avec `Origin: null` et `Origin: https://example.invalid` ;
  - *fermé* — droit ou appartenance retirés entre le lien et l'envoi : AC-f6, deux tests ;
  - *fermé* — corps trop gros : refus avant lecture complète (AC-f4), test avec et sans
    `Content-Length` ;
  - *fermé* — HTML servi : un `.html` envoyé devient un fichier joint, vu seulement par la route
    isolée (AC-c3) ; la réponse d'envoi est du texte brut, jamais `text/html` ; test du
    `Content-Type` de la réponse ;
  - *ouvert* — fuite du lien : qui le voit pendant 15 minutes, avant l'envoi, écrit au nom de la
    personne (transcription partagée, journaux de Claude Code, d'un proxy ou de l'hébergeur). Borné
    par l'usage unique, la durée, la destination fixée au lien et le droit relu ; test qu'un ticket
    ne sert que sa destination (un autre `path` n'est jamais pris en compte) ;
  - *ouvert* — débit : aucun rate limiting (hors périmètre) ; les refus 1 à 3 ne coûtent ni
    lecture du corps ni requête en base.

**Hosts sans shell** (fiche D130). Claude ou ChatGPT dans le navigateur n'ont pas de `curl` qui
joigne la plateforme. Deux voies s'ajoutent, sans outil nouveau (ADR-002) :

- [ ] **AC-f12 — Téléchargement par le serveur.** **Given** une `source_url` en `https` publique
  (par exemple un artefact claude.ai publié) **When** `upload.link` **Then** le serveur la
  télécharge et écrit le contenu à la destination, comme un envoi par `curl` (mêmes types, même
  plafond de 1 Mo, mêmes contrôles d'AC-f6 à AC-f8, même provenance).
- [ ] **AC-f13 — Adresse contrôlée.** Le téléchargement refuse, avant toute requête, un schéma autre
  que `https`, un port autre que 443 et une adresse résolue privée, de bouclage, lien-local ou de
  métadonnées d'hébergeur ; il suit au plus 3 redirections, chacune contrôlée de même ; il s'arrête
  à 10 s et au-delà de 1 Mo lus. Test : un cas par règle, résolution DNS doublée.
- [ ] **AC-f14 — Échec du téléchargement.** **Given** un téléchargement qui échoue (refus d'AC-f13,
  réponse ≠ 2xx, trop gros, type refusé) **Then** `call` rend une phrase courte (la cause) et
  `form_url`, sans le contenu ni l'adresse d'origine au journal.
- [ ] **AC-f15 — Formulaire de dépôt.** `form_url` mène à une page de la plateforme, valable
  15 minutes et une fois : elle exige la session web de la personne du ticket (une autre personne,
  ou sans session : refus sans rien consommer), affiche la destination (chemin, genre), prend un
  fichier par glisser-déposer ou sélection, puis dit « Déposé » ; au tour suivant, l'assistant
  relit la destination par `read`. La route du formulaire est une route à session, distincte de la
  porte sans session (ADR-018 § 8), et son adresse est en anglais (E11-S07).
- [ ] **AC-f16 — Règle dite à l'assistant.** La description de `call` et le contrat d'`upload.link`
  disent la règle d'AC-f2.
- [ ] **AC-f17 — Banc.** claude.ai (artefact publié, `source_url`) et ChatGPT (formulaire) jouent le
  dépôt d'un rapport HTML de 100 ko ; le résultat se note dans `docs/mcp-golden-queries.md`.

## Sécurité : canaux

| Canal | État | Test |
|-------|------|------|
| Fichier servi en `text/html` depuis l'origine de l'hôte | Fermé, sauf la route isolée d'AC-c3 : CSP `sandbox` sans `allow-same-origin`, refus hors iframe par `Sec-Fetch-Dest` ; depuis le bucket, `html` et `md` toujours en `attachment` | AC-c6 ; disposition d'un `html` |
| Script d'un `svg` | Fermé : rendu par `<img>`, `attachment` à la navigation | Disposition de l'URL d'un `svg` |
| Type déclaré par le client | Fermé : type et taille signés dans l'URL d'envoi, contrôlés par `head` ; type de lecture fixé par `response-content-type` ; par lien, type fixé par l'extension de `name` | Taille ou type différent à `complete` |
| Nom d'origine dans la clé | Fermé : clé `<org_id>/<id>` | Unitaire sur la clé |
| Autre organisation, nœud illisible, fichier `pending` | Fermé : `not_found` | Intégration |
| Fichier d'un autre nœud cité dans un bloc ou lu par `read {file}` | Fermé : refusé par `writeNode` et par `read` ; la duplication copie | AC-d2, AC-d3, AC-e3 |
| Fichier d'un brouillon ou hors périmètre par un lien public | Fermé : fichier cité par un bloc publié du périmètre seulement | AC-c5, AC-e1 |
| Scripts d'un fichier HTML | Fermés ou nommés un par un | AC-c6 (F1 à F16, O1 à O7) |
| Porte d'envoi sans session | Voir AC-f11 | AC-f11 |
| Adresse fournie à télécharger | Fermé : schéma, port, adresse résolue et redirections contrôlés | AC-f13 |
| URL de lecture présignée | **Ouvert** : rejouable 60 s par qui la détient | Durée de 60 s vérifiée |
| URL d'envoi | **Ouvert** : réutilisable 5 min, même après `complete` (même type, même taille) | Durée de 5 min vérifiée |
| Clés du bucket | **Ouvert** : accès complet au bucket, dans `server/` seulement, jamais dans `ui/` ; jamais la clé `service_role` | `rg PLATFORM_STORAGE packages/plateforme/ui` vide |
| Contenu malveillant d'un type admis (macro, PDF piégé) | **Ouvert** : aucune analyse (hors périmètre) | — |
| `X-Content-Type-Options: nosniff` | **Ouvert** : dépend du fournisseur S3 ; seuls les images, le PDF, le `txt` et le `csv` sont `inline`, depuis l'origine du bucket | — |

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
- `duplicate_subtree` remplacée (AC-e3), mêmes droits ;
- `public_file_by_token(p_org uuid, p_token text, p_file uuid)` : `security definer`,
  `search_path` vide, `REVOKE` puis `GRANT` à `anon` ; rend la clé, le `mime` et le nom, ou rien ;
- table `upload_tickets` : `id uuid`, `org_id uuid not null` (références `orgs`),
  `user_id uuid not null`, `ctx text`, `token_hash text not null unique`, `kind text not null`
  (check `file`, `md`, `csv`), `mode text not null` (check `create`, `attach`, `replace`,
  `merge`), `target_path text not null`, `name text`, `title text`, `summary text`, `key text`,
  `base_revision integer`, `publish boolean`, `expires_at timestamptz not null`,
  `used_at timestamptz`, `created_at timestamptz not null default now()` ; index
  `(org_id, expires_at)` pour le ménage ; RLS d'isolation par organisation (`member_orgs()`) ;
- `consume_upload_ticket(p_org uuid, p_hash text)` : `security definer`, `search_path` fixé,
  `grant execute` à `anon` seul : l'`update` conditionnel d'AC-f5 ; rend `user_id`, l'e-mail de
  `members` (null si la personne n'est plus membre), `ctx`, `kind`, `mode`, `target_path`, `name`,
  `title`, `summary`, `key`, `base_revision`, `publish`. Elle ne lit que la ligne de cette
  empreinte dans cette organisation.

### Schémas Zod partagés
- `packages/plateforme/schemas/files.ts` : `FILE_TYPES` (extension ↔ mime : `png`, `jpeg`/`jpg`,
  `gif`, `webp`, `svg`, `pdf`, `csv`, `txt`, `md`, `html`, `docx`, `xlsx`, `pptx`, `odt`, `ods`,
  `zip`), `IMAGE_TYPES`, `TEXT_TYPES`, `VIEWABLE_TYPES`, `FILE_MAX_BYTES`, `TEXT_FILE_MAX_BYTES`,
  `ORG_QUOTA_BYTES`, `fileRequestSchema`, `fileIdSchema`, `fileReadQuerySchema` (`disposition`),
  `fileViewParamSchema` (`view`). Exportés par `schemas/index.ts` (fichier d'ajout).
- `schemas/blocks.ts` : bloc `file` (`{file_id, name, size, mime}`) ; `image.data` = `src`
  (`https`) **ou** `file_id`, et `width` facultatif (`small`, `medium`, `full`).
- `schemas/nodes.ts` : champ `file` de `readNodeSchema` (AC-d2).
- `schemas/uploads.ts` : `uploadLinkSchema` (entrée d'`upload.link`, strict, `mode`, `name` et
  `publish` contraints par `kind`), `UPLOAD_TOKEN_PATTERN`, `UPLOAD_BYTES_MAX` (1 048 576),
  `UPLOAD_TTL_MINUTES` (15).

### Fichiers à créer
- `migrations/` : `<horodatage>_files.sql`.
- `server/` : `files/store.ts` (port, `fileStore()`), `files/s3.ts`, `files/memory.ts`,
  `files/service.ts` (demande, confirmation, lecture, lecture publique, `readFileText`, purge,
  copie, envoi par le serveur pour AC-f8), `files/html.ts` (en-têtes et service des deux routes
  HTML), `uploads.ts` (`createUploadTicket`, `consumeUpload`, commandes rendues ; le jeton en une
  ligne, `randomBytes(32).toString("base64url")`), `uploads-fetch.ts` (téléchargement contrôlé,
  AC-f13), `catalog/upload-link.ts` (`defineFunction` d'`upload.link` : connecteur `upload`, classe
  `write`, origine `paquet`, exemples, refus).
- `schemas/` : `files.ts`, `uploads.ts`.
- `api/` : `files.ts` (`GET files`, `POST files`, `POST files/<id>/complete`, `GET files/<id>`,
  `GET files/<id>/markdown`), `files-html.ts` (branche avant le dispatch de `files/<id>/html`),
  `uploads.ts` (`isUploadRoute`, `uploadResponse` : AC-f4, lecture bornée du corps, réponse en
  texte brut, sur le modèle d'`api/public.ts`), la route à session du formulaire (AC-f15).
- `ui/` : `noeud/fichier-du-bloc.tsx` (carte, « Voir », image interne, états),
  `noeud/visionneuse-de-fichier.tsx` (en-tête, bannière, iframe, blocs d'un `.md`),
  `noeud/editeur/envoi-de-fichier.ts` (demande, envoi XHR, confirmation, annulation),
  `noeud/editeur/choix-au-depot.tsx` (AC-b5), l'écran du formulaire de dépôt (AC-f15).
- `scripts/lib/org-transfer-files.mjs` : lecture et écriture des objets pour l'export et l'import.
- Tests : voir § Tests attendus.

### Fichiers à modifier
- `schemas/` : `blocks.ts`, `blocks-render.ts` (markdown d'AC-d1), `nodes.ts`, `index.ts` (fichier
  d'ajout).
- `server/` : `nodes/markdown-parse.ts`, `nodes/links.ts` (`case "file"`), `procedures-check.ts`
  (`file` : `name` ; `image` : `file_id` sans `src`), `nodes/write.ts` (AC-d3), `nodes/read.ts`
  (champ `file`), `nodes/read-pages.ts` (`requestKey`), `nodes/trash.ts` (`purgeTrash`, AC-e2),
  `nodes/duplicate.ts` (AC-e3), `shares.ts` (`readPublicFile`), `catalog/registry.ts`
  (`upload.link` dans `catalogFunctions()`), `catalog/contracts.ts` (phrase d'AC-f2 dans le
  contrat de `write`), `index.ts` (fichier d'ajout).
- `mcp/tools.ts` : description de `read` allongée d'une phrase sur `file` (ADR-002 : une
  description ne fait que s'allonger).
- `api/` : `handler.ts`. Table de dispatch (fichier d'ajout), branches avant le dispatch
  (`files/<id>/html`, `uploads/<jeton>`, lignes ajoutées seulement), **et** `RouteResult` étendu
  par `redirect?: string` pour la 302 : changement hors ajout, nommé au rayon d'impact.
  `public.ts` : `isPublicRoute` et `publicResponse` étendus à `public/<jeton>/files/<id>`,
  `…/markdown` et `…/html`.
- `ui/` : `noeud/rendu-des-blocs.tsx` (`ImageDuBloc`, `case "file"`, prop `adresseDeFichier`),
  `noeud/editeur/modele.ts`, `noeud/editeur/champ-de-bloc.tsx`, le choix « Insérer » d'E10-S06,
  `coque/import-de-fichier.tsx` (E10-S01, pour AC-b5), `noeud/ecran-de-noeud.tsx` (visionneuse
  sur `view`), `public/page-publique.tsx` (adresses par jeton, visionneuse sur `view`).
- Hôte et outillage : `src/app/(dashboard)/n/[...chemin]/page.tsx` et
  `src/app/p/[jeton]/[[...chemin]]/page.tsx` (passer `view` à l'écran) ; `next.config.ts`
  (exclusion des deux routes HTML dans `headers()`) ; `scripts/lib/org-transfer.mjs` (`TABLES` :
  ligne `files` ; `NEVER_EXPORTED.push('upload_tickets')`), `scripts/org-export.mjs`,
  `scripts/org-import.mjs`, `.env.example` (cinq variables, vides), `packages/plateforme/README.md`.
  Le README décrit les variables, le CORS du bucket (`PUT` et `GET` depuis l'origine de l'hôte,
  en-têtes `content-type`), l'exemple de Supabase Storage par son point d'accès S3 avec des clés
  d'accès S3 (jamais `service_role`), la CSP d'un hôte (`img-src` et `connect-src` admettent
  l'origine du bucket, `frame-src 'self'`), et l'absence d'`X-Frame-Options` et de CSP globale sur
  `/api/plateforme/files/*/html` et `/api/plateforme/public/*/files/*/html`.
- Tests partagés : `tests/helpers/block-cases.ts`, `tests/integration/isolation/donnees.ts`
  (`seedRows` : une ligne `files` et un ticket dans B ; `PARENTS` inchangé),
  `tests/integration/isolation/tables.test.ts` (`created_by` et `user_id` déjà dans `AUTHORS` ;
  `CREATION.upload_tickets` pose un `token_hash` neuf), `tests/integration/isolation-par-table.test.ts`,
  `tests/integration/org-transfer.test.ts`, `tests/unit/__snapshots__/mcp-tools.test.ts.snap`
  (champ `file`, description de `read` allongée).
- Dépendance : `aws4fetch`, version exacte, dans `dependencies` du paquet et `devDependencies` de
  la racine (scripts), justifiée dans le rapport pour `tech-stack.md`. Pas de SDK AWS.

### Points de départ
- Oto, `oto_mcp/media_store.py` (`C:\apps\oto-backend`). On reprend : la lecture par URL
  présignée courte, le bucket privé sans ACL publique, cinq variables (`OTO_MCP_S3_*` : endpoint,
  région, bucket, deux clés). On retire : `boto3` (Python ; ici `aws4fetch`), le téléversement
  par le serveur pour l'écran (ici, envoi direct au bucket), les images publiques par ACL (ici,
  tout passe par une route qui décide), le nommage propre à Oto.
- `packages/plateforme/api/public.ts` et `server/shares.ts` l. 203 (`readPublicNode`) : la porte
  avant le jeton, l'organisation de l'adresse et la fonction `security definer` sous `anon`, pour
  la route d'envoi et les routes publiques ; on retire la lecture seule et la réponse JSON.
- Visionneuse : l'artefact de Claude ouvert seul (bannière, contenu en pleine fenêtre).
- Banc (`C:\apps\mcp-test`) : aucun.

### Patterns à suivre
- `uploads-patterns.md` : URL signée au-delà de 1 Mo, nom d'origine jamais dans la clé, contrôle
  côté serveur, progression, annulation, dépôt accessible au clavier, limites affichées avant.
- `uploads-patterns.md § Règles` (« `next/image` ») ne s'applique pas à `ui/`, qui n'importe pas
  Next : c'est l'exception déjà écrite sur `<img>` dans `ImageDuBloc`.
- `supabase-patterns.md § Couplage à Supabase` : aucun appel à `supabase.storage`, aucune
  nouvelle dépendance à Supabase.
- `security-patterns.md § Droits dans le service` : chaque refus est décidé avant la requête ; le
  ticket prouve qui et où, le droit se relit à l'envoi. ADR-017 à la lettre : tout écart d'en-tête
  ou de `sandbox` est une HAUTE de sécurité.
- `security-patterns.md § CSRF Protection` : toute `Origin` est refusée par la route d'envoi.
- `security-patterns.md § Idempotence et mutations concurrentes` : consommation par un `update`
  conditionnel, `conflict` et `stale_revision` précédés de leur `console.error`.
- `database-patterns.md` : RLS d'isolation, migration additive, règles `SECURITY DEFINER`.
- `mcp-patterns.md § 4` : refus bornés, en anglais, qui disent quoi faire ensuite.
- `accessibility-patterns.md` : `title` de l'iframe, nom accessible de « Voir », dialogue du choix
  au dépôt, focus rendu à la fermeture.
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
  `mcp/server.ts` et `server/nodes/write.ts`. Le contrôle d'AC-d3 dans `writeNode` couvre donc
  l'écran, `write` et le dépôt par lien.
- `readNodeSchema` : `mcp/schemas.ts` l. 44 (schéma servi aux hosts, champ ajouté) ; exclusions de
  `read` : le refus existant de `section` et `outline` le nomme.
- Purge : `rg -n "purgeTrash\(" packages` rend `server/nodes/trash.ts` seulement (définition,
  `trashNode`, `listTrash`). `rg -n "purge" packages/plateforme/server -l` rend aussi
  `server/index.ts` (export) et `nodes/publish.ts`, `tables/evolution-checks.ts`,
  `tables/evolution-publish.ts`, sans rapport (lignes d'un tableau). Les tickets ne s'y
  rattachent pas (AC-f3).
- Duplication : `rg -n "duplicate_subtree" packages/plateforme -g '!*.sql'` rend
  `server/nodes/duplicate.ts` et `server/database.ts` (types générés, à régénérer). La fonction
  recopie `blocks` et `node_versions` avec le même `data`, donc le même `file_id` sans AC-e3.
- Partage public : `rg -n "readPublicNode\(" packages src` rend `server/shares.ts`,
  `api/public.ts` et `src/app/p/[jeton]/[[...chemin]]/page.tsx`. `rg -n "isPublicRoute" packages`
  rend `api/public.ts` et `api/handler.ts`. Une route sous `src/app/p/[jeton]/files/` serait
  captée à la place d'une sous-page de chemin `files/…` : aucun segment de chemin n'est réservé
  (`rg -n -i "reserved" packages/plateforme/server/nodes/segments.ts` ne trouve rien). D'où les
  routes du paquet et le paramètre `view` sur l'adresse du contenu (C1).
- Portes sans session : `rg -n "isPublicRoute|accessToken" packages/plateforme/api` →
  `api/handler.ts` (seule `GET public/<jeton>` passe avant le jeton) et `api/public.ts`. Les routes
  d'envoi et HTML s'ajoutent au même endroit, sans rien ouvrir d'autre.
- Réponses de la porte : `rg -n "new Response\(|Response.redirect" packages/plateforme/api` ne
  trouve rien. Toutes les routes rendent du JSON (`RouteResult`). La 302 demande d'étendre
  `RouteResult`, pour `files` seulement ; les routes HTML et d'envoi rendent leur `Response` avant
  le dispatch.
- Création d'un client de base : `rg -n "createPlatformDb\(" packages/plateforme --glob "!**/*.test.ts"`
  → `api/handler.ts`, `mcp/handler.ts`, `mcp/admin/handler.ts` : toujours sur un appelant vérifié.
  `server/uploads.ts` sera le premier à le bâtir sur une ligne en base (ADR-018).
- Catalogue : `rg -n "catalogFunctions\(\)" packages/plateforme` → la recherche de `find`, le
  contrat servi par `read` et la description de `call` voient une fonction de plus.
- En-têtes globaux de l'hôte : `next.config.ts` l. 20-30 (`X-Frame-Options: DENY`,
  `Referrer-Policy`).
- Paramètres de l'adresse du nœud : `rg -n "searchParams|parametres\." "src/app/(dashboard)/n"` →
  `version` et les réglages d'un tableau ; `view` s'y ajoute, pour une page seulement.
- Écouteurs de messages : `rg -n "addEventListener\(.message" packages/plateforme src` → aucun ; la
  visionneuse n'en ajoute pas.
- Transfert : `org-export.mjs` écrit un seul JSON (`writeFileSync`, `org-export.mjs` l. 97) ;
  `deepReplace` (`org-transfer.mjs`) remplace déjà les uuid dans `blocks.data` et
  `node_versions.blocks`.

### Doublons
- `component-registry.md` : le dépôt de fichier d'E10-S01 (`import-de-fichier.tsx`) est réutilisé
  pour le choix du fichier et pour « Insérer le contenu » d'AC-b5. `Dialog` (`ui/ds/react/dialog.tsx`)
  est réutilisé pour l'agrandissement et le choix au dépôt. La carte de fichier n'existe pas :
  `rg -n "Télécharger" packages/plateforme/ui` ne trouve rien. Le rendu des blocs en lecture seule
  (`rendu-des-blocs.tsx`) est réutilisé par la visionneuse d'un `.md`.
- Rendu en iframe : `rg -n "iframe" packages/plateforme/ui src` → aucun. Créer.
- Stockage : `rg -n -i "presign|filestore|\bs3\b" packages/plateforme` ne trouve qu'un
  commentaire (`server/admin/journal.ts` l. 10 : « retiré : l'export S3 »). Verdict : créer le
  port.
- Signature S3 dans les scripts : `scripts/lib/org-transfer-files.mjs` appelle `aws4fetch`
  directement, sans reprendre `server/files/s3.ts`. Les scripts sont du `.mjs` sans compilation et
  n'importent pas le TypeScript du paquet (`rg -n "packages/plateforme" scripts/*.mjs` : seulement
  `cli/index.mjs`). Verdict : laisser les deux ; les quatre appels restent minces.
- Jeton aléatoire : `rg -n "randomBytes\(32\)" packages/plateforme` → `server/shares.ts` l. 36,
  fonction privée, jeton gardé en clair. Verdict : laisser ; une ligne écrite dans `uploads.ts`,
  avec l'empreinte en plus.
- Envoi d'un fichier : l'écran envoie au bucket par URL présignée (lot a) ; le dépôt par lien
  (lot f) envoie par le serveur, sous 1 Mo, par la même URL présignée du port. Verdict : une seule
  fonction d'enregistrement dans `files/service.ts` (ligne, envoi, `head`, `ready`), appelée par
  les deux.
- Lecture bornée d'un corps : `rg -n "getReader\(\)|for await \(const chunk" packages/plateforme` rend la porte du
  dépôt (`api/uploads.ts`), le téléchargement d'une adresse fournie (`server/uploads-fetch.ts`) et le texte d'un
  fichier joint (`server/files/service.ts`, `boundedBytes`) : trois boucles qui lisent, coupent à la borne et
  assemblent. Verdict : fusionner, un seul lecteur `readBounded` (`server/bounded-read.ts` : source, borne, refus),
  chacun gardant son refus (correction 1, M1).
- Réponses de la porte : `rg -n "function (errorResponse|asPlatformError|jsonFailure|asFailure|originOf)|Cross-origin request refused" packages/plateforme/api packages/plateforme/server`
  rend `handler.ts` (`errorResponse`, `asPlatformError`, contrôle d'origine) et leurs copies dans `api/uploads.ts`
  (`jsonFailure`, `asFailure`, `originOf`, contrôle d'origine), plus `originOf` de `server/uploads.ts`, qui réécrivait
  `webUrl`. Verdict : fusionner dans `api/session.ts` (`errorResponse`, `asPlatformError`, `addressOrigin`,
  `requireSameOrigin`), lus par `handler.ts` et `api/uploads.ts` ; `server/uploads.ts` lit `webUrl` (décision du
  pilote, correction 1, M1 et M2).

### Effet produit
- Schéma `platform` et RLS : deux tables, un type de bloc, deux fonctions modifiées, deux
  fonctions `security definer`. Ⓜ : la migration s'applique et fusionne avant toute autre fusion
  (`.method/sprint/vagues.md § Base de test et migrations`).
- Hôte : cinq variables nouvelles, facultatives ; sans elles, rien ne change. `next.config.ts`
  (deux routes HTML) et les deux pages qui passent `view`. Une page ajoutée, celle du formulaire de
  dépôt (`src/app/(dashboard)/upload/[token]/page.tsx`, AC-f15, HN-E10S02-95) : ce que tout ERP
  écrirait pour monter l'écran du paquet (session revérifiée, `uploadForm`, `EcranDeDepot`), sans
  aucun service propre au SaaS (`CLAUDE.md § Projet`, gardes de portabilité). Le paquet impose ainsi à
  l'hôte deux chemins : `/upload/<token>` (adresse de `form_url`) et `/n/<chemin>` (adresse de la
  page écrite, dite par la réponse d'un envoi), comme il impose déjà `/admin/connecteurs`.
- Migrations copiées par l'hôte : une de plus (`pnpm check:migrations`).
- MCP : `read` rend deux formes nouvelles et gagne le champ `file` ; `write` accepte les deux
  formes ; une fonction au catalogue de `call` ; le contrat de `write` gagne une phrase. Liste
  d'outils inchangée (ADR-002).
- Partage public : fichiers et visionneuse par jeton, bannière.
- Sécurité : une porte sans session qui écrit (ADR-018), une requête vers une adresse fournie, une
  route qui sert du HTML d'auteur (ADR-017).
- Corbeille, duplication, transfert d'organisation, suite d'isolation : touchés (lots e et f).
- Journal : des lignes `api` qui portent un `ctx` ; la vue d'une conversation par `ctx` (E03-S08)
  les montre.
- Porte HTTP : `RouteResult.redirect`, lu par la seule ressource `files`.

### Refacto
- Écarté : unifier `image` et `file` en un seul bloc. L'image a un rendu, une largeur et un texte
  alternatif propres, et le type `image` existe déjà dans les contenus publiés.
- Écarté : servir un fichier HTML depuis une origine séparée (ADR-017, alternatives).
- Écarté : exporter `newToken` de `server/shares.ts` dans un module commun. Une ligne ; le jeton
  des liens publics est gardé en clair, celui-ci en empreinte.

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
- **HN-E10S02-5** : « Voir » d'un PDF, d'un `txt` ou d'un `csv` ouvre le fichier `inline` depuis
  l'origine du bucket, jamais de l'hôte : la règle d'ADR-016 § 5 tient (source : le plus simple ;
  le navigateur les affiche seul).
- **HN-E10S02-6** : l'écran apprend l'état du stockage par `GET files` plutôt que par une
  propriété posée par l'hôte, pour n'ajouter aucun fichier à l'hôte (source : le plus simple ;
  C1).
- **HN-E10S02-7** : pas de colonne `sha256` : aucun comportement ne la lit (source :
  `CLAUDE.md § Justifier une surface nouvelle` ; ADR-016 § 3 amendé par le pilote).
- **HN-E10S02-8** : un bloc n'est écrit qu'après `complete`. Aucun bloc, brouillon ou publié (écrire publie,
  D135), ne cite une ligne `pending` (source : le plus simple ; AC-a6 purge sans casser de bloc).
- **HN-E10S02-9** : un fichier texte (`html`, `md`, `txt`, `csv`) fait 4 Mo au plus : la route HTML
  et `read {file}` le lisent par le serveur, sous la coupure de Vercel à 4,5 Mo
  (`uploads-patterns.md § La limite de 1 Mo décide de l'architecture`) (source : simple).
- **HN-E10S02-10** : la visionneuse vit à l'adresse du contenu, `?view=<id>`, dans l'organisation
  comme en public : aucune route de l'hôte n'est ajoutée, et `/p/<jeton>/files/…` serait pris
  pour un chemin (source : le plus simple ; C1).
- **HN-E10S02-11** : le fichier HTML occupe la hauteur de la fenêtre de la visionneuse : aucun
  script de hauteur ni message entre l'iframe et l'écran (source : le plus simple ; ferme un
  canal).
- **HN-E10S02-12** : HTML refusé hors iframe par `Sec-Fetch-Dest` ; un navigateur qui ne l'envoie
  pas est servi. `allow-forms` ajouté, l'envoi réel reste bloqué par `form-action 'none'`. Canaux
  DNS, WebRTC et `meta refresh` acceptés et nommés ; `base-uri 'none'` (source : décision C10,
  ADR-017).
- **HN-E10S02-13** : `read {file}` sert le texte d'un fichier texte joint au nœud de `path`, sous
  le droit de lecture du nœud, exclusif de `section`, `outline`, `since_revision` et `draft`
  (source : JB, 2026-09-29, fiche D119 ; ADR-002, ajout facultatif).
- **HN-E10S02-14** : `write` n'a aucune forme qui crée un fichier ; un assistant dépose par
  `upload.link` (source : JB, 2026-09-29, fiche D137 ; ADR-009).
- **HN-E10S02-15** : nom `upload.link`, connecteur `upload` (source : simple ; `table.*` fixe la
  forme `<espace>.<verbe>`).
- **HN-E10S02-16** : 15 minutes, un envoi, 1 Mo par la route d'envoi (sous la coupure de Vercel à
  4,5 Mo) ; un fichier plus gros se joint à l'écran (source : simple).
- **HN-E10S02-17** : l'envoi est journalisé sous le `ctx` du ticket, même après la fin de la
  conversation (source : H04 et journal d'E03-S01).
- **HN-E10S02-18** : un `.md` envoyé est lu en mode tolérant, avec « N éléments conservés en
  texte » ; `write` reste strict (source : décision du pilote C2).
- **HN-E10S02-19** : `file` en `create` ou `attach`, `csv` en `create` ou `merge` ; `base_revision`
  exigée hors `create` ; requête avec `Origin` refusée ; organisation de l'adresse égale à celle du
  ticket ; consommation dans sa propre transaction ; tickets expirés supprimés à chaque
  `upload.link` (source : décision du pilote C10).
- **HN-E10S02-20** : classe `write`, pas `sensitive` : le dépôt ne fait rien d'autre qu'une écriture
  que `write` ferait (source : `catalog/define.ts` l. 12, « sensitive : envoie, supprime ou
  paie »).
- **HN-E10S02-21** : les refus 1 à 4 d'AC-f4 ne consomment pas le ticket, pour qu'un fichier trop
  gros se corrige sans nouveau lien (source : simple).
- **HN-E10S02-22** : une page reçoit la provenance `agent` avec le `ctx` du ticket, un tableau la
  provenance `import` d'E10-S01 (source : ADR-011 § 2, décision du pilote C10).
- **HN-E10S02-23** : `upload.link` n'est pas admis dans un bloc `call` de procédure : son
  `checkArgs` rend « upload.link is called by an assistant, not by a procedure » (source : simple ;
  le lien n'a de sens que dans une conversation).
- **HN-E10S02-24** (lot a) : `node` de `fileRequestSchema` est le chemin du nœud (`nodePathSchema`), lu par
  `findNode` (ancien chemin compris), comme toute route de la porte (source : `api/nodes.ts`, `api/tables.ts`
  nomment un nœud par `path` ; le plus simple pour l'écran, qui tient le chemin).
- **HN-E10S02-25** (lot a) : le type d'un fichier vient de l'extension de `name` (`FILE_TYPES`) ; le `mime` du
  corps est reçu (chaîne de 255 caractères au plus, vide admis) mais jamais cru, et la ligne porte le type de
  l'extension, signé dans l'URL d'envoi et renvoyé dans `upload.headers` (source :
  `uploads-patterns.md § Validation`, « `file.type` vient du client » ; un `.md` arrive sans type et un
  `.csv` en `application/vnd.ms-excel` sous Windows ; même règle que le dépôt par lien, AC-f7).
- **HN-E10S02-26** (lot a) : sans stockage, `GET files/<id>` et `POST files/<id>/complete` refusent aussi par
  `not_enabled`, avant de lire la ligne (source : ADR-016 § 2, « l'API refuse par `not_enabled` »).
- **HN-E10S02-27** (lot a) : la demande ne contrôle pas le genre du nœud : AC-a3 n'en nomme aucun ; un fichier
  se joint à tout nœud que la personne écrit, et `writeNode` décidera quels blocs le citent (lot d) (source :
  AC-a3 à la lettre ; le genre n'est fixé que pour `upload.link`, AC-f1).
- **HN-E10S02-28** (lot a) : la forme de l'image interne (`file_id` ou `src`, jamais les deux ; `width`) entre
  en base avec le bloc `file`, dans la même redéfinition de `blocks_shape_check` : une seule redéfinition de la
  contrainte dans la migration de la story. Le schéma Zod des blocs (`schemas/blocks.ts`), le rendu et le
  markdown restent aux lots b et d : d'ici là, seule la base connaît ces formes (source : le plus simple ; la
  contrainte recopiée deux fois dans un fichier serait deux sources à tenir égales).
- **HN-E10S02-29** (lot a) : privilèges de `files` à `authenticated` seul, sans `service_role` : la ligne de base
  V1 n'accorde rien à `service_role` (en-tête de `20260928100000`, E01-S12) ; « sur le modèle d'E01-S12 c » se
  lit ainsi. Insertion attribuée à l'appelant sur un nœud de l'organisation, mise à jour de `status` seule
  (source : `node_shares`, même forme).
- **HN-E10S02-30** (lot a) : verrou consultatif du quota de classe 7501, après 7401
  (`database-patterns.md § Transactions`) (source : simple).
- **HN-E10S02-31** (lot a) : adresses S3 en chemin (`<endpoint>/<bucket>/<clé>`), servies par MinIO, Scaleway et
  le point d'accès S3 de Supabase, qui l'exige (source : simple ; ADR-016 § 1). Un fournisseur qui n'admet que
  l'adresse en sous-domaine demanderait une option (non livrée).
- **HN-E10S02-32** (lot a) : une panne du bucket (réseau, délai, 5xx) rend `internal` « File storage
  unreachable. Retry later. », le détail au log serveur sans l'adresse signée ; `readFileText` au-delà de 4 Mo
  lus rend `too_large` ; un objet que le bucket rend en 403 ou 404 vaut absent, à la lecture du texte (`not_found`)
  comme au `HEAD` du port (`head()` rend `null` : `conflict` à la confirmation, `available: false` à la
  vérification d'une carte) (source : AC-a8 ; `supabase-patterns.md § Error Handling`, jamais le texte d'un service
  extérieur au client ; correction 1).
- **HN-E10S02-33** (lot a) : `POST files` répond 201 (une création, comme `nodes/duplicate`) ; `POST
  files/<id>/complete` prend le corps JSON de tout `POST` de la porte (`{}`), sans le lire (source : `serve`,
  `api/handler.ts`, lit le JSON de tout `POST`).
- **HN-E10S02-34** (lot a) : `PLATFORM_STORAGE_ENDPOINT` qui n'est pas une adresse `http(s)` lève
  `PlatformConfigError` (une panne dite, au log serveur), pas `null` : `null` reste réservé à une variable
  absente (AC-a1) (source : `mcp-patterns.md § 6 bis`, une configuration fausse échoue bruyamment).
- **HN-E10S02-35** (lot a, correction 1) : la ligne de `files` entre dans `TABLES` (`scripts/lib/org-transfer.mjs`)
  avec sa table, colonnes de la migration, `created_by` à `null` pour une personne absente, `node_id` remplacé ;
  avec elle, une ligne de `files` dans A et dans B et ses trois écritures dans `isolation-par-table.test.ts`, une
  ligne dans l'organisation source d'`org-transfer.test.ts` (qui exige chaque table de la carte non vide), la ligne
  de B de `tests/integration/isolation/donnees.ts` et l'état de création `pending` de `isolation/tables.test.ts`.
  Le filtre des seules lignes `ready`, la réécriture des `file_id` des blocs et la copie des objets viennent avec
  le transfert des fichiers (lot e, AC-e4) : d'ici là, l'export porte aussi les lignes `pending` et l'import des
  lignes sans leurs objets (source : `database-patterns.md § Règles`, « dans la même story » ; décision du pilote,
  option A).
- **HN-E10S02-36** (lot b) : le genre d'un fichier joint vient de son extension : une image (`png`, `jpeg`, `jpg`,
  `gif`, `webp`, `svg`) devient toujours un bloc `image`, même choisie par « Fichier » ; tout autre type admis, un bloc
  `file` (source : AC-b1 et AC-b2, « un fichier d'un autre type admis » ; le plus simple).
- **HN-E10S02-37** (lot b) : l'écran apprend l'état du stockage par `GET files` au premier geste qui en a besoin
  (le « + » survolé ou atteint au clavier, un collage, un dépôt), jamais au montage ; une lecture en échec n'est pas
  retenue. Tant qu'il ne le sait pas, « Image » et « Fichier » n'apparaissent pas (source : HN-E10S02-6 ; une lecture
  au montage ajouterait une requête à chaque ouverture de page et changerait les appels simulés de tous les tests de
  l'éditeur).
- **HN-E10S02-38** (lot b) : « Image » et « Fichier » sont au « + » seul (groupe « Insérer »), pas dans « / » : « / »
  change un Texte vide en bloc, un fichier se joint après un bloc (source : AC-b1 ne nomme que le « + » ; le plus
  simple).
- **HN-E10S02-39** (lot b) : « Image » et « Fichier » ouvrent un dialogue (`Dialog`, la zone de dépôt d'E10-S01
  exportée avec `accepte`) qui dit types et limites avant la sélection, plutôt que le sélecteur du système seul
  (source : AC-b4 ; `uploads-patterns.md § Côté composant` ; § Doublons de la story).
- **HN-E10S02-40** (lot b) : un dépôt ou un collage joint un fichier, le premier, comme l'import d'E10-S01 (source :
  `deposerUnFichier`, `DepotSurLeTableau` ; le plus simple).
- **HN-E10S02-41** (lot b) : un fichier lâché sur une rangée, sur son champ ou non, est reçu par la rangée
  (`rangee-de-bloc.tsx`), plus par le champ. Stockage désactivé : le comportement d'E10-S01 inchangé (un `.md`
  inséré, sinon son refus) ; stockage activé et extension non admise : le refus nomme les formats admis, sous le bloc
  (source : AC-b4, AC-b5 ; le plus simple).
- **HN-E10S02-42** (lot b) : le texte alternatif et la largeur s'écrivent par le geste existant `modifierLeBloc`
  (différé de 1 200 ms, envoi à la sortie du champ), comme un tableau ou un repli ; `image` et `file` rejoignent le
  séparateur parmi les blocs écrits sans champ de texte (`SANS_TEXTE`, `operations.ts`) : jamais vides, ils partent
  comme un texte (source : E10-S06 ; le plus simple).
- **HN-E10S02-43** (lot b, correction 1) : la carte d'un fichier demande une fois montée, par un `useEffect`, si le
  stockage sert encore l'objet : `GET /api/plateforme/files/<id>?check` rend `{ data: { available } }` en JSON, sans
  redirection (`fileAvailability`, `server/files/service.ts` : la ligne `ready` sous le droit de lecture du nœud,
  décidé dans le service comme la lecture, puis `head()` du port) ; aucun octet ne sort du bucket, aucun CORS n'est
  en jeu. Ce qui n'est pas lisible rend la même `not_found` que la lecture. L'écran (`fichierDisponible`,
  `ui/api/client.ts`) dit « Fichier indisponible » sur `available: false`, `not_found` ou `not_enabled` ; une panne
  (réseau, stockage, session) ne dit rien, la carte reste telle quelle. L'effet est l'exception écrite de
  `state-management.md § Règle d'or`. Une image le dit par `onError` ; une image `https` externe reste telle quelle
  (AC-b7) (source : AC-b8 à la lettre ; décision du pilote, option B ; coût : une requête et un `HEAD` par carte
  affichée).
- **HN-E10S02-44** (lot b) : « Voir » d'un `html` ou d'un `md` mène à `?view=<id>`, relatif à l'adresse de la page
  où l'on est (`/n/…` comme `/p/<jeton>/…`) ; d'ici le lot c, il ouvre la page elle-même dans un onglet (source :
  AC-c1 ; le plus simple).
- **HN-E10S02-45** (lot b) : les formes Zod ajoutées par le lot b obligent `renderBlock` à les rendre ; d'ici le lot d,
  `![<alt>](/api/plateforme/files/<id>)` et `[<nom>](/api/plateforme/files/<id>)`, relatives, par `filePath`
  (`schemas/files.ts`), que le lot d rend absolues avec taille et type (AC-d1) (source : HN-E10S02-28 ; type-check).
- **HN-E10S02-46** (lot b) : l'envoi en cours est une rangée locale du modèle (type `depot-local`, jamais envoyée :
  sans forme et hors de `SANS_TEXTE`), sans « + » ni poignée ; comme tout bloc neuf, elle retient la reprise des blocs
  servis jusqu'à sa confirmation ou son retrait (source : HN-E10S02-8 ; règle des blocs neufs de `use-editeur.ts`).
- **HN-E10S02-47** (lot b) : un refus du stockage à l'envoi (`PUT` hors 2xx) se lit `internal` (« Le stockage des
  fichiers ne répond pas »), une coupure du réseau `reseau` (source : HN-E10S02-32).
- **HN-E10S02-48** (lot b) : un CSV importé en tableau (AC-b5, AC-b6) prend la première adresse libre
  `<page>/<segment du nom>` sous la page, comme l'import d'E10-S01 sous un nœud (`adressesAEssayer`, sans l'arbre
  visible) (source : E10-S01).
- **HN-E10S02-49** (lot b) : largeurs d'une image : `small` un tiers, `medium` deux tiers, `full` toute la colonne de
  lecture (source : le plus simple ; référence UI `N/A`).
- **HN-E10S02-50** (lot b) : l'écran propose les fichiers dans tout nœud qu'il écrit (page, procédure, Contexte) ;
  `writeNode` décide (lot d, HN-E10S02-27) (source : HN-E10S02-27).
- **HN-E10S02-51** (correction 1) : `20260929200000_platform_files.sql` reste le fichier unique de migration de la
  story, complété lot par lot jusqu'à la fusion de la story entière : il n'est appliqué qu'aux bases locales
  (`pnpm db:local --reset` après chaque changement), jamais au projet partagé avant la fusion ; la règle « une
  migration appliquée est figée » vaut à partir de là (source : fiche D124, un fichier par version réuni par le
  pilote ; `vagues.md § Base de test et migrations` ; décision du pilote).
- **HN-E10S02-52** (correction 1) : la policy d'insertion de `files` exige `status = 'pending'` : seule la
  confirmation, par la mise à jour, rend une ligne `ready`. Une duplication (lot e) ou un dépôt par lien (lot f) qui
  écrit une ligne sous la session insère `pending` puis la passe à `ready` (source : AC-a3, AC-a4 ; le plus simple, la
  migration n'étant appliquée qu'aux bases locales, HN-E10S02-51).
- **HN-E10S02-53** (correction 1) : l'URL de lecture sert le type de l'extension du nom (`FILE_TYPES`), jamais le
  `mime` de la ligne ; `application/octet-stream` pour un nom sans type admis (source : ADR-016 § 5, « jamais lu de
  l'objet » ; HN-E10S02-25).
- **HN-E10S02-54** (correction 1) : l'écran traduit un refus par sa cause, retrouvée par le fichier qu'il envoie :
  `invalid_arguments` sur une extension admise dit un nom refusé, `too_large` d'un fichier de 0 octet dit un fichier
  vide ; le service ne change ni ses codes ni ses messages (source : le plus simple ; `portage-ecrans.md § 6`,
  `fileTypeOf` partagé par `schemas/files.ts`).
- **HN-E10S02-55** (lot c) : le lot c livre aussi la route `GET public/<jeton>/files/<id>` (redirection 302, `PUBLIC_HEADERS`,
  AC-e1) et les adresses par jeton de la page publique (`routeDesFichiers` : image, « Voir », « Télécharger » d'un bloc),
  parce qu'AC-c5 les exige (« Voir » d'un `pdf`, `txt` ou `csv` en public ouvre `…/public/<jeton>/files/<id>?disposition=inline`,
  la visionneuse publique porte « Télécharger ») ; une seule prop sert les trois, sans quoi « Télécharger » d'une page publique
  mènerait à la route à session. Le lot e garde la corbeille, la duplication, le transfert (source : AC-c5 à la lettre ; le plus
  simple).
- **HN-E10S02-56** (lot c) : `public_file_by_token` rend `id`, `name`, `mime`, `size` et le chemin du nœud (`node_path`), pas la
  clé : la clé se compose dans le paquet (`objectKey`, sa seule source) ; la taille sert l'en-tête de la visionneuse, le chemin le
  contrôle « joint au contenu de l'adresse » (AC-c2). Un fichier est servi s'il est cité par un bloc publié `file` **ou** `image`
  (`data.file_id`) (source : § Migrations prévues ; AC-e1, « un bloc publié cite un fichier »).
- **HN-E10S02-57** (lot c) : un `.md` que l'analyse tolérante ne sait pas garder en blocs (un bloc que même le bloc `code` de repli
  ne tient pas) se montre entier en un bloc de code, sans phrase de plus (source : E10-S01 AC-a2, le mode tolérant ne refuse rien).
- **HN-E10S02-58** (lot c) : la visionneuse d'un `html` ne lit pas l'objet (une lecture du bucket par vue, celle de l'iframe) : un
  `html` qui n'est pas de l'UTF-8 se dit dans l'iframe, en texte brut de la route (`invalid_arguments: the file is not UTF-8;
  download it instead`) ; « Ce fichier n'est pas en UTF-8 : téléchargez-le. » s'affiche pour un `.md`, lu par la page (raison
  `not_utf8` ajoutée au refus de `objectText`) (source : ADR-017, la route lit le fichier par le serveur ; le plus simple).
- **HN-E10S02-59** (lot c) : `?view` vaut sur tout nœud qu'on lit sauf un tableau (page, procédure, Contexte, où l'écran joint des
  fichiers, HN-E10S02-50) ; illisible (répété), il vaut un identifiant vide : « Fichier introuvable », jamais l'écran du nœud
  (`fileViewParamSchema`) (source : HN-E10S02-50 ; le plus simple).
- **HN-E10S02-60** (lot c) : la route HTML d'une personne connectée vérifie le jeton de session, puis l'identité, puis
  `Sec-Fetch-Dest` et le fichier dans le service (`fileHtml`) ; une requête sans session reçoit 401 même hors iframe. Toute erreur
  est servie `<code>: <message>` (forme d'AC-f8) en `text/plain; charset=utf-8`, avec les autres en-têtes d'ADR-017 ; tout refus de
  lecture est `not_found: Unknown file.` (la phrase d'AC-a5), `not_found: Not found.` par un lien public (celle de
  `readPublicNode`) (source : AC-c3, AC-c5).
- **HN-E10S02-61** (lot c) : l'iframe ne se monte qu'après l'hydratation (`useSyncExternalStore`) : son premier chargement est
  compté, un second est une navigation de son contenu (O1) ; « Recharger » monte une iframe neuve (source : AC-c4 ; ADR-017 § 3, aucun
  message).
- **HN-E10S02-62** (lot c) : sur la page publique, la carte d'un fichier ne relit pas sa disponibilité (`?check` exige une session) ;
  « Fichier indisponible » n'y vient que de l'`onError` d'une image (source : AC-b8, HN-E10S02-43 ; aucune route publique `?check`
  n'est demandée).
- **HN-E10S02-63** (lot c) : la bannière est une `Alert` du design system en `role="note"` (un texte fixe, pas une région vivante) ;
  en public, elle nomme la marque de l'adresse (`nomAffiche`), sinon « l'organisation ». La visionneuse en échec se titre « Fichier »
  (le fichier existe peut-être), introuvable « Fichier introuvable » (source : `accessibility-patterns.md § Régions dynamiques` ;
  `portage-ecrans.md § 4` ; ADR-017 § 5).
- **HN-E10S02-64** (lot c) : l'hôte de référence pose `nosniff` et `Permissions-Policy` partout, `X-Frame-Options` et sa
  `Referrer-Policy` sur toute adresse sauf les deux routes HTML, par une source à lecture anticipée négative lue par le
  `path-to-regexp` de Next (source : ADR-017 § 1 « Hôte », AC-c3).
- **HN-E10S02-65** (lot c) : les liens internes d'un `.md` vu par un lien public se lisent en texte : aucun n'est dans `links` du
  lien, qui ne porte que ceux des blocs publiés du contenu (source : E05-S10 AC-d4, un chemin hors portée se lit en texte).
- **HN-E10S02-66** (lot c) : la spec e2e d'AC-c6 dépose ses fichiers par les routes du paquet depuis la page connectée et se saute
  quand le serveur n'a pas de stockage (`GET files` → `enabled: false`) : elle tourne après l'action de JB (bucket, CORS) (source :
  § Actions JB ; `testing-strategy.md § E2E Tests`).
- **HN-E10S02-67** (lot d) : le fichier se rend `[<nom> (<taille>, <type>)](<route>/<id>)` : le nom tel quel (comme le texte
  alternatif d'une image, sans échappement), la taille en octets exacts (`1,200 bytes`, `1 byte` : `fileSizeText`), le type par
  l'extension du nom (`pdf`, le mot des refus d'AC-d2), le `mime` de la ligne pour un nom sans extension admise. `parseMarkdown`
  relit la ligne de droite à gauche (dernière `](`, dernière ` (`) : un nom qui porte `](` ou ` (` revient à l'identique, et
  l'aller-retour pur tient (source : AC-d1 ne fixe pas l'écriture de la taille ; ADR-011 § 5 ; le plus simple).
- **HN-E10S02-68** (lot d) : `<origine>` est celle que la porte MCP tient déjà (`McpDeps.origin`, `getPublicOrigin`, celle du lien
  de refus de `call`, E03-S04 AC8), lue par `webUrl` (`http:` ou `https:`, sans identifiants), sinon la route relative. Seul `read`
  la reçoit ; `context`, l'état servi d'un refus de révision (`staleState`), le `.md` d'une page (E10-S01) et la visionneuse servent
  la route relative, que `parseMarkdown` relit aussi (source : HN-E10S02-3 ; `security-patterns.md § XSS Prevention` ; le plus
  simple, `McpDeps` ne porte pas l'hôte résolu).
- **HN-E10S02-69** (lot d) : une ligne seule `[<étiquette>](<origine facultative>/api/plateforme/files/<uuid>)` est un bloc `file`,
  en mode strict comme tolérant ; l'uuid est ramené en minuscules. Une étiquette qui n'a pas la forme du rendu (« [le rapport](…) »)
  donne nom = étiquette, taille 1, type `application/octet-stream`, que `writeNode` remplace par la ligne (AC-d3). Un lien d'un
  lien public (`/public/<jeton>/files/…`) ou d'une sous-route (`…/html`) reste un paragraphe (source : AC-d1 ; le plus simple).
- **HN-E10S02-70** (lot d, AC-d3) : seuls les fichiers que le document (brouillon, sinon publié) ne citait pas encore sont relus
  (`ready`, joint au nœud) ; un fichier déjà cité passe sans relecture, avec les métadonnées du bloc `file` qui le portait. Une
  copie encore `pending` ou un objet perdu (AC-e3, AC-b8) n'empêchent donc pas d'écrire le reste de la page (source : AC-e3, AC-b8 ;
  le plus simple).
- **HN-E10S02-71** (lot d) : une création qui cite un fichier est refusée avant l'insertion du nœud, par la phrase d'AC-d3 : aucun
  fichier n'est joint à un nœud qui n'existe pas encore. Le dépôt par lien (lot f, `create`) crée donc la page, puis joint le
  fichier et l'écrit par une seconde écriture (source : AC-d3 à la lettre ; `security-patterns.md § Droits dans le service`).
- **HN-E10S02-72** (lot d) : en mode tolérant (écran : collage, `.md` importé, E10-S01 AC-a2), un fichier non joint à la page n'est
  pas refusé : son bloc devient un bloc `code` qui porte son markdown (route relative), compté dans `kept_as_text`. Le `.md` d'une
  page importé dans une autre page s'écrit donc (source : E10-S01 AC-a2, le mode tolérant ne refuse rien ; `write` reste strict).
- **HN-E10S02-73** (lot d) : une image jointe réécrite sans largeur (une section rendue puis réécrite par un assistant) garde la
  largeur du bloc qui citait le même fichier : le markdown ne porte pas `width` (source : AC-b3 ; le plus simple).
- **HN-E10S02-74** (lot d, tranche HN-E10S02-50) : `writeNode` admet un bloc `file` ou une image jointe dans tout nœud à blocs (page,
  procédure, Contexte) ; un tableau n'en a pas (ses `ops` sont déjà refusées). L'écran, qui les propose partout où il écrit des
  blocs, reste tel quel : rien n'y est masqué (source : ADR-016 ne borne aucun genre ; HN-E10S02-27 ; AC-f1 ne borne que la cible
  d'`upload.link`).
- **HN-E10S02-75** (lot d, AC-d2) : `file` avec `section`, `outline`, `since_revision` ou `draft` : « Give only one of section,
  outline, since_revision or file; file reads the text of a file, without draft. » ; sans `file`, le refus existant est inchangé
  (texte figé par les tests d'E03-S03). `refs` est ignoré. Le texte se sert tel quel, en-tête `<nom> (<taille>)` (même écriture que
  HN-E10S02-67), données `{ path, file: { id, name, size, type } }`, sans `next_actions` ; le fichier se lit sur tout nœud visible,
  publié ou non, sous le droit de lecture relu par `readFileText`. `file` n'entre dans la clé du curseur que donné (les curseurs
  sans fichier ne changent pas) et figure dans l'appel de la partie suivante. La phrase d'un fichier inconnu cite l'identifiant tel
  que reçu (source : AC-d2 ; le plus simple).
- **HN-E10S02-76** (lot d) : la description de `read` s'allonge, en fin, de « To read an attached html, md, txt or csv file, give
  file = the id from its link /api/plateforme/files/<id>. » (source : § Fichiers à modifier, `mcp/tools.ts` ; ADR-002, une
  description ne fait que s'allonger).
- **HN-E10S02-77** (lot d) : `readFileText` dit « only html, md, txt and csv files are read as text. » (phrase d'AC-d2, que le test du
  lot a attendait déjà) ; le refus de taille garde « a text file (html, md, txt, csv) » (source : AC-d2 à la lettre).
- **HN-E10S02-78** (recalage sur c49c5a8) : créer un tableau par import (AC-b5, AC-b6, `upload.link` `csv create`)
  n'exige que l'écriture sur le parent, comme `write` (fiche D150, qui amende D120 ; `requireCreation`,
  `server/tables/import.ts`) ; `writeNode` publie par défaut (D135, E11-S02) : le bloc qu'écrit l'écran après
  `complete` et celui du dépôt par lien sont publiés aussitôt, sauf `publish: false`. Aucun code des lots a à d ne
  dépendait de la gestion ni du brouillon ; `tests/integration/e10s02-assistant.test.ts` crée ses pages en
  `publish: false` (révision 0) et lit les blocs publiés après une écriture par défaut (source : fiche D150, D135).
- **HN-E10S02-79** (recalage) : un fichier lâché ou collé sur le Texte local d'une page vide (E11-S05, AC-g1) se joint
  après ce Texte, qui reste, comme le dépôt d'un `.md` (`gestes-du-menu.ts`, inchangé par E11) ; seul « Annuler »
  d'une suppression le remplace (source : le plus simple ; comportement d'E11 pour le dépôt).
- **HN-E10S02-80** (recalage) : la rangée locale d'un envoi (`depot-local`) reste dans les blocs que l'éditeur rend à
  la publication, comme avant le recalage ; `portage-ecrans.md § 6` n'en exclut que le Texte local d'une page vide,
  seul à faire passer une page vide pour remplie (source : la règle à la lettre ; un envoi en cours est un contenu qui
  arrive).
- **HN-E10S02-81** (recalage) : le `.md` qu'un visiteur télécharge d'une page publique (E11-S05, `pageMarkdown`)
  cite ses fichiers par la route relative d'une session, `/api/plateforme/files/<id>`, comme le `.md` d'une page
  (HN-E10S02-68) : il se relit par `parseMarkdown` ; le visiteur voit les fichiers par la page (source : le plus
  simple ; `pageMarkdown` ne prend pas de route).
- **HN-E10S02-82** (correction 2) : un bloc `file` dont les métadonnées ne viennent ni d'une ligne relue `ready`
  jointe au nœud, ni d'un bloc `file` que le document portait déjà (le fichier n'était cité que par une image), est
  refusé par la phrase d'AC-d3, ou gardé en bloc `code` en mode tolérant : son nom, sa taille et son type ne
  viendraient que du client. Restreint HN-E10S02-70 (source : AC-d3, « jamais du client »).
- **HN-E10S02-83** (correction 2) : après « Recharger », le focus va à l'iframe neuve, ce que la personne a rechargé,
  plutôt qu'au titre de la visionneuse ; l'avis vit dans une région `role="alert"` montée vide avec l'iframe, où
  l'`Alert` porte `role="presentation"` pour que la région soit la seule annonce (source :
  `accessibility-patterns.md § Focus Management`, `§ Régions dynamiques`).
- **HN-E10S02-84** (correction 2, décision du pilote) : l'aide commune de la porte se coupe en deux temps,
  `verifiedSession` (jeton, `verifyToken`, `verifiedCaller`, `createPlatformDb`) puis `sessionIdentity` : dans
  `handlePlateforme`, le contrôle d'origine d'une mutation, la route `cell` et le 404 d'une route inconnue passent
  entre le client et l'identité, et une aide qui ferait les deux changerait ces réponses. Elle vit dans
  `api/session.ts` : `files-html.ts` ne peut importer `handler.ts`, qui l'importe (source : `coding-standards.md §
  DRY` ; comportement identique).
- **HN-E10S02-85** (correction 2) : `read {file}` contrôle le curseur avant de lire l'objet, dans sa seule branche :
  l'ordre des refus des autres lectures ne change pas (source : AC14 d'E03-S03, « refusé avant de servir quoi que ce
  soit »).
- **HN-E10S02-86** (correction 2, décision du pilote) : canal ouvert O7 d'AC-c6 : le script d'un HTML vu par un lien
  public lit le jeton du lien dans sa propre adresse (`location`) et peut l'envoyer par O1 ; ce jeton ne donne que ce
  que le lien sert déjà, et seul un rédacteur de la page peut y joindre un tel script, sous la bannière. Constat e2e :
  le script lit `/public/<jeton>/files/` dans `location.pathname` ; l'envoi est celui d'O1, déjà constaté. Le pilote
  amende ADR-017 § 2 à la fusion (source : décision du pilote).
- **HN-E10S02-87** (lot e, AC-e4 ; réécrite à la correction 1) : AC-e4 est tenu à la lettre. Sans les cinq variables de
  stockage, `org:export` d'une organisation qui porte des fichiers `ready` échoue après sa seule lecture, avant le JSON et
  le dossier `<fichier>.files/` ; `org:import` d'un document qui porte des fichiers échoue juste après la lecture des
  variables, avant la connexion, la lecture des comptes de la cible et toute écriture ; le message nomme les cinq
  variables (`requireTransferStore`), code 1. Sans fichier, le transfert passe sans elles. Un objet absent (du bucket à
  l'export, de `<fichier>.files/` à l'import) est nommé, jamais une erreur ; une panne du stockage à l'export lève avant
  l'écriture du JSON (code 1) ; à l'import, les objets s'envoient après le commit des lignes, et un envoi en échec est
  nommé, code de sortie 1. La suite de bout en bout tourne contre un faux S3 local (source : AC-e4 ; la consigne du
  lot e, « sans les variables, le transfert fonctionne sans objets », contredisait l'AC sans le citer : corrigée par le
  pilote).
- **HN-E10S02-88** (lot e, AC-e3) : la duplication copie les fichiers qu'un bloc publié d'un nœud copié cite (`file`,
  image jointe), et eux seuls : la copie ne porte ni brouillon ni version ancienne, un fichier cité par eux seuls, ou par
  rien, ne s'y lirait pas. Un fichier cité encore `pending` (la copie en échec d'une copie) se copie aussi, `pending` :
  la copie ne cite jamais le fichier d'un autre nœud (source : AC-e3, « aucun fichier n'est cité par deux nœuds » ;
  ADR-016 § 6 ; le plus simple).
- **HN-E10S02-89** (lot e, AC-e3) : les fichiers copiés comptent au quota de l'organisation : `requireQuota`, extrait
  de la demande d'envoi (`server/files/service.ts`), relit la somme sous le verrou 7501 après l'insertion, dans la
  transaction de la duplication ; au-delà de 10 Go, `too_large` (raison `quota`), et rien n'est écrit, la copie de page
  comprise. La dernière transaction à prendre le verrou compte les lignes validées des autres (source : ADR-016 § 4,
  fiche D113, 10 Go par organisation ; AC-e3 ne dit rien du quota).
- **HN-E10S02-90** (lot e, AC-e3) : `duplicate_subtree` rend, par nœud copié, `copied_files` (objet ancien identifiant
  → nouveau) ; le type rendu change, la fonction est retirée puis recréée aussitôt, sur le modèle de `route_candidates`
  (20260929140000). `server/database.ts` n'est pas régénéré : la migration n'est appliquée qu'à la base locale
  (source : § Migrations prévues, « rend les paires » ; `check:migrations` admet `drop function if exists` suivi de la
  recréation).
- **HN-E10S02-91** (lot e, AC-e3) : après le commit, les copies d'objets partent ensemble, puis une seule mise à jour
  sous la session passe les lignes copiées à `ready` (policy `files_update_member`, HN-E10S02-52) ; un stockage absent
  laisse toutes les lignes `pending`, nommées au log serveur (`[platform] files: copy left pending <clé>`) (source :
  AC-e3 ; le plus simple).
- **HN-E10S02-92** (lot e, AC-e2) : la purge supprime les lignes `files` dans la même instruction que les nœuds (deux
  `delete` en `with`), limitée aux nœuds que la suppression a vraiment emportés : un nœud restauré entre la lecture et
  la suppression garde ses fichiers ; la cascade de `files.node_id` ne trouve plus rien. Les identifiants rendus
  donnent les objets à supprimer après le commit (`removeObjects`) (source : AC-e2, « dans la même transaction, avant
  les nœuds » : même effet, sans écart possible entre deux instructions).
- **HN-E10S02-93** (lot e, AC-e4) : le filtre des lignes `ready` s'écrit dans la carte (`only` d'une `TableSpec`, lu
  par `orgRowsSql`) : l'export et le compte d'AC1 d'E09-S04 le lisent tous deux. L'empreinte (AC8 d'E09-S04) désigne un
  fichier par `file:<chemin de son nœud>/<nom>`, son identifiant changeant à l'import. `transferEnv` lit les cinq
  variables en facultatives aux mêmes sources que les autres, masquées de même (source : `database-patterns.md §
  Règles` ; le plus simple).
- **HN-E10S02-94** (lot e, AC-e1) : AC-e1 est livré par le lot c (HN-E10S02-55) ; le lot e n'y ajoute qu'un test : le
  lien public de la copie sert le fichier copié, jamais celui de l'original (source : consigne du pilote).
- **HN-E10S02-95** (lot f, AC-f15 ; acceptée par le pilote à la revue des lots e et f) : le formulaire de dépôt est une
  page de l'hôte, `/upload/<token>` sous `(dashboard)`, qui monte l'écran du paquet (`EcranDeDepot`), et une route à
  session, `POST /api/plateforme/uploads/<jeton>/form`, servie avant la table de dispatch (son corps est le fichier, pas
  du JSON), sous le contrôle d'origine des mutations. C'est ce que tout ERP écrirait pour monter l'écran, sans service
  propre au SaaS ; § Effet produit le dit, avec les chemins `/upload` et `/n/` que le paquet impose à l'hôte (source :
  AC-f15, « une page de la plateforme », adresse en anglais ; ADR-018 § 8 ; E11-S07 ; `CLAUDE.md § Projet`,
  gardes de portabilité).
- **HN-E10S02-96** (lot f, AC-f2) : `form_url` est rendu par chaque `upload.link`, pas seulement quand `source_url` échoue :
  la règle dite à l'assistant finit par « otherwise, give the person the form link » (source : AC-f2, AC-f14 ; le plus simple).
- **HN-E10S02-97** (lot f, AC-f6) : l'identité se reconstruit par `identityInOrg(db, org, { userId, email })` sur
  l'organisation déjà lue à l'adresse pour la consommation, l'équivalent de `resolveIdentity(db, host, …)` sans seconde
  lecture d'`org_by_host` ; un e-mail absent (personne retirée, staff entré par un accès) vaut `""`, et `not_member` se
  réécrit « The person who asked for this link is no longer a member of <organisation>: nothing was written. » (source :
  `server/identity.ts`, `resolveIdentity` n'est que ces deux lectures).
- **HN-E10S02-98** (lot f, AC-f7, AC-f8 ; consigne du pilote) : `tolerantFor` n'admettait le tolérant que pour une origine
  `human`. `WriteOrigin` (agent) gagne `file?: { replace }`, posé par le seul service du dépôt, jamais par une porte : un
  `.md` déposé se lit en mode tolérant sous la provenance `agent` et le `ctx` du ticket ; `replace` applique les opérations
  à une page vide (tout le corps remplacé) ; l'option `wholeFile` d'`applyOps` saute la borne de section (`SECTION_MAX`),
  `OP_TEXT_MAX` étant tenu par le découpage de `readPageMarkdown` (morceaux de 40 000 caractères, comme l'import d'E10-S01) ;
  `PAGE_MAX` et `BLOCKS_MAX` restent (source : AC-f7 à la lettre ; le plus simple, aucune porte ne change).
- **HN-E10S02-99** (lot f, AC-f7) : le premier titre `#` d'un `.md` déposé est retiré de son corps (`readPageMarkdown`, comme
  l'import d'E10-S01 et le `.md` d'une page) ; le titre de la page vient du ticket en `create` et ne change pas en `replace`.
  Un `.md` sans rien sous son titre est refusé (`invalid_arguments`) : en `replace`, il viderait la page (source : E10-S01
  AC-a3, AC-a6 ; le plus simple).
- **HN-E10S02-100** (lot f, AC-f8, HN-E10S02-71) : fichier en `create` : la page est créée en brouillon (`publish: false`),
  puis la ligne et l'objet (`storeFile`), puis le bloc `file` écrit sous la révision 0 et publié selon `publish` : une seule
  révision publiée, qui porte le fichier ; un échec du stockage laisse la page en brouillon et le dit. En `attach`, le bloc
  s'écrit sous la `base_revision` du ticket, après le dernier bloc du document que `write` modifie (brouillon ouvert, sinon
  publié), par `insert_after` sur l'identifiant complet de ce bloc et un bloc structuré (`input`, sans markdown à
  échapper) (source : HN-E10S02-71 ; le plus simple).
- **HN-E10S02-101** (lot f, AC-f1, AC-f8) : `name` est facultatif pour `md` et `csv` ; il nomme le fichier dans la
  provenance d'un CSV (« Importé de <nom> », défaut `upload.link`, comme `table.import` écrit « Importé de table.import »)
  et dans les commandes rendues (sinon `<file>`). AC-f8 dit « Importé de <chemin> » : le serveur ne connaît pas le chemin
  local du fichier (source : `table.import` ; le plus simple).
- **HN-E10S02-102** (lot f, AC-f9) : la ligne de l'envoi s'écrit sous la session de la personne du ticket, après la
  réponse (`defer`) à la porte de `curl`, attendue ailleurs (formulaire, `source_url`) ; une personne qui n'est plus membre :
  aucune ligne tentée (sa policy la refuserait), `console.error("[platform] uploads: …")` au log serveur (source : AC-f9 ;
  `writeJournal`, qui ne lève jamais).
- **HN-E10S02-103** (lot f, AC-f14) : `source_url` est masquée au journal par son nom de clé (`sourceurl` ajouté à
  `SECRET_KEY`, `server/journal.ts`, relu aussi à la lecture du journal) : « sans l'adresse d'origine au journal » ; les
  autres arguments de l'appel restent journalisés comme tout `call` (AC-f9). Un téléchargement en échec est un résultat,
  pas `isError` : la cause en une phrase, sans l'adresse, et `form_url` (source : AC-f14 ; `mcp-patterns.md § 4`, un refus
  dit quoi faire).
- **HN-E10S02-104** (lot f, AC-f13) : toute adresse IPv6 qui porte une IPv4 (mappée, NAT64, 6to4, Teredo) est refusée
  entière plutôt que d'en extraire l'IPv4 ; la résolution contrôlée est celle de la connexion (`lookup` de `https.request`),
  toutes les adresses rendues doivent être publiques ; une adresse IP écrite dans l'URL se contrôle avant la requête ; la
  résolution, la requête et le délai s'injectent pour les tests, sans réseau (source : AC-f13 ; `mcp-patterns.md § 6 bis`).
- **HN-E10S02-105** (lot f, AC-f10 ; lecture resserrée à la correction 1) : RLS d'`upload_tickets` : lecture par un
  membre de l'organisation de ses propres tickets et des tickets expirés (le formulaire lit le ticket de la personne ; le
  ménage d'`upload.link` supprime des tickets expirés d'autres personnes, et un `delete … where` exige la lecture) :
  jamais la destination ni le titre qu'un autre a prévus, espace privé compris ; insertion attribuée à l'appelant,
  suppression des seuls tickets expirés, aucune mise à jour ; aucune clé vers `members`, pour qu'une personne retirée
  reçoive `not_member` (source : `supabase-patterns.md § Règles RLS` ; AC-f6 ; revue des lots e et f, B7).
- **HN-E10S02-106** (lot f, AC-f4, AC-f5) : les textes de la porte sans session : refus 1 « Requests from a browser are
  refused: send the file with curl, or use the form link. » ; la même `not_found` « Unknown upload link: it may have
  expired (15 minutes) or already been used. Ask for a new link. » pour un jeton mal formé, un ticket inconnu, expiré,
  servi ou d'une autre organisation, et une adresse qui ne sert aucune organisation ; statut 200 pour un envoi écrit
  (source : AC-f4, AC-f5 ; `mcp-patterns.md § 4`).
- **HN-E10S02-107** (lot f) : `storeFile` partage avec la demande d'envoi l'insertion `pending` sous quota (`insertPending`)
  et avec la confirmation le passage à `ready` (`markReady`) ; `admittedType` et `checkSize` sont exportés pour décider le
  type et la taille d'un fichier déposé à l'émission du lien et à l'envoi (source : § Doublons, « une seule fonction
  d'enregistrement » ; `coding-standards.md § DRY`).
- **HN-E10S02-108** (correction 1, AC-f15 ; décision du pilote, à reporter dans ADR-018 § 8) : le ticket porte deux
  jetons, chacun de 32 octets aléatoires, gardés en empreinte seulement : celui de `curl` (`token_hash`, adresse d'envoi)
  et celui du formulaire (`form_token_hash`, `form_url`). La porte sans session n'accepte que le premier, la route du
  formulaire (et sa page, `uploadForm`) que le second ; `consume_upload_ticket(p_org, p_hash, p_form)` lit l'empreinte de
  la porte appelante, et `used_at`, commun, sert le ticket une fois par l'un ou l'autre : le premier consommé rend l'autre
  `not_found`. Un jeton de l'autre porte rend la même `not_found` qu'un ticket inconnu. Sans cela, qui voyait `form_url`
  envoyait par `curl` sans session, et l'exigence de session du formulaire ne protégeait rien (source : revue des lots e
  et f, arbitrage 2 ; ADR-018 § 5 et § 8).
- **HN-E10S02-109** (correction 1, AC-f15) : après un refus qui a servi le lien, la zone de dépôt est retirée (comme après
  « Déposé ») et une phrase dit que le lien ne peut plus servir ; le focus va à l'alerte. Le lien reste valable, et la
  zone offerte, pour un refus du réseau, d'une session à reprendre (401), une panne sans code sûr (`internal`), ou un
  fichier de plus de 1 Mo (refusé avant la consommation, ADR-018 § 5) ; tout autre refus vient après la consommation
  (AC-f4, étape 5) ou dit un lien qui ne sert plus. Retirer la zone plutôt que la désactiver : aucune prop nouvelle sur
  `ZoneDeDepot`, partagée avec l'import d'E10-S01 (source : revue, B8 ; `accessibility-patterns.md § Après une action` ;
  le plus simple).
- **HN-E10S02-110** (correction 1, AC-f8) : la ligne d'un `.md` gardé en mode tolérant se lit « N elements kept as text. »
  (« 1 element kept as text. » au singulier), la phrase d'AC-f8 en anglais, comme toute la réponse lue par `curl`
  (HN-E10S02-106) (source : AC-f8 ; revue, B9).
- **HN-E10S02-111** (correction 1, décision du pilote) : les réponses d'erreur de la porte en JSON (`errorResponse`,
  `asPlatformError`) et le contrôle d'origine d'une mutation (`addressOrigin`, `requireSameOrigin`) vivent dans
  `api/session.ts`, lus par `handler.ts` et `api/uploads.ts`. Mêmes codes, mêmes statuts, mêmes corps ; deux écarts
  sans effet sur un client : un refus de la route du formulaire ne porte plus `Cache-Control: private, no-store` (une
  réponse à un `POST` n'est pas gardée ; son succès le porte toujours), et une panne inattendue des deux routes du dépôt
  se journalise `[platform] api: unexpected error` au lieu de `[platform] uploads: …` (source : revue, M1 ;
  `coding-standards.md § DRY`).
- **HN-E10S02-112** (correction 1, AC-e4) : à l'import, l'ancien identifiant d'un fichier qui n'est pas un uuid est
  refusé avant de bâtir son chemin dans `<fichier>.files/` (un `../` en sortirait) : nommé parmi les envois en échec,
  code de sortie 1, comme un envoi refusé par le stockage. À l'export, un dossier `<fichier>.files/` déjà là arrête le
  script comme le JSON (« relancez avec --force »), contrôlé avant la lecture et encore à la création du dossier ; avec
  `--force`, il est vidé avant l'écriture des objets (source : revue, B3 et B10 ; le plus simple).
- **HN-E10S02-113** (correction 1, AC-e3) : `copyFileObjects` copie les objets par lots de 8 (`COPIES_AT_ONCE`) : une page
  qui cite des centaines de fichiers n'ouvre pas autant de requêtes à la fois ; un échec dans un lot n'arrête pas les
  suivants (source : revue, B4 ; le plus simple).

## Actions JB

- Créer le bucket privé et ses clés d'accès S3, régler son CORS (README du paquet), poser les
  cinq variables `PLATFORM_STORAGE_*` du projet (ADR-016 § 2) avant la campagne visuelle. Les
  tests n'en ont pas besoin (adaptateur en mémoire).
- Trancher la fiche D118 (duplication). La story avance sous l'option recommandée.

## Tests attendus

### Unit tests
- [ ] Signature SigV4 de l'adaptateur S3 sur les vecteurs de test publiés ; `content-length` et
  `content-type` signés ; durées de 5 min et 60 s ; `response-content-*` dans l'URL de lecture.
- [ ] `FILE_TYPES`, limites (50 Mo, 4 Mo pour un fichier texte), clé d'objet sans nom d'origine ;
  `fileStore()` à `null` sans l'une des cinq variables.
- [ ] Rendu et relecture markdown des blocs `file` et `image` internes (aller-retour).
- [ ] `readFileText` : UTF-8 strict, BOM retiré, borne de 4 Mo.
- [ ] `org-transfer` : ligne `files` de `TABLES`, chemins `<out>.files/<id>`,
  `NEVER_EXPORTED` avec `upload_tickets`.
- [ ] Jeton : 43 caractères base64url ; empreinte SHA-256 ; le jeton n'est ni dans la ligne insérée
  ni dans les arguments journalisés. Commandes rendues (bash, PowerShell) pour un nom de fichier
  avec espaces et apostrophe.
- [ ] `uploadLinkSchema` : `mode` selon `kind` (`csv replace` refusé), `name` exigé pour `file`,
  `title` et `summary` exigés pour `create`, `base_revision` exigée hors `create`.
- [ ] Porte d'envoi (AC-f4) : `Origin` → `forbidden` ; jeton mal formé → `not_found` ;
  `Content-Length` trop grand → `too_large` ; corps coupé sans `Content-Length` → `too_large` ;
  aucune requête en base dans ces quatre cas (espion).
- [ ] Contenu (AC-f7) : BOM retiré, CRLF normalisé, UTF-8 invalide, corps vide, type par
  l'extension.
- [ ] Téléchargement (AC-f13) : un cas par règle, résolution DNS doublée, redirections, délai,
  taille.

### Integration tests
- [ ] Envoi sur l'adaptateur mémoire : chaque code d'AC-a3 dans l'ordre ; quota avec `pending` ;
  deux demandes simultanées sous le verrou ; objet absent, taille ou type différent à `complete` ;
  `pending` purgé au `POST` suivant.
- [ ] Lecture : droit exigé ; autre organisation, `pending`, corbeille → `not_found` ; disposition
  `attachment` pour `svg`, `html`, `md`, `pdf` (sans `disposition=inline`), `zip` ; `inline` pour
  `png`, et pour `pdf`, `txt`, `csv` sur `disposition=inline`.
- [ ] Route HTML : en-têtes exacts, lecture exigée, autre organisation, autre type, `pending`,
  `Sec-Fetch-Dest`, 401 sans session, erreur en texte brut ; route `markdown` : blocs du mode
  tolérant.
- [ ] Routes publiques : fichier et HTML publiés du périmètre servis, en-têtes exacts ; brouillon
  seul, hors périmètre, jeton désactivé → `not_found`.
- [ ] `writeNode` : `file_id` d'un autre nœud, inconnu ou `pending` → `invalid_arguments` ;
  métadonnées reprises de la ligne.
- [ ] Purge de la corbeille : lignes et objets supprimés ; échec du bucket journalisé.
- [ ] Duplication : lignes neuves, `file_id` réécrits (blocs et version), objets copiés ; aucun
  fichier cité par deux nœuds ; copie en échec → `pending`.
- [ ] Isolation (`isolation-par-table.test.ts`, `isolation/tables.test.ts`) avec `files` et
  `upload_tickets` ; transfert (`org-transfer.test.ts`) avec `files`.
- [ ] `upload.link` : refus immédiats (droit d'écrire, chemin pris, chemin absent, genre, révision,
  stockage désactivé pour `file`), ticket créé, tickets expirés de plus de 24 h supprimés.
- [ ] Envoi : `file` (création d'une page, ajout à une page, `html` puis vu par la route isolée),
  `md` (création, remplacement, éléments conservés en texte), `csv` (création, fusion),
  publication selon `publish`.
- [ ] `not_found` identique pour un ticket servi, expiré, inconnu, et d'une autre organisation ;
  deux envois simultanés du même jeton : un seul passe ; écriture refusée (CSV invalide) : ticket
  servi quand même.
- [ ] Droit retiré entre le lien et l'envoi (`forbidden`), membre retiré (`not_member`), chemin pris
  (`conflict`), révision changée (`stale_revision`).
- [ ] Limites : `file` au-delà de 1 Mo, `md` au-delà de `PAGE_MAX`, `csv` au-delà de 5 000 lignes :
  `too_large`. Réponse : texte brut, `Content-Type: text/plain`, en-têtes `no-store` et `noindex`.
- [ ] Journal : les deux lignes sous le même `ctx`, sans jeton.
- [ ] Formulaire de dépôt : session exigée, autre personne refusée sans consommer, usage unique.
- [ ] Éditeur (composants) : collage d'image, dépôt de fichier, choix au dépôt d'un `.md` et d'un
  `.csv` (`Échap` n'écrit rien), glisser de fichier distinct du glisser de bloc, progression,
  annulation, refus affiché, stockage désactivé, fichier indisponible, agrandissement au clavier
  (`Échap`), « Voir » présent pour `html`, `md`, `pdf`, `txt`, `csv` seulement.

### MCP (`InMemoryTransport`)
- [ ] `read` d'une page avec image interne et fichier : formes exactes d'AC-d1.
- [ ] `read {file}` : texte d'un `html` et d'un `md` dans sa clôture, curseur au-delà de 45 000,
  exclusions, fichier inconnu, autre type (textes exacts).
- [ ] `write` qui relit les formes d'AC-d1 : accepté sur le même nœud, refusé ailleurs (texte
  exact d'AC-d3).
- [ ] `find` trouve `upload.link` ; `read` sert son contrat ; `call upload.link` rend l'adresse,
  l'expiration, les deux commandes et la phrase d'AC-f2 à l'identique dans le texte et dans
  `structuredContent` ; avec `source_url` en échec, la cause et `form_url`.
- [ ] Refus d'AC-f1 servis en anglais, avec `isError`, texte comparé mot pour mot.
- [ ] La liste des outils reste de six.

### Golden queries (écrites par le pilote dans `docs/mcp-golden-queries.md`)
- [ ] « Range le rapport que tu viens de générer dans ventes/rapports » (Claude Code) →
  `upload.link` (`kind: file`) puis `curl`.
- [ ] La même demande dans Claude ou ChatGPT dans le navigateur, sans shell → `upload.link` avec
  `source_url`, sinon le lien du formulaire donné à la personne (AC-f17).
- [ ] « Qu'y a-t-il dans le rapport joint à ventes/rapports/mars ? » → `read` de la page, puis
  `read {file}`.

### E2E tests
- [ ] AC-c6, chaque ligne F1 à F16 et O1 à O7.
- [ ] En-têtes reçus par le navigateur sur les deux routes HTML (exclusion de `next.config.ts`).
- [ ] « Voir » d'un `.html` et d'un `.md` : nouvel onglet, visionneuse, bannière, « Télécharger »,
  « Ouvrir la page » ; en public par un lien.
- [ ] Par le banc MCP : `call upload.link`, puis `curl` d'un rapport HTML de 150 ko, puis `read` de
  la page et `read {file}`.
- [ ] Avec un bucket réel (campagne visuelle, après l'action de JB) : déposer une image, un PDF et
  un `.html`, les voir, les relire, les voir par un lien public, dans les deux thèmes.

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Notes

### Lot a

**Écarts avec l'architecture.** Aucun invariant touché. `RouteResult` gagne `redirect` (la porte rendait du
JSON seul), lu par la seule ressource `files` : la 302 sort sans corps, `Cache-Control: private, no-store`.
`fileReadUrl` et `readFileText` ne sont pas exportés par `server/index.ts` : aucun hôte ne les appelle encore.
`server/database.ts` (types générés du projet) n'est pas régénéré : la migration n'est appliquée qu'à la base
locale ; la face SQL n'en dépend pas.

**Composants créés.**

| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `FileStore`, `fileStore()`, `objectKey`, `storageNotEnabled` | `packages/plateforme/server/files/store.ts` | Le port (cinq opérations), nul sans l'une des cinq variables |
| `s3FileStore`, `presign`, `s3Client` | `packages/plateforme/server/files/s3.ts` | SigV4 par `aws4fetch`, adresses en chemin, URL d'envoi 5 min et de lecture 60 s |
| `memoryFileStore` | `packages/plateforme/server/files/memory.ts` | Le bucket des tests : objets, pannes (`failing`) et `fetch` des URL présignées |
| `requestFileUpload`, `completeFileUpload`, `fileReadUrl`, `fileAvailability`, `readResponse`, `readFileText`, `purgePendingFiles`, `removeObjects`, `fileStorageState` | `packages/plateforme/server/files/service.ts` | Décisions d'AC-a3 à AC-a8 ; disponibilité d'AC-b8 (correction 1) |
| `filesRoutes` | `packages/plateforme/api/files.ts` | `GET files`, `POST files`, `POST files/<id>/complete`, `GET files/<id>`, `GET files/<id>?check` |
| `FILE_TYPES`, `IMAGE_TYPES`, `TEXT_TYPES`, limites, `fileTypeOf`, `fileRequestSchema`, `fileIdSchema`, `fileReadQuerySchema` | `packages/plateforme/schemas/files.ts` | Type par l'extension (`fileExtension` d'E10-S01 réutilisée) |

**Notes.** Migration `20260929200000_platform_files.sql`, composée par un script qui recopie telles quelles les
instructions reprises (`blocks_shape_check` de 20260929170000, `forget_user` de la ligne de base), chacune
changée en un point nommé ; appliquée à la base locale seulement. `aws4fetch` 1.0.20 exacte, dans les
dépendances du paquet et les `devDependencies` de la racine. Tests écrits, non lancés (vague) :
`tests/unit/files-store.test.ts`, `tests/unit/api-files.test.ts`, `tests/integration/files.test.ts`, plus une
ligne dans `tests/unit/rls-policies.test.ts`, `tests/integration/portabilite-schema.test.ts` et
`tests/integration/isolation/donnees.ts`.

### Lot b

**Écarts avec l'architecture.** Aucun invariant touché. `ui/` n'importe pas `server/` : l'écran passe par
`/api/plateforme/files` (état, demande, confirmation, lecture), l'envoi des octets va au stockage par l'URL présignée
(`XMLHttpRequest`, pour la progression). Deux lectures par le client, écrites dans `ui/api/client.ts` : les octets
d'un CSV joint (AC-b6) et la relecture de la route d'une carte (AC-b8, HN-E10S02-43). `schemas/blocks.ts` porte le
bloc `file` et l'image interne (`file_id`, `width`), à la parité de `blocks_shape_check` ; `blocks-render.ts` les rend
en forme provisoire (HN-E10S02-45).

**Composants créés.**

| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `ImageAgrandissable`, `CarteDeFichier`, `largeurDe`, `adresseDeVue` | `packages/plateforme/ui/noeud/fichier-du-bloc.tsx` | Client ; image à sa largeur, agrandie dans `Dialog`, « Fichier indisponible » (`onError`) ; carte : icône du type, nom, taille, « Voir », « Télécharger », relecture de la route |
| `envoyerUnFichier`, `useFichiersDeLEditeur`, `blocDuFichier`, `messageDEnvoi`, `nommer`, `genreDe`, `ACCEPTES`, `LIMITES`, `EN_DEPOT`, `enDepot` ; types `Depot`, `DialogueDeFichier`, `Genre` | `packages/plateforme/ui/noeud/editeur/envoi-de-fichier.ts` | Demande, envoi XHR, confirmation, annulation ; état du stockage, des envois et du dialogue de l'éditeur |
| `gestesDesFichiers` ; type `OptionDuDepot` | `packages/plateforme/ui/noeud/editeur/gestes-des-fichiers.ts` | Joindre, annuler, déposer, coller, choisir au dépôt, importer un CSV puis le citer |
| `DialogueDesFichiers` | `packages/plateforme/ui/noeud/editeur/choix-au-depot.tsx` | Client ; choix d'un fichier (types et limites), choix au dépôt d'un `.md` ou d'un `.csv`, import d'E10-S01 |
| `DepotEnCours`, `FichierEdite` | `packages/plateforme/ui/noeud/editeur/fichier-edite.tsx` | Client ; bloc local d'un envoi (aperçu, progression, « Annuler », refus, « Retirer ») ; image et texte alternatif, carte d'un fichier |
| `tailleLisible` | `packages/plateforme/ui/format/nombres.ts` | « 12,5 Ko » ; carte et limites |
| `lireUnFichier`, `fichierDisponible` | `packages/plateforme/ui/api/client.ts` | Octets d'un fichier joint ; disponibilité par `?check` (correction 1) |
| `filePath` | `packages/plateforme/schemas/files.ts` | `/api/plateforme/files/<id>`, pour l'écran et le markdown |
| `ZoneDeDepot` (exportée, `accepte`) | `packages/plateforme/ui/coque/import-de-fichier.tsx` | Reprise pour joindre une image ou un fichier |
| `FICHIERS` | `packages/plateforme/ui/noeud/libelles-des-fichiers.ts` | Libellés du lot b, hors de `libelles.ts` (plafond de lignes, correction 1) |
| `SANS_TEXTE` | `packages/plateforme/ui/noeud/editeur/operations.ts` | Séparateur, image, fichier : jamais vides |

**Notes.** Tests écrits, non lancés (vague) : `tests/integration/components/e10s02-fichiers.test.tsx` (AC-b1 à AC-b8),
`tests/unit/ui-envoi-de-fichier.test.ts` (refus par code, limites, bloc écrit, nom d'une image collée) ; cas de forme
ajoutés à `tests/helpers/block-cases.ts` (parité Zod et base), attendus changés dans
`tests/unit/schemas/blocks.test.ts` (`file` dans `BLOCK_TYPES`) et `tests/integration/blocs-zod.test.ts` (`file`
hors de la comparaison avec la ligne de base V1, qui ne le connaît pas).

### Correction 1 (lots a, b)

**Constats de la revue et corrections.**

- H1 (`max-lines`) : `FICHIERS` déplacé tel quel dans `ui/noeud/libelles-des-fichiers.ts` ; `libelles.ts` revient au
  texte de `main`. Importateurs retouchés : `choix-au-depot.tsx`, `choix-de-bloc.tsx`, `envoi-de-fichier.ts`,
  `fichier-edite.tsx`, `gestes-des-fichiers.ts`, `rangee-de-bloc.tsx`, `fichier-du-bloc.tsx`, et les tests
  `e10s02-fichiers.test.tsx`, `ui-envoi-de-fichier.test.ts`.
- H2 (carte d'export) : ligne `files` dans `TABLES`, après `nodes` (lignes ajoutées seules) ; ce qu'elle exige des
  suites qui parcourent la carte : HN-E10S02-35.
- M1 (en-tête de migration) : HN-E10S02-51 ; l'en-tête le dit.
- M2 (disponibilité d'une carte) : `GET files/<id>?check`, HN-E10S02-43 ; exception écrite dans
  `state-management.md § Règle d'or`.
- M3 : ligne `aws4fetch` dans `tech-stack.md`.
- M4 : `head()` de l'adaptateur S3 rend `null` pour 404 et 403 (HN-E10S02-32).
- M5 : cas « règle d'écriture retirée entre la demande et la confirmation » (`forbidden`, aucune mise à jour de
  `files`).
- BASSE : type servi par l'extension (HN-E10S02-53) ; policy d'insertion `pending` (HN-E10S02-52) ; README (clés S3
  de Supabase valables pour tout le projet, route `?check`) ; « (html, md, txt, csv) » tiré de `TEXT_TYPES`, à
  l'écran comme dans les refus du service ; refus traduits par leur cause (HN-E10S02-54) ; bouton d'agrandissement
  nommé par `aria-label` ; « Sans description » relié au champ par `aria-describedby` ; bornes des refus du service
  (50 MB, 4 MB, 10 GB) tirées des constantes.

**Tests écrits, non lancés (vague).** `tests/unit/files-store.test.ts` (`HEAD` 404 et 403 absents, 400 en échec ;
`readResponse` sans `mime`), `tests/unit/api-files.test.ts` (`?check` : `available` vrai, faux, `not_found` en
JSON, sans redirection), `tests/integration/files.test.ts` (droit relu à la confirmation ; disponibilité),
`tests/integration/components/e10s02-fichiers.test.tsx` (carte indisponible par `?check`, `not_found` ; description
du texte alternatif ; nom du bouton d'agrandissement), `tests/unit/ui-envoi-de-fichier.test.ts` (nom refusé, fichier
vide). Suites qui parcourent `TABLES` : `isolation-par-table.test.ts`, `org-transfer.test.ts` (lignes ajoutées).

### Lot c

**Écarts avec l'architecture.** Aucun invariant touché ; ADR-017 appliqué à la lettre (en-têtes, `sandbox`, `Sec-Fetch-Dest`,
aucun message, bannière hors de l'iframe). La porte gagne une branche avant le jeton de session, `files/<id>/html`
(`api/files-html.ts`), qui vérifie elle-même le jeton pour répondre en texte brut, 401 compris ; `isPublicRoute` s'étend aux
fichiers d'un lien (`public/<jeton>/files/<id>`, `…/markdown`, `…/html`). `public_file_by_token` est la troisième fonction
qu'`anon` exécute (ADR-016 § 7). L'hôte de référence exclut les deux routes HTML de `X-Frame-Options` et de sa `Referrer-Policy`
(`next.config.ts`) : `security-patterns.md § Headers de sécurité` ne le dit pas encore (à écrire à la fusion). Le lot c livre aussi
la redirection publique d'AC-e1 et les adresses par jeton de la page publique (HN-E10S02-55). `server/database.ts` n'est pas
régénéré (la migration n'est appliquée qu'à la base locale).

**Composants créés.**

| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `VisionneuseDeFichier` ; type `VisionneuseProps` | `packages/plateforme/ui/noeud/visionneuse-de-fichier.tsx` | Server ; en-tête (nom, taille, « Télécharger », « Ouvrir la page »), bannière, iframe ou blocs d'un `.md`, introuvable, échec avec « Réessayer » ; monté par `EcranDeNoeud` (`fichierVu`) et `PagePublique` (`fichier`) |
| `CadreDuFichier`, `SANDBOX` | `packages/plateforme/ui/noeud/cadre-du-fichier.tsx` | Client ; l'iframe isolée, montée après l'hydratation ; un second chargement devient « Ce contenu a tenté de quitter la page. » et « Recharger » |
| `MESSAGES_DE_LA_VISIONNEUSE` ; libellés de la visionneuse dans `FICHIERS` | `packages/plateforme/ui/noeud/libelles-des-fichiers.ts` | `not_utf8`, `not_enabled` pour `resultatDe` ; exporté par `./ui` |
| `fileView`, `fileMarkdown`, `publicFileView`, `publicFileMarkdown`, `publicHtmlText`, `publicFileReadUrl` | `packages/plateforme/server/files/view.ts` | Ce que voit la visionneuse (fichier joint au nœud de l'adresse, `html` ou `md`, blocs du mode tolérant) ; lecture publique par redirection ; `fileView`, `publicFileView` exportés par `./server` |
| `HTML_CONTENT_SECURITY_POLICY`, `htmlHeaders`, `servedInFrame`, `fileHtml`, `publicFileHtml` | `packages/plateforme/server/files/html.ts` | En-têtes d'ADR-017 § 1, règle `Sec-Fetch-Dest`, texte des deux routes isolées |
| `objectText` ; `requireStore`, `readableFile`, `unknownFile`, `onStorage` exportés | `packages/plateforme/server/files/service.ts` | Texte d'un objet (UTF-8 strict, raison `not_utf8`), extrait de `readFileText` pour la lecture publique |
| `readPublicFile` ; type `PublicFile` | `packages/plateforme/server/shares.ts` | `public_file_by_token` sous `anon`, l'organisation de l'adresse (`publicOrg`, partagé avec `readPublicNode`) |
| `isFileHtmlRoute`, `fileHtmlResponse`, `publicFileHtmlResponse` | `packages/plateforme/api/files-html.ts` | Branche avant le dispatch ; texte brut aux en-têtes de la route |
| `FILES_ROUTE`, `publicFilesRoute`, `filePath(id, route?)`, `fileViewParamSchema` ; types `FileView`, `FileMarkdown`, `ViewedBlock` | `packages/plateforme/schemas/files.ts` | Routes des fichiers d'une personne ou d'un lien ; paramètre `view` |
| `routeDesFichiers` (prop) | `ui/noeud/rendu-des-blocs.tsx`, `ui/noeud/fichier-du-bloc.tsx` (`CarteDeFichier`, `adresseDeVue`), `ui/public/page-publique.tsx` | Les routes d'un lien public pour l'image, « Voir » et « Télécharger » d'un bloc |

**Notes.** Migration : `public_file_by_token` ajoutée à `20260929200000_platform_files.sql` (§ 6 de son en-tête), recopiée dans
`supabase/migrations/`, base locale refaite (`pnpm db:local --reset`) ; requête principale validée par `EXPLAIN` sur la base
locale, fonction exécutée sous `anon`. Tests écrits, non lancés (vague) : `tests/unit/files-html.test.ts` (politique mot pour mot,
en-têtes, `Sec-Fetch-Dest`, portes avant le jeton, 401 en texte brut), `tests/unit/next-config.test.ts` (exclusion des deux
routes, par le `path-to-regexp` de Next ; attendus du test d'E02-S02 réécrits : `X-Frame-Options` n'est plus dans la règle
`/(.*)`), `tests/integration/files-view.test.ts` (route isolée par la porte, route `markdown`, `fileView`, lien public : servi,
brouillon seul, hors périmètre, hors iframe, autre adresse, lien désactivé), `tests/integration/components/e10s02-visionneuse.test.tsx`
(iframe, bannière, navigation, `.md`, introuvable, échec, carte publique), `tests/integration/pages/e10s02-visionneuse-pages.test.tsx`
(`?view` sur `/n/…` et `/p/…`), `tests/e2e/e10s02-voir.spec.ts` (AC-c6, F1 à F16, O1 à O6, en-têtes reçus, « Voir » en onglet,
`.md`, lien public ; se saute sans stockage). Une ligne ajoutée à `ANON_FUNCTIONS` de `tests/integration/isolation/tables.test.ts`.

### Lot d

**Écarts avec l'architecture.** Aucun invariant touché ; ADR-002 tenu (un champ facultatif `file`, une phrase ajoutée à la fin de
la description de `read`, liste d'outils inchangée). `read` reçoit l'origine de la requête MCP (`readNode(…, { origin })`, un
paramètre facultatif ; les autres appelants ne changent pas). `writeNode` relit en base, avant l'écriture, les fichiers qu'un bloc
cite pour la première fois (`attachFiles`), ce qui couvre l'écran, `write` et le dépôt par lien. `nodes/links.ts` et
`procedures-check.ts` ne changent pas : un nom de fichier n'est pas un texte humain où chercher un lien (le `default` de
`humanTexts` le laisse déjà), et la ligne rendue d'un bloc `file` commence par `[`, elle ne peut pas ouvrir une clôture `call`.
AC-d4 ne demande aucun code : `block_search_text` indexe `name` depuis le lot a ; le test le vérifie par `find`.

**Composants créés.**

| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `fileIdOfUrl`, `fileLinkAt` | `packages/plateforme/server/nodes/markdown-files.ts` | Relecture des deux formes d'AC-d1 par `parseMarkdown`, de toute origine |
| `attachFiles`, `refuseFilesOnCreate` | `packages/plateforme/server/nodes/write-files.ts` | AC-d3 : fichier `ready` joint au nœud écrit, métadonnées de la ligne, mode tolérant gardé en texte, largeur gardée |
| `readNodeFile` | `packages/plateforme/server/nodes/read-file.ts` | `read {file}` (AC-d2) : texte seul dans sa clôture, curseur |
| `fileSizeText` | `packages/plateforme/schemas/files.ts` | « 1,200 bytes » : rendu d'un bloc `file` et en-tête de `read {file}` |
| `RenderOptions.fileRoute` ; `fenceFor` exporté | `packages/plateforme/schemas/blocks-render.ts` | Route absolue des fichiers dans `read` ; clôture du texte d'un fichier |
| `ServedRender` | `packages/plateforme/server/nodes/read-format.ts` | `reference` et `fileRoute` du rendu servi, en un paramètre (`max-params`) |
| `readFileText(…, node?)` | `packages/plateforme/server/files/service.ts` | Fichier joint à ce nœud, refus d'AC-d2 avant la lecture de l'objet |

**Notes.** Aucune migration. Tests écrits, non lancés (vague) : `tests/unit/e10s02-markdown-fichiers.test.ts` (rendu relatif et
absolu, relecture de trois origines, uuid en capitales, étiquette écrite à la main, liens ordinaires, ligne hostile),
`tests/integration/e10s02-assistant.test.ts` (par la porte MCP : formes d'AC-d1 servies sur l'origine et relues de toute origine,
métadonnées de la ligne ; refus d'AC-d3 mot pour mot pour un fichier d'une autre page, `pending`, inconnu, cité à la création ;
` ```html ` gardé en `code` ; mode tolérant ; `read {file}` d'un `.md` et d'un `.html`, exclusions, fichier inconnu, `pending`,
d'une autre page, autre type, curseur au-delà de 45 000 caractères ; `find` par le nom). Attendus changés :
`tests/unit/markdown-aller-retour.test.ts` (`file` parmi les types relus), `tests/unit/mcp-tools.test.ts` (description de `read`)
et `tests/unit/__snapshots__/mcp-tools.test.ts.snap` (champ `file`).

### Recalage sur c49c5a8 et correction 2 (lots c, d)

**Recalage.** Le worktree part de `main` c49c5a8 (E11-S02 publication directe, E11-S05 écrans d'un contenu, E11-S01
lot g, E11-S14 lot b), plus le diff des lots a à d. Huit conflits, chacun résolu en gardant les deux intentions :

- `migrations/README.md` : l'entrée de `20260929190000_discard_draft.sql` (E11-S02), puis la nôtre, complétée des
  lots c et d (`public_file_by_token`, `anon`).
- `server/nodes/trash.ts` : les imports d'E11 (`boundedList`, `node.trash`) et `purgePendingFiles` (AC-a6).
- `ui/noeud/ecran-de-noeud.tsx` : les deux colonnes d'E11-S05 (`tableHeaderSchema`, `genreDuNoeud`,
  `resumeMontre`) et la visionneuse sur `?view` (`FileView`, `VisionneuseDeFichier`).
- `ui/noeud/editeur/actions.ts` : `estLaPageVide` (E11-S05) et `SANS_TEXTE` (lot b).
- `ui/noeud/editeur/editeur-de-blocs.tsx` : la page vide d'E11-S05 (Texte local et son invite, plus d'état vide ni
  de `PageVide`) et les fichiers (`fichiers`, `depots`, `DialogueDesFichiers`) ; `Rangees` passe `invite`,
  `fichiers` et `depot`.
- `ui/noeud/editeur/rangee-de-bloc.tsx` : la prop `invite` d'E11-S05, reprise dans la déstructuration de
  `RangeeDeBloc(props)` du lot b, avec `fichiers`, `depot` et le dépôt sur la rangée.
- `ui/noeud/editeur/use-editeur.ts` : les blocs du modèle sans le Texte local d'une page vide (E11-S05) et
  `fichiers` rendu par le crochet.
- `ui/public/page-publique.tsx` : le téléchargement d'E11-S05 (`Telechargement`, `cleDu`, résumé des seules
  procédures) et les routes des fichiers d'un lien (`routeDesFichiers`, `FileView`, visionneuse).

Relus sans conflit, touchés des deux côtés : `mcp/server.ts`, `mcp/tools.ts`, `schemas/index.ts`,
`schemas/nodes.ts`, `server/nodes/read-body.ts`, `read-format.ts`, `write.ts`, `server/shares.ts`,
`ui/coque/import-de-fichier.tsx`, `ui/noeud/editeur/champ-de-bloc.tsx`, `gestes.ts`, `modele.ts`,
`src/app/(dashboard)/n/[...chemin]/page.tsx`, `tests/integration/org-transfer.test.ts`, `tests/unit/mcp-tools.test.ts`
et son instantané : aucune double application, aucun import en double. Doublures adaptées aux signatures d'E11 :
`e10s02-fichiers.test.tsx` (`EditeurDeBlocs` sans `niveau`, `phraseDePublication` ni `lienVersionPubliee`),
`e10s02-visionneuse-pages.test.tsx` (`PublicNodeView.language`), `e10s02-assistant.test.ts` (publication directe,
HN-E10S02-78). Migrations : `20260929190000` ne crée que `discard_draft` et ne re-versionne aucune fonction que
`20260929200000` redéfinit (`block_search_text` part toujours de `20260929170000`, `forget_user` de la ligne de
base) ; les deux copies de `20260929200000` sont identiques, base locale refaite. Alignement sur D150 : AC-b6, AC-f1 et
HN-E10S02-8 réécrits, aucun code touché (HN-E10S02-78).

**Correction 2 (revue des lots c et d).**

- M (`security-patterns.md § Droits dans le service`) : `tests/integration/files-view.test.ts`, cas d'un fichier
  `ready` d'un nœud hors périmètre et d'un fichier `pending`, tous deux cités par un bloc publié de la racine partagée
  (lignes posées en administration) : la même 404 par la route HTML et la lecture, un fichier cité légitimement servi
  par le même lien. `public_file_by_token` n'a pas changé : il exige un bloc publié du nœud du fichier.
- M (AC-d3) : `attachFiles` (`server/nodes/write-files.ts`) refuse un bloc `file` sans métadonnées sûres, ou le garde
  en `code` en mode tolérant (HN-E10S02-82) ; test dans `e10s02-assistant.test.ts`.
- M (`accessibility-patterns.md § Focus Management`, `§ Régions dynamiques`) : `CadreDuFichier` monte une région
  `role="alert"` vide avec l'iframe, que l'avis remplit ; après « Recharger », le focus va à l'iframe neuve
  (HN-E10S02-83) ; test dans `e10s02-visionneuse.test.tsx`.
- M (`coding-standards.md § DRY`, décision du pilote) : `api/session.ts` (`verifiedSession`, `sessionIdentity`,
  `authenticationRequired`, `SessionOptions`), utilisée par `handlePlateforme` et `fileHtmlResponse`
  (HN-E10S02-84) ; mêmes codes et mêmes réponses, prouvés par les tests existants (`api-handler.test.ts`,
  `api-token.test.ts`, `cell.test.ts`, `files-html.test.ts`, `files-view.test.ts`), dont les doublures visent les
  modules que l'aide importe.
- B : entrée de migration complétée ; exception d'en-têtes écrite dans `security-patterns.md § Headers de sécurité` ;
  commentaire du chemin interne de Next dans `tests/unit/next-config.test.ts` ; `checkCursor` avant `readNodeFile`
  (HN-E10S02-85), avec un cas dans `e10s02-assistant.test.ts` (aucune lecture de l'objet).
- Canal O7 nommé dans AC-c6 (HN-E10S02-86), constaté dans `tests/e2e/e10s02-voir.spec.ts`.

**Tests écrits, non lancés (vague).** `tests/integration/files-view.test.ts`, `tests/integration/e10s02-assistant.test.ts`,
`tests/integration/components/e10s02-visionneuse.test.tsx`, `tests/e2e/e10s02-voir.spec.ts`.

### Lot e

**Écarts avec l'architecture.** Aucun invariant touché. AC-e1 était livré par le lot c (HN-E10S02-94). `duplicate_subtree`
change de type rendu (`copied_files`, HN-E10S02-90) : son seul appelant, `duplicateNode`, lit la colonne. Le transfert sans
stockage suit AC-e4 depuis la correction 1 (HN-E10S02-87).
La duplication compte au quota (HN-E10S02-89). Restent hors du lot : les objets des nœuds que `forget_user` supprime et
ceux d'une organisation supprimée en SQL partent orphelins (la cascade emporte les lignes), comme ceux de `pnpm
test:cleanup` (§ Hors périmètre).

**Composants créés.**

| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `requireQuota` | `packages/plateforme/server/files/service.ts` | Quota sous le verrou 7501, extrait de `requestFileUpload`, relu par la duplication |
| `copyFileObjects` | `packages/plateforme/server/files/service.ts` | Objets copiés après le commit, lignes passées à `ready` ; échec : `pending`, nommé |
| `STORAGE_VARIABLES`, `transferStore`, `exportObjects`, `importObjects`, `filesDir`, `exportedObject`, `objectKey` | `scripts/lib/org-transfer-files.mjs` | Octets du transfert : S3 signé par `aws4fetch`, `<fichier>.files/<id>`, résumé |
| `TableSpec.only` | `scripts/lib/org-transfer.mjs` | Filtre d'une table de la carte (`files` : `ready`), lu par `orgRowsSql` |
| `plan.files` | `scripts/lib/org-transfer-plan.mjs` | Paires (ancien, nouvel identifiant, type) des fichiers importés |

**Notes.** Migration : `duplicate_subtree` (§ 7 de l'en-tête) ajoutée à `20260929200000_platform_files.sql`, recopiée
dans `supabase/migrations/` (`pnpm migrations:sync`), base locale refaite (`pnpm db:local --reset`), `pnpm
check:migrations` conforme ; la duplication et l'instruction de purge ont été jouées une fois sur la base locale sous
`authenticated`, dans une transaction annulée (paires rendues, lignes `pending` sous la copie, `file_id` des blocs et de
l'instantané réécrits, fichiers des seuls nœuds purgés supprimés). Suites qui appellent `duplicate_subtree` (`rg -l
"duplicate_subtree|duplicateNode" tests`) : `tests/integration/e05s10e-gestes.test.ts`, à rejouer au `verify`. Tests
écrits, non lancés (vague) : `tests/integration/e10s02-corbeille-duplication.test.ts` (AC-e3 : copies, réécriture,
objets, copie en échec, aucun fichier cité par deux nœuds, lien public de la copie, quota ; AC-e2 : lignes et objets
des nœuds purgés, fichier d'un nœud vivant gardé, objet orphelin nommé), `tests/unit/e10s02-transfert-fichiers.test.ts`
(stockage des cinq variables, S3 par chemin signé, `<fichier>.files/<id>`, envois sous le nouvel identifiant, objets
absents et envois en échec, plan et empreinte avec un fichier), `tests/integration/org-transfer.test.ts` (lignes
`ready` seules, nouvel identifiant cité par le bloc et l'instantané de la copie, scripts lancés sans stockage).

### Lot f

**Écarts avec l'architecture.** ADR-018 appliqué : une porte sans session qui écrit, `POST /api/plateforme/uploads/<jeton>`,
servie avant le jeton de session (`api/uploads.ts`), en texte brut, sans CORS ; le ticket prouve qui et où, le droit se
relit à l'envoi par les services d'écriture. `consume_upload_ticket` est la quatrième fonction qu'`anon` exécute (ADR-018
§ 3). `server/uploads.ts` est le premier service à bâtir un client de base sur une ligne en base (`createPlatformDb` sur
la personne du ticket). Le formulaire de dépôt ajoute une page à l'hôte (`/upload/<token>`) et une route à session
avant la table de dispatch (HN-E10S02-95, acceptée ; § Effet produit réécrit à la correction 1). `WriteOrigin`
gagne `file` et `applyOps` l'option `wholeFile` (HN-E10S02-98). La description de `call` s'allonge d'une phrase (ADR-002
§ 1) ; aucun outil ajouté. Non livré : AC-f17 (banc sur claude.ai et ChatGPT, action hors du dépôt). La spec e2e d'AC-c6
(F16) garde un jeton bien formé inconnu : la requête ne part pas de l'iframe (`connect-src 'none'`), et le refus d'une
`Origin` précède toute lecture du ticket (test unitaire). `server/database.ts` n'est pas régénéré.

**Composants créés.**

| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `uploadLinkSchema`, `UPLOAD_TOKEN_PATTERN`, `UPLOAD_BYTES_MAX`, `UPLOAD_TTL_MINUTES`, `UPLOADS_ROUTE`, `UPLOAD_FORM_ROUTE`, `UPLOAD_RULE`, `UPLOAD_KINDS`, `UPLOAD_MODES`, `MODES_OF` ; types `UploadFormView`, `UploadDone`, `UploadKind`, `UploadMode`, `UploadLinkArgs` | `packages/plateforme/schemas/uploads.ts` | Entrée d'`upload.link`, forme du jeton, bornes, adresses, règle dite à l'assistant (une source pour `call`, le contrat de `write` et `upload.link`) |
| `fileNameSchema` (exporté) | `packages/plateforme/schemas/files.ts` | `name` d'`upload.link` |
| `createUploadTicket`, `receiveUpload`, `receiveLinkUpload`, `receiveFormUpload`, `uploadForm`, `newUploadToken`, `uploadTokenHash`, `unknownUploadLink` ; types `IssuedTicket`, `UploadRequest` | `packages/plateforme/server/uploads.ts` | Ticket (AC-f1, AC-f3), consommation sous `anon` (AC-f5), identité reconstruite (AC-f6), journal (AC-f9), formulaire (AC-f15) ; `uploadForm` exporté par `./server` |
| `checkDestination`, `writeUpload` ; types `UploadTicket`, `UploadResult` | `packages/plateforme/server/uploads-write.ts` | Destination décidée au lien et relue à l'envoi ; contenu (AC-f7) et écriture d'un fichier, d'un `.md`, d'un CSV (AC-f8) |
| `fetchSource`, `isPublicAddress`, `SOURCE_FAILURES` ; types `Resolve`, `SourceGet`, `SourceAnswer`, `Fetched` | `packages/plateforme/server/uploads-fetch.ts` | Téléchargement contrôlé (AC-f12 à AC-f14) : schéma, port, adresses résolues par la connexion, 3 redirections, 10 s, 1 Mo |
| `uploadLink`, `uploadCommands`, `UPLOAD_NOTE` | `packages/plateforme/server/catalog/upload-link.ts` | `upload.link` derrière `call` (connecteur `upload`, classe `write`) ; commandes bash et PowerShell |
| `storeFile`, `admittedType`, `checkSize` (exportés), `insertPending`, `markReady` (internes) | `packages/plateforme/server/files/service.ts` | Envoi par le serveur au stockage d'ADR-016 (ligne, `PUT` présigné, `HEAD`, `ready`) |
| `isUploadRoute`, `uploadResponse`, `isUploadFormRoute`, `uploadFormResponse`, `UPLOAD_HEADERS` | `packages/plateforme/api/uploads.ts` | Porte sans session (AC-f4, AC-f8) et route à session du formulaire, lecture bornée du corps |
| `EcranDeDepot` ; `FormulaireDeDepot` (îlot) ; `DEPOT`, `REFUS_DU_DEPOT` | `packages/plateforme/ui/depot/` | Écran de `form_url` (Server) : destination, zone de dépôt d'E10-S01 reprise, « Déposé » en `status`, refus en `alert` ; `EcranDeDepot`, `REFUS_DU_DEPOT` exportés par `./ui` |
| `deposerParLeLien` ; `lireLaReponse` (interne) | `packages/plateforme/ui/api/client.ts` | Le fichier tel quel à la route du formulaire ; lecture de l'enveloppe partagée avec `appelerPlateforme` |
| Page `/upload/[token]` | `src/app/(dashboard)/upload/[token]/page.tsx` | Hôte : session revérifiée, `uploadForm`, `EcranDeDepot` |

**Notes.** Migration : `upload_tickets` et `consume_upload_ticket` (§ 8 et § 9 de l'en-tête), `forget_user` (§ 5)
supprime les tickets de la personne, ajoutés à `20260929200000_platform_files.sql`, recopiée dans `supabase/migrations/`
(`pnpm migrations:sync`), base locale refaite (`pnpm db:local --reset`), `pnpm check:migrations` conforme ; la
consommation jouée une fois sur la base locale sous `anon`, dans une transaction annulée (servie une fois, puis `null`
pour un ticket servi, expiré, d'une autre organisation ou inconnu ; `mode` contraint par `kind`). Fichiers communs avec
E11 : `server/catalog/registry.ts` (import et ligne `uploadLink`, commentaire), `server/catalog/contracts.ts` (import
d'`UPLOAD_RULE`, une ligne de la description de `write.table`), `server/nodes/write.ts` (`tolerantFor`, `uploadedFile`,
`checkPath` exporté, `applyOps` sur une page vide et `wholeFile` dans `saveEdits` et `create`), `server/tables/import.ts`
(`requireCreation` et `inferredHeader` exportés). Hors de la liste d'Implémentation, indispensables : `server/nodes/ops.ts`
(`wholeFile`), `server/nodes/write-result.ts` (`WriteOrigin.file`), `server/journal.ts` (`source_url` masquée),
`mcp/tools.ts` (phrase de `call`, AC-f16), `ui/api/client.ts`, `scripts/lib/org-transfer.mjs` (`NEVER_EXPORTED`).
Suites qui appellent `forget_user` (`rg -l "forget_user" tests`), à rejouer au `verify`. Tests écrits, non lancés
(vague) : `tests/unit/e10s02-uploads.test.ts` (jeton et empreinte, commandes, entrée d'`upload.link`, refus 1 à 4 de la
porte dans leur ordre sans client de base ni lecture du corps, 401 du formulaire, `source_url` masquée et clés voisines),
`tests/unit/e10s02-uploads-fetch.test.ts` (AC-f13 : un cas par règle, résolution doublée, redirections, délai, taille),
`tests/integration/e10s02-uploads.test.ts` (refus immédiats, lien rendu et ticket, `find` et contrat, procédure refusée,
ménage des tickets, envoi d'un fichier, d'un `.md`, d'un CSV, brouillon, même `not_found`, course, bornes, droits relus
sans écriture, personne retirée, journal, `source_url`, formulaire), `tests/integration/pages/e10s02-depot-page.test.tsx`.
Attendus changés : `tests/unit/catalog.test.ts`, `tests/unit/connectors-context.test.ts` (`upload.link` au catalogue),
`tests/unit/mcp-tools.test.ts` (description de `call`), `tests/unit/rls-policies.test.ts` (trois policies),
`tests/integration/isolation/tables.test.ts` (`consume_upload_ticket` à `ANON_FUNCTIONS`, `CREATION.upload_tickets`),
`tests/integration/isolation/donnees.ts` (un ticket dans B), `tests/integration/portabilite-schema.test.ts`
(`upload_tickets.user_id`, 32 colonnes).

### Correction 1 (lots e, f)

**Constats de la revue et corrections.**

- AC-e4 rétabli (HN-E10S02-87 réécrite) : `requireTransferStore` (`scripts/lib/org-transfer-files.mjs`) lève, en nommant
  les cinq variables, quand des fichiers sont à transférer sans stockage ; `org-export.mjs` l'appelle après la lecture,
  avant les objets et le JSON ; `org-import.mjs` juste après `readVariables`, avant la connexion et `prepare`.
  `exportObjects` et `importObjects` n'ont plus de chemin sans stockage.
- Jeton propre au formulaire (décision du pilote, HN-E10S02-108) : colonne `form_token_hash` (unique, forme contrôlée,
  accordée à l'insertion), `consume_upload_ticket(p_org, p_hash, p_form)`, `form_url` bâtie sur le second jeton,
  `uploadForm` et `receiveFormUpload` lisent `form_token_hash`, la porte sans session `token_hash` ; `UploadRequest.via`.
- M1 : `readBounded` (`server/bounded-read.ts`), lu par `api/uploads.ts`, `server/uploads-fetch.ts` et
  `server/files/service.ts` ; `errorResponse`, `asPlatformError`, `addressOrigin` et `requireSameOrigin` dans
  `api/session.ts`, lus par `handler.ts` et `api/uploads.ts` (`jsonFailure`, `asFailure`, `originOf` retirés)
  (HN-E10S02-111) ; lignes « Doublons » ajoutées.
- M2 : `createUploadTicket` bâtit l'origine par `webUrl` ; `originOf` retiré de `server/uploads.ts`.
- M3 : `-- ROLLBACK: (jamais exécuté depuis le paquet)` en fin de migration.
- M4 : après « Déposé », le focus va à la région `status` (`tabIndex={-1}`), par un effet gardé par une ref ; après un
  refus qui a servi le lien, à l'alerte.
- M5 : l'envoi de `rapport.html` est relu par `GET files/<id>/html`, aux en-têtes d'ADR-017 § 1.
- B1 : `source_url` masquée par son nom normalisé exact (`MASKED_NAMES`) ; `resource_url`, `resourceUrl` et
  `datasource_url` restent lisibles. B2 : `::/96` et `64:ff9b:1::/48` bloqués. B3 : ancien identifiant non uuid refusé
  avant `join` (HN-E10S02-112). B4 : copies par lots de 8 (HN-E10S02-113). B5 : ligne `aws4fetch` de `tech-stack.md`.
  B6 : `console.error` quand l'origine manque. B7 : lecture d'`upload_tickets` limitée (HN-E10S02-105). B8 : zone retirée
  après un refus qui a servi le lien (HN-E10S02-109). B9 : « N elements kept as text. » (HN-E10S02-110). B10 : dossier
  `.files/` contrôlé, vidé avec `--force` (HN-E10S02-112). B11 : classe 7501 dans `database-patterns.md § Transactions`.
- Effet produit réécrit pour la page `/upload/<token>` (HN-E10S02-95 acceptée).

**Composants créés.**

| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `readBounded` ; type `ByteSource` | `packages/plateforme/server/bounded-read.ts` | Lecteur borné d'un corps (flux web ou itérable), refus choisi par l'appelant |
| `addressOrigin`, `requireSameOrigin`, `errorResponse`, `asPlatformError` | `packages/plateforme/api/session.ts` | Déplacés de `handler.ts` (les deux derniers), partagés avec `api/uploads.ts` |
| `requireTransferStore` | `scripts/lib/org-transfer-files.mjs` | Garde d'AC-e4 |
| `UUID` (export) | `scripts/lib/org-transfer.mjs` | Relu par `importObjects` |
| type `UploadChannel`, `UploadRequest.via` | `packages/plateforme/server/uploads.ts` | Porte d'un envoi, lue par la consommation |
| `DEPOT.clos` | `packages/plateforme/ui/depot/libelles.ts` | Phrase qui remplace la zone après un refus qui a servi le lien |

**Notes.** Migration : `20260929200000_platform_files.sql` complétée (`form_token_hash`, `consume_upload_ticket` à trois
paramètres, policy de lecture, rollback), recopiée dans `supabase/migrations/` (`pnpm migrations:sync` : à jour, copies
identiques), base locale refaite (`pnpm db:local --reset`), `pnpm check:migrations` conforme ; la consommation et la
lecture jouées une fois sur la base locale, dans une transaction annulée (jeton du formulaire refusé à la porte sans
session et réciproquement, l'un servi rend l'autre `null`, `p_form` nul rend `null` ; un membre ne lit que ses tickets
et les tickets expirés). `handler.ts`, fichier d'ajout, perd `errorResponse`, `asPlatformError` et le contrôle d'origine
en ligne (décision du pilote). Tests écrits, non lancés (vague) : `tests/unit/e10s02-transfert-fichiers.test.ts` (garde,
refus sans stockage sans `.files/`, dossier gardé sans `--force` et vidé avec, identifiant non uuid),
`tests/integration/org-transfer.test.ts` (aller-retour contre un faux S3 local, octets sous `<nouvel org>/<nouvel id>` ;
export et import sans stockage refusés), `tests/integration/e10s02-uploads.test.ts` (jeton du formulaire refusé par la
porte sans session, jeton de `curl` refusé par le formulaire, l'un servi rend l'autre `not_found`, lecture d'un ticket
réservée à sa personne, route HTML du `rapport.html`, « 1 element kept as text. », consommation à trois paramètres),
`tests/integration/pages/e10s02-depot-page.test.tsx` (focus sur « Déposé », zone gardée après un refus avant la
consommation, retirée après un refus qui a servi le lien, focus sur l'alerte), `tests/unit/e10s02-uploads.test.ts`
(clés voisines de `source_url`), `tests/unit/e10s02-uploads-fetch.test.ts` (plages ajoutées et leurs voisines),
`tests/unit/e10s02-copies.test.ts` (copies par lots de 8), `tests/integration/isolation/donnees.ts` et
`tables.test.ts` (`form_token_hash`).
