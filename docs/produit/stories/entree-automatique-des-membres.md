# Story — Entrée automatique des comptes de l'ERP dans l'organisation

## Meta

| Champ | Valeur |
|-------|--------|
| **Épic** | Monter le paquet dans un ERP sur mesure |
| **Parcours** | Brancher un assistant sur l'ERP ; administrer l'organisation |
| **Statut** | ⬜ Draft — conception proposée, à valider avant tout code |
| **Priorité** | Should |
| **Référence UI** | Réglage dans l'écran Équipes (administrateur) ; N/A sinon |
| **Conventions** | database, supabase, security, auth, api, mcp, testing |
| **Estimation** | M |

## Contexte

Dans un ERP construit sur le paquet, l'annuaire est celui de l'ERP : ses comptes sont créés par l'ERP (administrateur, import, inscription de l'ERP). Aujourd'hui, une ligne `members` ne naît que d'une invitation acceptée (`accept_invitations`), de `signup_org` ou d'un import ; une invitation envoie toujours un lien magique (`inviteMember`, `signInWithOtp`). Un compte de l'ERP qui n'a pas été invité dans l'organisation reçoit `not_member` sur le canal MCP et l'écran « aucune organisation » : il faut le réinviter par email alors qu'il est déjà connecté à l'ERP. Deux annuaires à tenir.

ADR-023 § 5 (« rejoindre une organisation existante passe toujours par une invitation ») et ADR-004 § 4 sont à réviser : **une troisième voie d'entrée, activée par l'administrateur, pour une organisation dont l'hôte contrôle la création des comptes**.

**Refs :**
- Conception : `docs/conception/identite-et-connexion.md` (ADR-004 § 2, § 4 ; H11, H12, H18 ; mode OIDC `identity_for_caller`), `docs/conception/offres-de-l-hote.md` (ADR-023 § 5 ; ADR-022 `members_max`), `docs/conception/droits-d-acces.md`
- Code : `packages/plateforme/server/identity.ts` (`resolveIdentity`, `identityInOrg`), `server/members.ts`, `server/invitations.ts`, migrations `accept_invitations`, `remove_member`

## Conception proposée

