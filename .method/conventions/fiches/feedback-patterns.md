# Fiche — feedback-patterns

Texte complet : `.method/conventions/feedback-patterns.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- Toast pour le résultat d'une action, erreur en ligne pour une validation, bannière pour une information persistante, dialogue avant une action destructive, état vide sans donnée, squelette au chargement. § Quand utiliser quoi
- Un toast passe par `sonner` (`<Toaster>` du layout racine) : 5 s, 8 s pour une erreur, en bas à droite, 3 au plus ; jamais pour une erreur de validation. § Règles Toast
- Confirmation obligatoire avant une suppression, un envoi d'email ou une action irréversible ; aucune pour une sauvegarde, une navigation ou une action réversible. § Règles Dialogs
- Dans un dialogue : bouton destructif à droite, annuler à gauche ; Escape et clic à l'extérieur annulent ; le focus reste dans le dialogue (Radix). § Règles Dialogs
- Un état vide passe par `EmptyState` (oto-saas : `src/components/empty-state.tsx` : `icon`, `heading`, `description`, `action`) ; le réécrire est un défaut HAUTE. § Empty States
- Chargement : `loading.tsx` pour la page, `<Suspense>` pour une section, `useTransition` pour un bouton ; un squelette a les dimensions du contenu. § Les 3 niveaux · § Skeleton pattern
- L'erreur d'un champ s'affiche par `<FormMessage />` (React Hook Form et Zod) ; l'erreur globale d'une Server Action dans une `Alert` lue de `errors.root`. § Inline Errors (formulaires) · § Erreur globale (Server Action)
