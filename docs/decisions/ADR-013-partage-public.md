# ADR-013 — Partage public d'un contenu par lien

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-27 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

Toute lecture du paquet passe par une personne authentifiée : la porte vérifie son jeton, le
service décide son droit sur le nœud (`security-patterns.md § Droits dans le service`, ADR-012
§ 3), la base n'isole que les organisations. Partager un contenu (et, au choix, ses sous-contenus)
avec quelqu'un qui n'a pas de compte, comme « Publier sur le web » de Notion, introduit un lecteur
nouveau : anonyme, sans organisation, que seul un jeton désigne.

## Décision

1. **Un lien de partage est une ligne** `platform.node_shares` : `org_id`, `node_id`, `token`
   (32 octets aléatoires tirés par le service, encodés en base64url, unique ; jamais dérivé du
   nœud), `include_children` (booléen), `created_by`, `created_at`, `revoked_at` (null tant que le
   lien vaut). Un seul lien actif par nœud. RLS d'isolation par organisation, écriture colonne par
   colonne ; un lien ne se supprime pas, il se révoque. L'import d'une organisation ne recopie jamais
   un jeton.
2. **Qui partage** : qui a le niveau `manage` sur le nœud (« Accès complet »), décidé par le
   service avant la requête ; l'admin de l'organisation liste et révoque tous les liens actifs de
   son organisation.
3. **Ce qu'un lien donne** : la **dernière version publiée** du nœud (titre, résumé, blocs
   publiés ; pour un tableau, ses lignes publiées en grille de lecture, 500 au plus, valeurs seules),
   et, si `include_children`, celle des nœuds dessous dans l'arbre, au moment de la lecture, **dans la
   limite de ce que l'auteur du lien lit à cet instant** (`node_level_of`) : un lien ne publie
   jamais plus que ce que son auteur voit, même quand un autre ajoute un contenu dessous plus tard ;
   un auteur qui ne lit plus le nœud, ou qui a quitté l'organisation, rend le lien inerte (404).
   L'auteur est qui a créé ou réglé le lien en dernier. La racine de l'organisation, `private`, les
   espaces personnels, les Contextes, les dossiers d'équipe et l'espace « Privé » d'une autre
   personne ne se partagent pas. Rien d'autre : ni brouillon, ni règles d'accès, ni auteurs, ni
   preuve ni provenance, ni réservation, ni journal, ni MCP. Un contenu à la corbeille n'est pas
   servi. Un lien interne vers un contenu que le lien ne couvre pas s'affiche en texte, sans cible.
4. **Qui lit** : une page publique de l'hôte (`/p/<jeton>`), à l'adresse de l'organisation, hors
   session, en lecture seule, au thème de l'organisation. Elle lit par une seule fonction de la base,
   `public_node_by_token(org, jeton, chemin)`, `security definer`, exécutable par `anon` seul, bornée
   au jeton et à l'organisation de l'adresse. Un jeton inconnu, révoqué ou d'une autre organisation,
   un chemin hors du lien, rendent 404, sans dire lequel.
5. **Jamais indexée** : `noindex, nofollow` (en-tête `X-Robots-Tag` et balise), page exclue de
   tout sitemap.
6. **Portabilité** : la page, le service et la fonction sont dans le paquet (faces `ui/`, `api/`,
   `server/`, `migrations/`), sans Supabase ; l'hôte monte une route de plus.

## Conséquences

### Positives
- Un contenu se partage hors de l'organisation sans créer de compte.
- La lecture publique ne passe par aucune session : aucun droit d'une personne n'est prêté au
  lecteur.

### Négatives
- Un lecteur anonyme existe : chaque lecture publique ne doit sortir que du périmètre du jeton, ce
  qu'un test sur base réelle par cas prouve (autre nœud, sous-nœud sans `include_children`,
  brouillon, lien révoqué, autre organisation, sous-nœud que l'auteur ne lit pas, nœud ajouté plus
  tard par un autre, auteur retiré, racine et `private` refusés).
- Un jeton fuité donne la lecture jusqu'à sa révocation.

### Neutres
- La liste d'outils MCP ne change pas.

## Alternatives considérées

### Un compte invité par lecteur
Rejeté : c'est l'invitation qui existe déjà ; le besoin est un lien sans compte.

### Lire par la connexion d'administration
Rejeté : elle contourne la RLS entière ; une fonction bornée au jeton limite ce qu'un défaut peut
exposer.
