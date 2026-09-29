# Story E11-S10 — Rail : espace Privé dès la première connexion, équipes où l'on est membre, créateur inscrit, vue Contexte dans le menu

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | 5.1 Se connecter et brancher son assistant ; 5.5 Administrer (équipes et responsables) ; 4.4 Concevoir et mettre à jour (Contextes, vue « Contexte ») ; coque (rail) |
| **Statut** | 🟢 Ready |
| **Priorité** | Must |
| **Référence UI** | N/A : style du paquet, tokens d'oto-frontend (`portage-ecrans.md`) ; le rail (`ui/coque/sections-du-rail.tsx`) montre ce que sert `visibleTree`, sa ligne de Contexte inchangée ; menu du compte `RailAccount` (`rail.tsx` l. 131-149) ; `/context` sur le modèle des autres écrans (`ScreenHeader`, puis le contenu) |
| **Conventions** | database, supabase, security, mcp, portage, a11y, registry, api, nextjs, state, performance, seo, testing |
| **Estimation** | L, bas de fourchette (six lots : a Privé, b arbre de l'admin, c créateur, e menu et route, f vue, g page d'un Contexte ; lot d retiré le 2026-09-29 ; une migration de trois objets, une quinzaine de fichiers de test d'écran à reprendre) |
| **Vague** | E11, version 1.0.1 (fiche D131) ; avant E11-S07 (qui renomme ce que celle-ci crée) ; E11-S05 (lot e, encarts) touche les mêmes fichiers |
| **Dépend de** | Aucune story. La migration rejoint le fichier unique de la version (D124) |
| **Porteuse de migration** | **Oui** (Ⓜ) : fonction `platform.ensure_private_space`, `members_tree_sync` re-versionnée, réparation des données. Aucun changement du texte servi |

## Contexte

Chemins relatifs à `packages/plateforme/`. `MIG` = `migrations/20260928100000_platform_base_v1.sql`,
`e05s13` = `migrations/20260929090000_platform_e05s13.sql`.

Retours du responsable d'Oto sur l'hôte de démo (2026-09-29, décisions 3 et 5 du 2e tour) :
1. une personne invitée n'a pas vu la section « Privé » du rail à sa première connexion ;
2. un admin voit toutes les équipes dans le rail ; il ne doit voir que les siennes, et peut
   s'ajouter à une équipe depuis l'administration ; le créateur d'une équipe y est inscrit, comme
   responsable (`team_members.role = 'lead'`, D128) ;
3. « L'onglet "CONTEXTE" de la page d'accueil est à enlever et à mettre dans le shell en bas à
   gauche dans un nouveau menu "Contexte". » Décision : une entrée du menu engrenage
   (`rangement: "compte"`), route anglaise `/context` ;
4. « Enlève les pages contexte du shell et rends-les accessibles […] avec une icône 'info' à gauche
   des '+' des sections du shell : TOUT LE MONDE, chaque ÉQUIPE, PRIVÉ. » Aujourd'hui chaque section
   s'ouvre sur une ligne « Contexte · <section> » (`ui/arbre/depuis-l-arbre.ts` l. 60-62 et 91 ;
   `ui/coque/arbre-du-rail.tsx` l. 57, 64, 68). Annulé le 2026-09-29 par le responsable d'Oto : le
   Contexte reste dans le rail comme aujourd'hui (HN-E11S10-13, lot d retiré) ;
5. « Dans /?onglet=contexte je ne vois pas le contexte de mon ou mes équipes. » Les parties d'équipe
   viennent d'`identity.teams` (`server/context/blocks/contexts.ts` l. 96-102, `blocks/team.ts`
   l. 65-69), les équipes où la personne a une ligne `team_members` (`server/identity.ts`
   l. 154-160). L'admin qui a créé les équipes n'en est pas membre : la vue dit vrai, le lot c
   corrige la création ;
6. même vue : cacher « Organisation: Démo. », les lignes sous « Contexte : Privé » et « Contexte :
   <équipe> », « Modifier dans Profil », « Règles Oto » (vue et pages Contexte), « Voici ce que votre
   agent va lire », « Les conversations en cours rechargeront le contexte. » ; l'assistant garde
   tout. Les premières lignes sont la tête servie (`orgFacts`, `personFacts` l. 34, `teamFacts` l. 67),
   montrée par `Faits` (`ui/contexte/contexte-servi.tsx` l. 78-82, appelé l. 128).

S'y ajoute le lot b d'E11-S05 (ancre des nouveautés), repris avec la vue qu'il touchait.

**Le rail.** Le layout `src/app/(dashboard)/layout.tsx` l. 63-70 lit une fois par rendu l'arbre
visible (`visibleTree`, `server/nodes/tree.ts` l. 29 : niveau ≥ lecture) et toutes les équipes
(`listTeams`, `server/teams.ts` l. 92). `sectionsDeLArbre` (`ui/arbre/depuis-l-arbre.ts` l. 73-94)
range chaque nœud sous son premier segment ; une section vide n'est pas rendue (l. 92).

**L'espace Privé.** Il naît à l'insertion dans `members`, par `members_tree_sync` (AFTER INSERT
seulement, MIG l. 2752 ; corps actuel e05s13 l. 283-333) : `private/<handle>`, propriétaire la
personne, et `private/<handle>/contexte`. Le déclencheur sort sans rien faire si `profile.handle`
est nul ou si l'organisation n'a pas de dossier `private` (e05s13 l. 295-297). `accept_invitations`
(e05s13 l. 176-231) insère la ligne avec un handle (`unique_handle`), mais sa branche
`on conflict do update` ne touche que le rôle. Des lignes sans handle existent :
`scripts/demo/10-identite.mjs` l. 142-149 (réparé à la main par `scripts/demo/30-arbre.mjs`
l. 79-116), `scripts/ci/bare-postgres-smoke.sql` l. 31, les fixtures de tests.

**La cause du retour 1 n'est pas prouvée par le code.** La personne voyait le rail : elle avait sa
ligne `members` (sinon `/aucune-organisation`, layout l. 56-58) ; il lui manquait tout nœud visible
sous `private`. Causes plausibles : (1) une ligne `members` sans handle, l'invitation acceptée par
la branche `on conflict` ; (2) une ligne insérée avant le dossier `private` (graine de la Démo :
`identite` avant `arbre`) ; (3) écartées par le code : un espace à la corbeille (refusé,
`server/nodes/trash.ts` l. 52-53) ou pris par une autre personne (`unique_handle`,
`migrations/20260928120000_platform_private.sql` l. 121-130). Le lot a commence par le diagnostic
(AC-a0), puis corrige les causes 1 et 2 pour toute ligne, passée et future.

