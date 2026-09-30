# Story E12-S02 — Capacités par organisation : refus décidés par le paquet, valeurs fournies par l'hôte

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E12 — Offres de l'hôte : inscription et capacités |
| **Parcours** | Équipes et accès (inviter, créer une équipe) ; tableau de bord (activer un connecteur) ; joindre un fichier (écran, `write`, `upload.link`, duplication) |
| **Statut** | ✅ Done — livrée pour la 1.2.0, non publiée, non commitée à l'écriture de ces lignes |
| **Priorité** | Must |
| **Référence UI** | Description : bouton du geste limité grisé (`disabled`, décrit par la note) avec, dessous, « Limite atteinte : 1 équipe sur 1. » en `text-mute` ; pour un administrateur et si l'hôte donne `raiseUrl`, un lien « Relever la limite » ; `teams_max = 0` : « La création d'équipes n'est pas ouverte pour cette organisation. » ; message de quota de l'éditeur au quota réel |
| **Conventions** | coding-standards, supabase, security, database, api, mcp, portage, a11y, registry, testing |
| **Estimation** | M |
| **Version** | 1.2.0 |
| **Dépend de** | E10-S02 (✅, `requireQuota`) ; indépendante d'E12-S01 |
| **Porteuse de migration** | Non (valeurs lues chez l'hôte, ADR-022) |

## Contexte

ADR-022. Choix de JB (2026-09-30) : valeurs lues chez l'hôte ; V1 = `members_max` (refus à
l'invitation), `teams_max` (0 admis), `storage_bytes`, `connectors_max` ; comptes de connecteur comptés
au propriétaire, déclarés ici, contrôlés par le chantier connecteurs. Écartés faute de besoin présent :
marque, rétention du journal, quota d'appels MCP (si repris : compter les `ctx` émis du mois au seul
`context`, jamais à chaque appel), règles d'accès fines, domaines propres.

**Refs :** ADR-022, ADR-012 § 3, ADR-002 ; FR-ADMIN-01, FR-ADMIN-02 ; architecture § 5.

## Périmètre

Registre et schéma (`schemas/limits.ts`), enregistrement et lecture (`server/limits.ts`), refus dans
`inviteMember`, `createTeam`, `activateConnector`, `requireQuota` ; vue des limites pour les écrans ;
écrans Équipes, invitation, Connecteurs, envoi de fichier ; README.

## Hors périmètre

- Contrôle de `account_owner_kinds` et `accounts_per_owner_max` dans `createAccount` : chantier
  connecteurs (une ligne : `requireUnderLimit` compté au propriétaire).
- Suspension des comptes en trop après une baisse : chantier connecteurs.
- Seuil souple des membres, message de montée en offre : l'hôte.

## Critères d'acceptation

- [ ] **AC-1** **Given** aucun `registerOrgLimits` **When** on invite, crée une équipe, active un
  connecteur ou envoie un fichier **Then** comportement d'avant à l'identique, quota de 10 Go compris.
- [ ] **AC-2** **Given** une fonction qui rend une valeur hors schéma, ou qui lève **When** un service
  bridé la lit **Then** `internal` « Internal error. », `console.error("[platform] limits: …")` sans son
  message, rien d'écrit.
- [ ] **AC-3** **Given** `members_max: 5`, 4 membres et 1 invitation en attente **When** `inviteMember`
  **Then** `forbidden`, `reason: "limit"`, `limit: "members_max"`, `max: 5`, message « <org> is limited
  to 5 members, pending invitations included. » ; décidé avant l'envoi de l'email ; invitation expirée,
  déclinée ou révoquée non comptée.
- [ ] **AC-4** **Given** `teams_max: 1` et une équipe **When** `createTeam` (API ou `admin_team`)
  **Then** même refus, `limit: "teams_max"` ; `teams_max: 0` refuse la première.
- [ ] **AC-5** **Given** `connectors_max: 1` et un connecteur actif **When** `activateConnector` d'un
  autre **Then** refus `limit: "connectors_max"` ; réactiver le connecteur déjà actif n'est pas refusé.
- [ ] **AC-6** **Given** `storage_bytes: 1 Go` **When** un envoi, `upload.link` ou une duplication
  passerait au-delà **Then** `too_large`, `reason: "quota"`, message au quota posé ; l'écran de l'éditeur
  dit ce quota, pas 10 Go.
- [ ] **AC-7** **Given** deux créations simultanées au plafond moins un **When** elles écrivent **Then**
  une seule passe (verrou 7601 par organisation ; 7501 pour le stockage) ; test qui lance les deux et
  relit le compte.
- [ ] **AC-8** **Given** une limite abaissée sous l'existant **When** on lit ou modifie ce qui existe
  **Then** rien n'est supprimé ni refusé hors création.
