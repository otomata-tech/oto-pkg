# Fiche — forms-patterns

Texte complet : `.method/conventions/forms-patterns.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- Un seul schéma Zod valide le formulaire et l'action (`src/lib/schemas/`, `packages/plateforme/schemas/` pour le paquet) ; aucune validation manuelle en double. § Principe
- Le composant rend ses quatre états : repos, envoi, erreur en ligne, succès (redirection ou toast). § Principe
- `useForm` avec `zodResolver` et `mode: "onBlur"`, envoi dans `startTransition`, erreur de l'action posée par `setError("root")`, bouton désactivé pendant l'envoi. § Pattern standard
- Un formulaire simple s'écrit `<form action={…}>` avec `useActionState` ; `useFormStatus` vit dans un composant placé dans le `<form>`. § Formulaire progressif (sans JavaScript)
- Une mutation part par `action={}` ou par `handleSubmit` et une Server Action, jamais par `onSubmit` et `fetch("/api/…")`. § Formulaire progressif (sans JavaScript)
- Exception des écrans du paquet : `handleSubmit`, puis `appelerPlateforme` vers `/api/platform/<ressource>`, message par `messageDErreur` ; aucun `fetch` écrit à la main dans `ui/` hors `ui/api/client.ts`. § Formulaire progressif (sans JavaScript)
- La table de `messageDErreur` a une phrase pour `not_member`, `unknown_org` et le 401 ; chaque refus de `resolveIdentity` a son cas dans `tests/unit/ui-messages.test.ts`. § Formulaire progressif (sans JavaScript)
- Une validation asynchrone est un confort, avec un debounce (~400 ms) ; l'unicité tient par un `UNIQUE` en base, et l'action traduit `23505` en message. § Validation asynchrone (unicité, disponibilité)
- Une mise à jour optimiste appelle `addOptimistic` dans la transition, rend et affiche `{ error }` en cas d'échec, et se réserve aux actions rapides rarement en échec. § Mise à jour optimiste
- Un bouton désactivé ne déduplique pas côté serveur : une création facturable ou irréversible porte une clé d'idempotence. § Double soumission
- Un contrôle bloqué par une règle métier se garde aussi dans son gestionnaire, pas seulement par `disabled` ; son test clique le contrôle désactivé et n'attend aucune requête. § Double soumission
- Un schéma, un formulaire, une action. § Règles
- Une erreur de champ s'affiche en ligne sous le champ ; l'erreur globale porte `role="alert"`. § Règles
- Tout champ a un `<label>` associé (`htmlFor` et `id`) ; seul le champ d'un éditeur en place se nomme par `aria-label`, lu dans son test par `getByRole("textbox", { name })`. § Règles
- Aucun `useState` par champ sous React Hook Form ; les valeurs par défaut vivent dans `defaultValues`, pas dans le JSX. § Règles
