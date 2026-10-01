# Story — Comptes tiers et coffre

## Meta

| Champ | Valeur |
|-------|--------|
| **Épic** | Connecteurs et comptes (V2) |
| **Parcours** | 4.5 Administrer |
| **Statut** | 🟣 V2 — non planifiée ; Definition of Ready à repasser à l'ouverture de la V2 |
| **Priorité** | Must (V2) |
| **Référence UI** | L'écran Connecteurs (`ecran-connecteurs.md`) |
| **Conventions** | database, supabase, security, api, testing |
| **Estimation** | L |
| **Porteuse de migration** | oui (colonnes et tables du coffre) |
| **Dépend de** | E04-S01 |

## Contexte

**ADR-019 (fiche D129, 2026-09-29)** : les connecteurs s'écrivent en TypeScript dans le paquet ; aucun service connecteurs séparé. Amendée le 2026-09-30 : la conception fait foi, `docs/conception/connecteurs-et-comptes.md` (connecteurs partagés décrits dans `oto-connectors`, connecteurs propres à l'hôte au contrat `defineFunction`, secret toujours fourni par le consommateur). Ce qui suit, écrit pour un service distant, se relit à l'ouverture de la V2.

Partie « comptes tiers et coffre » de l'ancienne E04-S01, passée en V2 le 2026-09-23 (passe de
raffinage). La V1 ne crée que des comptes en mode `simule`, sans secret (H85).

**Périmètre**
- Coffre : secret chiffré par le paquet (AES-GCM, clé dans l'environnement de l'application ; Supabase Vault à évaluer, ADR à rouvrir). Jamais relu par un écran, le modèle ou le journal ; il ne voyage que vers le service connecteurs, en en-tête (NFR-ADMIN-01).
- Connexion d'un compte réel ou sandbox : parcours OAuth du tiers ou saisie de clé dans l'application, jamais dans une conversation.
- Santé d'un compte (état, date de la dernière vérification) ; remplacement du secret (niveau gestion).
- Deux classes d'identité (FR-ADMIN-05) : systèmes de l'organisation (compte d'équipe, auteur journalisé) et canaux personnels (compte de la personne ; opérer au nom d'une autre exige une autorisation explicite que `context` rappelle).

**Hors périmètre** : sondes et alertes (`sondes-et-alertes.md`) ; écran (`ecran-connecteurs.md`) ; exécution réelle (`connecteur-sellsy.md`, `connecteur-mail.md`).

**Refs :** FR-ADMIN-02, FR-ADMIN-05, NFR-ADMIN-01 ; ADR-007 ; `docs/conception/base-et-portabilite.md` ; Oto (détails seulement) : `docs\connector-vault.md` (clé jamais relue, grant mort marqué), `docs\connector-model.md` (`ready` rend la première couche manquante).

## Critères d'acceptation (à affiner à l'ouverture de la V2)

- [ ] **Given** un compte connecté avec une clé **When** un écran, `read` ou le journal le lit **Then** le secret n'apparaît jamais (test sur chaque chemin)
- [ ] **Given** un compte en mode `reel` **When** `call` l'utilise **Then** le secret part en en-tête vers le service connecteurs, jamais dans les arguments

## Post-implémentation

À remplir.
