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
  sur ce contenu. Le tableau est créé sous la page, sous les droits d'E10-S01 (D120), et un bloc
  `reference` vers lui est inséré après le bloc `file`.
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
  - `create` : écriture sur le dossier parent, chemin libre ; pour un `csv`, les droits d'E10-S01
    (fiche D120) ;
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
| Scripts d'un fichier HTML | Fermés ou nommés un par un | AC-c6 (F1 à F16, O1 à O6) |
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

### Effet produit
- Schéma `platform` et RLS : deux tables, un type de bloc, deux fonctions modifiées, deux
  fonctions `security definer`. Ⓜ : la migration s'applique et fusionne avant toute autre fusion
  (`.method/sprint/vagues.md § Base de test et migrations`).
- Hôte : cinq variables nouvelles, facultatives ; sans elles, rien ne change. `next.config.ts`
  (deux routes HTML) et les deux pages qui passent `view`. Aucun fichier de l'hôte n'est ajouté.
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
- **HN-E10S02-8** : un bloc n'est écrit qu'après `complete`. Aucun brouillon ne cite une ligne
  `pending` (source : le plus simple ; AC-a6 purge sans casser de bloc).
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
- [ ] AC-c6, chaque ligne F1 à F16 et O1 à O6.
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
