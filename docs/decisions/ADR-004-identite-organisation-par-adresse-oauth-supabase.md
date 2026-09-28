# ADR-004 — Identité : l'organisation vient de l'adresse, l'appartenance est revérifiée à chaque appel, les assistants se connectent en OAuth 2.1 auprès de l'émetteur de l'hôte

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-23 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

Une personne a un compte dans l'annuaire de l'application hôte : il sert aux écrans, aux
assistants et, dans un ERP, à l'ERP lui-même. claude.ai et ChatGPT appellent depuis des pools
d'adresses tournants : aucun état ne peut s'attacher à une empreinte réseau. Un consultant est
membre de plusieurs organisations. Retirer quelqu'un doit couper son accès sans attendre
l'expiration de son jeton. L'annuaire par défaut est Supabase Auth, dont le serveur OAuth 2.1 à
enregistrement dynamique existe en Cloud et en auto-hébergé ; un hôte sans Supabase apporte son
propre émetteur OpenID Connect (ADR-012).

## Décision

1. **L'organisation vient de l'adresse appelée** (`app.acme.fr/api/mcp`, `acme.<domaine de
   base>/api/mcp`), jamais du jeton : le jeton dit qui appelle, la base dit s'il est membre.
2. **L'appartenance est revérifiée à chaque appel** (ligne `members` de l'organisation de
   l'adresse) : un membre retiré est coupé dès l'appel suivant, même avec un jeton valide.
3. **Les assistants se connectent en OAuth 2.1**, notre serveur étant le serveur de ressource et
   **l'émetteur de l'hôte le serveur d'autorisation** : Supabase Auth par défaut, sinon un émetteur
   OpenID Connect configuré (`PLATFORM_OIDC_ISSUER`, `PLATFORM_OIDC_AUDIENCE` ; Logto ou Keycloak).
   L'host lit `/.well-known/oauth-protected-resource`, qui désigne cet émetteur, s'enregistre seul,
   ouvre la connexion puis le consentement. 401 + `WWW-Authenticate` sur toute requête non
   authentifiée ; jamais de « mode dégradé anonyme ». Le jeton est vérifié à chaque appel par la
   JWKS de l'émetteur (`iss` exact, `exp`, `nbf` ; pour un émetteur OIDC, `aud` égale à l'audience
   de l'hôte et l'email retenu seulement s'il est vérifié) ; les services parlent ensuite à la base
   au nom de cet appelant vérifié (ADR-012 § 1). `service_role` interdit. **Aucune façade ni relais
   devant l'émetteur.** Règles de détail : `mcp-patterns.md § 6`.
4. **Web** : l'émetteur de l'hôte. Avec Supabase Auth : email et mot de passe, lien magique,
   Google et Microsoft (SAML sur exigence). Avec un émetteur OIDC : ses propres pages de connexion,
   à la marque d'Oto par sa configuration, jointes par les routes `/auth/oidc/*` de l'hôte. On entre
   par l'invitation d'un admin, ou d'un responsable d'équipe au rôle membre, dans les deux cas.
5. **Routines** : une routine est une tâche planifiée de l'assistant (Claude), qui appelle le MCP
   sous la connexion OAuth de la personne : mêmes droits, même journal, révoquée avec elle. Pas de
   compte de service ; un jeton de service haché émis dans l'écran admin reste une piste V2.
6. **Aucune session côté serveur, aucune empreinte réseau, aucun secret dans une conversation.**
7. **ERP existant avec un autre fournisseur d'identité** : deux voies, fédérer ce fournisseur
   dans Supabase Auth, ou le configurer comme émetteur de l'hôte (ADR-012) ; jamais une clé d'API
   au nom d'un utilisateur.
8. **En cellule partagée sur Supabase Auth**, le projet n'a qu'une page de consentement
   (`/oauth/consent`, servie par l'hôte) : elle vit sur un domaine commun. Elle ne connaît pas
   l'adresse d'origine, seulement le client et `resource`, et c'est `resource` qui dit
   l'organisation et habille la page. Les jetons portent `aud` = `authenticated`, ni la ressource ni
   le sous-domaine : la vérification d'appartenance compense. Révoquer un assistant ne coupe qu'au rafraîchissement du
   jeton (3 600 s) ; retirer le membre coupe tout de suite. La page dit à un non-membre que
   l'assistant aura accès à son compte entier, et nomme le MCP admin. Les hosts lisent la forme
   suffixée des métadonnées (`/.well-known/oauth-protected-resource/api/mcp`) : la racine et les
   deux formes suffixées sont servies.

## Conséquences

### Positives
- Un seul compte par personne pour les écrans, les assistants et l'ERP ; un seul connecteur.
- Le retrait d'un membre est immédiat ; l'isolation ne dépend pas du jeton.
- Le banc a validé Supabase Auth sur Claude Code, claude.ai et ChatGPT : enregistrement
  dynamique, consentement, deux organisations côte à côte, non-membre refusé à l'appel.

### Négatives
- Une requête par appel vers `members` (indexée).
- Chaque nouvel émetteur se mesure sur les trois hosts avant de servir les assistants ;
  l'enregistrement dynamique (RFC 7591) et les Client ID Metadata Documents diffèrent d'un émetteur
  à l'autre.
- Les hosts ne purgent jamais les clients OAuth qu'ils enregistrent (un par connecteur, par
  organisation et par poste Claude Code) : l'outillage fait le ménage.

### Neutres
- Un émetteur peut ajouter des claims au jeton ; ils ne remplacent jamais la vérification
  d'appartenance en base.

## Alternatives considérées

### L'organisation dans le jeton (claim `org_id`)
Un consultant membre de plusieurs organisations aurait un jeton par organisation ; un retrait
attendrait l'expiration ; un jeton volé porterait son organisation. Rejetée.

### Une façade d'autorisation devant l'émetteur
Notre propre serveur d'autorisation devant Supabase Auth ou devant un émetteur tiers
(enregistrement dynamique émulé, consentement injecté, jetons maison, comme Oto devant Logto).
Rejetée : le banc a validé l'émetteur sans façade, et une façade est un critère d'exclusion pour
tout émetteur.

### Identification par adresse réseau ou empreinte UA + IP
Inutilisable : les hosts changent d'adresse à chaque requête (mesuré au banc). Rejetée.
