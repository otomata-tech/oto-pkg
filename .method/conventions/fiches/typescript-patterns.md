# Fiche — typescript-patterns

Texte complet : `.method/conventions/typescript-patterns.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- `strict: true` dans `tsconfig.json`, jamais désactivé. § Règles non-négociables
- Une valeur inconnue se reçoit en `unknown` et se rétrécit par un type guard ; une assertion `as` ne s'écrit que documentée. § Règles non-négociables · § Type Guards
- `type` pour les unions, les intersections et les props de composant ; `interface` pour un contrat d'objet étendu ou implémenté. § Types vs Interfaces
- Un type dérivé se tire par les utility types (`Pick`, `Omit`, `Partial`, `Awaited<ReturnType<…>>`), jamais recopié. § Utility Types
- Des états exclusifs s'écrivent en union discriminée (`status`), rétrécie par `switch`. § Discriminated Unions
- Des identifiants de genres différents qu'on pourrait mélanger prennent un type marqué (`string & { readonly __brand: … }`). § Branded Types
- Le type d'une entrée se tire de son schéma Zod par `z.infer`, jamais écrit une seconde fois. § Zod ↔ TypeScript
- Les types de table se tirent de `database.ts`, généré et jamais modifié à la main. § Types Supabase
- Un `switch` sur une union se ferme par `assertNever` dans son `default`. § Strictness helpers
