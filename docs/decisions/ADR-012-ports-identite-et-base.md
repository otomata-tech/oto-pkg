# ADR-012 — Ports d'identité et de base : le paquet ne dépend que d'un appelant vérifié et d'une session Postgres par requête ; les droits se décident dans le service ; Supabase reste l'hôte par défaut

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-24 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

Une application hôte n'est pas toujours un projet Supabase dont l'annuaire est Supabase Auth.
Trois cas l'exigent : un client qui a déjà son fournisseur d'identité (Logto, par exemple) et veut
que la plateforme s'en serve, sans adopter Supabase Auth ; notre SaaS chez Scaleway, sur un Postgres
managé, seule chaîne qu'un auditeur lit d'un bloc ; un frontal plus riche que les écrans du paquet,
écrit sur son API. Un Postgres managé ne peut pas porter Supabase (superutilisateur et extensions
`pgsodium`, `supabase_vault`, `pg_net` refusés), et celui de Scaleway n'admet que des extensions
sur liste blanche.

Sans ports, le paquet demandait à Supabase : `auth.uid()` dans les policies, `auth.users` comme
annuaire (clés étrangères, fonctions qui y lisent), PostgREST comme transport vers la base (et avec
lui la RLS comme seule décision des droits), Supabase Auth comme serveur OAuth, et une extension
absente de Scaleway (`moddatetime`).

## Décision

1. **Deux ports dans `server/`. L'hôte n'apporte que deux choses : une base Postgres, par une URL,
   et un émetteur d'identité** (plus, avec un émetteur OIDC, un relais SMTP pour les invitations).
   - **Port d'identité.** Le paquet ne connaît d'une personne qu'un *appelant vérifié* :
     émetteur, sujet, email vérifié et nom quand il y en a. Chaque porte le reçoit d'une vérification
     injectée : le jeton d'un assistant ou de l'API vérifié par la JWKS de l'émetteur configuré
     (`makeVerifyToken`, `server/issuer.ts` : `iss` exact, `exp`, `nbf`, algorithme et `kid` de la
     découverte, et `aud` égale à l'audience de l'hôte pour un émetteur OIDC), ou la session de l'hôte pour les écrans. L'émetteur est Supabase Auth par
     défaut, ou un émetteur OpenID Connect si `PLATFORM_OIDC_ISSUER` est posée (un hôte, un
     émetteur). L'appelant vérifié est traduit en **identifiant interne** par
     `platform.identities (issuer, subject, user_id)`, que seule `identity_for_caller()` écrit ; les
     colonnes de personne (`user_id`, `created_by`…) sont des `uuid` sans clé vers un annuaire. Sur
     un hôte Supabase, l'identifiant interne est le `sub` de Supabase Auth. `platform.members` est
     l'annuaire du paquet : email, nom et dernière connexion y sont copiés à chaque connexion.
     L'invitation reste le seul chemin d'entrée : sur Supabase Auth par le hook d'inscription ; chez
     un autre émetteur, à la première connexion d'une adresse vérifiée et invitée, et l'email
     d'invitation part par le relais SMTP de l'hôte.
   - **Port de base : un pilote Postgres partout, Supabase compris.** Le paquet parle à Postgres
     par `withCallerSession(caller, fn)` (`server/sql.ts`) : une transaction où le rôle est
     `authenticated` et où `request.jwt.claims` porte l'identifiant interne et l'email, posés en
     local ; les policies, fonctions et déclencheurs lisent `auth.uid()` et `auth.jwt()` comme sur
     Supabase. Pilote `postgres.js`, sans requêtes préparées (compatible avec un pooler en mode
     transaction), TLS exigé hors de la machine locale. **Connexion par un rôle dédié**,
     `platform_app` : `login`, `noinherit`, membre d'`authenticated` et d'`anon` seulement, jamais
     `bypassrls` ; son URL (`PLATFORM_DATABASE_URL`) ne vit que côté serveur. Sur un hôte Supabase,
     `platform` n'est pas exposé au Data API. Sur un Postgres sans Supabase,
     `oto-platform db prepare` crée une fois, hors des migrations (ADR-006 § 1), le schéma `auth`
     réduit à `uid()`, `jwt()` et `role()`, le schéma `extensions` et les rôles `anon`,
     `authenticated` et `platform_app` ; il suffit d'un administrateur qui a `CREATEROLE` et le droit
     de créer un schéma, sans `SUPERUSER`. Extensions exigées : `pg_trgm`, `unaccent`, `ltree`. Le
     schéma du paquet s'installe par une ligne de base, sans `moddatetime` (remplacée par
     `platform.set_updated_at()`) ni référence au schéma `auth` hors de `uid()`, `jwt()` et `role()`,
     sauf les deux lectures propres au mode Supabase nommées au point 5. Aucun
     ORM : le SQL des migrations est la source du schéma.