**Les équipes de l'admin.** Un admin a la gestion de tout nœud hors espace personnel
(`server/access-levels.ts` l. 195 ; SQL `node_level_of`, e05s13 l. 68-75) : son arbre visible
contient toutes les équipes. S'ajouter à une équipe existe déjà (écran Équipes) : « Ajouter
quelqu'un » liste toute l'organisation, soi compris (`ui/equipes/equipes.tsx` l. 53,
`ui/equipes/personnes-de-l-equipe.tsx` l. 168-172, 237) ; le menu de sa ligne propose « Ses
équipes » (`ui/equipes/menu-d-une-personne.tsx` l. 74, `ui/equipes/equipes-d-une-personne.tsx`
l. 31, 55-66). Chaque geste relit la page.

**Le créateur.** `createTeam` (`server/teams.ts` l. 119-149) n'insère que la ligne `teams` ;
`teams_tree_sync` crée le dossier et son Contexte. Personne n'entre dans l'équipe.

**Refs :**
- PRD : FR-ADMIN-01 (équipes et responsables), FR-ADMIN-03 (droits hérités, inchangés) ; § 5.4
  « L'admin et l'équipe plateforme gèrent tout, sauf les espaces privés » (`docs/prd.md` l. 425) ;
  FR-CONC-03 (aperçu de ce que le modèle recevra), FR-CONC-04 (nouveautés omises, inchangé)
- Architecture : `docs/architecture.md` l. 93 (toute personne a son espace « Privé ») ; § 8
  Invariants (texte servi inchangé) ; ADR-008 § 2 (l'hôte donne les adresses), § 7 (rail exporté seul
  pour un ERP) ; ADR-002 (six outils) ; ADR-012 § 3 et `security-patterns.md § Droits dans le
  service` ; ADR-015 (écrans en français) ; D128 (responsables) ; fiche D110 (Contenus sous un
  Contexte), inchangée (HN-E11S10-13)

## Périmètre

- Diagnostic et réparation des espaces manquants ; handle posé par le déclencheur.
- Arbre des écrans d'un admin calculé comme celui d'un membre.
- Créateur d'une équipe inscrit comme responsable.
- Menu du compte : entrée « Contexte » vers `/context`, nouvelle route de l'hôte ; accueil sans
  onglets.
- Vue « Contexte » allégée ; section « Nouveautés » toujours rendue, ancre suivie (ex-lot b
  d'E11-S05).
- Page d'un Contexte : encart sans titre visible ni « Règles Oto » ; publication sans phrase de
  recharge.

## Hors périmètre

- Rail : la ligne « Contexte · <section> », son « + » et le glisser-déposer sous un Contexte restent
  comme aujourd'hui ; ni bouton info ni retrait de ligne (lot d retiré le 2026-09-29,
  HN-E11S10-13).
- Bouton « Rejoindre » dans le rail ou l'écran Équipes : l'existant suffit (HN-E11S10-11).
- Relecture du rail sans geste (temps réel, retour sur l'onglet) : HN-E11S10-10, validée.
- Restaurer un espace à la corbeille ou rendre un espace pris : si le diagnostic les trouve, le dev
  s'arrête et les remonte (CLAUDE.md § Avant de coder).
- Changer les droits de l'admin (lecture, gestion, `find`, `context`) : inchangés.
- « À quoi sert cette page » repliable, encarts en colonne de droite : E11-S05, lot e (HN-E11S10-23).
- Texte servi par `context`, liste et schémas des outils : inchangés (ADR-002). Traduction des faits
  servis : M73 (ADR-015), sans objet tant qu'ils sont cachés.
- Routes et ancres en anglais (`/equipes`, `contexte-tout-le-monde`…) : E11-S07 (HN-E11S10-21).
- Redirection de `/?onglet=contexte` : aucune (décision 1, pas de client).
- Invalidation ciblée des ctx et publication directe : E11-S03, E11-S02 (lots a à c) ; ici la phrase de recharge
  part seule.
- Lots a, c, d d'E11-S05 (cellules, téléchargement) : restent dans E11-S05.

## Critères d'acceptation

Ordre : les lots a à c d'abord (migration, correction de bug : tests de reproduction rouges avant
le code), puis e à g (lot d retiré).

### Lot a — L'espace Privé dès la première connexion (correction de bug)

- [ ] **AC-a0 — Diagnostic, avant le code.** **Given** le projet de test (organisation `demo`) et
  la connexion d'administration du `.env.local` (jamais affichée) **When** le dev lance, en lecture,
  la requête ci-dessous **Then** il note en post-implémentation le nombre de membres par cas, sans
  e-mail ni nom (CLAUDE.md § Modifications documentaires, règle 5) :
  ```sql
  select (m.profile ->> 'handle') is null as sans_handle,
         s.id is null as sans_espace, s.owner_user_id is distinct from m.user_id as espace_d_autrui,
         s.deleted_at is not null or c.deleted_at is not null as a_la_corbeille,
         c.id is null as sans_contexte, p.id is null as sans_dossier_private, count(*)
    from platform.members m
    left join platform.nodes p on p.org_id = m.org_id and p.path = 'private'
    left join platform.nodes s on s.org_id = m.org_id and s.path = 'private/' || (m.profile ->> 'handle')
    left join platform.nodes c on c.org_id = m.org_id and c.path = 'private/' || (m.profile ->> 'handle') || '/contexte'
   where m.org_id = (select id from platform.orgs where slug = 'demo')
   group by 1, 2, 3, 4, 5, 6;
  ```
  **And** si la personne invitée tombe dans `espace_d_autrui` ou `a_la_corbeille`, ou dans aucun
  cas, le dev s'arrête et remonte le constat avant d'écrire la migration.
- [ ] **AC-a1 — Handle posé à l'insertion (reproduction).** **Given** une organisation qui a
  `private` **When** une ligne `members` est insérée sans `profile.handle` **Then** `profile.handle`
  vaut `platform.unique_handle(org, members.email)`, et `private/<handle>` (titre « Privé »,
  propriétaire la personne) et `private/<handle>/contexte` existent, avec les résumés d'e05s13
  l. 321-329.
- [ ] **AC-a2 — Réparation d'une ligne existante (reproduction).** **Given** un membre inséré quand
  l'organisation n'avait pas `private`, puis le dossier créé **When**
  `platform.ensure_private_space(org, user)` **Then** le handle est posé s'il manque, l'espace et son
  Contexte sont créés. **And** un second appel n'écrit rien. **And** sans dossier `private`, l'appel
  rend sans erreur ni écriture.
- [ ] **AC-a3 — Données réparées par la migration.** **Given** la migration appliquée **Then** la
  requête d'AC-a0 ne compte plus aucun membre `sans_handle`, `sans_espace` ni `sans_contexte` dans
  une organisation qui a `private` (relevé en post-implémentation).
