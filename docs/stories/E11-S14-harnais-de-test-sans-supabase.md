# Story E11-S14 — Harnais de test sans Supabase : les suites du paquet tournent sur un Postgres nu, seules celles de l'adaptateur Supabase gardent le projet

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | Aucun (story technique : outillage de test) |
| **Statut** | 🟢 Ready |
| **Priorité** | Should |
| **Référence UI** | N/A : aucun écran |
| **Conventions** | testing, supabase, security (lot c : `scripts/demo-seed.mjs`, `scripts/demo/**`) |
| **Estimation** | L (trois lots ; seize fichiers de test repris en tête, sans toucher une assertion ; un mode du script Démo) |
| **Vague** | E11, version 1.0.1 (fiche D131). Lot a dès maintenant, en parallèle d'E11-S03 et E11-S10 ; lot b après leur fusion ; lot c après E10-S04 et E10-S02, avant E11-S02 (§ Place dans la vague) |
| **Dépend de** | Aucune story. Ordre de fusion imposé par les fichiers communs (§ Place dans la vague) |
| **Porteuse de migration** | Non : ni `packages/` ni le schéma ne changent |

## Contexte

Décision du responsable d'Oto (2026-09-29) : le paquet est portable (ADR-012) ; le harnais de test ne
doit plus exiger le projet Supabase que pour les suites qui testent réellement l'adaptateur Supabase.

En base locale (`PLATFORM_TEST_DB=local`, `testing-strategy.md § Base de test locale`) et dans le job
`bare-postgres` (`.github/workflows/ci.yml` l. 98-102), 23 fichiers d'intégration se sautent en entier.
Ils sont gardés par `supabaseConfigured` (`tests/helpers/plateforme.ts` l. 18) ou `projectConfigured`
(`tests/helpers/sql.ts` l. 334) parce qu'ils créent leurs personnes par Supabase Auth
(`auth.admin.createUser`, `plateforme.ts` l. 613) et en tirent un jeton (`signIn` l. 628, `sessionFor`) :
c'est l'identité de l'hôte de référence, pas une dépendance du paquet.

Tout ce qu'il faut existe déjà :
- des personnes sans compte : `createSqlFixtures` (`tests/helpers/sql.ts` l. 118, M47) ;
- une vérification injectée : `makeVerifyToken({ jwks, issuer })` (`mcp/auth.ts` l. 207-211), option
  de `handlePlateforme` (`api/handler.ts` l. 258) et de `handleMcpPost` (`mcp/handler.ts` l. 145) ;
  précédent portable : `tests/integration/mcp-admin-handler.test.ts` l. 50 et 88 ;
- la traduction d'un sujet de la forme « supabase » en identifiant interne, sans `auth.users` :
  `platform.identity_for_caller()` (migration de base l. 522-526) ;
- un émetteur de test qui signe en mémoire : `testIssuer` (`tests/helpers/oidc-issuer.ts` l. 97).

La tâche de suite M24 (`status.md`) demandait « un signataire de jetons commun aux suites MCP et API » :
cette story le livre.

**Refs :** PRD sans objet (story technique). ADR-012 (ports identité et base) ;
`supabase-patterns.md § Couplage à Supabase` ; `testing-strategy.md § Base de test locale`, `§ Budget de tests`.

## Périmètre

- Une fabrique `createLocalFixtures` : personnes de `createSqlFixtures`, jeton signé localement,
  vérificateur à passer aux portes.
- Seize fichiers (A) sur Postgres nu, garde `sqlConfigured` ; deux gardent une partie sur le projet.
- Un mode OIDC du script Démo, pour semer la suite d'isolation sans Supabase Auth (lot c).
- Une garde machine : la liste des fichiers gardés par Supabase est fermée.

## Hors périmètre

- Mode sans Supabase d'`org:export`, `org:import`, `test:cleanup`, `oauth:clients` : leurs suites
  restent en B ; tâche de suite à ouvrir dans `status.md` par le pilote.
- Playwright et la campagne `t<hex>` (`tests/e2e/fixtures/campagne.ts`) : inchangés, mode Supabase.
- `CLAUDE.md` et `testing-strategy.md` : écrits par le pilote à la fusion (fichiers partagés,
  `vagues.md`) ; textes proposés plus bas.

## Classement des 23 fichiers

