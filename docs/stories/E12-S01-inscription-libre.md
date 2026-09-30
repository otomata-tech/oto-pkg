# Story E12-S01 — Inscription libre : une personne vérifiée crée son organisation

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E12 — Offres de l'hôte : inscription et capacités |
| **Parcours** | Nouveau : inscription d'une organisation en libre-service (hôte qui l'active) ; 4.1 Arriver (entrée par invitation inchangée) |
| **Statut** | ✅ Done — livrée pour la 1.2.0, non publiée, non commitée à l'écriture de ces lignes |
| **Priorité** | Must (le SaaS n'ouvre l'offre gratuite qu'après elle) |
| **Référence UI** | Description : écran « Créer votre organisation » sur le style du paquet (`CoquilleOto`, tokens `text-ink`, `text-mute`), un champ Nom, l'adresse et le préfixe proposés dessous et modifiables, l'avertissement « le préfixe nomme les outils de vos assistants et ne changera plus », bouton « Créer » ; quatre états (portage-ecrans.md) |
| **Conventions** | coding-standards, database, supabase, security, auth, api, forms, portage, a11y, registry, testing |
| **Estimation** | M |
| **Version** | 1.2.0 |
| **Dépend de** | E09-S02 (✅, `OrgCreationHook`), E01-S11 (✅, appelant émis, `identity_for_caller`) |
| **Porteuse de migration** | Oui : `signup_org` |

## Contexte

ADR-023. Aujourd'hui seule l'équipe plateforme crée une organisation (`server/admin/orgs.ts:251`,
`requireStaff` ; `create_org` contrôle `is_staff()`), et une personne n'a d'identifiant interne que
sur invitation ou dans l'équipe plateforme (`identity_for_caller`, ligne de base l. 501). Le SaaS de
production est en mode OIDC (oto-saas `docs/deploiement.md` § 1) : l'inscription doit y créer
l'identité. L'équipe par défaut n'existe plus (`members.default_team_id` vidé et fermé,
`migrations/20260929090000_platform_e05s13.sql:351`) : l'inscription ne crée pas d'équipe.

**Refs :** ADR-023, ADR-004 (organisation par l'adresse), ADR-012 § 3, ADR-020 ; FR-ADMIN-01 (amendé) ;
architecture § 5 (`admin/`), § 6 (Web).

## Périmètre

Service `signUp`, route `POST /api/platform/signup` servie sans organisation (comme `cell`), option
`signup` de `handlePlateforme`, fonction SQL `signup_org`, écran `EcranInscription`, README du paquet
(montage chez un hôte).

## Hors périmètre

- Création du compte chez l'émetteur, captcha, débit par IP, domaines jetables : l'hôte (ADR-023 § 4).
- Page qui monte l'écran : l'hôte ; l'hôte de référence ne la monte pas (un ERP n'a pas d'inscription,
  hypothèse HN-E12S01-1), l'écran se teste en composant.
- Offre de départ : fonction de capacités de l'hôte (E12-S02).
- MCP admin : `admin_org create` inchangé.

## Critères d'acceptation

- [x] **AC-1** **Given** un hôte sans option `signup` et une session **When** `POST /api/platform/signup` **Then** 404
  `not_found` « Unknown route. », sans lecture de la base (sans session : 401, comme toute route).
- [ ] **AC-2** **Given** l'option `signup` et une requête sans session **When** `POST signup` **Then** 401
  comme toute route à session ; d'une autre origine : `forbidden` (`requireSameOrigin`).
- [ ] **AC-3** **Given** un appelant vérifié sans email vérifié dans ses claims **When** `POST signup`
  **Then** `forbidden` « Sign up needs a verified email address. », rien d'écrit.
- [ ] **AC-4** **Given** un appelant déjà membre d'une organisation **When** `POST signup` **Then**
  `forbidden`, `reason: "already_member"`, message « You already belong to an organisation. To create
  another one, ask the platform team. » ; décidé par le service avant `signup_org`, et `signup_org`
  refuse aussi (`42501`), test sur une base qui laisse passer le service.
- [ ] **AC-5** **Given** `admit` de l'hôte qui rend un texte **When** `POST signup` **Then** `forbidden`,
  `reason: "signup_refused"`, avec ce texte ; `admit` qui lève : `internal`, sans son message ; `admit`
  reçoit l'email vérifié et la requête.
- [ ] **AC-6** **Given** un nom, un slug et un préfixe valides, sans `confirm` **When** `POST signup`
  **Then** `{ created: false, org, addresses }` : adresses de l'hôte (`orgCreation.addresses`)
  contrôlées comme dans `createOrg` (adresse prise → `conflict`), rien d'écrit.