- [ ] **AC-a4 — Rien ne change pour une ligne avec handle.** **Given** une insertion avec handle
  (`accept_invitations`), ou un handle qui est l'ancien chemin d'un autre nœud **Then** la
  renumérotation `<handle>_<n>` est gardée (`tests/integration/espace-prive.test.ts`,
  `tests/integration/annuaire-sql.test.ts`, verts sans retouche).
- [ ] **AC-a5 — Première connexion.** **Given** une invitation sans équipe **When** la personne
  l'accepte (`accept_invitations` sous sa session) **Then** son arbre visible contient
  `private/<handle>/contexte`, et le rail rend la section « Privé », sa ligne « Contexte · Privé » en tête.

### Lot b — L'admin voit dans le rail les équipes dont il est membre

- [ ] **AC-b1 — Arbre de membre (reproduction).** **Given** l'admin Ada de l'organisation de
  référence, membre d'aucune équipe, et une règle d'organisation en lecture sur `support/faq`
  **When** `visibleTree(db, Ada)` **Then** l'arbre porte les nœuds de « Tout le monde »,
  `support/faq`, et aucun autre nœud de `ventes` ni de `support`. Le calcul est celui d'un membre :
  `nodeLevels` sur l'identité d'Ada sans le pouvoir d'administrateur (HN-E11S10-5, validée).
- [ ] **AC-b2 — Ses droits ne changent pas.** **Given** le même cas **Then** `nodeLevels(db, Ada,
  [ventes/devis])` rend 3 (gestion) ; la page `/n/ventes/devis` s'ouvre par son adresse, son fil dit
  « Ventes » puis le segment des ancêtres hors de l'arbre (`ui/noeud/fil.ts` l. 94-106) ; `find` la
  trouve ; l'écran Équipes liste toutes les équipes.
- [ ] **AC-b3 — S'ajouter à une équipe.** **Given** Ada ajoutée à Ventes (dialogue « Les personnes
  de Ventes » ou menu de sa ligne) **When** `visibleTree` est relu **Then** les nœuds de Ventes y
  sont, et le rail rend la section « Ventes ».
- [ ] **AC-b4 — Un membre ne voit aucune différence.** **Given** Claire (membre, responsable de
  Ventes) **Then** son arbre est celui d'aujourd'hui (test AC36 de
  `tests/unit/nodes-personal-tree.test.ts` l. 154-172, vert sans retouche).

### Lot c — Le créateur d'une équipe en est le responsable

- [ ] **AC-c1 — Inscription (reproduction).** **Given** Ada, admin membre de l'organisation **When**
  `createTeam` **Then** dans la même transaction que la ligne `teams`, `team_members` reçoit
  `(équipe, Ada, 'lead')` ; `listTeams` la rend responsable. **And** un refus (`name_taken`,
  `path_taken`) n'écrit aucune ligne. **And** la relecture qui suit la création
  (`ui/equipes/creation-d-equipe.tsx` l. 51-52) montre la section de l'équipe dans son rail.
- [ ] **AC-c2 — Accès plateforme sans ligne `members`.** **Given** une identité `viaGrant` (S,
  `tests/helpers/reference-org.ts` l. 36) **When** `createTeam` **Then** l'équipe est créée et
  `team_members` ne reçoit rien : la policy `team_members_insert_admin` (MIG l. 3118-3121) exige une
  ligne `members` et ferait échouer toute la création.
- [ ] **AC-c3 — Texte du MCP admin.** **Given** `admin_team {"op": "create"}` sans `email`, par un
  membre de l'équipe plateforme membre de l'organisation **Then** le texte finit par
  `, lead <nom> <email> (you).` au lieu de `, no lead yet.` ; par une identité `viaGrant`, il reste
  `, no lead yet.` **And** avec `email` : texte inchangé, la personne nommée est la seule
  responsable, le créateur reste membre (`setSoleLead`, HN-E11S10-9).
- [ ] **AC-c4 — Ce que sert l'assistant du créateur.** **Given** l'équipe créée **When** le créateur
  appelle `context` **Then** la ligne des équipes la cite « (lead) » et le Contexte de l'équipe est
  servi (`server/context/blocks/person.ts` l. 15-17, `contexts.ts` l. 96-101), et la vue « Contexte »
  (lot f) en montre la partie.

### Lot d — Retiré le 2026-09-29, le Contexte reste dans le rail

Le rail garde, comme aujourd'hui, la ligne « Contexte · <section> » en tête de chaque section, son
« + » et le glisser-déposer sous un Contexte (HN-E11S10-13). Aucun AC ; les lettres des autres lots
ne changent pas.

### Lot e — Menu « Contexte », route `/context`, accueil

- [ ] **AC-e1 — Entrée du menu.** **Given** un hôte qui donne `adresses.contexte` **When** la
  personne ouvre le menu du compte **Then** il porte « Contexte », « Profil », « Brancher un
  assistant », « Corbeille », puis « Déconnexion » ; « Contexte » (glyphe `Info`) navigue vers
  `/context`. **And** la palette propose « Contexte » sous « Aller à ». **And** sans
  `adresses.contexte`, aucune entrée (HN-E11S10-18).
- [ ] **AC-e2 — La route.** **Given** une personne connectée **When** elle ouvre `/context` **Then**
  l'en-tête « Contexte » puis la vue, lue comme l'onglet d'aujourd'hui : `previewContext` sans
  phrase, puis chaque Contexte servi par `loadNode`, `not_found` omis. **And** `metadata` : titre
  « Contexte », `robots: { index: false }`. **And** sans session : `/login` ; autre refus d'identité :
  `/aucune-organisation` ; panne de l'identité : l'écran le dit une fois, « Réessayer » vers
  `/context`. **And** pendant les lectures : `EcranDuContexteChargement` (`role="status"`,
  `aria-busy`).
- [ ] **AC-e3 — L'accueil sans onglet.** **Given** `/` **Then** l'îlot principal s'intitule
  « Activités » (`h2`), sans `tablist` ; le premier jour et le fil ne changent pas. **And**
  `/?onglet=contexte` rend l'accueil comme `/` et n'appelle ni `previewContext` ni `loadNode`
  (HN-E11S10-19).
- [ ] **AC-e4 — Liens vers la vue.** **Given** la page d'un Contexte **Then** chaque ligne de son
  encart mène à `/context#<ancre>` (`CONTEXTE_SERVI` de `n/[...chemin]/page.tsx` l. 67).

### Lot f — Vue « Contexte »