`rg -l "supabaseConfigured|projectConfigured|onProject\(" C:/apps/oto-pkg/tests/integration C:/apps/oto-pkg/tests/unit`
→ 26 fichiers : les 23 ci-dessous, et trois qui ne sautent qu'un `describe` de B et restent tels quels
(`oauth-consent-page.test.tsx`, `unit/server-oauth.test.ts` : serveur OAuth de Supabase ;
`platform-staff-script.test.ts` : le script en mode Supabase, son mode OIDC tourne déjà).

**(A) Testent le paquet** : personnes par `createSqlFixtures`, jeton local, garde `sqlConfigured`.
- `api-equipes`, `api-invitations`, `pilot-qualification` : routes de `handlePlateforme` (et MCP pour
  le pilote) ; dans `api-invitations`, le lien magique reste espionné (HN-E11S14-3).
- `context-full`, `feedback-prompts`, `mcp-connectors`, `mcp-core`, `mcp-procedures`, `mcp-read-write` :
  outils MCP par `InMemoryTransport` ; `connectMcp` passe les claims sans vérifier le jeton
  (`tests/helpers/mcp.ts` l. 72).
- `mcp-admin` : `openAdminRequest` reçoit les claims (l. 50), même raison.
- `mcp-http` : chaîne HTTP du MCP ; ses quatre `it` passent au vérificateur local ; la vérification d'un
  vrai jeton par la JWKS du projet devient un `it` explicite de B (HN-E11S14-4).
- `portabilite-schema` : AC3 à AC7 ; AC1 et AC2 lisent `auth.users` et `auth.oauth_*`, absents d'un
  Postgres nu (`cli/migrations-check.mjs` l. 105-108), et restent en B (HN-E11S14-5).
- `isolation/contenu`, `isolation/tables` (face SQL, `clientOf`), `isolation/api`, `isolation/mcp`
  (portes sous jeton) : seul le semis (`isolation/donnees.ts`, script Démo) exige Auth (lot c).

**(B) Testent l'adaptateur Supabase ou l'outillage à comptes Supabase** : gardent le projet.
- `data-api-platform` : le Data API du projet fermé au schéma `platform`.
- `oauth-consent`, `oauth-lectures`, `oauth-clients` : serveur OAuth de Supabase, schéma `auth`, API
  d'administration OAuth.
- `demo-seed` : le script en mode Supabase, compte E2E créé par l'API d'administration d'Auth.
- `test-cleanup` : le script liste et supprime des comptes Auth (`listUsers`, `deleteUser`).
- `org-transfer` : l'export lit les emails des comptes (`org-export.mjs` l. 47), l'import les apparie
  (`org-import.mjs` l. 54). Son `describe` AC14 (carte face aux tables, `information_schema` par
  `platform-tables.ts`) passe en A.

Bilan : 16 en A, 7 en B. Après la story, en base locale : 6 fichiers sautés en entier
(`data-api-platform`, `demo-seed`, `oauth-clients`, `oauth-consent`, `oauth-lectures`, `test-cleanup`)
et 6 fichiers mixtes (`org-transfer`, `mcp-http`, `portabilite-schema`, `oauth-consent-page`,
`platform-staff-script`, `unit/server-oauth`).

## Critères d'acceptation

Garde-fou « changement sans effet observable » (`CLAUDE.md § Garde-fous conditionnels`) : tests lus
avant ; seuls changent les imports, les gardes et noms de `describe`, la fabrique, l'obtention des
jetons et l'option `verifyToken`.

### Lot a — Le harnais et les suites sans conflit

- [ ] **AC-a1 — Jeton local.** **Given** `fx = createLocalFixtures()` et `p = await fx.createUser({ fullName })`
  **When** `await fx.sessionFor(p)` **Then** il rend `{ accessToken }`, signé par la clé de `testIssuer`,
  claims `sub = p.id`, `email`, `user_metadata.full_name`, `exp` à une heure. **And**
  `fx.verifyToken(request, accessToken)` rend `extra` `{ sub, email, name, iss, issuer_kind: "supabase" }` ;
  un jeton d'une autre clé, ou expiré, rend `undefined`.
- [ ] **AC-a2 — Portes sous jeton local.** **Given** une suite A sans variable Supabase **When** elle
  appelle `handlePlateforme(…, { accessToken, host, verifyToken: fx.verifyToken })` ou
  `handleMcpPost(…, { verifyToken: fx.verifyToken, … })` **Then** l'identité se résout par
  `identity_for_caller` ; sans l'option, 401 (`server/issuer.ts` l. 66). **And** après `fx.cleanup()`,
  aucune ligne `identities` ni `members` d'une personne du test (`forget_user`, migration de base l. 451).
