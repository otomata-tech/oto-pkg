# Story E05-S12 — Contexte servi regroupé, « Règles Oto », accueil en activités

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E05 — Écrans de la plateforme |
| **Parcours** | Voir ce que lit l'assistant ; suivre ce qui a bougé ; écrire et organiser le contenu |
| **Statut** | 🟢 Ready |
| **Priorité** | Must — avant la publication 1.0.0, comme les retours d'E05-S11 (D105, HN-E05S12-24) |
| **Référence UI** | oto-frontend (`C:\apps\oto-frontend`, lecture seule) : `src/components/accueil/ecran-accueil.tsx` (l. 150-229, `HomeLayout` et ses quatre créneaux), `agents-et-activites.tsx` (onglets « Procédures » et « Activités », l. 72-75, 117-153, 294-297), `fil-activite.tsx` (l. 65-80, 104-133), `contenus-recents.tsx`, `branchement-ia.tsx`, `design-system/components/css/home.css` (l. 42-47, 106-107, 300-344) ; `components/contexte/annexes-du-contexte.tsx` (l. 137) et `routes/context.$sectionId.lazy.tsx` (l. 266-268) pour l'encart d'un Contexte. Le reste : retours de JB du 2026-09-28 ci-dessous, dans le style du paquet |
| **Conventions** | mcp (texte servi par `context`), supabase, security, database (lectures du journal), portage, a11y, state, nextjs, performance, seo, registry, testing, datetime (heures du fil) |
| **Estimation** | L (quatre lots : A M, B M, C M, D S) |
| **Vague** | Retours avant 1.0.0 (suite d'E05-S11) |
| **Dépend de** | E05-S11 lots a, b, c, d, h (fusionnés, `cf61002`) ; lot C : E05-S11 lot e fusionné (`ui/noeud/ecran-de-noeud.tsx`) et lot f fusionné (`tests/e2e/procedure-et-contexte.spec.ts`) ; lot D : E05-S11 lot e fusionné (`ui/coque/sections-du-rail.tsx`, `ui/coque/deplacement-dans-le-rail.tsx`) |
| **Porteuse de migration** | Non (§ Implémentation) |

## Contexte

Essais de JB sur `/?onglet=contexte`, 2026-09-28 : six retours et deux questions, puis le retour 7 (des contenus
sous un Contexte) et les décisions D109 (retour 1) et D110 (retour 7). Base : `main` à `cf61002`
(E05-S11 a, b, c, d, h fusionnés). Les fichiers et les lignes cités sont ceux de cette base.

**Refs :** architecture § 5 (`context/`, l. 331 ; journal, `journal-read.ts`), § 10 (« Règles » : rien de vital dans
la notice, `context` relu à chaque conversation) ; ADR-002 (surface figée, contenu vivant : le texte de `context` est
du contenu, § 1 et § 7) ; ADR-008 (écrans portés) ; H30, H31, H34 à H36, H74, H123, P39, D44 ; E03-S08 (blocs
dynamiques), E05-S04 (aperçu), E05-S05 (journal), E05-S09 b (accueil), E05-S11 (vue « Contexte », AC-11 à AC-16).

### Réponses aux questions de JB

**Q1 — « Procédures utiles » (le bloc `procedures` de `context`).**
Commande : `rg -n "Procédures utiles|useful|procedures" packages/plateforme/server/context` et
`rg -n "PROCEDURES_SIZE|PROCEDURES_MAX|USAGE_DAYS|proceduresBlock" packages src`.

- **Service** : `proceduresBlock` (`packages/plateforme/server/context/blocks/procedures.ts` l. 110-115), lu en
  parallèle des autres blocs par `assembleContext` (`server/context/index.ts` l. 140-151), omis sans erreur si sa
  lecture échoue (`orOmitted`, l. 111-116). Libellé à l'écran : `NOMS_DES_BLOCS.procedures` (`ui/contexte/libelles.ts`
  l. 59).
- **Ce qui entre** : toutes les procédures **publiées** de l'organisation (`kind = 'procedure'`,
  `status = 'published'`) que la personne **lit** (niveau ≥ lecture, `nodeLevels`) — l. 33-44. Aucune sélection :
  la liste est complète, puis bornée.
- **Critère d'ordre** : l'usage sur **90 jours** (`USAGE_DAYS`, l. 25), puis le chemin (l. 113). L'usage = le nombre
  de lignes du journal dont la **cible est le chemin de la procédure** (l. 63-89) : lignes de la personne, plus
  celles des équipes qu'elle mène (toutes ses équipes si elle administre ; aucune pour un simple membre,
  `countedTeams` l. 50-52), les 1 000 plus récentes de chaque lecture (`READ_PAGE_ROWS`, `server/errors.ts` l. 208).
  Compte toute ligne ciblée : procédure servie par `context` (routage), `read` et `write` sur son chemin.
- **Budget** : 60 lignes au plus (`PROCEDURES_MAX`, l. 19) et 8 000 caractères (`PROCEDURES_SIZE`, l. 22) ; chaque
  ligne « `- <chemin>: <résumé>` » ; en tête « `## Procedures you can run (<n>)` » ; au-delà, « `… and <k> more: find
  them with <p>_find, type procedure.` » ; aucune : « `None published yet.` » (l. 96-107). Le tout dans le budget
  total de 20 000 caractères (`CONTEXT_BUDGET`, `engine.ts` l. 12), en avant-dernière place (`index.ts` l. 160) :
  c'est l'un des premiers blocs coupés quand le texte est trop long.
- **Qui le règle** : **personne**. Les trois bornes sont des constantes du code ; aucun écran, aucune route d'API,
  aucun champ d'`admin_org` ni de `orgs.settings` (les seuls réglages lus par le routage sont `threshold` et `gap`,
  `server/routing.ts` l. 148). Leviers indirects seulement : publier ou dépublier une procédure, les droits de
  lecture, et le **résumé** de chaque procédure, qui est le texte servi.

**Q2 — l'onglet « Activités » de l'accueil.**
Commandes : `rg -n "listConversations" c:/apps/oto-platform/src c:/apps/oto-platform/packages`,
`rg -n "j.ctx is not null" c:/apps/oto-platform/packages/plateforme/server/journal-read.ts`.

- **Aujourd'hui** : les **conversations d'assistant** de la semaine, pas les gestes sur les contenus. La page lit
  `listConversations(…, { periodDays: 7 })` (`src/app/(dashboard)/page.tsx` l. 48, 94), qui regroupe les lignes du
  journal par code `ctx` (`server/journal-read.ts` l. 194-220) et **ne lit que les lignes à `ctx`** (l. 83 :
  `j.ctx is not null`) : ce qui est fait à l'écran (lignes `method = 'api'`, sans `ctx`) n'y paraît jamais.
  L'écran (`ui/accueil/fil-activite.tsx`) montre les 10 plus récentes (l. 26), par journée (« Aujourd'hui »,
  « Hier », date, l. 58-75), une ligne sur deux rangées : avatar et nom (« Vous »), puis « Procédure servie :
  <chemin> » ou la demande entre guillemets, puis « <n> appels · <n> erreurs », l'heure ; la ligne ouvre la
  conversation au journal ; « Tout le journal » en tête. Portée H74 : toute l'organisation pour qui administre,
  sinon ses conversations et celles des équipes qu'on mène (`journalScope`, l. 33-37).
- **oto-frontend** : l'îlot principal a deux onglets, « Procédures » (ouvert par défaut : les 10 dernières
  exécutions ou créées, tri en menu, « tout voir » vers `/procedures`, `agents-et-activites.tsx` l. 72-75, 117-153,
  294-297) et « Activités » (`fil-activite.tsx`) : un fil par journée (l. 65-80), un repère « vous en étiez ici »
  (l. 73-75), chaque ligne sur **deux rangées** (auteur et heure, puis l'action en prose écrite par le serveur,
  « a corrigé FAQ produit · §Retours », l. 104-133 ; `home.css` l. 300-344). **Aucune taxonomie CRUD** : l'action est
  un texte libre, les cibles sont `page | table | agent | execution | context` (`api/generated/schema.d.ts`
  l. 1269-1277), et le fil **n'est pas servi** (`api/home.ts` l. 68-76 : `activity: []`, état « Le fil de ce qui a
  bougé arrive. »). « Contenus récents » (pages et tableaux, non servi non plus) est à droite, sous « Brancher votre
  IA », la recherche en haut à gauche.
- **Ce que le journal a déjà** (`platform.journal` : `ts`, `user_id`, `team_id`, `ctx`, `method`, `tool`, `target`,
  `args` masqués ≤ 2 ko, `is_error` ; ligne de base l. 2248-2267) :

  | Geste | Écran (`method = 'api'`) | Assistant (`tools/call`) |
  |-------|--------------------------|--------------------------|
  | Création (page, tableau, procédure) | `POST nodes` sans `base_revision` (rail) | `<p>_write` sans `base_revision`, `kind` dans les arguments |
  | Modification (brouillon) | `POST nodes` avec `base_revision` — **une ligne par enregistrement de l'éditeur** (`file-d-operations.tsx` l. 195) | `<p>_write` avec `base_revision` |
  | Publication | même ligne, `publish: true` | même ligne, `publish: true` ; renommage par titre : cible = nouveau chemin (`write.ts` l. 234) |
  | Déplacement | `POST nodes/move` (cible = nouveau chemin) | — (aucun outil ne déplace) |
  | Duplication | `POST nodes/duplicate` (cible = la copie, `duplicate.ts` l. 91) | — |
  | Corbeille, restauration | `POST trash`, `POST trash/restore` (cible = le chemin) | — |
  | Lignes d'un tableau | `POST tables/review` (décision de revue) | `<p>_call`, cible `table.write`, le tableau dans les arguments |
  | Procédure lancée | — | ligne `<p>_context` dont la cible est la procédure servie (même règle que `summaryOf`, `journal-read.ts` l. 104-111) ; `prompts/get` (menu « + ») |
  | Contexte | comme une page (`POST nodes` sur `contexte`, `<équipe>/contexte`, `private/<handle>/contexte`) | `<p>_write` |

  **Manquent** : la nature du contenu (à relire dans `nodes` par le chemin, ou `node_aliases` pour un ancien
  chemin) ; le détail d'une ligne dont les arguments dépassent 2 ko (`{ _truncated, head }`, `journal.ts`
  l. 112-116) ; l'exécution d'une procédure jusqu'au bout (seul le routage est su, aucun identifiant d'exécution,
  architecture § 10) ; l'auteur d'une purge. Sources exactes à côté : `node_versions` (publications : auteur,
  date, nature) et `nodes` (`created_by`, `created_at`, `deleted_at` sans auteur).

### Périmètre

Les sept retours (§ Critères), en quatre lots (§ Plan). Le texte servi change (retours 1, 2, 4) : contenu vivant,
aucun outil ni description touché (ADR-002 § 1).

### Hors périmètre

- Élargir « Contenus récents » aux procédures et Contextes (HN-E05S12-9) : une ligne de constante, si JB le veut →
  tâche de suite.
- Autres activités possibles, données déjà au journal : arrivée d'un membre (invitation acceptée), partage public
  créé ou retiré, connecteur activé, retour envoyé (`feedback`), appel d'une fonction de connecteur → V1.1 (un verbe
  chacun, même service).
- Repère « vous en étiez ici » d'oto-frontend : aucun service ne sait quand la personne est passée (déjà écarté par
  E05-S09 b) → V2.
