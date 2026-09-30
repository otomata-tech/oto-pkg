# ADR-023 — Inscription libre : une personne vérifiée crée son organisation, si l'hôte l'active

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-30 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

Une organisation ne se crée que par l'équipe plateforme (`createOrg`, `requireStaff` ; `create_org`
contrôle `is_staff()`), et on n'entre que par invitation (architecture § 6, `hook_before_user_created`,
`identity_for_caller`). Le SaaS veut une offre gratuite en libre-service : une personne crée son compte
chez l'émetteur, puis son organisation, sans passer par l'équipe plateforme. Les invariants d'une
création (arbre de départ, premier administrateur, adresse) sont ceux du paquet : les recréer chez
l'hôte les dupliquerait et contournerait la garde du service.

Trois faits du paquet pèsent :

- une organisation n'existe pour personne sans adresse (ADR-004) : c'est le point de création de l'hôte
  (`OrgCreationHook`, E09-S02) qui la fournit dans la cellule partagée ;
- en mode OIDC, `identity_for_caller()` ne donne un identifiant interne qu'à l'équipe plateforme et à
  une adresse invitée : une personne inscrite chez l'émetteur n'en a pas ;
- en mode Supabase, le hook d'inscription refuse tout compte sans invitation ; c'est un réglage d'Auth
  de l'hôte.

## Décision

1. **L'inscription s'active par une option de `handlePlateforme`**, `signup: { orgCreation, admit? }` :
   sans elle, la route `POST /api/platform/signup` répond `not_found` et rien ne change. `orgCreation`
   est le point de création de l'hôte (ses adresses) ; une organisation sans adresse ne se crée pas.
2. **Le service `signUp` décide**, dans l'ordre : Zod ; option présente ; email vérifié de l'appelant ;
   la personne n'est membre d'aucune organisation (une organisation par compte, refus `forbidden`,
   `reason: "already_member"`) ; `admit({ email, request })` de l'hôte (captcha, débit, domaines
   jetables : son refus devient `forbidden`, `reason: "signup_refused"`, avec son texte) ; adresses de
   l'hôte contrôlées comme celles d'une création par l'équipe plateforme. En deux temps comme
   `createOrg` : sans `confirm`, rien n'est écrit.
3. **Une fonction SQL `signup_org`**, `security definer`, crée en une transaction l'identité de
   l'appelant s'il n'en a pas (mode OIDC : identifiant neuf ; mode Supabase : le `sub`),
   l'organisation, son arbre de départ et ses adresses, et son premier membre, `admin`. Elle refuse
   sans email ni émetteur dans les claims, et pour une personne déjà membre. Aucune équipe n'est créée
   (l'équipe par défaut est retirée depuis E05-S13) ; aucun accès plateforme n'est posé.
4. **Ce qui reste à l'hôte** : la création du compte chez l'émetteur (en mode Supabase, ouvrir les
   inscriptions dans ses réglages d'Auth ; en mode OIDC, l'inscription de l'émetteur), la page qui
   monte l'écran d'inscription du paquet, captcha, débit par IP et domaines jetables par `admit` (le
   paquet ne lie aucun état à une IP, architecture § 6), l'offre de départ par sa fonction de
   capacités (ADR-022).
5. **Le paquet ne change pas l'entrée par invitation** : une personne qui rejoint une organisation
   existante y entre toujours par invitation.

## Conséquences

### Positives
- Les invariants de création restent en un seul endroit ; la garde du service tient.
- Un ERP n'active rien et garde l'entrée sur invitation seule.

### Négatives
- Une personne déjà membre d'une organisation ne peut pas en créer une seconde elle-même : elle passe
  par l'équipe plateforme.
- Le cookie de session de l'hôte est lié à l'adresse : après l'inscription, la personne se reconnecte
  sur l'adresse de sa nouvelle organisation (transparent avec la session de l'émetteur).
- `signup_org` porte une seconde barrière plus faible que `create_org` : la base ne sait pas si
  l'hôte a activé l'inscription ; cette décision est celle du service (ADR-012 § 3), `platform_app`
  n'étant utilisé que par le code du paquet.

### Neutres
- FR-ADMIN-01 : la création d'une organisation n'est plus réservée à l'équipe plateforme quand l'hôte
  active l'inscription.

## Alternatives considérées

### Inscription dans l'hôte, sous une identité de l'équipe plateforme
Garde du service contournée, invariants dupliqués, une identité à garder. Rejetée.

### Inscription sur code d'accès émis par l'équipe plateforme
Plus sûre au lancement ; une table et un outil admin de plus. Écartée par JB (inscription libre).

### Anti-abus dans le paquet (liste de domaines jetables)
Une liste à tenir dans un paquet public, mise à jour par version chez chaque hôte. Rejetée : `admit`.