- [ ] **AC-a3 — Lot a en A.** `api-equipes`, `api-invitations`, `mcp-admin`, `mcp-connectors`, `mcp-http`,
  `mcp-procedures`, `portabilite-schema` se gardent par `sqlConfigured` (`portable(...)`) ou
  `adminSqlConfigured`, et passent en base locale et dans `bare-postgres`.
- [ ] **AC-a4 — Aucune assertion perdue.** Sur les seize fichiers A :
  `git diff -U0 -w main -- <fichiers A> | rg '^-.*expect\('` ne rend rien ; les `expect(` ajoutés ne sont
  que ceux du `describe` B de `mcp-http` ; le nombre d'`it` de chaque fichier
  (`rg -c "\bit(\.skipIf\(.*\))?\(" <fichier>`) est égal avant et après, sauf `mcp-http` (+1). Aucun
  bloc déplacé ni réindenté : une partie qui reste sur le projet se garde en place.
- [ ] **AC-a5 — Le vrai jeton reste prouvé.** **Given** le projet configuré **When** `mcp-http` tourne
  **Then** un `describe` `onProject` ouvre une session du projet (`createFixtures().sessionFor`, pas `signIn` : `testing-strategy.md § Anti-patterns`, décision du pilote le 2026-09-29), la passe à
  `makeVerifyToken()` sans argument, et `initialize` répond 200. Sans le projet, lui seul se saute.
- [ ] **AC-a6 — Portabilité du schéma.** AC1 et AC2 de `portabilite-schema` portent
  `it.skipIf(!supabaseConfigured)`, leur nom dit pourquoi ; AC3 à AC7 tournent par `createSqlFixtures`.
- [ ] **AC-a7 — Liste fermée.** **Given** `tests/unit/gardes-supabase.test.ts` **When** un fichier de
  `tests/` (lu par `git ls-files`) importe `supabaseConfigured`, `projectConfigured`, `onProject`,
  `createFixtures` ou `authAdminClient` sans être dans la liste du test **Then** le test échoue en
  nommant le fichier. La liste porte les fichiers B et mixtes, chacun avec sa raison en une ligne.

### Lot b — Les suites partagées avec E11-S03 et E11-S10

- [ ] **AC-b1** — `mcp-core`, `context-full`, `feedback-prompts`, `pilot-qualification` et le `describe`
  AC14 d'`org-transfer` passent en A, sous AC-a2 et AC-a4 ; leurs lignes sortent de la liste d'AC-a7.

### Lot c — Le semis de l'isolation sans Supabase Auth

- [ ] **AC-c1 — Mode OIDC du script Démo (HN-E11S14-2, à confirmer).** **Given** `PLATFORM_OIDC_ISSUER`
  posée, `PLATFORM_ADMIN_DATABASE_URL` et `E2E_USER_EMAIL` seules **When**
  `node scripts/demo-seed.mjs --slug t<hex> --user <identifiant>` **Then** l'organisation est semée comme
  en mode Supabase, la personne `<identifiant>` administratrice et responsable de Ventes, email
  `E2E_USER_EMAIL`, nom « Compte E2E », sans appel à Auth ; code 0, aucune valeur imprimée. **And**
  `--user` sans `PLATFORM_OIDC_ISSUER`, ou mode OIDC sans `--user` : code 1 et la règle dite (comme
  `scripts/platform-staff.mjs` l. 225-228). **And** sans `PLATFORM_OIDC_ISSUER`, rien ne change.
- [ ] **AC-c2 — Isolation en A.** `isolation/donnees.ts` sème A et B par ce mode (`--user` de `a` et `b`),
  personnes par `createSqlFixtures`, jetons par `sessionFor` ; les quatre suites d'isolation passent en
  A sous AC-a2 et AC-a4 ; `isolation/api` passe `verifyToken`.
- [ ] **AC-c3** — `mcp-read-write` passe en A.

### Ensemble

- [ ] **AC-g1 — Ce qui se saute.** **Given** `PLATFORM_TEST_DB=local pnpm verify` **Then** le rapport de
  Vitest saute en entier exactement les six fichiers B, et, pour raison Supabase, exactement les parties
  B des six fichiers mixtes (§ Classement).
- [ ] **AC-g2 — CI.** `bare-postgres` fait passer les seize fichiers A ; `ci.yml` ne change pas (il lance
  déjà `tests/integration tests/unit` sans variable Supabase).