- **Réglage d'organisation `open_entry`** (migration additive dans `platform`) : `{ enabled: boolean, role: "member", email_domains: string[] }`. Désactivé par défaut : rien ne change pour une organisation existante ni pour un hôte qui ne l'active pas.
- **`platform.join_org(org)`**, `security definer`, appelée par `resolveIdentity` quand l'appelant n'a pas de ligne `members` dans l'organisation de l'adresse. Elle crée la ligne si et seulement si : réglage actif ; email vérifié dans les claims (mode Supabase : « Confirm email » gardé, E02-S01 N41 ; mode OIDC : `email_verified`) ; domaine de l'email dans `email_domains` quand la liste n'est pas vide ; personne absente des exclusions (ci-dessous) ; limite `members_max` respectée (ADR-022, refus `forbidden`, `reason: "limit"`). Rôle `member` seulement, jamais `admin`. Une ligne du journal de l'organisation (`member joined`, origine `open_entry`).
- **Exclusions** : un membre retiré par un administrateur (`remove_member` supprime sa ligne) rentrerait à l'appel suivant. Le retrait inscrit la personne dans `platform.member_exclusions(org_id, user_id, excluded_at, excluded_by)` ; `join_org` la refuse ; une invitation explicite l'en retire. Sans cela, le retrait ne coupe plus (ADR-004 § 2 cassé).
- **Activation** : par un administrateur de l'organisation (écran Équipes, `PATCH /api/platform/org/open-entry`) et par l'équipe plateforme (`admin_org`), avec les domaines admis. Le texte de l'écran dit le risque : toute personne qui a un compte vérifié chez l'émetteur de l'hôte, dans ces domaines, entre comme membre.
- **Canal MCP** : la porte appelle `resolveIdentity` ; l'entrée automatique joue au premier appel, sans geste dans l'assistant ; un refus garde le texte `not_member` actuel.
- **Hors périmètre** : rôles et équipes de l'ERP reportés dans oto (synchronisation d'annuaire, F4) ; organisation par appartenance (story « organisation choisie par l'hôte », questions ouvertes).

## Critères d'acceptation

- [ ] **Given** une organisation sans `open_entry` **When** un compte non invité appelle **Then** `not_member`, comme aujourd'hui.
- [ ] **Given** `open_entry` actif sans domaines **When** un compte à l'email vérifié appelle `/api/mcp` ou ouvre un écran **Then** une ligne `members` (rôle `member`) naît, une ligne de journal est écrite, l'appel est servi.
- [ ] **Given** `open_entry` avec domaines **When** l'email n'est pas d'un domaine admis **Then** `not_member`, aucune ligne créée.
- [ ] **Given** un email non vérifié **When** il appelle **Then** `not_member`, aucune ligne créée.
- [ ] **Given** un membre retiré par un administrateur **When** il rappelle **Then** `not_member` (exclusion) ; **When** un administrateur l'invite de nouveau et qu'il accepte **Then** il redevient membre et l'exclusion est levée.
- [ ] **Given** `members_max` atteint **When** un compte entrerait **Then** refus `forbidden`, `reason: "limit"`, aucune ligne créée.
- [ ] **Given** un membre entré automatiquement **When** on lit l'annuaire et ses droits **Then** il est un membre ordinaire (rôle `member`, aucune équipe), sous les mêmes droits d'accès.
- [ ] RLS : `member_exclusions` et le réglage ne se lisent et ne s'écrivent que par un administrateur de l'organisation ou l'équipe plateforme ; `join_org` est la seule écriture de `members` hors invitation, import et `signup_org`.

## Implémentation

### Fichiers à créer
- Migration additive `packages/plateforme/migrations/<horodatage>_open_entry.sql` : réglage, `member_exclusions` (RLS), `join_org`, `remove_member` qui exclut, `accept_invitations` qui lève l'exclusion.

### Fichiers à modifier
- `server/identity.ts` (`resolveIdentity` : tentative `join_org` sans ligne `members`), `server/members.ts` (retrait → exclusion), `server/invitations.ts` (invitation → levée), `server/admin/` (`admin_org` : réglage), `api/` (route du réglage), écran Équipes (`ui/equipes/`, réglage et texte du risque), `schemas/` (Zod du réglage).
- `docs/conception/identite-et-connexion.md` (ADR-004 § 4), `docs/conception/offres-de-l-hote.md` (ADR-023 § 5), `docs/reference/schema-platform.md`, README et `CHANGELOG.md` du paquet (`### Hosts`).

### Patterns à suivre
- `security-patterns.md § Droits dans le service` ; `database-patterns.md` (migration additive, RLS dans la même migration) ; `supabase-patterns.md § Couplage à Supabase`.

## Rayon d'impact

### Appelants
- `resolveIdentity` — `rg -n "resolveIdentity\(" /home/user/oto-pkg/packages /home/user/oto-pkg/src /home/user/oto-pkg/tests` : à relever en entier à l'implémentation (porte MCP, API, pages de l'hôte) ; chacun gagne l'entrée automatique quand le réglage est actif.
- Suppression de membre — `rg -n "delete from platform.members" /home/user/oto-pkg/packages/plateforme/migrations` → `20260928100000_platform_base_v1.sql:443`, `20260930100000_v1_1_0.sql:1038` (même fonction, version redéfinie) ; le retrait par un administrateur doit exclure, l'oubli RGPD (`forget_user`) ne doit pas laisser d'exclusion nominative.
- `accept_invitations` — `rg -n "accept_invitations" /home/user/oto-pkg/packages /home/user/oto-pkg/src` : levée de l'exclusion.

### Doublons
- `rg -n "accept_invitations|signup_org|identity_for_caller" /home/user/oto-pkg/packages/plateforme/migrations` : trois voies d'entrée existantes ; `join_org` reprend leurs contrôles (email vérifié, limites) au lieu de les dupliquer en TypeScript.

### Effet produit
- Schéma `platform` et RLS : nouvelle table et nouveau réglage, migration additive copiée par l'hôte.
- Écrans : réglage dans Équipes ; annuaire inchangé.
- Liste d'outils MCP : inchangée (ADR-002) ; seul l'effet `not_member` change pour un compte admis.
- Journal : nouvelle ligne `member joined`.
- Hôte : à activer explicitement ; en mode Supabase, garder « Confirm email ».

### Refacto
- Écarté : pas de refonte des invitations.

## Tests attendus

- Intégration (Postgres) : `join_org` (chaque garde : réglage, email vérifié, domaine, exclusion, limite) ; retrait → exclusion → réinvitation → levée ; RLS des nouvelles tables.
- Unit : `resolveIdentity` sans ligne `members`, réglage actif ou non ; porte MCP : premier appel d'un compte admis servi.

## Questions ouvertes

- Rôle d'entrée : `member` seul (proposé), ou un rôle d'équipe par défaut ?
- Sans domaine admis, faut-il refuser l'activation en mode Supabase quand l'inscription de l'hôte est ouverte (n'importe qui pourrait entrer) ? Proposé : refus, l'administrateur doit nommer au moins un domaine si l'inscription est ouverte — à défaut d'un moyen fiable de le savoir, avertissement seulement.
- Exclusion et oubli RGPD : l'exclusion est supprimée par `forget_user` (proposé).