- [ ] **AC-f1 — Têtes cachées.** **Given** une partie de Contexte, Tout le monde, Privé ou équipe
  **Then** la vue n'en montre ni l'en-tête, ni les faits, ni les connecteurs : ni « Organisation:
  Démo. », ni « You: … », ni « Team <nom>. Lead: … », ni ligne « Connecteur … » (HN-E11S10-14).
  **And** `previewContext(…).text` est inchangé (`context-full.test.ts` l. 103, `mcp-core.test.ts`
  l. 152 et 205, `context-blocks.test.ts` l. 232).
- [ ] **AC-f2 — Partie sans corps.** **Given** une partie que la personne ne peut pas écrire et dont
  rien n'est servi après la tête **Then** elle dit « L'assistant ne reçoit rien de ce contexte pour
  l'instant. » (`CONTEXTE_SERVI.vide`). **And** une partie écrivable montre son éditeur.
- [ ] **AC-f3 — Sans « Modifier dans Profil ».** La partie Privé ne porte plus ce lien ;
  `ContexteServi` et `EcranDAccueil` n'ont plus de prop `hrefDuProfil`.
- [ ] **AC-f4 — Sans « Règles Oto ».** **Given** un rapport qui sert le bloc `code` **Then** la vue
  ne rend aucune partie pour lui. **And** chaque autre partie garde son ancre, calculée sur son rang
  d'origine (`partie-<n>` inchangé).
- [ ] **AC-f5 — « Nouveautés » toujours là** (ex-AC-b2 d'E11-S05). **Given** un rapport servi sans
  bloc `news` **Then** la vue rend une section `id="nouveautes"`, titrée « Nouveautés », avec
  « Aucune nouveauté n'est servie à l'assistant en ce moment. », après la dernière partie de
  Contexte et avant les procédures. **And** avec un bloc `news`, la section est celle d'aujourd'hui,
  sans doublon. **And** l'encart d'un Contexte ne change pas.
- [ ] **AC-f6 — L'ancre suivie** (ex-AC-b3 d'E11-S05). **Given** la vue montée **When** l'adresse
  porte `#<ancre>` au montage, ou quand un `hashchange` survient **Then** `VersLaPartie` amène
  l'élément à l'écran. **And** une ancre sans élément amène le haut de la vue, jamais une erreur.
  **And** l'écouteur est retiré au démontage.
- [ ] **AC-f7 — Égale au texte servi.** **Given** une personne membre de la seule équipe Ventes,
  administratrice de l'organisation **Then** la vue montre la partie « Contexte : équipe Ventes » et
  aucune autre équipe (`equipes: identity.teams`, inchangé).

### Lot g — Page d'un Contexte

- [ ] **AC-g1 — Encart sans titre visible.** **Given** la page d'un Contexte **Then** l'encart des
  couches n'a plus de titre visible (aucun `.oto-note-head`) ; son nom accessible reste « Voici ce que
  votre agent va lire » (`aria-label`), sa liste « Ordre de lecture » ne change pas, en lecture comme
  en échec (HN-E11S10-16).
- [ ] **AC-g2 — Sans « Règles Oto ».** La liste des couches saute le bloc `code` ; les autres lignes
  gardent leur ancre sur leur rang d'origine.
- [ ] **AC-g3 — Sans phrase de recharge.** **When** un Contexte se publie depuis son éditeur (page ou
  vue) **Then** « Les conversations en cours rechargeront le contexte. » ne paraît pas. **And** la
  question d'un Contexte vide ne change pas.

## Implémentation

### Migrations prévues

`migrations/<horodatage>_private_spaces.sql`, additive, réunie au fichier de la version (D124) :
1. `platform.ensure_private_space(p_org uuid, p_user uuid) returns void`, `security definer`,
   `set search_path to ''`, `revoke all … from public`, aucun `grant`. Corps : le dossier `private`,
   sinon `return` ; la ligne `members`, sinon `return` ; handle absent → `unique_handle(p_org,
   members.email)` écrit dans `profile` ; puis le corps actuel du déclencheur (e05s13 l. 298-331 :
   renumérotation si alias, espace, Contexte, `on conflict do nothing`).
2. `create or replace function platform.members_tree_sync()` : `perform
   platform.ensure_private_space(new.org_id, new.user_id); return null;`, puis son `revoke` redit.
   Le déclencheur (AFTER INSERT) ne change pas : aucun `drop`.
3. Réparation : un bloc `do` qui boucle sur `members` une ligne à la fois (`unique_handle` doit voir
   les handles posés aux tours précédents) et appelle `ensure_private_space`.

`pnpm check:migrations` admet ces trois instructions (`cli/migrations-check.mjs` l. 100, 143-150).
Aucune table, colonne, policy ni index.

### Fichiers à créer

- La migration ci-dessus.
- `ui/contexte/ecran-du-contexte.tsx` (Server Component) : `EcranDuContexte` reçoit
  `Resultat<DonneesDuContexteServi>`, `Lien`, `prefixeDesPages`, `ici` ; rend `ScreenHeader`
  « Contexte » (glyphe `Info`) puis `ContexteServi`, ou l'échec ; `EcranDuContexteChargement`. Ce qui
  casse sans lui : la route n'aurait ni en-tête du paquet ni chargement (`portage-ecrans.md § 4`).
- Hôte : `src/app/(dashboard)/context/page.tsx` : session revérifiée, `lireLeContexte` déplacée de
  `src/app/(dashboard)/page.tsx` (l. 80-110), `<Suspense>`, `metadata`.
- Aucun schéma Zod : aucune chaîne servie n'est relue de plus.

### Fichiers à modifier

Serveur et MCP :
- `server/nodes/tree.ts` : `visibleTree` passe à `nodeLevels` l'identité de membre (fonction locale :
  `member.role` à `member`, `isStaff` et `hasOpenGrant` à `false`) ; commentaires l. 1-5, 22-28.
