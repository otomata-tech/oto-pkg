# Story — Organisation choisie par l'hôte sur le canal MCP

## Meta

| Champ | Valeur |
|-------|--------|
| **Épic** | Monter le paquet dans un ERP sur mesure |
| **Parcours** | Brancher un assistant sur l'ERP |
| **Statut** | ⬜ Draft — conception proposée, à valider avant tout code |
| **Priorité** | Should |
| **Référence UI** | N/A |
| **Conventions** | mcp, security, api, testing |
| **Estimation** | S |

## Contexte

L'organisation vient de l'adresse appelée (ADR-004 § 1, [identité et connexion](../../conception/identite-et-connexion.md)) : `handleMcpPost` lit lui-même l'hôte de la requête (`requestHost`, `mcp/handler.ts`) et `resolveOrg` cherche une égalité exacte dans `org_domains`. L'API des écrans, elle, reçoit l'adresse de l'hôte (`handlePlateforme({ host })`). Deux cas d'un ERP construit sur le paquet cassent aujourd'hui sur le canal MCP :

- **Previews** : chaque déploiement de preview a une adresse nouvelle, inconnue d'`org_domains` → `unknown_org` (404) ; il faudrait déclarer chaque adresse.
- **ERP sur un seul domaine** dont l'organisation se déduit autrement que par le nom d'hôte (un en-tête de l'hôte, une adresse canonique, une organisation unique).

Proposition : **une option `host` de `handleMcpPost`, symétrique de `handlePlateforme`**, qui laisse l'hôte dire quelle adresse servir. L'organisation reste lue dans `org_domains` et l'appartenance revérifiée à chaque appel : seule la source de l'adresse change.

**Refs :**
- Conception : `docs/conception/identite-et-connexion.md` (ADR-004 § 1, § 2, H20), `docs/conception/outils-mcp.md` (porte d'un appel, E03-S01 N1)
- Code : `packages/plateforme/mcp/handler.ts`, `mcp/metadata.ts`, `server/identity.ts`, `server/oauth.ts`

## Conception proposée

- `handleMcpPost(request, { verifyToken, defer, host? })` : `host?: (request: Request) => string | null | Promise<string | null>`. Absente : `requestHost(request.headers)`, comme aujourd'hui.
- L'adresse rendue par `host` est normalisée comme `requestHost` (minuscules, sans port) puis passée à `resolveOrg` ; elle sert aussi au journal et au message `unknown_org`.
- `handleResourceMetadata` reçoit la même option, pour que la découverte OAuth et la porte s'accordent sur l'organisation (la page de consentement lit l'organisation de la ressource, `server/oauth.ts`).
- **Ce qui ne change pas** : le jeton est vérifié avant toute résolution (E03-S01 N1), l'appartenance est relue à chaque appel (ADR-004 § 2), le préfixe des outils reste celui de l'organisation servie, `getPublicOrigin` reste lu dans la requête (l'URL du 401 suit l'adresse réellement appelée).
- **Usage type (README)** : preview → l'hôte rend son adresse canonique (`VERCEL_ENV !== "production"` → adresse de staging déclarée) ; organisation unique → l'hôte rend l'adresse déclarée de cette organisation.

## Critères d'acceptation

- [ ] **Given** un hôte sans option `host` **When** un assistant appelle `/api/mcp` **Then** le comportement est identique à aujourd'hui (tests existants inchangés).
- [ ] **Given** `host` qui rend une adresse déclarée **When** l'appel vient d'une adresse inconnue (preview) **Then** l'organisation de l'adresse rendue est servie, son préfixe sur les outils.
- [ ] **Given** `host` qui rend une adresse inconnue ou `null` **When** l'appel arrive **Then** 404 `unknown_org` après vérification du jeton, comme aujourd'hui.
- [ ] **Given** un appelant qui n'est pas membre de l'organisation rendue par `host` **When** il appelle **Then** refus `not_member` : l'option ne contourne pas l'appartenance.
- [ ] **Given** la même option passée à `handleResourceMetadata` **When** un host découvre les métadonnées **Then** la ressource et l'organisation affichées au consentement sont celles de l'adresse rendue.
- [ ] **Given** `host` qui lève **When** l'appel arrive **Then** 503 « internal », détail au log serveur, jamais d'organisation par défaut.

## Implémentation

### Fichiers à modifier
- `packages/plateforme/mcp/handler.ts` (option, `RequestContext.host`), `mcp/metadata.ts` (même option), `packages/plateforme/README.md` (montage), `packages/plateforme/CHANGELOG.md` (section `### Hosts`).
- `docs/conception/identite-et-connexion.md` : ADR-004 § 1 précisé (« l'adresse appelée, ou celle que l'hôte en déduit »), H20 amendé.

### Patterns à suivre
- `security-patterns.md § Droits dans le service` : l'appartenance reste décidée par le service, l'option ne choisit qu'une adresse.

## Rayon d'impact

### Appelants
- `handleMcpPost` — `rg -n "handleMcpPost" /home/user/oto-pkg/packages /home/user/oto-pkg/src /home/user/oto-pkg/tests` → `src/app/api/mcp/route.ts:16`, `tests/unit/mcp-handler.test.ts:74`, `tests/unit/mcp-metadata.test.ts:243`, `tests/integration/mcp-http.test.ts:82,192` ; option facultative, aucun appelant à changer.
- `resolveOrg` — `rg -n "resolveOrg\(" /home/user/oto-pkg/packages /home/user/oto-pkg/src /home/user/oto-pkg/tests` → 10 appels plus la définition (`mcp/handler.ts:79`, `mcp/metadata.ts:45`, `server/oauth.ts:163`, `server/identity.ts:199`, partage, dépôt, image, admin, page `no-organization`) ; inchangé, seule l'adresse passée par la porte MCP peut venir de l'hôte.
- `requestHost` — `rg -n "requestHost\(" /home/user/oto-pkg/packages /home/user/oto-pkg/src /home/user/oto-pkg/tests` → reste le défaut.

### Doublons
- `rg -n "host:" /home/user/oto-pkg/packages/plateforme/api/handler.ts` : `handlePlateforme` prend déjà l'adresse de l'hôte ; même forme reprise, pas de second mécanisme.

### Effet produit
- Liste d'outils servie : inchangée (préfixe de l'organisation servie).
- Hôte : rien à faire sans l'option ; avec elle, une fonction dans `app/api/mcp/route.ts` et la route de métadonnées.
- Schéma `platform`, RLS, migrations : aucun changement.

### Refacto
- Écarté : aucune réorganisation de `resolveOrg`.

## Tests attendus

- Unit (`tests/unit/mcp-handler.test.ts`) : défaut inchangé ; adresse rendue servie ; adresse inconnue → 404 après jeton ; non-membre refusé ; `host` qui lève → 503.
- Unit (`tests/unit/mcp-metadata.test.ts`) : ressource et organisation selon l'option.

## Questions ouvertes

- Faut-il aussi passer l'option à `handleAdminMcp` ? Proposé : non (l'équipe plateforme a son adresse).
- Une option `host` asynchrone qui lit la base de l'ERP (organisation par appartenance, ERP multi-clients sur un domaine) : hors périmètre ; elle casserait la bascule d'un consultant entre organisations (un connecteur par organisation, ADR-004) et demande sa propre révision.
