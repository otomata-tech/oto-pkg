# ADR-002 — Six outils figés par organisation, code `ctx` exigé partout, préfixe calculé par requête, même contenu en texte et en structuré

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-23 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

Le banc MCP a mesuré que les hosts figent la liste d'outils, ne montrent presque rien des
métadonnées (notice jamais lue sur claude.ai, coupée à 2 048 caractères sur Claude Code,
descriptions lues à la première phrase), n'appliquent une mise à jour qu'après un geste de
l'utilisateur, et que le routage par l'host se dégrade avec le nombre d'outils. Un seul levier
marche partout, 9 fois sur 9 : un champ obligatoire dont la valeur vient d'un de nos outils.
Claude Code ne lit que `structuredContent` quand il existe ; claude.ai et ChatGPT lisent le texte.
La maquette des six outils a confirmé le contrat : `context` premier appel 39 fois sur 39,
rafraîchissement sans geste 3 fois sur 3, deux organisations branchées côte à côte sur les trois
hosts sans confusion.

## Décision

1. **Six outils, gelés** : `context`, `find`, `read`, `call`, `write`, `feedback`. La seule
   évolution permise est d'en **ajouter** un ; jamais renommer, retirer, rendre un champ
   obligatoire ni changer le sens d'un champ ; un nouveau champ est facultatif avec défaut ; une
   description ne change que pour s'allonger d'un domaine. Ce qui serait un changement cassant
   devient une procédure ou une fonction, donc du contenu.
2. **Le champ `ctx` est requis partout sauf sur `context`.** C'est une ligne en base créée par
   `context` (personne, organisation, `rules_version`, host, heure) ; il regroupe les appels d'une
   conversation dans le journal et devient invalide quand les règles changent : le refus
   « context has changed, call <préfixe>_context again » suffit, le modèle se rafraîchit seul.
3. **Le préfixe de l'organisation** est dans le nom des outils (`acme_context`…), calculé à
   chaque requête depuis l'organisation de l'adresse ; descriptions et messages citent le même
   préfixe. Court, en ASCII, fixé à l'arrivée du client et **jamais changé**. La description de
   `context` finit par une borne (« Call it only when the request concerns <org>'s work. Otherwise
   do not call it. ») : sans elle, un tiers des conversations appelaient les deux `context` de deux
   organisations branchées ensemble.
4. **Tout résultat porte le même contenu dans `content` (texte) et dans `structuredContent`**,
   les données (ids, lignes) en plus dans le structuré.
5. **Schémas plats** (ChatGPT ne montre pas les descriptions imbriquées) : `arguments` de `call`
   est un objet libre décrit par `read`, validé par le serveur. Descriptions en anglais, moins de
   1 000 caractères, première phrase impérative avec le prérequis. Instructions serveur réduites
   à une phrase qui renvoie à `context`.
6. **Pas d'outil par famille d'objets** : tableaux, journal et contrats passent par `call` et `read`.
7. **Budgets et annotations.** `context` : 20 000 caractères par blocs priorisés, coupés par la
   fin. Tout résultat de `read` et `call` : 45 000 caractères au plus ; morceaux de `write` :
   20 000 caractères. Annotations : `readOnlyHint: true` sur `context`, `find`, `read` ;
   `destructiveHint: false` sur `feedback` seulement.

## Conséquences

### Positives
- Aucun geste jamais demandé dans Claude ou ChatGPT pour une procédure, un connecteur, une règle.
- Le routage ne dépend plus du nombre d'outils ; le contexte est relu à chaque conversation.

### Négatives
- Tout passe par six schémas génériques : `call` valide des `arguments` libres, `read` doit
  servir des contrats lisibles ; la qualité des descriptions de fonctions devient critique.
- Le préfixe est irréversible : une erreur au nommage se paie par une nouvelle organisation.

### Neutres
- Le connecteur admin (`/api/mcp-admin`) peut évoluer souvent ; il n'est pas soumis au gel.

## Alternatives considérées

### Un outil par capacité (le modèle d'Oto)
Une centaine d'outils listés, routage par l'host, geste par utilisateur à chaque évolution.
Contredit par le banc.

### Un readme + ack sans code par conversation
Le levier mesuré 9 fois sur 9 est le champ requis ; l'ack seul prouve l'appel, pas la lecture. Le
code `ctx` en base ajoute le regroupement du journal et l'invalidation par `rules_version`.