- [ ] **AC-9** **Given** un MCP d'organisation au plafond de stockage **When** `tools/list` **Then** les
  six mêmes outils ; `write` avec fichier : refus du service dans le résultat (`isError`).
- [ ] **AC-10** **Given** une capacité atteinte **When** l'écran Équipes, l'invitation ou Connecteurs
  s'affiche **Then** le geste est grisé avec le texte de la référence UI ; lien « Relever la limite »
  pour un administrateur si `raiseUrl` ; sans limite, écran inchangé.
- [ ] **AC-11** **Given** `account_owner_kinds` ou `accounts_per_owner_max` rendus par l'hôte **When**
  `orgLimits` les lit **Then** ils sont validés et servis ; aucun refus dans cette version.

## Implémentation

### `schemas/`
- `limits.ts` (nouveau) : `LIMITS` (nom, genre, phrase), `orgLimitsSchema` (`strictObject`, chaque clé
  facultative), type `OrgLimits`, `OrgLimitsView` ; export dans `index.ts`. `ORG_QUOTA_BYTES` reste, en
  défaut de `storage_bytes`.

### `server/`
- `limits.ts` (nouveau) : `registerOrgLimits({ read, raiseUrl? })`, `orgLimits(org)`,
  `requireUnderLimit(sql, identity, name, count)` (verrou 7601, refus), `orgLimitsView(db, identity)`.
- `invitations.ts` (`inviteMember`, `invitationOptions` : état de `members_max`), `teams.ts`
  (`createTeam`), `connectors/activations.ts` (`activateConnector`), `files/service.ts` (`requireQuota`
  lit `storage_bytes`, `fileStorageState` rend le quota) ; `index.ts` : exports.

### `ui/`
- `equipes/ecran-equipes.tsx`, `equipes/creation-d-equipe.tsx`, `equipes/types.ts`,
  `invitations/bouton-d-invitation.tsx`, `invitations/inviter-quelqu-un.tsx`,
  `admin/connecteurs/ecran-connecteurs.tsx`, `noeud/editeur/envoi-de-fichier.ts`.

### Hôte de référence
- `src/app/(dashboard)/teams/page.tsx`, page des connecteurs : passent `orgLimitsView` aux écrans.
  Aucun `registerOrgLimits` dans `src/` (hôte sans offre).

### Documentation
- README du paquet (enregistrement, défauts, codes de refus, garde d'import) ; architecture § 5 ;
  `component-registry.md`.

## Rayon d'impact

### Appelants
- `inviteMember` — `rg -c "inviteMember\b" C:/apps/oto-pkg/packages C:/apps/oto-pkg/src C:/apps/oto-pkg/tests`
  → `api/invitations.ts` ; tests `invitations`, `emetteur-oidc`, `api-handler` (unit : doublure `vi.fn`
  qui ne change pas de forme ; intégration), `mail`.
- `invitationOptions` — `rg -c "invitationOptions\b" …` → `src/app/(dashboard)/teams/page.tsx`,
  `ui/equipes/types.ts` ; tests `pages/equipes-page.test.tsx` (doublure à compléter du nouveau champ),
  `invitations`, `e05s13-responsables-sql`.
- `createTeam` — `rg -c "createTeam\b" …` → `api/teams.ts`, `mcp/admin/tools/team.ts` ; doublure
  `vi.fn` de `tests/integration/api-equipes-routes.test.ts` ; les `fx.createTeam` des helpers sont des
  fixtures SQL, non touchées.
- `activateConnector` — `rg -c "activateConnector\b" …` → `api/admin/connectors.ts`,
  `mcp/admin/tools/connector.ts` ; doublure `tests/helpers/simulated-db.ts` ; tests `connectors-services`.
- `requireQuota` — `rg -c "requireQuota\b" …` → `files/service.ts`, `uploads.ts`, `nodes/duplicate.ts`.
- `ORG_QUOTA_BYTES` — `rg -c "ORG_QUOTA_BYTES" …` → `ui/noeud/editeur/envoi-de-fichier.ts:44` ; tests
  `files-store`, `ui-envoi-de-fichier`, `e10s02-fichiers`, `files`, `e10s02-corbeille-duplication`.
- `fileStorageState` — `rg -c "fileStorageState\b" …` → `api/files.ts` ; test `api-files`.

### Doublons
- `rg -n -i "quota|capacit|limite|plafond" C:/apps/oto-pkg/.method/conventions/component-registry.md`
  et `rg -n "ORG_QUOTA_BYTES|requireQuota|FLAGS|isEnabled" C:/apps/oto-pkg/packages` → `requireQuota` :
  réutiliser (lit la limite) ; `FLAGS`/`isEnabled` : laisser (ADR-022, alternatives) ;
  `registerFunctions` : même mécanisme d'enregistrement, modèle suivi, pas fusionné (deux listes de
  nature différente).

