# ADR-014 — L'organisation entière, sujet d'une règle d'accès

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-27 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

Une règle d'accès (`access_rules`) donne un niveau (`none`, `read`, `write`, `manage`) sur un nœud
ou un compte à un sujet. « Accès général » du panneau « Partager » doit ouvrir un contenu à toute
l'organisation, en lecture ou en modification. Faire de l'organisation le propriétaire du nœud ne
donne que la lecture à ses membres, et une équipe « Tout le monde » devrait suivre chaque arrivée et
chaque départ.

## Décision

1. **Trois sujets de règle** : une personne (`subject_user_id`), une équipe (`subject_team_id`), ou
   l'organisation entière (`subject_org` vrai : tous les membres de l'organisation de la règle). Une
   règle porte exactement un sujet (contrainte de base) ; une règle d'organisation ne vise qu'un
   nœud ; une règle est unique par cible et sujet.
2. **Calcul du niveau** : une règle d'organisation compte pour chaque membre de l'organisation,
   avec les mêmes règles d'héritage par l'arbre que les autres : la règle du nœud le plus proche
   l'emporte ; à ce nœud, la plus précise (personne, puis équipe, puis organisation ; à précision
   égale, le niveau le plus haut). Une règle d'organisation ne retire rien à ce que donne le
   propriétaire : elle ne fait qu'ouvrir au-delà. L'espace personnel d'une personne n'admet pas de règle
   d'organisation (le service refuse, et le calcul l'ignore).
3. **Qui la pose** : qui gère le nœud (`manage`), décidé par le service avant la requête ; une
   règle `manage`, d'organisation comme de tout autre sujet, reste réservée à l'admin.
4. **À l'écran** : « Accès général » = « Seulement les personnes ajoutées » (aucune règle
   d'organisation) ou « Toute l'organisation » avec un niveau (« Peut lire », « Peut modifier »,
   « Accès complet » pour l'admin).
5. **Portabilité** : colonne et contrainte dans `platform` ; calcul dans le service, et dans
   `node_level_of`, le seul corps SQL du niveau, que gardent la recherche (`node_level_for`) et la
   lecture publique (ADR-012 § 3, ADR-013) ; aucune dépendance à Supabase.

## Conséquences

### Positives
- Un contenu s'ouvre à toute l'organisation en un geste, en lecture ou en modification.

### Négatives
- Un sujet de plus dans chaque calcul de niveau et dans ses tests, dont la parité du service et de
  `node_level_for`.

### Neutres
- La liste d'outils MCP ne change pas ; `admin_node` et la lecture des règles montrent le sujet
  « organisation ».

## Alternatives considérées

### L'organisation propriétaire du nœud
Ne donne que la lecture. Rejetée.

### Une équipe « Tout le monde » tenue à jour
Une équipe à synchroniser avec chaque arrivée et chaque départ. Rejetée.
