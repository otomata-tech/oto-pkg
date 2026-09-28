# Fiche — portage-ecrans

Texte complet : `.method/conventions/portage-ecrans.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- Une seule coque, le rail du paquet monté par le layout : l'hôte ne pose aucune navigation propre, aucun écran ne rend un second arbre, aucune page de liste par genre (`/procedures`). § 0. Une seule coque, le rail d'oto-frontend
- Tout ce que l'arbre porte (page, tableau, procédure, Contexte) s'ouvre à `/n/<chemin>` ; les écrans hors de l'arbre s'ouvrent depuis les menus du rail. § 0. Une seule coque, le rail d'oto-frontend
- `.oto-content` reste un bloc conteneur (`position: relative`). § 0. Une seule coque, le rail d'oto-frontend
- La navigation arrive par props (`Lien`, `hrefDuNoeud`, `cheminActif`) ou par `ContexteDeLHote` : un `Link` d'oto-frontend devient `<Lien href={…}>`, une valeur de `useParams` ou `useSearch` une prop ; l'état partageable reste dans l'URL de l'hôte. § 1. Navigation reçue de l'hôte, par props
- L'écran exporté est un Server Component ; seul le morceau qui a un état est `"use client"`, et il reçoit du `ReactNode` déjà rendu, jamais une fonction ni un composant. § 2. Server Component, client au plus bas
- Un îlot relu (`useRafraichir()`) remet ses champs à l'état servi quand celui-ci change (React Hook Form : `values`) ; après un refus, un îlot à listes revient à l'état servi, un îlot à champ texte garde la saisie ; son test rerend, joue un refus, puis lit les champs. § 2. Server Component, client au plus bas
- Aucune `key`, aucun `id` ni attribut du premier rendu ne vient d'un état de module (compteur, `Math.random()`, `Date.now()`) : l'`id` de la donnée, ou `useId`. § 2. Server Component, client au plus bas
- Un îlot qui écrit dans le `<head>` de l'hôte traite chaque élément visé, jamais le premier seul. § 2. Server Component, client au plus bas
- Dans un fichier `"use client"` de `ui/`, aucun `.map(` dans le corps du composant exporté : les listes de choix vivent dans un composant interne ou une fonction d'options. § 2. Server Component, client au plus bas
- Le déclencheur d'un `DropdownMenu` ou d'un `Tooltip` est l'élément qui prend ref et gestionnaires (`IconButton`, `Button`, `<button>`), jamais un composant maison ; le test ouvre chaque menu par son déclencheur. § 2. Server Component, client au plus bas
- Un `<Suspense>` n'entoure que ce qui attend sa promesse, son repli ne recopie jamais un contenu prêt (servi deux fois pendant le flux) ; le test sert l'écran par `renderToReadableStream` et compte une fois le texte prêt. § 2. Server Component, client au plus bas
- Couleurs : les seules classes de `@theme inline` d'`ui/styles/oto.css`, aucun token de l'hôte ; un token ajouté se mesure d'abord en paire réelle sur les huit thèmes, jour et nuit, jamais recalculé. § 3. Tokens du jeu Oto, sous `CoquilleOto`
- Focus en `focus-visible:ring-2 focus-visible:ring-ink`, jamais `ring-ring` ; contour d'un champ en `ring-1 ring-mute`, jamais `border-<couleur>`. § 3. Tokens du jeu Oto, sous `CoquilleOto`
- Ni l'écran ni une page de `(dashboard)` ne pose `.oto` ou `CoquilleOto`, que le layout pose une fois ; une page d'authentification pose `CoquilleOto` en `pleinePage` et monte `EcranDAuthentification`, sauf le consentement OAuth. § 3. Tokens du jeu Oto, sous `CoquilleOto`
- Un décor qui ne s'écrit pas en utilitaires vit dans la section 4 d'`oto.css`, en sélecteurs `oto-` sous `.oto`, sur les seuls jetons du contrat ; un accent du panneau d'encre lit `--rail-on-bg`. § 3. Tokens du jeu Oto, sous `CoquilleOto`
- Les deux thèmes se contrôlent à l'œil avant de livrer ; un glyphe lucide d'oto-frontend devient son équivalent Phosphor. § 3. Tokens du jeu Oto, sous `CoquilleOto`
- L'écran reçoit `resultat: { data } | { error }` et rend données, vide (une phrase) et erreur (`role="alert"`) ; il exporte `<Écran>Chargement` (`role="status"`, `aria-busy`) pour le `fallback` de l'hôte. § 4. Quatre états
- Une lecture en échec se dit (erreur et « Réessayer »), jamais `resultat.data ?? []` ni un nom inconnu ; l'échec se dit avant une réserve de rôle ; le test met chaque `resultat` en échec. § 4. Quatre états
- Un panneau que son hôte monte après avoir dit l'échec reçoit la donnée, pas un `resultat`. § 4. Quatre états
- Un code propre au service qu'une page lit a sa phrase, par `resultatDe(promesse, propres)`, et un test qui le fait lever. § 4. Quatre états
- Les données d'exemple partent dès que l'écran réel existe. § 4. Quatre états
- Ne se portent pas : agents, exécutions, runs, toolbox, conventions `_org`, `_project`, `_run_id`, bloc Connecteurs de l'accueil avant la V2 (l'entrée Connecteurs est au pied du rail) ; un commentaire d'historique se réduit à son pourquoi, en une ligne. § 5. Ce qui ne se porte pas
- Chaque écart visible avec la capture d'oto-frontend se liste, avec sa raison, dans « Écarts avec la référence UI » de la story. § 5. Ce qui ne se porte pas
- Ce que le service et l'écran appliquent tous deux (validation, chaîne servie, borne dite) vit dans `schemas/` ; aucune fonction de `ui/` ne refait une fonction de `server/`, aucun libellé n'écrit en chiffres une borne de `schemas/`. § 6. Une règle du service, une seule source
