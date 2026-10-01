# Story — Client du service connecteurs et Sellsy réel

## Meta

| Champ | Valeur |
|-------|--------|
| **Épic** | Connecteurs et comptes (V2) |
| **Parcours** | 4.5 Administrer ; 4.2 Faire (exécution) |
| **Statut** | 🟣 V2 — non planifiée ; Definition of Ready à repasser à l'ouverture de la V2. Dépend du dépôt du service connecteurs (autre dépôt, langage au choix de son équipe : fiche D108, ADR-007) |
| **Priorité** | Must (V2) |
| **Référence UI** | N/A |
| **Conventions** | security, supabase, testing |
| **Estimation** | M |

## Contexte

**ADR-019 (fiche D129, 2026-09-29)** : les connecteurs s'écrivent en TypeScript dans le paquet ; aucun service connecteurs séparé. Amendée le 2026-09-30 : la conception fait foi, `docs/conception/connecteurs-et-comptes.md` (connecteurs partagés décrits dans `oto-connectors`, connecteurs propres à l'hôte au contrat `defineFunction`, secret toujours fourni par le consommateur). Ce qui suit, écrit pour un service distant, se relit à l'ouverture de la V2.

**V2 (passe de raffinage du 2026-09-23).** La V1 prépare le branchement sans rien casser
(`docs/conception/vue-d-ensemble.md`) : catalogue avec origine et classe, chaîne de résolution du compte,
`accounts.mode`, confirmation en deux temps, `mail` simulé (E04-S01). Cette story ajoute la
source distante du catalogue : c'est elle qui crée la table `functions` (H80). Ses fonctions
Sellsy remplacent, pour un compte `reel` ou `sandbox`, ce que la V1 refusait par
`unavailable_in_v1`. Elle dépend aussi d'`comptes-tiers-et-coffre.md` (comptes tiers et coffre).

Client MCP de serveur à serveur vers le service connecteurs : `tools/list` alimente le catalogue
`functions` (origine « service connecteurs »), `tools/call` exécute avec le secret du compte en
en-tête ; relecture du catalogue à intervalle, sur bouton, ou sur « outil inconnu » ; variables
d'environnement : adresse du service et jeton. Sellsy : `list_estimates`, `get_estimate` pour le
pilote. Tests sur réponses enregistrées, jamais sur le service réel en CI.

**Dépend de :** E04-S01, E03-S04 ; le service connecteurs joignable (autre dépôt, jamais créé
ici), qui porte Sellsy (fiche D108).

**Refs :** FR-TASK-04, FR-ADMIN-02 ; ADR-007.

## Critères d'acceptation (à affiner à l'ouverture)

- [ ] **Given** le service joignable **When** `catalog.sync` **Then** les fonctions Sellsy sont au catalogue avec schéma et classe
- [ ] **Given** `call sellsy.list_estimates` **When** exécuté **Then** le secret part en en-tête, jamais dans les arguments ni le journal

## Implémentation

À définir à l'ouverture.

## Tests attendus

À définir à l'ouverture.