- [ ] **AC-7** **Given** la même demande avec `confirm: true` **When** `POST signup` **Then** une
  transaction crée l'organisation, sa racine `guide`, `private`, `contexte`, ses adresses, et le membre
  `admin` (son espace `private/<handle>` par `members_tree_sync`) ; aucune équipe, aucun
  `platform_grants` ; puis `orgCreation.created` ; réponse `{ created: true, org, hosts, setup }`.
- [ ] **AC-8** **Given** un appelant OIDC sans identité (ni invité ni équipe plateforme) **When** l'AC-7
  **Then** `signup_org` pose sa ligne `identities` (identifiant neuf) dans la même transaction ; en mode
  Supabase, l'identifiant est le `sub`.
- [ ] **AC-9** **Given** un slug ou un préfixe pris **When** `confirm: true` **Then** `conflict` avec le
  texte de `createConflict` (slug, préfixe, adresse) ; rien d'écrit, identité comprise.
- [ ] **AC-10** **Given** deux inscriptions simultanées de la même personne **When** elles confirment
  **Then** une seule organisation créée (verrou consultatif sur la personne dans `signup_org`) ; l'autre
  `forbidden` `already_member`.
- [ ] **AC-11** **Given** l'inscription réussie **When** la réponse part **Then** une ligne de journal
  `signup` est écrite dans la nouvelle organisation, par l'écrivain commun, après la réponse.
- [ ] **AC-12** **Given** l'écran `EcranInscription` **When** la personne tape un nom **Then** slug et
  préfixe se proposent (même normalisation que les schémas), la première réponse montre l'adresse, le
  bouton « Créer » confirme, et la réussite mène à l'adresse de la nouvelle organisation ; chaque refus
  s'affiche en `role="alert"` avec le message du service ; clavier et deux thèmes.

## Implémentation

### `migrations/`
- `YYYYMMDDHHMMSS_platform_signup.sql` (`pnpm db:migrate platform_signup`) : `platform.signup_org(p_name,
  p_slug, p_prefix, p_hosts)`, `security definer`, `search_path` vide, `REVOKE` de public, `GRANT` à
  `authenticated` ; verrou `pg_advisory_xact_lock(7801, hashtext(<issuer>|<subject>))`. Si le refacto
  est accepté : fonction interne `platform.org_skeleton(name, slug, prefix, hosts, author)` (aucun
  `GRANT`), appelée par `create_org` (corps remplacé, comportement identique) et par `signup_org`.
  Aucune table ni colonne : ni `TABLES` d'`org-transfer.mjs` ni `forget_user` à toucher.

### `schemas/`
- `admin.ts` : `signupSchema` (`name`, `org`, `prefix`, `confirm?`), repris des schémas de
  `orgCreateSchema` sans `host`.

### `server/`
- `admin/signup.ts` (nouveau) : `signUp(db, caller, input, { signup, request })` ; type
  `SignupOptions = { orgCreation: OrgCreationHook; admit?(input: { email: string; request: Request }): Promise<string | null> | string | null }`.
- `admin/orgs.ts` : `createConflict` exporté pour `signup.ts` (réutilisé, pas recopié).
- `index.ts` : exports `signUp`, `SignupOptions`.

### `api/`
- `handler.ts` : `PlatformRequestOptions.signup?`, branche `POST signup` avant l'identité par l'adresse,
  à session, journal dans la nouvelle organisation.

### `ui/`
- `inscription/ecran-inscription.tsx` (nouveau, Client, poussé bas) ; export dans `ui/index.ts`.

### Hôte et documentation
- `packages/plateforme/README.md` : monter l'inscription (option, page, réglage d'Auth selon le mode).
- `docs/architecture.md` § 4 (fonction `signup_org`), § 5 (`admin/`), § 6 (Web) ; `docs/prd.md`
  FR-ADMIN-01.

## Rayon d'impact

### Appelants
- `createOrg`, `createConflict` — `rg -c "create_org\b" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests C:/apps/oto-pkg/scripts`
  → `server/admin/orgs.ts`, `org-creation.ts`, `schemas/admin.ts` ; outillage `scripts/demo/30-arbre.mjs`,
  `scripts/org-import.mjs`, `scripts/lib/org-transfer-args.mjs` ; tests `admin-orgs`,
  `admin-org-creation`, `role-plateforme`, `espace-prive`, `e05s13-responsables-sql`, helpers
  `plateforme.ts`, `mcp-admin.ts`, `spy-t1-*.ts`. Avec le refacto, `create_org` garde sa signature et
  son comportement : ces appelants ne changent pas, leurs tests le prouvent (identiques avant/après).
- `handlePlateforme` / `PlatformRequestOptions` — `rg -c "PlatformRequestOptions|handlePlateforme\(" …`
  → 23 fichiers de test et `src/app/api/platform/[...route]/route.ts` : option facultative, aucun ne
  change.
- `identity_for_caller` — `rg -c "identity_for_caller" …` → inchangée ; `signup_org` écrit
  `identities` elle-même.

