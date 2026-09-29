# Story E11-S09 — Brancher mon Claude, ChatGPT ou Mistral : un guide par onglet, dans une grande fenêtre et sur /connect

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | 5.1 Se connecter et brancher son assistant |
| **Statut** | 🟢 Ready |
| **Priorité** | Should |
| **Référence UI** | N/A : style du paquet, tokens d'oto-frontend (`portage-ecrans.md`) ; onglets sur le motif `Tabs` du design system d'oto-frontend (`C:\apps\oto-frontend\src\design-system\components\react\navigation.jsx` l. 23-25 et 58-133, classes `.oto-tabs`, `.oto-tab`, `.oto-tabpanel` déjà portées, `ui/ds/components/css/navigation.css` l. 7, 18, 70) ; fenêtre `Dialog` taille `lg` (720 px, `ui/ds/components/css/dialog.css` l. 29) |
| **Conventions** | portage, a11y, registry, api, nextjs, state, performance, seo, supabase, security, testing |
| **Estimation** | M |
| **Vague** | E11, avant E11-S07 (qui renomme `?onglet=` et relit les pages de l'hôte) |
| **Dépend de** | Aucune story. Action JB pour le banc de Mistral Le Chat (§ Actions JB) |
| **Porteuse de migration** | Non : rien ne change en base |

## Contexte

Retour du responsable d'Oto sur l'hôte de démo (2026-09-29) : « Brancher un assistant » est à revoir
sur l'ergonomie.

Aujourd'hui (chemins relatifs à `packages/plateforme/`) :
- La carte de l'accueil (`ui/accueil/branchement-ia.tsx`, montée par `ui/accueil/ecran-accueil.tsx`
  l. 124) montre l'adresse copiable tant qu'aucun assistant n'est branché (l. 79 et 92). « Brancher »
  (l. 85-89) ouvre un `Dialog` `sm` (l. 95-109) qui répète l'adresse et renvoie aux « Guides
  d'installation » de `/connect` (`LienDesGuides`, l. 61-73).
- La page `/connect` (`ui/connexion/ecran-connexion.tsx`) empile sept îlots : intro (l. 174),
  « Adresse du serveur » (l. 176-181), « Nom du connecteur » (l. 182-185), trois guides (l. 64-129),
  « À essayer » (l. 133-148), « Vos connexions » (l. 150-166). Les textes sont écrits en ligne.
