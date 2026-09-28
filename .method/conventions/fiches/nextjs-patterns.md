# Fiche — nextjs-patterns

Texte complet : `.method/conventions/nextjs-patterns.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- `error.tsx` et `global-error.tsx` sont `"use client"` ; `route.ts` sert les webhooks. § Fichiers spéciaux
- PPR et `use cache` ne sont pas activés : les activer demande un ADR. § Fichiers spéciaux
- Un layout n'est pas une frontière d'autorisation : l'accès se contrôle dans chaque `page.tsx` (ou la couche de données) et dans chaque Server Action ; un `redirect("/login")` de layout sans équivalent dans les pages du segment est HAUTE. § Un layout n'est JAMAIS une frontière d'autorisation
- Aucun state volatil dans un layout, qui persiste entre les navigations. § Un layout n'est JAMAIS une frontière d'autorisation
- Un route group qui a un `layout.tsx` a au moins un `page.tsx` ; deux `page.tsx` ne donnent jamais le même chemin une fois les `(...)` retirés ; aucun `redirect()` ne vise un nom de groupe. § Un layout n'est JAMAIS une frontière d'autorisation
- `loading.tsx` rend un squelette ; un `<Suspense>` par section pour un chargement plus fin. § Loading States · § Suspense granulaire
- `error.tsx` propose « Réessayer » par `reset`. § Error Handling
- Une ressource absente appelle `notFound()`, rendu par le `not-found.tsx` du segment. § Not Found
- Un groupe `(nom)` ne crée aucun segment d'URL : `(dashboard)/projects/page.tsx` est `/projects`. § Route Groups
- `params` est une `Promise` qui s'attend. § Dynamic Routes
- Metadata : `seo-patterns.md § Metadata API`. § Metadata
- `router.push` et `router.refresh` dans un Client Component seulement ; `redirect` côté serveur. § Navigation
- Une image distante déclare son domaine dans `images.remotePatterns` de `next.config.ts`. § Images
- Une police se charge par `next/font`, en variable CSS posée sur `<html>`. § Fonts