- `server/teams.ts` : `createTeam`, après l'insertion, `if (!identity.viaGrant) await
  setSoleLead(sql, team.id, identity.user.id)` (l. 155-161) ; commentaire l. 115-118.
- `mcp/admin/tools/team.ts` l. 81-87 : le texte d'AC-c3.

Écrans du paquet :
- Rail (`ui/coque/sections-du-rail.tsx`, `arbre-du-rail.tsx`, `gestes-du-rail.tsx`) : aucun
  changement (lot d retiré).
- `ui/coque/ecrans.ts` (entrée `contexte`, rangement `compte`, glyphe `Info`, avant `profil`, l. 38),
  `ui/coque/types.ts` (`AdressesDuRail.contexte`, l. 10-31), `ui/coque/libelles.ts`
  (`COMPTE.contexte`, l. 28-33).
- `ui/accueil/ecran-accueil.tsx` : `OngletOuvert` et `IlotPrincipal` (l. 66-102) laissent place à un
  îlot « Activités » (`IslandHead`, `IslandBody`) ; props `onglet`, `hrefDOnglet`, `hrefDuProfil`
  (l. 50-55) retirées. `ui/accueil/types.ts` : `ONGLETS_DE_L_ACCUEIL` (l. 8-10) et `contexte`
  (l. 26-27) retirés. `ui/accueil/libelles.ts` : `ACCUEIL.ilot` devient « Activités », `onglets` et
  `ONGLETS` (l. 10-19) retirés.
- `ui/contexte/contexte-servi.tsx` : `Faits` (l. 78-82) et son appel (l. 128), le lien Profil
  (l. 129-133), `hrefDuProfil` (l. 61-62) et `Regles` (l. 166-186) retirés ; `Parties` (l. 204-219)
  saute `name === "code"` en gardant le rang d'origine, insère la section de repli d'AC-f5 ;
  conteneur repéré pour AC-f6 ; phrase d'AC-f2 dans `CorpsDuContexte`.
- `ui/contexte/libelles.ts` : `CONTEXTE_SERVI.profil` (l. 91) retiré, `vide` et `aucuneNouveaute`
  ajoutés ; `REGLES_OTO` (l. 125-142) et `PUBLICATION_DU_CONTEXTE.recharge` (l. 146) retirés.
- `ui/contexte/listes-servies.tsx` (`Regles`, l. 91-101 et 118-119) et
  `ui/contexte/parties-du-contexte.ts` (morceau `regles` l. 119-120, lecteur l. 252-262 et 269,
  `teteSansEnTete` l. 281-288) : morts, retirés (HN-E11S10-15).
- `ui/contexte/vers-la-partie.tsx` : `hashchange`, repli, nettoyage (AC-f6).
- `ui/contexte/apercu-du-contexte.tsx` : `Couches` (l. 58-74) saute `code` ; `NotePanel` sans
  `title`, `aria-label={APERCU_DU_CONTEXTE.titre}` (l. 79, 85).
- `ui/noeud/publication.tsx` : `setStatut` (l. 110), l'état `statut` (l. 86, 168, 172) et le
  `<p role="status">` qu'il nourrit seul (l. 175-178) retirés.
- `ui/index.ts` : export d'`EcranDuContexte`, `EcranDuContexteChargement` ; `ONGLETS_DE_L_ACCUEIL` et
  `OngletDeLAccueil` (l. 84-86) retirés.
- Commentaires qui citent `/?onglet=contexte` : `annexes-du-contexte.tsx` l. 38,
  `apercu-du-contexte.tsx` l. 45, `vers-la-partie.tsx` l. 2.

Hôte :
- `src/app/(dashboard)/page.tsx` : schéma d'onglet et `hrefDOnglet` (l. 56-60), `hrefDuProfil`
  (l. 70), lecture du Contexte (l. 117) et `onglet` (l. 131-147) retirés ; `searchParams` n'est plus lu.
- `src/app/(dashboard)/layout.tsx` : `ADRESSES.contexte = "/context"` (l. 27-37).
- `src/app/(dashboard)/n/[...chemin]/page.tsx` : `CONTEXTE_SERVI = "/context"` (l. 67).
- `scripts/demo/` : aucun changement (HN-E11S10-12).

### Patterns à suivre

- `database-patterns.md § Règles` : fonction re-versionnée à signature identique, privilèges redits ;
  test sauté tant que la migration n'est pas au projet (`tests/helpers/pending-migrations.ts`).
- `security-patterns.md § Droits dans le service` : l'arbre de membre n'ouvre jamais plus que les
  droits réels ; toute décision d'accès reste `nodeLevels` sur l'identité réelle.
- `mcp-patterns.md § 4` : texte du MCP admin en anglais, court.
- `portage-ecrans.md § 0` (un écran hors de l'arbre s'ouvre depuis les menus du rail), `§ 4`
  (quatre états de `/context` ; la partie vide dit une phrase).
- `accessibility-patterns.md § ARIA` : une note sans titre visible garde un nom accessible.

## Rayon d'impact

### Appelants
- `visibleTree` : `rg -n "visibleTree\(" C:/apps/oto-pkg/packages/plateforme C:/apps/oto-pkg/src` →
  `src/lib/plateforme/lectures.ts` l. 11 (seul appelant), lu par `rg -n "lireLArbre\("
  C:/apps/oto-pkg/src` → le layout (l. 65 : rail et palette) et `n/[...chemin]/page.tsx` l. 151 (fil,
  destinations d'un déplacement). Pour un admin, les trois perdent les équipes dont il n'est pas
  membre ; pour un membre, rien ne change. Aucun service MCP ne lit `visibleTree`.
- `createTeam` : `rg -n "createTeam\(" C:/apps/oto-pkg/packages/plateforme --glob "!**/*.test.ts"` →
  `api/teams.ts` l. 20 et `mcp/admin/tools/team.ts` l. 81. Tests : `rg -n "createTeam\("
  C:/apps/oto-pkg/tests` → `equipes-services.test.ts` l. 82-156 (aucun n'attend une équipe vide :
  `rg -n "members: \[\]|no lead yet" C:/apps/oto-pkg/tests` ne trouve rien) ;
  `mcp-admin-ops.test.ts` l. 374-376 ; la fixture `fx.createTeam` (insertion directe, non touchée).
- `members_tree_sync` : `rg -n "members_tree_sync" C:/apps/oto-pkg/packages/plateforme/migrations
  C:/apps/oto-pkg/tests C:/apps/oto-pkg/scripts` → MIG l. 745 et 2752, `…_platform_private.sql`
  l. 141, e05s13 l. 283 ; tests `espace-prive.test.ts`, `annuaire-sql.test.ts` (AC-a4).
- Insertions dans `members` : `rg -n "into platform.members" C:/apps/oto-pkg/packages
  C:/apps/oto-pkg/scripts C:/apps/oto-pkg/tests` → `accept_invitations` (inchangé), la graine de la
  Démo et `bare-postgres-smoke.sql` (organisation sans `private` à ce moment : inchangés), et 99
  lignes de tests (`rg -n "addMember\(|into platform.members" C:/apps/oto-pkg/tests | wc -l`). Une
  fixture qui insère sans handle dans une organisation qui a `private` (`createTree`,
  `tests/helpers/plateforme.ts` l. 241-249) reçoit désormais un handle et un espace : un test qui
  compare `profile` à `{}` ou compte les nœuds s'y ajuste ; `pnpm verify` le dit.
- `sectionsDeLArbre` : `rg -n "sectionsDeLArbre\(" C:/apps/oto-pkg/packages/plateforme/ui` →
  `sections-du-rail.tsx` l. 132, `recherche-du-rail.tsx` l. 24, `noeud/fil.ts` l. 98 : non modifiée ;
  pour un admin, ses sections suivent l'arbre de membre (lot b), ligne de Contexte comprise.
- `ecransPermis` : `rg -n "ecransPermis\(" C:/apps/oto-pkg/packages/plateforme/ui` → pied du rail
  (l. 55), palette (l. 28), menu de l'entreprise (l. 52), fil de l'administration (l. 48) : ces deux
  derniers ne lisent que `suivi` et `reglages`.
- `AdressesDuRail` : `rg -ln "AdressesDuRail" C:/apps/oto-pkg/packages/plateforme/ui C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → 12 fichiers ; clé facultative, seul `layout.tsx` la donne.
- `EcranDAccueil` : `rg -n "<EcranDAccueil\b" C:/apps/oto-pkg/src C:/apps/oto-pkg/tests` → `page.tsx`
  l. 132 et 141, doublures `ecran-accueil.test.tsx` l. 78-90 et `e05s12-accueil.test.tsx` l. 53-63 :
  props retirées ; leur aide `panneau("Activités")` (`tabpanel`) lit l'îlot.