2. **Supabase reste un hôte de première classe**, Cloud Paris ou auto-hébergé (ADR-005) : sa base
   se joint par l'URL de son pooler, et Supabase Auth reste l'émetteur par défaut, parce qu'il
   fournit ce que les ports ne couvrent pas : sessions web, lien magique et hook d'invitation,
   Google et Microsoft, et le serveur OAuth 2.1 à enregistrement dynamique que les trois hosts savent
   utiliser. Un hôte à identité tierce apporte un émetteur OpenID Connect avec JWKS, un serveur
   OAuth 2.1 que Claude, ChatGPT et Claude Code savent joindre (à mesurer sur les trois hosts :
   l'enregistrement dynamique RFC 7591 et les Client ID Metadata Documents diffèrent d'un émetteur à
   l'autre ; Keycloak est le premier essayé), et ses propres pages de connexion, **sans façade ni
   relais devant l'émetteur** (ADR-004). Le paquet apporte la vérification, `members`,
   `identities`, l'envoi des invitations, et `/.well-known/oauth-protected-resource`, qui désigne
   cet émetteur. L'hôte de référence porte la connexion OIDC du web (`/auth/oidc/*`, session dans
   un cookie chiffré).
3. **Les droits se décident dans le service ; la RLS n'isole que les organisations.** Les niveaux
   hérités par l'arbre (règles de personne, d'équipe et d'organisation, propriétaire, espaces
   personnels) et les niveaux sur les comptes sont un calcul TypeScript (`server/access.ts`,
   `access-levels.ts`), testable sans base ; chaque service décide chaque refus et pose chaque
   filtre avant sa requête ; « aucune ligne rendue » n'est jamais lu comme un refus. Chaque table a
   des policies d'appartenance (`member_orgs()`), la RLS restant activée sur toute table. Restent en
   base les fonctions et déclencheurs d'atomicité et d'invariants de structure (`publish_node`,
   `open_draft`, gardes de cycle, de chemin, du nœud Contexte et de l'espace personnel), listés au
   § 4 de `docs/architecture.md` ; un parcours ne s'y ajoute pas sans être nommé dans cette carte.
   Seule exception au calcul en code : la recherche (`search_content`, `route_candidates`) applique
   le niveau de lecture en SQL (`node_level_for`) avant de couper sa liste, pour ne pas couper avant
   de filtrer, et le service redécide chaque résultat ; un test de parité tient `node_level_for`
   égal au calcul du service. Un test par service vérifie son code d'erreur, et un test par service,
   sur une base qui rend des lignes interdites, prouve que le filtre est dans le code ; ces tests
   sont portables (Supabase et Postgres nu).
4. **Ce qui ne change pas.** Le schéma `platform`, additif, copié et appliqué par l'hôte
   (ADR-006) ; les six outils (ADR-002) ; l'organisation par l'adresse et l'appartenance revérifiée
   à chaque appel (ADR-004 § 1 et 2) ; rien de réservé au Cloud de Supabase (ADR-005 § 3).
5. **Couplage à Supabase borné.** Ce qui reste propre à Supabase est nommé et ne grandit pas : les
   sessions `@supabase/ssr` de l'hôte en mode Supabase ; le lien magique de l'invitation
   (`server/invitations.ts`) ; la lecture du consentement OAuth (`server/oauth.ts`,
   `oauth_pending_resource`) et le ménage des clients OAuth (`oauth_clients_activity`, outillage) ;
   le hook d'inscription ; la vérification par défaut du jeton sur la JWKS du projet ; dans
   l'outillage, la lecture des personnes par l'API d'administration de Supabase Auth
   (`org:export`) et les réglages d'un projet (`auth:settings`, `data-api:close`). Règles et
   commandes de contrôle : `.method/conventions/supabase-patterns.md § Couplage à Supabase`. Aucune
   API REST complète : sans consommateur nommé, le MCP reste la porte HTTP du paquet vers les
   assistants, et `/api/platform/*` celle des écrans.

## Conséquences

### Positives
- Un ERP à identité tierce, le SaaS chez Scaleway, un ERP sur Supabase : le cœur s'installe de la
  même façon, avec une URL de base et un émetteur ; un auditeur lit une seule infrastructure.
- Les policies d'appartenance, les déclencheurs d'invariants et les tests d'isolation restent la
  preuve d'isolation entre organisations, sur Supabase comme sur un Postgres nu.
- La logique des droits vit à un seul endroit, lisible et testable sans base.
- Le Data API ne sert `platform` nulle part.

### Négatives
- L'application porte un secret de base (`PLATFORM_DATABASE_URL`), limité par `platform_app` à ce
  que peut `authenticated` ; la vérification du jeton avant de poser les claims est la seule garde
  de l'identité.
- Chaque nouveau serveur OAuth pour les assistants se mesure à nouveau sur les trois hosts.
- `members.email` est une copie : à jour à la connexion, périmée entre deux connexions si
  l'annuaire change.
- Ce que Supabase Auth donne sans code devient « par défaut » : un hôte à identité tierce fournit
  l'équivalent.

### Neutres
- `ui/` reste une face facultative ; un frontal peut s'écrire sur `api/` et `schemas/`.

## Alternatives considérées

### Fédérer tout fournisseur dans Supabase Auth et refuser le Postgres managé
Zéro coût de port ; les fournisseurs OIDC de Supabase Auth couvrent Logto et Entra. Mais Supabase
reste dans la chaîne d'audit, un ERP à identité tierce garde deux annuaires, et le SaaS chez
Scaleway exige un Postgres à notre charge. Rejetée ; la fédération reste une voie pour un ERP
existant (ADR-004 § 7).

### PostgREST privé chez Scaleway, clé serveur sur les policies des hôtes Supabase
`server/` garderait ses appels, seul son client changerait. Rejetée : deux mécanismes à tenir, un
service de plus chez chaque hôte hors Supabase, le schéma exposé chez Supabase derrière un secret,
aucune transaction entre deux appels ; la conversion en SQL se paie une fois.

### Deux implémentations du port de base (PostgREST sur Supabase, SQL ailleurs)
Rejetée : le SQL, dû pour Scaleway, sert aussi Supabase par son pooler ; garder le Data API à côté
ferait écrire et tester chaque fonction deux fois, sans rien permettre de plus.

### Port d'identité sans port de base
PostgREST devrait accepter l'émetteur tiers : sur le Cloud, seuls quelques fournisseurs nommés le
sont. C'est le port de base qui rend l'identité réellement libre. Rejetée seule.

### ORM à schéma déclaré (Drizzle, Prisma)
Un paquet installé dans des hôtes à versions différentes a besoin de migrations relues et rejouées
dans l'ordre (ADR-006) ; un ORM ne modélise ni les policies ni les fonctions SQL. Rejetée.

### Garder les niveaux en base (RLS d'isolation et de niveaux)
Moins de code, mais la logique des droits vivrait à deux endroits (SQL et services), et chaque
lecture dépendrait du jeton que porte le plan. Rejetée.
