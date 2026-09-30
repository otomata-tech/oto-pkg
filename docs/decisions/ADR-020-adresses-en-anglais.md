# ADR-020 — Les adresses sont en anglais

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-30 |
| **Statut** | Accepté |
| **Décideur(s)** | Le responsable d'Oto (fiche D132) ; mise en œuvre : story E11-S07 |

## Contexte

Consigne du responsable d'Oto (fiche D132) : jamais de français dans une URL. L'hôte de référence et
le paquet servaient pourtant des adresses françaises : routes (`/equipes`, `/corbeille`…), préfixe de
l'API des écrans (`/api/plateforme/*`), paramètres (`?onglet=`, `?periode=`…), valeurs
(`?version=publiee`) et ancres (`#nouveautes`). Aucun ADR n'imposait ces formes ; ADR-015 § 3 dit
seulement que l'adresse ne porte pas la langue (pas de préfixe `/en/`), sans dire en quelle langue
elle s'écrit. Le préfixe de l'API des écrans est le contrat de montage entre l'hôte et le paquet
(H03, H06, ADR-012, ADR-016, ADR-017, ADR-018) : le changer est un changement cassant pour tout hôte.

## Décision

1. **Toute adresse est en anglais, quelle que soit la langue de l'écran** : segments de route, noms
   et valeurs de paramètres, ancres qu'un lien vise. Orthographe américaine (`organization` :
   `/admin/organization`, `/no-organization`). Les textes servis en anglais par le paquet (outils
   MCP, refus) gardent `organisation` : seule l'adresse suit la règle. Un identifiant de code, un
   nom de dossier entre crochets, un `id` qu'aucun lien ne vise et un chemin de nœud (donnée) ne
   sont pas des adresses.
2. **Contrat de montage** : l'hôte monte l'API des écrans sous `/api/platform/*`
   (`src/app/api/platform/[...route]/route.ts`). Le paquet lit ce préfixe d'une seule constante,
   `PLATFORM_API_PREFIX` (`@otomata_tech/oto_platform/schemas`) : la porte, le client des écrans et
   les adresses d'API que les services écrivent (liens de fichiers, dépôt par lien).
3. **Sans client, un renommage se fait sans alias ni redirection** : l'ancienne adresse répond 404.
   La redirection permanente de `seo-patterns.md § Règles SEO` ne vaut que pour une page publique
   indexée ; une page authentifiée ou `noindex` renommée répond 404.
4. **`pnpm check:framework` garde la règle** (`scripts/check-framework-invariants.mjs`) : un segment
   de `src/app` absent de `SEGMENTS_ADMIS` fait échouer le check (hors groupes `(…)`, paramètres
   `[…]` et dossiers en `.`) ; un ancien nom en position d'adresse est refusé avec le nom qui le
   remplace, y compris dans `URLSearchParams`, un champ `name=` et la prop `nom=`. Un segment
   anglais nouveau s'ajoute à la liste, visible en revue.

## Conséquences

### Positives
- Une seule langue d'adresse pour tous les écrans, stable quand les écrans seront traduits
  (ADR-015).
- Le préfixe d'API vit en un seul endroit : un renommage futur ne se fait plus littéral par
  littéral.
- La garde rend la règle détectable par `pnpm verify`, pas seulement en revue.

### Négatives
- Changement cassant pour tout hôte : dossiers de routes à renommer, route de l'API à déplacer,
  exclusion d'en-têtes des routes HTML (ADR-017) à réécrire, adresses de retour de Supabase Auth
  (`/auth/confirm`) à ajouter ; une invitation envoyée avant la version mène à une 404.
- Un lien de fichier ou de dépôt donné à un assistant avant la version ne répond plus.
- L'adresse `/admin/organization` côtoie le mot « organisation » des textes servis en anglais :
  incohérence assumée.

### Neutres
- `/journal` reste : « journal » est un mot anglais, et c'est déjà le chemin MCP et la table
  `platform.journal`.
- Les ressources de l'API (`nodes`, `teams`, `trash`…) étaient déjà en anglais : seul le préfixe
  change.

## Alternatives considérées

### Alias ou redirections des anciennes adresses
Inutiles sans client (fiche D131) : ils ajouteraient une surface à maintenir et à retirer plus tard,
sans personne à servir. À reconsidérer pour une page publique indexée, que la règle SEO couvre.

### `/admin/organisation`, orthographe britannique
Aurait gardé l'accord avec les textes servis. Écartée par le responsable d'Oto (HN-E11S07-3) : les
adresses suivent l'orthographe américaine.