- `hrefDuProfil` : `rg -n "hrefDuProfil" C:/apps/oto-pkg/packages/plateforme/ui C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `contexte-servi.tsx`, `ecran-accueil.tsx`, `page.tsx` l. 70, et six doublures
  (`e05s11-contexte-servi` l. 73, `e05s12-contexte` l. 104, `e05s13-contexte` l. 114,
  `m71-listes-du-contexte` l. 40, `ecran-accueil` l. 87, `e05s12-accueil` l. 62) : prop retirée, sinon
  tsc refuse.
- Vue et encart : `rg -n "<ContexteServi\b|<AnnexesDuContexte|<VersLaPartie" C:/apps/oto-pkg/packages/plateforme/ui C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `ecran-accueil.tsx` l. 74 (part vers `ecran-du-contexte.tsx`), `n/[...chemin]/page.tsx` l. 174,
  `contexte-servi.tsx` l. 227, six montages de test (Tests attendus).
- `PUBLICATION_DU_CONTEXTE` : `rg -n "PUBLICATION_DU_CONTEXTE" C:/apps/oto-pkg/packages/plateforme/ui C:/apps/oto-pkg/tests`
  → `publication.tsx` l. 21, 110, 192, 194 ; `recharge` seule part. Code rendu mort :
  `rg -n "teteSansEnTete|REGLES_OTO|genre: \"regles\"" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → les fichiers cités, et `tests/unit/e05s13-lignes-servies.test.ts` l. 105-116 et 127.
- Textes servis : `rg -n "Organisation: |You: |Lead: " C:/apps/oto-pkg/packages/plateforme/server/context`
  → `blocks/org.ts` l. 29, `blocks/person.ts` l. 34, `blocks/team.ts` l. 67 : non modifiés.

### Doublons
- Création d'un espace : `rg -n "ensurePersonalSpace|ensureHandle|'private/' \|\|"
  C:/apps/oto-pkg/scripts C:/apps/oto-pkg/packages/plateforme/migrations` → le déclencheur, et
  `scripts/demo/30-arbre.mjs` l. 79-116. Verdict : `ensure_private_space` reprend le corps du
  déclencheur (fusion) ; le script garde le sien (organisation semée avant son dossier `private`).
- Inscrire un responsable : `rg -n "into platform.team_members" C:/apps/oto-pkg/packages/plateforme/server`
  → `setSoleLead` (l. 159) et l'ajout d'un membre (l. 379). Verdict : réutiliser `setSoleLead`.
- Masquer des équipes : `.method/conventions/component-registry.md` et
  `rg -n "isOrgAdmin|callerOf" C:/apps/oto-pkg/packages/plateforme/server/access-levels.ts` →
  `callerOf` (l. 86-94) dérive le pouvoir d'admin de l'identité. Verdict : réutiliser, en passant une
  identité de membre ; aucun paramètre nouveau à `nodeLevels`.
- Registry, lignes 58-61, 102-103 (`PiedDuRail`, `ecransPermis`, `AnnexesDuContexte`,
  `ContexteServi`) : tous étendus en place, rien de recréé ; `SectionsDuRail` et `RailSection` ne
  changent pas (lot d retiré).
- Écran d'une route : `rg -n "export function Ecran[A-Za-z]*Chargement" C:/apps/oto-pkg/packages/plateforme/ui`
  → une paire par écran. Verdict : `EcranDuContexte` suit ce modèle et monte `ContexteServi` tel quel.
- Titre caché, nom gardé : `NotePanel` prend `aria-label` (`note-panel.tsx` l. 14-16). Verdict :
  réutiliser.
- Onglets : `rg -n "<Onglets" C:/apps/oto-pkg/packages/plateforme/ui` → accueil et équipes ; l'accueil
  n'en a plus, les équipes le gardent.

### Effet produit
- **Schéma `platform`** : Ⓜ ; la réparation crée, chez chaque hôte qui applique 1.0.1, l'espace
  manquant de ses membres (ligne du `### Hosts` du `CHANGELOG.md` du paquet, écrite par le pilote).
- **Rail** : toutes les pages du groupe `(dashboard)`, et un ERP qui monte `SectionsDuRail` seul
  (ADR-008 § 7) : un admin ne voit plus de section, ni sa ligne de Contexte, pour une équipe dont il
  n'est pas membre. La ligne « Contexte · <section> », son « + » et le glisser-déposer restent (lot d
  retiré, HN-E11S10-13) : fiche D110 et dépôts d'E10-S01 inchangés.
- **Fil et déplacement d'un admin** (Appelants) ; l'écran Équipes, inchangé.
- **Menu du compte, palette** : une entrée de plus pour tout membre.
- **Nouvelle route `/context`** : protégée par le middleware (absente de `PUBLIC_ROUTES`,
  `src/middleware.ts` l. 9), `noindex`. E11-S07 doit ajouter `context` aux segments admis (AC-d1),
  retirer la ligne « Accueil » de sa correspondance et AC-b1, écrire AC-c1 sur `/context#<ancre>`
  sans le lien « Règles Oto » ; l'ancre `rules` (HN-E11S07-11) n'a plus d'usage.
