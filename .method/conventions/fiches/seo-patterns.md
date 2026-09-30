# Fiche — seo-patterns

Texte complet : `.method/conventions/seo-patterns.md`. La fiche suffit pour écrire ; le texte complet se lit sur un doute, et toujours pour une revue. Chaque règle renvoie à sa section.

- `metadata` statique ou `generateMetadata` par page ; les défauts (`title.template`, `metadataBase`) au layout racine. § Metadata API
- Toute page publique a un `title` et une `description` uniques ; les pages de connexion, d'inscription et de réinitialisation sont en `noindex`. § Règles SEO
- Une seule forme canonique par page (slash final ou non), la même dans la page, le sitemap et le JSON-LD. § Règles SEO
- Aucune preview indexable : `X-Robots-Tag: noindex`, ou `robots.ts` branché sur `VERCEL_ENV`. § Règles SEO
- Une URL publique indexée renommée ou retirée se redirige en `permanent: true` ; une page authentifiée ou `noindex` renommée répond 404. § Règles SEO
- Images à `alt` descriptif, un seul `h1` par page. § Règles SEO
- `robots.ts` n'exclut aucun robot d'IA (un blocage ciblé est un ADR) ; ses `disallow` visent des zones privées. § Agentic readiness
- Un chemin inexistant rend un vrai 404 (`not-found.tsx`), jamais un `redirect()` vers l'accueil. § Agentic readiness
- `llms.txt` et `app/sitemap.ts` dérivent de la même fonction ; une page `noindex` n'est dans aucun des deux. § GEO — moteurs génératifs
- Une page publique ouvre sur un TL;DR autonome, porte sa FAQ en HTML et en JSON-LD `FAQPage`, écrit ses entités nommées, le tout rendu côté serveur. § GEO — moteurs génératifs
- Le JSON-LD passe par un composant `JsonLd`. § Structured Data (JSON-LD)
