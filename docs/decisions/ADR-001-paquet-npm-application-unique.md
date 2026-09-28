# ADR-001 — Un paquet npm `@otomata_tech/oto_platform` installé dans une application Next : une application, un domaine

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-23 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

La plateforme doit servir plusieurs clients : sans ERP (notre application de base), avec un ERP
que nous construisons, ou avec un ERP existant. Deux applications par client (l'ERP et la
plateforme) doublent le déploiement, la connexion et le menu, et donnent à notre CI un accès au
projet du client. Un « MCP par utilisateur » est inutile : le serveur sait toujours qui appelle.

## Décision

La plateforme est un **paquet npm unique**, `@otomata_tech/oto_platform`, installé dans une
application Next : l'ERP du client quand on le construit, sinon notre application de base.
Il porte **les écrans (`ui/`), l'API (`api/`), le MCP (`mcp/`), les services (`server/`), les
migrations du schéma Postgres `platform` (`migrations/`) et une ligne de commande (`cli/`)**, avec
un point d'entrée par face. Une seule application, un seul domaine, une seule base, une seule
connexion, un seul menu : l'utilisateur ajoute un seul connecteur, `https://<domaine>/api/mcp`, à
la marque du client.

Le dépôt du paquet est un workspace pnpm : une application de base minimale à la racine, qui monte
le paquet depuis le workspace et le teste de bout en bout, et le paquet dans `packages/plateforme/`.
Tout autre hôte, notre SaaS comme un ERP, consomme le paquet publié (ADR-010).

Ce qui est sur mesure chez un client : le contenu, les connecteurs, les procédures, l'interface,
la marque. Jamais le code de la plateforme : un besoin nouveau devient une fonction métier de
l'ERP inscrite au catalogue, ou une évolution livrée à tous.

## Conséquences

### Positives
- Un déploiement par client, aucune CI à nous dans le projet du client.
- L'application de base n'est qu'un ERP sans modules métier : les deux cas restent au même niveau.
- Un écran de l'ERP peut embarquer un composant du paquet sous les mêmes droits.

### Négatives
- Le paquet doit rester consommable par une application qui n'est pas la nôtre : versions
  sémantiques, migrations copiées, aucun accès implicite à l'environnement de l'hôte.
- La frontière `ui/` ↔ `server/` doit être appliquée par l'outillage, pas par la discipline (règle
  ESLint et son test).

### Neutres
- Les connecteurs d'Oto restent hors de l'application, dans le service connecteurs (ADR-007).

## Alternatives considérées

### Deux applications par client (ERP + plateforme)
Deux déploiements, deux connexions à fédérer, deux menus, notre CI chez le client. Rejetée.

### Une plateforme centrale multi-tenant appelée par les ERP
L'ERP devient un client HTTP de la plateforme ; les écrans ne s'intègrent qu'en cadre ; les
données du client sortent de sa base. Rejetée : hébergement en France par construction et
intégration native voulus.