- **Accueil** : un îlot ; `?onglet=` ignoré. Aussi touché par E11-S02 (verbes d'activité), zones
  distinctes.
- **Page d'un Contexte** : encart allégé, liens vers `/context`. E11-S05 (lot e) touche
  `annexes-du-contexte.tsx` : fusion dans l'ordre de la vague. **Publication** (`publication.tsx`) :
  aussi E11-S02 (dont la publication directe) et E11-S01 (lot g), zones distinctes.
- **Vue « Contexte »** : équipes d'`identity.teams`, comme le texte servi ; le créateur d'une équipe
  y voit désormais sa partie (lot c). La vue n'ajoute jamais d'équipe dont la personne n'est pas
  membre : elle cesserait de dire ce que lit l'assistant.
- **MCP** : liste d'outils inchangée ; `context` du créateur (AC-c4) ; un ctx déjà servi n'est pas
  invalidé par la nouvelle équipe (E11-S03), elle entre au `context` suivant ; texte d'`admin_team`
  (AC-c3).
- **Journal** : la création garde sa ligne `POST teams` ; l'inscription n'en a pas (même requête) ;
  portée inchangée (le créateur est admin : `org`, `server/journal-read.ts` l. 33-37).
- **RLS** : aucune policy nouvelle ; AC-c2 évite le refus de `team_members_insert_admin`. Aucun
  webhook ni e-mail.

### Refacto
- Écarté : retirer `ensureHandle` et `ensurePersonalSpace` de la graine de la Démo ; le déclencheur
  ne peut pas créer l'espace d'un membre inséré avant `private`.
- Écarté : un déclencheur sur `UPDATE OF profile` ; plus aucun chemin ne pose un handle après
  l'insertion (`update_my_profile` le refuse, `server/members.ts` l. 306).
- Écarté : garder `Onglets` avec un seul onglet ; un `tablist` d'un élément n'annonce rien d'utile.

## Hypothèses

- **HN-E11S10-1** (ex-HN-E11S11-1) : la cause du retour se lit dans les données (AC-a0) ; les AC
  corrigent les causes 1 et 2 pour toute ligne (source : code cité ; les causes 3 sont bloquées par
  les services).
- **HN-E11S10-2** (ex-HN-E11S11-2) : sans dossier `private`, le déclencheur reste silencieux, sans
  `raise` : un refus ferait échouer les fixtures d'une organisation nue (`tests/helpers/sql.ts`
  l. 74-88) et la fumée de `bare-postgres` ; `create_org` pose toujours `private` (e05s13 l. 265-270)
  (source : simple).
- **HN-E11S10-3** (ex-HN-E11S11-3) : le handle manquant se pose à l'insertion, depuis
  `members.email` (source : `docs/architecture.md` l. 93).
- **HN-E11S10-4** (ex-HN-E11S11-4) : aucune réparation à chaque connexion dans
  `accept_invitations` : la migration répare l'existant, le déclencheur le futur (source : § Justifier
  une surface nouvelle).
- **HN-E11S10-5** (ex-HN-E11S11-5), validée (le responsable d'Oto, 2026-09-29) : l'arbre des écrans d'un admin est celui d'un
  membre, calculé par le service : il y voit aussi une page d'équipe partagée avec lui, son équipe ou
  toute l'organisation, comme tout membre (source : décision 5, « par défaut il ne voit pas les
  équipes »). Option écartée : filtre d'écran strict, aucune section d'une équipe dont il n'est pas
  membre, pages partagées comprises (type `EquipeDuRail` étendu, `sectionsDeLArbre` qui exclut sans
  reclasser sous « Tout le monde »).
- **HN-E11S10-6** (ex-HN-E11S11-6) : la règle vaut pour tout écran qui lit `visibleTree` (rail, titres
  de la palette, fil, destinations d'un déplacement) ; « Dans le contenu » de la palette passe par
  `find` et trouve toujours ces pages (source : décision 5 ; droits inchangés).
- **HN-E11S10-7** (ex-HN-E11S11-7) : une identité `viaGrant` reçoit aussi l'arbre de membre : « Tout
  le monde » seulement (source : simple).
- **HN-E11S10-8** (ex-HN-E11S11-8) : inscription par `setSoleLead`, sauf `viaGrant` (source : D128,
  MIG l. 3118).
- **HN-E11S10-9** (ex-HN-E11S11-9) : `admin_team create` avec `email` : la personne nommée devient la
  seule responsable, le créateur reste membre ; la description de l'outil ne change pas (source :
  `set_lead`, E05-S13 AC-25).
- **HN-E11S10-10** (ex-HN-E11S11-10), validée (le responsable d'Oto, 2026-09-29) : rien ne relit
  le rail sans geste : une personne ajoutée à une équipe par un autre la voit au prochain chargement
  ou après son prochain geste (layout non rejoué à la navigation, `layout.tsx` l. 12-14). Option
  écartée : relire la page au
  retour sur l'onglet (`visibilitychange`, dans `fournisseur-de-rafraichissement.tsx` de l'hôte ;
  sans fournisseur, `useRafraichir` recharge le document, `ui/hote/rafraichir.ts` l. 8).
- **HN-E11S10-11** (ex-HN-E11S11-11) : pas de bouton « Rejoindre » : le dialogue des personnes d'une
  équipe et le menu de sa ligne font déjà le geste (source : § Justifier une surface nouvelle).
- **HN-E11S10-12** (ex-HN-E11S11-12) : `src/lib/plateforme/session.ts` ne change pas : un échec
  d'acceptation part déjà au log serveur (l. 164-169) (source : code cité).
- **HN-E11S10-13** (ex-HN-E11S10-1), tranchée (le responsable d'Oto, 2026-09-29) : le retrait des
  lignes de Contexte du rail (retour 4) est annulé ; le Contexte reste dans le rail comme
  aujourd'hui (ligne « Contexte · <section> », son « + », glisser-déposer) ; le lot d (ligne retirée,
  bouton info sur les en-têtes de section) est retiré de la story ; la fiche D110 ne change pas.
  Options écartées : ligne retirée et bouton info, avec ou sans dépôt sur le bouton.
