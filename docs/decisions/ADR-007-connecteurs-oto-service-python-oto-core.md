# ADR-007 — Les connecteurs passent par un service sans état, joint comme un serveur MCP, dans un autre dépôt

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-23 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

La plateforme est en TypeScript ; les connecteurs réels (CRM, mail, ERP) arrivent en V2. Les
écrire dans le paquet le chargerait de clients d'API à maintenir, et monter Oto en distant
importerait ses conventions (`_org`, `_run_id`, `oto_*`). Les connecteurs repartent de zéro :
le service n'est pas construit sur `oto-core` et ne reprend pas les outils d'Oto (fiche D108).

## Décision

1. **Un service connecteurs sans état exécute les connecteurs.** **Il vit dans un autre dépôt** ;
   langage et dépôt sont au choix de l'équipe qui l'écrit. Il arrive en V2 ; la V1 ne porte qu'un
   connecteur simulé, `mail`, et les fonctions métier d'un ERP inscrites au catalogue.
2. **Son interface est un serveur MCP** : `tools/list` alimente le catalogue des fonctions du
   paquet, `tools/call` exécute. Le paquet l'appelle comme n'importe quel connecteur distant ; le
   **secret du compte voyage dans un en-tête**, jamais dans les arguments.
3. **Sans état** : aucune base, aucun utilisateur, aucun secret dans son environnement ; un appel
   sans secret échoue au lieu de retomber sur une clé par défaut.
4. **Hébergement** : un déploiement partagé en France, joint par réseau privé ou jeton de
   service ; une instance par cellule si un client exige que rien ne sorte de chez lui.
5. **Trois branchements de connecteurs** dans le paquet : natif (TypeScript, seulement s'il doit
   tourner dans la cellule du client), empaqueté, distant (le service connecteurs, un serveur MCP
   tiers, ou l'ERP existant d'un client). En distant, le paquet est une passerelle : catalogue
   relu à intervalle, sur bouton, ou sur « outil inconnu ».

## Conséquences

### Positives
- Le paquet reste en TypeScript et ne dépend des connecteurs qu'au contrat MCP.
- Le service se remplace ou se double sans toucher au paquet.

### Négatives
- Un morceau hors de l'application, à héberger et joindre ; une latence réseau par appel.
- Chaque connecteur réel est à écrire dans le service.

### Neutres
- Oto continue de tourner ; rien de son serveur n'entre dans le service.

## Alternatives considérées

### Monter Oto en connecteur distant
Importe sa surface (`oto_call`, `_org`, `_run_id`) et son journal ; ses conventions contredisent
ADR-002. Rejetée.

### Écrire les connecteurs en TypeScript dans le paquet
Des clients d'API à maintenir dans chaque version du paquet. Rejetée ; le natif reste réservé aux
connecteurs qui doivent tourner dans la cellule du client.

### Construire le service sur `oto-core` et reprendre les outils d'Oto
Écartée par JB (fiche D108) : le service repart de zéro.