### Effet produit
- `/api/platform` : `invitations`, `teams`, `admin/connectors`, `files` ; MCP d'organisation : `write`,
  `upload.link`, duplication (stockage seul) ; MCP admin : `admin_team`, `admin_connector`.
- Écrans Équipes, invitation, Connecteurs, éditeur.
- Hôte qui enregistre une fonction : l'importer dans chaque route qui monte une porte et dans les pages
  qui montrent un geste limité (garde de test chez lui, comme `fonctions-metier-imports.test.ts`).
- Aucune migration.

### Refacto
- Écarté : généraliser `requireQuota` en contrôle de limite commun ; le stockage somme des octets, les
  autres comptent des lignes, et `requireQuota` garde son verrou 7501.

## Tests attendus

### Unit tests
- [ ] `orgLimitsSchema`, `orgLimits` sans enregistrement, valeur invalide, lecteur qui lève (AC-1, 2, 11).
- [ ] Textes de refus et vue des limites.

### Integration tests (portables)
- [ ] Un test par service bridé : refus au plafond, passage sous le plafond, code et `reason` (AC-3 à 6).
- [ ] Course sous verrou (AC-7) ; limite abaissée (AC-8).
- [ ] MCP par `InMemoryTransport` : même liste d'outils, refus dans le résultat (AC-9).
- [ ] Écrans : grisé, texte, lien, sans limite inchangé ; contrôle visuel deux thèmes (AC-10).

## Actions JB

- Accord sur ADR-022 et la story.
- Côté SaaS (hors de ce dépôt) : fonction `read` sur son abonnement, `raiseUrl`, garde d'import.

## Post-implémentation

### Écarts avec la référence UI
- Le lien « Relever la limite » porte `?capacity=<nom>` (demande de l'hôte SaaS) : l'hôte sait quelle limite relever.

### Écarts avec l'architecture
- ADR-022 accepté ; `docs/architecture.md` § 5 (`limits.ts`), § 8.
- `requireQuota` reçoit le quota (`quota`) lu avant la transaction ; `ORG_QUOTA_BYTES` reste le défaut.
- Le quota dit par l'éditeur vient du refus (`details.max`), pas de `fileStorageState` : un champ de moins.
- `limitedTx` (transaction gardée par une limite) sert `createTeam` et `inviteMember` : `teams.ts` et `files/service.ts`
  étaient à la borne de 300 lignes d'ESLint.

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| registerOrgLimits, orgLimits, requireUnderLimit, limitedTx, orgStorageQuota, orgLimitsView | `packages/plateforme/server/limits.ts` | registry |
| orgLimitsSchema, LimitState, OrgLimitsView, limitReached | `packages/plateforme/schemas/limits.ts` | registry |
| LimiteAtteinte | `packages/plateforme/ui/limites/limite-atteinte.tsx` | registry |

### Notes
- Hors périmètre ajouté à la demande de l'hôte SaaS (même version, exports et une clé) : `AdressesDuRail.abonnement`
  (« Abonnement » aux réglages de l'entreprise, écran `abonnement` du fil), et les primitives exportées par `/ui`
  (`Badge`, `Island*`, `SegmentedControl`, `Dialog`, `ConfirmDialog`, `Table`, `Column`, `Skeleton*`, `EmptyState`,
  `Checkbox`, `EnTeteDAdministration`).
- Reste ouvert : une lecture sans session des compteurs (membres) pour le seuil souple de l'offre payante du SaaS ; elle
  poserait le même problème que l'écriture sans appelant (ADR-022, contexte). À trancher par JB.
- AC-9 (MCP) : aucun code de `mcp/` touché, la liste d'outils ne lit aucune capacité ; le refus de stockage passe par
  le formateur commun, déjà testé. Test MCP par `InMemoryTransport` non écrit : il ne prouverait rien que le test du
  service ne prouve (`testing-strategy.md § Budget de tests`).
- L'état de `members_max` ne passe pas par `invitationOptions` (Implémentation) mais par `orgLimitsView`, une lecture
  pour les trois limites : `invitationOptions` garde sa forme et ses doublures.
- Exports : `orgLimits` et `ACCOUNT_OWNER_KINDS` restent internes (aucun consommateur hors du module) ; `LimiteAtteinte`
  aussi.
- Tests : `tests/integration/e12s02-capacites.test.ts` (9 cas), écrans (`ecran-equipes`, `ecran-connecteurs`), messages
  (`ui-messages`, `ui-envoi-de-fichier`), rail (`ecrans-du-rail`).