- Le guide claude.ai a six étapes ; la quatrième (« Actualiser la liste d'outils », l. 74-76) est de
  trop. Mistral Le Chat n'a aucun guide (Mistral Vibe retiré, `branchement-ia.tsx` l. 12).

Ce que veut le responsable d'Oto :
- renommer en « Brancher mon Claude, GPT, Mistral » ;
- pas d'adresse sur la carte : la fenêtre la porte ;
- une grande fenêtre qui montre directement le guide, un onglet par assistant, avec le lien vers la
  page des connecteurs de chaque hôte ;
- claude.ai : étape 1 telle quelle, étape 2 sur deux lignes, étape 3, pas d'étape 4, la phrase de
  préférences gardée, puis une dernière étape « C'est branché » avec des exemples ;
- la page `/connect` : même contenu, concis, structuré, pédagogique.

**Refs :**
- PRD : FR-CONN-04 (page de branchement : adresse, guide par host, nom, phrase, prompts d'exemple,
  connexions)
- Architecture : § 10 (l'organisation vient de l'adresse) ; `mcp-patterns.md § 9` (onboarding
  humain, phrase de préférences mesurée)
- ADR-008 § 3 (tokens d'oto-frontend), ADR-015 (écrans en français)

## Périmètre

### IN
- Un composant de guide partagé, à quatre onglets : claude.ai, ChatGPT, Mistral, Claude Code.
- Une primitive `Tabs` du design system, portée d'oto-frontend.
- Textes des étapes réécrits, rangés dans `ui/connexion/libelles.ts`.
- La carte de l'accueil sans adresse ; « Brancher » ouvre le guide en fenêtre `lg`.
- La page `/connect` : le guide, puis « Vos connexions ».
- Le nouveau nom partout où l'ancien s'affiche.
- La famille « Mistral » reconnue au journal, si le banc relève sa signature (AC-15).

### OUT
- Adresse `/connect` : inchangée (déjà en anglais ; E11-S07 la liste parmi les adresses neutres).
- Texte servi aux assistants : inchangé, y compris la consigne d'actualiser le connecteur de l'outil
  d'administration (`mcp/admin/tools/org.ts` l. 151).
- Mistral Vibe, Claude Desktop en guide séparé, Codex, Cursor : V2, à la demande.
- Mise à jour de FR-CONN-04 et de `mcp-patterns.md § 9` (nom, Mistral) : le pilote, à la clôture.

## Textes (mot pour mot)

`{nom}` : nom de l'organisation (`AdresseDeConnexion.nom`) ; `{nomCli}` : son préfixe
(`nomCli`, `^[a-z][a-z0-9]{1,11}$`, `schemas/admin.ts` l. 22-25) ; `{url}` : adresse du serveur ;
`{phrase}` : phrase de préférences (`server/connect.ts` l. 41, inchangée).

- Titre (carte, fenêtre, menu du compte, palette, en-tête de `/connect`) : « Brancher mon Claude,
  ChatGPT ou Mistral » (HN-E11S09-1).
- Intro du guide : « Ajoutez {nom} à votre assistant : il agira avec votre compte, dans la limite
  de vos droits. »
- Barre d'onglets, nom accessible : « Votre assistant ». Onglets : « claude.ai », « ChatGPT »,
  « Mistral », « Claude Code ».
- Champs de l'étape 2 : une liste de définitions, « Nom » puis « Adresse », chacun avec sa
  `ValeurCopiable` (« Copier le nom du connecteur », « Copier l'adresse du serveur »).
- Dernière étape, tête commune en gras : « C'est branché. »

**claude.ai**
1. « Dans claude.ai, ouvrez Paramètres → Connecteurs, puis ajoutez un connecteur personnalisé. »
   Lien « Ouvrir les connecteurs de claude.ai ». Note : « Le connecteur servira aussi dans Claude
   Desktop et l'application mobile. »
2. « Renseignez ces deux champs : » Nom `{nom}`, Adresse `{url}`.
3. « Connectez-vous avec votre compte {nom}, puis cliquez sur « Autoriser ». »
4. « Ajoutez cette phrase à vos préférences personnelles de claude.ai : » `{phrase}` copiable
   (« Copier la phrase de préférences »). Note : « Vous avez plusieurs connecteurs d'organisation ?
   N'ajoutez pas cette phrase : elle attirerait les demandes des autres. »
5. « C'est branché. Ouvrez une nouvelle conversation et commencez par l'une de ces demandes : »
   les trois exemples (AC-7). Note : « Le connecteur n'apparaît pas ? Rechargez la page. »

**ChatGPT**
1. « Dans ChatGPT, ouvrez Paramètres → Applications → Paramètres avancés, puis activez le mode
   développeur. » Lien « Ouvrir les paramètres de ChatGPT ». Note : « Le mode développeur n'existe
   pas dans l'offre gratuite de ChatGPT. »
2. « Créez une application avec ces deux champs, authentification OAuth : » Nom `{nom}`, Adresse
   `{url}`.
3. « Connectez-vous avec votre compte {nom}, puis cliquez sur « Autoriser ». »
4. « Sur la fiche de l'application, cliquez sur « Actualiser » : sans ce geste, aucun outil
   n'apparaît. »
5. « C'est branché. Dans une nouvelle conversation, choisissez « Mode développeur » puis {nom} dans
   le menu +, et commencez par l'une de ces demandes : » les trois exemples.

**Mistral**
1. « Dans Le Chat, ouvrez Connecteurs, cliquez sur « Ajouter un connecteur », puis choisissez
   l'onglet « Connecteur MCP personnalisé ». » Lien « Ouvrir les connecteurs de Le Chat ».
2. « Renseignez ces deux champs : » Nom `{nomCli}`, Adresse `{url}`. Note : « Le Chat refuse les
   espaces dans un nom : gardez ce nom court. »
3. « Cliquez sur « Connecter », connectez-vous avec votre compte {nom}, puis cliquez sur
   « Autoriser ». »
4. « C'est branché. Ouvrez une nouvelle conversation et commencez par l'une de ces demandes : » les
   trois exemples.

**Claude Code**
1. « Dans un terminal, ajoutez le serveur : » `claude mcp add --transport http {nomCli} {url}`
   copiable (« Copier la commande d'ajout du serveur »).
2. « Connectez-vous : » `claude mcp login {nomCli}` copiable (« Copier la commande de connexion »).
   Note : « Le navigateur s'ouvre pour la connexion et l'autorisation. »
3. « C'est branché. Ouvrez une nouvelle session (`/mcp` montre l'état du serveur) et commencez par
   l'une de ces demandes : » les trois exemples.

**Liens directs** (HN-E11S09-3) :
- claude.ai : `https://claude.ai/customize/connectors` (source : Claude Help Center, « Get started
  with custom connectors using remote MCP », article 11175166 : « Navigate to Customize >
  Connectors at claude.ai/customize/connectors »).
- ChatGPT : `https://chatgpt.com/#settings/Connectors` (**à vérifier au dev** : aucune page
  d'OpenAI ne donne d'adresse directe ; l'aide d'OpenAI a refusé la lecture, les guides de
  développeurs ne citent qu'un chemin de menu).
- Mistral : `https://chat.mistral.ai/connections` (source : mistral.ai, « Le Chat. Custom MCP
  connectors. Memories. », le répertoire des connecteurs à cette adresse).

**Exemples génériques**, dans cet ordre : « Qu'est-ce que je peux te demander ici ? »,
« Quelles procédures puis-je lancer ? », « Résume ce qui a changé cette semaine. »

## Critères d'acceptation

### Lot a — Le guide (`GuideDeBranchement`)

- [ ] **AC-1 — Onglets.** **Given** le guide monté **Then** une barre `role="tablist"` nommée
  « Votre assistant » porte quatre `role="tab"`, dans l'ordre claude.ai, ChatGPT, Mistral, Claude
  Code ; un seul `role="tabpanel"` visible, nommé par son onglet (`aria-labelledby`) ; seul l'onglet
  choisi est dans la tabulation. **When** ← → Début Fin sur un onglet **Then** le focus et le choix
  passent à l'onglet visé (activation automatique : le contenu est déjà là). **When** clic **Then**
  l'onglet est choisi.
- [ ] **AC-2 — Onglet ouvert d'abord.** **Given** des connexions lues **When** le guide s'ouvre
  **Then** l'onglet est celui de la famille la plus récente (`connexions.data[0].famille`) :
  « claude.ai » → claude.ai, « ChatGPT » → ChatGPT, « Mistral » → Mistral, « Claude Code » →
  Claude Code. **Given** aucune connexion, une famille inconnue ou une lecture en échec **Then**
  claude.ai (HN-E11S09-2).
- [ ] **AC-3 — claude.ai.** **Given** l'onglet claude.ai **Then** une liste ordonnée de cinq
  étapes, textes de § Textes à l'identique ; aucune étape « Actualiser la liste d'outils » ;
  l'étape 2 est une liste de définitions « Nom » / « Adresse », chaque valeur entière en `<code>`
  avec son bouton de copie.
- [ ] **AC-4 — ChatGPT.** **Given** l'onglet ChatGPT **Then** cinq étapes à l'identique.
- [ ] **AC-5 — Mistral.** **Given** l'onglet Mistral **Then** quatre étapes à l'identique ; le nom
  copiable est `{nomCli}`, jamais `{nom}`.
- [ ] **AC-6 — Claude Code.** **Given** l'onglet Claude Code **Then** trois étapes ; les deux
  commandes copient exactement `claude mcp add --transport http {nomCli} {url}` et
  `claude mcp login {nomCli}`.
- [ ] **AC-7 — « C'est branché ».** **Given** des procédures lues **Then** la dernière étape de
  chaque onglet montre trois demandes copiables : les titres des trois premières procédures, dans
  l'ordre reçu, complétés par les exemples génériques dans leur ordre. **Given** aucune procédure
  **Then** les trois exemples génériques. **Given** la lecture en échec **Then** `ErreurDeLecture`
  à la place des demandes (« Réessayer » relit la page), le reste du guide intact.
- [ ] **AC-8 — Liens.** **Given** les onglets claude.ai, ChatGPT, Mistral **Then** le lien de
  l'étape 1 va à l'adresse de § Textes, s'ouvre dans un nouvel onglet (`target="_blank"`,
  `rel="noopener noreferrer"`), et son nom accessible finit par « (nouvel onglet) ». Claude Code
  n'a pas de lien.

### Lot b — L'accueil

- [ ] **AC-9 — La carte.** **Given** l'accueil **Then** l'îlot et son `h2` s'appellent « Brancher
  mon Claude, ChatGPT ou Mistral », avec « Brancher » en tête. **And** la carte ne montre jamais
  l'adresse ni aucun bouton « Copier ». **Given** aucune connexion **Then** « Aucun assistant
  branché ». **Given** des connexions **Then** une ligne par famille, comme aujourd'hui
  (`EtatDuBranchement`, l. 38-58). **Given** la lecture en échec **Then** `ErreurDeLecture`.
- [ ] **AC-10 — La fenêtre.** **When** « Brancher » **Then** un `Dialog` `size="lg"` titré
  « Brancher mon Claude, ChatGPT ou Mistral » montre l'intro puis le guide (AC-1 à AC-8), sans
  autre clic, et « Fermer » au pied. **And** le lien « Guides d'installation » n'existe plus.
  **When** Fermer, Échap ou clic sur le fond **Then** la fenêtre se ferme et le focus revient à
  « Brancher ». **And** à 375 px de large, aucun défilement horizontal de la page ; le corps de la
  fenêtre défile seul (`.oto-dialog-body`, `dialog.css` l. 79-86).
- [ ] **AC-11 — Les données de l'accueil.** **Given** la page de l'hôte `/` **Then**
  `DonneesDeLAccueil.adresse` est une `AdresseDeConnexion` entière (url, nom, nomCli, phrase) et
  les exemples viennent de `procedures`, déjà lues (`usefulProcedures`) : aucune lecture de plus.

### Lot c — La page `/connect`

- [ ] **AC-12 — La page.** **Given** `/connect` **Then** l'en-tête d'écran dit « Brancher mon
  Claude, ChatGPT ou Mistral », puis un îlot porte l'intro et le guide, puis l'îlot « Vos
  connexions » (inchangé, l. 150-166). **And** les îlots « Adresse du serveur », « Nom du
  connecteur » et « À essayer » n'existent plus : l'adresse et le nom passent dans l'étape 2 de
  chaque onglet, les exemples dans sa dernière étape. **And** `metadata.title` est le nouveau
  titre, `robots.index` reste `false`.
- [ ] **AC-13 — Les lectures de `/connect`.** **Given** la page **Then** elle lit
  `usefulProcedures(db, identity, 3)` au lieu de `listPrompts` (mêmes exemples qu'à l'accueil,
  HN-E11S09-5) et `lastConnections`, en parallèle ; **When** l'une échoue **Then** elle seule se dit
  (AC-7, et « Vos connexions » avec « Réessayer » vers `/connect`).

### Lot d — Nom et famille

- [ ] **AC-14 — Le nom partout.** **Given** le menu du compte **Then** ses entrées sont « Profil »,
  « Brancher mon Claude, ChatGPT ou Mistral », « Corbeille », « Déconnexion » ; la palette le
  propose sous « Aller à ». **And** le texte du premier jour devient : « Votre assistant lit vos
  pages, suit vos procédures et appelle vos outils, dans la limite de vos droits. Branchez-le
  d'abord : « Brancher mon Claude, ChatGPT ou Mistral » vous guide pas à pas. »
- [ ] **AC-15 — Mistral au journal.** **Given** la signature `initialize` de Le Chat relevée au banc
  (§ Actions JB) **When** `lastConnections` la lit **Then** la famille est « Mistral ». Sans relevé
  avant le dev, la ligne de `hostFamily` n'est pas écrite et la post-implémentation le dit
  (HN-E11S09-6).
- [ ] **AC-16 — Deux thèmes.** **Given** la fenêtre ouverte et `/connect`, en clair et en sombre
  **Then** aucune couleur numérotée, onglet choisi lisible (contraste AA) ; captures des deux thèmes
  par les tests e2e.

## Implémentation

### Migrations prévues
Aucune : rien ne change en base.

### Schémas Zod
Aucun : aucune entrée nouvelle ; les formes restent `AdresseDeConnexion`, `ExempleDePrompt`,
`DerniereConnexion` (`ui/connexion/types.ts`).

### Fichiers à créer, par face
- `ui/ds/react/tabs.tsx` : `Tabs` (client), porté de `TabsBase` d'oto-frontend sans la variante
  `card` : `tabs: { value, label }[]`, `value`/`defaultValue`/`onChange` par `useControllable`
  (`ui/ds/react/hooks.ts`), `label`, un seul panneau rendu (celui choisi) ; flèches, Début, Fin.
- `ui/connexion/guide-de-branchement.tsx` : `GuideDeBranchement` (client ; props `adresse`,
  `exemples: Resultat<ExempleDePrompt[]>`, `connexions: Resultat<DerniereConnexion[]>`), et deux
  fonctions pures internes : `ongletDeDepart(connexions)` (AC-2), `troisDemandes(exemples)` (AC-7).
- `ui/connexion/libelles.ts` : tous les textes de § Textes, liens compris.
- Hôte : `src/lib/plateforme/connexion.ts` : `adresseDe(ConnectAddress): AdresseDeConnexion`, sorti
  de `src/app/(dashboard)/connect/page.tsx` l. 33-35 (deuxième appelant : l'accueil).
- Tests : `tests/integration/components/guide-de-branchement.test.tsx`.

### Fichiers à modifier
- `ui/accueil/branchement-ia.tsx` : plus d'adresse sur la carte ni de `LienDesGuides` ; fenêtre
  `lg` avec `GuideDeBranchement` ; props `adresse: AdresseDeConnexion`, `exemples`, sans `guides`.
- `ui/accueil/ecran-accueil.tsx` : sans `hrefDesGuides` (l. 46-47, 66, 104, 124) ; passe
  `lu.procedures` en exemples (titres).
- `ui/accueil/types.ts` : `adresse: AdresseDeConnexion` (l. 20-21).
- `ui/accueil/libelles.ts` : `BRANCHEMENT` réduit à `brancher`, `fermer`, `aucun`, `derniere`
  (l. 63-71) ; `PREMIER_JOUR.texte` (AC-14).
- `ui/coque/libelles.ts` : `COMPTE.brancher` (l. 30) et son commentaire (l. 27).
- `ui/connexion/ecran-connexion.tsx` : titre `COMPTE.brancher` (l. 41) ; les guides internes,
  `PromptsAEssayer` et les îlots Adresse et Nom retirés ; un îlot avec l'intro et le guide, puis
  « Vos connexions ». Reste Server Component.
- `server/connect.ts` : `hostFamily` (l. 50-58), une ligne pour Mistral si AC-15.
- Hôte : `src/app/(dashboard)/page.tsx` (l. 67 retiré, l. 123 `adresseDe(connectAddress(…))`) ;
  `src/app/(dashboard)/connect/page.tsx` (titre l. 27, lectures l. 58-61, `adresseDe` importé).
- `ui/index.ts` : rien (`GuideDeBranchement` et `Tabs` restent internes au paquet).
- `packages/plateforme/CHANGELOG.md` (1.0.1) : `EcranDAccueilProps` perd `hrefDesGuides`,
  `DonneesDeLAccueil.adresse` devient `AdresseDeConnexion`.
- Registry (`component-registry.md`) : l. 59 (accueil), l. 62 (+ `Tabs`), l. 78 (`EcranConnexion`),
  une ligne `GuideDeBranchement`.
- Tests : voir § Tests attendus.

### Patterns à suivre
- `portage-ecrans.md § 2` : client au plus bas ; `EcranConnexion` reste serveur, seul le guide est
  client ; aucune fonction passée du serveur au client (pas de `Lien` au guide).
- `portage-ecrans.md § 4` : quatre états ; une lecture en échec se dit dans sa partie.
- `accessibility-patterns.md § Focus Management` (fenêtre) et § Keyboard Navigation (onglets).
- `accessibility-patterns.md § Couleurs & Contraste` : tokens d'oto-frontend seulement.

## Rayon d'impact

### Appelants
- `BranchementIA` : `rg -n "BranchementIA" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src` → un seul
  montage, `ui/accueil/ecran-accueil.tsx` l. 124.
- `hrefDesGuides` : `rg -n "hrefDesGuides" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `ecran-accueil.tsx` l. 47, 66, 104, 124 ; `src/app/(dashboard)/page.tsx` l. 67 ; doublures
  `ecran-accueil.test.tsx` l. 83, `e05s12-accueil.test.tsx` l. 58. Tous retirés.
- `DonneesDeLAccueil.adresse` : `rg -n "adresse:" C:/apps/oto-pkg/tests/integration/components/ecran-accueil.test.tsx C:/apps/oto-pkg/tests/integration/components/e05s12-accueil.test.tsx`
  → doublures l. 51 et l. 35 en `string` : à passer en `AdresseDeConnexion` (sinon le type-check
  échoue, bien).
- `connectAddress` : `rg -n "connectAddress\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → les deux pages (l. 123, l. 64) et `ecran-connexion.test.tsx` l. 24, 91 ; la fonction ne change
  pas.
- `listPrompts` : `rg -n "listPrompts\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src` →
  `mcp/server.ts` l. 229 et `server/prompts.ts` l. 77 gardent la fonction ; `/connect` cesse de
  l'appeler ; le commentaire de `server/prompts.ts` l. 55-57 (« Lue aussi par la page `/connect` »)
  se corrige.
- Libellé du nom : `rg -n "Brancher un assistant|COMPTE\.brancher" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `coque/ecrans.ts` l. 39 (menu du compte et palette, par `ecransPermis`), `branchement-ia.tsx`,
  `ecran-connexion.tsx` l. 41, `connect/page.tsx` l. 27, commentaires ; tests :
  `rail-application.test.tsx` l. 259-262, `marque-layout-connexion.test.tsx` l. 165,
  `ecran-accueil.test.tsx` l. 100-250 et 275, `e05s12-accueil.test.tsx` l. 145-150,
  `accueil-page.test.tsx` l. 114 et 129, `connect-page.test.tsx` l. 72-106,
  `ecran-connexion.test.tsx` (tout), `tests/e2e/accueil.spec.ts` l. 29-62,
  `tests/e2e/connect.spec.ts` l. 34-53.
- `hostFamily` : privée, lue par `lastConnections` seul (`rg -n "hostFamily" C:/apps/oto-pkg/packages`) ;
  test `tests/integration/last-connections.test.ts`.

### Doublons
- Onglets : `rg -n "role=\"(tablist|radiogroup)\"" C:/apps/oto-pkg/packages/plateforme/ui` →
  `equipes/onglets.tsx` l. 100 (`Onglets` : l'onglet est dans l'adresse, `naviguer`, activation
  manuelle) et `ds/react/segmented-control.tsx` l. 91 (`radiogroup`, « il filtre », l. 3-4).
  Verdict : ni l'un ni l'autre. `Onglets` changerait l'adresse de l'accueil pour ouvrir un onglet de
  fenêtre ; `SegmentedControl` annoncerait des boutons radio pour un changement de vue. Porter
  `Tabs` d'oto-frontend, dont le CSS est déjà là. Ni `Onglets` ni `SegmentedControl` n'ont de
  ligne au registry (`rg -n "Onglets|SegmentedControl" C:/apps/oto-pkg/.method/conventions/component-registry.md`
  → rien) : la ligne de `Tabs` les nomme, pour qu'un prochain écran choisisse sans chercher.
- Copie : `rg -n "<ValeurCopiable" C:/apps/oto-pkg/packages` → réutilisée pour chaque valeur ;
  aucun autre composant de copie.
- Guide : `rg -n "Paramètres → Connecteurs|mode développeur|claude mcp add" C:/apps/oto-pkg/packages/plateforme/ui`
  → `ecran-connexion.tsx` l. 68, 93, 115 seuls (l'écran d'administration « Connecteurs » est un
  autre sujet). Verdict : fusionner dans `GuideDeBranchement`, seule source.
- `adresseDe` : `rg -n "adresseDe|nomCli:" C:/apps/oto-pkg/src` → `connect/page.tsx` l. 33-35.
  Verdict : sortir dans `src/lib/plateforme/connexion.ts` (deux appelants,
  `coding-standards.md § DRY`).

### Effet produit
- Écrans : l'accueil (carte et fenêtre), `/connect`, le menu du compte et la palette (nom).
- Métadonnées OAuth : `resource_documentation` pointe toujours `/connect` (`mcp/metadata.ts`
  l. 65) : la page change, pas l'adresse.
- MCP : aucun changement (liste d'outils, textes servis, `prompts/list`).
- Schéma `platform`, RLS, migrations : aucun.
- Hôte : deux pages et un module ; les props publiques d'`EcranDAccueil` changent (CHANGELOG du
  paquet, 1.0.1, pas de client : décision 1 du préambule).
- Recouvrements : E11-S07 renomme `?onglet=` et relit `src/app/(dashboard)/page.tsx` ; E11-S10
  (lot e), qui sort « Contexte » de l'accueil vers `/context`, touche `ecran-accueil.tsx`,
  `coque/ecrans.ts`, `coque/libelles.ts` et la même assertion du menu du compte
  (`rail-application.test.tsx` l. 262) ; E11-S02 touche les doublures d'`ecran-accueil.test.tsx`.
  La dernière des trois à passer réconcilie la liste du menu.

### Refacto
- Écarté : sortir aussi `connexionsDe`, écrite deux fois (`src/app/(dashboard)/page.tsx` l. 76-78,
  `connect/page.tsx` l. 42-44). Hors de la demande ; elle irait dans le même module. À poser au
  pilote s'il le veut dans cette story (coût : deux imports).
- Écarté : rebâtir `Onglets` sur `Tabs`. Même motif ARIA, mais `Onglets` navigue et s'active à la
  main ; les réunir ajoute des options à `Tabs` sans écran qui le demande.

## Justifier une surface nouvelle
- `Tabs` : sans lui, pas d'onglets à état local annoncés comme onglets. Cran plus simple écarté :
  `SegmentedControl` + un panneau à la main (sémantique de filtre, AC-1 non tenu).
- `GuideDeBranchement` : sans lui, deux copies du guide (fenêtre et page) qui divergeraient. Cran
  plus simple écarté : garder les guides dans `ecran-connexion.tsx` et y lier la fenêtre (l'état
  d'aujourd'hui, que le retour refuse).
- `ui/connexion/libelles.ts` : les textes sortent du composant comme ceux de l'accueil et de la
  coque (`portage-ecrans.md § 4`, constantes du paquet). Cran plus simple écarté : les laisser en
  ligne dans le guide, qui dépasserait alors la taille d'un fichier lisible.
- `src/lib/plateforme/connexion.ts` : deuxième appelant d'`adresseDe`. Cran plus simple écarté :
  la recopier dans la page d'accueil.

## Hypothèses

- **HN-E11S09-1** (**validée, 2026-09-29**) : nom « Brancher mon Claude, ChatGPT ou Mistral ». Alternative :
  « Brancher mon Claude, GPT, Mistral », mot pour mot du retour. Raison : le produit s'appelle
  ChatGPT ; « GPT » est le modèle.
- **HN-E11S09-2** : onglet Claude Code gardé, en dernier ; onglet de départ par la dernière
  famille, sinon claude.ai (source : consigne du pilote ; `lastConnections` trie du plus récent).
- **HN-E11S09-3** (**validée, 2026-09-29**) : étape 1 de claude.ai gardée mot pour mot (« Paramètres →
  Connecteurs »), alors que l'aide d'Anthropic nomme aujourd'hui « Customize > Connectors » ; le
  lien direct y mène de toute façon. Alternative : « ouvrez Personnaliser → Connecteurs ». Les
  libellés de menu de ChatGPT et de Le Chat se relisent au banc (§ Actions JB) ; le dev corrige un
  libellé, pas la structure des étapes. Lien ChatGPT à vérifier au dev.
- **HN-E11S09-4** : dernière étape de claude.ai : « Rechargez la page » passe en note (l'ancienne
  étape 6) ; les notes « Une adresse par organisation… » et « Si plusieurs comptes… ChatGPT
  utilise le compte principal » sont retirées pour la concision (source : retour, « les plus
  concises »). Mistral sans phrase de préférences : non mesurée (`mcp-patterns.md § 9` ne mesure
  que claude.ai, ChatGPT et Claude Code).
- **HN-E11S09-5** : les exemples viennent de `usefulProcedures` sur les deux écrans (ordre du bloc
  servi par `context`, les plus utilisées d'abord), trois au plus, complétés par les génériques
  (source : même contenu demandé ; l'accueil les lit déjà).
- **HN-E11S09-6** : Le Chat se connecte par OAuth 2.1 avec enregistrement dynamique (source : doc
  Mistral « MCP Connectors » ; FR-CONN-02 le sert) ; sa signature `initialize` est inconnue du
  dépôt : la famille « Mistral » n'existe qu'après relevé.
- **HN-E11S09-7** : le lien « Guides d'installation » de la fenêtre disparaît (même contenu que la
  page) ; `/connect` reste au menu du compte et dans les métadonnées OAuth.

## Actions JB

- Banc Mistral : brancher Le Chat (compte Mistral de test) sur l'organisation Démo en suivant
  l'onglet Mistral ; relever les libellés réels et la signature `initialize` au journal ; les
  donner au dev (AC-15, HN-E11S09-3).
- Relire au banc les libellés de ChatGPT (menu, « Mode développeur ») et le lien direct.
- Trancher HN-E11S09-1 et HN-E11S09-3.

## Tests attendus

### Unit tests
- Aucun : `ongletDeDepart` et `troisDemandes` se prouvent par le test du guide (un seul test par
  règle, `testing-strategy.md § Budget de tests`).

### Integration tests
- [ ] `guide-de-branchement.test.tsx` (nouveau) : rôles et clavier des onglets (AC-1) ; onglet de
  départ, un cas par famille et le repli (AC-2, `it.each`) ; étapes des quatre onglets comparées
  aux constantes de `libelles.ts`, plus un texte en dur par onglet pour l'étape 1 (AC-3 à AC-6) ;
  copie du nom et de l'adresse ; `{nomCli}` pour Mistral ; trois demandes (3 procédures, 1
  procédure + 2 génériques, aucune, échec) (AC-7) ; liens, `target`, `rel`, nom accessible (AC-8).
- [ ] `ecran-accueil.test.tsx` : l. 217-250 réécrits : aucune adresse sur la carte, avec ou sans
  connexion (AC-9) ; « Brancher » ouvre la fenêtre `lg` sur l'onglet de la dernière famille, sans
  lien vers `/connect`, et « Fermer » la ferme (AC-10) ; l. 116-163 et 275 au nouveau nom.
- [ ] `e05s12-accueil.test.tsx`, `accueil-page.test.tsx` : nouveau nom, doublure
  `AdresseDeConnexion` ; la page passe l'adresse entière (AC-11).
- [ ] `ecran-connexion.test.tsx` : réécrit à la structure d'AC-12 (titre, deux îlots, plus
  d'« Adresse du serveur », « Nom du connecteur », « À essayer ») ; états d'AC-13 ; le détail des
  étapes reste au test du guide.
- [ ] `connect-page.test.tsx` : lit `usefulProcedures` et non `listPrompts` ; titre des métadonnées
  (AC-12, AC-13).
- [ ] `rail-application.test.tsx` l. 259-262 et `marque-layout-connexion.test.tsx` l. 165 : entrées
  du menu (AC-14).
- [ ] `last-connections.test.ts` : la signature relevée donne « Mistral » (AC-15, si relevée).

### E2E tests
- [ ] `tests/e2e/accueil.spec.ts` : « Brancher » ouvre la fenêtre ; flèche → passe à ChatGPT ;
  captures clair et sombre ; à 375 px, `scrollWidth` du document égal à sa largeur (AC-10, AC-16).
- [ ] `tests/e2e/connect.spec.ts` : ouverture par le menu du compte au nouveau nom ; copie de
  l'adresse dans l'onglet claude.ai ; captures des deux thèmes (AC-12, AC-16).

### Contrôle visuel
- [ ] Fenêtre et page en clair et en sombre, onglet Mistral ouvert : relues par le responsable
  d'Oto avant la clôture.

## Post-implémentation

### Écarts avec l'architecture

- Aucun invariant touché ; aucune migration, aucun changement MCP.
- AC-15 non livré : la signature `initialize` de Le Chat n'est pas relevée, `hostFamily` n'a pas de
  ligne « Mistral » (HN-E11S09-6) ; en attente du banc (action JB).
- Lien direct de ChatGPT gardé tel que la story, non vérifié : l'aide d'OpenAI nomme « Settings →
  Security and login » et `chatgpt.com/plugins` (HN-E11S09-8) ; à relire au banc.
- API publique du paquet changée (CHANGELOG du paquet, `## Unreleased`) : `EcranDAccueilProps` perd
  `hrefDesGuides` ; `DonneesDeLAccueil.adresse` devient une `AdresseDeConnexion` (url, nom, nomCli,
  phrase) ; la prop `prompts` d'`EcranConnexion` attend les procédures utiles
  (`usefulProcedures(db, identity, 3)`), plus `listPrompts`.

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `Tabs`, type `Tab` | `packages/plateforme/ui/ds/react/tabs.tsx` | Onglets à état local, activation automatique, seul le panneau choisi rendu ; `Onglets` si l'onglet est dans l'adresse, `SegmentedControl` pour un filtre |
| `GuideDeBranchement` | `packages/plateforme/ui/connexion/guide-de-branchement.tsx` | Interne au paquet ; monté par `BranchementIA` (fenêtre `lg`) et `EcranConnexion` |
| `ASSISTANTS`, `ETAPES`, `GUIDE`, `LIENS`, `EXEMPLES_GENERIQUES` | `packages/plateforme/ui/connexion/libelles.ts` | Textes et liens du guide |
| `adresseDe` | `src/lib/plateforme/connexion.ts` | Hôte ; `ConnectAddress` vers `AdresseDeConnexion`, lue par l'accueil et `/connect` |

### Notes

- Revue approuvée après une correction. BASSE, traitées à la fusion : `docs/pilote/guide-installation.md`
  réécrit au nouveau guide (onglets, Mistral, plus d'« À essayer ») ; nouveau nom dans FR-CONN-04 et
  les écrans du parcours 5.1 de `docs/prd.md`, `docs/architecture.md` (`connect.ts`) et
  `portage-ecrans.md § 0` ; `mcp-patterns.md § 9` ne cite pas l'ancien libellé, inchangé.
- Restent : relevé de Le Chat au banc (AC-15, libellés de menu de ChatGPT et de Le Chat, lien de
  ChatGPT) ; contrôle visuel des deux thèmes, onglet Mistral ouvert, par le responsable d'Oto.
- Refacto écarté : `connexionsDe` reste écrite deux fois (`src/app/(dashboard)/page.tsx`,
  `connect/page.tsx`), déjà listée en M52.