- `prompts/get` comme lancement de procédure (le nom du prompt n'est pas un chemin) → V1.1.
- Description de l'outil `context` (« useful procedures and documents ») : figée (ADR-002 § 1), inchangée.

## Critères d'acceptation

### Retour 1 — une partie par Contexte, ses faits en première ligne (lots A et C ; fiche D109)

Décision de JB (D109, 2026-09-28) : les faits des blocs « You work for » (`person.ts` : nom, handle, rôle, équipes,
langue de réponse), « Organisation » (`org.ts` : nom, domaines) et « Team » (`team.ts` : équipe, responsable,
connecteurs) deviennent la **première ligne de la partie du Contexte correspondant** ; les parties séparées
disparaissent, à l'écran comme dans le texte servi ; une seule partie par Contexte.

Texte servi (lot A). Lignes exactes (`<…>` : valeur de l'identité ; `[…]` : présent seulement si la valeur existe) :

```text
## Context: everyone (contexte)
Organisation: <org name>.[ Domains: <domains>.]
<corps du Contexte de Tout le monde, inchangé>

## Context: you only (private/<handle>/contexte)
You: <name>[ (<handle>)], <member|administrator> of <org name>. Teams: <team>[ (default[, lead])], … | none. Reply in <French|English> unless the user writes in another language.
<corps du Contexte Privé, inchangé>

## Context: team <team name> (<slug>/contexte)
Team <team name>[, your default team].[ Lead: <lead name>.]
[Connectors (the team that runs each call unless the procedure's place says otherwise):
- <ligne d'un connecteur, inchangée>]
<corps du Contexte de l'équipe, inchangé>
```

- [ ] **AC-1** Given une personne d'une organisation, When `context` (ou l'aperçu) est rendu, Then après le code et
  la procédure servie viennent, dans cet ordre, la partie **Tout le monde**, la partie **Privé**, puis une partie
  **par équipe** de l'identité, celle par défaut d'abord (ordre de `identity.teams`), puis nouveautés, procédures
  utiles, contenus récents ; chaque partie commence par son en-tête `## Context: …` (inchangé) suivi de **sa ligne de
  faits**, au texte exact ci-dessus (HN-E05S12-2, -5). Les lignes de faits reprennent chaque fait des anciens blocs, sans perte : nom de l'organisation et
  domaines (`workDomains`) ; nom, handle, rôle, équipes marquées `default` et `lead`, langue de réponse
  (`preferredLanguage`, AC-37 d'E05-S11) ; nom de l'équipe, équipe par défaut, nom du responsable (lu comme
  aujourd'hui, `leadNames`) ; un fait absent retire sa phrase (pas de domaine : « `Organisation: <nom>.` » seul ;
  responsable sans nom de profil : pas de « Lead: »).
- [ ] **AC-2** Les lignes des connecteurs (`teamConnectorLines`, texte inchangé) suivent la ligne de faits de la
  partie de l'**équipe par défaut** (la première) ; une personne sans équipe les reçoit dans la partie Tout le monde,
  après sa ligne de faits (HN-E05S12-3).
- [ ] **AC-3** **Le Contexte absent, jamais publié, illisible ou vide** : sa partie est servie quand même, réduite à
  son en-tête, sa ligne de faits (et les connecteurs, AC-2). En-tête d'un Privé sans `handle` : « `## Context: you
  only` », sans chemin. Lecture des Contextes en échec (`notLoadedBlocks`) : en-tête, ligne de faits, connecteurs,
  puis « `Not loaded: read it with <p>_read {"path": "<chemin>"}.` » (inchangé). Plus aucun bloc `person`, `organisation` ni `team` : `rg -n '"## You work for|## Organisation:|## Team
  |Also in team|No team\.' packages/plateforme/server` ne trouve rien ; une personne sans équipe n'a aucune partie
  d'équipe (« Teams: none. » le dit).
- [ ] **AC-4** Chaque partie est **un** bloc du moteur : `name` = le chemin du Contexte (`contexte`,
  `private/<handle>/contexte`, `<slug>/contexte` ; `private` sans `handle`), même non servi ; `path` = ce chemin
  seulement quand le corps du Contexte est servi ; `head` = le nombre de caractères de l'en-tête, de la ligne de
  faits et des connecteurs, rapporté (`BlockReport.head`, 0 pour les autres blocs) (HN-E05S12-4, -12).
- [ ] **AC-5** Le corps du Contexte garde sa taille nominale (H30 : 2 400, 1 200, 1 200), appliquée à lui seul ;
  l'en-tête, la ligne de faits et les connecteurs ne sont jamais coupés par elle. Test : un Contexte de Tout le monde
  trop long est coupé comme hier, sa ligne « Organisation: » et le pointeur « Rest of this context… » restent.

Écran (lot C).

- [ ] **AC-6** La vue « Contexte » de l'accueil et l'encart d'un Contexte montrent une ligne par partie : « Règles
  Oto », « Contexte : Tout le monde », « Contexte : Privé », « Contexte : équipe <nom> », « Nouveautés »,
  « Procédures utiles », « Contenus récents » ; « Vous », « Organisation », « Vos équipes » et « Connecteurs »
  n'existent plus ; le nom se lit par `name` quand `path` est nul.
- [ ] **AC-7** Dans une partie, la tête (`head` premiers caractères : en-tête, faits, connecteurs) se lit toujours
  (texte servi) ; dessous, l'éditeur du Contexte quand il est servi et que la personne peut l'écrire (niveau 2 ou 3,
  AC-14 d'E05-S11), sinon le reste du texte servi ; un Contexte non servi mais écrivable (brouillon, vide) montre
  aussi son éditeur, pour qu'on l'écrive depuis là. La partie Privé porte « Modifier dans Profil » sous sa tête.
- [ ] **AC-8** Ancres : `contexte-tout-le-monde`, `contexte-prive`, `contexte-<slug>`, `regles`, `nouveautes`,
  `procedures`, `contenus` ; chaque ligne de l'encart mène à la sienne (AC-11 d'E05-S11) ; « (ce contexte) » marque
  la ligne dont le `name` est le chemin ouvert, même quand ce Contexte n'est pas publié (HN-E05S12-10, -13).

### Retour 2 — « Règles Oto » (lots A et C)

- [ ] **AC-9** Le bloc `code` porte, dans cet ordre : la ligne `ctx:`, la ligne « Pass this ctx… » (inchangées),
  la section « `## How this workspace works` » (texte ci-dessous, préfixe de l'organisation substitué), puis
  « `## This request` » et la ligne du routage (inchangée) : « its steps follow » reste juste avant les étapes de
  la procédure servie (HN-E05S12-6).
- [ ] **AC-10** La section fait au plus 14 lignes et 1 900 caractères avec un préfixe de 10 caractères ; elle est
  la même pour toute personne (aucune donnée de l'identité) ; aucun nom de client, de personne ni de produit
  (HN-E05S12-7, -8).
- [ ] **AC-11** À l'écran, la partie `code` s'appelle « Règles Oto », est **repliée** à chaque affichage (`<details>`
  natif fermé, son résumé = son nom, sa taille et son état), n'est jamais écrivable, et s'ouvre au clavier (Entrée,
  Espace) ; l'encart d'un Contexte la nomme « Règles Oto » (HN-E05S12-11).

Texte servi (anglais, comme tout le texte de `context` ; `<p>` = préfixe de l'organisation) :

```text
## How this workspace works
- Six tools: <p>_context (first, once per conversation), <p>_find, <p>_read, <p>_call, <p>_write, <p>_feedback. Every tool but <p>_context needs the ctx above.
- Usual order: context, then find to locate, read to learn (a content, or the contract of a function), call or write to act, feedback when a tool, a procedure or an instruction was unclear, missing or wrong.
- Every content has a path (e.g. <team>/<page>) and a kind: page (text in blocks), table (rows, through <p>_call table.rows, table.aggregate and table.write), procedure (steps to follow, each call in a call block) or context (the sections below: already served, read one only when it says it was cut).
- Spaces: the organisation's contents sit at the root, a team's under its folder (<team>/...), yours under private/<handle>/, served to you only.
- Access is set per content, for the organisation, a team or a person: read, write or manage. A refusal says who to ask: never work around it.
- <p>_write saves a draft; publish: true makes it live. To edit, pass base_revision = the revision you read.
- A renamed or moved content keeps its old path: it still leads there.
- In a text, [[path]] or [[path|title]] links to another content.
- A function that sends, deletes or pays first returns a summary and does nothing: show it, get the user's explicit yes, then call again with confirm: true.
- When a request matches a procedure, its steps come right after this part: follow them in order. Otherwise search, and ask the user rather than guess.
- <p>_read with path journal shows what was done, call by call: trust it over memory.
- Never invent a path, a figure or a result: read it, or say you could not.
## This request
```

Mesuré avec `acme` : 1 737 caractères, 14 lignes. Sources de chaque phrase : descriptions des outils
(`packages/plateforme/mcp/tools.ts` l. 49, 63-77), `writeNodeSchema` (`schemas/nodes.ts` l. 122-152 : brouillon,
`base_revision`, `publish`, ancien chemin), `calls.ts` l. 64 (confirmation en deux temps), architecture § 4
(`access_rules.level`, espaces), § 5 (refus « à qui demander », l. 328), § 3 (liens `[[…]]`), `contexts.ts` l. 119
(pointeur d'un Contexte coupé), `journal-model.ts` (lecture `journal`).

### Retour 3 — l'onglet « Activités » (lot B)

- [ ] **AC-12** L'onglet « Activités » montre les **activités** de la semaine dans la portée du journal (H74,
  `journalScope`) : création, modification, publication, déplacement, duplication, mise à la corbeille,
  restauration d'une page, d'un tableau, d'une procédure ou d'un Contexte ; lignes écrites dans un tableau
  (`table.write`) et décision de revue ; procédure lancée (routage de `context`). Les deux portes comptent (écran et
  assistant). Une ligne en erreur (`is_error`) n'est pas une activité (HN-E05S12-14, -15, -18).
- [ ] **AC-13** Une activité = **une ligne** : avatar, qui (« Vous » ou le nom), ce qui est arrivé (« a publié la
  page Tarifs 2026 », « avez créé le tableau Salons », « a lancé la procédure Relancer les devis », « a mis à la
  corbeille la page … », « a écrit dans le tableau … »), un compteur « ×<n> » quand plusieurs gestes sont
  regroupés, l'heure ; texte trop long coupé par des points de suspension, le texte entier restant le nom du lien ;
  par journée (« Aujourd'hui », « Hier », la date, comme aujourd'hui) ; 20 lignes au plus, « Tout le journal » en
  tête (HN-E05S12-16, -19, -21).
- [ ] **AC-14** Regroupement : même personne, même contenu, même verbe, moins d'une heure entre deux gestes → une
  ligne, à l'heure du plus récent, avec leur nombre (l'éditeur écrit une ligne par enregistrement).
- [ ] **AC-15** Une ligne ouvre le contenu (`/n/<chemin courant>`) ; une procédure lancée ouvre sa conversation au
  journal ; un contenu illisible pour la personne, à la corbeille ou disparu garde son chemin tel que le journal le
  montre, sans titre ni lien ; l'espace personnel d'une autre personne reste coupé à `private/<handle>` (D44)
  (HN-E05S12-17).
- [ ] **AC-16** États : lecture en échec (message et « Réessayer ») ; aucune activité (« Aucune activité cette
  semaine », sans action) ; le premier jour (aucune activité, aucun assistant branché) garde `FirstDay`.
- [ ] **AC-17** Service `listActivities(db, identity, { periodDays })` : portée décidée avant la requête et posée
  dans la requête (H74, `security-patterns.md § Droits dans le service`) ; la requête ne rend jamais `args` entiers,
  seulement les champs qui classent (`publish`, présence de `base_revision`, `kind`, tableau d'un `table.write`,
  `_truncated`) ; natures et titres relus en un lot (`resolveTargets` : chemin courant ou ancien chemin) ; titre et
  lien seulement si niveau ≥ lecture (`nodeLevels`) ; 2 000 lignes au plus lues (`JOURNAL_ROWS_SCANNED`), `truncated`
  dit si la semaine en compte plus. Aucune migration.

Mise en page (lot B, → fiche, HN-E05S12-20) — **recommandée** :

```text
┌──────────────── 2fr (≈ 67 %) ────────────────┬────── 1fr (≈ 33 %) ──────┐
│ [ Activités | Contexte ]        Tout le journal → │ [ Chercher…            ⌘K ] │
│ AUJOURD'HUI                                        │ ┌ BRANCHER UN ASSISTANT ┐  │
│ (Vo) Vous avez publié la page Tarifs 2026   14:02 │ │ adresse · Brancher    │  │
│ (Co) Collègue a lancé la procédure Relan…   13:40 │ └───────────────────────┘  │
│ (Co) Collègue a écrit dans Salons ×3        11:15 │ ┌ PROCÉDURES UTILES ────┐  │
│ HIER                                               │ │ ▶ Relancer les devis  │  │
│ …                                                  │ │ ▶ …    (6 au plus)    │  │
└────────────────────────────────────────────────────┴──────────────────────────┘
```

- [ ] **AC-18** Colonnes 2fr / 1fr à partir de 1 024 px (`.oto-home`), une colonne en dessous, dans l'ordre du DOM ;
  à droite : la recherche (déplacée du créneau `find` au créneau `aside`, au-dessus de « Brancher un assistant »),
  « Brancher un assistant », puis l'îlot « Procédures utiles » : les 6 premières procédures dans l'ordre même du
  bloc servi (usage 90 jours, puis chemin, Q1), glyphe `Play`, titre, lien vers la procédure ; vide : « Aucune
  procédure publiée » ; en échec : message et « Réessayer ». « Contenus récents » quitte l'accueil (composant,
  libellés et champ `contenus` retirés). Le premier jour retire l'îlot des procédures comme il retirait les cartes.
- [ ] **AC-19** Contrôle visuel à 375, 1 024 et 1 280 px, deux thèmes : une activité tient sur une ligne à 1 024 et
  1 280 px ; aucun défilement horizontal à 375 px.

**Alternative** (écartée, à trancher par JB) : colonnes 3fr / 2fr ; à droite la recherche, « Brancher un assistant »
et « Contenus récents » **enfin servis** (les pages et tableaux lus ou écrits par la personne, `recentDocuments` du
bloc servi, 6 lignes) au lieu des procédures. Coût égal (une lecture du serveur exportée) ; moins de nouveau pour
qui connaît oto-frontend (même carte à droite), mais la liste recoupe en partie le fil (ses propres écritures).

### Retour 4 — « Contenus récents » (lots A et C)

- [ ] **AC-20** Le bloc servi s'intitule « `## Recent content` » et s'appelle `recent content` au rapport et dans
  l'avis de budget (« Omitted: … recent content ») ; le reste du bloc est inchangé (pages et tableaux,
  HN-E05S12-9). À l'écran : « Contenus récents » (vue « Contexte », encart). `rg -n "Documents récents|Recent
  documents|recent documents" packages src` ne trouve que des commentaires d'historique.

### Retour 5 — l'encart d'un Contexte descend au haut de la carte (lot C)

- [ ] **AC-21** À partir de 1 024 px, sur la page d'un Contexte, le haut de la colonne d'annexes (« À quoi sert
  cette page ») est au niveau du haut de la carte des blocs (l'îlot du document), à 1 px près (Playwright,
  `boundingBox`) ; le chapô, les lectures en échec et « Contenus liés » restent au-dessus de la carte, dans la
  colonne du document ; sous 1 024 px, l'ordre est inchangé (chapô, Contenus liés, carte, annexes)
  (HN-E05S12-22).

### Retour 6 — la marge sous « Contenus liés » (lot C)

- [ ] **AC-22** `.oto-linked` n'a plus de marge basse (`content.css` l. 217 : `margin: 0 0 var(--space-5)` →
  `margin: 0`) : entre le repliable « Contenus liés » et la carte, seul l'écart de la colonne (`--gap`), sur une
  page, une procédure, un tableau, un Contexte et la page publique (HN-E05S12-23).

### Retour 7 — des contenus sous un Contexte (lots A et D ; fiche D110)

Décision de JB (D110, 2026-09-28) : on range sous un nœud Contexte des pages, des tableaux et des procédures ;
(a) dans le rail, le « + » d'un Contexte et le glisser-déposer sur sa ligne créent ou rangent **sous** le Contexte,
et ses enfants s'affichent sous sa ligne comme ceux d'une page ; (b) `context` liste les procédures sous un Contexte
avec ses pages et ses tableaux (lignes d'index, jamais leur corps).

Constats sur la base (`cf61002`), ce qui marche déjà sans changement :
- **Base** : `nodes_guard` ne refuse rien sous un Contexte ; il empêche seulement le Contexte lui-même de bouger
  (`20260928120000_platform_private.sql` l. 230-231) et réserve le genre `context` aux chemins
  exacts de `is_context_path` (l. 238-245 ; `contexte`, `<slug>/contexte`, `private/<h>/contexte`, l. 40-48) :
  `contexte/tarifs`, `ventes/contexte/relance` ou `private/<h>/contexte/notes` sont des nœuds ordinaires. La policy
  `nodes_delete_manager` (l. 309) ne protège que le chemin exact du Contexte.
- **Création** (`write`, `POST nodes`) : `create` (`server/nodes/write.ts` l. 249-284) exige un parent existant,
  lisible, écrivable (niveau ≥ 2), sans regarder son genre ; l'enfant prend le niveau du parent (H52, H66).
- **Déplacement** (`moveNode`) : `refuseStructure` (`server/nodes/move.ts` l. 74-82) refuse de déplacer un Contexte,
  pas d'y déposer ; `destinationParent` (l. 107-133) ne refuse que `private` comme parent. Le dialogue « Déplacer »
  propose déjà un Contexte comme destination (`destinationsDuDeplacement`, `ui/arbre/depuis-l-arbre.ts` l. 111-119 :
  seuls la racine, `private`, le parent actuel et le nœud sont exclus).
- **Droits** : les enfants héritent des règles du Contexte et de son espace (`node_level_for`, N35 pour un espace
  personnel) ; aucun calcul nouveau.
- **Arbre** : `visibleTree` (`server/nodes/tree.ts` l. 29-51) range chaque nœud sous son parent, Contexte compris ;
  `noeudsDArbreDepuis` (`depuis-l-arbre.ts` l. 41-48) et `versArbreDuRail` (`ui/coque/arbre-du-rail.tsx` l. 51-72)
  rendent les enfants de toute ligne, Contexte compris, avec son dépliage : **les enfants d'un Contexte paraissent
  déjà sous sa ligne**.
- **Texte servi** : `contextRows` (`server/context/blocks/contexts.ts` l. 163-165) ne lit que
  `kind in ('page', 'table')` : une procédure sous un Contexte n'est pas listée.

Ce qui manque, donc : le « + » de la ligne d'un Contexte (`ui/coque/sections-du-rail.tsx` l. 56-58 : « La ligne de
Contexte crée à la racine de sa section ») et le dépôt sur sa ligne (`ui/coque/deplacement-dans-le-rail.tsx`
l. 212-218, `parentDuDepot` : « la racine de son espace pour un Contexte »), et la procédure dans le texte servi.

- [ ] **AC-23** (lot A) Given un Contexte servi avec, dessous, une page, un tableau et une procédure publiés que la
  personne lit, When `context` est rendu, Then sa partie les liste sous « `Pages, tables and procedures here:` »
  (qui remplace « `Pages and tables here:` »), une ligne chacun « `- <chemin> — <titre> — <résumé>` » (inchangée),
  par chemin, 20 lignes au plus avec « `Linked pages:` » (inchangé) ; jamais leur corps ; une procédure illisible,
  en brouillon ou à la corbeille n'y est pas (HN-E05S12-25).
- [ ] **AC-24** (lot A, base réelle) Sous `contexte`, `<slug>/contexte` et `private/<h>/contexte` : `write` crée une
  page, un tableau et une procédure ; `moveNode` y range un nœud ; le Contexte ne bouge toujours pas ; l'enfant d'un
  Contexte privé n'est lu que de sa personne ; un membre sans écriture sur le Contexte est refusé avec « à qui
  demander » (`forbidden`, inchangé). Test de non-régression : aucun code serveur ne change pour ce point.
- [ ] **AC-25** (lot D) Le « + » de la ligne d'un Contexte propose page, tableau, procédure (comme une page,
  `creation.itemsPour`) et crée **sous** le Contexte (`contexte/<segment>`, `<slug>/contexte/<segment>`,
  `private/<h>/contexte/<segment>`), puis ouvre le contenu créé ; le « + » du titre de section crée toujours à la
  racine de l'espace ; son nom accessible : « Ajouter dans Contexte · <section> ».
