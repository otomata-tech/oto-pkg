# Story — Traduction des écrans du paquet

## Meta

| Champ | Valeur |
|-------|--------|
| **Épic** | Écrans de la plateforme (V2) |
| **Parcours** | Tous les écrans du paquet et les pages de l'hôte |
| **Statut** | 🟣 V2 — non planifiée ; Definition of Ready à repasser à l'ouverture |
| **Priorité** | Should (V2) |
| **Référence UI** | Écrans actuels du paquet, en anglais |
| **Conventions** | i18n, portage, a11y, testing |
| **Estimation** | L (découpable en g1 paquet, g2 hôte) |
| **Porteuse de migration** | non |

## Contexte

Lot g de l'ancienne story « Retours produit » (E05-S11), sorti de la V1 par JB le 2026-09-28 : la
traduction des écrans est une story à part pour une version suivante, sur le mécanisme proposé par
ADR-015 (`docs/conception/adresses-et-langue.md`). En V1, la langue du profil se range et règle la
langue de réponse de l'assistant (D105, livré) ; les écrans restent en français.

**Refs :** D105, D106, ADR-015, HN-E05S11-26, HN-E05S11-29 ; conception :
`docs/conception/adresses-et-langue.md`, `docs/conception/ecrans-et-coque.md`.

## Hypothèses reprises

- **HN-E05S11-26 — Traduction sans `next-intl` dans le paquet** : tables TypeScript par écran, jumeau anglais
  typé, langue donnée par l'hôte (contexte client, valeur de requête côté serveur). `i18n-patterns.md` (next-intl
  dans `src/`) ne vaut pas pour `ui/`, qui n'importe aucun cadre de l'hôte (ADR-008) : ADR-015 à écrire, fiche
  d'i18n à amender. **→ fiche**.
- **HN-E05S11-29 — La langue de l'organisation se règle dans `/admin/organisation`** (lot g), à côté de la couleur.

## Critères d'acceptation

AC-36 et AC-37 sont livrés (langue effective, langue de réponse servie par `context`) ; restent
AC-38 et AC-39.

- [x] **AC-36** Langue effective = celle du profil, sinon celle de l'organisation (`orgs.brand.language`, réglée
  dans `/admin/organisation`), sinon le français.
- [x] **AC-37** `context` dit à l'assistant de répondre dans la langue effective (une ligne du bloc « Vous ») ;
  golden queries relues.
- [ ] **AC-38** Tous les écrans du paquet (`ui/`) et les pages de l'hôte (titres, métadonnées, connexion)
  s'affichent en anglais pour une personne dont la langue effective est l'anglais : aucun texte français (test :
  chaque catalogue anglais a toutes les clés du français, vérifié par `tsc` ; campagne Playwright en anglais) ;
  `<html lang>` suit ; dates et nombres par `Intl` dans cette langue ; les refus de l'API passent par la table
  des messages de la langue.
- [ ] **AC-39** Changer sa langue dans Profil change l'interface à la relecture de la page, sans reconnexion.

## Plan

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

