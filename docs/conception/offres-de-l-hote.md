# Offres de l'hôte

- **Statut** : validé avec JB le 01/10/2026
- **Dernière révision** : 2026-10-01

## Résumé

Un hôte qui vend le paquet par offres reçoit ce qui revient au paquet, sans que le paquet connaisse jamais une offre, un prix ou un prestataire de paiement : une personne vérifiée crée elle-même son organisation si l'hôte l'active (ADR-023), et chaque organisation porte des capacités que les services vérifient avant d'écrire et que les écrans grisent, leurs valeurs venant de l'hôte (ADR-022). Sans option ni fonction enregistrée, un ERP voit le comportement d'avant.

## Contexte

Le SaaS vend une offre gratuite en libre-service et une offre payante, au prix par organisation. Jusque-là, une organisation ne se créait que par l'équipe plateforme (`createOrg`, `requireStaff` ; `create_org` contrôle `is_staff()`), et on n'entrait que par invitation ([identité et connexion](identite-et-connexion.md)). Il faut aussi brider certaines écritures : nombre de membres, d'équipes, de connecteurs activés, stockage des fichiers.

Contraintes du paquet :

- un refus est décidé par le service, avant sa requête (ADR-012 § 3) ; un filtre dans les routes de l'hôte dépendrait des chemins internes du paquet et contournerait cette garde ;
- le paquet n'écrit dans `platform` qu'au nom d'un appelant vérifié, et la connexion d'administration n'est jamais déployée (ADR-006 § 3, ADR-012 § 1) ; or l'état d'une offre change sur un événement du prestataire de paiement (un webhook), sans appelant ;
- l'état d'une offre vit déjà chez l'hôte (son schéma à lui) ; le recopier dans `platform` ferait deux sources à tenir égales ;
- une organisation n'existe pour personne sans adresse (ADR-004) : c'est le point de création de l'hôte (`OrgCreationHook`, E09-S02) qui la fournit dans la cellule partagée ;
- en mode OIDC, `identity_for_caller()` ne donne un identifiant interne qu'à l'équipe plateforme et à une adresse invitée ; en mode Supabase, le hook d'inscription refuse tout compte sans invitation (réglage d'Auth de l'hôte).

## Objectifs et non-objectifs

- Les invariants d'une création (arbre de départ, premier administrateur, adresse) restent dans le paquet, en un seul endroit.
- Les limites valent pour toutes les portes, et les écrans savent d'avance ce qui sera refusé.
- Un ERP qui n'active rien garde l'entrée sur invitation seule et aucune limite (sauf le quota de stockage d'avant).
- Hors objectif : noms d'offres, prix, paiement, anti-abus dans le paquet (captcha, débit par IP, domaines jetables), réglage d'une limite par le MCP admin.

## Conception

### Inscription libre (ADR-023)

1. **Option de `handlePlateforme`** : `signup: { orgCreation, admit? }` ; sans elle, `POST /api/platform/signup` répond `not_found` et rien ne change. `orgCreation` est le point de création de l'hôte (ses adresses) ; une organisation sans adresse ne se crée pas (ADR-023 § 1).
2. **Le service `signUp` décide**, dans l'ordre : Zod ; option présente ; email vérifié de l'appelant ; la personne n'est membre d'aucune organisation (une organisation par compte, refus `forbidden`, `reason: "already_member"`) ; `admit({ email, request })` de l'hôte (son refus devient `forbidden`, `reason: "signup_refused"`, avec son texte) ; adresses de l'hôte contrôlées comme celles d'une création par l'équipe plateforme. En deux temps comme `createOrg` : sans `confirm`, rien n'est écrit (ADR-023 § 2).
3. **`signup_org`**, `security definer`, crée en une transaction l'identité de l'appelant s'il n'en a pas (mode OIDC : identifiant neuf ; mode Supabase : le `sub`), l'organisation, son arbre de départ (par `org_skeleton`, partagé avec `create_org`) et ses adresses, et son premier membre, `admin`. Elle refuse (`42501`) sans email ni émetteur dans les claims, et pour une personne déjà membre ; verrou 7801 sur la personne. Aucune équipe ni accès plateforme n'est créé (ADR-023 § 3).
4. **Reste à l'hôte** : la création du compte chez l'émetteur (en mode Supabase, ouvrir les inscriptions ; en mode OIDC, l'inscription de l'émetteur), la page qui monte l'écran d'inscription du paquet (`FormulaireDInscription`, îlot monté dans `EcranDAuthentification`), captcha, débit par IP et domaines jetables par `admit`, l'offre de départ par sa fonction de capacités (ADR-023 § 4).
5. **L'entrée par invitation ne change pas** : rejoindre une organisation existante passe toujours par une invitation (ADR-023 § 5).

Choix de mise en œuvre :

- HN-E12S01-1 : l'hôte de référence ne monte pas l'écran d'inscription (un ERP n'en a pas) ; le README du paquet donne le montage.
- HN-E12S01-2 : « une organisation par compte » = la personne n'est membre d'aucune organisation ; une personne invitée ailleurs passe par l'équipe plateforme pour en créer une.
- HN-E12S01-3 : en mode Supabase, l'email du jeton est vérifié quand l'hôte exige la confirmation (`enable_confirmations`) ; le paquet le lit comme pour les invitations.
- HN-E12S01-4 : le refus d'`admit` porte son texte dans `details.text` : l'API ne sert pas le message d'une erreur aux écrans, qui traduisent par code ; le texte de l'hôte est dans sa langue.
- HN-E12S01-5 : la ligne de journal s'écrit par un second client de l'appelant (`VerifiedSession.caller`) : le premier a traduit l'identité avant que `signup_org` la crée (mode OIDC).
- HN-E12S01-6 : les conflits de slug et de préfixe gardent le texte de `createConflict` ; l'écran les dit par une phrase commune (« adresse ou préfixe déjà pris »).
- Conditions de l'hôte : `conditions` de `FormulaireDInscription` (case obligatoire vers les conditions de l'hôte), `accepted_terms` de `signupSchema`, `acceptedTerms` passé à `admit` ; le paquet ne juge pas la case, l'hôte refuse sans elle et garde la preuve.