- **HN-E11S10-14** (ex-HN-E11S10-2), tranchée (le responsable d'Oto, 2026-09-29) : toutes les lignes
  techniques sous chaque titre de la vue Contexte (organisation, personne, équipe, connecteurs) sont
  cachées à l'écran ; l'assistant les reçoit toujours (AC-f1). Option écartée : garder les lignes de
  connecteurs (ex-AC-b1 d'E11-S05, `faitsAffiches`, `SERVED_FACTS`).
- **HN-E11S10-15** (ex-HN-E11S10-3) : le code rendu mort part avec la story : `REGLES_OTO`, le
  morceau `regles`, les deux `Regles`, `teteSansEnTete` ; `SERVED_RULES` reste (servi par
  `blocks/code.ts`) (source : § Justifier une surface nouvelle).
- **HN-E11S10-16** (ex-HN-E11S10-4) : « Voici ce que votre agent va lire » reste le nom accessible de
  l'encart (source : `note-panel.tsx` l. 14-16 ; cinq fichiers de test le lisent).
- **HN-E11S10-17** (ex-HN-E11S10-5) : la phrase de recharge part avec l'état `statut` qu'elle seule
  remplissait (source : `publication.tsx` l. 175).
- **HN-E11S10-18** (ex-HN-E11S10-6) : « Contexte » en tête du menu du compte, glyphe `Info` ; clé
  `contexte` (identifiants français, E11-S07 Hors périmètre) (source : simple).
- **HN-E11S10-19** (ex-HN-E11S10-7) : l'accueil garde un îlot titré « Activités », sans barre
  d'onglets (source : `procedures-utiles.tsx` l. 33-44, même forme).
- **HN-E11S10-20** (ex-HN-E11S10-8) : un écran `EcranDuContexte` plutôt que `ContexteServi` exporté
  seul (un cran plus simple, écarté : l'hôte écrirait son propre en-tête et son chargement) ; titre
  sans phrase d'introduction (source : retours, moins de texte).
- **HN-E11S10-21** (ex-HN-E11S10-9) : ancres inchangées (`contexte-tout-le-monde`, `nouveautes`…) ;
  E11-S07 les renomme avec les autres (reprend HN-E11S05-7).
- **HN-E11S10-22** (ex-HN-E11S10-10, reprend HN-E11S05-6) : cause du lien « Nouveautés » perdu :
  section absente quand `newsBlock` rend `null` (`server/context/blocks/news.ts` l. 100-102,
  `server/context/index.ts` l. 102-109) ; la phrase d'AC-f5 vaut pour les trois cas d'absence.
- **HN-E11S10-23** (ex-HN-E11S10-11) : « À quoi sert cette page » repliable relève d'E11-S05 (lot e), qui
  traite les quatre encarts ensemble (source : décision 4).
- **HN-E11S10-24** (ex-HN-E11S10-12) : phrase de la partie vide, vraie qu'elle soit vide ou en
  brouillon (source : `portage-ecrans.md § 4`).

## Actions JB

- Aucune action externe. Le pilote applique la migration au projet de test (D124) et écrit la ligne
  `### Hosts` du `CHANGELOG.md` du paquet (réparation des espaces manquants à l'application de 1.0.1).
- Diagnostic AC-a0 : lecture seule sur l'organisation Démo du projet de test, par la connexion du
  `.env.local` ; relevé sans e-mail ni nom.
- Après le déploiement, la personne invitée se reconnecte : contrôle du responsable d'Oto.
- Aucun arbitrage ouvert (HN-E11S10-5, -10, -13 et -14 tranchées le 2026-09-29).

## Tests attendus

Les tests de reproduction (AC-a1, AC-a2, AC-b1, AC-c1) s'écrivent d'abord et échouent sur le code
actuel (CLAUDE.md § Garde-fous conditionnels).

### Unit tests
- [ ] `tests/unit/nodes-personal-tree.test.ts` (base réelle, organisation de référence) : AC-b1 ;
  dans le même test, AC-b2 (niveau 3 d'Ada sur `ventes/devis`) et AC-b3 (Ada avec Ventes).
- [ ] `tests/unit/mcp-admin-ops.test.ts` : AC-c3, texte comparé à l'octet, sans et avec `email`.
- [ ] `tests/unit/e05s13-lignes-servies.test.ts` : bloc « Règles Oto » (l. 105-116) et assertion
  `teteSansEnTete` (l. 127) retirés.

### Integration tests
- [ ] `tests/integration/espace-prive.test.ts` : AC-a1 ; AC-a2 (espace créé, second appel sans
  écriture, organisation sans `private`).
- [ ] `tests/integration/invitations.test.ts` : AC-a5, dans le cas d'acceptation existant.
- [ ] `tests/integration/equipes-services.test.ts` : AC-c1 (ligne `lead`, aucune ligne après un
  refus) ; AC-c2 (identité S).
- [ ] `rail-application.test.tsx` : menu du compte (l. 259-267 : « Contexte » d'abord,
  `naviguer("/context")`), AC-e1 ; les cas du Contexte dans le rail (ligne, dépôts, création sous
  un Contexte) verts sans changement.
- [ ] Nouveau `tests/integration/pages/contexte-page.test.tsx` : lectures déplacées
  d'`accueil-page.test.tsx` (l. 144-213), redirections, panne d'identité (AC-e2, AC-f7).
- [ ] `accueil-page.test.tsx` : `?onglet=contexte` ne lit rien du Contexte (AC-e3).
- [ ] `ecran-accueil.test.tsx` (l. 155-214) et `e05s12-accueil.test.tsx` (l. 53-63) : îlot
  « Activités », aucun `tablist`, props retirées (AC-e3).
- [ ] `e05s11-contexte-servi.test.tsx` (l. 73, 94, 105, 120-121, 145, 152) : ni tête ni lien Profil
  ni « Règles Oto » ; phrase vide ; `#nouveautes` de repli sans doublon ; `VersLaPartie` et
  `hashchange` (espion `scrollIntoView`) (AC-f1 à AC-f6).
- [ ] `e05s12-contexte.test.tsx` (l. 104-117, 132, 158-171, 186-210), `e05s13-contexte.test.tsx`
  (l. 114-115, 159-170), `m71-listes-du-contexte.test.tsx` (l. 40-41) : props et parties.
- [ ] `contexte.test.tsx` (l. 51, 109, 174, 190, 213, 223) et `noeud-page.test.tsx` (l. 292-293) :
  titre caché, nom gardé, sans « Règles Oto », sans recharge, liens `/context#…` (AC-e4, AC-g1 à g3).
- [ ] MCP, inchangés et verts : `context-full.test.ts` l. 103, `mcp-core.test.ts` l. 152 et 205,
  `context-blocks.test.ts` l. 232.

### E2E tests
- [ ] `accueil.spec.ts` (l. 98-110) : la vue ouverte par le menu du compte, à `/context`, 375 et
  1 280 px.
- [ ] `e05s12-contexte.spec.ts` (l. 105-125), `e05s13-retours.spec.ts` (l. 106-124),
  `procedure-et-contexte.spec.ts` (l. 190-191), `e05s10b.spec.ts` (l. 97) : réécrits.
- [ ] `rail.spec.ts` (l. 42-44), `page.spec.ts` (l. 138-145) : verts sans changement.
- [ ] `e05s12-rail-contexte.spec.ts` : vert sans changement (le Contexte reste dans le rail,
  HN-E11S10-13).
- [ ] Contrôle manuel sur l'hôte de démo : première connexion d'une personne invitée (« Privé »
  visible) ; rail d'un admin sans équipe, puis après « Ajouter quelqu'un ». Contrôle visuel, jour et
  nuit : sections, menu du compte, `/context`, page d'un Contexte.

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Notes
<!-- AC-a0 : relevé avant et après la migration (nombres par cas, sans e-mail ni nom), cause retenue. -->