### Doublons
- `component-registry.md` (`OrgCreationHook`, `createOrg`) et `rg -n "libre-service|signup|inscri" C:/apps/oto-pkg/packages`
  → rien d'autre ne crée une organisation hors de l'équipe plateforme. Verdict : réutiliser
  `OrgCreationHook`, `applicationAddresses`, `setupAddresses`, `takenAddress`, `createConflict` et les
  schémas d'`orgCreateSchema` ; le corps SQL de création : fusionner (refacto ci-dessous) ou recopier.

### Effet produit
- Hôte qui active l'option : une route de plus, sans organisation ; journal de la nouvelle
  organisation ; le point de création de l'hôte appelé hors du MCP admin.
- Migration copiée et appliquée par tout hôte (fonction seule, additive).
- Aucun effet sans l'option : ERP et hôte de référence inchangés.

### Refacto
- Proposé : `platform.org_skeleton` partagé par `create_org` et `signup_org`, pour ne pas recopier 30
  lignes de SQL d'arbre de départ. Coût : `create_org` remplacé (comportement identique, ses tests
  rejoués). Sans lui : deux copies de l'arbre de départ à tenir égales. Posé en question à JB.

## Tests attendus

### Unit tests
- [ ] `signupSchema` : bornes reprises d'`orgCreateSchema`.
- [ ] `signUp` sur base simulée : ordre des refus (AC-1, 3, 4, 5), deux temps (AC-6), hook en panne.

### Integration tests (portables)
- [ ] `signup_org` : arbre, membre admin, aucune équipe ni accès (AC-7) ; identité OIDC neuve (AC-8) ;
  refus déjà membre et sans email (AC-4) ; conflits (AC-9) ; course (AC-10).
- [ ] Route `POST signup` : 404 sans option, 401, origine, journal (AC-1, 2, 11).
- [ ] `create_org` inchangé si refacto (tests existants identiques).
- [ ] `EcranInscription` : saisie, deux temps, refus, redirection (AC-12) ; contrôle visuel deux thèmes.

## Actions JB

- Accord sur ADR-023 et la story.
- Côté SaaS (hors de ce dépôt) : ouvrir l'inscription chez l'émetteur, monter la page, `admit`.

## Hypothèses

- **HN-E12S01-1** : l'hôte de référence ne monte pas l'écran d'inscription (portabilité : un ERP n'en a
  pas) ; le README donne le montage.
- **HN-E12S01-2** : « une organisation par compte » = la personne n'est membre d'aucune organisation ;
  une personne invitée ailleurs passe par l'équipe plateforme pour en créer une.
- **HN-E12S01-3** : en mode Supabase, l'email du jeton est vérifié quand l'hôte exige la confirmation
  (`enable_confirmations`) ; le paquet le lit comme pour les invitations.

## Post-implémentation

### Écarts avec la référence UI
- L'écran est un îlot (`FormulaireDInscription`) à monter dans `EcranDAuthentification`, comme les écrans de connexion : la
  page reste celle de l'hôte (HN-E12S01-1).

### Écarts avec l'architecture
- ADR-023 accepté ; `docs/architecture.md` § 4 (`signup_org`, `org_skeleton`), § 5 (`admin/`), § 6 (Web), § 8.
- `create_org` réécrite sur `org_skeleton` (refacto accepté par JB) : ses tests (`admin-orgs`, `admin-org-creation`,
  `role-plateforme`, `espace-prive`) passent inchangés.

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| signUp, SignupOptions, SignupResult | `packages/plateforme/server/admin/signup.ts` | registry |
| isSignupRoute, signupResponse | `packages/plateforme/api/signup.ts` | route sans organisation |
| signupSchema | `packages/plateforme/schemas/admin.ts` | registry |
| FormulaireDInscription | `packages/plateforme/ui/inscription/formulaire-d-inscription.tsx` | registry |
| signup_org, org_skeleton | `migrations/20260930221702_platform_signup.sql` | fonctions seules |

### Notes
- **HN-E12S01-4** : le refus d'`admit` porte son texte dans `details.text` : l'API ne sert pas le message d'une erreur
  aux écrans, qui traduisent par code ; le texte de l'hôte est dans sa langue.
- **HN-E12S01-5** : la ligne de journal s'écrit par un second client de l'appelant (`VerifiedSession.caller`) : le
  premier a traduit l'identité avant que `signup_org` la crée (mode OIDC).
- **HN-E12S01-6** : les conflits de slug et de préfixe gardent le texte de `createConflict` ; l'écran les dit par une
  phrase commune (« adresse ou préfixe déjà pris »), sans raison nouvelle.
- Tests : `tests/integration/e12s01-inscription.test.ts` (9 cas, base locale), `tests/integration/components/e12s01-inscription.test.tsx` (4).