### Capacités par organisation (ADR-022)

1. **Registre fermé**, typé par Zod (`schemas/limits.ts`) : un nom, un type (entier ≥ 0, octets, ensemble de valeurs), une phrase. Liste de la 1.2.0 : `members_max`, `teams_max` (0 admis), `storage_bytes`, `connectors_max`, `account_owner_kinds`, `accounts_per_owner_max`. Une capacité s'ajoute avec le service qui la lit ; aucune n'est un nom d'offre (ADR-022 § 1).
2. **Valeurs de l'hôte** : `registerOrgLimits({ read, raiseUrl? })`, enregistrée une fois comme `registerFunctions` ; `read({ id, slug })`, synchrone ou non, rend les capacités de l'organisation, appelée à chaque écriture bridée et à chaque lecture de l'état des écrans (l'hôte la met en cache s'il le veut), hors transaction ; la valeur repasse le schéma du registre. **Sans fonction, ou sans valeur pour une capacité : aucune limite**, sauf `storage_bytes`, dont le défaut reste le quota de 10 Go (`ORG_QUOTA_BYTES`) (ADR-022 § 2).
3. **Refus décidé par le service avant l'écriture** (`requireUnderLimit`, `limitedTx`), sous un verrou consultatif par organisation (classe 7601 ; 7501 pour le stockage, pris par `requireQuota`), dans la transaction qui compte puis écrit, pour `inviteMember`, `createTeam`, `activateConnector` et le quota de fichiers (`orgStorageQuota`). Le refus garde un code de la liste fermée : `forbidden` avec `reason: "limit"`, `limit` (le nom) et `max` ; le stockage garde `too_large`, `reason: "quota"`. Message neutre (« <organisation> is limited to 1 team »), sans mot d'offre ni de prix (ADR-022 § 3).
4. **Une fonction de l'hôte en échec refuse** (`internal`, sans son message) : une limite ne tombe jamais en silence (ADR-022 § 4).
5. **Toutes les portes** : API, MCP des organisations et MCP admin, équipe plateforme comprise ; relever une limite se fait chez l'hôte (ADR-022 § 5).
6. **Seuls les ajouts se refusent** : une limite abaissée ne supprime ni ne suspend rien ; la création suivante est refusée (ADR-022 § 6). Les invitations en attente comptent dans `members_max` ; l'acceptation, faite en SQL au retour de connexion, ne recompte pas.
7. **Écrans** : `orgLimitsView` rend compte et plafond de chaque capacité lue par un écran, qui grise le geste refusé ; avec `raiseUrl`, un administrateur voit « Relever la limite », vers `<raiseUrl>?capacity=<nom>` (ADR-022 § 7).
8. **Comptes de connecteur comptés au propriétaire** (organisation, équipe ou personne), jamais pour chaque personne qui peut s'en servir ; un partage ne change aucun compte (ADR-022 § 8).
9. **La surface MCP ne change pas** (ADR-002) : la liste des six outils est la même quelles que soient les capacités ; seul l'effet d'un outil est refusé (ADR-022 § 9).
10. **Compteurs sans session** : `orgUsage(orgId)` rend le nombre de membres et d'invitations en attente, rien d'autre, par la fonction `org_usage`, accordée à `anon` comme `org_by_host` et `org_contact` ; `platform` reste hors du Data API, la fonction ne se joint que par le serveur de l'hôte ; une organisation inconnue rend `null` (ADR-022 § 10).

