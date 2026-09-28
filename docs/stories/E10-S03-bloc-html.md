# Story E10-S03 — Bloc `html` : artefacts isolés, dépôt par l'écran et par `write`

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E10 — Contenus riches |
| **Parcours** | 4.4 Concevoir et mettre à jour ; 4.2 Faire (Claude Code dépose un rapport) |
| **Statut** | 🟢 Ready |
| **Priorité** | Could (FR-CONC-09) |
| **Référence UI** | N/A : style du paquet ; comportement d'un artefact de Claude (aperçu, plein écran, source) |
| **Conventions** | database, security, api, mcp, portage, a11y, state, uploads, testing |
| **Estimation** | L |
| **Vague** | E10, après 1.0.0 |
| **Dépend de** | E10-S04 (`markdown-parse.ts`, `blocks.ts`, `blocks-render.ts`) ; E10-S01 (`ui/coque/import-de-fichier.tsx`, export `.md` d'AC-a6 et aller-retour d'AC-a7) ; E10-S06 (choix du « + » sans HTML) ; E10-S02 (bloc `file` de « Joindre comme fichier », dialogue d'agrandissement) ; ADR-017 amendé et accepté par le pilote avant l'implémentation |
| **Porteuse de migration** | **Oui** (Ⓜ) : type de bloc `html`, bornes du texte par type, `html_visible_text`, `block_search_text`, lecture publique d'un bloc |

## Contexte

JB veut déposer une page HTML générée par Claude Code, comme un artefact de Claude. Il a choisi
un type de bloc, pas un type de nœud (fiche D111). Un « artefact » est une page dont le seul bloc
est `html`, affichée en pleine largeur (fiche D116). Un fichier déjà sur le disque se dépose par le
lien à usage unique d'E10-S05 ; la clôture ` ```html-artifact ` de `write` sert aux petits
artefacts (fiche D117). L'isolation est décrite par ADR-017.

**Refs :**
- PRD : FR-CONC-09
- ADR-017 (tout, amendé par le pilote : § Documents partagés), ADR-011 § 2, ADR-002, ADR-009,
  ADR-013, ADR-001
- `security-patterns.md § Droits dans le service` ; `uploads-patterns.md § Validation` (exception
  d'ADR-017, écrite par le pilote)

## Périmètre

### IN
- Type de bloc `html`, ses bornes, son texte visible pour `find`.
- Route isolée de l'organisation et route publique par jeton, en-têtes d'ADR-017.
- Rendu en iframe, bannière, plein écran, source, téléchargement.
- Page artefact : un seul bloc, création par le rail, remplacement du fichier.
- `write` (clôture ` ```html-artifact `), `read` (extrait dans la page, source par le champ `block`).
- Un cas de test par canal de sortie, ouvert ou fermé (AC10).

### Hors périmètre
- Dépôt par `curl` d'un gros fichier : E10-S05 (réutilise `htmlArtifactInput` et la règle d'AC4).
- Choix du « + » et de `/` dans l'éditeur : E10-S06 (« HTML » n'y figure pas).
- Origine séparée pour les artefacts : écartée par ADR-017 (à revoir si `allow-same-origin` devient
  nécessaire).
- Thème de l'organisation dans l'artefact : non (ADR-017, conséquences négatives).
- Appels réseau d'un artefact vers une API extérieure : non, par conception (`connect-src 'none'`).

## Critères d'acceptation

- [ ] **AC1 — Modèle.**
  - **Given** la migration appliquée **When** un bloc `html` s'écrit **Then** `text` porte la source,
    de 1 à 250 000 caractères (`HTML_MAX`, `server/nodes/limits.ts`), et `data` vaut `{title?}`
    (200 caractères au plus).
  - La borne du texte devient une borne par type, en base (`blocks_text_check`) comme dans Zod
    (`blockText`, `schemas/blocks.ts` l. 57) : `html` ≤ 250 000, tout autre type ≤ 100 000 comme
    aujourd'hui.
  - **Given** un bloc `html` **When** `find` le cherche **Then** seul son texte visible est indexé
    (`block_search_text`) : balises, `<script>`, `<style>` et commentaires retirés, entités
    décodées, `data.title` en tête. La source brute (`p_text`) n'est jamais indexée pour ce type, et
    l'extrait de `find` (`ts_headline`) ne montre jamais une balise.
  - `block_search_text` rend le même texte qu'avant pour tous les autres types (test).
- [ ] **AC2 — Route isolée.**
  - **Given** un lecteur du nœud **When** l'iframe demande
    `GET /api/plateforme/blocks/<id>/html?state=published` **Then** la route sert la source, suivie du
    script de hauteur (AC3), avec exactement les en-têtes d'ADR-017 § 1 amendé :
    - `Content-Type: text/html; charset=utf-8` ;
    - `Content-Security-Policy: sandbox allow-scripts allow-popups allow-forms; default-src 'none';
      script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
      style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;
      img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none';
      frame-ancestors 'self'` ;
    - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
      `Cache-Control: private, no-store`.
  - `state=draft` exige l'écriture sur le nœud (niveau 2).
  - **Given** une requête sans session **Then** 401, code `forbidden` (H04).
  - **Given** l'un des cas suivants **Then** 404, code `not_found`, même réponse pour tous, sans dire
    lequel :
    - lecture refusée, ou brouillon demandé sans l'écriture ;
    - bloc d'une autre organisation, d'un autre type, ou inexistant ;
    - `state` absent ou autre que `published` et `draft` ;
    - `Sec-Fetch-Dest` présent et différent de `iframe` (onglet, fenêtre ouverte, lien direct).
  - Une erreur se sert en texte brut, avec les mêmes en-têtes : jamais en JSON dans l'iframe.
  - La route ne passe pas par la table de dispatch, qui ne rend que du JSON (`serve`,
    `api/handler.ts`) : une branche avant le dispatch, comme `isPublicRoute`, la sert.
  - **Given** l'hôte de référence **Then** `X-Frame-Options` et `Referrer-Policy` de
    `next.config.ts` ne s'appliquent pas aux deux routes HTML (exclusion dans `headers()`). Le test
    e2e lit les en-têtes **reçus** par le navigateur : le test d'intégration ne voit pas
    `next.config.ts`.
- [ ] **AC3 — Rendu.**
  - **Given** une page artefact **When** elle s'affiche **Then** l'iframe porte
    `sandbox="allow-scripts allow-popups allow-forms"`, sans `allow-same-origin`, avec
    `referrerpolicy="no-referrer"` et sans attribut `allow`. Son `title` vaut `data.title`, sinon
    « Contenu interactif ».
  - **Hauteur.** L'écran applique un message seulement si :
    - `event.source` est la fenêtre de cette iframe ;
    - le message a exactement la forme `{type: "oto-html-height", height: <nombre fini>}`.

    `event.origin` (`"null"`) n'est jamais lu. La hauteur est bornée entre 120 et 10 000 px et
    appliquée au plus une fois par image affichée. Elle vaut 480 px en attendant. Tout autre message
    est ignoré, et l'écran n'envoie jamais de message à l'iframe.
  - **En-tête du bloc.**
    - La bannière d'AC8, hors de l'iframe, et un badge « Contenu interactif ».
    - « Plein écran » : dialogue, `Échap` le ferme, le focus revient au bouton.
    - « Voir la source » : bloc de code en lecture seule, rendu comme du texte, jamais interprété.
    - « Télécharger » : un Blob `text/html` de la source, nommé `<dernier segment du chemin>.html`,
      téléchargé par l'écran ; aucune route n'est ajoutée.
  - **Given** l'iframe charge un second document (navigation) **Then** l'écran la remplace par
    « Ce contenu a tenté de quitter la page. » et un bouton « Recharger ».
- [ ] **AC4 — Une page artefact ne porte que son bloc** (fiche D116).
  - **Given** des opérations appliquées au brouillon (écran ou `write`) **When** le brouillon qui en
    résulte contient un bloc `html` **Then** il ne contient que ce bloc, et le nœud est de genre
    `page`. Sinon, avant toute écriture, `invalid_arguments` :
    - à côté d'autres blocs : « This would leave an html-artifact block next to other blocks; an
      html-artifact page holds that block only. Nothing was written. » ;
    - hors d'une page : « An html-artifact block goes only in a page, not in a <genre>. Nothing
      was written. » (`procedure` ou `table` ; un Contexte est de genre `context`).
  - La règle porte sur le résultat des opérations, jamais sur une opération seule. Elle couvre :
    - l'ajout d'un bloc à un artefact ;
    - l'ajout d'un `html` à une page qui a d'autres blocs ;
    - un `replace_block` qui change un type ;
    - un `kind` changé par `write`.

    Supprimer le bloc `html` laisse une page vide, qui redevient une page ordinaire.
  - Le contrôle vit dans `applyOps` (`server/nodes/ops.ts`), après la boucle des opérations, avec
    le genre du nœud passé en option. La publication ne le refait pas : le brouillon est déjà tenu.
  - **Given** une page artefact à l'écran **Then** elle s'affiche en pleine largeur de la zone de
    contenu, sans marge de lecture, sans « + » ni poignée de bloc. Le titre et le résumé s'éditent
    comme ailleurs, et le menu du nœud gagne « Remplacer le fichier HTML… ».
  - **Given** « Remplacer le fichier HTML… » et un `.html` choisi **Then** un `replace_block` du
    bloc s'écrit au brouillon, sur la révision lue. Le titre et le résumé du nœud ne changent pas,
    `data.title` suit le `<title>`, et une révision périmée donne `stale_revision`.
- [ ] **AC5 — Créer un artefact à l'écran.**
  - **Given** le « + » d'un dossier du rail **When** on choisit « Artefact HTML… », puis un
    `.html` **Then** une page artefact est créée sous ce dossier, en brouillon.
  - **Given** un `.html` glissé sur un dossier du rail **Then** même résultat.
  - Les champs viennent de `htmlArtifactInput(source, fileName)` (`schemas/html.ts`) :
    - titre : le `<title>` du document, sinon le nom du fichier sans extension, coupé à 200 ;
    - résumé : `<meta name="description">`, sinon les 200 premiers caractères du texte visible,
      sinon « Importé de <nom du fichier> » (même repli qu'E10-S01 AC-a4) ;
    - bloc : `{type: "html", text: source, data: {title}}`, envoyé en `input` d'un `insert_after`
      sans `block`.
  - Un fichier de plus de `HTML_MAX` caractères, ou qui n'est pas de l'UTF-8 valide, est refusé
    à l'écran avant l'envoi. Le service refuse de même (`too_large`, `invalid_arguments`).
  - **Given** un `.html` glissé dans une page ordinaire **Then** deux choix :
    - « Créer une page artefact sous cette page » ;
    - « Joindre comme fichier » : bloc `file` d'E10-S02, jamais exécuté.
  - « HTML » n'apparaît jamais dans le choix du « + » d'une page (E10-S06).
- [ ] **AC6 — `write`.**
  - **Given** une page créée ou vide **When** `write` envoie
    `{"op": "insert_after", "text": "```html-artifact Rapport mensuel\n<source>\n```"}` (sans
    `block`) **Then** un bloc `html` s'écrit, `data.title` = « Rapport mensuel » (le titre est
    facultatif).
  - Pour un artefact existant : `replace_block` sur la référence du bloc. `add_section`,
    `append`, `replace_section` et `replace_text` créent un titre ou visent une section : sur un
    artefact, ils tombent sous le refus d'AC4.
  - **Taille.** Le contrôle d'`OP_TEXT_MAX` (40 000, `checkFields`, `ops.ts` l. 65) tourne avant
    l'analyse (l. 122-123). Il admet donc, pour un texte dont la première ligne non vide ouvre une
    clôture ` ```html-artifact `, jusqu'à `HTML_MAX` + 1 000 caractères. L'analyse
    (`markdown-parse.ts`) borne ensuite la source à `HTML_MAX`. Au-delà, `too_large` : « the
    html-artifact block is <N> characters; <HTML_MAX> at most. For a file on disk, use upload.link. »
  - **Bornes de la page.** Dans `checkBounds`, une section qui contient un bloc `html` est exemptée
    de `SECTION_MAX` (100 000). Le bloc compte dans `PAGE_MAX` pour la longueur de sa clôture
    complète.
  - ` ```html ` reste un bloc `code`.
  - Une clôture ` ```html-artifact-excerpt ` (la forme d'AC7) est refusée, en `invalid_arguments` :
    « line <n>: an html-artifact-excerpt is what read shows of an html-artifact block, not its
    source; read the block with block: "<ref>" and send its whole html-artifact fence. »
  - **Contrat.** Un contrat `write.artifact` (`server/catalog/contracts.ts`) dit :
    - la clôture et son titre ;
    - la page à un seul bloc, et les deux opérations admises ;
    - la taille ;
    - « for a file already on disk, or over 20,000 characters, use upload.link ».

    La description de `write` (`mcp/tools.ts` l. 76) s'allonge du seul nom de ce contrat : « read
    their contracts with read, path write.procedure, write.table or write.artifact » (ADR-002 :
    une description ne fait que s'allonger).
- [ ] **AC7 — `read`** (fiche D119, sous l'option recommandée).
  - **Given** une page lue en entier, par section, par écart (`since_revision`) ou en brouillon
    **Then** chaque bloc `html` se sert ainsi, et jamais sous sa source :

    ````
    ```html-artifact-excerpt <data.title>
    <les 2 000 premiers caractères du texte visible>
    ```
    source: <N> characters; read it alone with block: "<ref>".
    ````

    La référence y est toujours donnée, même sans `refs: true`. L'extrait se pose dans le service
    de `read` : `servedMarkdown` (`read-format.ts` l. 149) et `serveBody` (`read-body.ts`).
    `renderBlock` rend toujours la clôture complète, ce qui garde l'aller-retour de
    `markdown-parse.ts` l. 3-4 et l'export `.md` (E10-S01 AC-a6).
  - **Given** `read {path, block: "<ref>"}` **Then** seul ce bloc se sert, sous sa forme complète
    (`renderBlock`, ` ```html-artifact ` pour un `html`), découpé par le curseur existant au-delà de
    45 000 caractères (`paginate`, `read-pages.ts`).
    - Le champ `block` est facultatif, sans défaut (la page entière). Il vaut pour tout type de bloc.
    - Il est exclusif de `section`, `outline` et `since_revision` : sinon `invalid_arguments`, dans
      le refus existant, qui le nomme.
    - Il se combine avec `draft`, `refs` et `cursor`, et entre dans la clé du curseur (`requestKey`).
    - Une référence inconnue donne `not_found` : « Unknown block <ref> in <path>: read it with refs:
      true to get the references. »
  - **Aller-retour.** Pour un bloc `html` servi en une partie, `parseMarkdown` du corps redonne le
    bloc. Servi en plusieurs parties, leurs corps mis bout à bout, selon la coupe de `cutPages`,
    redonnent la clôture complète.
- [ ] **AC8 — Partage public** (fiche D112 B ; décision C1).
  - **Given** une page artefact publiée dans le périmètre d'un lien **When** la page publique
    s'affiche **Then** l'iframe charge
    `GET /api/plateforme/public/<jeton>/blocks/<id>/html?path=<chemin>` :
    - servie par la porte publique (`isPublicRoute`, `api/public.ts`, étendue), hors session ;
    - avec les en-têtes d'AC2, plus `X-Robots-Tag: noindex, nofollow` ;
    - avec le même `sandbox`, la même règle `Sec-Fetch-Dest` et le même script de hauteur.
  - La source vient de `platform.public_html_block_by_token(org, jeton, chemin, bloc)`, fonction
    `security definer` exécutée sous `anon`, bâtie sur les règles de `public_node_by_token`. Seul un
    bloc `html` **publié** du nœud désigné, dans le périmètre du lien, est servi. Tout autre cas
    donne `not_found`, la même réponse (jeton inconnu, désactivé, bloc en brouillon, hors du
    périmètre, autre type).
  - **Given** tout bloc `html`, dans l'organisation comme en public **Then** la bannière s'affiche
    au-dessus de l'iframe, hors d'elle : « Contenu interactif publié par <nom de l'organisation>.
    N'y saisissez jamais de mot de passe. »
  - En public, l'en-tête garde « Plein écran », « Voir la source » et « Télécharger », à partir de
    la vue de `readPublicNode`.
- [ ] **AC9 — Publication.** **Given** un rédacteur (niveau 2) **When** il dépose un artefact
  **Then** il reste en brouillon, et la publication lui reste réservée, selon le comportement
  existant de `write` (`reservedTo`, `write-result.ts` l. 145). **Given** un gestionnaire **Then**
  il publie. Rien de nouveau : un test le vérifie pour le bloc
  `html`.
- [ ] **AC10 — Isolation vérifiée, un cas par canal** (ADR-017 § 2 amendé ; grille « garantie de
  sécurité »). Test e2e sur un artefact d'essai. « Constaté » veut dire :
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
  | F10 | `top.location = …`, `<a target="_top">` | `sandbox` sans `allow-top-navigation` | l'adresse de l'application ne change pas |
  | F11 | `<a download>` | `sandbox` sans `allow-downloads` | aucun téléchargement |
  | F12 | `<base href="https://…">` puis lien relatif | `base-uri 'none'` | violation, lien résolu sur l'origine de la route |
  | F13 | route ouverte hors iframe (`Sec-Fetch-Dest: document`, `window.open` de la route) | contrôle d'AC2 | 404 |
  | F14 | fenêtre ouverte : `document.cookie` dans la fenêtre | `sandbox` hérité | `SecurityError` |
  | F15 | `parent.postMessage` d'une autre forme, ou d'une autre fenêtre | contrôle d'AC3 | hauteur inchangée |
  | F16 | hauteur de 10⁹ px | borne d'AC3 | hauteur = 10 000 px |

  **Canaux ouverts, acceptés et nommés :**

  | # | Canal | Constat qui garde la limite écrite |
  |---|-------|-------------------------------------|
  | O1 | navigation de l'iframe (`location = …`, `<meta http-equiv="refresh">`) | la requête part ; l'écran montre « Ce contenu a tenté de quitter la page. » |
  | O2 | navigation vers une adresse qui répond 204 | la requête part ; aucun second chargement, l'écran ne voit rien |
  | O3 | fenêtre ouverte sur un clic (`allow-popups`) vers l'extérieur | la requête part depuis la fenêtre |
  | O4 | DNS : `<link rel="dns-prefetch">`, `<link rel="preconnect">` | aucune violation levée (non couvert par la CSP) |
  | O5 | WebRTC : `new RTCPeerConnection({iceServers: [{urls: "stun:…"}]})` | aucune exception (non couvert par `connect-src`) |
  | O6 | les trois CDN admis (adresse IP du lecteur transmise) | requête servie, sans `Referer` |

## Implémentation

### Migrations prévues
Un fichier : `packages/plateforme/migrations/<horodatage>_html_block.sql`, additif (règles de
`check:migrations` : une contrainte remplacée par `drop constraint X, add constraint X check` dans
la même instruction, plus large que l'ancienne).
- `blocks_type_check` : ajoute `'html'`.
- `blocks_shape_check` : branche `html` (texte non nul, non blanc ; `data.title` absent ou chaîne de
  200 caractères au plus).
- `blocks_text_check` : `text is null or char_length(text) <= case when type = 'html' then 250000
  else 100000 end`.
- `platform.html_visible_text(text)` : `immutable`, `parallel safe`, `search_path` vide ; mêmes
  cas que `htmlVisibleText` (test de parité).
- `platform.block_search_text` (`create or replace`) : `p_text` exclu pour `html`, branche
  `when 'html' then concat_ws(' ', p_data ->> 'title', platform.html_visible_text(p_text))`. Sortie
  inchangée pour les autres types. La colonne générée `search_tsv` n'est pas recalculée : aucune
  ligne `html` n'existe avant.
- `platform.public_html_block_by_token(p_org uuid, p_token text, p_path text, p_block uuid)` :
  `security definer`, `grant execute` à `anon`, règles de `public_node_by_token`, bloc `html`
  publié seulement.

### Schémas Zod partagés
- `schemas/blocks.ts` : branche `html` de `blockInputSchema` ; `blockText` borné par type
  (`HTML_MAX` pour `html`).
- `schemas/nodes.ts` : champ `block` de `readNodeSchema` (« Reference of one block to read alone,
  from read with refs: true, e.g. 3f9a2c1b (default: the whole page). »).
- `schemas/html.ts` (nouveau) : `htmlVisibleText`, `htmlArtifactInput`, et la forme du message de
  hauteur. Écrits de façon linéaire (`security-patterns.md § Validation des inputs`), partagés par
  `server/` et `ui/`.

### Fichiers à créer
- `migrations/` : le fichier ci-dessus.
- `schemas/html.ts`.
- `server/nodes/html-block.ts` : en-têtes, script de hauteur, service des deux routes (droit,
  état, type, `Sec-Fetch-Dest`).
- `api/blocks.ts` : la branche `blocks/<id>/html`, avant le dispatch.
- `ui/noeud/artefact-du-bloc.tsx` : iframe, bannière, en-tête, dialogue, message de hauteur.
- Tests : `tests/e2e/artefact-isole.spec.ts`, `tests/integration/html-block.test.ts`,
  `tests/unit/html-visible-text.test.ts`, `tests/helpers/html-visible-cases.ts` (cas communs au
  test unitaire et au test de parité SQL).

### Fichiers à modifier
- `schemas/` : `blocks.ts`, `blocks-render.ts` (clôture ` ```html-artifact `, `fenceFor`),
  `nodes.ts`, `index.ts` (fichier d'ajout).
- `server/nodes/` :
  - `limits.ts` (`HTML_MAX`) ;
  - `markdown-parse.ts` (clôture, refus de l'extrait) ;
  - `ops.ts` (seuil d'AC6, exemption de `SECTION_MAX`, règle d'AC4) ;
  - `write.ts` (genre du nœud passé à `applyOps`) ;
  - `read.ts` (champ `block`), `read-body.ts`, `read-format.ts` (extrait), `read-pages.ts`
    (`requestKey`) ;
  - `links.ts` (aucun lien tiré d'un bloc `html`).
- `server/` : `procedures-check.ts` (`html` refusé en procédure, déjà par AC4), `shares.ts`
  (source publique).
- `server/catalog/contracts.ts` : `write.artifact`.
- `mcp/tools.ts` : description de `write` allongée (AC6), description de `read` allongée d'une
  phrase sur `block`.
- `api/` : `handler.ts` (branche avant le dispatch ; fichier d'ajout : lignes ajoutées seulement),
  `public.ts` (`isPublicRoute` étendue).
- `ui/` : `noeud/rendu-des-blocs.tsx`, `noeud/editeur/modele.ts`, `noeud/editeur/champ-de-bloc.tsx`,
  `coque/import-de-fichier.tsx` (E10-S01), le rendu de la page publique.
- Hôte : `next.config.ts` (exclusion des deux routes HTML dans `headers()`). README du paquet : une
  CSP de l'hôte sur ses pages admet `frame-src 'self'`, et l'hôte ne pose ni `X-Frame-Options` ni
  CSP globale sur `/api/plateforme/blocks/*` et `/api/plateforme/public/*/blocks/*`.
- Tests existants : `tests/helpers/block-cases.ts` (cas `html` valides et invalides),
  `tests/unit/__snapshots__/mcp-tools.test.ts.snap` (champ `block`, descriptions allongées).

### Points de départ
- Aucun dans le banc (`C:\apps\mcp-test\src\proto\`) ni dans Oto : ni l'un ni l'autre n'affiche de
  contenu HTML d'un auteur. Modèle de comportement : l'artefact de Claude (aperçu, plein écran,
  source).
- Dans le paquet : `api/public.ts` (branche avant le dispatch, en-têtes publics), `fenceFor`
  (`blocks-render.ts` l. 85), le refus `too_large` de `checkFields`.

### Patterns à suivre
- `security-patterns.md § Droits dans le service` ; ADR-017 à la lettre : tout écart d'en-tête ou de
  `sandbox` est une HAUTE de sécurité.
- `mcp-patterns.md` : NFR-CONC-01, `read` d'une page ne sert jamais la source.
- `accessibility-patterns.md` : `title` de l'iframe, dialogue plein écran, focus rendu à la
  fermeture.

## Rayon d'impact

### Appelants
- Types de bloc : `rg -n '"mermaid"' C:/apps/oto-platform/packages C:/apps/oto-platform/tests` et,
  pour le SQL, `rg -n "'mermaid'" C:/apps/oto-platform/packages/plateforme/migrations`
  (`blocks_shape_check` l. 2155, `blocks_type_check` l. 2164 de la ligne de base V1). Plus
  `rg -n '"image"'` : `links.ts` l. 33, `procedures-check.ts` l. 110, `modele.ts` l. 155.
- Borne du texte : `rg -n "100_000|100000" C:/apps/oto-platform/packages/plateforme/schemas/blocks.ts
  C:/apps/oto-platform/packages/plateforme/migrations` → `blockText` l. 57, `blocks_text_check`.
- `OP_TEXT_MAX` : `rg -n "OP_TEXT_MAX" C:/apps/oto-platform/packages` → `limits.ts` l. 10,
  `ops.ts` l. 13 et 65 (seul contrôle, dans `checkFields`, avant l'analyse).
- `SECTION_MAX` : `checkBounds` (`ops.ts` l. 83-104), mesuré par `blocksSize` → `blockMarkdown`
  (`document.ts` l. 42-62).
- `block_search_text` : `rg -n "block_search_text" C:/apps/oto-platform/packages/plateforme/migrations`
  → définition l. 112, lexique l. 646, déclencheur l. 662, extrait de `find` l. 1772, `search_tsv`
  l. 2139.
- Rendu d'un bloc : `rg -n "blockMarkdown|renderBlock\b" C:/apps/oto-platform/packages/plateforme/server`
  → `document.ts`, `read-format.ts` l. 150, `references.ts` l. 135 et 142, `section-ops.ts`
  l. 80, 146, 157. L'identité d'un bloc gardé (l. 80) compare la clôture complète : inchangée.
- `readNodeSchema` : `mcp/schemas.ts` l. 44 (schéma servi aux hosts, champ ajouté).
- `readPublicNode` (`server/shares.ts` l. 203) ; `isPublicRoute` (`api/public.ts`).
- En-têtes globaux : `next.config.ts` l. 20-30 (`X-Frame-Options: DENY`, `Referrer-Policy`).
- Écouteurs de messages : `rg -n "addEventListener\(.message" C:/apps/oto-platform/packages/plateforme
  C:/apps/oto-platform/src` → aucun.

### Doublons
- Dialogue plein écran : réutiliser le dialogue d'agrandissement d'E10-S02, fusionnée avant
  (`component-registry.md`).
- Rendu en iframe : `rg -n "iframe" C:/apps/oto-platform/packages/plateforme/ui C:/apps/oto-platform/src`
  → aucun. Créer.
- Branche publique : étendre `isPublicRoute`, sans nouvelle porte.

### Effet produit
- Schéma : Ⓜ, sans table ; contraintes élargies, trois fonctions.
- MCP : `read` gagne un champ facultatif (fiche D119), `write` une clôture et un contrat ; liste
  d'outils inchangée (ADR-002).
- Partage public : route par jeton, bannière.
- Hôte : `next.config.ts` ; aucune variable nouvelle.
- Duplication (`server/nodes/duplicate.ts`) : copie le bloc, l'artefact reste un artefact (test).
- Corbeille : rien de propre. Transfert d'organisation : colonne `text` inchangée, carte `TABLES`
  intacte ; l'import passe par les contraintes élargies.
- Versions : chaque publication garde la source dans `node_versions` (jusqu'à 250 000 caractères),
  sous `PAGE_MAX` comme toute page.
- Export `.md` (E10-S01) : la clôture complète ; réimportée, elle redonne l'artefact.

### Refacto
- Écarté : servir l'artefact depuis une origine séparée (ADR-017, alternatives).
- Écarté : une route de téléchargement ; le Blob de l'écran suffit.

## Hypothèses

- **HN-E10S03-1** : la clôture s'appelle ` ```html-artifact ` (source : simple ; ` ```html ` est
  pris par `code`).
- **HN-E10S03-2** : `HTML_MAX` = 250 000 caractères, sous `PAGE_MAX` (300 000) (source : simple).
- **HN-E10S03-3** : les CDN admis sont `cdnjs.cloudflare.com`, `cdn.jsdelivr.net` et Google Fonts,
  ceux des artefacts de Claude (source : ADR-017 § 1).
- **HN-E10S03-4** : la règle d'un seul bloc est tenue par le service, sur le résultat des
  opérations, et pas par une contrainte en base : elle porte sur plusieurs lignes de `blocks`
  (source : `security-patterns.md § Droits dans le service`).
- **HN-E10S03-5** : la source d'un bloc se lit par un champ facultatif `block` de `read` (source :
  ADR-002, ajout facultatif) → fiche D119.
- **HN-E10S03-6** : l'extrait d'une page porte une clôture distincte,
  ` ```html-artifact-excerpt `, refusée par `write`, pour qu'un extrait relu ne remplace jamais une
  source (source : simple).
- **HN-E10S03-7** : HTML refusé hors iframe par `Sec-Fetch-Dest` ; un navigateur qui ne l'envoie
  pas est servi (source : décision C10 du pilote).
- **HN-E10S03-8** : `allow-forms` ajouté, l'envoi réel reste bloqué par `form-action 'none'`
  (source : décision C10).
- **HN-E10S03-9** : canaux DNS, WebRTC et `meta refresh` acceptés et nommés ; `base-uri 'none'`
  (source : décision C10).
- **HN-E10S03-10** : `SECTION_MAX` exempté pour une section qui contient un bloc `html` (source :
  simple ; l'artefact n'a qu'une section).
- **HN-E10S03-11** : « Télécharger » passe par un Blob de l'écran, sans route (source : simple ; la
  source est déjà dans `NodeView`).

## Actions JB

- Aucune pour l'implémentation. D119 reste ouverte ; la story avance sous l'option (a).

## Tests attendus

### Unit tests
- [ ] Texte visible : scripts, styles, commentaires, entités, texte long sans retour à la ligne
  (temps linéaire), sur `tests/helpers/html-visible-cases.ts`.
- [ ] `htmlArtifactInput` : titre, `<meta name="description">`, replis.
- [ ] Clôture ` ```html-artifact ` : titre, taille (seuil de `checkFields`, borne de l'analyse),
  aller-retour, refus de ` ```html-artifact-excerpt `.
- [ ] `applyOps` : règle d'AC4 dans chaque forme listée, exemption de `SECTION_MAX`.
- [ ] Message de hauteur : forme, source, bornes.

### Integration tests
- [ ] Contraintes : `html` de 250 000 admis, de 250 001 refusé ; autre type à 100 001 refusé
  (`block-cases.ts`).
- [ ] Parité SQL : `html_visible_text` égal à `htmlVisibleText` sur les cas communs ;
  `block_search_text` inchangé pour les autres types ; `find` trouve un mot visible, jamais une
  balise.
- [ ] Route isolée : en-têtes exacts, lecture ou écriture exigée, autre organisation, autre type,
  `state` absent, `Sec-Fetch-Dest`, 401 sans session, erreur en texte brut.
- [ ] Route publique : source servie par le jeton, en-têtes exacts, bloc en brouillon ou hors du
  périmètre refusé.
- [ ] Publication réservée à la gestion (AC9) ; duplication d'un artefact.
- [ ] Export `.md` d'un artefact, puis réimport (avec E10-S01).

### MCP (`InMemoryTransport`)
- [ ] `write` : création par `insert_after`, remplacement par `replace_block`, refus d'AC4 et
  d'AC6 (textes exacts).
- [ ] `read` : extrait dans la page (texte exact), `block` seul, curseur au-delà de 45 000,
  exclusions de `block`, référence inconnue.
- [ ] Contrat `write.artifact` lu par `read`.
- [ ] Golden query, proposée au pilote : « Range ce petit rapport HTML dans ventes/rapports » →
  `write` avec une clôture ` ```html-artifact `.

### E2E tests
- [ ] AC10, chaque ligne F1 à F16 et O1 à O6.
- [ ] En-têtes reçus par le navigateur sur les deux routes (exclusion de `next.config.ts`).
- [ ] Dépôt d'un `.html` sur le rail, « Remplacer le fichier HTML… », plein écran (`Échap`, focus),
  source, téléchargement.
- [ ] Contrôle visuel dans les deux thèmes : page artefact, bannière, page publique.

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Notes