- [ ] **AC-26** (lot D) Un dépôt **sur** la ligne d'un Contexte range le nœud glissé sous le Contexte
  (`new_path` = `<chemin du Contexte>/<segment>`), avec l'aperçu et la confirmation d'un déplacement (inchangés) ;
  un dépôt avant ou après la ligne d'un Contexte reste refusé (`placeEntre`, le Contexte reste en tête) ; le Contexte
  ne se glisse toujours pas.
- [ ] **AC-27** (lot D) Les enfants d'un Contexte s'affichent sous sa ligne, repliables comme ceux d'une page (le pli
  retenu par le rail) ; la ligne du Contexte ouverte quand l'écran courant est sous elle ; « Monter » du premier
  enfant d'un Contexte est inactif, et après la suppression de cet enfant le focus revient à la ligne du Contexte
  (`precedente`, l. 81-88) (HN-E05S12-26) ; après son déplacement, le rail se comporte comme pour l'enfant d'une
  page, sans règle de focus propre (amendé par le pilote à la revue du lot D, HN-E05S12-D6).

## Plan en lots

Parallélisme (`.method/sprint/vagues.md`) : aucun fichier commun entre A, B, C et D hors fichiers d'ajout
(`server/index.ts`, `schemas/index.ts`, `ui/index.ts`). Vérifiable avant fusion : les `git diff --name-only` des
quatre lots, hors story et fichiers d'ajout, n'ont aucune ligne commune.

| Ordre | Lot | Retours | Ⓜ | Dépend de |
|-------|-----|---------|----|-----------|
| Vague 1 | **A** Texte servi | 1, 2, 4 (texte), 7 (b) | — | — |
| Vague 1 | **B** Accueil : activités et procédures utiles | 3 | — | — |
| Vague 2 | **C** Écrans du Contexte | 1, 2, 4 (écran), 5, 6 | — | A approuvé ; E05-S11 e et f fusionnés |
| Vague 2 | **D** Rail : ranger sous un Contexte | 7 (a) | — | E05-S11 e fusionné |

**Fichiers communs avec E05-S11 lot e** (coque, en cours, worktree `agent-a252cc44576149475`, `git status` du
2026-09-28) : `packages/plateforme/ui/noeud/ecran-de-noeud.tsx` (e : imports et titre, l. 21-38, 131 ; C :
l. 158-176) → C part après la fusion de e ; `packages/plateforme/ui/index.ts` (fichier d'ajout). Le paragraphe
« bascule sur `private` » d'E05-S11 cite aussi `ui/contexte/libelles.ts` et `ui/contexte/annexes-du-contexte.tsx` :
non modifiés par e à ce jour ; le pilote le vérifie (`git -C .claude/worktrees/agent-a252cc44576149475 diff
--name-only`) avant de lancer C. **Avec E05-S11 lot f** : `tests/e2e/procedure-et-contexte.spec.ts` (f : listes ;
C : l. 205) → C part après f ; si f traîne, C laisse cette ligne au pilote, qui l'adapte à la fusion de C (une
ligne, nommée dans le rapport). **Lot D** : `ui/coque/sections-du-rail.tsx` est dans le diff de e ;
`ui/coque/deplacement-dans-le-rail.tsx` est cité par la « bascule sur `private` » de e (clé `all`) → D part après la
fusion de e, depuis `main`. Aucun fichier de A ni de B n'est touché par e ou f ; C et D n'ont aucun fichier commun.

### Lot A — Texte servi (serveur)

Fichiers :
- `packages/plateforme/server/context/index.ts` (assemblage : une partie par Contexte, ordre, plus de
  `personBlock`, `orgBlock`, `teamBlock` dans la liste ; nom `recent content`)
- `packages/plateforme/server/context/blocks/person.ts` (`personFacts(identity)` : la ligne « `You: …` » ; `ROLES`,
  `teamsLine`, `LANGUAGES` gardés ; `personBlock` retiré)
- `packages/plateforme/server/context/blocks/org.ts` (`orgFacts(org)` : « `Organisation: <nom>.[ Domains: …]` » ;
  `workDomains` inchangé, lu aussi par `mcp/tools.ts` ; `orgBlock` retiré)
- `packages/plateforme/server/context/blocks/team.ts` (`teamFacts(db, identity)` : une ligne par équipe et les lignes
  des connecteurs, `leadNames` et `teamConnectorLines` lus en parallèle comme aujourd'hui ; `teamBlock` retiré, plus
  de « No team. »)
- `packages/plateforme/server/context/blocks/contexts.ts` (chaque chemin attendu de `contextPaths` rend sa partie :
  en-tête, faits, corps borné ; aussi quand le Contexte manque ; `notLoadedBlocks` reçoit les faits ; retour 7 :
  `kind in ('page', 'table', 'procedure')` l. 165, « `Pages, tables and procedures here:` » l. 111)
- `packages/plateforme/server/context/engine.ts` (`ContextBlock.head`, `BlockReport.head` : champ ajouté,
  rapporté tel quel, ramené à la part incluse par `recededReport`)
- `packages/plateforme/server/context/blocks/code.ts` (section des règles, « `## This request` »)
- `packages/plateforme/server/context/blocks/recent.ts` (en-tête, nom)
- Tests : `tests/unit/context-blocks.test.ts`, `tests/unit/context-engine.test.ts` (ordre du rapport l. 195 ;
  budget de la coupe l. 197, à relever : le code grandit de ~1 750 caractères ; `head`), `tests/unit/routing.test.ts`
  (l. 278-281 : la procédure est suivie de « `## Context: everyone` »), `tests/unit/connectors-context.test.ts`,
  `tests/integration/context-blocks-sql.test.ts`, `tests/integration/context-full.test.ts` (l. 105),
  `tests/integration/mcp-core.test.ts`, `tests/integration/mcp-connectors.test.ts`,
  `tests/unit/e05s12-texte-servi.test.ts` (créé : AC-1 à AC-5, AC-9, AC-10, AC-20, AC-23 ; `context-blocks.test.ts`
  l. 819-846 lit « Pages and tables here: »), `tests/integration/e05s12-sous-contexte-sql.test.ts` (créé : AC-23 et
  AC-24 sur base réelle portable)