## Décisions et alternatives écartées

- **Inscription dans l'hôte, sous une identité de l'équipe plateforme** : garde du service contournée, invariants dupliqués, une identité à garder. Rejetée.
- **Inscription sur code d'accès émis par l'équipe plateforme** : plus sûre au lancement, une table et un outil admin de plus. Écartée par JB (inscription libre).
- **Anti-abus dans le paquet** (liste de domaines jetables) : une liste à tenir dans un paquet public, mise à jour par version chez chaque hôte. Rejetée au profit d'`admit`.
- **Capacités stockées dans `platform`** (`orgs.limits`, écrites par l'équipe plateforme et l'hôte) : l'événement du prestataire n'a pas d'appelant (identité robot ou rôle de base nouveau à poser par `db prepare`), et l'état de l'offre vivrait à deux endroits. Rejetée.
- **Point d'autorisation de l'hôte** (`authorize({ orgId, action }) → null | message`) : le moins de code, mais les écrans ne savent pas d'avance ce qui est refusé. Rejetée.
- **Filtre dans les routes de l'hôte** : dépend des chemins internes du paquet et contourne la garde du service. Rejeté.
- **Drapeaux étendus d'un niveau « réservé à l'hôte »** (`orgs.flags`, ADR-006 § 7) : mélange mise en service progressive et droit commercial, et reste booléen. Rejetée.
- **Une équipe par défaut créée à l'inscription** : l'équipe par défaut est retirée du modèle depuis E05-S13 ([droits d'accès](droits-d-acces.md)).

## Sécurité et confidentialité

- `signup_org` porte une seconde barrière plus faible que `create_org` : la base ne sait pas si l'hôte a activé l'inscription ; cette décision est celle du service (ADR-012 § 3), `platform_app` n'étant utilisé que par le code du paquet.
- Le paquet ne lie aucun état à une IP : débit et anti-abus sont à l'hôte, par `admit`.
- `org_usage` est accordée à `anon` mais ne rend que deux compteurs ; elle ne se joint que par le serveur de l'hôte, `platform` étant hors du Data API.
- L'état d'un module vit dans chaque bundle serverless : une route ou une page qui n'importe pas l'enregistrement de `registerOrgLimits` sert sans limite (même contrainte et même garde de test que les fonctions métier).

## Écart avec le code

- `account_owner_kinds` et `accounts_per_owner_max` sont déclarés et lus ; leur contrôle dans `createAccount` appartient au chantier des connecteurs ([connecteurs et comptes](connecteurs-et-comptes.md)).
- Livré pour la 1.2.0 (migration `20261001090000_v1_2_0.sql`, partie 1 : `signup_org`, `org_skeleton` ; partie 2 : `org_usage`).

## Questions ouvertes

Aucune à ce jour.

## Historique

- 2026-09-30 : capacités par organisation déclarées par le paquet, valeurs fournies par l'hôte, refus décidés par le service — décidé par JB (source : ADR-022, story E12-S02).
- 2026-09-30 : inscription libre d'une personne vérifiée, activée par l'hôte ; inscription sur code d'accès écartée — décidé par JB (source : ADR-023, story E12-S01).
- 2026-10-01 : compteurs lisibles sans session (`orgUsage`, ADR-022 § 10) — décidé par JB (source : amendement d'ADR-022).
- 2026-10-01 : refonte en document de conception vivant, qui reprend ADR-022, ADR-023, l'épic E12 et les choix HN-E12S01 — décidé par Alexis, accord de JB.
