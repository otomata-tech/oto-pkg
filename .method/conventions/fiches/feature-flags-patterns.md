# Fiche — feature-flags-patterns

Texte complet : `.method/conventions/feature-flags-patterns.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- Un flag marche/arrêt par environnement se lit dans un objet `FEATURES` `as const` tiré de `process.env` : `NEXT_PUBLIC_FF_*` pour le client, sans préfixe côté serveur. § Approche simple (env vars)
- Un déploiement progressif ou une exception par utilisateur passe par la base : l'exception de l'utilisateur se lit avant le flag global. § Approche avancée (database-driven)
- Un flag porte un nom en snake_case et une seule fonctionnalité, sans dépendance à un autre flag. § Règles
- Le code se teste avec et sans le flag ; flag et code se retirent quand la fonctionnalité est stable. § Règles
