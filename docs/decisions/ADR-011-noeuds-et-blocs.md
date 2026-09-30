# ADR-011 — Le contenu est fait de nœuds typés et de blocs ; une ligne de tableau est un bloc

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-24 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

Le contenu de la plateforme se présente sous quatre formes : pages, procédures, Contextes et
tableaux. Les garder dans deux modèles (des sections markdown dans le nœud pour les documents, une
table de lignes pour les tableaux) donnerait deux index, deux chemins d'écriture, aucune identité
aux blocs d'une page (ni écriture ni ancre au bloc) et un contrôle des blocs `call` d'une procédure
par analyse du texte. L'éditeur d'`oto-frontend`, que le paquet porte, travaille sur des blocs à
identifiants stables fabriqués par le serveur.

## Décision

1. **Nœud** (`platform.nodes`). Types : `page`, `procedure`, `context`, `table`. Les nœuds
   Contexte (celui de l'organisation, celui de chaque équipe, celui de chaque espace personnel)
   sont créés par la base avec leur équipe ou leur personne ; `platform.is_context_path` est la
   seule définition de leurs chemins, et un nœud de type `context` n'existe qu'à ces chemins. Le
   nœud porte les métadonnées : chemin, parent, titre, résumé, type, statut, révision,
   propriétaire, ordre parmi ses frères, date de mise à la corbeille, auteurs, dates ; `meta` porte
   le schéma typé d'un tableau (colonnes, types, colonne clé) et reste vide ailleurs. Le nœud ne
   porte aucun contenu. Son chemin suit son titre ; un ancien chemin reste un alias.

2. **Bloc** (`platform.blocks`) : une seule table pour tout le contenu.
   - **Identité** : `id` (uuid stable, fabriqué par la base, jamais par le client), `org_id`,
     `node_id` ; `state` (`draft` ou `published`) ; clé primaire (`id`, `state`).
   - **Ordre** : `position` numérique, qui permet d'insérer entre deux blocs sans renuméroter. Les
     lignes d'un tableau se lisent dans l'ordre de leur clé ; leur `position` est facultative.
   - **Type**, liste fermée, étendue par migration additive : `heading` (niveau 1 à 3),
     `paragraph`, `list` (items ; `ordered` pour des étapes numérotées), `checklist`, `code`,
     `call` (appel exact d'une fonction : `{function, args}`), `mermaid`, `image`, `callout`
     (encart), `reference` (page citée ou vue d'un tableau : `{path, view?}`), `row` (ligne de
     tableau).
   - **Contenu** : `text` (le texte ou le markdown du bloc ; nul pour un `row`) et `data` (JSON
     propre au type : items, niveau, langage, appel, cible, valeurs d'une ligne par colonne).
   - **Métadonnées communes** : `key`, une ancre lisible et stable, facultative et unique dans le
     nœud et l'état, obligatoire pour un `row` dont elle est la clé métier, immuable ; `provenance`,
     qui dit qui a écrit le bloc (une personne, un assistant avec son `ctx`, un import) et ses
     sources, précisée par cellule pour un `row` ; `revision`, le contrôle de concurrence du bloc ;
     `claimed_by` et `lease_until`, le bail d'une file de travail ; `created_by`, `updated_by`,
     dates.
   - **Recherche** : colonne générée `search_tsv` (configuration `platform.fr`) sur le texte et les
     données du bloc, index GIN.
   - **Droits** : ceux du nœud, décidés par le service (ADR-012 § 3) ; aucune règle par bloc.

3. **Brouillon et publication** (page, procédure, Contexte, en-tête de tableau). **Écrire publie** :
   une écriture de l'écran ou de `write` est publiée dans la foulée, au niveau écriture ; l'écran
   regroupe les frappes et publie 3 s après la dernière et en quittant la page. Un brouillon ne reste
   que si un assistant le demande (`publish: false`) ou si la publication d'une écriture de l'écran est
   refusée (contrôle d'une procédure, en-tête de tableau, Contexte vide non confirmé) : il y sauve la
   frappe d'une personne ; il est partagé, et la publication suivante le publie entier. **Une écriture
   d'assistant qui publie est entière ou rien** (amendement E11-S18, décision de JB) : création du nœud,
   brouillon, publication et chemin qui suit le titre tiennent dans une transaction, et un refus de la
   publication n'écrit rien, ni nœud, ni brouillon, ni bloc ; un brouillon écrit avant l'appel reste tel
   qu'il était. Le refus le dit (« Nothing was written. »), et un retrait de colonne à confirmer donne
   l'appel entier à refaire, `confirm_remove` en plus. Modifier écrit l'état `draft` : la première modification ouvre le
   brouillon et copie les blocs publiés, avec les mêmes `id`. Publier remplace l'état `published`
   par le brouillon, incrémente `nodes.revision`, prend un instantané des blocs dans
   `node_versions`, réécrit les liens, puis efface le brouillon. L'en-tête d'un tableau suit la même
   règle, publié ou non. Abandonner un brouillon le supprime entier sans toucher l'état publié.
   L'en-tête en attente (titre, résumé, type, schéma) et la marque d'un brouillon ouvert vivent dans
   `node_drafts`, une ligne par nœud ; brouillon, publication et abandon passent par trois fonctions
   atomiques de la base, `open_draft`, `publish_node` et `discard_draft`.
   `discard_draft(p_node, p_draft_stamp)` : verrou 7401, `55000` sans brouillon, `PT409` sur tampon
   changé, blocs `draft` puis `node_drafts` supprimés. Un tableau n'a pas de brouillon de lignes :
   ses blocs `row` s'écrivent directement à l'état `published`, avec leur révision ; son schéma suit
   la publication du nœud (amendement E11-S02, fiche D135 : publier n'exige plus la gestion).

4. **Recherche**. `find` cherche dans les blocs publiés des nœuds que la personne lit, hors de la
   corbeille. Rang : titre du nœud, puis résumé, puis blocs. Chaque résultat donne le nœud, le bloc
   (sa clé ou une référence courte), son type et un extrait ; pour une ligne, la colonne trouvée.
   Un brouillon n'est jamais trouvé. Le routage de `context(phrase)` reste sur le titre et le résumé
   des procédures (ADR-003).

5. **Côté assistant**. `read` sert les blocs rendus en markdown, sections comprises : une section
   est un bloc `heading` et les blocs qui le suivent jusqu'au prochain titre de même niveau ou plus
   haut. Il donne la référence courte de chaque bloc quand on la demande. `write` a des opérations
   par section et par bloc : remplacer, insérer après, supprimer, déplacer. Les fonctions `table.*`
   opèrent sur les blocs `row`. Le rendu d'un bloc est une fonction pure partagée par `server/` et
   `ui/` (`schemas/blocks-render.ts`) : l'assistant et l'écran lisent le même texte.

6. **Liens, alias, historique**. `links` est extrait des blocs publiés, avec le bloc source ;
   `[[chemin#clé]]` vise un bloc. `node_aliases` garde les anciens chemins après un déplacement ou
   un renommage. L'historique, ce sont les instantanés de publication (`node_versions`) et la
   révision de chaque bloc.

7. **Ni vocabulaire ni pointeurs par sujet** : aucun dictionnaire de sigles ou de synonymes, aucun
   pointeur « pour ce sujet, lire telle page » ; le titre, le résumé et le contenu publié suffisent
   à la recherche et au routage.

## Conséquences

### Positives

- Une table, un index, un chemin d'écriture, un contrôle de droits pour tout le contenu : pages,
  procédures, Contextes, lignes de tableau.
- Écriture et révision au bloc : deux personnes qui modifient deux blocs d'une même page ne se
  gênent pas.
- Ancres stables : liens `[[page#clé]]` et traces d'exécution tiennent quand le texte bouge.
- `find` au bloc près, avec une forme de résultat unique.
- Le contrôle des blocs `call` d'une procédure est une requête, pas une analyse de markdown.
- Provenance et révision pour tout bloc, pas seulement pour les lignes de tableau.

### Négatives

- Contraintes conditionnelles : clé obligatoire pour un `row`, forme de `text` et de `data` selon
  le type (vérifiées en base et par les schémas Zod partagés).
- Colonnes creuses selon le type (bail, provenance par cellule).
- Le brouillon double les lignes d'un nœud en cours d'édition.

### Neutres

- Le contrat MCP par section reste ; le schéma d'un tableau reste dans `nodes.meta`.

## Alternatives considérées

### Sections dans le nœud

Moins de lignes et un brouillon simple, mais ni écriture ni ancre au bloc, une recherche par
section seulement, et le contrôle des `call` par analyse du texte. Rejetée.

### Lignes de tableau dans une table à part (`rows`)

Contraintes plus nettes (clé et types propres aux lignes), mais deux modèles de contenu, deux
recherches et deux chemins d'écriture. Rejetée, en rendant les métadonnées des lignes (clé,
provenance, révision, bail) utiles à tout bloc.

### Historique bloc par bloc

Plus fin, mais une table de plus sans besoin exprimé ; les instantanés de publication et la
révision de chaque bloc suffisent.
