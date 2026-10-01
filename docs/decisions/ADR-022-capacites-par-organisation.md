# ADR-022 — Capacités par organisation : le paquet les déclare et décide les refus, l'hôte en fournit les valeurs

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-30 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

Un hôte qui vend le paquet par offres (le SaaS : une offre gratuite, une offre payante, un prix par
organisation) doit brider certaines écritures : nombre de membres, d'équipes, de connecteurs activés,
stockage des fichiers. Le paquet ne connaît ni offre, ni prix, ni prestataire de paiement ; un ERP qui
l'installe sans rien vendre ne doit rien voir changer.

Trois contraintes du paquet encadrent la réponse :

- un refus est décidé par le service, avant sa requête (ADR-012 § 3) ; un filtre dans les routes de
  l'hôte dépendrait des chemins internes du paquet et contournerait cette garde ;
- le paquet n'écrit dans `platform` qu'au nom d'un appelant vérifié, et la connexion d'administration
  n'est jamais déployée (ADR-006 § 3, ADR-012 § 1). Or l'état d'une offre change sur un événement du
  prestataire de paiement (un webhook), qui n'a pas d'appelant : des capacités stockées dans
  `platform` exigeraient une identité « robot » de l'équipe plateforme gardée par l'hôte, ou un rôle de
  base nouveau que chaque hôte devrait poser par `db prepare` ;
- l'état d'une offre vit déjà chez l'hôte (son schéma à lui) ; le recopier dans `platform` ferait deux
  sources à tenir égales.

Les drapeaux (`orgs.flags`, ADR-006 § 7) ne conviennent pas : booléens, écrits par l'administrateur de
l'organisation, faits pour la mise en service progressive d'un comportement.

## Décision

1. **Le paquet déclare un registre fermé de capacités**, typé par Zod (`schemas/limits.ts`) : un nom,
   un type (nombre entier ≥ 0, octets, ensemble de valeurs), une phrase. Liste de la 1.2.0 :
   `members_max`, `teams_max` (0 admis), `storage_bytes`, `connectors_max`, `account_owner_kinds`,
   `accounts_per_owner_max`. Une capacité s'ajoute avec le service qui la lit ; aucune n'est un nom
   d'offre.
2. **Les valeurs viennent de l'hôte**, par une fonction qu'il enregistre une fois, comme les fonctions
   métier (`registerFunctions`) : `registerOrgLimits({ read, raiseUrl? })`, `read({ id, slug })`, synchrone ou
   non, rendant les capacités de l'organisation, appelée à chaque écriture bridée et à chaque lecture de l'état
   des écrans (l'hôte la met en cache s'il le veut). La valeur rendue repasse le schéma du registre. **Sans fonction
   enregistrée, ou sans valeur pour une capacité : aucune limite**, sauf `storage_bytes`, dont le défaut
   reste le quota de 10 Go d'avant (`ORG_QUOTA_BYTES`) : un ERP garde exactement son comportement.
3. **Chaque service concerné décide le refus avant son écriture**, sous un verrou consultatif par
   organisation (classe 7601 ; 7501 pour le stockage, déjà pris par `requireQuota`), dans la
   transaction qui compte puis écrit. Le refus garde un code de la liste fermée : `forbidden` avec
   `reason: "limit"`, `limit` (le nom) et `max` ; le stockage garde `too_large`, `reason: "quota"`. Le
   message est neutre (« <organisation> is limited to 1 team »), sans mot d'offre ni de prix.
4. **Une fonction de l'hôte en échec refuse** (`internal`, sans son message, comme le point de création
   d'une organisation) : une limite ne tombe jamais en silence.
5. **Les limites valent pour toutes les portes**, API, MCP des organisations et MCP admin, équipe
   plateforme comprise : relever une limite se fait chez l'hôte, jamais par un contournement du paquet.
6. **Seuls les ajouts se refusent.** Une limite abaissée ne supprime ni ne suspend rien : les équipes,
   membres, activations et fichiers au-delà restent ; la création suivante est refusée.
7. **Les écrans du paquet lisent les mêmes valeurs** par le service `orgLimitsView` (compte et plafond
   de chaque capacité lue par un écran) et grisent le geste refusé ; si l'hôte a donné `raiseUrl`, un
   administrateur y voit un lien « Relever la limite », vers `<raiseUrl>?capacity=<nom>` : l'hôte sait quelle
   limite relever.
8. **Les comptes de connecteur se comptent au propriétaire** : un compte compte une fois, pour
   l'organisation, l'équipe ou la personne qui le possède, jamais pour chaque personne qui peut s'en
   servir ; un partage ne change aucun compte. `account_owner_kinds` et `accounts_per_owner_max` sont
   déclarés et lus ; leur contrôle dans `createAccount` appartient au chantier des connecteurs.
9. **La surface MCP ne change pas** (ADR-002) : la liste des six outils est la même quelles que soient
   les capacités ; seul l'effet d'un outil est refusé, avec le message du service.
10. **Des compteurs se lisent sans session** (amendement du 2026-10-01, décidé par JB) : l'hôte prévient d'un
   seuil de membres hors de toute requête d'une personne (tâche planifiée, webhook de paiement). `orgUsage(orgId)`
   rend le nombre de membres et d'invitations en attente d'une organisation, et rien d'autre, par la fonction
   `org_usage`, accordée à `anon` comme `org_by_host` et `org_contact` ; `platform` reste hors du Data API, la
   fonction ne se joint que par le serveur de l'hôte. Une organisation inconnue rend `null`.

## Conséquences

### Positives
- Aucune migration, aucune écriture sans appelant, une seule source de l'état d'une offre.
- La garde « un refus est décidé par le service » tient ; les écrans savent quoi griser.
- Un ERP sans offre ne voit rien ; un ERP qui veut ses propres limites rend des constantes.

### Négatives
- L'équipe plateforme ne règle pas une limite par le MCP admin : un geste commercial se fait dans
  l'hôte.
- Un appel à du code de l'hôte dans le chemin de chaque écriture bridée ; sa panne refuse l'écriture.
- L'état d'un module vit dans chaque bundle serverless : une route ou une page qui n'importe pas
  l'enregistrement sert sans limite (même contrainte et même garde de test que les fonctions métier).

### Neutres
- Les invitations en attente comptent dans `members_max` ; l'acceptation, faite en SQL au retour de
  connexion, ne recompte pas.

## Alternatives considérées

### Capacités stockées dans `platform` (colonne `orgs.limits`, écrite par l'équipe plateforme et l'hôte)
Réglage par le MCP admin, lecture en SQL. Rejetée : l'événement du prestataire n'a pas d'appelant
(identité robot ou rôle nouveau), et l'état de l'offre vivrait à deux endroits.

### Point d'autorisation de l'hôte (`authorize({ orgId, action }) → null | message`)
Le moins de code, mais les écrans ne savent pas d'avance ce qui est refusé. Rejetée.

### Filtre dans les routes de l'hôte
Dépend des chemins internes du paquet et contourne la garde du service. Rejetée.

### Drapeaux étendus d'un niveau « réservé à l'hôte »
Mélange mise en service progressive et droit commercial, et reste booléen. Rejetée.
