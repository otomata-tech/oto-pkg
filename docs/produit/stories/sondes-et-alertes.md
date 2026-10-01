# Story — Sondes de santé et alertes des comptes

## Meta

| Champ | Valeur |
|-------|--------|
| **Épic** | Administration et exploitation (V2) |
| **Parcours** | 4.6 Routine ; 4.5 Administrer |
| **Statut** | 🟣 V2 — non planifiée ; Definition of Ready à repasser à l'ouverture de la V2 |
| **Priorité** | Could (V2) |
| **Référence UI** | Écran Connecteurs (`ecran-connecteurs.md`) |
| **Conventions** | monitoring, security, testing |
| **Estimation** | M |
| **Porteuse de migration** | à établir à l'ouverture |
| **Dépend de** | `comptes-tiers-et-coffre.md` |

## Contexte

Partie « sondes et alertes » de l'ancienne E08-S03, passée en V2 le 2026-09-23 (passe de
raffinage). Elle n'a de sens qu'avec des comptes réels (`comptes-tiers-et-coffre.md`). Les tâches de fond passent par
un rôle Postgres dédié, jamais par `service_role` (`docs/conception/base-et-portabilite.md`).

**Périmètre** : sonde de santé par connecteur et par compte ; état « en défaut » avec la date ;
alerte sur un compte expiré.

**Refs :** FR-ROUT-02 ; Oto (détails) : `docs\connector-model.md` (`credential_rejected`, première couche manquante).

## Critères d'acceptation (à affiner à l'ouverture de la V2)

- [ ] **Given** un compte dont la sonde échoue **When** l'écran Connecteurs s'affiche **Then** l'état « en défaut » et la date

## Post-implémentation

À remplir.
