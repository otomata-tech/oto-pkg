# Story — Écran Connecteurs

## Meta

| Champ | Valeur |
|-------|--------|
| **Épic** | Écrans de la plateforme (V2) |
| **Parcours** | 4.5 Administrer |
| **Statut** | 🟣 V2 — non planifiée ; Definition of Ready à repasser à l'ouverture de la V2 |
| **Priorité** | Should (V2) |
| **Référence UI** | oto-frontend `src/components/connecteurs/` (`liste-connecteurs.tsx`, `page-du-connecteur.tsx`, `fiche-connecteur.tsx`, `formulaire-de-branchement.tsx`, `actions-du-branchement.tsx`) — à refaire sur notre modèle, sans la pile de clés ni la toolbox |
| **Conventions** | portage, a11y, forms, security, state |
| **Estimation** | L |
| **Porteuse de migration** | non |
| **Dépend de** | `comptes-tiers-et-coffre.md` |

## Contexte

Partie « Connecteurs » de l'ancienne E05-S03, passée en V2 le 2026-09-23 (passe de raffinage).
En V1, l'activation et les comptes simulés se gèrent dans le tableau de bord (E08-S03) et par le
MCP admin (E08-S06).

**Périmètre** : catalogue et activation ; comptes réels et sandbox (parcours OAuth ou saisie de
clé dans l'application, jamais dans une conversation) ; règles d'accès sur un compte ; santé. Les
slots reviendraient en V2 si une équipe doit servir deux procédures par deux comptes du même
connecteur (P37).

**Hors périmètre** : sondes et alertes (`sondes-et-alertes.md`).

**Refs :** FR-ADMIN-04 ; ADR-008 ; `docs/conception/vue-d-ensemble.md` (retirer la toolbox et la pile de clés par niveau).

## Critères d'acceptation (à affiner à l'ouverture de la V2)

- [ ] **Given** l'écran Connecteurs **When** l'admin connecte un compte **Then** le secret va au coffre, et n'est jamais affiché ensuite

## Post-implémentation

À remplir.
