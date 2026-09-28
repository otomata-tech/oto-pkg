# Fiche — i18n-patterns

Texte complet : `.method/conventions/i18n-patterns.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- Écrans du paquet (`packages/plateforme/ui/`) : pas de `next-intl` ; une table de libellés par écran et son jumeau anglais typé (`*.en.ts`, `satisfies Catalogue<…>`), langue posée par l'hôte (ADR-015). § Stack recommandée
- `next-intl` (`src/`) : messages dans `messages/<locale>.json`, configuration dans `src/i18n/`. § Setup (next-intl)
- Une clé s'écrit `namespace.key` en anglais, un namespace par domaine, l'interpolation par `{var}`, les pluriels par la bibliothèque. § Naming conventions pour les clés · § Règles
- `useTranslations("<namespace>")` sert les Server comme les Client Components. § Usage
- Aucun texte en dur dans le JSX, messages d'erreur compris ; dates, nombres et devises passent par `Intl`. § Règles
