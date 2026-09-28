# Story E05-S11 — Retours produit : profil, Contexte servi, réglages, coque, listes, langue

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E05 — Écrans de la plateforme |
| **Parcours** | Écrire et organiser le contenu ; régler son compte et l'organisation ; voir ce que lit l'assistant |
| **Statut** | 🟢 Ready |
| **Priorité** | Must — avant la publication 1.0.0 (fiche D105) |
| **Référence UI** | oto-frontend (`C:\apps\oto-frontend`, lecture seule) : `routes/settings.profile.lazy.tsx` et `components/settings/profile-identity.tsx`, `language-preference.tsx` (Profil) ; `components/ui/onglets.tsx` (onglets de l'accueil) ; `design-system/components/react/selects.jsx` (liste en popover) ; `routes/settings.company.lazy.tsx` (Organisation). Le reste : retours de JB du 2026-09-28 ci-dessous, dans le style du paquet |
| **Conventions** | portage, a11y, forms, feedback, state, nextjs, performance, seo, api, database, supabase, security, registry, testing, mcp (texte servi par `context`), i18n (lot g) |
| **Estimation** | L (sept lots, chacun S à M ; le lot g est le plus gros, découpable en g1 paquet / g2 hôte) |
| **Vague** | Retours avant 1.0.0 (D105) |
| **Dépend de** | E05-S10 entière, fusionnée (b2 gestes du rail, c temps d'affichage, d partage public) ; M59 (procédure = page, D104) |
| **Porteuse de migration** | Oui, lot a seulement (Ⓜ) : `20260928110000_platform_profil.sql` |

## Contexte

Essais de JB sur le SaaS déployé, 2026-09-28 : dix-neuf retours (le vingtième, tronqué, est le 13 : réponse de JB
du 2026-09-28). Réponses de JB du même jour (fiche D105) : ces retours passent avant 1.0.0 ; la langue du profil
change **l'interface** (paquet et hôte, français et anglais au moins) et la langue de réponse de l'assistant ;
défaut : la langue de l'organisation, puis le français.

Base : `main` après la fusion de E05-S10 b2, c, d et de M59. Les fichiers cités sont ceux de cette base (lus dans
les worktrees `agent-afdf2d8a289a69248` b2, `agent-a50072224df1484bb` d, `agent-a232a30aef1163001` c,
`agent-aeb9d340f844aa649` M59).

**Refs :** architecture § 3 (nœuds, blocs, liens `[[…]]`), § 4 (`orgs.brand`, `members.profile`), § 10 ; ADR-008
§ 3 (thème de l'organisation, `CoquilleOto`), ADR-011 ; E05-S04 (Contexte, « Ma fiche », aperçu), E05-S09
(reprise fidèle), E05-S10 (éditeur, coque, Contenus liés), E08-S03/S04 (réglages, drapeaux), E09-S01 (marque).

### Périmètre

Les dix-neuf retours et la langue de l'interface (D105), en sept lots (§ Plan).

### Hors périmètre

- Recherche dans une liste (Combobox, MultiSelect à champ de saisie) : plus de vingt options nulle part (règle
  d'oto-frontend, `selects.jsx`) → V2.
- Langues autres que français et anglais → après 1.0.0 (D105 : « au moins »).
- Retrait du code mort laissé par les lots d et e (`EcranMarque`, `EcranDrapeaux`, `EcranAccesPlateforme`, leurs
  exports, les clés `marque`, `drapeaux`, `acces` d'`AdressesDuRail` et d'`EcranDAdministration`) → tâche de suite
  (HN-E05S11-15).
- Descriptions d'outils, refus et textes du MCP : restent en anglais (H04, H25) ; seul `context` ajoute la langue
  de réponse (HN-E05S11-5).

## Critères d'acceptation

### Retour 1 — « Enregistré. » sans décaler la page (lot b)

- [ ] **AC-1** Sur une page, une procédure, un tableau et un Contexte (et dans la vue « Contexte » de l'accueil,
  AC-12), « Enregistrement… » puis « Enregistré. » paraissent en haut à droite de la carte du document, en
  position absolue : aucun bloc ne bouge quand ils paraissent ou disparaissent (position du premier bloc mesurée
  identique avant, pendant et après, test Playwright).
- [ ] **AC-2** « Enregistré. » disparaît 5 s après le dernier enregistrement réussi (horloge simulée) ; une
  nouvelle écriture le remplace par « Enregistrement… ». Le titre et le résumé écrits en place passent par la
  même indication. La région reste `role="status"`, montée vide ; un échec garde son alerte (inchangée).

### Retour 2 — page « Profil » (lots a et e)

- [ ] **AC-3** `/profil` (tout membre) : Prénom, Nom, Langue (« Celle de l'organisation », Français, English),
  Couleur (« Celle de l'organisation » puis les huit thèmes en pastilles). Seuls les champs changés partent à
  `PATCH /api/plateforme/profile` ; « Enregistrer » désactivé tant que rien ne change ; refus dit par la table des
  messages.
- [ ] **AC-4** La couleur choisie colore toute l'application de la personne (`CoquilleOto`, favicon) ; sans
  choix, celle de l'organisation. Un autre membre ne voit pas la couleur d'un collègue.
- [ ] **AC-5** `update_my_profile` accepte `first_name` et `last_name` (80 caractères), `theme` (un des huit),
  garde `name` et `language` ; écrire le prénom ou le nom recompose `name` (« Prénom Nom ») ; une clé inconnue,
  un thème hors liste, une valeur trop longue sont refusés (`invalid_arguments`) ; test sur base réelle portable.
- [ ] **AC-6** Le pied du rail n'a plus la ligne « Couleur » ; le menu du compte : « Profil » ouvre `/profil`
  (plus le Contexte privé), « Apparence » disparaît (HN-E05S11-31).

### Retour 3 — Contexte privé (lot c)

- [ ] **AC-7** L'adresse du Contexte privé et de tout contenu de l'espace privé dit `prive` :
  `/n/prive/<handle>/…` ouvre le contenu ; `/n/perso/<handle>/…` y redirige (308) ; le rail marque la ligne
  courante ; les chemins servis aux assistants restent `perso/…` (HN-E05S11-6, → fiche).
- [ ] **AC-8** « Ma fiche » n'est plus dans la colonne de droite d'aucun Contexte (elle est dans Profil, AC-3).

### Retour 4 — l'encart de droite d'un Contexte (lot c)

- [ ] **AC-9** Le titre de l'encart est « Voici ce que votre agent va lire » ; la légende « Blocs servis, dans
  l'ordre » devient « Ordre de lecture » ; « <n> caractères sur <budget>. » est la dernière ligne de l'encart.
- [ ] **AC-10** « Texte servi » (le `<details>`) disparaît.
- [ ] **AC-11** Chaque ligne de l'encart (« Code de la conversation », « Organisation », « Contexte : Tout le
  monde »…) est un lien vers la vue « Contexte » de l'accueil, ouverte sur la même partie (`/?onglet=contexte#<ancre>`,
  HN-E05S11-9) ; au clavier aussi.

### Retours 4 et 6 — la vue « Contexte » de l'accueil (lot c)

- [ ] **AC-12** L'îlot principal de l'accueil porte deux onglets, « Activités » (le fil d'aujourd'hui) et
  « Contexte » (`?onglet=contexte`), par le composant `Onglets` du paquet (motif APG, flèches, Début, Fin).
- [ ] **AC-13** L'onglet « Contexte » montre, empilées dans l'ordre servi, toutes les parties du texte que
  `context` servirait (même moteur que l'aperçu, `previewContext`), chacune avec son nom, sa taille et son état,
  et son ancre ; puis « <n> caractères sur <budget>. ».
- [ ] **AC-14** Une partie qui vient d'un Contexte que la personne peut écrire (niveau 2 ou 3) s'écrit en place
  (l'éditeur de blocs d'une page, publication seule au niveau gestion, AC-1) ; les autres parties se lisent
  (texte servi tel quel) ; la partie « Vous » renvoie à Profil. Après une publication, la vue se relit.
- [ ] **AC-15** États : aperçu en échec (message et « Réessayer »), partie omise ou coupée (son état dit) ;
  aucun Contexte écrivable (tout en lecture).

### Retour 5 — « Contenus récents » vide (lot c)

- [ ] **AC-16** Quand le paquet ne sert pas les contenus récents, l'îlot montre l'état vide du design system
  (`EmptyState`) au titre « Les pages et les tableaux récemment touchés arrivent. ».

### Retour 7 — titres des Contexte, sans tiret cadratin (lots b et e)

- [ ] **AC-17** Le titre d'une page de Contexte (le `<h1>`) est « Contexte · Tout le monde », « Contexte ·
  <équipe> » ou « Contexte · Privé » ; le titre du document (`<title>`) aussi ; le titre enregistré ne change pas.
- [ ] **AC-18** Le rail et la palette écrivent « Contexte · <section> » ; aucun libellé de la coque (`ui/coque/`)
  ne contient « — » (test : lecture des tables de libellés).

### Retour 8 — listes de choix (lot f)

- [ ] **AC-19** Toute liste de choix du paquet et de l'hôte est le `Select` du design system : un déclencheur au
  bord entièrement arrondi, du style du bouton « Partager · Tout le monde » (`oto-scope`), qui ouvre un popover
  de choix (motif APG « select-only combobox » : flèches, Début, Fin, frappe de l'initiale, Entrée, Échap rend le
  focus) ; plus aucun `<select>` natif (`rg -n "<select" packages/plateforme/ui src` ne trouve que le design
  system s'il en garde un caché, aucun rendu visible).
- [ ] **AC-20** Formulaires : un choix part avec le formulaire (GET du journal, du tableau de bord, filtres de
  colonne ; `react-hook-form` des invitations, réglages d'équipe, connecteurs, règles) ; dans « Partager », le
  choix du niveau s'ouvre sans fermer le panneau.
- [ ] **AC-21** Les menus à cases (équipes d'une personne) gardent leur popover ; leur déclencheur prend le même
  bord arrondi.

### Retours 9, 10, 15 — Réglages de l'organisation (lot d)

- [ ] **AC-22** `/admin/organisation` porte « Le logo et le nom » (adresse du logo, nom affiché) et « La couleur »
  de l'organisation (thème par défaut des comptes, AC-4), écrits par `PATCH brand` comme hier.
- [ ] **AC-23** « Seuil de routage » et « Écart minimal » ne sont plus à l'écran ; les îlots « Adresses et
  outils », « Contact » et « Marque et guide » non plus. Le service, l'API et `admin_org` gardent ces réglages.
- [ ] **AC-24** Un îlot « Contexte · Tout le monde » lit le Contexte de l'organisation (blocs publiés, rendus
  comme en lecture ; vide, il le dit) et porte « Modifier », qui ouvre `/n/contexte`.
- [ ] **AC-25** `/admin/marque` et `/admin/drapeaux` redirigent (308) vers `/admin/organisation` ; `/admin/acces`
  vers `/equipes?onglet=acces`.

### Retour 11 — citations en puces dans le texte (lot b)

- [ ] **AC-26** Dans un bloc de texte, `[[chemin]]` et `[[chemin|titre]]` se rendent en puce **dans la phrase**
  (glyphe de la nature, titre de la page, jamais le chemin), en lecture comme en écriture au repos ; la rangée de
  liens sous le bloc (`oto-block-refs`) disparaît. Une cible invisible ou à la corbeille : texte sans lien.
- [ ] **AC-27** Le titre d'une puce : le libellé écrit (`|titre`, posé par « @ »), sinon le titre de la cible lu
  dans les liens sortants du nœud, sinon le dernier segment du chemin.

### Retour 12 — tout sélectionner ouvre le menu du bloc (lot b)

- [ ] **AC-28** Quand la sélection couvre tout le texte non vide d'un bloc (⌘A / Ctrl+A, ou glissé), le popover
  de sa poignée s'ouvre, sans prendre le focus ; Échap ou la frappe suivante le ferme ; vaut pour page et
  procédure.

### Retours 13 et 20 — « Contenus liés » (lot b)

- [ ] **AC-29** Trois rubriques : « Sous <titre du contenu> » (les nœuds dessous), « Cités ici » (ce que ses
  blocs citent), « Cité par » (ce qui le cite) ; chacune absente quand elle est vide ; le résumé du bandeau
  compte les trois.

### Retour 14 — largeur (lot b)

- [ ] **AC-30** La largeur maximale d'un document passe de 780 à 830 px (`--content-max-doc`) ; la marge droite
  des blocs, vide depuis que le menu est dans la poignée, disparaît (texte plus large de 48 px, gouttière gauche
  inchangée) ; contrôle visuel à 375 et 1 280 px, deux thèmes.

### Retours 15 à 19 — la coque (lot e)

- [ ] **AC-31** « Drapeaux » et « Marque » ne sont plus dans le rail, le menu de l'entreprise, la palette ni le
  fil des écrans d'administration.
- [ ] **AC-32** « Connecteurs » est une ligne du pied du rail (qui administre), au-dessus du compte, et n'est
  plus dans le menu de l'entreprise.
- [ ] **AC-33** Menu de l'entreprise : « Réglages de l'entreprise » (Organisation, Équipes & accès) avant
  « Suivi de l'entreprise » ; le groupe « Membres & équipes » disparaît ; « Équipes & accès » ouvre `/equipes`,
  titré « Équipes & accès » (lot d).
- [ ] **AC-34** Le « + » de la section Privé propose une page, un tableau, une procédure, comme ailleurs.
- [ ] **AC-35** Une procédure porte l'icône `Play` partout (rail, palette, navigateur d'arbre, création, « Contenus
  liés », accueil).

### Langue du profil (D105 ; lots a et g)

- [ ] **AC-36** Langue effective = celle du profil, sinon celle de l'organisation (`orgs.brand.language`, réglée
  dans `/admin/organisation`), sinon le français.
- [ ] **AC-37** `context` dit à l'assistant de répondre dans la langue effective (une ligne du bloc « Vous ») ;
  golden queries relues.
- [ ] **AC-38** Tous les écrans du paquet (`ui/`) et les pages de l'hôte (titres, métadonnées, connexion)
  s'affichent en anglais pour une personne dont la langue effective est l'anglais : aucun texte français (test :
  chaque catalogue anglais a toutes les clés du français, vérifié par `tsc` ; campagne Playwright en anglais) ;
  `<html lang>` suit ; dates et nombres par `Intl` dans cette langue ; les refus de l'API passent par la table
  des messages de la langue.
- [ ] **AC-39** Changer sa langue dans Profil change l'interface à la relecture de la page, sans reconnexion.

## Plan en lots

Parallélisme (`.method/sprint/vagues.md`) : aucun fichier source commun entre lots en cours hors fichiers
d'ajout (`ui/index.ts`, `schemas/index.ts`, `server/index.ts`) ; une seule partie Ⓜ, fusionnée en premier. Un
fichier listé dans deux lots l'est dans deux lots **successifs** (le second part de `main` après la fusion du
premier).

| Ordre | Lot | Retours | Ⓜ | Dépend de |
|-------|-----|---------|----|-----------|
| Vague 1 | **a** Profil et langue servie | 2 (profil), D105 (langue servie) | Ⓜ | — |
| Vague 1 | **b** Éditeur et page d'un nœud | 1, 7 (titre), 11, 12, 13, 14 | — | — |
| Vague 1 | **c** Contexte et accueil | 3, 4, 5, 6 | — | — |
| Vague 1 | **d** Réglages de l'organisation | 9, 10, 15 (routes), 17 (écran) | — | — |
| Vague 2 | **e** Coque | 2 (couleur, menu), 7 (rail, `<title>`), 15, 16, 17 (menu), 18, 19 | — | a (`profile.theme`), b (`titreDeContexte`), c (`page.spec.ts`, page d'un nœud), d (écrans retirés) |
| Vague 3 | **f** Listes de choix | 8 | — | e (tests du rail et des pages) |
| Vague 4 | **g** Langue de l'interface | D105 (écrans) | — | tous : il touche les catalogues et les écrans de chacun |

Pourquoi e, f et g ne partent pas en vague 1 : e partage `e05s10b.spec.ts` avec b, `page.spec.ts` et la page
d'un nœud avec c ; f touche les tests de presque tous les écrans (une liste native se pilote par `change`) ; g
touche chaque catalogue et chaque écran. Leur ordre est celui de leurs fichiers communs.

### Lot a — Profil et langue servie (Ⓜ)

Migration `packages/plateforme/migrations/20260928110000_platform_profil.sql` : `update_my_profile` re-versionnée
(même signature) : champs `name` (80), `language` (`fr`, `en`), `first_name` (80), `last_name` (80), `theme` (les
huit de `OTO_THEMES`) ; prénom ou nom écrit ⇒ `name` recomposé. Additive, portable, aucune table ni colonne ;
`server/database.ts` inchangé (signature identique). Appliquée par l'agent du lot (`supabase db push --db-url`).

Fichiers :
- `packages/plateforme/migrations/20260928110000_platform_profil.sql` (créé), `packages/plateforme/migrations/README.md`
- `packages/plateforme/schemas/profile.ts` (`profilePatchSchema` : `first_name`, `last_name`, `theme`, `language`
  avec `""` ; `ProfileView`), `packages/plateforme/schemas/brand.ts` (`language` facultatif dans `brandInputSchema`),
  `packages/plateforme/schemas/index.ts` (ajout)
- `packages/plateforme/server/identity.ts` (`MemberProfile` : `first_name`, `last_name`, `theme` ; `memberProfile`),
  `packages/plateforme/server/members.ts` (vue rendue par `updateProfile`), `packages/plateforme/server/brand.ts`
  (`readBrand` rend `language`), `packages/plateforme/server/language.ts` (créé : `preferredLanguage(identity)`,
  `preferredTheme(identity)`), `packages/plateforme/server/context/blocks/person.ts` (ligne de langue),
  `packages/plateforme/server/index.ts` (ajout)
- `packages/plateforme/ui/profil/ecran-profil.tsx`, `packages/plateforme/ui/profil/formulaire-du-profil.tsx`,
  `packages/plateforme/ui/profil/libelles.ts` (créés), `packages/plateforme/ui/index.ts` (ajout)
- `src/app/(dashboard)/profil/page.tsx`, `src/app/(dashboard)/profil/loading.tsx` (créés)
- Tests : `tests/integration/profil.test.ts`, `tests/unit/profile-services.test.ts`, `tests/unit/schemas/profile.test.ts`,
  `tests/unit/schemas/brand.test.ts`, `tests/unit/server-brand.test.ts`, `tests/unit/context-blocks.test.ts`,
  `tests/integration/mcp-core.test.ts` (si la ligne « Language » y est lue), `tests/integration/components/e05s11-profil.test.tsx`,
  `tests/integration/pages/e05s11-profil-page.test.tsx` (créés)

Le formulaire reprend `ma-fiche.tsx` (nom et langue) en y ajoutant prénom, nom et couleur ; `ma-fiche.tsx` reste
en place (retiré par c). La couleur réutilise `ThemeSwatches` / `RailThemePicker` du design system.

### Lot b — Éditeur et page d'un nœud

Fichiers :
- `packages/plateforme/ui/noeud/editeur/lignes-d-etat.tsx` (indication d'enregistrement, 5 s),
  `packages/plateforme/ui/noeud/editeur/editeur-de-blocs.tsx`, `packages/plateforme/ui/noeud/editeur/use-envois.ts`,
  `packages/plateforme/ui/noeud/editeur/champ-de-bloc.tsx` (repos rendu / écriture brute, sélection totale),
  `packages/plateforme/ui/noeud/editeur/rangee-de-bloc.tsx` (`LiensDuBloc` retiré, menu ouvert par la sélection),
  `packages/plateforme/ui/noeud/editeur/gestes.ts`
- `packages/plateforme/ui/noeud/en-tete-modifiable.tsx`, `packages/plateforme/ui/noeud/en-tete-du-noeud.tsx`
  (titre d'un Contexte), `packages/plateforme/ui/noeud/ecran-de-noeud.tsx` (indication dans la carte, titres des
  liens, titre passé au bandeau), `packages/plateforme/ui/noeud/corps-du-noeud.tsx`,
  `packages/plateforme/ui/noeud/sous-pages.tsx`, `packages/plateforme/ui/noeud/libelles.ts`,
  `packages/plateforme/ui/noeud/en-ligne.ts`, `packages/plateforme/ui/noeud/rendu-des-blocs.tsx`,
  `packages/plateforme/ui/noeud/puce-de-lien.tsx` (créé)
- `packages/plateforme/ui/arbre/depuis-l-arbre.ts` (`titreDeContexte(section)`, lu ensuite par e)
- `packages/plateforme/ui/ds/components/css/blocks.css`, `packages/plateforme/ui/ds/components/css/editeur.css`,
  `packages/plateforme/ui/ds/components/css/content.css`, `packages/plateforme/ui/styles/oto.css` (`--content-max-doc`)
- Tests : `tests/integration/components/ecran-de-noeud.test.tsx`, `tests/integration/components/editeur-de-blocs.test.tsx`,
  `tests/integration/components/en-tete-modifiable.test.tsx`, `tests/unit/ui-en-ligne.test.ts`,
  `tests/integration/pages/e05s10d-page-publique.test.tsx`, `tests/e2e/e05s10a-edition.spec.ts`,
  `tests/e2e/e05s10b.spec.ts`, `tests/e2e/partage-public.spec.ts`, `tests/e2e/fixtures/noeud.ts`,
  `tests/integration/components/e05s11-editeur.test.tsx`, `tests/e2e/e05s11-page.spec.ts` (créés)

### Lot c — Contexte et accueil

Fichiers :
- `packages/plateforme/ui/contexte/annexes-du-contexte.tsx`, `packages/plateforme/ui/contexte/apercu-du-contexte.tsx`,
  `packages/plateforme/ui/contexte/libelles.ts`, `packages/plateforme/ui/contexte/ma-fiche.tsx` (supprimé),
  `packages/plateforme/ui/contexte/contexte-servi.tsx` (créé : la vue, parties empilées),
  `packages/plateforme/ui/contexte/parties-du-contexte.ts` (créé : découpe pure du texte par le rapport)
- `packages/plateforme/ui/accueil/ecran-accueil.tsx`, `packages/plateforme/ui/accueil/contenus-recents.tsx`,
  `packages/plateforme/ui/accueil/libelles.ts`, `packages/plateforme/ui/accueil/types.ts`, `packages/plateforme/ui/index.ts` (ajout)
- `src/app/(dashboard)/page.tsx` (onglet, aperçu, Contextes écrivables lus), `src/app/(dashboard)/n/[...chemin]/page.tsx`
  (plus de `fiche`, lien des lignes de l'encart), `next.config.ts` (redirection et réécriture `prive`),
  `src/app/(dashboard)/fournisseur-de-rafraichissement.tsx` (chemin courant ramené à `perso` pour le rail)
- Tests : `tests/integration/components/contexte.test.tsx`, `tests/integration/components/ecran-accueil.test.tsx`,
  `tests/integration/pages/accueil-page.test.tsx`, `tests/integration/pages/noeud-page.test.tsx`,
  `tests/e2e/accueil.spec.ts`, `tests/e2e/procedure-et-contexte.spec.ts`, `tests/e2e/page.spec.ts`,
  `tests/unit/e05s11-parties-du-contexte.test.ts`, `tests/integration/components/e05s11-contexte-servi.test.tsx`,
  `tests/unit/e05s11-adresse-privee.test.ts` (créés)

`Onglets` s'importe de `ui/equipes/onglets.tsx` sans le déplacer (HN-E05S11-11). L'éditeur (`EditeurDeBlocs`,
`FileDOperations`) s'importe tel quel ; s'il change de props dans b, le pilote adapte l'appel à la fusion.

### Lot d — Réglages de l'organisation

Fichiers :
- `packages/plateforme/ui/admin/organisation/ecran-organisation.tsx`, `packages/plateforme/ui/admin/organisation/formulaire-organisation.tsx`,
  `packages/plateforme/ui/admin/organisation/contexte-de-l-entreprise.tsx` (créé)
- `packages/plateforme/ui/marque/formulaire-de-marque.tsx` (monté dans Organisation ; retour à `/admin/organisation?enregistre=1`)
- `packages/plateforme/ui/equipes/libelles.ts` (`ECRAN` : « Équipes & accès »), `packages/plateforme/ui/equipes/ecran-equipes.tsx`
  (texte du chargement)
- `src/app/(dashboard)/admin/organisation/page.tsx`, `src/app/(dashboard)/admin/marque/page.tsx`,
  `src/app/(dashboard)/admin/drapeaux/page.tsx`, `src/app/(dashboard)/admin/acces/page.tsx` (redirections
  `permanentRedirect`), leurs `loading.tsx` (supprimés), `src/app/(dashboard)/equipes/page.tsx` (métadonnées)
- Tests : `tests/integration/components/ecran-organisation.test.tsx`, `tests/integration/components/ecran-marque.test.tsx`,
  `tests/integration/pages/admin-config-pages.test.tsx`, `tests/integration/pages/e05s10d-organisation-liens.test.tsx`,
  `tests/integration/components/ecran-equipes.test.tsx`, `tests/integration/pages/equipes-page.test.tsx`,
  `tests/e2e/marque.spec.ts`, `tests/e2e/admin-config.spec.ts`, `tests/e2e/equipes.spec.ts`,
  `tests/integration/pages/e05s11-redirections-admin.test.tsx` (créé)

Aucun fichier de `ui/coque/` ni `ui/admin/fil-de-l-administration.tsx` (lot e).

### Lot e — Coque (après a, b, c, d)

Fichiers :
- `packages/plateforme/ui/coque/ecrans.ts`, `packages/plateforme/ui/coque/entreprise-du-rail.tsx`,
  `packages/plateforme/ui/coque/libelles.ts`, `packages/plateforme/ui/coque/pied-du-rail.tsx`,
  `packages/plateforme/ui/coque/rail-application.tsx`, `packages/plateforme/ui/coque/sections-du-rail.tsx`,
  `packages/plateforme/ui/coque/creation-dans-le-rail.tsx`, `packages/plateforme/ui/coque/arbre-du-rail.tsx`,
  `packages/plateforme/ui/coque/palette-de-recherche.tsx`, `packages/plateforme/ui/coque/types.ts` (`profil`)
- `packages/plateforme/ui/admin/fil-de-l-administration.tsx` (ordre des groupes), `packages/plateforme/ui/arbre/navigateur-d-arbre.tsx` (`Play`)
- `src/app/(dashboard)/layout.tsx` (thème de la personne, adresses, plus de `marque`), `src/app/(dashboard)/admin/adresses.ts`,
  `src/app/(dashboard)/n/[...chemin]/page.tsx` (`<title>` d'un Contexte seulement), `packages/plateforme/README.md` (props du rail)
- Tests : `tests/integration/components/rail-application.test.tsx`, `tests/integration/pages/marque-layout-connexion.test.tsx`,
  `tests/e2e/rail.spec.ts`, `tests/e2e/e05s10b.spec.ts`, `tests/e2e/page.spec.ts`, `tests/integration/components/e05s11-coque.test.tsx` (créé)

### Lot f — Listes de choix (après e)

Fichiers :
- `packages/plateforme/ui/ds/react/select.tsx` (liste en popover, entrée cachée pour les formulaires, `forwardRef`
  compatible `register`), `packages/plateforme/ui/ds/components/css/combobox.css`, `packages/plateforme/ui/ds/components/css/field.css`,
  `packages/plateforme/ui/ds/components/css/product.css` (`.oto-share-level`)
- `packages/plateforme/ui/components/choix.tsx`, `packages/plateforme/ui/noeud/deplacement-du-noeud.tsx`,
  `packages/plateforme/ui/equipes/equipes-d-une-personne.tsx` (déclencheur), `packages/plateforme/ui/noeud/partage-du-noeud.tsx`
  (si le panneau doit laisser vivre la liste), `packages/plateforme/ui/profil/formulaire-du-profil.tsx` (si a y a posé
  une liste native), `src/app/design-system/page.tsx`
- Tests : `tests/integration/components/deplacement-du-noeud.test.tsx`, `e05s10b-partage.test.tsx`,
  `e05s10d-partage-web.test.tsx`, `ecran-du-journal.test.tsx`, `ecran-usage.test.tsx`, `file-de-revue.test.tsx`,
  `grille.test.tsx`, `inviter-quelqu-un.test.tsx`, `ecran-connecteurs.test.tsx`, `regles-du-noeud.test.tsx`,
  `ecran-equipes.test.tsx`, `gestes-equipes.test.tsx`, `procedure.test.tsx` (tous sous `tests/integration/components/`),
  `tests/e2e/page.spec.ts`, `tests/e2e/procedure-et-contexte.spec.ts`, `tests/e2e/partage-public.spec.ts`,
  `tests/integration/components/e05s11-select.test.tsx` (créé)

f part seul : un test hors de cette liste qui pilote une liste native s'y ajoute par consigne du pilote.

### Lot g — Langue de l'interface (après f, seul)

Mécanisme (HN-E05S11-26, → fiche, ADR-015 à écrire par le pilote) : pas de `next-intl` dans le paquet (`ui/`
n'importe aucun cadre de l'hôte, ADR-008) ; chaque table de libellés garde son français comme source et reçoit
un jumeau anglais typé (`libelles.en.ts`, `satisfies Catalogue<typeof …>` : une clé manquante ne compile pas) ; un
composant lit sa table par `useLibelles(table)` (client, contexte posé par `CoquilleOto`) ou `libelles(table)`
(serveur, valeur de la requête posée par l'hôte à la résolution de l'identité, `cache` de React) : une ligne en
tête de composant, la logique ne change pas. Les textes en dur d'un écran rejoignent sa table.

Fichiers (liste arrêtée par le pilote au lancement : g part seul, après f) :
- créés : `packages/plateforme/ui/i18n/langue.ts`, `packages/plateforme/ui/i18n/catalogue.ts`,
  `packages/plateforme/ui/i18n/fournisseur-de-langue.tsx`, un `libelles.en.ts` à côté de chaque table :
  `ui/accueil/`, `ui/admin/retours/`, `ui/admin/` (`textes.en.ts`), `ui/api/` (`messages.en.ts`), `ui/contexte/`,
  `ui/coque/`, `ui/equipes/`, `ui/journal/`, `ui/noeud/`, `ui/procedure/`, `ui/tableau/`, `ui/profil/`,
  `src/app/(auth)/messages.en.ts`
- modifiés : ces tables, `ui/format/dates.ts`, `ui/format/nombres.ts`, `ui/components/coquille-oto.tsx`,
  `ui/admin/organisation/formulaire-organisation.tsx` (langue de l'organisation, AC-36), `ui/index.ts` (ajout),
  `src/app/layout.tsx` (`lang`), `src/lib/plateforme/session.ts` (pose la langue de la requête),
  `src/app/(dashboard)/layout.tsx`, les `page.tsx` de l'hôte (métadonnées), et les composants de `ui/` hors `ds/`
  qui portent un texte en dur : 61 fichiers sur la base (`git ls-files 'packages/plateforme/ui/**/*.tsx' | grep -v /ds/ | xargs rg -l '>[^<{}]*[a-zà-ü]{3,}[^<{}]*<|"[A-ZÀ-Ü][a-zà-ü]+ [a-zà-ü]'`), plus les
  textes du design system (`ds/react/*.tsx` : 5 fichiers, libellés d'accessibilité)
- Tests : `tests/unit/e05s11-catalogues.test.ts` (clés et gabarits identiques), `tests/integration/components/e05s11-langue.test.tsx`,
  `tests/e2e/e05s11-anglais.spec.ts` (créés) ; les tests existants restent en français (langue par défaut).

## Implémentation — migrations et schémas

- **Migration** : lot a seulement (ci-dessus). Aucune autre : la langue de l'organisation vit dans `orgs.brand`
  (rendu par `org_by_host`, HN-E05S11-4) ; la couleur par défaut est `orgs.brand.theme` ; la carte `TABLES` de
  l'export ne change pas (aucune colonne).
- **Schémas Zod partagés** : `profilePatchSchema` (`schemas/profile.ts`, formulaire Profil et `updateProfile`),
  `brandInputSchema` (`schemas/brand.ts`, formulaire de la marque et `updateBrand`), `orgSettingsFormSchema`
  inchangé (seuils toujours acceptés, plus montrés).

## Rayon d'impact

### Appelants

- `update_my_profile` / `profilePatchSchema` : `rg -ln "update_my_profile|profilePatchSchema" c:/apps/oto-platform/packages c:/apps/oto-platform/tests c:/apps/oto-platform/scripts`
  → `server/members.ts`, `schemas/profile.ts`, `api/profile.ts`, `ui/contexte/ma-fiche.tsx`, tests `profil`,
  `profile-services`, `schemas/profile`, `spy-t1-b`, `spy-t1-d2a` : champs ajoutés, anciens corps toujours acceptés.
- `members.profile.name` (recomposé) : `rg -ln "profile ->> 'name'|profile\.name" c:/apps/oto-platform/packages c:/apps/oto-platform/src --glob '!*.test.*'`
  → ligne de base (`org_contact`), `server/{identity,invitations,context/blocks/team}.ts`, layout (compte du
  rail), accueil (salut) : lisent toujours `name`, rien ne change pour eux.
- `readBrand` (gagne `language`) : `rg -ln "readBrand\(" c:/apps/oto-platform/packages c:/apps/oto-platform/src` →
  `server/{brand,invitations,oauth,admin/orgs}.ts`, `src/lib/plateforme/marque-de-l-adresse.ts`, layout, page
  Organisation : champ ajouté, lu seulement par `preferredLanguage`.
- `PiedDuRail` / `RailApplication` (`marque` retiré) : `rg -ln "MarqueDuRail|marque=\{" c:/apps/oto-platform/packages c:/apps/oto-platform/src c:/apps/oto-platform/tests`
  → `coque/{types,pied-du-rail,rail-application}.tsx`, layout, `README.md` du paquet, `rail-application.test.tsx`,
  `marque-layout-connexion.test.tsx` ; les autres correspondances (`ui/public/page-publique.tsx`, pages de
  connexion) passent une `marque` à d'autres composants, inchangés.
- `MaFiche` : `rg -ln "MaFiche|FicheDeLaPersonne|MA_FICHE" c:/apps/oto-platform/packages c:/apps/oto-platform/src c:/apps/oto-platform/tests`
  → `contexte/{annexes-du-contexte,libelles,ma-fiche}` seuls (plus la page d'un nœud qui passe `fiche`) : retirés par c.
- `ApercuDuContexte` / `APERCU_DU_CONTEXTE` / `AnnexesDuContexte` : `rg -ln "ApercuDuContexte|APERCU_DU_CONTEXTE|AnnexesDuContexte" …`
  → `contexte/*`, `ui/index.ts`, page d'un nœud, `contexte.test.tsx` (lot c).
- `CONTENUS_LIES` / `sous-pages` : `rg -ln "CONTENUS_LIES|sous-pages" …` → `noeud/{sous-pages,libelles,ecran-de-noeud,corps-du-noeud,deplacement-du-noeud}.tsx`
  (lot b ; `deplacement-du-noeud` ne lit que `libelles`), tests `ecran-de-noeud`, `e05s10b.spec`,
  `partage-public.spec`, `e05s10d-page-publique` (lot b).
- `LiensDuBloc` / `oto-block-ref` : `rg -ln "LiensDuBloc|oto-block-ref|LIENS_DU_BLOC" …` → `rangee-de-bloc.tsx`,
  `noeud/libelles.ts`, `blocks.css` (lot b).
- `RAIL.contexte` (« Contexte — ») : `rg -ln "RAIL\.contexte|Contexte —" …` → `coque/{arbre-du-rail,palette-de-recherche,libelles}`,
  tests `rail-application`, `rail.spec`, `page.spec`, `e05s10b.spec` (lot e).
- `GLYPHES` et `Path` : `rg -n "\bPath\b" c:/apps/oto-platform/packages/plateforme/ui` → `coque/arbre-du-rail.tsx`
  (table `GLYPHES`, lue par `contenus-recents`, `navigateur-d-arbre`, `sous-pages`, `rendu-des-blocs`, `glyphes`,
  `fil-du-noeud`, `en-tete-du-noeud`, `palette-de-recherche`), `arbre/navigateur-d-arbre.tsx` (sa propre table),
  `coque/creation-dans-le-rail.tsx` : trois endroits changent, les lecteurs de `GLYPHES` suivent seuls.
- `Select` et listes natives : `rg -n "<select|<Select\b" c:/apps/oto-platform/packages/plateforme/ui c:/apps/oto-platform/src`
  → `Select` du DS monté par `tableau/{filtre-de-colonne,decision-de-revue}`, `admin/connecteurs/creation-de-compte`,
  `admin/usage/ecran-usage`, `noeud/partage-du-noeud`, `equipes/{reglages-d-equipe,ajout-de-regle}`,
  `journal/filtres-du-journal`, `invitations/inviter-quelqu-un`, `src/app/design-system/page.tsx` ; listes natives
  écrites à la main : `components/choix.tsx`, `contexte/ma-fiche.tsx` (retirée par c), `noeud/deplacement-du-noeud.tsx`.
  Tests qui les pilotent : `rg -l "selectOption" c:/apps/oto-platform/tests` → `page.spec`, `procedure-et-contexte.spec` ;
  `fireEvent.change` : liste du lot f.
- Écrans retirés de l'hôte : `rg -n "admin/acces|admin/drapeaux|admin/marque|EcranAccesPlateforme|EcranDrapeaux|EcranMarque\b" c:/apps/oto-platform/src c:/apps/oto-platform/packages --glob '!*.test.*'`
  → layout et `admin/adresses.ts` (e), pages et `loading.tsx` (d), `ui/index.ts` et les trois composants (gardés,
  tâche de suite), `favicon-du-theme.tsx` et `acces-plateforme.tsx` (commentaires).
- Drapeaux : `rg -n "isEnabled\(|listFlags\(|FLAGS\b" c:/apps/oto-platform/packages c:/apps/oto-platform/src --glob '!*.test.*'`
  → `server/flags.ts` (registre vide), `server/index.ts`, `admin/drapeaux/page.tsx` : **aucun écran ni service ne
  lit un drapeau** ; `rg -n -i "flag" c:/apps/oto-platform/packages/plateforme/mcp` → `admin_org` les lit
  (reste) ; `PATCH admin/flags` (`api/admin/flags.ts`) reste. Le « drapeau » d'`ui/tableau/ilot-du-tableau.tsx`
  (l. 35) est une variable locale (`geste`), sans rapport : rien n'en dépend.

### Doublons

- Registre (`component-registry.md`) et recherche : `rg -n "role=\"tablist\"" c:/apps/oto-platform/packages/plateforme/ui`
  → `equipes/onglets.tsx` : réutilisé pour l'accueil (verdict : réutiliser, déplacement dans `components/` proposé
  au pilote). `rg -ln "oto-combobox" …/ui` → `combobox.css` porté sans composant, `command-palette.tsx` (dialogue) :
  la liste en popover s'écrit dans `Select` du DS (fusionner : un seul composant de choix). Formulaire de
  profil : `ma-fiche.tsx` (reprendre son code, retirer l'ancien). Couleur : `RailThemePicker`/`ThemeSwatches`
  (réutiliser). Puce de lien : `ObjectLink`, `Tag` du DS (réutiliser le style, un composant de ligne). Aperçu du
  contexte : `previewContext` (réutiliser, aucun service nouveau) ; découpe du texte : même règle que
  `recededReport` du moteur (`server/context/engine.ts`, séparateur de deux caractères), réécrite côté écran
  (`ui/` n'importe pas `server/`) : doublon assumé, test de parité dans c.
- `ADRESSES` en double (`src/app/(dashboard)/layout.tsx` et `src/app/(dashboard)/admin/adresses.ts`) : laisser
  (e les change ensemble), fusion proposée au pilote.

### Effet produit

- `context` (MCP) : une ligne de langue dans le bloc « Vous » pour tous (golden queries à relire par le pilote,
  `docs/mcp-golden-queries.md`) ; aucun outil ni contrat changé (ADR-002).
- Thème : la couleur d'une personne vaut pour le groupe `(dashboard)` et son favicon ; la page publique
  (`/p/<jeton>`) et les pages de connexion gardent celui de l'organisation (aucune personne connue).
- Adresses : `/admin/marque`, `/admin/drapeaux`, `/admin/acces` deviennent des redirections ; `/n/perso/…`
  redirige vers `/n/prive/…` (marque-pages et liens copiés suivent).
- Export-import : `members.profile` et `orgs.brand` gagnent des clés, exportées telles quelles (jsonb).
- Journal : `PATCH profile` et `PATCH brand` journalisés comme hier.
- Page publique : les puces de lien (b) s'y rendent aussi (même `RenduDUnBloc`) ; lien hors de la couverture du
  jeton : texte, comme AC-d4.

### Refacto

- Proposé au pilote (non fait) : déplacer `equipes/onglets.tsx` vers `components/` ; fusionner les deux
  `ADRESSES` de l'hôte ; retirer les écrans morts (tâche de suite, HN-E05S11-15).
- Écarté : un éditeur riche (`contenteditable`) pour les puces en écriture (HN-E05S11-17) ; `next-intl` dans le
  paquet (HN-E05S11-26).

## Hypothèses

- **HN-E05S11-1 — Retour 1 vaut pour les contenus enregistrés seuls** (page, procédure, tableau, Contexte, vue
  « Contexte ») : une indication par carte de document, en position absolue en haut à droite, qui lit l'état de la
  file (`FileDOperations`) ; les formulaires à bouton « Enregistrer » (Profil, Organisation) gardent leur ligne
  près du bouton. Source : retour 1 (« carte de la page »), AC-a6 d'E05-S10.
- **HN-E05S11-2 — Prénom et nom : `first_name`, `last_name` dans `members.profile` ; `name` recomposé par
  `update_my_profile`**, pour que tout lecteur de `name` reste juste. Source : oto-frontend `profile-identity.tsx`
  (prénom et nom séparés), `org_contact`.
- **HN-E05S11-3 — La couleur de l'organisation est le défaut de tout compte sans choix** (nouveau ou non), lu à
  chaque page : aucune copie à la création d'un compte. Un compte qui a choisi garde son choix quand
  l'organisation change la sienne. Source : retour 2, ADR-008 § 3, la plus simple. **→ fiche** (JB a écrit « pour
  tous les nouveaux comptes » : un compte existant sans choix suit aussi).
- **HN-E05S11-4 — Langue de l'organisation dans `orgs.brand.language`** (`fr`, `en`, facultative), à côté du
  thème : `org_by_host` la rend déjà avec la marque, aucune lecture ni migration de plus. Source : D105,
  `server/identity.ts` l. 113. Le pilote met à jour `docs/architecture.md § 4` (`brand`, `profile`).
- **HN-E05S11-5 — `context` écrit toujours la langue de réponse** (« Reply in French unless the user writes in
  another language. »), avec la langue effective, défaut français compris. Source : D105. **→ fiche** (change ce
  que lit l'assistant de chaque organisation).
- **HN-E05S11-6 — Retour 3 lu « l'adresse doit dire `prive` »** : l'hôte seul change (redirection 308 de
  `/n/perso/*` vers `/n/prive/*`, réécriture inverse, chemin courant ramené à `perso` pour le rail) ; base, MCP et
  chemins servis gardent `perso/` (H61, P39). Coût : un aller-retour de plus au premier clic sur un lien
  `perso` écrit dans l'écran. Source : libellé « Privé » (M38, D89). **→ fiche** (autre lecture : ne rien changer).
- **HN-E05S11-7 — « Ma fiche » ne quitte que la colonne des Contexte** ; ses champs sont dans Profil.
- **HN-E05S11-8 — La vue « Contexte » découpe le texte de `previewContext` par son rapport** (tailles et
  séparateur de deux caractères) : aucun service nouveau ; une partie issue d'un Contexte (chemin dans le
  rapport) que la personne peut écrire monte l'éditeur de ce Contexte (lu par la page d'accueil) ; les autres se
  lisent ; « Vous » renvoie à Profil. Source : retour 4, `renderContext` (`server/context/engine.ts`).
- **HN-E05S11-9 — Ancres stables** : `code`, `vous`, `organisation`, `equipes`, `nouveautes`, `procedures`,
  `documents`, `contexte-tout-le-monde`, `contexte-<slug d'équipe>`, `contexte-prive` ; un nom servi inconnu :
  `partie-<rang>`. Source : `NOMS_DES_BLOCS`.
- **HN-E05S11-10 — « Ordre de lecture »** remplace « Blocs servis, dans l'ordre ». Source : retour 4 (libellé court).
- **HN-E05S11-11 — `Onglets` d'`equipes/onglets.tsx` réutilisé tel quel** (onglet dans l'adresse, `?onglet=`) ;
  « Activités » par défaut ; le premier jour reste dans « Activités ». Source : registre, oto-frontend `onglets.tsx`.
- **HN-E05S11-12 — Retour 5 : `EmptyState` titré par la phrase de JB, sans texte dessous.**
- **HN-E05S11-13 — Titre d'un Contexte composé à l'écran** (`titreDeContexte(section)`, « Contexte · <section> »),
  jamais un champ ; le titre enregistré ne change pas (il n'est lu par aucun assistant comme nom d'espace).
- **HN-E05S11-14 — Un seul `Select` du DS**, déclencheur `oto-scope`, popover rendu dans la couche du déclencheur
  (pas de portail) pour vivre dans « Partager » ; une entrée cachée porte `name` et la valeur ; « multi-select » =
  menus à cases existants, dont seul le déclencheur change. Source : retour 8, `selects.jsx` d'oto-frontend,
  HN-E05S10b-4 (un portail fermait le panneau).
- **HN-E05S11-15 — Les écrans Marque, Drapeaux et Accès plateforme restent exportés** jusqu'à une tâche de suite :
  `ui/index.ts` est un fichier d'ajout (aucune ligne retirée par un lot) ; les pages de l'hôte redirigent. Source :
  `.method/sprint/vagues.md` § Parallélisme.
- **HN-E05S11-16 — Seuils de routage et contact : masqués à l'écran seulement** ; `admin_org`, l'API et
  `org_contact` (page « aucune organisation ») les gardent. Source : retour 10.
- **HN-E05S11-17 — Puces en écriture : au repos, le bloc se rend comme en lecture (puces dans la phrase) ; au
  focus, le champ montre le texte brut (`[[chemin|titre]]`)** ; aucun bloc de citation dédié. Un éditeur riche
  coûterait la réécriture du champ de bloc. Source : retour 11, HN-E05S10a-8. **→ fiche**.
- **HN-E05S11-18 — Tout sélectionner ouvre le menu sans prendre le focus**, pour que la frappe remplace le texte.
- **HN-E05S11-19 — « Sous <titre> », « Cités ici », « Cité par ».** Source : retour 13.
- **HN-E05S11-20 — 830 px** (haut de la fourchette de JB) ; la marge droite des blocs tombe : `rangee-de-bloc.tsx`
  ne passe plus de `menu` à `BlockRow` (`rg -n "menu=" …/editeur/rangee-de-bloc.tsx` : rien), la gouttière
  droite est vide.
- **HN-E05S11-21 — Drapeaux : l'écran et l'entrée partent ; le service, `PATCH admin/flags` et la lecture par
  `admin_org` restent** (hypothèse du pilote, confirmée : rien d'autre n'en dépend, § Appelants).
- **HN-E05S11-22 — « Connecteurs » au pied du rail pour qui administre** (écran réservé).
- **HN-E05S11-23 — « Équipes & accès » = `/equipes`** (Personnes, Équipes, Règles d'accès, Accès plateforme
  pour qui administre) ; entrée de « Réglages de l'entreprise », ouverte à tout membre. Hypothèse du pilote.
- **HN-E05S11-24 — Le « + » de Privé = celui des autres sections** ; « Nouvelle page privée » disparaît.
- **HN-E05S11-25 — `Play` de Phosphor** pour une procédure, partout où une table nature → glyphe existe.
- **HN-E05S11-26 — Traduction sans `next-intl` dans le paquet** : tables TypeScript par écran, jumeau anglais
  typé, langue donnée par l'hôte (contexte client, valeur de requête côté serveur). `i18n-patterns.md` (next-intl
  dans `src/`) ne vaut pas pour `ui/`, qui n'importe aucun cadre de l'hôte (ADR-008) : ADR-015 à écrire, fiche
  d'i18n à amender. **→ fiche**.
- **HN-E05S11-27 — Les messages des services restent anglais** (H04) ; `ui/api/messages.ts` les traduit dans la
  langue effective ; le MCP ne change pas.
- **HN-E05S11-28 — Dates et nombres** : `Intl` avec la langue effective (`fr-FR`, `en-GB`).
- **HN-E05S11-29 — La langue de l'organisation se règle dans `/admin/organisation`** (lot g), à côté de la couleur.
- **HN-E05S11-30 — `/profil` ouvert à tout membre**, page de l'hôte.
- **HN-E05S11-31 — « Apparence » quitte le menu du compte** : la couleur de la personne est dans Profil, celle de
  l'organisation dans Organisation.

## Actions JB

Aucune : la migration du lot a est appliquée par son agent (règles de la base de test).

## Pour le pilote (fichiers partagés)

- **→ fiche** : HN-E05S11-3 (couleur par défaut aussi pour les comptes existants sans choix), HN-E05S11-5
  (`context` dit toujours la langue de réponse), HN-E05S11-6 (adresse `prive`, autre lecture possible),
  HN-E05S11-17 (texte brut au focus d'un bloc), HN-E05S11-26 (mécanisme de traduction, ADR-015).
- `docs/architecture.md § 4` : `orgs.brand` `{theme, logo_url, display_name, language}` ; `members.profile`
  `{name, first_name, last_name, handle, language, theme}`.
- `status.md` : sept lots et leur ordre ; tâches de suite (écrans morts, `Onglets` dans `components/`, `ADRESSES`
  unique).
- `packages/plateforme/CHANGELOG.md` (Unreleased) : `/profil` et `EcranProfil` ; `Select` en popover ; props du
  rail (`marque` retiré, `profil`) ; `context` dit la langue de réponse (### Assistants) ; interface en anglais.
- `docs/mcp-golden-queries.md` : ligne de langue du bloc « Vous ».

- **Lot d** (rapport du lot, repris ici) :
  - `packages/plateforme/CHANGELOG.md` (Unreleased) : `EcranOrganisation` perd `hrefMarque` et `logo`, gagne
    `marque`, `enregistre` et `contexte` (la marque et le Contexte de Tout le monde dans « Organisation ») ; les
    annexes « Adresses et outils », « Contact », « Marque et guide » quittent l'écran ; `/admin/marque` et
    `/admin/drapeaux` redirigent (308) vers `/admin/organisation`, `/admin/acces` vers `/equipes?onglet=acces` ;
    « Équipes & accès » ; `MemberRoleView` perd `service` ; `RenduDUnBloc` accepte `baliseDeTitre="h3"`.
  - `docs/changelog.md` : E05-S11 lot d, réglages de l'organisation regroupés (retours 9, 10, 15 ; AC-22 à AC-25).
  - `component-registry.md` : `ContexteDeLEntreprise` (`ui/admin/organisation/contexte-de-l-entreprise.tsx`), le
    Contexte de Tout le monde en lecture dans un îlot ; `RenduDUnBloc`, prop `baliseDeTitre`.
  - Fusion à trois voies : `ui/noeud/rendu-des-blocs.tsx` (aussi touché par le lot b) ne reçoit du lot d que la prop
    `baliseDeTitre` (signature et `as` du `case "heading"`, deux lignes de commentaire).

## Tests attendus

Un test par AC (`testing-strategy.md § Budget de tests`) ; base réelle pour AC-5 (migration, portable) ;
horloge simulée pour AC-2 ; parité de la découpe (AC-13) avec le moteur sur un texte coupé et omis ; campagne
Playwright par lot touchant un écran, deux thèmes, 375 et 1 280 px ; lot g : campagne complète en anglais.

## Post-implémentation

### Écarts avec la référence UI

### Écarts avec l'architecture

### Composants créés

| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Notes

## Réponses de JB du 2026-09-28 (fiche D107) — prévalent sur les hypothèses ci-dessus

- **HN-E05S11-3 confirmée** : la couleur de l'organisation vaut pour tout compte sans choix.
- **HN-E05S11-6 remplacée** : pas de redirection d'affichage ; `perso` devient `private` **partout** (base, fonctions SQL, journal, assistants, adresses), anciens chemins gardés en alias. Nouveau **lot h** (Ⓜ, serveur), appliqué après la migration du lot a. L'identifiant de l'espace de toute l'entreprise est `all` ; son libellé français reste « Tout le monde » ; ses contenus restent à la racine.
- **HN-E05S11-17 remplacée** : hors édition, liens et citations se lisent en liens hypertextes dans la phrase (titre de la page citée ; texte du lien ou domaine d'une adresse web) ; au focus, le texte brut. Pas de puces.
- **HN-E05S11-19 remplacée** : « Sous-pages », « Mentionnés », « Mentionné dans ».
- **Lot g sorti de la V1** (JB, 2026-09-28) : la traduction des écrans est une story à part pour une version suivante (1.1 ou après), mécanisme proposé par ADR-015. En V1, la langue du profil se range et règle la langue de réponse de l'assistant (lot a) ; les écrans restent en français.

## Retours 21 et 22 de JB (2026-09-28, lot e)

- **Retour 21** : le résumé posé à la création d'un nœud (`RAIL.resumeParDefaut`, `ui/coque/libelles.ts`, « À compléter. ») devient « Résumé de la procédure à compléter. » pour une procédure ; hypothèse HN-E05S11-e1 : « Résumé de la page à compléter. » et « Résumé du tableau à compléter. » pour les autres natures. **AC-e21** : un nœud créé depuis le rail porte le résumé de sa nature.
- **Retour 22** : la Corbeille quitte sa ligne du pied du rail et s'ouvre depuis le menu de l'engrenage, en bas à gauche du rail. **AC-e22** : le menu de l'engrenage propose « Corbeille » (à qui peut la lire), qui ouvre `/corbeille` ; plus de ligne « Corbeille » au pied du rail.

## Lot e : bascule des écrans sur `private` (reste du lot h, 2026-09-28)

Le lot h renomme `perso` en `private` côté base, services et assistants ; les écrans suivent dans le lot e, qui part après la fusion de a, b, c, d et h : la constante `PERSO` de `ui/arbre/depuis-l-arbre.ts` devient `"private"` ; la clé de « Tout le monde » (`""`) devient `all` là où elle sert d'identifiant (`ui/coque/sections-du-rail.tsx`, `deplacement-dans-le-rail.tsx`), jamais comme chemin ; chemins écrits en dur de `src/app/(dashboard)/n/[...chemin]/page.tsx` (`CHEMIN_DE_CONTEXTE`, `perso/${handle}/contexte`), `ui/contexte/libelles.ts`, `ui/contexte/annexes-du-contexte.tsx`, `ui/noeud/{glyphes.tsx,fil.ts,acces-general.tsx}` ; tests et specs qui suivent la constante (liste du « Lot h — rapport »). **AC-e23** : aucun `perso` écrit en dur dans `ui/` ni `src/` (`rg -n "\bperso\b" packages/plateforme/ui src` ne trouve que des commentaires d'alias) ; `/n/perso/…` ouvre le nœud renommé.

## Lot a — rapport

Migration `20260928110000_platform_profil.sql` (et non `20260928090000` : elle suit la ligne de base V1),
copie identique sous `supabase/migrations/` ; **non appliquée au projet** (le pilote l'applique avant la
fusion). Jouée sur un Postgres local embarqué (PGlite, hors du dépôt : Docker arrêté, aucun Postgres installé)
contre une table `members` réduite : chaque champ, recomposition, retraits, refus `22023` et `42501`.

### Hypothèses

- **HN-E05S11-a1 — Prénom et nom partent ensemble** dès que l'un change : le service recompose `name` des deux
  valeurs enregistrées, et une fiche d'avant E05-S11 n'a ni l'un ni l'autre ; envoyer le seul nom de famille y
  perdrait le prénom. AC-3 (« seuls les champs changés ») est lu par groupe : identité, langue, couleur.
  Source : AC-5, HN-E05S11-2.
- **HN-E05S11-a2 — Une fiche sans prénom ni nom de famille montre son nom entier dans « Prénom »**, « Nom »
  vide : jamais coupé au premier espace, qui inventerait un nom de famille. Source : oto-frontend
  `profile-identity.tsx` (même argument pour le titre).
- **HN-E05S11-a3 — Le prénom ou le nom écrit l'emporte sur un `name` du même patch** ; `name` écrit seul ne
  touche ni au prénom ni au nom de famille (ancienne forme de `PATCH profile`, gardée) ; prénom et nom vidés
  retirent `name` (l'identité retombe sur l'email). Le nom recomposé peut dépasser 80 caractères (deux champs
  de 80) : aucune borne ne le coupe. Source : AC-5, la plus simple.
- **HN-E05S11-a4 — La langue de l'organisation s'écrit par `PATCH brand` (`language` facultatif) ; absente, elle
  est gardée telle qu'enregistrée, `null` la retire** : le formulaire de marque et `admin_org update` écrivent
  la marque entière sans elle, et l'effaceraient sinon. Aucun écran ne la règle en V1 (HN-E05S11-29 portait sur
  le lot g, sorti). Source : § Lot a (`brandInputSchema`), AC-36.
- **HN-E05S11-a5 — La ligne de langue remplace « Language: <valeur> »** par « Reply in French|English unless the
  user writes in another language. », toujours présente ; une valeur enregistrée hors de `fr` et `en` (la graine
  de test porte « français ») ne compte pas. Source : HN-E05S11-5, fiche D106 point 2.
- **HN-E05S11-a6 — `readProfile` (service) refuse l'équipe plateforme entrée sans ligne `members`**, comme
  `updateProfile` : la page le dit par sa phrase. Source : `security-patterns.md § Droits dans le service`.
- **HN-E05S11-a7 — `ma-fiche.tsx` reste** : sur la base du lot (`main` à `bd3b162`),
  `ui/contexte/annexes-du-contexte.tsx` (lot c) l'importe encore (`rg -n "MaFiche|ma-fiche" packages src tests`) ;
  le supprimer casserait la compilation, et `annexes-du-contexte.tsx` appartient au lot c. Sa suppression, avec
  `MA_FICHE` (`ui/contexte/libelles.ts`) et le `describe("Ma fiche (AC13)")` de `contexte.test.tsx`, revient
  au pilote à la fusion de c (a fusionne en premier, Ⓜ). La page Profil n'importe rien de `ui/contexte/`.
- **HN-E05S11-a8 — Langue en `Select` du design system, couleur en pastilles `aria-pressed`** (`.oto-theme-swatches`,
  « Celle de l'organisation » d'abord) : le lot f convertira le `Select` sans toucher au formulaire. Aucune
  adresse de connexion ni photo (hors AC-3).

### Fichiers hors liste

- `tests/integration/orgs-settings-sql.test.ts` : un cas pour la langue écrite, gardée, retirée par
  `updateBrand` (HN-E05S11-a4), là où vivent les écritures de la marque sur base réelle.
- `packages/plateforme/ui/ds/app/islands.css` (bloc « < 640 ») : sous 640 px, la règle « 44 px sur tout ce qui
  se touche » étirait la pastille d'un thème en ovale (mesuré : bouton 22 × 44, rond 22 × 44) ; la pastille y
  prend la forme qu'elle a déjà sous un pointeur grossier (`product.css`), et la rangée passe à la ligne
  (huit cibles de 44 px ne tiennent pas en 375 px).

### Écarts avec la référence UI

- oto-frontend (`profile-identity.tsx`) montre l'adresse de connexion en lecture et une photo ; absentes ici
  (hors AC-3). La langue y est un îlot de deux boutons sans état lu ; ici une liste, la langue enregistrée étant
  servie.

Référence : oto-frontend `src/routes/settings.profile.lazy.tsx` (écran), `settings/profile-identity.tsx` (îlot
« Vous »). Écarts de l'écran, chacun avec sa raison :

- **Colonne annexe « Ce à quoi vous avez accès » retirée** (et `TwoColumns`, l'écran tient en une colonne) : le
  rail liste déjà les espaces de la personne, et `readProfile` ne sert aucune liste de sections ; la servir ici
  ferait deux surfaces pour la même donnée.
- **Îlot « Votre situation avec Oto » retiré** : il lit ce qu'Oto sait de la personne (`GET /api/me/profile`),
  ressource sans équivalent dans la plateforme ; hors AC-3.
- **Îlot « Préférences de notification » retiré** : la plateforme n'envoie aucune notification en V1 ; rien à régler.
- **Avatar de l'en-tête remplacé par l'icône `UserCircle`** : le profil de la plateforme n'a pas de photo (retirée
  avec l'adresse de connexion, HN-E05S11-a8) ; les initiales redisent le titre.
- **Pas de fil `SettingsShell` (« Réglages / Profil »)** : la plateforme n'a pas d'écran de réglages qui regroupe
  ses pages ; la page s'ouvre depuis le menu du compte (AC-6, HN-E05S11-30). Même retrait qu'`ui/equipes/ecran-equipes.tsx`.
- **Titre « Profil » au lieu du nom de la personne** : le nom est modifiable dans l'îlot « Vous » et relu après
  l'enregistrement ; un titre fixe ne change pas sous la saisie, et suit le libellé du menu du compte (AC-6).
- **Langue et couleur sur cet écran** : oto-frontend les range dans « Apparence » (`settings.appearance`) ; AC-3
  les veut ici, dans l'îlot « Langue et couleur ».

Campagne visuelle faite le 2026-09-28 (12 h 59 à 13 h 04) : spécification temporaire
`tests/e2e/e05s11-profil-campagne.spec.ts` (retirée après le passage), `/profil` connecté au compte
`E2E_USER_EMAIL` sur l'organisation « Démo », thèmes clair et sombre, 375 et 1 280 px, aucun défilement
horizontal (`scrollWidth − clientWidth = 0`), une pastille choisie active « Enregistrer », rien d'enregistré ;
4 passés, puis 2 passés à 375 px après la correction d'`islands.css` (pastilles). Port 3000 contrôlé : chaque
passage a lancé son propre `next dev` depuis ce worktree (`[WebServer] $ next dev --turbopack` au journal), aucun
serveur n'écoutant avant (`reuseExistingServer` aurait sinon repris celui d'un autre worktree).

## Lot a — correction 1

Constats de la première revue traités : l'îlot relu après un refus (test du composant, `rerender` d'une fiche
nouvelle) ; le corps envoyé quand le seul prénom change, `{ first_name, last_name }`, affirmé (mutation : retirer
`dirtyFields.first_name` du formulaire fait échouer ce cas) ; les écarts avec `settings.profile.lazy.tsx` et la
campagne ci-dessus ; `server/index.ts` n'exporte plus que `preferredTheme` (`preferredLanguage` n'a d'appelant que
`server/context/blocks/person.ts`, qui l'importe de `../../language`) ; source d'HN-E05S11-a5 ; version de la
migration (`20260928110000`) dans l'en-tête et la section du lot ; un cas par thème d'`OTO_THEMES` dans
`tests/integration/profil.test.ts` (sauté sur le projet tant que la migration n'y est pas, joué sur PGlite :
huit écrits, « rose » refusé `22023`).

### Hypothèses

Aucune nouvelle.


## Lot b — rapport

Livré dans le worktree `agent-af72d610a17581872` (base `main` 9bfc9a0), sans commit.

### Hypothèses (lot b)

- **HN-E05S11-b1 — « Brouillon enregistré. » au niveau écriture.** L'indication dit « Enregistré. » au niveau
  gestion (le brouillon se publie seul) et garde « Brouillon enregistré. » au niveau écriture, qui ne publie pas.
  Source : AC-a6 d'E05-S10 (la distinction existait), la copie honnête de `lignes-d-etat.tsx`.
- **HN-E05S11-b2 — Une écriture réussie = la révision ou le tampon du brouillon change pendant que la file
  travaille.** L'indication lit l'instantané de `FileDOperations` (sans toucher `file-d-operations.tsx`) ; une
  relecture de la page, file au repos, n'est pas un enregistrement. Source : HN-E05S11-1 (« lit l'état de la file »).
- **HN-E05S11-b3 — Un tableau pose l'indication en haut à droite de son brouillon** (bandeau et publication, au-dessus
  de la grille), faute de carte de document propre : la grille est le complément de l'hôte. Source : AC-1, la plus simple.
- **HN-E05S11-b4 — Titre d'une page citée** : le libellé écrit, sinon le titre lu dans l'arbre visible (tous les
  chemins cités par les blocs montrés), complété par les liens sortants (`links_out`, 20 premiers) quand ils
  arrivent (un contenu déplacé mène à sa nouvelle place), sinon le dernier segment. Seuls les chemins cités partent
  vers l'îlot client, jamais l'arbre entier. Une page absente de l'arbre et des liens lus : texte sans lien (AC-26) ;
  un chemin écrit depuis la lecture de la page (inconnu) garde son lien jusqu'à la relecture. Arbre coupé
  (`truncated`, `TREE_MAX`) : une page absente reste inconnue et garde son lien, par son dernier segment (elle peut
  être au-delà de la coupe ; correction 1). Source : AC-27, D107.
- **HN-E05S11-b5 — Adresse web** : `[texte](https://…)` se lit par son texte ; une adresse nue par son domaine sans
  `www.` ; l'adresse entière reste au survol (`title`). Source : D107 (« texte du lien ou domaine »).
- **HN-E05S11-b6 — Rendu au repos posé sur le champ** : le `<textarea>` reste monté (fiche D21 B) ; son rendu est
  posé dans la même case d'une grille, le champ transparent dessous ; au focus, le rendu s'efface (CSS). Un clic hors
  d'un lien traverse le rendu jusqu'au champ. Au clavier, les liens du rendu s'atteignent par Maj+Tab seulement :
  Tab depuis le champ le quitte alors que le rendu est masqué (champ au focus), Maj+Tab depuis l'élément suivant
  les trouve visibles. En couleurs forcées, le rendu se retire et le champ reste seul, lisible (correction 1). Seul un bloc qui porte un
  lien a un rendu (le gras reste brut au repos, comme avant). Écart cosmétique : la case prend la hauteur du plus
  haut des deux (texte brut ou rendu). Source : D107, HN-E05S08-4.
- **HN-E05S11-b7 — Résumé de « Contenus liés »** : les sous-pages par nature (« 1 procédure »), puis
  « N mentionnés », puis « mentionné dans N contenus ». Source : AC-29, D107.
- **HN-E05S11-b8 — Le menu ouvert par la sélection se ferme** par Échap (rien d'autre : le focus reste au texte),
  toute touche qui n'est pas un modificateur seul, un clic dehors, ou une sélection qui n'est plus totale.
  Source : AC-28, HN-E05S11-18.
- **HN-E05S11-b9 — Le titre d'un Contexte n'est plus écrit en place** (ni dans le fil) : composé
  `titreDeContexte(section)`. Source : HN-E05S11-13.
- **HN-E05S11-b10 — `content.css` inchangé** : la mesure du lecteur (68ch) garde la lecture ; seule la rangée
  d'écriture perd sa marge droite (AC-30).

### Fichiers hors liste (nommés, nécessaires)

- `packages/plateforme/ui/ds/react/overlays.tsx` : `DropdownMenu` gagne `ouvertSansFocus` et `surFermeture` (AC-28 ;
  aucun menu du DS ne s'ouvrait sans prendre le focus ; un second menu aurait doublé celui-ci).
- `packages/plateforme/ui/noeud/editeur/actions.ts` (type de retour : `selectionner`, `fermerLeMenu` ajoutés par
  l'éditeur, comme `poignee`), `use-editeur.ts` et `resolution.ts` (retrait de `publicationSeule`, `suivre`,
  `corpsSuivi`, devenus sans lecteur quand la ligne d'état a quitté `use-envois.ts`).
- Tests : `tests/unit/e05s10a-liens.test.ts` (libellés des liens), `tests/integration/components/procedure.test.tsx`
  (l. 252, « Liens de ce bloc » retiré ; fichier du lot f), `tests/integration/pages/noeud-page.test.tsx` (l. 163,
  résumé du bandeau ; fichier du lot c : fusion à trois voies d'une ligne).

### Vérifications (lot b)

- Consigne du pilote (2026-09-28) : pas de `pnpm verify` complet par lot. `type-check`, `lint`, `check:framework`
  verts ; Vitest sur les 67 fichiers qui importent un module modifié (`rg -l` sur `noeud/*`, `noeud/editeur/`,
  `ds/react/overlays`, `arbre/depuis-l-arbre`, `EcranDeNoeud`, `EditeurDeBlocs`, `DropdownMenu`, l'index `ui`,
  plus `tests/integration/pages`) : 731 verts.
- Mutations (script hors dépôt `C:/Users/jeanb/AppData/Local/Temp/claude/c--apps-oto-platform/7f4bb501-5627-48f8-855d-3c0f3ffd3c8f/scratchpad/b_mutations.mjs` :
  copie gardée, rendue dans un `finally`, empreinte SHA-256 comparée après chaque mutation, arrêt sinon ; l'empreinte
  finale n'était pas imprimée : à la correction 1, les onze textes d'origine relus présents) : 11 sur 11 tuées (5 s → 50 s ; refus non tu ;
  cible invisible gardée en lien ; chemin entier en titre ; `www.` gardé ; sélection vide ; Échap passé au clavier ;
  menu ouvert par l'écran qui prend le focus ; titre enregistré d'un Contexte ; ⌘A répété ; rubrique vide rendue).
- Playwright : `e05s11-page.spec.ts` (créé) 4 sur 4, `e05s10a-edition.spec.ts` et `e05s10b.spec.ts` 8 sur 8, deux
  thèmes, 375 et 1 280 px ; contrôle à l'œil des captures (indication en haut à droite, liens dans la phrase, menu à
  la sélection).

### Écarts avec la référence UI (lot b)

- Au repos, un bloc qui porte un lien garde la hauteur de son texte brut : un blanc sous la phrase rendue quand le
  texte brut est plus long (HN-E05S11-b6).
- Le rail et la palette écrivent encore « Contexte — <section> » : lot e (AC-18).

## Lot b — correction 1

Worktree recalé sur `main` bd3b162 (E01-S12 c et d) par stash, `reset --hard main`, `stash apply` : aucun conflit.

### Points corrigés

1. AC-26 — `ciblesDesLiens` (`ui/noeud/sous-pages.tsx`) reçoit l'arbre et son état `truncated` : arbre coupé, un
   chemin absent reste inconnu (lien gardé). Test : `ecran-de-noeud.test.tsx`, « truncated tree ».
2. `ecran-de-noeud.test.tsx` : garde `instanceof HTMLElement` (aide `citant`) au lieu de deux `as HTMLElement`.
3. Script de mutations et empreintes nommés (§ Vérifications ci-dessus, et ci-dessous).
4. HN-E05S11-b6 : liens du rendu au clavier par Maj+Tab seulement.
5. `editeur.css` : `@media (forced-colors: active)` retire `.oto-block-rendu`, le champ reprend `CanvasText`.
6. `champ-de-bloc.tsx` : la pile et le rendu au repos sont des `span` (la pile vit dans le `h2` d'un titre ;
   `display: grid` et le placement en grille les rendent blocs).
7. `export` retiré d'`avecLesMentions` et de `DUREE_D_ENREGISTRE_MS` : `rg -n "avecLesMentions|DUREE_D_ENREGISTRE_MS"
   packages src tests scripts` ne trouve que leur module.
8. `procedure.test.tsx` : le champ « Titre » en place est vérifié pour `procedure` et `page`, absent pour `context`.

### Hypothèses (correction 1)

- **HN-E05S11-b11 — Arbre coupé : lien gardé.** Une page citée absente d'un arbre coupé n'est ni affirmée sans cible
  ni devinée : son lien reste, nommé par son dernier segment, jusqu'aux liens lus (`links_out`). Source : AC-26
  (« sans cible visible » ne se sait que sur l'arbre entier), HN-E05S11-b4.

### Vérifications (correction 1)

- `pnpm type-check`, `pnpm lint`, `pnpm check:framework` verts ; Vitest (`VITEST_MAX_FORKS=2`) sur les dix fichiers
  de `tests/integration/components` qui importent un module corrigé, `tests/integration/pages`,
  `tests/unit/ui-en-ligne.test.ts`, `tests/unit/e05s10a-liens.test.ts` : 31 fichiers, 347 verts.
- Mutations : `C:/Users/jeanb/AppData/Local/Temp/claude/c--apps-oto-platform/7f4bb501-5627-48f8-855d-3c0f3ffd3c8f/scratchpad/b-cor1-mutations.mjs`,
  4 sur 4 tuées (arbre coupé : absent sans cible ; arbre entier : absent inconnu ; titre en place retiré d'une page ;
  titre en place rendu à un Contexte). Empreintes finales comparées à celles d'avant la campagne, égales :
  `sous-pages.tsx` 16aded45505a327d2fac36fd0b19423879d62c0dd6012cb4c6a2fe5fe7493422,
  `ecran-de-noeud.tsx` f40073ff113bf26e6962595d993b8103a9625dc4fec4d65a7b3e7edc03dbdc71.
- Couleurs forcées : CSS seule, non testée sous jsdom (`testing-strategy.md § Anti-patterns`, détails CSS).

### Pour le pilote (lot b)

- `component-registry.md` l. 132 (`en-ligne.ts`) : ajouter `titreDuLien`, `cibleDe`, `dernierSegment`,
  `cheminsCitesDans`, `aDesLiens`, le type `CiblesDesLiens` et le composant `EnLigne` exporté (le texte en ligne d'un
  bloc, liens nommés par leur titre ou leur domaine). L. 102 (`DropdownMenu`) : props `ouvertSansFocus` (le menu
  s'ouvre sans prendre le focus) et `surFermeture` (rappel à la fermeture). `IndicationDEnregistrement` remplace
  `LigneDEnregistrement` (indication « Enregistré. » en haut à droite de la carte, hors du flux).
- `packages/plateforme/CHANGELOG.md` sous `## Unreleased` :
  - Les pages citées se lisent dans la phrase, par leur titre, et les adresses web par leur texte ou leur domaine,
    au repos comme en lecture.
  - « Contenus liés » se range en trois rubriques : Sous-pages, Mentionnés, Mentionné dans.
  - La colonne d'un document s'élargit à 830 px.
  - `DropdownMenu` accepte `ouvertSansFocus` et `surFermeture`.

## Lot c — rapport

Périmètre après D107 (consigne du pilote) : AC-8 à AC-16. AC-7 (adresse `prive`) part au lot h ; `next.config.ts`,
`fournisseur-de-rafraichissement.tsx` et `tests/unit/e05s11-adresse-privee.test.ts` ne sont pas touchés ; `ma-fiche.tsx`
reste (plus montée, reprise puis retirée par le lot a).

### Hypothèses du lot c

- **HN-E05S11-c1 — Deux fichiers hors liste : `ui/accueil/fil-activite.tsx` et `ui/accueil/first-day.tsx`.** L'îlot
  « Activités » et l'îlot « Commencer » deviennent le contenu du panneau « Activités » (plus d'îlot à eux), sinon deux
  îlots s'emboîtent sous la barre d'onglets ; le premier jour reste dans « Activités » (HN-E05S11-11), l'onglet
  « Contexte » restant ouvert dès le premier jour. Aucun autre lot de la vague ne les touche. Source : AC-12, oto-frontend
  `accueil/agents-et-activites.tsx` (l'îlot porte les onglets, le contenu vit dans le panneau).
- **HN-E05S11-c2 — L'îlot principal se nomme « Activités et contexte »**, ses panneaux par leur onglet, comme l'îlot
  « Procédures et activités » d'oto-frontend. « Tout le journal » passe en tête du panneau « Activités » (le « tout voir »
  d'oto-frontend dans son onglet). L'îlot laisse sortir les menus des blocs (`overflow="visible"`, comme l'écran des équipes).
- **HN-E05S11-c3 — Seuls les Contextes servis ont une partie** : un Contexte jamais publié ou vide n'est pas dans le
  texte de `context`, donc ni partie ni éditeur (AC-13 : « les parties du texte que `context` servirait »). **→ fiche**
  si JB veut écrire depuis l'accueil un Contexte encore vide.
- **HN-E05S11-c4 — L'avis de budget** (la ligne finale qui nomme les blocs omis) se lit en dernière section, « Fin du
  texte » : c'est une partie du texte servi.
- **HN-E05S11-c5 — Les équipes des parties se nomment par `identity.teams`** : les Contextes d'équipe servis sont ceux
  des équipes de la personne (`contextPaths`, E03-S08) ; aucune lecture de `listTeams`.
- **HN-E05S11-c6 — Un Contexte servi mais illisible à l'instant** (lecture de `loadNode` en échec) garde son texte servi
  et dit l'échec avec « Réessayer » ; pas de `sauf404` : l'aperçu ne sert que des Contextes que la personne lit.
- **HN-E05S11-c7 — Le journal et les connexions se lisent sur les deux onglets** (le premier jour et l'aparté en
  dépendent) ; l'aperçu et les Contextes seulement sur « Contexte ».
- **HN-E05S11-c8 — L'encart garde « L'aperçu reflète les versions publiées… »**, juste au-dessus du total, qui devient
  sa dernière ligne (pied de note). La ligne du Contexte ouvert garde `aria-current="page"` (`LayerLink`), avec « (ce
  contexte) » dans son nom.
- **HN-E05S11-c9 — « Vous » mène à `/profil`**, page créée par le lot a (lien mort tant que a n'est pas fusionné).
- **HN-E05S11-c10 — Ancres de HN-E05S11-9 telles quelles** ; limite connue (BASSE) : une équipe au slug `prive`
  partagerait l'ancre `contexte-prive` (le lot h, `private`, la lève).

### Écarts avec la référence UI

- La vue « Contexte » n'a pas d'équivalent dans oto-frontend : parties en sections titrées (`h2`), taille et état en
  légende, texte servi en bloc de code (`oto-code`), éditeur d'une page pour un Contexte écrivable.
- Accueil : l'onglet « Procédures » d'oto-frontend est remplacé par « Contexte » (les agents ne se portent pas).

### Composants créés

| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| ContexteServi, type DonneesDuContexteServi | `packages/plateforme/ui/contexte/contexte-servi.tsx` | Server ; vue « Contexte » de l'accueil : parties empilées, éditeur d'un Contexte écrivable (`FileDOperations` + `EditeurDeBlocs`), « Vous » → Profil, total (AC-13 à AC-15) |
| partiesDuContexte, ancreDeLaPartie | `packages/plateforme/ui/contexte/parties-du-contexte.ts` | Pures ; découpe du texte de `previewContext` par son rapport, ancres stables ; parité avec `renderContext` testée |
| nomDuBloc, CONTEXTE_SERVI | `packages/plateforme/ui/contexte/libelles.ts` | `nomDuBloc` déplacé d'`apercu-du-contexte.tsx` (lu par l'encart et la vue) |

### Pour le pilote — `packages/plateforme/CHANGELOG.md` (Unreleased, « Hosts »)

- `EcranDAccueil` reçoit trois props requises : `onglet` (l'onglet ouvert, lu dans `?onglet=`), `hrefDOnglet(onglet)`
  et `hrefDuProfil` ; `DonneesDeLAccueil` gagne `contexte?` (ce que lit la vue « Contexte », à lire sur cet onglet seulement).
- `AnnexesDuContexte` perd `nom` et `fiche` (« Ma fiche » quitte l'encart), gagne `handle` (celui de la personne qui
  regarde, ou `null`) et `hrefDuContexteServi` (la vue « Contexte » de l'accueil, où mène chaque ligne de l'encart).
- Nouveaux exports : `ONGLETS_DE_L_ACCUEIL`, types `OngletDeLAccueil` et `DonneesDuContexteServi`. `ContexteServi`
  n'est pas exporté (monté par `EcranDAccueil`).

## Lot c — correction 1

- **HN-E05S11-c11 — `tests/integration/oidc-flow.test.ts`, appelant adapté hors liste.** `AccueilPage` (la page
  `src/app/(dashboard)/page.tsx`) reçoit désormais `searchParams` (l'onglet, AC-12) ; ce test l'appelait sans argument
  et échouait au type-check. Il lui passe l'adresse de l'accueil nu (`searchParams: {}`, l'onglet « Activités ») :
  aucune assertion du test ne change, il ne porte pas sur l'onglet. Source : `.method/sprint/vagues.md § Cycle, revue et fusion` (une
  signature exportée changée fait adapter ses appelants dans le même diff).
- Parité de la découpe : deux blocs omis en fin de texte (`news`, `procedures`) ; mutation jouée par script (copie
  rendue en `finally`, empreinte identique) : garde `if (bloc.chars > 0)` retirée, le cas « full, replaced, cut and
  omitted parts » échoue (l'avis perd ses deux premiers caractères).
- Titres de journée du panneau « Activités » en `h2`, comme les parties de la vue « Contexte » (l'îlot se nomme
  par `aria-label`, sans titre : le niveau suivant le `h1` de l'accueil est `h2`).
- `tests/e2e/procedure-et-contexte.spec.ts` : la partie visée par l'ancre `#vous` se vérifie dans la fenêtre
  (`toBeInViewport`, AC-11).

## Lot h — rapport (fiche D107 b : `perso` devient `private`)

Échelle Module, Ⓜ. Base : `main` à `bd3b162` (ligne de base V1 seule). Conventions chargées : coding-standards,
database, supabase, security, mcp, api, forms, registry, testing, portage, a11y (fiches ; textes complets de
database, supabase et testing sur les points cités). Décompte de départ : `rg -n "perso" packages src scripts tests
--glob '!*.md'` → 2 731 occurrences dans 435 fichiers (« personne », « personal »… compris) ; au mot seul,
`rg -n "\bperso\b" packages src scripts tests --glob '!*.md'` → 447 occurrences dans 101 fichiers.

### Ce qui change

- **Assistants (MCP)** : `context` sert le Contexte personnel à `private/<handle>/contexte` (en-tête « ## Context: you
  only (private/<handle>/contexte) ») ; les refus nomment `private` (« private holds one personal space per member… »,
  « private/<x> is not your personal space: write in private/<handle>. », « The owner of private cannot change… ») ;
  `admin_org create` dit « personal spaces (private) », la liste d'erreurs d'`admin_node` nomme `private/<handle>`.
  Un `read perso/<handle>/…` mène au nœud par son alias : « perso/… moved to private/… on <date de la migration>: use
  the new path. », `moved_from` dans `structuredContent`, journal au chemin courant. Aucun outil, champ ni
  description des six outils ne change (ADR-002).
- **Journal** (`read journal`, écran, tableau de bord d'usage, `admin_journal`) : une ligne sur l'espace d'autrui se
  coupe à `private/<handle>` ; une ligne écrite avant la migration, ou par un appelant qui écrit l'ancien chemin, se
  coupe à `perso/<handle>` (le dossier tel qu'écrit, HN-E05S11h-3).
- **Hôte** : une migration à appliquer, `20260928120000_platform_private.sql` ; `/n/perso/…` ouvre le nœud déplacé
  (alias, `loadNode`) ; l'écran reste à basculer (constante `PERSO` du lot b, liste ci-dessous).

### Migration `20260928120000_platform_private.sql` (+ copie identique `supabase/migrations/`, `pnpm migrations:sync`)

Contrôle de collision (une équipe au slug `private`, un nœud à `private` ou dessous : arrêt, rien ne change) ;
`is_context_path`, `create_org`, `unique_handle`, `members_tree_sync`, `nodes_guard` re-versionnées (mêmes
signatures, `revoke … from public` repris) ; policy `nodes_delete_manager` recréée (`drop policy if exists` puis
`create`) ; `teams_slug_reserved` remplacée dans la même instruction (`private` ajouté, `perso` gardé) ; alias qui
gênerait le nouveau chemin effacé ; `update platform.nodes set path = 'private' where path = 'perso'` sous
`set_updated_at` désactivé : `nodes_path_cascade` réécrit les descendants, `nodes_aliases_on_move` inscrit chaque
ancien chemin, `updated_at` ne bouge pas. `pnpm check:migrations` : 2 fichiers conformes. **Non appliquée au projet.**

Banc local (Docker absent) : PGlite 0.3 (Postgres 17 en WASM, `ltree`, `pg_trgm`, `unaccent`) installé dans le
scratchpad, hors du dépôt ; `db-prepare.sql` (section postgres-nu), ligne de base V1, organisation par `create_org`,
équipe, deux membres (espaces `perso/…` par le déclencheur), une page et sa sous-page, un alias d'avant, un alias au
chemin d'arrivée, `updated_at` daté ; migration ; contrôles : chemins, genre `context` du Contexte déplacé,
`updated_at` inchangés, chaque ancien chemin (`perso`, `perso/ada`, `perso/ada/contexte`, `perso/ada/notes/sous`…)
alias du bon nœud, alias d'avant gardé, alias gênant effacé, `is_context_path`, dossier immobile, espace réservé à son
membre (insertion et propriétaire), Contexte immobile, nouveau membre → `private/<handle>` et son Contexte, handle
`<h>_2` quand `private/<h>` est un ancien chemin, `unique_handle`, slugs `private` et `perso` refusés, `perso` à la
racine refusé (ancien chemin du dossier), `create_org` → `private`, policy, déclencheur `set_updated_at` rétabli ;
une seconde base où un nœud tient `private` : migration refusée, transaction annulée, `perso/ada` intact. Tout passe.

### Fichiers

- Migration : `packages/plateforme/migrations/20260928120000_platform_private.sql`, `supabase/migrations/` (copie),
  `packages/plateforme/migrations/README.md` (entrée « Fichiers », règle de la garde de l'arbre).
- Serveur : `server/journal-rows.ts` (les deux dossiers coupés, `nextFolder` en temps linéaire),
  `server/nodes/{move,write,duplicate,trash,lookup}.ts`, `server/shares.ts`, `server/admin/{nodes,orgs,journal}.ts`,
  `server/context/blocks/contexts.ts` (`private/<handle>/contexte` ; `CONTEXT_SIZES` : clés `all`, `private`, `team`),
  `server/teams.ts` (`private` réservé), `server/nodes/move-impact.ts` et `schemas/node-gestures.ts`
  (`PlaceView.space` : `all`), `server/{usage,journal-read}.ts` (commentaires), `schemas/journal.ts` (commentaire).
- MCP admin : `mcp/admin/tools/{node,org}.ts`.
- Écran (chemin écrit en dur seulement) : `ui/coque/deplacement-dans-le-rail.tsx` (le motif `/^perso\/[^/]+$/`
  devient `parentDe(chemin) === PERSO` : l'écran suit la seule constante).
- Scripts : `scripts/demo/30-arbre.mjs`, `scripts/demo/40-contenu.mjs`, `scripts/lib/pilot-qualification.mjs`.
- Tests : aides (`reference-org`, `plateforme`, `mcp-admin`, `mcp-admin-sql`, `reference-org-sql`,
  `table-fixture`, `acme`, `acme-sql`, `pending-migrations` : `PRIVATE_FOLDER_VERSION`, `privateFolderPending`,
  `privateFolderSuite`) et 50 fichiers de tests serveur, base et scripts passés à `private` ; tests nouveaux : alias
  par le MCP et par l'écran (`tests/unit/mcp-links.test.ts`), journal d'avant D107 et temps linéaire des deux dossiers
  (`tests/unit/journal-read.test.ts`), noms réservés `Private` et `Perso` (`tests/integration/equipes-services.test.ts`).
  Écrans (composants, pages, e2e) inchangés : ils suivent la constante du lot b.

### À reporter par le pilote (fichiers partagés)

`docs/architecture.md` (numéros de ligne à `bd3b162`), chaque ligne réécrite en entier :

- l. 187 : `| `members` | Une personne dans l'organisation | `user_id`, `role` (`admin` · `member` ; `service` retiré par E01-S12 c), `default_team_id`, `profile` `{name, handle, language}` (`tone`, `signature`, `preferences` retirés par E01-S12 c) ; `handle` unique dans l'organisation (index `uq_members_org_id_handle`, E02-S01) ; `email` (minuscules), `name`, `last_sign_in_at` : copies posées par l'outillage, par `members_identity_copy` depuis les claims et par `accept_invitations` à chaque retour de connexion (M08, E01-S09) ; aucune clé vers `auth.users` (E01-S09) | E01-S02 ✅, E02-S01, M08, E01-S09 ; un membre nouveau reçoit son espace `private/<handle>`, titré « Privé » (déclencheur `members_tree_sync`, M45 ; `perso/<handle>` jusqu'à `20260928120000`, ancien chemin gardé en alias, D107) |`
- l. 188 : `| `teams`, `team_members` | Équipes et appartenance | `slug` (ni `guide`, ni `perso`, ni `private`, ni `contexte`, ni `journal` ; `private` réservé depuis `20260928120000`, D107), `name`, `lead_user_id` ; `role` (`lead` · `member`) | E01-S02 ✅, E01-S04, E05-S11 |`
- l. 234 : `| `is_context_path(org, path)` | Définition unique d'un nœud Contexte : `contexte`, `<slug d'équipe>/contexte`, `private/<handle>/contexte` (P39 ; `perso/<handle>/contexte` jusqu'à `20260928120000`, D107) | E01-S04, E05-S11 |`
- l. 235 : `| `create_org(name, slug, prefix, hosts)` | Création d'une organisation avec sa racine `guide`, son dossier `private` (`perso` jusqu'à `20260928120000`, D107), son nœud `contexte` (genre `context`, Tout le monde, P39) et ses adresses (staff seulement) | E01-S04, E01-S06, E05-S11 |`
- l. 256 : la ligne telle quelle, sa fin remplacée : `… ; `private/<handle>` n'a pour propriétaire que la personne de ce handle, à l'insertion, au déplacement et au changement de propriétaire, pour tout rôle (M18b, M26) ; le dossier `private` ne bouge pas (`perso` jusqu'à `20260928120000`, D107) | E01-S04, E05-S11 |`
- l. 261 : `| `teams_tree_sync`, `members_tree_sync`, `teams_tree_cleanup` (P39) | À la création d'une équipe : son dossier `<slug>` et `<slug>/contexte` (`23505` si le chemin est pris) ; à la création d'un membre : `private/<handle>` et `private/<handle>/contexte` (`perso/…` jusqu'à `20260928120000`, D107) ; à la suppression d'une équipe dont le dossier ne contient que son Contexte : les deux nœuds partent avec elle, sinon `23503` ; rien dans une organisation sans arbre ; un membre dont `private/<handle>` est l'ancien chemin d'un autre nœud prend le premier `<handle>_<n>` libre (H61), son espace y naît (M08) | E01-S04, M08, E05-S11 |`
- l. 292 : `| `nodes` | membre | insertion : membre, `created_by` = l'appelant, jamais une racine ; mise à jour : membre, plus `nodes_guard` ; suppression : membre, sans enfant, jamais la racine, `private` (`perso` jusqu'à `20260928120000`) ni un nœud Contexte |`
- l. 341 : la ligne telle quelle, deux passages remplacés : « sa cible coupée à `private/<handle>` (D44, M14 ; même règle à l'usage d'E08-S09 ; une ligne écrite avant `20260928120000`, ou qui cite l'ancien chemin, se coupe à `perso/<handle>`, le journal n'étant pas réécrit, D107) » et « nomme l'espace personnel d'autrui à `private/<handle>` (`perso/<handle>` sur une ligne d'avant), sans le chemin dessous » ; colonne story : `E05-S05, E05-S11`.

`docs/decisions/ADR-013-partage-public.md` :

- l. 29 : `   l'organisation, rend le lien inerte (404). La racine de l'organisation, `private` (`perso` avant D107), les dossiers de structure et`
- l. 33 : `   règle `none` à son nom, nœud ajouté plus tard par un autre, auteur retiré, racine et `private` refusés).`

`packages/plateforme/CHANGELOG.md`, sous `## Unreleased` :

- `### Assistants` :
  - `- Personal spaces now live under `private` instead of `perso`: `context` serves your personal Contexte at `private/<handle>/contexte`; journal lines on another person's space are cut at `private/<handle>`.`
  - `- `read` on an old `perso/…` path serves the node and answers "perso/… moved to private/… on <date>: use the new path."; old links keep working.`
- `### Hosts` :
  - `- Migration `20260928120000_platform_private` to apply: the personal-spaces folder `perso` becomes `private`, each old path stays an alias of its node, and `private` joins the reserved team slugs. It stops without change if a team or a node already holds `private`.`
  - `- `GET nodes/impact` now returns `PlaceView.space` `all` instead of `organisation` for the company-wide space.`
  - `- `/n/perso/…` opens the moved page through its alias.`

### Hypothèses

- **HN-E05S11h-1 — L'alias couvre les chemins qui existaient ; aucun repli `perso/…` → `private/…` dans le
  service.** Un membre arrivé après la migration n'a jamais eu de `perso/<handle>` : rien à suivre. Source : D107
  (« les anciens chemins restent des alias »), mécanisme d'E03-S07/E05-S10 (`node_aliases`), la plus simple.
- **HN-E05S11h-2 — `updated_at` gardé** (déclencheur `set_updated_at` coupé le temps du changement de chemin) : aucun
  contenu ne change, et le bloc « Recent documents » de `context` trie par `updated_at` ; comme
  `keep_updated_at_on_order` pour l'ordre des frères. Source : `recent.ts`, ligne de base.
- **HN-E05S11h-3 — Le journal n'est pas réécrit** : 1 197 lignes du projet visent `perso/…` (lecture du 2026-09-28) ;
  le service coupe les deux dossiers, chacun tel qu'écrit, `perso/` restant aussi ce qu'un appelant peut écrire (alias).
  Réécrire l'historique d'un journal d'audit, arguments compris, coûterait plus et effacerait ce qui a été demandé.
  Conséquence connue : une ligne du journal d'avant ne compte plus pour « Recent documents » (lecture par chemin
  courant), comme après tout déplacement.
- **HN-E05S11h-4 — Collision : arrêt, pas de déplacement automatique.** Une équipe au slug `private`, ou un nœud à
  `private` ou dessous, arrête la migration en nommant l'organisation (le projet n'en a aucune, lecture du
  2026-09-28 : 0 équipe, 0 nœud, 0 alias à `private…`) ; un alias au chemin d'arrivée s'efface (ce chemin désigne
  désormais l'espace). Ce contrôle préalable est ce qui admet de rétrécir `teams_slug_reserved` (elle refuse
  désormais `private`) : aucune ligne existante ne peut y contrevenir, sans quoi la migration s'est arrêtée ; la
  règle est écrite dans `packages/plateforme/migrations/README.md § Commandes` (exception à « la nouvelle admet
  tout ce qu'admettait l'ancienne »).
- **HN-E05S11h-5 — `all` là où le serveur nomme déjà l'espace de l'entreprise, et pas comme slug réservé.** D107 fait
  de `all` l'identifiant de cet espace « là où un identifiant d'espace existe » : côté serveur, `PlaceView.space`
  (aperçu d'un déplacement, `organisation` → `all`, lu par aucun écran ; `schemas/node-gestures.ts`,
  `nodes/move-impact.ts`) et les clés de `CONTEXT_SIZES`. L'accès général (`POST nodes/access`, `access:
  "organisation" | "restricted"`, ADR-014) reste : c'est un mode d'accès de l'API, que l'écran du lot b envoie ;
  le renommer romprait le contrat d'une route pour un gain de nom. Le rail garde la clé `""` (lot b). **Au pilote** : si le rail prend la clé `all`, une équipe au slug `all`
  y rejoindrait la section de l'entreprise — alors réserver `all` (migration additive, même forme que le point 4 de
  celle-ci).
- **HN-E05S11h-6 — Un export d'avant la migration ne s'importe pas dans une base qui l'a** (le Contexte
  `perso/<h>/contexte` y est refusé par `nodes_guard`, transaction annulée, rien d'écrit) : on migre la source puis on
  réexporte. Aucune traduction à l'import (format 1 inchangé, aucun export en attente). Message obtenu :
  `pnpm org:import` s'arrête sur « Import annulé : nodes : 23514. L'organisation <slug> a été supprimée. » (la
  garde refuse le genre `context` hors d'un chemin de Contexte) ; conduite à tenir : appliquer
  `20260928120000` à la base source, réexporter, importer le nouveau fichier.
- **HN-E05S11h-7 — Tests qui supposent `private` en base : sautés, la version nommée**, par
  `privateFolderPending()` (lecture de l'historique des migrations, `pendingMigrations`) : suite entière quand sa
  graine l'exige, test seul sinon. Sans effet une fois la migration appliquée ; le pilote peut retirer le saut après.

### `perso` restants, fichiers des autres lots (à reporter à la fusion)

- Lot b : `packages/plateforme/ui/arbre/depuis-l-arbre.ts` l. 10 (`PERSO = "perso"` → `"private"` : bascule tout
  l'écran, rail et coque compris), l. 13, 43, 62, 100 (commentaires) ; la clé `""` de « Tout le monde » l. 77
  (→ `all` selon D107, puis `sections-du-rail.tsx` l. 31 et `deplacement-dans-le-rail.tsx` l. 217, qui lisent la clé
  comme un chemin) ; `ui/noeud/glyphes.tsx` l. 17, 19 (`"tout-le-monde"` → `all`, `perso` → `private`) ;
  `ui/noeud/fil.ts` l. 30-31 ; `ui/noeud/acces-general.tsx` l. 66, 76, 129, 143 ; `ui/noeud/ecran-de-noeud.tsx` l. 62,
  91 (commentaires).
- Lot c : `src/app/(dashboard)/n/[...chemin]/page.tsx` l. 68 (`CHEMIN_DE_CONTEXTE` : `perso\/` → `private\/`),
  l. 160 (`perso/${handle}/contexte`) ; `ui/contexte/libelles.ts` l. 15-49 (genres `perso`, `perso-d-autrui`,
  `tout-le-monde`) ; `ui/contexte/annexes-du-contexte.tsx` l. 48 ; `tests/integration/pages/noeud-page.test.tsx`
  l. 77, 154, 277, 279.
- Lot a : `packages/plateforme/schemas/profile.ts` l. 4, `ui/contexte/ma-fiche.tsx` l. 6,
  `tests/unit/schemas/profile.test.ts` l. 16 (commentaires) ; `tests/unit/context-blocks.test.ts` (fichier que le lot
  a touche aussi) : chemins passés à `private` ici, trois suites sautées tant que la migration manque.
- Lot e (vague 2) : `ui/coque/types.ts` l. 43, `ui/coque/freres.ts` l. 22, `deplacement-dans-le-rail.tsx` l. 69
  (commentaires).
- Tests d'écran qui suivront la constante : `tests/unit/ui-arbre-depuis.test.ts`,
  `tests/integration/components/{rail-application,regles-du-noeud,procedure,contexte,ecran-de-noeud,e05s10d-liens-publics}.test.tsx`,
  `tests/e2e/{page,procedure-et-contexte,partage-public,e05s10a-edition,e05s10b,e05s10b2-gestes}.spec.ts`
  (`/n/perso/`, `perso/<handle>/…`).

### Rayon d'impact

1. **Appelants.** Fonctions SQL re-versionnées : `rg -l "is_context_path|create_org|unique_handle|members_tree_sync|nodes_guard|nodes_delete_manager|teams_slug_reserved" packages scripts tests src --glob '!*.md'`
   → `server/{admin/org-creation,admin/orgs,admin/nodes,teams,nodes/move,context/blocks/contexts}.ts`,
   `server/database.ts` (types, signatures inchangées), `ui/contexte/annexes-du-contexte.tsx` et la page d'un nœud
   (commentaires), scripts d'import et Démo, 20 fichiers de tests : mêmes signatures, seul le dossier change.
   `structureOf` (genre `perso` → `private`) : `rg -l "structureOf" packages src tests` → `nodes/{duplicate,rename,trash}.ts`,
   `shares.ts`, adaptés. `CONTEXT_SIZES` : `rg -l "CONTEXT_SIZES" packages src tests` → `contexts.ts`,
   `context-blocks.test.ts` (lit `.team`, inchangé). Coupe du journal : `rg -l "targetFor|errorFor|hidesContent" packages src`
   → `journal-read.ts`, `usage.ts`, `admin/journal.ts`, signatures inchangées. `RESERVED_SLUGS` :
   `rg -l "RESERVED_SLUGS|reserved_slug" packages src` → `teams.ts`, `ui/api/messages.ts`, `ui/equipes/libelles.ts`
   (message générique, inchangé).
2. **Doublons.** `rg -n "node_aliases" packages/plateforme/server` : l'alias et sa lecture existent (`lookupAlias`,
   `resolveTargets`, `freePath`) : réutilisés, aucun mécanisme neuf ; le changement de chemin passe par les
   déclencheurs d'un déplacement. Le dossier est nommé à sept endroits du serveur (`rg -n "private" packages/plateforme/server --glob '*.ts'`) :
   laissé (voir 4).
3. **Effet produit.** Schéma `platform` (fonctions, policy, contrainte, chemins, alias) ; texte servi par `context`
   (golden queries) ; refus et textes d'`admin_node`/`admin_org` ; journal (coupe) ; hôte : migration à appliquer,
   Démo (`pnpm demo:seed` pose `private`), écran à basculer (liste ci-dessus) ; export-import (HN-E05S11h-6).
4. **Refacto.** Proposé au pilote, non fait : une constante `PRIVATE_FOLDER` exportée à côté de `ROOT_PATH`
   (`server/nodes/lookup.ts`) et lue par `move`, `write`, `shares`, `admin/nodes`, `contexts` — le prochain changement
   de nom tiendrait en une ligne ; sans lui, sept littéraux et motifs à suivre ensemble. Écarté : réécrire le texte
   des blocs `[[perso/…]]` (l'alias les résout, comme après un déplacement).

Option d'un cran plus simple écartée : ne changer que les littéraux sans alias (renommer les chemins en place par
`update` sans `nodes_aliases_on_move`) — tout lien, marque-page ou assistant qui cite `perso/…` casserait, contre D107.

### Vérifications

Consigne du pilote (2026-09-28) : pas de `pnpm verify` complet ; par le sémaphore, `pnpm type-check` (vert),
`pnpm lint` (vert), `pnpm check:framework` (vert), `pnpm check:migrations` (2 fichiers conformes), puis Vitest
(`VITEST_MAX_FORKS=2`) : `tests/unit` entier, 161 fichiers verts (1 635 tests, 3 sautés) ; 39 fichiers d'intégration
touchés ou qui importent les modules changés (liste : `rg -l "journal-rows|nodes/move|nodes/write|nodes/duplicate|nodes/trash|nodes/lookup|server/shares|admin/nodes|admin/orgs|admin/journal|blocks/contexts|server/teams|move-impact|server/usage|journal-read|mcp/admin|node-gestures|oto_platform/server|oto_platform/mcp|demo/30-arbre|demo/40-contenu|deplacement-dans-le-rail|rail-application" tests`,
114 fichiers, dont `tests/unit` entier et `tests/integration` : le passage complet de `tests/integration`, avant les
sauts, n'échouait que sur les suites qui supposent la migration) : 12 verts, 27 sautés (migration en attente), aucun
échec. Campagne de mutations (script à copie et restauration, empreintes comparées) : 9 mutations des gardes, 9
tuées — dossier ancien ou nouveau oublié dans la coupe du journal, chaîne citée, cible coupée au seul `private/`,
espace d'autrui à l'écriture, espace et dossier immobiles au déplacement, propriétaire du dossier et d'un espace à
`admin_node`. Non mutables avant l'application (suites sautées) : `RESERVED_SLUGS` (`equipes-services`), chemin du
Contexte servi (`context-blocks`), liste des liens publics (`e05s10e-partage-public`) ; les gardes SQL sont éprouvées
par le banc PGlite.

- Suites à rejouer après application (sautées ou nommées avant, `privateFolderPending`) : `tests/integration/`
  `{api-equipes, brouillon-publication, connectors-resolution, connectors-services, contenu-rls, context-full,
  droits-equipes, droits-noeuds, e05s10c-requetes-de-la-page, e05s10e-gestes, e05s10e-partage-public,
  equipes-services, espace-prive, isolation-par-table, links-move, m55-procedures-privees, mail-simulated,
  mcp-connectors, mcp-procedures, mcp-read-write, membres-services, pilot-qualification, regles-services, retraits-v1,
  role-plateforme, search-content}` entières ; un test de `annuaire-sql`, `mcp-admin`, `org-transfer` (AC7),
  `proprietaires`, trois de `portabilite-schema` ; trois suites de `tests/unit/context-blocks.test.ts` ; puis
  `pnpm demo:seed` et les e2e après la bascule de l'écran.

### Correction 1 (revue du lot h)

Textes à reporter par le pilote ajoutés (section « À reporter par le pilote ») ; exception de rétrécissement d'une
contrainte écrite dans `packages/plateforme/migrations/README.md § Commandes` et dans HN-E05S11h-4 ; `GRANT … TO
authenticated` de `create_org` et `is_context_path` redits dans la migration à l'identique de la ligne de base V1
(copie `supabase/migrations/` identique, migration toujours non appliquée) ; HN-E05S11h-6 complétée du message et de la
conduite à tenir. Banc PGlite rejoué avec un contrôle des privilèges de ces deux fonctions.

## Intégration a, b, c, h

Raccords de la fusion groupée, faits dans le checkout principal (lots a, b, c et h appliqués, non commités ;
migrations `20260928110000` et `20260928120000` non appliquées). Conventions chargées : coding-standards,
portage, a11y, testing, nextjs, api, state, registry (fiches).

### Raccords

- **Écrans sur `private`** (AC-e23, reste du lot h) : `PERSO = "private"` (`ui/arbre/depuis-l-arbre.ts`), que
  suivent rail, coque, fil, pied du rail, liste des procédures et annexes ; portées `all` · `equipe` · `private`
  (`ui/noeud/glyphes.tsx` `PorteeDEspace`, `ui/noeud/fil.ts`, `ui/noeud/acces-general.tsx`) ; genres de `Portee`
  `all` · `equipe` · `private` · `private-d-autrui` (`ui/contexte/libelles.ts`, `ui/contexte/annexes-du-contexte.tsx`) ;
  `CHEMIN_DE_CONTEXTE` de `src/app/(dashboard)/n/[...chemin]/page.tsx` sur `private\/` ; commentaires
  (`ui/coque/{types,freres,deplacement-dans-le-rail}`, `ui/noeud/ecran-de-noeud.tsx`, `ui/arbre/types.ts`,
  `schemas/profile.ts`). Tests et specs qui suivent la constante : `tests/unit/{ui-arbre-depuis,e05s11-parties-du-contexte,schemas/profile}.test.ts`,
  `tests/integration/components/{rail-application,regles-du-noeud,procedure,contexte,ecran-de-noeud,e05s10d-liens-publics,e05s11-contexte-servi,e05s11-profil}.test.tsx`,
  `tests/integration/pages/noeud-page.test.tsx`,
  `tests/e2e/{procedure-et-contexte,partage-public,page,e05s11-page,e05s10b2-gestes,e05s10b,e05s10a-edition}.spec.ts`.
- **« Ma fiche »** : `ui/contexte/ma-fiche.tsx` supprimé (aucun importeur : `rg -n "MaFiche|ma-fiche|MA_FICHE" packages src tests`),
  `MA_FICHE` retiré de `ui/contexte/libelles.ts` ; les commentaires d'origine de `ui/profil/{libelles.ts,formulaire-du-profil.tsx}`
  ne citent plus de chemin mort. Le test d'AC-8 (« Ma fiche » absente, `contexte.test.tsx`) reste.
- **Vue « Contexte » de l'accueil** : `EditeurDuContexte` (`ui/contexte/contexte-servi.tsx`) monte l'éditeur dans
  `<Island as="div">`, comme `CorpsDuNoeud` : l'indication d'enregistrement (`.oto-indication-d-enregistrement`,
  absolue, fond `--island`) se pose en haut à droite de la carte de chaque Contexte, et non plus du conteneur
  positionné le plus proche (`.oto-content`), où tous les éditeurs de la vue la posaient au même endroit.
- **Compilation croisée** : `pnpm type-check` et `pnpm lint` verts sans autre correction ; aucune signature d'un lot
  cassée par un autre.

### Hypothèses

- **HN-E05S11-i1 — La clé de section de « Tout le monde » reste `""`.** Elle sert aussi de parent à ce qu'on crée
  en haut de l'arbre (`racineDe` de `sections-du-rail.tsx`, `parentDuDepot` de `deplacement-dans-le-rail.tsx`) et
  n'est jamais montrée (pli et clé React : `org`) ; `all` y demanderait une traduction clé → chemin à ces deux
  endroits, et une équipe au slug `all` (non réservé, HN-E05S11h-5) y prendrait la clé de l'entreprise : les deux
  sections liraient les mêmes lignes. L'identifiant `all` va là où un identifiant d'espace est nommé à l'écran :
  les portées (`PorteeDEspace`, `Portee`). Source : D107, HN-E05S11h-5, la plus simple.
- **HN-E05S11-i2 — La constante garde son nom `PERSO`** (valeur `"private"`) : la renommer toucherait neuf fichiers
  pour un nom ; son commentaire dit l'ancien dossier. Source : la plus simple.
- **HN-E05S11-i3 — Genre `private-d-autrui`** pour le Contexte privé d'un autre, calqué sur `private` ; les ancres
  de la vue « Contexte » (`contexte-tout-le-monde`, `contexte-prive`, HN-E05S11-9) ne changent pas : ce sont des
  adresses (fragments) stables, pas des identifiants d'espace.
- **HN-E05S11-i4 — Un ancien chemin `/n/perso/<h>/contexte`** ouvre le Contexte par l'alias ; son aperçu se
  demande après la lecture du nœud (`complementsDuNoeud`), et non en parallèle : rien à ajouter pour un lien d'avant.

### `perso` restants

`rg -n "\bperso\b" packages/plateforme/ui src` : deux commentaires d'alias (`depuis-l-arbre.ts` l. 9, page d'un
nœud l. 71). `rg -n "\bperso\b" tests` : alias et anciennes lignes du journal (`journal-read`, `mcp-links`,
`pending-migrations`), et deux libellés sans rapport (`perso paul` de `connectors-services`, `perso-<hex>` de
`portabilite-schema`). `ui/coque/pied-du-rail.tsx` mène encore « Profil » à `private/<handle>/contexte` par la
constante : retour 2, lot e.

### Hors liste

- `tests/unit/ui-en-ligne.test.ts` (lot b) : une adresse web avec identifiant et mot de passe, écrite en littéral, faisait échouer
  `tests/unit/check-public.test.ts` (`url-with-password`, arbre) ; elle se construit à l'exécution
  (`testing-strategy.md § Anti-patterns`).

### Vérifications

Par le sémaphore : `pnpm type-check` vert, `pnpm lint` vert, `pnpm check:framework` vert ; Vitest
(`VITEST_MAX_FORKS=2`) sur `tests/unit`, `tests/integration/components`, `tests/integration/pages` : 225 fichiers,
2 368 tests verts, 4 sautés, un échec (`check-public`, ci-dessus), corrigé puis rejoué avec `ui-en-ligne` (37 verts).
Pas de `pnpm verify` ni d'e2e : après application des migrations, par le pilote.

## Lot d — rapport

### Hypothèses du lot d

- **HN-E05S11-d1 — La marque d'« Organisation » se lit sur l'identité** (`readBrand(identity.org)`), comme le logo
  et le thème du layout, et non par `brandSettings` : aucune requête de plus ; la page étant réservée à qui
  administre (`isOrgAdmin`), l'écran ne reçoit plus de `peutModifier` ; `updateBrand` redécide à l'écriture.
  Source : page Organisation (E05-S09 d2, « aucune requête de plus »), la plus simple.
- **HN-E05S11-d2 — « Le logo et le nom » puis « La couleur »**, un seul « Enregistrer » au bout de « La couleur »
  (le formulaire de marque garde son bouton dans son dernier îlot). Source : ordre de l'AC-22.
- **HN-E05S11-d3 — La légende de la couleur dit « La couleur de chaque compte qui n'a pas choisi la sienne dans
  son profil. »** ; celle d'hier renvoyait à la ligne « Couleur » du rail, que le lot e retire (AC-6).
  Source : HN-E05S11-3 confirmée (D107).
- **HN-E05S11-d4 — L'îlot « Contexte · Tout le monde » montre les blocs publiés seuls** (`vue.blocks` de
  `loadNode`), brouillon d'un rédacteur compris ; un bloc `reference` s'y lit en lien (`ReferenceEnLien`), sans
  `resolveReferencesForScreen` (une lecture de plus pour un encart) ; les titres de blocs y sont des `<h3>`, sous le
  `<h2>` de l'îlot (correction 1). Il est l'annexe de l'écran (colonne de droite, là où étaient les trois îlots retirés). Source :
  AC-24 (« blocs publiés, rendus comme en lecture »), la plus simple.
- **HN-E05S11-d5 — Redirections par `permanentRedirect` dans les pages** (plan du lot), et non par `redirects()`
  de `next.config.ts` (`seo-patterns.md § Règles SEO`) : `next.config.ts` est un fichier du lot c. Les
  `loading.tsx` partent pour que le 308 parte avant tout flux ; le statut se lit dans le `digest` de Next (test
  d'intégration) et sur la réponse du serveur (campagne). Une fois c fusionné, la redirection peut rejoindre
  `redirects()` (proposé au pilote).
- **HN-E05S11-d6 — `EcranOrganisation` perd `hrefMarque` et `logo`, gagne `marque`, `enregistre` et `contexte`**
  (facultatifs, comme `liensPublics`) : le paquet n'est pas publié (avant 1.0.0), et `logo` est `marque.logo`.
- **HN-E05S11-d7 — `/admin/acces` mène à `/equipes?onglet=acces`** ; l'onglet reste réservé à qui administre
  (l'écran le dit à un membre, E05-S03).
- **HN-E05S11-d8 — Le rôle `service` quitte `MemberRoleView`, `ROLES` et le menu d'une personne** (reste d'E01-S12 c) ;
  `server/identity.ts` (`memberRole`) ramenait déjà tout rôle inconnu à `member`. `tests/integration/retraits-v1.test.ts`
  garde `set("service")` : il prouve le refus de la base (`23514`), sans lire le type.
- **Fichiers hors liste, nécessaires** : `tests/integration/components/e05s10d-liens-publics.test.tsx` (prop
  `hrefMarque` retirée) ; `tests/integration/pages/marque-layout-connexion.test.tsx` (bloc « /admin/marque page »
  retiré : la page ne rend plus d'écran ; fichier du lot e, qui part après d) ; `tests/e2e/isolation.spec.ts`
  (titre « Équipes & accès »).

### Lot d — correction 1

- **Titres du Contexte en `<h3>`** (`accessibility-patterns.md § Checklist rapide`) : `RenduDUnBloc` reçoit
  `baliseDeTitre?: "h3"` (défaut inchangé, `BALISE_DE_TITRE`), passée par `ContexteDeLEntreprise` ; assertion
  `level: 3` dans `ecran-organisation.test.tsx`. Option d'un cran plus simple écartée : un `ReaderHeading` en
  `h3` recopié dans l'îlot, qui aurait rendu un titre de bloc de deux façons.
- **`FormulaireDeMarque` suit la marque servie** (`portage-ecrans.md § 2`) : `values` au lieu de `defaultValues`,
  comme `FormulaireOrganisation` ; test qui rerend l'écran avec une autre marque puis lit les champs
  (`ecran-marque.test.tsx`).
- **`marque.spec.ts` remet `orgs.brand` par la connexion d'administration** (`avecLaBase`, comme
  `admin-config.spec`) : lue en `beforeAll`, réécrite telle quelle en `afterAll`, sans passer par l'écran testé ;
  la spec se saute sans `PLATFORM_ADMIN_DATABASE_URL` (`SANS_BASE_ADMIN`).
- **HN-E05S11-d9 — Le type de la prop est `"h3"` seul**, pas une balise quelconque : le seul besoin est un titre
  sous un `<h2>` d'îlot ; élargir le jour où un autre niveau est demandé. Source : la plus simple.

## Lot e — rapport

Échelle Module, sans migration. Base : `main` à `cf61002` (a, b, c, d, h fusionnés). Conventions chargées (fiches) :
coding-standards, a11y, portage, registry, nextjs, api, state, performance, seo, testing, security, feedback.
AC-e23 vérifié : `rg -n "\bperso\b" packages/plateforme/ui src` ne trouve que deux commentaires d'alias
(`depuis-l-arbre.ts` l. 9, page d'un nœud l. 71) ; `/n/perso/<handle>/contexte` ouvre le Contexte renommé (campagne).

### Ce qui change

- **Rail** (`ui/coque/`) : pied = « Connecteurs » (qui administre, ligne courante sur ses sous-chemins) puis le compte ;
  plus de ligne « Couleur » ni « Corbeille ». Menu de l'engrenage : Profil (`/profil`), Brancher un assistant,
  Corbeille, filet, Déconnexion ; plus d'« Apparence ». Menu de l'entreprise : « Réglages de l'entreprise »
  (Organisation, Équipes & accès) puis « Suivi de l'entreprise » ; ni « Membres & équipes », ni Marque, Drapeaux,
  Accès plateforme, Connecteurs. Toutes ces entrées sortent de `ecransPermis` (rangements `reglages`, `suivi`, `pied`,
  `compte`) : le droit d'affichage reste décidé par la table, jamais par le composant.
- « + » de Privé : page, tableau, procédure (plus de « Nouvelle page privée ») ; résumé posé à la création selon le
  genre (`CREATION.resumeParDefaut[genre]`).
- Glyphe `Play` d'une procédure : `GLYPHES` du rail (lu par palette, création, « Contenus liés », accueil, fil) et
  table `ssr` du navigateur d'arbre.
- « Contexte · <section> » au rail et à la palette (`titreDeContexte`) ; `RAIL.contexte` retiré ; le `<title>` d'un
  Contexte par `titreDuContexte(chemin, equipes, handle)` (`ui/noeud/fil.ts`, exporté), que l'écran lit aussi pour son `<h1>`.
- Layout : `CoquilleOto theme={preferredTheme(identity)}` (la favicon suit la racine `.oto`) ; `ADRESSES` sans
  `marque`, `drapeaux`, `acces`, avec `profil` ; `RailApplication` sans `marque`. `admin/adresses.ts` : mêmes retraits.

### Hypothèses (lot e)

- **HN-E05S11-e1** (posée par le pilote) : « Résumé de la page à compléter. », « Résumé du tableau à compléter. ».
- **HN-E05S11-e2 — Menu du compte : Profil, Brancher un assistant, Corbeille, filet, Déconnexion**, pour tout membre
  (la corbeille était déjà ouverte à tout membre, `admin: false`). Source : oto-frontend `compte-du-rail.tsx` (Profil
  en tête, filet, Déconnexion), retour 22.
- **HN-E05S11-e3 — L'écran Connecteurs n'a plus de fil** : le fil d'un écran d'administration est « le groupe du menu
  de l'entreprise, puis l'écran » (settings-shell) ; hors du menu (AC-32), aucun groupe. Source : la plus simple ;
  `fil-de-l-administration.tsx` le dit. Test : `admin-config-pages.test.tsx` (`fil: false`).
- **HN-E05S11-e4 — Marque, Drapeaux, Accès plateforme quittent la table `ECRANS` du paquet**, pas seulement les
  adresses de l'hôte : un ERP qui servirait encore ces adresses ne les verrait pas non plus (AC-31) ; les clés
  d'`AdressesDuRail` restent jusqu'au retrait des écrans morts (HN-E05S11-15).
- **HN-E05S11-e5 — Profil au glyphe `UserCircle`** (celui de l'en-tête d'`EcranProfil`, lot a), proposé aussi dans la
  palette sous « Aller à », comme tout écran de `ecransPermis` ; Connecteurs y reste (AC-32 ne le retire que du menu).
- **HN-E05S11-e6 — `<title>` d'un Contexte** : équipes lues par `lireLesEquipes` (la lecture du layout, `cache`) ;
  illisibles, la section se dit par le premier segment, comme le `<h1>`.
- **HN-E05S11-e7 — « Connecteurs » est courant sur `/admin/connecteurs` et ses sous-chemins.** Source : oto-frontend
  (`chemin.startsWith("/connectors")`).

### Écarts avec la référence UI

- Pied d'oto-frontend : « Couleur », « Procédures », « Connecteurs », compte. Ici : « Connecteurs », compte ;
  « Couleur » part (AC-6), « Procédures » ne se porte pas (`portage-ecrans.md § 0`). Menu du compte : la Corbeille
  s'y ajoute (retour 22), « Apparence » part (AC-6), « Brancher un assistant » y reste (E05-S09).

### Fichiers

- Paquet : `ui/coque/{ecrans,libelles,types}.ts`, `ui/coque/{entreprise-du-rail,pied-du-rail,rail-application,sections-du-rail,creation-dans-le-rail,arbre-du-rail,palette-de-recherche}.tsx`,
  `ui/admin/fil-de-l-administration.tsx` (commentaire), `ui/arbre/navigateur-d-arbre.tsx`, `ui/noeud/fil.ts`
  (`titreDuContexte`), `ui/noeud/ecran-de-noeud.tsx` (lit `titreDuContexte`), `ui/index.ts` (ajout), `README.md`.
- Hôte : `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/admin/adresses.ts`, `src/app/(dashboard)/n/[...chemin]/page.tsx`.
- Tests : `tests/integration/components/{rail-application,ecran-organisation}.test.tsx`,
  `tests/integration/components/e05s11-coque.test.tsx` (créé), `tests/integration/pages/{marque-layout-connexion,noeud-page,admin-pages,identite-pages,admin-config-pages}.test.tsx`,
  `tests/e2e/{rail,page,e05s10b,e05s10b2-gestes,procedure-et-contexte,admin-config}.spec.ts`.
- Hors liste, nécessaires : `ui/noeud/{fil.ts,ecran-de-noeud.tsx}` et `ui/index.ts` (un seul calcul du titre d'un
  Contexte pour le `<h1>` et le `<title>`) ; `admin-pages`, `identite-pages`, `admin-config-pages`, `ecran-organisation`
  (libellés et fil du menu) ; `e05s10b2-gestes.spec` (Corbeille au menu du compte), `procedure-et-contexte.spec`
  (le `handle` se lit sur le lien « Contexte · Privé », Profil n'y mène plus), `admin-config.spec` (Connecteurs au pied,
  frères d'Organisation).

### Rayon d'impact

1. **Appelants.** `rg -l "ecransPermis|Rangement\b" packages src tests` → `coque/{ecrans,entreprise-du-rail,pied-du-rail,recherche-du-rail}`,
   `admin/fil-de-l-administration.tsx` (les autres correspondances sont le mot « Rangement… ») : la palette garde tous les
   écrans, le fil ne range que `suivi` et `reglages`. `RailApplication`/`PiedDuRail` (`marque`, et `handle` du pied,
   retirés) : `rg -n "PiedDuRail|MarqueDuRail|marque=\{" packages src tests` → layout, `README.md`,
   `rail-application.test.tsx`, `marque-layout-connexion.test.tsx` (les autres `marque=` visent la page publique et
   l'authentification, inchangées). Libellés retirés : `rg -n "resumeParDefaut|pagePrivee|COULEUR\b|ENTREPRISE\.|COMPTE\.|RAIL\.contexte" packages src tests`
   → la coque, `fil-de-l-administration.tsx` (`ENTREPRISE.suivi`, `reglages`, gardés), `accueil/branchement-ia.tsx`
   (`COMPTE.brancher`, gardé). `GLYPHES` : `rg -l "\bGLYPHES\b" packages/plateforme/ui` → `arbre-du-rail`,
   `palette-de-recherche`, `creation-dans-le-rail`, `accueil/contenus-recents`, `noeud/glyphes` (fil, « Contenus liés »),
   et la table propre de `navigateur-d-arbre`. Libellés testés : `rg -n "Contexte — |Couleur du thème|Nouvelle page privée|Équipes et droits|Accès plateforme\"|Corbeille\"" tests`
   → les fichiers de tests listés ci-dessus.
2. **Doublons.** Registre : `ecransPermis` (réutilisé pour le pied et le compte, aucune liste parallèle), `titreDeContexte`
   (lot b, réutilisé), `GLYPHES` (lu par la création au lieu de trois imports). `rg -n "titreDeContexte\(sectionDuChemin" packages src`
   avant le lot : `ecran-de-noeud.tsx` seul ; la page de l'hôte en aurait fait un second → `titreDuContexte`. `ADRESSES` en
   double (layout, `admin/adresses.ts`) : laissé, changé des deux côtés (fusion déjà proposée au pilote).
3. **Effet produit.** Toutes les pages du groupe `(dashboard)` (rail, thème, favicon) ; l'en-tête de l'écran Connecteurs
   (plus de fil) ; le fil d'Organisation (frères : Organisation, Équipes & accès) ; le `<title>` des Contextes ; les nœuds
   créés depuis le rail (résumé). Aucun service, API, MCP ni schéma.
4. **Refacto.** Écarté : fusionner les deux `ADRESSES` (déjà proposé). Code mort repéré, non retiré : `RailThemePicker`
   (`ui/ds/react/rail.tsx`) n'est plus monté (`rg -l "RailThemePicker" packages src tests` → sa définition seule) ; les clés
   `marque`, `drapeaux`, `acces` d'`AdressesDuRail` et d'`EcranDAdministration` (HN-E05S11-15).

Option d'un cran plus simple écartée : ne retirer Marque, Drapeaux et Accès plateforme que des adresses de l'hôte, sans
toucher `ECRANS` : un ERP qui passerait encore ces adresses les verrait revenir au menu (AC-31).

### Vérifications (lot e)

- Consigne du pilote : pas de `pnpm verify` complet. Par le sémaphore : `pnpm type-check`, `pnpm lint` verts ;
  `pnpm check:framework` vert ; Vitest (`VITEST_MAX_FORKS=4`) sur `tests/integration/components`, `tests/integration/pages`,
  `tests/integration/e05s10c-requetes-de-la-page.test.tsx`, `tests/unit/{e05s10b2-freres,ui-tokens,ui-arbre-depuis}.test.ts`
  (les suites qui importent un module changé : `rg -l "RailApplication|SectionsDuRail|PiedDuRail|coque/|\(dashboard\)/layout|NavigateurDArbre|noeud/fil|EcranDeNoeud|n/\[\.\.\.chemin\]/page|admin/(usage|retours|organisation|connecteurs)/page|EcranOrganisation|EcranConnecteurs" tests/unit tests/integration`) :
  69 fichiers, 742 tests verts après la correction d'une attente (`/profil` au clavier).
- Mutations (script hors dépôt `…/scratchpad/e_mutations.mjs` : copie gardée, rendue dans un `finally`, empreinte SHA-256
  comparée) : 11 sur 11 tuées — Connecteurs ouvert à tout membre ; Connecteurs rangé dans les réglages ; Suivi avant
  Réglages ; Corbeille hors du menu du compte ; Privé ne crée qu'une page ; résumé d'une page pour tout genre ; procédure
  sans `Play` au rail ; sans `Play` au navigateur ; tiret cadratin dans une table ; thème de l'organisation seul au
  layout ; titre enregistré dans le `<title>` d'un Contexte.
- Playwright, port 3000 libre avant chaque passage (`Get-NetTCPConnection`), serveur lancé depuis ce worktree :
  campagne temporaire (retirée) connectée à Démo, clair et sombre, 375 et 1 280 px, 4 sur 4 : rail sans « — », Connecteurs
  au pied et courant sur son écran, ni Couleur ni Corbeille au pied, menu de l'entreprise, « + » de Privé, menu de
  l'engrenage, Profil ouvert, `/n/perso/<handle>/contexte` titré « Contexte · Privé » (page et document), aucun
  défilement horizontal ; captures relues. Specs touchées : `rail`, `e05s10b2-gestes`, `admin-config`,
  `procedure-et-contexte` : 10 sur 11 ; l'échec (`procedure-et-contexte`, clair, l. 155 : deux éléments « Appel de
  table.claim » sur `?version=publiee`, page restée au chargement) se reproduit à l'identique sur la base sans le lot
  (travail mis de côté par `git stash push -u -m`, rejoué, rendu par `stash apply` de sa référence) : hors du lot e, à
  suivre par le pilote. `page.spec` et `e05s10b.spec` ne changent que le libellé « Contexte · … » (non rejoués).

## Lot f — rapport

Échelle Module (≥ 6 fichiers, composant du design system réécrit). Base : `main` à `198cfd1`. Conventions chargées :
coding-standards, a11y, portage, registry, forms, testing ; nextjs, api, state, performance, seo (fiches, pour
`src/app/design-system/page.tsx`).

**État à la reprise.** Le worktree `agent-a36df641ac0fc3e77` n'était plus un worktree : `.git` absent, entrée retirée de
`.git/worktrees`, `docs/`, `.method/`, fichiers à point et une partie de `node_modules` supprimés ; chaque fichier de
code restant égal à `198cfd1`. Les « 8 fichiers modifiés » étaient ceux du checkout principal (7 documents et une story
non suivie), lus faute de `.git` ; la transcription de l'agent précédent ne contient que des lectures. Rien n'était
fait : lot écrit en entier. Worktree rattaché à sa branche `worktree-agent-a36df641ac0fc3e77` (`git worktree add
--no-checkout` ailleurs, `.git` déplacé, `gitdir` réécrit, `git checkout -- .`), `node_modules` réinstallé.

### AC livrés

- **AC-19** : un seul `Select` (`ui/ds/react/select.tsx`), déclencheur `oto-scope` au bord entièrement arrondi, motif APG
  « select-only combobox » (`combobox`, `listbox`, `option`, `aria-expanded`, `aria-controls`, `aria-activedescendant`,
  focus gardé sur le déclencheur) ; flèches, Début, Fin, frappe de l'initiale (tampon de 500 ms, initiale répétée qui
  cycle), Entrée et Espace choisissent, Échap referme la liste seule et garde le focus ; choix désactivés sautés.
  `rg -n "<select" packages/plateforme/ui src` ne trouve plus que des commentaires.
- **AC-20** : entrée cachée `name` (formulaires GET : journal, usage, filtre de colonne, liste des procédures, règles) ;
  `register` inchangé côté formulaire (la ref vise l'enveloppe, où React Hook Form trouve l'entrée ; une valeur qu'il y
  écrit par `reset` ou `setValue` se montre ; le focus d'une erreur va au déclencheur) ; dans « Partager », la liste se
  monte dans le panneau : un choix ne le referme pas, Échap ferme la liste, puis le panneau.
- **AC-21** : les deux déclencheurs du menu à cases (« +n », « Régler les équipes de … ») prennent `oto-scope` ; le menu
  ne change pas.

### Listes remplacées (`rg -n "<select|<Select\b" packages/plateforme/ui src` au départ)

Natives : `components/choix.tsx` (filtre GET, liste des procédures), `noeud/deplacement-du-noeud.tsx` (« Nouveau
parent », en-tête et rail). `Select` du DS devenu popover, appelant inchangé ou presque :
`admin/connecteurs/creation-de-compte.tsx` (×2), `profil/formulaire-du-profil.tsx`, `tableau/filtre-de-colonne.tsx`
(focus d'ouverture sur `[role='combobox']`), `tableau/decision-de-revue.tsx`, `admin/usage/ecran-usage.tsx` (style du
chevron retiré), `equipes/ajout-de-regle.tsx` (×2, groupes), `journal/filtres-du-journal.tsx`,
`equipes/reglages-d-equipe.tsx` (dans un `<dialog>`), `invitations/inviter-quelqu-un.tsx`, `noeud/acces-general.tsx`
(×3, niveaux passés en `options`), `noeud/partage-du-noeud.tsx` (niveaux en `options`, ref typée sur l'enveloppe).
Hôte : `src/app/design-system/page.tsx` (Select Shadcn, HN-E05S11-f6). Lots en cours (E05-S12 A et B) :
`rg -n "<select|<Select\b" packages/plateforme/server/context packages/plateforme/ui/accueil "src/app/(dashboard)/page.tsx"` → rien.

### Rayon d'impact (lot f)

1. **Appelants.** `Select` : la liste ci-dessus. Il lit ses enfants comme une liste native (`<option>`, `<optgroup>`) ;
   un composant d'options ne se lit pas : `OptionsDuNiveau` et `OptionsDeNiveau` deviennent des fonctions d'options
   (`rg -n "OptionsDuNiveau|OptionsDeNiveau" packages/plateforme/ui`). `rg -n "HTMLSelectElement" packages src tests`
   → `partage-du-noeud.tsx`, `file-de-revue.test.tsx`, adaptés. `rg -n "oto-select\b" packages src tests` →
   `field.css` (règle retirée), `deplacement-du-noeud.tsx`, `ecran-usage.tsx`, adaptés. `rg -n "\bCHAMP\b" packages src
   tests` → `choix.tsx` seul : l'export part avec lui. Tests qui pilotaient une liste native (`rg -l "combobox|selectOption"
   tests`, `rg -n "fireEvent\.change" tests/integration`) : § Fichiers.
2. **Doublons.** `rg -ln "role=\"listbox\"|oto-combobox" packages/plateforme/ui` → `command-palette.tsx` (dialogue de
   recherche), `combobox.css` (styles sans composant), `partage-du-noeud.tsx` et `editeur/citer.tsx` (suggestions d'un
   champ de saisie) : `Select` étendu, pas recréé ; réutilisés : `Portail`, `racineOto`, `useAnchor`, `useDismiss`,
   `.oto-pop`, `.oto-menu-item`, `.oto-scope` ; les suggestions restent (elles filtrent une saisie).
3. **Effet produit.** Toute liste du paquet change d'aspect et de clavier, écrans d'un ERP hôte compris ; sans
   JavaScript, un filtre GET garde sa valeur servie mais ne se change plus (HN-E05S11-f4) ; `onChange` reçoit l'entrée
   cachée (`evenement.target.value` inchangé) ; aucune route, API, table ni texte MCP.
4. **Refacto.** Écarté : `Combobox` et `MultiSelect` complets d'oto-frontend (recherche), hors périmètre. Option d'un
   cran plus simple écartée : le `<select>` natif habillé en pilule, qu'AC-19 exclut (popover exigé).

### Hypothèses (lot f)

- **HN-E05S11-f1 — Le popover se monte dans la couche du déclencheur par un portail**, non littéralement sans portail :
  le panneau `.oto-pop` ou le `<dialog>` qui contient le déclencheur, sinon la racine `.oto`. Monté en place, la liste
  serait découpée par tout îlot (`.oto-island` : `overflow: hidden` et `container-type: inline-size`, qui en fait le
  bloc conteneur des éléments fixes) ; montée à la racine, elle refermait « Partager » (HN-E05S10b-4) et restait inerte
  sous un `<dialog>` modal. Source : HN-E05S11-14 (« rendu dans la couche du déclencheur »), `ds/app/islands.css`,
  `ds/tokens/breakpoints.css`.
- **HN-E05S11-f2 — Déclencheur** : `oto-scope` à la hauteur d'un champ (`--ctrl-h-*`), aligné sur ses voisins, valeur en
  `--ink`, pleine largeur dans un formulaire ; `.oto-share-level` garde sa largeur et sa place en fin de ligne, sans
  cadre transparent. Liste : `.oto-pop` de `.oto-menu-item`, coche en fin de ligne, choix courant en semi-gras.
- **HN-E05S11-f3 — Tab referme sans choisir** (l'APG choisit) : un Tab dans « Partager » n'envoie aucun changement de
  droits.
- **HN-E05S11-f4 — Sans JavaScript, un filtre GET ne se change plus** (l'entrée cachée envoie la valeur servie) : AC-19
  exclut toute liste native visible ; le reste du paquet exige déjà JavaScript. **→ fiche** si JB tient au filtre sans
  JavaScript (coût : une liste native rendue au serveur puis remplacée à l'hydratation).
- **HN-E05S11-f5 — Le déclencheur porte `value`** (la valeur courante), lu comme une liste native (`toHaveValue`) ; un
  bouton sans `name` n'envoie rien.
- **HN-E05S11-f6 — `/design-system` de l'hôte garde le Select Shadcn** (Radix, déjà en popover), bord `rounded-full` :
  la page documente le thème de l'hôte, hors `.oto`, où le `Select` du paquet n'aurait pas ses jetons.
- **HN-E05S11-f7 — « +n » du menu à cases** : la puce `Tag` devient le texte du déclencheur `oto-scope`.

### Fichiers (lot f)

Paquet : `ui/ds/react/select.tsx`, `ui/ds/components/css/{combobox,field,product}.css`,
`ui/components/{choix.tsx,classes.ts}`, `ui/noeud/{deplacement-du-noeud,partage-du-noeud,acces-general}.tsx`,
`ui/equipes/equipes-d-une-personne.tsx`, `ui/tableau/filtre-de-colonne.tsx`, `ui/admin/usage/ecran-usage.tsx`. Hôte :
`src/app/design-system/page.tsx`. Tests créés : `tests/helpers/liste-de-choix.ts` (ouvrir, lire, choisir),
`tests/integration/components/e05s11-select.test.tsx` (AC-19, AC-20) ; AC-21 dans `gestes-equipes.test.tsx`. Adaptés,
sous `tests/integration/components/` : `deplacement-du-noeud`, `e05s10b-partage`, `e05s10d-partage-web`,
`e05s11-profil`, `ecran-connecteurs`, `ecran-du-journal`, `ecran-equipes`, `ecran-usage`, `file-de-revue`, `grille`,
`inviter-quelqu-un`, `procedure`, `rail-application`, `regles-du-noeud` ; `tests/integration/pages/{e05s11-profil-page,noeud-page}.test.tsx` ;
`tests/e2e/page.spec.ts`. Hors liste de la story, nécessaires : `acces-general.tsx`, `ecran-usage.tsx`,
`filtre-de-colonne.tsx`, `classes.ts`, les tests du profil, de la page d'un nœud et du rail (ils pilotaient une liste
native).

Surface nouvelle : `tests/helpers/liste-de-choix.ts` (sans lui, dix-sept fichiers réécrivent l'ouverture et le choix) ;
types `SelectOption` et `SelectEvent` du DS (les fonctions d'options du partage les typent).

### Vérifications (lot f)

- Par le sémaphore : `pnpm type-check`, `pnpm lint`, `pnpm check:framework` verts.
- Vitest (`VITEST_MAX_FORKS=4`) sur les suites qui montent une liste (`rg -l "combobox|liste-de-choix|EcranDuJournal|EcranUsage|TableauDuNoeud|InviterQuelquUn|EcranConnecteurs|ReglesDuNoeud|EcranEquipes|EcranDeNoeud|EcranProfil|ListeDesProcedures|RailApplication" tests/integration tests/unit`),
  `tests/integration/pages` et `tests/unit/{ui-tokens,ui-boundary,coque-unique}.test.ts` : 43 fichiers, 490 tests verts.
- Mutations (script hors dépôt `…/scratchpad/mutations-f.mjs` : copie gardée, rendue dans un `finally`, empreinte SHA-256
  comparée, identique) : 5 sur 5 tuées — Échap arrêté dans la liste ; couche du déclencheur ; écriture de React Hook
  Form suivie ; focus d'une erreur au déclencheur ; choix désactivé sauté.
- Playwright, port 3000 libre avant et après (`Get-NetTCPConnection`), serveur lancé depuis ce worktree : `page.spec`
  (déplacement par la liste, clair et sombre) 2 sur 2 ; campagne temporaire (retirée) connectée à Démo, clair et sombre,
  375 et 1 280 px, 4 sur 4 : accès général et niveau d'une ligne dans « Partager », Échap ferme la liste puis le panneau,
  focus rendu au déclencheur ; « Responsable » dans un dialogue ; filtre « Équipe » du journal au clavier (Fin, Entrée)
  puis envoyé (`?equipe=`) ; « Langue » du profil ; bord arrondi mesuré (rayon ≥ demi-hauteur), liste peinte à sa place
  (`elementFromPoint` au centre de sa dernière option), aucun défilement horizontal ; captures relues. Le premier passage
  a montré la liste de « Partager » invisible : l'animation d'entrée `both` gardait un `transform` en effet sur le
  panneau, qui devenait le bloc conteneur de la liste (décalée, puis découpée) ; corrigé par `backwards` sur `.oto-pop`
  et `.oto-dialog[open]` (HN-E05S11-f8), puis rejoué.

### Hypothèse ajoutée au passage visuel

- **HN-E05S11-f8 — Les entrées de `.oto-pop` et de `.oto-dialog[open]` passent de `both` à `backwards`**
  (`ds/components/css/overlay.css`, `dialog.css`, hors liste) : l'état final de l'animation est celui du repos, et une
  animation de `transform` qui persiste fait de l'élément le bloc conteneur de ses descendants fixes ; les sorties
  (`data-closing`) gardent `both`. Aucun écart visible. Leçon à écrire par le pilote : `portage-ecrans.md § 3` (un
  flottant monté dans un autre flottant suppose que celui-ci ne garde aucun `transform`).

## Lot f — correction 1

- **Constat 1 (MOYENNE) — une valeur qui ne nomme aucun choix montre et envoie le premier choix disponible**, comme
  une liste native (`select.tsx`, calcul de `valeur` en mode non contrôlé) : adresse périmée (`?equipe=<id supprimé>`
  par `Choix` ou le filtre du journal), choix retiré par une relecture (`AjoutDeRegle`). Test d'abord rouge
  (déclencheur vide) : « should show and send the first available choice when the value names no choice… »
  (`e05s11-select.test.tsx`, adresse périmée puis relecture qui retire le choix courant).
- **Constat 3 (BASSE)** — tests ajoutés : Tab referme sans appeler `onChange` (HN-E05S11-f3) ; Échap dans un
  `Dialog` modal referme la liste seule, l'action par défaut (l'annulation du `<dialog>`) empêchée, `onClose` jamais
  appelé, la liste montée dans le dialogue. Verts d'emblée : ils gardent un comportement déjà livré.
- **Constat 4 (BASSE) — aucun changement de code** : non reproductible. `choisir` referme toujours la liste avant
  d'écrire l'entrée ; ce rendu remet l'entrée cachée à la valeur contrôlée (React 19 compare la valeur du DOM à chaque
  rendu d'une entrée contrôlée). Test ajouté, vert avant et après : un parent qui refuse deux fois le même choix
  laisse la valeur qu'il tient dans le formulaire (« should leave the controlled value in the form when the parent
  refuses the choice »).
- **Constat 5 (BASSE)** — le survol d'une option désactivée ne déplace plus la ligne surlignée ; assertion ajoutée au
  test du clavier, d'abord rouge (« Retirer » surlignée).
- **HN-E05S11-f9 — Une valeur écrite par React Hook Form hors des choix se montre aussi comme le premier choix**, alors
  que React Hook Form garde la sienne ; une liste native resterait vide. Aucun appelant ne l'écrit aujourd'hui
  (défauts relus : responsable `""` → « Sans responsable », langue `""`, rôle `member`, équipe `""` ou la première,
  parent `AUCUN`). Source : la formule prescrite par la revue, la plus simple ; distinguer les deux origines coûterait
  un drapeau d'écriture dans `useEntreeSuivie`.

Vérifications : Vitest (`VITEST_MAX_FORKS=4`) — `e05s11-select` 10 sur 10 ; la suite complète est partie par erreur
d'argument (liste vide) : 292 fichiers verts, 23 sautés, 2 932 tests. `pnpm type-check`, `pnpm lint`,
`pnpm check:framework` verts. Mutations (`…/scratchpad/mutations-f-c1.mjs`, copie gardée, rendue dans un `finally`,
empreinte SHA-256 identique) : 2 sur 2 tuées — premier choix disponible ; survol d'une option désactivée.