- [ ] **AC-g3 — Sur le projet aussi.** Sans `PLATFORM_TEST_DB`, les suites A tournent sur le projet
  (`sqlConfigured` y est vrai), sans créer de compte Auth (AC-a7 le tient).

## Implémentation

### Migrations prévues

Aucune : `identity_for_caller` sert tel quel. **Schémas Zod** : aucun.

### Fichiers à créer

- `tests/helpers/session-locale.ts` : `createLocalFixtures()` = `createSqlFixtures()` plus `sessionFor(user)`
  et `verifyToken` = `makeVerifyToken({ jwks: createLocalJWKSet(issuer.jwks), issuer: issuer.issuer })`,
  l'émetteur `testIssuer` créé au premier usage.
- `tests/unit/gardes-supabase.test.ts` (AC-a7).
- `tests/integration/session-locale.test.ts` (AC-a1, AC-a2), garde `sqlConfigured`.
- `tests/integration/demo-seed-oidc.test.ts` (lot c, AC-c1), garde `sqlConfigured`.

### Fichiers à modifier, par lot

- Lot a : `tests/helpers/oidc-issuer.ts` (champ `jwks` de `TestIssuer`, JWKS publique ; ajout seul) ;
  `tests/integration/{api-equipes,api-invitations,mcp-admin,mcp-connectors,mcp-http,mcp-procedures,portabilite-schema}.test.ts`.
