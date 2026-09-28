# ADR-015 — La langue des écrans du paquet, sans cadre d'i18n

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-28 |
| **Statut** | Proposé — pour la version qui traduira les écrans (hors V1, JB 2026-09-28) |
| **Décideur(s)** | JB (fiche D105 : la langue du profil change aussi les écrans) ; mécanisme : pilote (HN-E05S11-26, story E05-S11) |

## Contexte

La langue du profil change l'interface, en français et en anglais au moins (D105). Les écrans vivent dans la face
`ui/` du paquet, qui n'importe aucun cadre de l'hôte (ADR-008) : un ERP qui monte le paquet n'a pas forcément
`next-intl`, et le paquet ne peut pas lui imposer son routage par langue. `i18n-patterns.md` recommande
`next-intl` pour une application ; il ne décrit pas un paquet d'écrans monté par un hôte.

## Décision

1. **Pas de cadre d'i18n dans `ui/`.** Chaque table de libellés d'un écran (`libelles.ts`, `textes.ts`,
   `messages.ts`) garde son français comme source et reçoit un jumeau anglais typé (`libelles.en.ts`,
   `satisfies Catalogue<typeof …>`) : une clé manquante ne compile pas.
2. **La langue vient de l'hôte.** Il la résout (profil, puis organisation, puis français) et la pose : côté
   client par le contexte de `CoquilleOto`, côté serveur par une valeur de requête (`cache()` de React). Un
   composant lit sa table en une ligne (`useLibelles(table)` ou `libelles(table)`) ; sa logique ne change pas.
3. **L'adresse ne porte pas la langue** : pas de préfixe `/en/`. Une page s'affiche dans la langue de qui la lit.
4. **Les services restent en anglais** (H04) : leurs messages sont traduits par l'écran (`ui/api/messages.ts`) ;
   le MCP ne change pas, et `context` dit à l'assistant la langue de réponse.
5. **Dates et nombres** passent par `Intl` dans la langue effective.

## Conséquences

### Positives
- L'hôte n'a aucune dépendance à ajouter ; un ERP pose une langue et c'est tout.
- Une traduction manquante casse le type-check, pas l'écran en production.

### Négatives
- Pas de pluriels ICU ni d'outil de traduction externe : un pluriel s'écrit en fonction dans la table.
- Chaque texte en dur d'un écran doit rejoindre sa table (lot g d'E05-S11, 61 composants recensés).

### Neutres
- `src/` (pages de l'hôte hors paquet) suit la même règle pour ses quelques textes (`src/app/(auth)/messages.en.ts`).

## Alternatives considérées

### `next-intl` dans le paquet
Rejetée : `ui/` dépendrait du cadre de l'hôte et de son routage (ADR-008), un ERP devrait l'installer.

### Fichiers JSON par langue
Rejetée : une clé manquante ne se voit qu'à l'exécution ; les tables TypeScript existent déjà par écran.
