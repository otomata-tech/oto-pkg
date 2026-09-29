# ADR-019 — Les connecteurs s'écrivent en TypeScript dans le paquet

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-29 |
| **Statut** | Accepté ; remplace ADR-007 § 1, § 2 et § 4 |
| **Décideur(s)** | JB (fiche D129) |

## Contexte

ADR-007 plaçait les connecteurs réels (CRM, mail, ERP) dans un service sans état, joint comme un
serveur MCP, dans un autre dépôt et un langage au choix (fiche D108). Ce service n'existe pas : la V1
ne porte qu'un connecteur `mail` simulé, dans le paquet (`server/connectors/`). À la reprise des
connecteurs, JB les veut dans le paquet npm, dans le langage du paquet (fiche D129).

## Décision

1. **Les connecteurs réels sont écrits en TypeScript dans le paquet**, sous `server/connectors/`,
   à côté du connecteur simulé : c'est le branchement « natif » d'ADR-007 § 5, devenu la règle. Ils
   s'exécutent dans le serveur de l'application hôte, sans service intermédiaire.
2. **Aucun service connecteurs séparé** : ADR-007 § 1 (service sans état dans un autre dépôt), § 2
   (son interface MCP, secret en en-tête) et § 4 (son hébergement) sont remplacés.
3. **Le secret d'un compte reste dans le coffre du paquet** (E04-S05) ; déchiffré par le serveur de
   l'hôte pour le seul appel au tiers, il ne revient jamais vers un écran, le modèle ou le journal
   (NFR-ADMIN-01).
4. **Le contrat vu des assistants ne change pas** : les fonctions d'un connecteur passent par le
   catalogue et l'outil `call` (ADR-002), avec les modes de compte (réel, sandbox, simulé) et la
   confirmation en deux temps.
5. **Hypothèse, à confirmer par JB** : le branchement « distant » d'ADR-007 § 5 (un serveur MCP tiers,
   ou l'ERP existant d'un client) reste possible ; il ne sert plus aux connecteurs écrits par l'équipe.

## Conséquences

### Positives
- Un seul dépôt, un seul langage, une seule chaîne de tests et de publication.
- Installé dans l'ERP d'un client, le paquet exécute les connecteurs chez lui : le secret ne quitte
  pas sa cellule.

### Négatives
- Le paquet porte les clients d'API tiers : chaque correctif d'un connecteur est une version du
  paquet, que chaque hôte reçoit par Renovate.
- Chaque dépendance ajoutée pour un tiers pèse sur tous les hôtes : un appel `fetch` sans SDK est
  préféré, une dépendance se justifie (`CLAUDE.md § Justifier une surface nouvelle`).

### Neutres
- Les stories E04-S02, E04-S03 et E04-S05 gardent leur périmètre fonctionnel ; E04-S02 perd son
  client MCP de serveur à serveur et sa table `functions` de source distante.

## Alternatives considérées

### Service connecteurs dans un autre dépôt (ADR-007)
Un morceau de plus à héberger et joindre, une latence réseau par appel, un second langage. Remplacée
par décision de JB (fiche D129).
