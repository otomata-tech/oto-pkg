# Connecteurs et comptes

- **Statut** : validé avec JB le 30/09/2026
- **Dernière révision** : 2026-10-01

## Résumé

Toute fonction métier passe par l'outil `call` et un catalogue unique, quelle que soit sa source : native, simulée, inscrite par l'hôte, ou connecteur partagé. Un appel est porté par une équipe et, s'il touche un tiers, par un compte résolu dans un ordre fixe, sans choix silencieux. Le secret d'un compte est toujours fourni par le consommateur : ni le paquet ni la bibliothèque de connecteurs n'en lisent un de leur environnement.

## Contexte

La V1 ne porte qu'un connecteur simulé, `mail`, les fonctions natives `table.*` et `node.*`, et les fonctions métier qu'un ERP inscrit au catalogue. Les connecteurs réels (CRM, mail, ERP d'un tiers) arrivent ensuite. Deux besoins coexistent : un projet hôte qui ajoute le paquet veut d'abord brancher son propre backend ; des connecteurs communs (un CRM, une messagerie) servent à plusieurs hôtes et ne doivent s'écrire qu'une fois. Le service connecteurs séparé prévu au départ n'a jamais existé.

## Objectifs et non-objectifs

- Un seul contrat vu des assistants : catalogue, `call`, modes de compte (réel, bac à sable, simulé), confirmation en deux temps (ADR-002).
- Aucune ambiguïté résolue en silence : équipe et compte se choisissent dans un ordre écrit, sinon le refus liste les candidats.
- Un connecteur propre à un hôte s'écrit dans l'hôte ; un connecteur partagé s'écrit une fois.
- Hors objectif : reprendre les outils d'Oto ou ses conventions (`_org`, `_run_id`, `oto_*`) ; un service connecteurs à héberger à part ; le coffre et les comptes réels en V1.

## Conception

### Deux sortes de connecteurs (ADR-019 amendé le 2026-09-30)

- **Propre à un hôte** : écrit à la main dans le projet hôte, en TypeScript, au contrat de fonction du paquet (`defineFunction`), puis inscrit au catalogue. C'est le cas normal : le premier connecteur d'un projet qui ajoute le paquet est son propre backend.
- **Partagé** : sa source vit dans la bibliothèque `oto-connectors`, au format YAML (une description par fonction servie : nom, description en anglais, schéma, classe, exemples, refus nommés, et l'appel derrière) ; sa fabrique en tire des fonctions TypeScript au contrat du paquet, livrées dans un paquet npm que le paquet déclare et inscrit. La source de vérité reste dans `oto-connectors`.
- Les deux s'exécutent dans le serveur de l'application hôte, sans service intermédiaire (ADR-019 § 1) : installé dans l'ERP d'un client, le paquet exécute les connecteurs chez lui.
- **Le secret est toujours fourni par le consommateur** : la bibliothèque n'en lit aucun (garde mécanique) et un connecteur le reçoit en paramètre ; un appel sans secret échoue au lieu de retomber sur une clé par défaut (ADR-007 § 3). Côté paquet, le secret d'un compte vit dans le coffre du paquet, déchiffré par le serveur de l'hôte pour le seul appel au tiers ; il ne revient jamais vers un écran, le modèle ou le journal (ADR-019 § 3, NFR-ADMIN-01).
- Le contrat vu des assistants ne change pas (ADR-019 § 4). Le branchement « distant » d'ADR-007 § 5 (un serveur MCP tiers, ou l'ERP existant d'un client) reste possible ; il ne sert pas aux connecteurs écrits par l'équipe (ADR-019 § 5, hypothèse à confirmer par JB).
- Une dépendance ajoutée pour un tiers pèse sur tous les hôtes : un appel `fetch` sans SDK est préféré (`CLAUDE.md § Justifier une surface nouvelle`).

### Catalogue et activation

- H80 : le catalogue de `call` vit dans le code, avec trois sources : native (`table.*`), simulée (`mail.*`) et ERP (inscrite par l'hôte) ; chaque fonction porte son origine et sa classe (`read`, `write`, `sensitive`).
- H81 : l'activation d'un connecteur se range dans `connector_activations(org_id, connector, state)` ; les fonctions natives et ERP sont toujours actives.
- E04-S01 N9, E04-S01 N27, E04-S01 N38 : les connecteurs actifs se relisent à chaque requête (`tools/list`, `find`, `call`, `context`, `read`), sans cache : une activation vaut dès la requête suivante. Ils se lisent au premier usage d'une requête MCP et ne valent que pour elle ; un non-membre reçoit un ensemble vide, sans lecture. Une panne ne touche que `tools/list`, servie sans exemples de connecteur (log serveur) ; `context` échoue en `internal` quand ses lignes connecteurs ne se lisent pas.
- E04-S01 N13 : désactiver un connecteur arrête aussitôt ses fonctions et garde ses comptes, qui reviennent à la réactivation. E04-S01 N18 : date d'activation = dernière mise à jour de la ligne active ; activer un connecteur déjà actif n'écrit rien ; désactiver ne touche pas `activated_by` ; un connecteur inactif se lit sans date ni auteur.

### Fonctions de l'ERP au catalogue

- H108 : l'hôte inscrit ses fonctions ERP par `registerFunctions([...])` de `@otomata_tech/oto_platform/server` (`src/lib/fonctions-metier.ts`) : origine `erp`, même contrat que les autres, exécution pour l'appelant.
- E08-S05 NH1 : `registerFunctions` remplace à chaque appel toute la source ERP (une seule liste) : un rechargement à chaud ne crée pas de doublon. E08-S05 NH12 : la liste ERP vit dans `server/catalog/erp-source.ts`, sans import à l'exécution : le registre la lit, `erp.ts` lit le registre pour valider ; ni cycle d'import ni état dans le registre.
- E08-S05 NH2 : `src/lib/fonctions-metier.ts` est importé pour son effet par chaque route de l'hôte qui monte une porte du paquet (`/api/mcp`, `/api/platform/[...route]`, `/api/mcp-admin`) ; un test le vérifie.
- E08-S05 NH3 : une inscription invalide lève `CatalogRegistrationError` au chargement de la route et n'inscrit rien : une erreur de développeur casse la route au lieu de servir un contrat faux.
- E08-S05 NH8 : le contrat servi par `read` et le contrôle de schéma strict à l'inscription se lisent sur le JSON Schema d'entrée, `z.toJSONSchema(schema, { io: "input" })` : un champ à `.default()` y est facultatif. E08-S05 NH16 : un schéma que JSON Schema ne sait pas écrire côté entrée (`z.date()`, `z.bigint()`, `z.map()`, `z.custom()`) est refusé à l'inscription, « <nom>: schema must be representable in JSON Schema (…) » ; une `transform` s'inscrit. E08-S05 NH17 : chaque objet du schéma est fermé, imbriqué compris : un objet aux propriétés déclarées sans `additionalProperties: false` en entrée est refusé ; un `z.record` garde ses clés libres.
- E08-S05 NH4, E08-S05 NH19 : une fonction ERP reçoit `{ db, identity, accessToken }` : elle construit son client de l'ERP sur le jeton vérifié de l'appelant, donc sous la RLS de l'ERP ; sans jeton, rien ne court. Le jeton ne va qu'au contexte d'une fonction d'origine `erp` (`runCall`) : une fonction native ou de connecteur ne le reçoit pas.
- E08-S05 NH6 : la description de `call` ne cite jamais une fonction ERP (exemples : connecteurs activés, puis `table.rows`) ; une fonction ERP se trouve par `find` et par les étapes des procédures.
- E08-S05 NH18 : une `PlatformError` `internal` levée par `run` ou `summarize` de l'ERP est servie comme une panne, sa cause écrite au log par l'enveloppe (`[platform] call: ERP function <nom> failed`) ; toute autre erreur, la porte la journalise.

### L'appel : `call`

- E03-S04 N6 : le nom de fonction est normalisé (espaces de bord retirés, minuscules) avant la recherche. E03-S04 N10 : `CallInput` est déclaré dans `server/calls.ts`, car `server/` n'importe pas `mcp/` ; un test de types exige son égalité avec le schéma de `call` sans `ctx`.
- H86 : une fonction sensible se fait en deux temps : sans `confirm`, un récapitulatif nominatif et rien d'exécuté ; avec `confirm: true`, l'exécution directe. E03-S04 N1 : ce récapitulatif est un résultat ordinaire (`status: "needs_confirmation"` dans les données), pas une erreur. E03-S04 N2 : `confirm: true` sur une fonction non sensible est ignoré.
- H87, E03-S04 N3 : `next_actions` d'un appel est la liste `next` de la fonction, moins les fonctions sensibles, inactives pour l'organisation ou absentes du catalogue : aucune suite ne mène à une impasse.
- E03-S04 N4 : le compte-rendu d'une fonction avec compte finit par « Team X · account « Y » (mode). » (« No team » sans équipe porteuse) ; une fonction native ou ERP ne le porte pas.
- E03-S04 N9 : le code `ctx` de l'appel passe dans le contexte d'exécution (`FunctionContext.ctx`) : une écriture faite par un assistant le porte dans sa provenance.
- E03-S04 N7, E03-S04 N19 : la cible au journal d'un `call` est, sur un succès, le nom canonique de la fonction ; sur un refus, la fonction envoyée, sans espace de bord, coupée à 200 caractères, posée par la porte avant ses gardes ; `team_id` et `account_id` restent nuls quand le refus précède leur choix. E03-S04 N8 : l'équipe que rend la fonction (`teamId` de `FunctionOutput`) prime sur l'équipe calculée pour la ligne de journal : `table.*` rend celle du tableau chargé, alias compris. Voir [journal et retours](journal-et-retours.md).

### Équipe porteuse

- H84 : l'équipe porteuse d'un appel est, dans l'ordre : `call.team`, l'équipe du tableau pour `table.*`, celle de la dernière procédure servie sous ce `ctx`, l'équipe par défaut ; si l'endroit ne tranche pas, `ambiguous_team` liste les équipes.
- E04-S01 N1 : quand l'argument, le tableau et la dernière procédure ne décident pas, l'équipe par défaut porte l'appel si elle le peut, sinon la seule autre qui le peut ; plusieurs → `ambiguous_team` ; une fonction sans compte n'est jamais ambiguë.
- E04-S01 N2 : `team` désigne une équipe de la personne, par slug ou par nom (sans casse ni accent) ; sinon `not_found` qui liste ses équipes. E04-S01 N29 : deux équipes homonymes (accents confondus) → `ambiguous_team` qui liste slug et nom ; un slug exact l'emporte toujours sur un nom.
- E04-S01 N16 : l'endroit (tableau, dernière procédure d'une équipe) donne l'équipe propriétaire effective qui porte l'appel, même si la personne n'en est pas membre ; un propriétaire d'organisation ou personnel ne décide pas.
- E04-S01 N11, E04-S01 N22 : la dernière procédure se lit au journal du `ctx` (lignes `<p>_context` et `<p>_read` réussies de la personne, cible = procédure visible), la plus récente d'abord, sur les 50 dernières lignes au plus ; seules les cibles de forme chemin, sans doublon, partent dans la liste lue (`path = any`) ; une ligne pas encore écrite n'est pas vue.

### Comptes et résolution

- Un compte appartient à l'organisation, à une équipe ou à une personne (`accounts.owner_kind`) ; son niveau se calcule comme celui d'un nœud, sans héritage (voir [droits d'accès](droits-d-acces.md), H67, H82).
- D42 : `accounts.owner_team_id` est une clé différée sans action, comme `nodes.owner_team_id` : une équipe qui possède un compte de connecteur ne se supprime pas, la base le refuse au `commit`.
- H83 : le compte d'un appel se résout dans cet ordre : celui que nomme `call.account`, celui de l'équipe porteuse, celui de l'organisation, parmi les comptes dont le niveau suffit ; un compte nommé introuvable rend `not_found`, sans repli.
- E04-S01 N3 : `account` désigne un compte visible du connecteur par libellé (sans casse ni accent) ou identifiant ; libellé partagé → `ambiguous_account`, niveau insuffisant → `forbidden`, désactivé → `not_enabled` ; jamais de repli. E04-S01 N5 : deux comptes utilisables à la même étape → `ambiguous_account`, qui demande `account`. E04-S01 N31 : `ambiguous_team` et `ambiguous_account` listent les candidats et demandent de les montrer à l'utilisateur sans choisir.
- E04-S01 N6 : aucun compte visible → `not_enabled` avec le lien `<origin>/admin/connectors` ; comptes visibles sous le niveau exigé → `forbidden`, qui dit à qui demander. E04-S01 N7 : un compte `disabled` ou `error` n'est jamais résolu. E04-S01 N20 : compte nommé en état `error` → `not_enabled` « Account « X » is in error. Ask <qui> to fix it, or name another account. ». E04-S01 N30 : sous le niveau et désactivé ou en erreur, le refus de niveau (`forbidden`) passe avant celui d'état ; un seul refus par appel.
- E04-S01 N12 : libellé d'un compte de 1 à 80 caractères, unique sans casse dans l'organisation, tous connecteurs confondus (index `accounts (org_id, lower(label))`) ; le `23505` devient `conflict` ; un connecteur inactif admet un compte.
- E04-S01 N15 : un compte personnel n'est créé que par son propriétaire, administrateur compris : aucun champ ne désigne une autre personne. E04-S01 N19 : `createAccount` pour une équipe inconnue de l'organisation → `invalid_arguments` « Unknown team <id> in <org>. ».
- E04-S01 N35 : `listUsableAccounts` valide sa saisie (`connectorRefSchema`) et refuse un connecteur inconnu ou natif comme `createAccount` ; un connecteur activable sans compte rend une liste vide. E04-S01 N36 : `disableAccount` d'un compte inconnu ou invisible → `not_found` « Unknown account <id>. ».
- H85 : un compte de connecteur est toujours simulé en V1 : créer un compte réel ou de bac à sable rend `unavailable_in_v1`, et l'exécution simulée écrit dans `sim_outbox` sans rien envoyer. E03-S04 N5 : un compte non simulé rend `unavailable_in_v1` avant tout appel de la fonction (`requireSimulated`).

### Le connecteur simulé `mail`

- E04-S01 N14 : brouillon simulé d'identifiant `sim_` + 8 hex, `subject` ≤ 200, `body` ≤ 20 000, un seul destinataire ; le récapitulatif garde les 300 premiers caractères du corps.
- E04-S01 N10 : `mail.send_draft` envoie depuis le compte résolu ; un brouillon d'un autre compte ou déjà envoyé → `conflict` qui donne l'appel correct. E04-S01 N36 : sa mise à jour gardée par `status = 'draft'` qui ne change rien, brouillon encore à envoyer → `forbidden`.

### Ce que `context` dit des connecteurs (bloc `team`)

- E04-S01 N8 : ligne d'un connecteur : équipe, `(write)` pour ce que la personne peut faire, compte et mode (`simulated`, `sandbox`, `live`). E04-S01 N17 : sans équipe, le bloc dit « No team. » puis les lignes des connecteurs actifs (compte de l'organisation et son mode).
- E04-S01 N21 : formes hors base : « no team (write), account « … » (simulated) » ; « several accounts; ask the user which one… » ; demi-lignes lecture et écriture ; noms d'équipe coupés à 40 caractères. E04-S01 N39 : comptes visibles seulement en lecture : « calls will be refused until you are given write access; you can only read « … » », la liste en dernier. E04-S01 N31 : la même consigne de montrer sans choisir précède la liste.

### Refus de saisie

- E04-S01 N28 : `invalid_arguments` « Invalid arguments: <chemin>: <message>; … » (`invalidInput`), chaque problème nommé par son chemin, racine `(root)`, 20 au plus puis « … and N more ». E04-S01 N32 : un refus bâti sur une liste nomme 20 éléments au plus puis « … and N more » (`boundedList`) : équipes, comptes, connecteurs activables, problèmes de saisie ; `details.teams` garde toutes les équipes.
- E04-S01 N33 : `connectorNameSchema`, `accountLabelSchema` et `accountModeSchema` restent internes à `schemas/connectors.ts`, hors de la face `./schemas`, tant que seuls ses schémas les lisent. E04-S01 N34 : un seul `invalidInput(parsed.error)` dans `server/errors.ts` ; `memberDirectory` et `DirectoryEntry` vivent dans `server/directory.ts` ; `levelName` se bâtit sur `ACCESS_LEVEL_NAMES`.

## Décisions et alternatives écartées

- **Un service connecteurs sans état, dans un autre dépôt, joint comme un serveur MCP** (ADR-007 § 1 : langage et dépôt au choix de l'équipe ; § 2 : `tools/list` alimente le catalogue, `tools/call` exécute, secret du compte dans un en-tête ; § 4 : déploiement partagé en France, joint par réseau privé ou jeton de service, une instance par cellule sur exigence). Remplacé par ADR-019 (D129) : un morceau de plus à héberger et joindre, une latence réseau par appel, un second langage ; le service n'a jamais été construit.
- **D108** : les connecteurs (V2) repartent de zéro ; le service connecteurs n'est pas construit sur `oto-core` et ne reprend pas les outils d'Oto ; langage et dépôt au choix de l'équipe ; contrat vu du paquet : un serveur MCP, secret en en-tête, sans état. Remplacée par D129 pour le dépôt et le langage.
- **D129, dans sa première lecture** : « les connecteurs réels s'écrivent en TypeScript dans le paquet npm, sans service connecteurs séparé » (ADR-019, JB, 2026-09-29), ce qui écartait toute bibliothèque commune (« on part de zéro : pas d'oto-core »). Amendée le 2026-09-30 : la bibliothèque `oto-connectors` (ex `oto-core`) est gardée pour les connecteurs partagés, au secret fourni par le consommateur ; seuls les connecteurs propres à un hôte s'écrivent à la main au contrat du paquet. Les deux phrases décrivent deux sortes de connecteurs.
- **Monter Oto en connecteur distant** : importe sa surface (`oto_call`, `_org`, `_run_id`) et son journal, contraires à ADR-002. Écarté (ADR-007).
- **Un choix silencieux entre équipes ou comptes** : écarté ; l'assistant montre les candidats à l'utilisateur.

## Sécurité et confidentialité

- Aucun outil n'accepte un secret en argument ; le secret ne revient jamais vers un écran, le modèle ou le journal (ADR-019 § 3).
- La bibliothèque partagée ne lit aucun secret ; le consommateur l'injecte et un appel sans secret échoue.
- Le jeton de l'appelant ne va qu'aux fonctions d'origine `erp` (E08-S05 NH19), qui s'exécutent sous la RLS de l'ERP.
- Fonctions sensibles en deux temps, jamais proposées en suite d'un autre résultat (H86, H87).

## Écart avec le code

- Le contrat public de l'hôte est aujourd'hui `defineErpFunction` et `registerFunctions` (origine `erp`) ; `defineFunction` n'est exporté que pour les sources du paquet, et l'origine `service_connecteurs` de `server/catalog/define.ts` porte encore le nom du service abandonné.
- Ni le paquet npm de connecteurs partagés issu d'`oto-connectors`, ni son inscription, ni le secret dans le contexte d'appel ne sont écrits ; les comptes sont simulés seuls (H85).
- Restent en V2, avec leurs stories : connecteur Sellsy réel, connecteur mail réel, comptes tiers et coffre (AES-GCM, OAuth ou clé du tiers, santé), écran Connecteurs, sondes et alertes des comptes (`.method/sprint/status.md § Stories V2`). La story du connecteur Sellsy perd son client MCP de serveur à serveur et sa table `functions` de source distante.

## Questions ouvertes

- Sur un projet hôte qui ajoute le paquet : comment choisir les connecteurs partagés qu'il apporte, et comment créer le connecteur de sa propre API.
- Le branchement distant d'ADR-007 § 5 reste-t-il permis (ADR-019 § 5, hypothèse à confirmer par JB) ?

## Historique

- 2026-09-23 : connecteurs dans un service sans état, joint comme un serveur MCP, dans un autre dépôt ; trois branchements — décidé par JB (source : ADR-007).
- 2026-09-29 : catalogue, activation, comptes simulés, équipe porteuse et résolution du compte, fonctions de l'ERP au catalogue, livrés dans la 1.0.0 — choix du projet (source : H80 à H87, H108, stories E03-S04, E04-S01, E08-S05).
- 2026-09-29 : connecteurs écrits en TypeScript dans le paquet, sans service séparé ; remplace ADR-007 § 1, § 2 et § 4 et D108 — décidé par JB (source : ADR-019, fiche D129).
- 2026-09-30 : deux sortes de connecteurs : la bibliothèque `oto-connectors` est gardée pour les connecteurs partagés, les connecteurs propres à un hôte s'écrivent au contrat `defineFunction`, le secret est toujours fourni par le consommateur — décidé par Alexis, accord de JB à l'oral (point du 30/09).
- 2026-10-01 : refonte en document de conception vivant, qui reprend ADR-007, ADR-019, D42, D108, D129, H80 à H87, H108 et les choix des stories E03-S04, E04-S01, E08-S05 — décidé par Alexis, accord de JB.
