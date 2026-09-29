# Story E04-S03 — Connecteur mail : compte d'équipe ou personnel, `create_draft`, `send_draft` en deux temps

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E04 — Connecteurs et comptes |
| **Parcours** | 4.2 Faire ; 4.5 Administrer |
| **Statut** | 🟣 V2 — non planifiée ; Definition of Ready à repasser à l'ouverture de la V2 |
| **Priorité** | Must (V2) |
| **Référence UI** | N/A |
| **Conventions** | security, testing |
| **Estimation** | M |

## Contexte

**ADR-019 (fiche D129, 2026-09-29)** : les connecteurs s'écrivent en TypeScript dans le paquet ; aucun service connecteurs séparé. Ce qui suit, écrit pour un service distant, se relit à l'ouverture de la V2.

**V2 (passe de raffinage du 2026-09-23).** En V1, `mail.create_draft` et `mail.send_draft`
existent déjà en simulé (E04-S01, `sim_outbox`, compte en mode `simule`), avec les mêmes contrats.
Cette story branche l'exécution réelle pour les comptes `reel` et `sandbox`, par le service
connecteurs (E04-S02). Les procédures écrites en V1 contre `mail.*` continuent de marcher. Les
deux classes d'identité (compte d'équipe, compte personnel avec autorisation explicite rappelée
par `context`) arrivent avec elle.

Le mail du pilote (boîte partagée de l'équipe Ventes, classe « système de l'organisation », ou
Gmail personnel, classe « canal personnel » avec autorisation explicite rappelée par `context`) :
`mail.create_draft` (écriture), `mail.send_draft` (sensible : récapitulatif puis `confirm`, ou
`confirm: true` direct quand la procédure a fait approuver les brouillons). Le mode du compte
(`accounts.mode` : réel, sandbox, simulé) est servi par `context` et rappelé dans le
récapitulatif ; le compte-rendu de l'envoi liste les identifiants des brouillons réellement
partis (sur ChatGPT, un appel peut être bloqué avant d'atteindre le serveur — banc E04, S07).

**Dépend de :** E04-S02 (via le service connecteurs) ; E03-S04 (confirmation).

**Refs :** FR-TASK-05, FR-ADMIN-05.

## Critères d'acceptation (à affiner à l'ouverture)

- [ ] **Given** quatre brouillons approuvés **When** `send_draft` avec `confirm: true` **Then** quatre envois, journal avec l'auteur et le compte
- [ ] **Given** le Gmail de Marie autorisé à Claire **When** `context` **Then** « tu écris avec le Gmail de Marie »

## Implémentation

À définir à l'ouverture.

## Tests attendus

À définir à l'ouverture.
