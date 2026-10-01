# Story Ready — Definition of Ready

<!--
  Vérifiée par dev avant d'implémenter une story.
  Les items marqués « (story fonctionnelle) » ne s'appliquent pas à une story technique
  (setup, migration d'outillage, dette) : celle-ci n'a ni parcours ni FR à référencer, et ses
  AC ne sont pas tous vérifiables par un test automatisé. Les déclarer sans objet, avec la
  raison — pas les cocher de force, pas les ignorer.
-->

- [ ] La story a le statut 🟢 Ready
- [ ] Les critères d'acceptation sont en Given/When/Then
- [ ] La section « Implémentation » liste les fichiers à créer ou modifier
- [ ] La section « Tests attendus » liste les tests à écrire
- [ ] La référence UI est renseignée (fichier JSX, lien, description texte, **ou `N/A`**)
- [ ] Les stories prérequises sont ✅ Done
- [ ] (échelle Standard ou Module) La section « **Rayon d'impact** » est remplie : appelants avec commande citée, doublons avec verdict, effet produit, refacto proposé ou écarté — et tout refacto proposé a été **posé en question** via `AskUserQuestion`, pas laissé en note
- [ ] Le champ **Conventions** est renseigné dans la section Meta — utile surtout pour les tags que les globs ne peuvent pas déduire (`datetime`, `i18n`, `flags`), voir `.method/conventions/_index.md`
- [ ] (story fonctionnelle) Chaque AC est vérifiable par un test automatisé
- [ ] (story fonctionnelle) Les refs PRD (parcours + FR) et conception (`docs/conception/<sujet>.md`) sont renseignées

## Stories du paquet

- [ ] Contexte, **Périmètre** et **Hors périmètre** écrits ; chaque ligne hors périmètre dit où elle va (autre story, V2)
- [ ] Les AC couvrent les erreurs et les états vides, avec les codes d'erreur nommés (`PlatformErrorCode`, `packages/plateforme/server/errors.ts`)
- [ ] Deux AC ne donnent pas deux issues à la même requête (même route, même méthode, même état de session) ; un AC qui fait ramener une Server Action à la connexion dit ce qu'en fait le middleware (`auth-patterns.md § Middleware`)
- [ ] Un texte de refus que la story fixe mot pour mot pour une désignation ambiguë d'une action (au moins deux équipes, comptes ou fonctions y répondent) porte la consigne de montrer la liste à l'utilisateur et de lui demander, sans choisir à sa place ; un refus « inconnu » (aucune correspondance) liste ce qui existe, sans cette consigne ; toute liste d'un refus est bornée (`mcp-patterns.md § 3` « Résolution par nom », `§ 4` « Un refus tient aussi sous le plafond »)
- [ ] Une garantie de sécurité que la story ou son document de conception promet (« isolé », « sans sortie », « illisible par… ») nomme chaque canal qu'elle ferme **et** chaque canal qui reste ouvert, et chaque canal a son cas dans les tests attendus
- [ ] Fichiers à créer ou modifier rangés **par face** du paquet (`ui/`, `schemas/`, `api/`, `mcp/`, `server/`, `migrations/`) et dans l'hôte
- [ ] **Migrations prévues** écrites (tables, colonnes, index, RLS), additives ; ou « Aucune » avec la raison
- [ ] **Schémas Zod partagés** nommés, avec leur fichier
- [ ] Tests attendus par niveau : unitaires, intégration et RLS (données jetables), MCP par `InMemoryTransport` si un outil est touché, golden queries, contrôle visuel pour un écran
- [ ] **Dépend de** (IDs exacts) et **Porteuse de migration** renseignés dans Meta, cohérents avec les issues dont la story dépend
- [ ] Section **Actions JB** présente : gestes réservés (service extérieur, vrai secret, publication), ou « Aucune »
- [ ] Estimation S, M ou L — jamais XL : sinon découper

Si un item bloque, le signaler et s'arrêter : implémenter une story non prête produit un
travail que la review ne pourra pas juger.