`server/language.ts` ne change pas. `BlockReport` gagne un champ : la page de l'hôte le passe tel quel à l'écran, dont
le type (`DonneesDeLApercu`) le lit au lot C ; entre A et C, l'écran l'ignore (champ en trop, `tsc` l'accepte).

### Lot B — Accueil : activités et procédures utiles (serveur et écran)

Fichiers :
- créés : `packages/plateforme/server/activities.ts` (`listActivities`), `packages/plateforme/schemas/activity.ts`
  (`Activity`, `ActivityPage`, `UsefulProcedure`), `packages/plateforme/ui/accueil/procedures-utiles.tsx`
- `packages/plateforme/server/journal-read.ts` (ajout seul : exporter `inScope`, `readableProcedures`)
- `packages/plateforme/server/context/blocks/procedures.ts` (ajout : `usefulProcedures(db, identity, limit)` avec sa
  propre lecture `id, path, title, summary` et le même tri, comparateur partagé ; **texte et requête de
  `proceduresBlock` inchangés**)
- `packages/plateforme/server/index.ts`, `packages/plateforme/schemas/index.ts`, `packages/plateforme/ui/index.ts`
  (ajouts)
- `packages/plateforme/ui/accueil/ecran-accueil.tsx`, `packages/plateforme/ui/accueil/fil-activite.tsx`,
  `packages/plateforme/ui/accueil/libelles.ts`, `packages/plateforme/ui/accueil/types.ts`,
  `packages/plateforme/ui/accueil/contenus-recents.tsx` (supprimé), `packages/plateforme/ui/ds/components/css/home.css`
  (2fr / 1fr ; une ligne par activité dans `.oto-home-main`)
- `src/app/(dashboard)/page.tsx` (`listActivities`, `usefulProcedures` au lieu de `listConversations`)
- Tests : `tests/integration/components/ecran-accueil.test.tsx` (dont l. 233 : la région « Vous » devient une
  assertion stable sur `contexte-tout-le-monde`, vraie avant et après C), `tests/integration/pages/accueil-page.test.tsx`,
  `tests/e2e/accueil.spec.ts` (l. 83 : même remplacement), `tests/unit/e05s12-activites.test.ts` (créé :
  classement, regroupement), `tests/integration/e05s12-activites-sql.test.ts` (créé : portée H74, niveaux, D44,
  `args` jamais rendus, base réelle portable), `tests/integration/components/e05s12-accueil.test.tsx` (créé :
  AC-13, AC-16, AC-18)

### Lot C — Écrans du Contexte (après A approuvé, E05-S11 e et f fusionnés)

Fichiers :
- `packages/plateforme/ui/contexte/libelles.ts` (`NOMS_DES_BLOCS`, `nomDuBloc` par `name`, résumé « Règles Oto »)
- `packages/plateforme/ui/contexte/parties-du-contexte.ts` (ancres par `name`, tête d'une partie par `head`)
- `packages/plateforme/ui/contexte/contexte-servi.tsx` (`<details>` des règles, tête + éditeur, lien Profil)
- `packages/plateforme/ui/contexte/apercu-du-contexte.tsx` (`DonneesDeLApercu` : `head` ; « (ce contexte) » par `name`)
- `packages/plateforme/ui/noeud/ecran-de-noeud.tsx` (retour 5)
- `packages/plateforme/ui/ds/components/css/content.css` (retour 6)
- Tests : `tests/unit/e05s11-parties-du-contexte.test.ts`, `tests/integration/components/e05s11-contexte-servi.test.tsx`
  (l. 24, 104 : fixture au nouveau format), `tests/integration/components/contexte.test.tsx` (l. 39),
  `tests/e2e/procedure-et-contexte.spec.ts` (l. 205), `tests/integration/components/e05s12-contexte.test.tsx`
  (créé : AC-6 à AC-8, AC-11), `tests/e2e/e05s12-contexte.spec.ts` (créé : AC-21, AC-22, deux thèmes)

### Lot D — Rail : ranger sous un Contexte (après la fusion d'E05-S11 e)

Fichiers :
- `packages/plateforme/ui/coque/sections-du-rail.tsx` (l. 56-58 : le « + » de la ligne d'un Contexte vise la ligne,
  comme celui d'une page)
- `packages/plateforme/ui/coque/deplacement-dans-le-rail.tsx` (l. 211-218 : `parentDuDepot` rend la ligne pour un
  Contexte ; l. 81-88 : `precedente` rend le Contexte parent ; commentaires l. 67-68 et 212)
- Tests : `tests/integration/components/rail-application.test.tsx` (l. 465-470 : « the Contexte line taking it to the
  root of its space » → sous le Contexte, `new_path` `contexte/grille` ; l. 504 : même dépôt, attendu refusé par
  l'API simulée, inchangé), `tests/integration/components/e05s12-rail-contexte.test.tsx` (créé : AC-25 à AC-27),
  `tests/e2e/e05s12-rail-contexte.spec.ts` (créé : créer une procédure sous « Contexte · Tout le monde » depuis son
  « + », la voir sous la ligne, la relire dans l'aperçu servi ; deux thèmes)

`ui/coque/arbre-du-rail.tsx` et `ui/arbre/depuis-l-arbre.ts` ne changent pas (enfants déjà rendus, § Retour 7).

## Implémentation — migrations et schémas

- **Migration** : aucune. Le service des activités lit `journal` (index `idx_journal_org_id_id`, `(org_id, id desc)`),
  `nodes` et `node_aliases` par `resolveTargets` ; le texte servi ne lit rien de nouveau. Carte `TABLES` de
  l'export inchangée.
- **Schémas** : aucun schéma d'entrée nouveau (la période vient de la page, `journalFiltersSchema.parse({}).periode`,
  constante) ; `schemas/activity.ts` porte les **types de sortie** partagés par le service et l'écran (`ui/` ne lit
  pas `server/`), comme `JournalPage` (`schemas/journal.ts`).
- **MCP** : aucun outil, champ ni description changé (ADR-002 § 1) ; le texte de `context` change (contenu, § 7 :
  budget inchangé).

### Points de départ

- Maquette (`C:\apps\mcp-test\src\proto\services\context.ts` l. 108-135) : les faits des blocs « You work for »,
  « Organisation », « Team » (nom, rôle, équipes, responsable) — repris en lignes de faits ; retirés : leurs
  en-têtes `##` et « `## Team\nNo team.` » (l. 135), remplacés par la partie de chaque Contexte (D109).
- Oto (`oto_mcp/capabilities/orgs/instructions.py`) : l'idée d'un texte de règles servi à l'agent (le guide de base
  `claude_md`) ; retiré : un guide à lire d'abord, modifiable par organisation (architecture § 10, « Règles ») — ici
  une section fixe du bloc `code`, servie par `context`, jamais une notice.
- oto-frontend : `HomeLayout` (deux piles, `home.css` l. 42-47) repris, rapport 55/45 → 2fr/1fr (écart écrit) ;
  l'onglet « Procédures » d'`agents-et-activites.tsx` repris en îlot de droite (liste courte, « tout voir » retiré :
  aucune page Procédures, mémoire JB) ; le fil d'`fil-activite.tsx` repris par journée ; retiré : la prose d'action
  écrite par le serveur (→ verbes classés ici), les deux rangées (→ une ligne, retour 3).

## Rayon d'impact

### Appelants

- Blocs de `context` (`personBlock`, `orgBlock`, `teamBlock`, `contextBlocks`, `notLoadedBlocks`, `codeBlock`,
  `recentBlock`) : `rg -ln "personBlock|orgBlock|teamBlock|contextBlocks|notLoadedBlocks|codeBlock|recentBlock"
  c:/apps/oto-platform/packages c:/apps/oto-platform/src c:/apps/oto-platform/scripts c:/apps/oto-platform/tests`
  → `server/context/index.ts` et ses blocs (lot A), tests `context-blocks`, `context-blocks-sql`,
  `connectors-context`, `mcp-connectors` (lot A). Aucun appelant hors du paquet. `personBlock`, `orgBlock` et
  `teamBlock` sont retirés (remplacés par `personFacts`, `orgFacts`, `teamFacts`) ; `workDomains` reste
  (`rg -n "workDomains" c:/apps/oto-platform/packages` → `blocks/org.ts`, `mcp/tools.ts` : inchangé).
- Assemblage (`assembleContext`, `previewContext`, `buildContext`) : `rg -ln "assembleContext|previewContext|buildContext"
  c:/apps/oto-platform/packages c:/apps/oto-platform/src c:/apps/oto-platform/tests c:/apps/oto-platform/scripts`
  → `mcp/server.ts` (texte servi : change, contrat inchangé), `src/app/(dashboard)/page.tsx` et
  `src/app/(dashboard)/n/[...chemin]/page.tsx` (lisent le rapport ; `path` garde son sens : chemin d'un Contexte
  servi, lu par `loadNode` — inchangés), `ui/procedure/procedure-du-noeud.tsx` (aperçu d'une phrase : ne lit que
  `served` et `candidates`, inchangé), `ui/contexte/*` (lot C), tests `context-engine`, `context-blocks`, `routing`,
  `noeud-page`, `accueil-page`, `m55-procedures-privees` (ce dernier ne lit aucun en-tête : `rg -n "## |name ==="
  tests/integration/m55-procedures-privees.test.ts` ne trouve rien).
- Chaînes servies relues par des tests : `rg -c "You work for|## Organisation|## Team|No team\.|Also in team|Recent
  documents|recent documents|Connectors \(the team" c:/apps/oto-platform/tests` → douze fichiers ; ceux du serveur au
  lot A, ceux de l'écran au lot C (`e05s11-contexte-servi`, `contexte`, `e05s11-parties-du-contexte`) ;
  `action-plateforme.test.tsx` l. 223 (« No team. » : message d'une réponse simulée de l'API, sans rapport).
- Libellés et ancres (`NOMS_DES_BLOCS`, `nomDuBloc`, `ancreDeLaPartie`, `partiesDuContexte`) : `rg -ln
  "NOMS_DES_BLOCS|nomDuBloc|ancreDeLaPartie|partiesDuContexte" c:/apps/oto-platform/packages c:/apps/oto-platform/src
  c:/apps/oto-platform/tests` → `ui/contexte/{libelles,parties-du-contexte,contexte-servi,apercu-du-contexte}` et
  `e05s11-parties-du-contexte.test.ts` : tous au lot C.
- Régions « Vous » des tests d'écran : `rg -n "name: \"Vous\"" c:/apps/oto-platform/tests` → `ecran-accueil.test.tsx`
  l. 233 et `accueil.spec.ts` l. 83 (lot B, assertion rendue stable), `procedure-et-contexte.spec.ts` l. 205 (lot C).
- `listConversations` : `rg -ln "listConversations" c:/apps/oto-platform/packages c:/apps/oto-platform/src
  c:/apps/oto-platform/tests` → l'accueil cesse de l'appeler (lot B) ; `/journal` (`src/app/(dashboard)/journal/page.tsx`),
  `read journal` et leurs tests le gardent, inchangé.
- `DonneesDeLAccueil`, `ContenusRecents`, `CONTENUS` : `rg -ln "DonneesDeLAccueil|ContenusRecents|CONTENUS\b|contenus:"
  c:/apps/oto-platform/packages/plateforme/ui c:/apps/oto-platform/src c:/apps/oto-platform/tests` → `ui/accueil/*`,
  `ui/index.ts` (type exporté : `activite` devient `activites`, `contenus` devient `procedures` — changement visible
  d'un hôte, CHANGELOG), `src/app/(dashboard)/page.tsx`, `ecran-accueil.test.tsx` : tous au lot B.
- `FeedItem`, `HomeLayout` : `rg -ln "FeedItem|HomeLayout" c:/apps/oto-platform/packages c:/apps/oto-platform/src
  c:/apps/oto-platform/tests` → `ui/accueil/*` et `ds/react/home.tsx`, `home.css` : la règle d'une ligne est bornée à
  `.oto-home-main`, le composant ne change pas.
- `TwoColumns` : `rg -ln "TwoColumns" c:/apps/oto-platform/packages c:/apps/oto-platform/tests` → aussi
  `admin/organisation/ecran-organisation.tsx`, `admin/connecteurs/ecran-connecteurs.tsx` : le composant ne change
  pas (lot C le monte deux fois dans `ecran-de-noeud.tsx`).
- `.oto-linked` : `rg -ln "oto-linked\b|LinkedContent" c:/apps/oto-platform/packages c:/apps/oto-platform/tests` →
  `ds/react/linked-content.tsx`, monté par `noeud/sous-pages.tsx` seul (toutes natures, page publique comprise) ;
  `e05s10b.spec.ts` l. 157 le trouve par sa classe, sans mesure : inchangé.
- `teamConnectorLines` : `rg -ln "teamConnectorLines" c:/apps/oto-platform/packages c:/apps/oto-platform/tests` →
  `blocks/team.ts`, `connectors/lines.ts`, `context-blocks-sql.test.ts` : lignes inchangées, déplacées dans la partie
  de l'équipe par défaut (AC-2).
- Retour 7 — « + » et dépôt sur un Contexte : `rg -n "itemsDeLaRacine|parentDuDepot|precedente" c:/apps/oto-platform/packages/plateforme/ui`
  → `coque/sections-du-rail.tsx` l. 52-58, `coque/deplacement-dans-le-rail.tsx` l. 81-88, 211-225 (seuls lecteurs :
  `accepteDedans`, le dépôt, « Monter ») ; `rg -n "kind in \('page', 'table'\)" c:/apps/oto-platform/packages/plateforme/server`
  → `blocks/contexts.ts` l. 165 seul ; tests qui déposent sur un Contexte : `rg -n "Contexte — " c:/apps/oto-platform/tests/integration/components/rail-application.test.tsx`
  → l. 470, 490, 504 (lot D). Service : `create` et `moveNode` ne changent pas (AC-24 le prouve).
- `BlockReport` (gagne `head`) : `rg -ln "BlockReport|DonneesDeLApercu" c:/apps/oto-platform/packages
  c:/apps/oto-platform/src c:/apps/oto-platform/tests` → `engine.ts`, `context/index.ts` (A), `ui/contexte/*` (C) ;
  les pages de l'hôte passent le rapport tel quel : champ ajouté, aucun appelant cassé.

### Doublons

- Registre (`component-registry.md` l. 90, 114, 304) et recherche `rg -n "<details" c:/apps/oto-platform/packages/plateforme/ui
  --glob "*.tsx"` → `<details>` natif déjà employé (journal, retours, cellule, `LinkedContent`) : « Règles Oto »
  reprend un `<details>` natif (réutiliser ; `LinkedContent` a le style d'une pastille de commande, écarté).
- Lecture du journal par portée : `journalScope`, `inScope`, `readableProcedures`, `journalReader` / `targetFor`
  (`journal-read.ts`, `journal-rows.ts`) → réutilisés par `listActivities` (exportés, aucune copie) ; résolution
  chemin → nœud : `resolveTargets` (`nodes/link-resolution.ts` l. 109) réutilisé ; noms : `memberDirectory`
  réutilisé. Nouveau : le classement des lignes en verbes, qu'aucun module ne fait (`rg -n "POST trash|nodes/move"
  c:/apps/oto-platform/packages/plateforme/server` ne trouve que les routes).
- Classement des procédures : `proceduresBlock` → `usefulProcedures` partage son comparateur et `usageByPath`
  (fusionner la règle, pas la requête : la requête du bloc reste celle que ses tests relisent).
- Mise en page : `HomeLayout` et ses créneaux réutilisés (la recherche passe dans `aside`) ; `TwoColumns` réutilisé
  deux fois pour le retour 5 (aucune prop nouvelle).
- Tête d'une partie (lot C) : lue par `head` du rapport, jamais recalculée à l'écran (aucun doublon de règle) ;
  `partiesDuContexte` garde sa découpe (E05-S11), test de parité étendu à `head`.

### Effet produit

- **Assistants** (`context`, toute organisation) : mêmes faits, en une ligne en tête de la partie de chaque
  Contexte ; plus d'en-têtes « You work for », « Organisation », « Team » ni de « No team. » ; section des règles
  (+~1 750 caractères, sur 20 000) ; « Recent content ». Aucun outil ni champ changé.
  Golden queries à relire par le pilote : C1, C5, C6, CN1, CN2, la ligne de langue d'E05-S11 (AC-37), et une
  ligne nouvelle (§ Pour le pilote). `rules_version` n'est pas touché (aucune publication).
- **Encart d'un Contexte** (`/n/<contexte>`) et **vue « Contexte »** de l'accueil : parties renommées (lot C) ; entre
  la fusion de A et celle de C, une partie au Contexte non servi s'y nomme par son chemin brut et sa tête n'est pas
  distinguée (transitoire, à fusionner de près).
- **Accueil** : fil d'activités au lieu des conversations ; les conversations restent au journal (`/journal`).
- **Hôtes** : `DonneesDeLAccueil` change (CHANGELOG du paquet) ; exports `listActivities`, `usefulProcedures`.
- **Rail** (lot D) : la ligne d'un Contexte gagne un vrai « + » et reçoit les dépôts ; ce qu'on y range devient une
  ligne d'index de la partie servie de ce Contexte, donc est **annoncé à tous ceux qui reçoivent le Contexte** (chemin,
  titre, résumé), filtré par leur niveau de lecture ; ranger sous le Contexte de Tout le monde met une ligne devant
  chaque assistant de l'organisation (20 au plus).
- **Arbre et adresses** : un nœud rangé sous un Contexte change de chemin (`contexte/…`), l'ancien reste un alias
  (E03-S07) ; `find`, `read`, le routage le trouvent comme avant.
- Journal, RLS, export-import, e-mails, SEO : aucun effet (lectures seules, aucune colonne).

### Refacto

- Écarté : une colonne `journal.action` écrite par les services (classement exact, mais migration Ⓜ et lignes
  passées non classées) ; recalculer la tête d'une partie à l'écran (en-tête, faits, connecteurs : une règle en
  double, fragile) → `head` au rapport, un champ ajouté.
- Proposé au pilote (non fait) : déplacer `equipes/onglets.tsx` dans `components/` (déjà nommé par E05-S11).

## Hypothèses

- **HN-E05S12-1 — Faits en une ligne, sous l'en-tête** : D109 (« première ligne de la partie ») lu comme la
  première ligne sous l'en-tête `## Context: …`, qui garde son rôle (nom de la partie, gardé par la coupe) ; les
  faits de l'ancien bloc personne (deux lignes) tiennent en une ; « You work for » devient « You: ». Source : D109,
  `person.ts` l. 39-43, `org.ts` l. 29.
- **HN-E05S12-2 — Ordre : Tout le monde, Privé, équipes (défaut d'abord)** — l'ordre des Contextes de P39
  (`contextPaths`, `contexts.ts` l. 58-66) ; les faits de la personne passent après ceux de l'organisation. **→ fiche** (change ce
  que lit l'assistant de chaque organisation ; autre lecture : Privé d'abord, qui garde la ligne de langue en
  troisième place).
- **HN-E05S12-3 — Connecteurs dans la partie de l'équipe par défaut**, sous sa ligne de faits, texte inchangé ; sans
  équipe, dans la partie Tout le monde (compte de l'organisation, `team.ts` l. 41-43). D109 range les connecteurs
  dans les faits « Team » ; leurs lignes sont transverses (`connectors/lines.ts` l. 1-5) : une seule fois, pas une
  copie par équipe.
- **HN-E05S12-4 — Nom d'une partie = chemin de son Contexte**, servi ou non ; `path` seulement quand servi (ce que
  lisent `lireLeContexte` et la page d'un nœud) ; sans `handle` : `private`. Source : `BlockReport` (`engine.ts`
  l. 40), `nomDuBloc`. Un Contexte non servi garde en en-tête son chemin : il existe toujours (créé avec
  l'organisation, l'équipe ou le membre : `create_org`, `teams_tree_sync`, `members_tree_sync`).
- **HN-E05S12-5 — « Also in team » disparaît** : l'ordre des parties d'équipe (défaut d'abord) et « your default
  team » le remplacent ; `(lead: <nom>)` devient « `Lead: <nom>.` ».
- **HN-E05S12-6 — Règles dans le bloc `code`**, entre les lignes du `ctx` et « `## This request` » + la ligne du
  routage : la procédure servie suit immédiatement sa ligne. Source : retour 2 (« y ajouter »), `code.ts` l. 44-54.
- **HN-E05S12-7 — Anglais, sans le mot « Oto »** : tout le texte servi est anglais (H04, H25) ; le paquet s'installe
  chez d'autres hôtes, le préfixe nomme l'espace. Le libellé d'écran reste « Règles Oto » (mot de JB). Les
  exemples de chemin sont neutres (`<team>/<page>`, `<team>/...`) : un nom d'équipe réel (`ventes`) nommerait un vrai
  dossier dans une organisation qui a cette équipe (correction 1 du lot A, AC-10). **→ fiche** (texte lu par tous
  les assistants : JB le relit).
- **HN-E05S12-8 — Section fixe**, la même pour tous (préfixe seul) ; H30 (« code et candidats 400 ») est amendé par le
  pilote : le bloc `code` n'a pas de taille nominale, il est toujours servi en premier.
- **HN-E05S12-9 — « Recent content » : renommage seul**, natures inchangées (pages, tableaux) : procédures et
  Contextes ont déjà leurs parties (N4 d'E03-S08) ; les relister prendrait deux fois le budget. Source : retour 4
  (« si le mot y est »).
- **HN-E05S12-10 — Ancres renommées** (`regles`, `contenus`) ; `vous`, `organisation`, `equipes`,
  `code`, `documents` retirées ; les ancres des Contextes (HN-E05S11-9) inchangées.
- **HN-E05S12-11 — « Règles Oto » repliée à chaque affichage**, sans mémoire ; une ancre `#regles` y mène, fermée.
- **HN-E05S12-12 — Tête en lecture au-dessus de l'éditeur**, bornée par `head` (en-tête, faits, connecteurs) ;
  « Modifier dans Profil » sous celle du Privé ; aucune autre sortie (nom et domaines de l'organisation : écran
  Organisation, réservé). Un Contexte non servi mais écrivable montre son éditeur sous sa tête.
- **HN-E05S12-13 — « (ce contexte) » par `name`**, pour qu'un Contexte non publié se reconnaisse dans l'encart.
- **HN-E05S12-14 — Portée des activités = portée du journal (H74)** : qui administre voit l'organisation ; un membre,
  ses gestes et ceux des équipes qu'il mène. **→ fiche** (autre lecture : tout geste sur un contenu que la personne
  lit, auteur nommé — portée nouvelle, à décider par JB).
- **HN-E05S12-15 — Classement** : `<p>_write` et `POST nodes` : `publish: true` → publié ; sans `base_revision` →
  créé ; sinon → modifié ; arguments coupés (> 2 ko) → modifié ; `POST nodes/move` → déplacé ; `POST nodes/duplicate`
  → dupliqué ; `POST trash` / `POST trash/restore` → corbeille / restauré ; `<p>_call` `table.write` → écrit dans le
  tableau (chemin illisible dans les arguments : ligne omise) ; `POST tables/review` → revue ; `<p>_context` dont
  la cible est une procédure lisible → procédure lancée. Nature et titre : le nœud au chemin (ou à l'ancien chemin).
- **HN-E05S12-16 — Regroupement** : même personne, même contenu, même verbe, moins d'une heure entre deux gestes.
  Source : une ligne par enregistrement de l'éditeur (`file-d-operations.tsx` l. 195).
- **HN-E05S12-17 — Contenu illisible, à la corbeille ou disparu : son chemin, comme au journal**, sans titre ni
  lien ; `targetFor` coupe l'espace personnel d'autrui (D44). Source : `/journal` montre déjà ces cibles.
- **HN-E05S12-18 — Les conversations sans geste ni procédure ne paraissent plus à l'accueil** (elles restent au
  journal). Source : retour 3 (CRUD, appels de procédure).
- **HN-E05S12-19 — 20 activités, la semaine** (`PERIODE` de la page), « Tout le journal » gardé.
- **HN-E05S12-20 — Mise en page recommandée** (§ Retour 3) : 2fr / 1fr, recherche puis « Brancher un assistant »
  puis « Procédures utiles » à droite, « Contenus récents » retiré ; sous 1 024 px, l'ordre du DOM (la recherche
  après l'îlot : la palette de la coque la remplace au téléphone). **→ fiche** (alternative : « Contenus récents »
  servis à la place des procédures).
- **HN-E05S12-21 — Une ligne par activité par le CSS de l'accueil** (`.oto-home-main .oto-feed-item`), aucune prop de
  `FeedItem` : un cran plus simple qu'une variante du composant.
- **HN-E05S12-22 — Retour 5 par deux `TwoColumns` empilés** (le chapô et « Contenus liés » dans le premier, sans
  annexes ; la carte et les annexes dans le second) : mêmes pistes, colonnes alignées, aucune prop nouvelle.
- **HN-E05S12-23 — Retour 6 vaut partout** où « Contenus liés » paraît (JB : « pages et autres »).
- **HN-E05S12-24 — Priorité Must avant 1.0.0**, comme les retours d'E05-S11 (D105) ; à contredire par JB.
- **HN-E05S12-25 — « Pages, tables and procedures here: »** : l'intitulé nomme les trois natures ; les lignes et la
  borne de 20 (enfants d'abord, puis pages liées) inchangées ; une procédure listée ici l'est aussi dans « Procedures
  you can run » (doublon d'une ligne, accepté : D110 b). Source : `contexts.ts` l. 106-113.
- **HN-E05S12-26 — Pas d'ordre imposé sous un Contexte** : ses enfants se rangent par `position` comme ceux d'une
  page (« Monter », « Descendre », dépôt avant ou après une ligne enfant) ; seul le Contexte reste en tête de sa
  section (`contexteDAbord`). Source : D110 a (« comme ceux d'une page »).
- **HN-E05S12-27 — Aucun changement serveur pour D110 a** : création, déplacement, droits et arbre acceptent déjà un
  parent Contexte (§ Retour 7, constats) ; AC-24 le fige par un test sur base réelle.

## Actions JB

Aucune (pas de migration, pas de service extérieur). À trancher sur la fiche : HN-E05S12-2, -7, -14, -20.

## Pour le pilote (fichiers partagés)

- **→ fiche** (`fiche-decisions.md`) : HN-E05S12-2 (ordre des parties servies), HN-E05S12-7 (texte des règles, à
  relire par JB), HN-E05S12-14 (portée des activités), HN-E05S12-20 (mise en page : procédures ou contenus
  récents à droite).
- `docs/decisions/hypotheses.md` : HN-E05S12-1 à 27 ; H30 amendé (code sans taille nominale ; « documents » →
  « recent content » ; personne, organisation, équipe : plus de bloc, une ligne de faits dans la partie de leur
  Contexte, D109 ; listes d'un Contexte : procédures comprises, D110) ; H31 (les faits de la personne ouvrent la partie Privé).
- `docs/architecture.md § 5` l. 331 : blocs de `context` — `code` (règles), parties Tout le monde / Privé / équipes
  (ligne de faits + Contexte ; connecteurs dans l'équipe par défaut), `news`, `procedures`, `recent content` ;
  `BlockReport.head` ; service `activities.ts`.
- `docs/mcp-golden-queries.md` : relire C1, C5, C6, CN1 (« lus dans la partie de l'équipe par défaut »), CN2 ; ajouter
  « RG1 | Comment on travaille dans cet espace ? | `acme_context` seul ; la réponse reprend « How this workspace
  works » (six outils, espaces, brouillon et publication, confirmation) ; aucun autre appel ».
- `packages/plateforme/CHANGELOG.md` (Unreleased) : ### Assistants — `context` regroupe chaque Contexte avec ses
  lignes d'identité, ajoute « How this workspace works », « Recent content » ; ### Hosts — `DonneesDeLAccueil`
  (`activites`, `procedures` ; `activite` et `contenus` retirés), exports `listActivities`, `usefulProcedures`,
  types `Activity`, `ActivityPage`, `UsefulProcedure`.
- `component-registry.md` : `listActivities`, `usefulProcedures`, `ProceduresUtiles` ; `ContenusRecents` retiré ;
  ligne l. 304 (blocs de `context`).
- `status.md` : E05-S12, quatre lots, dépendances de C et D.
- D109 et D110 (tranchées par JB) : les reporter dans la fiche si ce n'est déjà fait ; architecture § 3 (arbre) : un
  Contexte peut porter des pages, des tableaux et des procédures, listés dans sa partie servie (P39 amendé).

## Tests attendus

Un test par AC (`testing-strategy.md § Budget de tests`) ; base réelle pour la portée et les niveaux des activités
(sécurité, AC-17) et pour l'assemblage complet (AC-1, `context-full`) ; `InMemoryTransport` pour le texte servi par
`context` (`mcp-core`) ; parité de la découpe écran / moteur étendue à la tête d'identité (AC-7) ; horloge simulée
pour le regroupement (AC-14) et les journées (AC-13) ; Playwright pour AC-19, AC-21, AC-22, deux thèmes, 375 et
1 280 px.

## Post-implémentation

### Écarts avec la référence UI

### Écarts avec l'architecture

### Composants créés

| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Notes

## Lot A — rapport

Base : `main` à `cf61002`. Conventions chargées : coding-standards, supabase, security, registry, testing (globs de
`packages/plateforme/server/**` et `tests/**`), mcp (champ `Conventions`).

### Hypothèses du lot A

- **HN-E05S12-A1 — `BlockReport.head` optionnel au type**, toujours posé par `renderContext` (0 hors d'une partie).
  Requis, il casse le type-check de deux doublures d'aperçu hors de la liste du lot A : `tests/integration/pages/accueil-page.test.tsx`
  l. 157 (fichier du lot B) et `tests/integration/pages/noeud-page.test.tsx` l. 254 (aucun lot). Le pilote peut le rendre
  requis après la fusion de B, en ajoutant `head: 0` à ces deux doublures. Source : règle des fichiers communs
  (`.method/sprint/vagues.md § Parallélisme`).
- **HN-E05S12-A2 — Exemples neutres dans les règles** (correction 1 ; la première version gardait `ventes/…` et
  retirait la section des tests de filtrage) : `<team>/<page>` et
  `<team>/...` au lieu de `ventes/relance_devis` et `ventes/...` (`WORKSPACE_RULES`, `code.ts`) ; les tests de
  filtrage (`context-blocks` AC9, `routing` AC17) cherchent `ventes/` dans tout le texte servi, sans retirer la section.
  Source : AC-10 (aucun nom), revue du lot A.
- **HN-E05S12-A3 — Parties sans chemin** : un Privé sans `handle` s'appelle `private`, n'est jamais cherché, et n'a pas
  de ligne « Not loaded » (rien à lire). Une équipe dont le chemin sort du format H51 garde sa partie (ses faits), sans
  chemin ni lecture ; elle était omise avant (source : AC-1, « sans perte »).
- **HN-E05S12-A4 — Découpe du module `contexts.ts`** : `contextBodies` (lectures, lève en panne) et `contextParts`
  (rendu pur, `null` = panne) remplacent `contextBlocks` et `notLoadedBlocks` : les faits (dont les responsables lus en
  base) et les corps se lisent en parallèle, comme avant, et s'assemblent après. `teamBlock` → `teamFacts`
  (`{ teams, connectors }`), `personBlock` → `personFacts`, `orgBlock` → `orgFacts` ; libellés de log « teamFacts:
  members », « context: recent content ».
- **HN-E05S12-A5 — « your default team » suit `defaultTeamId`** (comme `teamsLine`), les connecteurs suivent la
  première équipe (AC-2), qu'elle soit par défaut ou non (Marc, deux équipes sans défaut : dans Support, la première).
- **HN-E05S12-A6 — La taille nominale borne le corps, pointeur compris** (corps + « Rest of this context » ≤ taille),
  comme elle bornait en-tête + corps + pointeur ; une tête plus longue que la taille reste entière, le corps réduit au
  pointeur.
- **HN-E05S12-A7 — « Domains: <d>. » au texte de la story** : un domaine saisi avec un point final donne « .. » ;
  accepté (texte exact de l'AC-1).
- **HN-E05S12-A8 — Budget de la coupe de `context-engine.test.ts` relevé de 3 000 à 4 800** : le code grandit de la
  section des règles ; le test garde son sujet (code et procédure servie entiers, fin omise).

### Hors liste, pour le pilote

- `packages/plateforme/server/language.ts` l. 3 : le commentaire citait le « bloc « You work for » » : corrigé par la
  correction 1 (« ligne de faits de la partie Privé »).
- Entre la fusion de A et celle de C : `ui/contexte/libelles.ts` (l. 60) et `parties-du-contexte.ts` (l. 28) nomment
  encore `recent documents`, `person`, `organisation`, `team` ; la partie `recent content` et les parties sans `path`
  y prennent une ancre `partie-<n>` et leur nom brut (transitoire annoncé par la story, § Effet produit).
  `ui/accueil/types.ts` l. 12 (lot B) cite « Recent documents » dans un commentaire.

### Vérifications

- `pnpm type-check`, `pnpm lint`, `pnpm check:framework` : passent.
- Vitest (projet Supabase), les suites qui lisent `context` (`rg -l "plateforme/server/context|openContext\(|call\(\"context\"|previewContext|buildContext" tests`,
  22 fichiers) : 22 passent, 211 tests.
- Mutations (script hors du dépôt, fichier rendu, empreinte comparée), toutes tuées : tête bornée par la coupe du
  budget, tête bornée par le recul de l'avis, partie d'un Contexte vide omise, taille nominale comptant la tête,
  connecteurs dans chaque équipe, règles hors du bloc code, enfants illisibles listés, procédures hors des enfants.

## Lot A — correction 1

Base : `main` à `198cfd1` (worktree recalé). Reprise après un changement de compte : diff relu constat par constat,
aucune mutation restée dans `packages/` (le seul écart trouvé était la rédaction d'HN-E05S12-A2).

- **Constat 1 (AC-10)** : `WORKSPACE_RULES` (`code.ts`) cite `<team>/<page>` et `<team>/...` ; `replaceAll("<p>", …)`
  ne touche pas `<page>`. Les deux retraits de la section des règles (`routing.test.ts`, `context-blocks.test.ts`) sont
  partis : les tests de filtrage relisent tout le texte servi ; `"ventes"` rejoint les mots interdits
  d'`e05s12-texte-servi.test.ts`. Story : bloc de texte de l'AC-10, HN-E05S12-7, HN-E05S12-A2.
- **Constat 2 (AC-3)** : commentaires de `team.ts` et `contexts.ts` reformulés ;
  `rg -n '## You work for|## Organisation:|## Team |Also in team|No team\.' packages/plateforme/server` ne trouve rien.
- **Constat 4** : `language.ts` l. 3 cite « la ligne de faits de la partie Privé ».

### Hypothèses de la correction 1

- **HN-E05S12-A9 — Tests des Contextes sur deux bases** : les suites portables tournent sur la base locale
  (`PLATFORM_TEST_DB=local`, M62) ; les 8 suites propres à Supabase, sautées en local, tournent sur le projet (aucune
  migration dans ce lot). Source : consigne du pilote (base locale) et `.method/sprint/vagues.md § Base de test et migrations` (projet).

### Vérifications de la correction 1

- `pnpm type-check`, `pnpm lint`, `pnpm check:framework` : passent.
- Vitest, les 22 suites qui lisent `context` (même `rg -l` qu'au rapport du lot A) : base locale, 14 fichiers passent,
  178 tests (8 fichiers sautés, propres à Supabase) ; projet Supabase, ces 8 fichiers passent, 36 tests.

## Lot D — rapport

Livré : AC-25, AC-26, AC-27 (rail : « + » et dépôt sur la ligne d'un Contexte rangent sous lui). Aucun composant,
hook ni fonction créé ; `parentDuDepot` retiré (le dépôt vise la ligne, Contexte compris).

Fichiers : `packages/plateforme/ui/coque/sections-du-rail.tsx` (le « + » de chaque ligne crée sous elle),
`packages/plateforme/ui/coque/deplacement-dans-le-rail.tsx` (dépôt sur la ligne ; `precedente` rend le Contexte parent ;
commentaire d'en-tête), `packages/plateforme/ui/coque/arbre-du-rail.tsx` (commentaire seul, HN-E05S12-D2),
`tests/integration/components/rail-application.test.tsx`, `tests/e2e/e05s12-rail-contexte.spec.ts` (créé).

### Hypothèses du lot D

- **HN-E05S12-D1 — Tests d'écran dans `rail-application.test.tsx`**, pas dans un `e05s12-rail-contexte.test.tsx` : ses
  aides (`railA`, `simulerLAPI`, `glisserSur`, `survoler`, `impact`) sont locales au fichier ; un fichier neuf les
  aurait recopiées (`coding-standards.md § DRY`). Un `describe` « contents under a Contexte » les porte.
- **HN-E05S12-D2 — Commentaire d'`arbre-du-rail.tsx` corrigé** (hors liste du lot, une phrase) : il disait que la ligne
  d'un Contexte porte « le « + » de la racine de sa section », devenu faux.
- **HN-E05S12-D3 — Le haut de la ligne d'un Contexte reçoit dedans** (`zoneDe` inchangé : toujours « dans ») : un dépôt
  avant ou après un Contexte n'existe pas, il reçoit sur toute sa hauteur. Source : AC-26 (« reste refusé »), P39.
- **HN-E05S12-D4 — Contrôle visuel dans Privé, sans l'aperçu servi** : la spec crée sous « Contexte · Privé » (rien ne
  paraît aux autres membres de Démo) et met la procédure créée à la corbeille ; la relecture dans l'aperçu servi n'y
  est pas : la procédure créée est un brouillon (jamais listé, AC-23) et la liste des procédures sous un Contexte est
  au lot A, absent de cette base. AC-23 est prouvé par les tests du lot A.
- **HN-E05S12-D5 — « Monter » inactif = absent du « ⋯ »**, comme pour le premier frère d'une page (AC-b9).

- **HN-E05S12-D6 (pilote, revue du lot D)** — Après le déplacement du premier enfant d'un Contexte, le focus ne revient
  pas à la ligne du Contexte : le rail fait comme pour l'enfant d'une page (E05-S10 AC-b7), sans règle de focus
  propre ; AC-27 amendé en ce sens ; la suppression garde `precedente`. Le focus après un déplacement par « ⋯ »
  (aujourd'hui rendu au « ⋯ » disparu, donc au document), pour tout nœud, est une tâche de suite (M69). Source : constat 1 de la revue (HAUTE), option recommandée par le relecteur.

## Lot B — rapport

Worktree `agent-a33542fa3bb287e3d`, parti de `main` à `cf61002`, recalé sur `main` à `198cfd1` (E05-S11 e, M62,
M63) sans conflit : aucun fichier du lot n'a changé sur `main` entre les deux (`git diff --name-only cf61002 main`
croisé avec `git status --short` : la story seule). Aucune migration.

### Hypothèses du lot B

- **HB-E05S12-1 — Procédure lancée relue par `resolveTargets`**, pas par `readableProcedures` : la cible d'une
  ligne `<p>_context` est une procédure lancée si elle se relit en procédure que la personne lit, au chemin courant
  ou à un ancien chemin (une procédure renommée depuis reste lancée) ; une phrase, ou une procédure illisible, n'est
  pas une activité (même règle que `summaryOf`, HN-E05S05-4). `readableProcedures` n'est donc pas exporté : un seul
  lot de relecture pour tous les chemins. Source : AC-17 (`resolveTargets`), `journal-read.ts` l. 104-111.
- **HB-E05S12-2 — Nature d'un contenu qu'on ne lit pas** : titre et lien jamais (AC-15) ; la nature d'abord du nœud
  relu, sinon d'un nœud à la corbeille que la personne lisait (`nodeDecisions` avec `trashed`, pour « a mis à la
  corbeille la page … », l'exemple d'AC-13), sinon du verbe (`table.write`, revue → tableau ; lancée → procédure),
  sinon du `kind` des arguments d'une création, sauf sur un chemin coupé (D44 : les arguments d'une ligne sur l'espace
  personnel d'autrui ne se montrent pas au journal) ; sinon aucune nature, le chemin seul.
- **HB-E05S12-3 — Regroupement par le nœud relu** : la clé est la personne, le verbe et le nœud (sinon le chemin
  montré) ; deux gestes sur l'ancien et le nouveau chemin d'un même contenu se regroupent ; « moins d'une heure » se
  compte entre deux gestes voisins du groupe (chaîne), l'activité prend l'heure et l'identifiant du plus récent.
- **HB-E05S12-4 — « ×n » avant l'heure**, dans la colonne de l'heure (jamais coupée), lu « n fois » ; la phrase seule
  est coupée par des points de suspension.
- **HB-E05S12-5 — `truncated` non affiché** à l'accueil : « Tout le journal » reste la sortie, et l'écran du journal
  dit déjà qu'une période est coupée.
- **HB-E05S12-6 — Une revue se dit « a tranché une revue dans le tableau … »** (la décision peut être un refus).
  Une duplication nomme la copie (cible du journal, `duplicate.ts` l. 91).
- **HB-E05S12-7 — Mise en page par les créneaux existants de `HomeLayout`** : la recherche dans `aside`, « Brancher
  un assistant » et « Procédures utiles » dans `cards` ; le premier jour, `cards` garde « Brancher un assistant ».
  « Procédures utiles » est un Server Component (le lien arrive en prop), là où « Contenus récents » était client.
- **HB-E05S12-8 — Bornes du service** : 20 activités (`ACTIVITIES_MAX`) et 6 procédures (`USEFUL_PROCEDURES_SHOWN`,
  passé par la page) vivent dans `schemas/activity.ts` ; l'écran montre ce qu'il reçoit, sans chiffre écrit.
- **HB-E05S12-9 — Tests hérités** : `ecran-accueil.test.tsx` (l. 233) et `accueil.spec.ts` (l. 83) lisent la région
  « Contexte : Tout le monde » et son ancre `contexte-tout-le-monde`, vraies avant et après C ; l'assertion suivante
  de `ecran-accueil.test.tsx` (« Modifier dans Profil », partie « Vous ») garde le bloc `person` de sa fixture et
  revient au lot C, qui déplace ce lien sous la partie Privé.

### Vérifications (lot B, après recalage)

- `pnpm type-check`, `pnpm lint`, `pnpm check:framework` : verts.
- Vitest ciblé sur la base locale (`PLATFORM_TEST_DB=local`), fichiers trouvés par `rg -l "listActivities|usefulProcedures|
  proceduresBlock|EcranDAccueil|DonneesDeLAccueil|ContenusRecents|inScope|HomeLayout|FeedItem|listConversations" tests` :
  13 fichiers verts, 162 tests ; `isolation/tables.test.ts` sauté (Supabase seul).
- Mutations (script à copie et `finally`, empreinte comparée) : 17 sur 17 tuées — portée, erreurs, D44, arguments
  coupés, procédure lancée, borne d'une heure, ligne de plus, nature à la corbeille sans niveau, nature des
  arguments sur un chemin coupé, période, niveau, ordre et borne des procédures utiles, lien d'un contenu illisible,
  lien d'une procédure lancée, premier jour (deux).
- Playwright `accueil.spec.ts` (AC-19), deux thèmes, 375, 1 024 et 1 280 px : vert ; captures relues à l'œil.

### Écarts avec la référence UI (lot B)

- Colonnes 2fr / 1fr au lieu de 55 / 45 (`home.css`) ; la recherche passe en haut de la colonne de droite.
- Une activité sur une ligne (qui, ce qui est arrivé, l'heure) au lieu de deux rangées ; la phrase est écrite par
  l'écran depuis un verbe classé, pas une prose du serveur ; pas de repère « vous en étiez ici » (V2).
- L'onglet « Procédures » d'oto-frontend devient l'îlot « Procédures utiles » à droite, sans tri en menu, sans « tout
  voir » (aucune page Procédures) ni pastille d'exécution.
- « Contenus récents » quitte l'accueil.

### Composants créés (lot B)

| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `listActivities` ; `classifyRow`, `groupGestures` (internes, testés) | `packages/plateforme/server/activities.ts` | Journal par gestes, portée H74 posée dans la requête, D44, relecture en un lot |
| `usefulProcedures` | `packages/plateforme/server/context/blocks/procedures.ts` | L'ordre du bloc `procedures` (comparateur `byUsage` partagé), `limit` premières, par titre |
| `Activity`, `ActivityPage`, `UsefulProcedure`, `USEFUL_PROCEDURES_SHOWN` | `packages/plateforme/schemas/activity.ts` | Formes partagées service / écran |
| `ProceduresUtiles` | `packages/plateforme/ui/accueil/procedures-utiles.tsx` | Server Component, îlot de droite |
| `ContenusRecents` | retiré | — |

## Lot B — correction 1

Constats de la première revue, et un ajout de JB (2026-09-28).

- **Une transaction par lecture** (MOYENNE, `supabase-patterns.md § Couplage à Supabase (ADR-012)`) : les corps de
  `listActivities` et de `usefulProcedures` passent dans `inTransaction(db, "<nom>", async () => …)`, comme
  `nodes/node-links.ts` ; les lectures internes reprennent la transaction. Mesuré par `recordDb` (test « should read
  … in one transaction » d'`e05s12-activites-sql.test.ts`) : `listActivities` 6 transactions avant, 1 après ;
  `usefulProcedures` 3 avant, 1 après.
- **Mutations tracées** (MOYENNE, `testing-strategy.md § Anti-patterns`) : la campagne est rejouée par
  `scratchpad/mutations-e05s12b-c1.mjs` (celle d'origine, `mutations-e05s12b.mjs`, comparait les empreintes sans les
  écrire), qui écrit pour chaque mutation l'empreinte SHA-256 du fichier avant, muté et après la remise.
- **Nature des arguments** (BASSE, parité avec `/journal`) : prise des arguments sur une ligne du lecteur seulement.
- **Phrase coupée** (BASSE) : attribut `title` avec la phrase entière ; **survol** (BASSE) : fond réservé aux lignes
  qui sont un lien (`home.css`) ; **commentaire de tête** de `src/app/(dashboard)/page.tsx` à jour (BASSE).
- **Libellé** (JB) : l'îlot de droite s'intitule « Procédures les plus utilisées » (titre, nom accessible, tests).
  Le libellé « Procédures utiles » du Contexte servi (`ui/contexte/libelles.ts`, bloc `procedures`) n'est pas
  l'îlot de l'accueil et reste ; le texte servi à l'assistant ne change pas.

### Hypothèses du lot B — correction 1

- **HB-E05S12-10 — Nature des arguments sur une ligne du lecteur seulement**, plus strict que `hidesContent` :
  le journal lit les arguments entiers pour savoir s'ils nomment l'espace personnel d'autrui, la requête des
  activités ne les lit pas (AC-17). Un cran plus exact écarté : un drapeau calculé en SQL par une expression
  régulière sur `args::text`, qui recopierait la règle de `hidesContent` en SQL (deux sources) et lirait `args`
  entiers dans la requête. Effet : sur la ligne d'une autre personne, la nature vient du nœud relu, d'un nœud à la
  corbeille lisible ou du verbe, jamais des arguments. Remplace la fin d'HB-E05S12-2 (« sauf sur un chemin coupé »).

### Vérifications (lot B, correction 1)

- `pnpm type-check`, `pnpm lint`, `pnpm check:framework` : verts.
- Vitest sur la base locale, fichiers trouvés par `rg -l "server/activities|blocks/procedures|listActivities|
  usefulProcedures|proceduresBlock|EcranDAccueil|FilDActivite|ActivitesDeLAccueil|fil-activite" tests` : 7 fichiers,
  116 tests verts.
- Mutations (`mutations-e05s12b-c1.mjs`, sortie `mutations-e05s12b-c1.out`) : 21 sur 21 tuées, les 17 d'origine
  (M9 récrite pour la nouvelle règle) et quatre de la correction (transaction de `listActivities`, de
  `usefulProcedures`, `title` de la phrase, libellé de l'îlot). Empreintes SHA-256 (12 premiers caractères), avant =
  après la remise pour chaque mutation : `activities.ts` 3ddf55fbe0ac, `procedures.ts` cb5b07afde44,
  `fil-activite.tsx` 9943d50a4ece, `ecran-accueil.tsx` 6f967b7dcef0, `libelles.ts` 79fbed435a24 ; l'empreinte de
  chaque état muté est dans la sortie.
- Non éprouvé par un test : le fond au survol (CSS, jsdom ne l'applique pas).

## Lot C — rapport

Base : `main` à `519f498` (lot A et M64 fusionnés). Conventions chargées : coding-standards ; portage, a11y, registry
(`packages/plateforme/ui/**`) ; testing (`tests/**`) ; state, performance (champ `Conventions`, sans objet ici : aucun
état ni chargement nouveau).

### Hypothèses du lot C

- **HN-E05S12-C1 — Une partie de Contexte se reconnaît à son `name`**, jamais à `path` : `contexte`, `private` (Privé
  sans `handle`) ou un nom qui finit par `/contexte` (`estUnContexte`, `ui/contexte/parties-du-contexte.ts`). Le nom
  affiché, l'ancre, « (ce contexte) » et le chemin lu pour l'éditeur (`cheminDuContexte`) en partent. Source : AC-4
  (`name` = chemin, servi ou non), AC-6, AC-8.
- **HN-E05S12-C2 — La page de l'accueil lit aussi les Contextes non servis** : `lireLeContexte`
  (`src/app/(dashboard)/page.tsx`, fichier du lot B, non modifié ici) lit `bloc.path` ; pour qu'un Contexte non servi
  mais écrivable montre son éditeur dans l'application (AC-7), elle doit lire `cheminDuContexte(bloc)`, exporté par
  `ui/index.ts` (ajout seul). Le composant le fait dès que la page le lit (test d'intégration) ; la ligne est donnée
  au pilote pour la fusion.
- **HN-E05S12-C3 — Remplacée par HN-E05S12-C10** (correction 1) : toute lecture d'un Contexte en échec se dit ; le
  `not_found` se trie dans la page.
- **HN-E05S12-C4 — « Règles Oto » : le `<h2>` dans le `<summary>`** (contenu permis par HTML), marqueur natif gardé,
  section nommée par ce titre ; `LinkedContent` écarté (style de pastille de commande, § Doublons).
- **HN-E05S12-C5 — Retour 5 : deux `TwoColumns` empilés** (HN-E05S12-22), le premier marqué `oto-node-lead`, dont la
  marge basse ramène l'écart du contenu (`--space-3`) à celui de la colonne (`--gap`) : sans elle, 12 px au lieu de
  10 entre « Contenus liés » et la carte d'un Contexte (AC-22). Écarté, un cran plus simple : garder l'écart du
  contenu (2 px de plus sur un Contexte que sur une page).
- **HN-E05S12-C6 — `?version=publiee`** : l'alerte « version publiée » reste dans la colonne de la carte
  (`CorpsDuNoeud`), au-dessus de l'îlot ; les annexes s'alignent alors sur elle. Cas du rédacteur seul ; la déplacer
  toucherait `corps-du-noeud.tsx`, hors liste.
- **HN-E05S12-C7 — `head` facultatif, lu `head ?? 0`** (HN-E05S12-A1). `tests/integration/pages/noeud-page.test.tsx`
  (hors liste, aucun lot) est modifié : sa doublure servait un bloc `person` et attendait la ligne « Vous » de
  l'encart, qui n'existe plus ; elle sert `code` avec `head: 0` et attend « Règles Oto » (`#regles`).
- **HN-E05S12-C8 — Partie omise d'un Contexte écrivable** : la phrase d'omission, puis l'éditeur (AC-7 : un Contexte
  écrivable montre son éditeur).
- **HN-E05S12-C9 — La vue amène à l'écran la partie de l'ancre** (`VersLaPartie`, `ui/contexte/vers-la-partie.tsx`,
  fichier hors liste) : la vue arrive en flux sous le `<Suspense>` de la page, après que le routeur de l'hôte a cherché
  l'ancre ; une partie sous la ligne de flottaison n'était jamais montrée. Constaté par `procedure-et-contexte.spec.ts`
  l. 202 : l'ancienne ligne « Vous », deuxième partie, était déjà à l'écran et masquait le défaut ; « Contexte :
  Privé », troisième sous « Tout le monde » éditable, ne l'est pas. Rien dans le paquet ni dans l'hôte ne fait
  défiler vers une ancre (`rg -n "location.hash|scrollIntoView" packages/plateforme/ui src`). Écarté, un cran plus
  simple (aucun îlot) : que la page attende `lireLeContexte` sans `<Suspense>`, la vue arrivant alors dans le premier
  rendu où le navigateur trouve l'ancre ; le premier octet de l'accueil attendrait l'aperçu et chaque Contexte lu, et
  la page est un fichier du lot B.

### Écarts avec la référence UI

- « Règles Oto » : repli natif, sans pastille ni chevron (oto-frontend n'a pas de partie de règles).
- Écran d'un Contexte, contenu de moins de 1 410 px (HN-E05S12-C11) : le document à gauche, les annexes à 280 px, et
  non plus le document centré entre deux gouttières.

### Lot C — correction 1

Constats de la première revue : échec de lecture dit partout (MOYENNE), lignes du registre et du CHANGELOG (MOYENNE),
annexes lisibles à 1 280 px (demande de JB), quatre BASSE. Conventions chargées : coding-standards ; portage, a11y
(`packages/plateforme/ui/**`) ; testing (`tests/**`).

- **HN-E05S12-C10 — Toute lecture d'un Contexte en échec se dit, le `not_found` se trie dans la page**
  (`portage-ecrans.md § 4. Quatre états`) : `ContexteServi` dit l'erreur de toute partie dont la lecture a échoué,
  servie ou non ; la page de l'accueil (lot B) ne rend pas en erreur un Contexte absent ou hors de portée
  (`not_found`, pas une panne pour la personne), elle l'omet. Code attendu côté page : § Hors liste, pour le pilote.
- **HN-E05S12-C11 — Les annexes d'un document à 280 px sous 1 410 px de contenu** (`--annexes-w`, `oto.css` ;
  `islands.css`, deux `@container` sur `.oto-content`). À 1 280 px, rail ouvert, les deux gouttières qui centrent
  le document (830 px) ne laissaient qu'environ 90 px aux annexes, illisibles ; sous 1 410 px de contenu
  (830 + 2 × (10 + 280), où la piste des annexes vaut déjà 280 px), le document prend ce qui reste à gauche et les
  annexes 280 px, l'en-tête s'arrêtant au bord du document ; sous 770 px de contenu (document de moins de 480 px),
  une colonne, les annexes sous la carte. Le palier de la fenêtre (1 024 px) garde le dernier mot dessous, écrit
  après. Source : constat de revue, demande de JB (encart lisible au niveau de la carte). **AC-21 se lit sur la
  largeur du contenu** : à 1 024 px rail ouvert (≈ 760 px de contenu), les annexes passent sous la carte ; au-dessus
  de 1 120 px de contenu (rail réduit à 1 280 px, fenêtre plus large), le document dépasse sa mesure de 830 px
  jusqu'au palier de 1 410 px. À reporter à la fiche de décisions : le client voit la mise en page de chaque
  Contexte. Écarté, un cran plus simple : une largeur minimale sur la seule piste des annexes
  (`minmax(280px, 1fr)` dans les trois pistes) ; elle décentre le document sans que l'en-tête le suive, et ne
  replie rien quand le contenu manque. Seul écran touché : `rg -n 'main="document"|data-main' packages src` ne
  trouve que les deux `TwoColumns` d'`ecran-de-noeud.tsx`, posés pour un Contexte seul (`props.annexes`).
- `ui/contexte/vers-la-partie.tsx` : l'ancre lue sans `decodeURIComponent` (ASCII, `ancreDeLaPartie`).
- Tests : `e05s12-contexte.test.tsx` (la partie non servie en échec montre l'alerte ; retrait du remontage des
  règles, qui ne prouvait rien) ; `e05s12-contexte.spec.ts` (annexes ≥ 270 px à 1 280 px ; aucun défilement
  horizontal de `.oto-content` sur le Contexte et sur l'accueil).
- Vérifications : `pnpm type-check`, `pnpm lint`, `pnpm check:framework` passent ; Vitest ciblé (même `rg -l` qu'au
  rapport, plus `VersLaPartie`), 13 fichiers, 170 tests passent, 1 échec attendu (`ecran-accueil.test.tsx`, région
  « Vous », lot B) ; Playwright (port 3000, serveur du worktree) `e05s12-contexte.spec.ts` 4/4 et
  `procedure-et-contexte.spec.ts` 2/2. Captures relues : à 1 280 px, clair et sombre, annexes de 280 px au haut de la
  carte, en-tête arrêté au bord du document ; à 375 px, annexes sous la carte ; accueil sans défilement horizontal.

### Hors liste, pour le pilote

- `src/app/(dashboard)/page.tsx` (lot B), `lireLeContexte` (HN-E05S12-C2, HN-E05S12-C10) ; code essayé dans le
  worktree du lot C puis retiré (type-check, ESLint et `accueil-page.test.tsx` passent, 10 tests ; la mutation
  `not_found` → autre code fait échouer le test neuf) :
  - imports : `isPlatformError` depuis `@otomata_tech/oto_platform/server`, `cheminDuContexte` depuis
    `@otomata_tech/oto_platform/ui` ;
  - `const chemins = apercu.data ? [...new Set(apercu.data.blocks.flatMap((bloc) => cheminDuContexte(bloc) ?? []))] : []` ;
  - `const lus = await Promise.all(chemins.map((path) => resultatDe(loadNode(db, identity, { path }).catch((erreur: unknown) => (isPlatformError(erreur) && erreur.code === "not_found" ? null : Promise.reject(erreur))))))` ;
  - `contextes: Object.fromEntries(chemins.flatMap((chemin, rang): [string, DonneesDuContexteServi["contextes"][string]][] => { const lu = lus[rang]; if (lu.error !== undefined) return [[chemin, lu]]; return lu.data === null ? [] : [[chemin, { data: lu.data }]] }))`
    (les `null` retirés : un Contexte absent n'a pas d'entrée).
- `tests/integration/pages/accueil-page.test.tsx` (lot B), `describe("/ page, « Contexte » tab (E05-S11)")`, un `it`
  neuf : « should read the Contexte of a part not served, say its failed read, and say nothing of an absent one » —
  aperçu à deux parties non servies (`conseil/contexte`, `support/contexte`, `path: null`, `head` = longueur) ;
  `loadNode` lève `PlatformError("not_found")` pour Conseil, `PlatformError("internal")` pour Support (le code
  `unavailable` n'existe pas, `PLATFORM_ERROR_CODES`) ; attendus : `loadNode` lu pour les quatre chemins, aucune
  alerte dans la région Conseil, l'alerte « Une erreur est survenue. Réessayez. » dans la région Support.
- `.method/conventions/component-registry.md`, ligne `ContexteServi` : ajouter `VersLaPartie`
  (`ui/contexte/vers-la-partie.tsx`, îlot client interne qui amène à l'écran la partie de l'ancre) et
  `cheminDuContexte`, `estUnContexte`, `estLePrive` (`parties-du-contexte.ts` : une partie de Contexte reconnue à son
  `name`, son chemin lu pour l'éditeur, le Privé avec ou sans `handle`) ; « un Contexte non servi mais écrivable
  montre son éditeur, « Règles Oto » repliée (E05-S12 lot C) ».
- `packages/plateforme/CHANGELOG.md`, `## Unreleased` → `### Hosts` : « `cheminDuContexte` is exported from `ui`:
  read the Contexte of every part of the preview by it, served or not, so that a writable draft Contexte shows its
  editor; skip a `not_found`. » et « `DonneesDeLApercu.blocks[].head` (optional, characters of the served head of a
  part) is read by the Contexte screens; pass the `previewContext` report through unchanged. »
- `docs/decisions/fiche-decisions.md` : HN-E05S12-C11 (annexes à 280 px sous 1 410 px de contenu, document décalé à
  gauche ; AC-21 lu sur la largeur du contenu), le client voit la mise en page de chaque Contexte.
- `tests/integration/components/ecran-accueil.test.tsx` l. 228-233 et `tests/e2e/accueil.spec.ts` l. 83 (lot B) : la
  région « Vous » n'existe plus après C ; le lot B les rend stables sur `contexte-tout-le-monde` (§ Lot B).
- `tests/e2e/procedure-et-contexte.spec.ts` : lignes du lot C seules, l. 194-195, 199, 200, 202 (la ligne « Contexte :
  Privé » de l'encart et `#contexte-prive` au lieu de « Vous » et `#vous`).

### Rayon d'impact du lot C

- **Appelants** : `rg -ln "NOMS_DES_BLOCS|nomDuBloc|ancreDeLaPartie|partiesDuContexte|PartieServie|porteeDe\b|DonneesDeLApercu|cheminDuContexte|estUnContexte|estLePrive" packages src tests`
  → `ui/contexte/{parties-du-contexte,libelles,contexte-servi,apercu-du-contexte,annexes-du-contexte}`, `ui/index.ts`,
  `e05s11-parties-du-contexte.test.ts` : tous dans le lot (`annexes-du-contexte.tsx` lit `porteeDe`, inchangé pour un
  chemin réel). `rg -ln "oto-linked\b|LinkedContent" packages tests` → `noeud/sous-pages.tsx` seul monteur (page,
  procédure, tableau, Contexte, page publique : AC-22 vaut partout), `e05s10b.spec.ts` (trouve la classe, sans mesure).
  `rg -ln "TwoColumns|oto-two-columns" packages src tests` → `admin/{organisation,connecteurs}` : composant inchangé,
  `oto-node-lead` n'est posé que par `ecran-de-noeud.tsx`. Libellés anciens relus par des tests : `rg -n "Code de la
  conversation|Documents récents|Vos équipes|#vous|name: \"Vous\"" tests packages src` → `ecran-accueil.test.tsx`
  l. 228-233 et `accueil.spec.ts` l. 83 (lot B), `noeud-page.test.tsx` l. 246, 291 (adapté, HN-E05S12-C7).
- **Doublons** : `rg -n "<details|<summary" packages/plateforme/ui --glob "*.tsx"` → repli natif réutilisé
  (HN-E05S12-C4) ; aucune règle « chemin d'un Contexte » dans `ui/` (`rg -n "endsWith\(.*contexte|estUnContexte"
  packages/plateforme/ui packages/plateforme/schemas`) : `estUnContexte` est la seule ; la tête se lit par `head`, jamais
  recalculée ; aucun défilement vers une ancre (`rg -n "location.hash|scrollIntoView" packages/plateforme/ui src`).
- **Effet produit** : vue « Contexte » de l'accueil et encart de chaque Contexte (noms, ancres, tête, éditeur, règles
  repliées) ; écran de nœud : marge sous « Contenus liés » retirée partout, chapô d'un Contexte au-dessus de la rangée
  carte-annexes ; hôtes : export `cheminDuContexte`. Ni service, ni MCP, ni base, ni RLS.
- **Refacto** : écarté — recalculer la tête à l'écran (déjà écarté par la story) ; une prop « rangée d'en-tête » de
  `TwoColumns` (surface du design system pour un seul écran).

### Vérifications du lot C

- `pnpm type-check`, `pnpm lint`, `pnpm check:framework` : passent.
- Vitest ciblé, `rg -l "EcranDeNoeud|AnnexesDuContexte|ContexteServi|EcranDAccueil|parties-du-contexte|contexte/libelles|previewContext" tests/integration tests/unit`
  (hors `context-blocks.test.ts`, serveur, non touché) : 13 fichiers, 170 tests passent ; 1 échec attendu,
  `ecran-accueil.test.tsx` l. 233 (région « Vous », lot B).
- Mutations (script hors du dépôt, fichier rendu, empreinte comparée), 13, toutes tuées : tête lue sans `head`, suite
  sans retrait de la fin de ligne, `private` seul hors des Contextes, `private` seul avec un chemin, éditeur lu par
  `path`, échec dit hors du servi, Profil sous toute partie, règles ouvertes, règles rendues comme une partie, tête
  omise avant l'éditeur, « (ce contexte) » par `path`, nom par `path`, `private` seul nommé comme une équipe.
- Playwright (port 3000, serveur du worktree) : `e05s12-contexte.spec.ts` 4/4 (clair, sombre ; 375 et 1 280 px) ;
  `procedure-et-contexte.spec.ts` 2/2 (après HN-E05S12-C9). Captures relues : règles repliées puis ouvertes, tête puis
  éditeur, annexes au haut de la carte ; aucun défilement horizontal à 375 px.
