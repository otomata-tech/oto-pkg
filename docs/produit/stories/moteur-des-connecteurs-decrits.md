# Story — Moteur des connecteurs décrits : le paquet exécute les connecteurs que l'hôte déclare

## Meta

| Champ | Valeur |
|-------|--------|
| **Épic** | Connecteurs et comptes (V2) |
| **Parcours** | 4.2 Faire (exécution) ; 4.5 Administrer |
| **Statut** | 🔵 In Progress |
| **Priorité** | Must (V2) |
| **Référence UI** | N/A (aucun écran : la déclaration est du code de l'hôte, la sonde un service) |
| **Conventions** | database, supabase, security, testing, registry, mcp, stack |
| **Estimation** | L |
| **Porteuse de migration** | oui (fonction `declare_connector`, additive) |
| **Dépend de** | prise-des-connecteurs (table `connectors`, coffre, secret à l'appel), dans la 1.5.0 non publiée |

## Contexte

Le paquet sait ce qu'est un connecteur mais n'en contient aucun : c'est un moteur générique. L'application hôte
déclare au paquet les connecteurs qu'elle utilise : des connecteurs partagés, dont les définitions sont générées par
la fabrique du dépôt `connectors` (`connectors : docs/conception/fabrique.md`), et ses connecteurs propres, écrits à
la main dans la même forme. Le paquet ne dépend pas de ce dépôt : il définit lui-même le type de définition qu'il
accepte, de même forme que la sortie de la fabrique (`connectors : ts/src/types.ts`). Le témoin `notion`, écrit à la
main dans le paquet par la prise des connecteurs, en sort.

**Périmètre**
- Le type `ConnectorDefinition` et la déclaration `registerConnectors(definitions)`, exportés par `/server`.
- Le JSON Schema 2020-12 d'une fonction décrite validé tel quel (Ajv 2020) et servi tel quel par `read` ; les
  fonctions natives et de l'ERP gardent Zod.
- Le moteur : requête composée depuis la définition, authentification `bearer` ou `api_key`, délai, table d'erreurs,
  rythme par compte, nouvel essai après un 429, pagination, contrôles avant l'appel et sur la réponse, texte du
  résultat.
- La sonde d'un compte, en service (`probeAccount`), sans écran ni tâche planifiée.
- La liste `platform.connectors` tenue depuis la déclaration, sans SQL de l'hôte.
- L'application de référence déclare une liste vide.

**Hors périmètre**
- Les authentifications `basic`, `oauth2_client_credentials`, `oauth2_user` et `none` : refusées nommément à la
  déclaration (un compte ne porte qu'un secret).
- Une entrée `handwritten` de la fabrique, le quota (`cost`, `quota`), l'exposition (`exposure`).
- L'écran de la sonde et sa tâche planifiée (story `sondes-et-alertes.md`).

**Refs :**
- Conception : `docs/conception/connecteurs-et-comptes.md` § Moteur des connecteurs décrits
- Format : `connectors : docs/conception/format-de-description.md`

## Critères d'acceptation

Déclaration
- [ ] **AC1** **Given** une définition valide **When** l'hôte appelle `registerConnectors([définition])` **Then** ses
  fonctions entrent au catalogue de `call` avec l'origine `connecteur`, leurs exemples sans titre ; un second appel
  remplace toute la déclaration (un rechargement à chaud ne double rien).
- [ ] **AC2** **Given** une fonction déclarée **When** `read` la sert **Then** son schéma est celui de la description,
  tel quel ; **When** `call` reçoit des arguments que ce schéma refuse **Then** `invalid_arguments` nomme chaque
  problème par son chemin, rien n'est envoyé.
- [ ] **AC3** **Given** une définition invalide (nom, espace de noms déjà servi, doublon, adresse, authentification
  hors `bearer` et `api_key`, secret à plusieurs champs, schéma non strict ou non compilable, exemple refusé, en-tête
  qui remplacerait l'authentification, liste en query sans `queryArrays`, curseur sans place, contrôle inconnu,
  fonction sensible sans récapitulatif, sonde mal formée) **When** l'hôte la déclare **Then**
  `CatalogRegistrationError` la nomme et rien n'est déclaré.
- [ ] **AC4** **Given** l'application de référence **When** elle monte ses routes **Then** elle déclare une liste vide.

Moteur
- [ ] **AC5** **Given** une fonction déclarée **When** elle court **Then** la requête porte les en-têtes du connecteur,
  puis les constantes et arguments de la fonction, l'authentification en dernier ; le chemin encode ses `{param}` ;
  la query porte les constantes puis les arguments, les listes selon `queryArrays` ; un argument `encode: json` part
  en chaîne JSON ; le corps part quelle que soit la méthode (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
- [ ] **AC6** **Given** une fonction paginée **When** l'agent passe `all_pages` **Then** le moteur suit `next` vers
  `requestParam`, s'arrête quand `more` est faux ou `next` vide, au plus `max_pages` (borné par `maxPages`) ; sans
  `all_pages`, une page et la suite dite dans le texte.
- [ ] **AC7** **Given** un contrôle `equal_sums` **When** les sommes diffèrent (somme décimale exacte) **Then** le refus
  nommé de la fonction, `invalid_arguments`, et rien n'est envoyé.
- [ ] **AC8** **Given** une attente `non_empty` **When** la réponse n'a pas la valeur **Then** le refus nommé.
- [ ] **AC9** **Given** un statut d'erreur du tiers **When** la fonction le reçoit **Then** son refus propre à ce statut,
  sinon la table du connecteur, traduit en code du paquet ; un 429 se rejoue deux fois au plus après son
  `Retry-After` (10 s au plus) ; le débit déclaré se tient par compte.
- [ ] **AC10** **Given** un compte réel **When** la fonction court **Then** son secret ne va qu'à l'en-tête
  d'authentification : jamais dans un argument, un texte, une erreur, le journal ni un log ; sans secret, `internal`
  et rien n'est envoyé ; une fonction sensible se récapitule par son gabarit avant l'accord.
- [ ] **AC11** **Given** une réponse **When** le moteur compose le résultat **Then** une ligne de tête, une ligne JSON
  par élément d'une liste (taillé par `output`), la suite de la pagination ; les mêmes données en champs.

Sonde et liste des connecteurs
- [ ] **AC12** **Given** un compte d'un connecteur à sonde **When** qui le gère appelle `probeAccount` **Then** sain, ou
  non sain avec la raison (secret absent, refus du tiers, chemin vide) ; réservé au niveau gestion ; un connecteur
  sans sonde est refusé ; hors `call`, ni journal ni quota.
- [ ] **AC13** **Given** un connecteur déclaré absent de `platform.connectors` **When** il est activé ou reçoit un compte
  **Then** son nom et son libellé y entrent, dans la transaction de l'écriture ; un nom présent ne change pas ; rien
  n'est retiré ; l'hôte n'écrit aucun SQL.
- [ ] **AC14** **Given** le témoin `notion` **When** le paquet est construit **Then** il n'y est plus ; la ligne `notion`
  de la table reste.

## Implémentation

### Fichiers créés
- `packages/plateforme/server/connectors/{definition,declaration,engine}.ts`, `server/catalog/{arguments,connector-source}.ts`
- `packages/plateforme/migrations/20261007090000_platform_connecteurs_declares.sql` (et sa copie sous `supabase/migrations/`)
- `tests/factories/described-connector.ts`, `tests/unit/{connectors-declaration,connectors-engine}.test.ts`

### Fichiers modifiés
- `packages/plateforme/server/{calls,procedures-check,index}.ts`, `server/catalog/{define,registry,erp}.ts`,
  `server/connectors/{http,accounts,activations}.ts`, `packages/plateforme/package.json` (`ajv`)
- `src/lib/fonctions-metier.ts`
- Tests : `tests/unit/{catalog,connectors-http,connectors-services,mcp-admin-connectors,fonctions-metier-imports,package-publish}.test.ts`,
  `tests/integration/{prise-des-connecteurs,connectors-services,mail-simulated}.test.ts`, `tests/factories/table-fixture.ts`

### Fichiers supprimés
- `packages/plateforme/server/connectors/notion/search-workspace.ts`, `tests/unit/notion-search.test.ts`

## Rayon d'impact

### Appelants
- `CatalogFunction.schema` (devient Zod ou JSON Schema) — `git grep -nE "\.schema\.(safeParse|shape|parse)" -- packages src tests scripts`
  → 34 usages : `server/calls.ts` et `server/procedures-check.ts` passent par `checkArguments` et `argumentNames` ;
  `server/catalog/erp.ts` garde Zod (`ErpFunction` au type `ZodCatalogFunction`) ; `mcp/admin/ops.ts` lit le schéma
  de ses opérations, pas celui du catalogue (inchangé) ; les doublures de test (`table-fixture.ts`,
  `mail-simulated.test.ts`, `catalog.test.ts`) passent par `checkArguments` ; les tests des fonctions natives gardent
  `safeParse`, `defineFunction` rendant `ZodCatalogFunction`.
- `requestJson` (signature changée) — `git grep -n requestJson -- packages src tests` → `http.ts`, le témoin retiré,
  `tests/unit/connectors-http.test.ts` réécrit.
- `activateConnector`, `createAccount` (appellent `keepDeclaredConnector`) — `git grep -nE "activateConnector\(|createAccount\(" -- packages`
  → `api/admin/{accounts,connectors}.ts`, `mcp/admin/tools/connector.ts` : inchangés, la ligne ne s'écrit que pour un
  connecteur déclaré.
- `registerFunctions` — `git grep -n "registerFunctions(" -- packages src` → réserve désormais aussi les espaces des
  connecteurs déclarés (par `catalogFunctions`), sans changement d'appel.

### Doublons
- Client HTTP : `server/connectors/http.ts` repris et généralisé (méthodes, query, réponse vide, 429, rythme), pas
  dupliqué. Contrôle d'un compte géré : `managedAccount` factorise les trois lectures identiques de `disableAccount`,
  `setAccountSecret` et `probeAccount`. Garde « objet JSON » : `isJsonObject` réutilisé.

### Effet produit
- `find`, `read`, `call`, `context` et le MCP admin listent les connecteurs déclarés comme `mail` ; sans déclaration,
  plus de `notion` au catalogue (l'écran Connecteurs et `admin_connector` ne le proposent plus).
- Une migration additive à appliquer par l'hôte.

### Refacto
- `managedAccount` (trois occurrences) : fait, comportement identique, tests existants verts.

## Tests attendus

- Unit : `connectors-declaration.test.ts` (AC1 à AC3), `connectors-engine.test.ts` (AC5 à AC11), `connectors-http.test.ts`
  (AC9), `fonctions-metier-imports.test.ts` (AC4).
- Intégration : `prise-des-connecteurs.test.ts` (AC2, AC10, AC12, AC13, sur un connecteur déclaré de test).