- Lot b : `tests/integration/{mcp-core,context-full,feedback-prompts,pilot-qualification,org-transfer}.test.ts`.
- Lot c : `scripts/demo-seed.mjs` (variables exigées selon le mode, `--user`, `prepareOrg` sans sonde
  d'Auth en mode OIDC) ; `scripts/demo/10-identite.mjs` (`ensureE2eUser` : la personne de `--user`) ;
  `tests/integration/isolation/{donnees.ts,api.test.ts,contenu.test.ts,mcp.test.ts,tables.test.ts}` ;
  `tests/integration/mcp-read-write.test.ts`.
- Paquet (`ui/`, `schemas/`, `api/`, `mcp/`, `server/`, `migrations/`) et hôte (`src/`) : aucun changement.

### Surfaces nouvelles (`CLAUDE.md § Justifier une surface nouvelle`)

- `createLocalFixtures` : sans elle, aucune suite A n'a de jeton hors de Supabase Auth. Écarté, un cran
  plus simple : une clé locale par fichier (comme `mcp-admin-handler`), seize copies.
- Champ `jwks` de `TestIssuer` : sans lui, le vérificateur joindrait l'émetteur par un `fetch` remplacé.
  Écarté : `createRemoteJWKSet` sur ce `fetch`.
- `gardes-supabase.test.ts` : sans lui, une suite nouvelle recopie `createFixtures` et se saute en
  silence, comme les 23. Écarté : la règle en prose seule, contrôlée en revue.
- Mode OIDC du script Démo : sans lui, l'isolation ne se sème pas sans Auth. Écarté : isolation en B.

### Patterns à suivre

- `testing-strategy.md § Base de test` (données jetables, `cleanup` en `afterAll`) et `§ Anti-patterns`
  (clés et jetons tirés à l'exécution).
- Mode OIDC d'un script : `scripts/platform-staff.mjs` l. 19 et 223-230 (fiche D77 A).

## Rayon d'impact

### Appelants
- Fabrique : `rg -l "createFixtures\(\)" C:/apps/oto-pkg/tests` → 22 fichiers : le helper, 13 fichiers A
  (dont `isolation/donnees.ts`) qui passent à `createLocalFixtures` ou `createSqlFixtures`, 8 fichiers B
  inchangés. `SqlUser` n'a pas de `password` : `fx.signIn(user.email, user.password)` (`mcp-core` l. 66,
  `mcp-http` l. 54, `api-invitations` l. 87) devient `fx.sessionFor(user)`.
- Portes : `rg -n "handlePlateforme\(|handleMcpPost\(" C:/apps/oto-pkg/tests/integration` → dans les
  fichiers A, 6 appels (`api-equipes`, `api-invitations`, `mcp-http`, `pilot-qualification`,
  `isolation/api`) : chacun reçoit `verifyToken`. `connectMcp` (`tests/helpers/mcp.ts` l. 72) et
  `openAdminRequest` (`mcp-admin.test.ts` l. 50) passent les claims : inchangés.
- Émetteur : `rg -n "testIssuer\(" C:/apps/oto-pkg/tests` → `oidc-host.ts`, `emetteur-oidc.test.ts`,
  `unit/issuer.test.ts` : un champ de plus, aucun appelant changé.
- Script Démo : `rg -l "E2E_USER_EMAIL|--slug" C:/apps/oto-pkg/tests C:/apps/oto-pkg/scripts` → specs
  Playwright et `e2e/fixtures/campagne.ts`, `demo-seed` (unitaire et intégration), `org-transfer`,
  `isolation/donnees.ts` : seul `donnees.ts` passe au mode OIDC ; le mode par défaut ne change pas.
- Après la story, la commande du § Classement rend 12 fichiers : 6 sautés en entier, 6 mixtes.

### Doublons
- `component-registry.md` l. 213 et 218 : `createSqlFixtures`, `asCaller`, `portable`. Verdict :
  réutiliser ; `createLocalFixtures` n'ajoute que le jeton.
- Signataires : `rg -l "generateKeyPair|new SignJWT" C:/apps/oto-pkg/tests` → `oidc-issuer.ts` et six
  tests (`mcp-admin-handler`, `unit/{api-token,issuer,mcp-auth,mcp-handler,verified-caller}`). Verdict :
  réutiliser `testIssuer` ; laisser les six, qui testent le vérificateur avec des clés et claims choisis.
- Mode sans Supabase d'un script : `rg -n "OIDC_VARIABLE" C:/apps/oto-pkg/scripts` → `platform-staff.mjs`.
  Verdict : reprendre le motif (même variable, même `--user`), sans module commun (trois lignes).

### Effet produit
- Paquet, schéma `platform`, RLS, outils MCP, connecteurs, hôte : aucun changement.
- CI : `bare-postgres` fait tourner seize fichiers de plus, dont l'isolation (`SETUP_TIMEOUT` 300 s).
- Fusion : moins de fichiers relancés sur le projet, moins de comptes jetables sur le projet partagé
  (Supabase Auth limite les connexions par adresse IP, `plateforme.ts` l. 637).
- Script Démo (outillage de l'hôte de référence) : un mode de plus, le mode par défaut intact.

### Refacto
- Écarté : retirer `createFixtures` (les suites B en ont besoin).
- Écarté : fusionner `mcp-http` dans `mcp-core`, prévu par l'en-tête de `mcp-http` (E11-S03 modifie `mcp-core`).
- Écarté : mode sans Supabase d'`org:export`, `org:import`, `test:cleanup` (hors périmètre).

## Place dans la vague

Fichiers communs (`git -C C:/apps/oto-pkg/.claude/worktrees/<nom> status --porcelain`, et chemins cités
par les stories) :
- E11-S03 (en développement) : `mcp-core.test.ts`, `tests/helpers/plateforme.ts` modifiés ; sa story
  cite `org-transfer.test.ts`, `demo-seed.test.ts`.
- E11-S10 (en développement) : sa story cite `context-full.test.ts`, `mcp-core.test.ts`,
  `tests/helpers/{plateforme,sql,reference-org}.ts` ; `scripts/demo/` inchangé (HN-E11S10-12).
- E10 (worktree `e10`) : `mcp-read-write.test.ts` modifié (E10-S04) ; E10-S02 cite
  `isolation/{tables.test.ts,donnees.ts}` et `org-transfer.test.ts`.
- E11-S02 (vague 4) : `isolation/contenu.test.ts`, `mcp-read-write.test.ts`.

Cette story ne modifie ni `plateforme.ts` ni `sql.ts` ; `oidc-issuer.ts` est son seul helper modifié,
par ajout seul. Ordre proposé :
1. **Lot a tout de suite**, en parallèle d'E11-S03 et E11-S10 : aucun fichier commun.
2. **Lot b après la fusion d'E11-S03 et E11-S10** (`mcp-core`, `context-full`, `org-transfer`).
3. **Lot c après E10-S04 et E10-S02, avant E11-S02** (`mcp-read-write`, `isolation/*`). Si E11-S02
   part avant, ses fichiers d'isolation (quelques lignes en tête) se réconcilient à trois voies.

## Hypothèses

- **HN-E11S14-1** : l'identité de test est un jeton de la forme « supabase » du port (`sub` = identifiant
  interne), signé par une clé locale, vérifié par `makeVerifyToken({ jwks, issuer })` injecté ; les
  personnes viennent de `createSqlFixtures` ; aucun service joint (source : ADR-012, vérification
  injectée ; `mcp/auth.ts` l. 207-210 ; précédent `mcp-admin-handler.test.ts`). Écarté : le mode OIDC,
  où `identity_for_caller` n'admet qu'un sujet déjà lié, un email du staff ou une invitation ouverte
  (migration de base l. 527-538), où l'invitation part par SMTP (`server/invitations.ts` l. 248) et où
  le `fetch` global est remplacé : les assertions d'`api-invitations` changeraient.
- **HN-E11S14-2 (à confirmer)** : l'isolation se sème par un mode OIDC du script Démo, sur le motif de
  `platform:staff` (fiche D77 A), `--user` exigé (une personne sous un identifiant tiré au hasard ne
  serait jamais reliée à un sujet OIDC). Alternative : les quatre suites d'isolation restent en B
  (10 fichiers sautés au lieu de 6). À confirmer : surface ajoutée à un script d'exploitation.
- **HN-E11S14-3** : `api-invitations` pose `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  par `vi.stubEnv` (adresse en `.invalid`), `signInWithOtp` restant espionné : le client se construit
  (`invitations.ts` l. 142-146), rien n'est joint, les assertions sur le lien magique restent (source :
  simple).
- **HN-E11S14-4** : la vérification par la JWKS du projet, implicite dans `mcp-http`, devient un `it` de B
  explicite (source : AC-a4 ; seul test d'intégration qui la faisait).
- **HN-E11S14-5** : AC1 et AC2 de `portabilite-schema` restent en B, entiers ; la moitié portable d'AC1
  (colonnes `uuid`) n'est pas détachée (source : garde-fou « changement sans effet observable » ;
  `check:migrations` tient déjà l'absence de clé vers `auth.users`).

## Textes proposés (écrits par le pilote à la fusion)

`CLAUDE.md § Vérifier, commiter, pousser`, puce « Base de test locale », remplacée par :
« `PLATFORM_TEST_DB=local` dans la copie de `.env.local` et `pnpm db:local` font tourner les tests sur
un Postgres 16 du poste ; seules les suites de l'adaptateur Supabase s'y sautent (Auth, serveur OAuth,
Data API, outillage à comptes). À la fusion sur `main` : `PLATFORM_TEST_DB=local pnpm verify` écrit le
reçu et, en parallèle, les fichiers que ce passage a sautés (sa ligne « skipped ») tournent sur le projet
par `vitest run <ces fichiers>` sans la variable ; le commit attend les deux verts
(`testing-strategy.md § Base de test locale`). »

`testing-strategy.md § Base de test locale`, puce « Ce qui se saute en local », remplacée par :
« Ce qui se saute en local (comme dans `bare-postgres`) : les suites de l'adaptateur Supabase seules,
liste fermée dans `tests/unit/gardes-supabase.test.ts` (Data API, serveur OAuth et schéma `auth`,
scripts à comptes Auth). Une suite du paquet prend ses personnes dans `createSqlFixtures`, ses jetons
dans `createLocalFixtures` (`sessionFor`, `verifyToken` passé à la porte) et se garde par
`sqlConfigured` : un jeton de Supabase Auth ne prouve rien du paquet qu'un jeton signé localement ne
prouve. Les suites sautées restent « toujours testées » (§ Budget de tests) : relancées sur le projet à
la fusion. »

## Actions JB

- Aucune action externe. Le pilote confirme HN-E11S14-2 et ouvre la tâche de suite des scripts à comptes.

## Tests attendus

### Unit tests
- [ ] `tests/unit/gardes-supabase.test.ts` : liste fermée des fichiers B et mixtes (AC-a7).

### Integration tests
- [ ] `tests/integration/session-locale.test.ts` : jeton local et son `extra` ; jeton d'une autre clé et
  jeton expiré refusés ; une route de `handlePlateforme` servie sous `verifyToken` ; aucune ligne
  `identities` ni `members` des personnes après `cleanup` (AC-a1, AC-a2).
- [ ] `tests/integration/demo-seed-oidc.test.ts` : semis en mode OIDC ; `--user` exigé en mode OIDC,
  refusé hors de lui ; aucune valeur imprimée (AC-c1).
- [ ] `mcp-http`, `describe` B : vrai jeton, `makeVerifyToken()` sans argument (AC-a5).
- [ ] Les seize fichiers A, inchangés hors fixture (AC-a4), verts en base locale et dans `bare-postgres`.

### E2E tests
- Sans objet : aucun écran, campagne Playwright inchangée.

## Post-implémentation

### Écarts avec l'architecture

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Notes
