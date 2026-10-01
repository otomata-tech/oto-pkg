# Story — [Titre]

<!-- INSTRUCTIONS : Créé par /plan — artefact « issues et stories », en mode initial ou évolution.
     Fichier `docs/produit/stories/<sujet>.md`, nommé par sujet : ni numéro d'issue ni lien GitHub
     dans le fichier ; c'est l'issue qui porte le chemin de la story (`CLAUDE.md § Issues et stories`).
     Ce template est le plus important — il doit contenir TOUT ce dont
     Claude Code a besoin pour implémenter de manière autonome.
     IMPORTANT : Vérifier .method/conventions/component-registry.md avant de créer. -->

## Meta

| Champ | Valeur |
|-------|--------|
| **Épic** | [Titre de l'issue parente, sans numéro] |
| **Parcours** | [Nom du parcours PRD — section 4.X] |
| **Statut** | ⬜ Draft / 🟢 Ready / 🔵 In Progress / ✅ Done |
| **Priorité** | Must / Should / Could |
| **Référence UI** | _Fichier JSX, lien Figma, wireframe, description texte, ou N/A_ |
| **Conventions** | auth, database, forms, security (tags depuis `.method/conventions/_index.md`) |
| **Estimation** | S / M / L |

## Contexte

<!-- Pourquoi cette story existe. Quel problème elle résout. -->

**Refs :**
- PRD : FR-XXX-01, FR-XXX-02 (parcours [X])
- Conception : `docs/conception/<sujet>.md`
- Référence UI : _(voir champ Meta — si applicable)_

## Critères d'acceptation

<!-- Format Given/When/Then. Chaque AC doit être vérifiable par un test. -->

- [ ] **Given** [contexte] **When** [action] **Then** [résultat attendu]
- [ ] **Given** [contexte] **When** [action] **Then** [résultat attendu]

## Implémentation

### Fichiers à créer
<!-- Liste avec le chemin complet -->
- `src/...`

### Fichiers à modifier
- `src/...`

### Patterns à suivre
- Voir `.method/conventions/coding-standards.md` — section [X]
- Voir `.method/conventions/api-patterns.md` — section [X]

## Rayon d'impact

<!-- Obligatoire dès l'échelle Standard (CLAUDE.md § Avant de coder). Chaque item est
     observable : une commande citée, un verdict écrit. « Rien » se prouve, ne s'affirme pas. -->

### Appelants
<!-- Par fonction / table / colonne / composant / Server Action modifié : commande de recherche
     (chemin absolu), usages trouvés, ce qui change pour chacun. « Aucun autre appelant » se
     prouve par la commande. -->
- `nom` — `rg "nom" <racine du dépôt>/src` → [n] usages : …

### Doublons
<!-- Ce qui fait déjà la même chose : .method/conventions/component-registry.md + recherche sur
     le concept. Verdict : réutiliser / fusionner / laisser, et pourquoi. -->
- …

### Effet produit
<!-- Quel parcours voit une différence hors de l'écran modifié : autre route ou layout partagé,
     Server Action appelée ailleurs, policy RLS, webhook ou cron, email transactionnel,
     export / sitemap / SEO. Un projet dérivé remplace cette liste par ses propres systèmes
     (CLAUDE.md § Projet). « Aucun » avec la raison. -->
- …

### Refacto
<!-- Proposé ou écarté, écrit. Proposé ⇒ question posée via AskUserQuestion, avec le coût et ce
     qui se passe sans lui. Jamais fait sans accord, jamais tu. -->
- …

## Tests attendus

### Unit tests
- [ ] <!-- Décrire chaque test unitaire attendu -->

### Integration tests
- [ ] <!-- Décrire chaque test d'intégration attendu -->

### E2E tests (si applicable)
- [ ] <!-- Décrire chaque test E2E attendu -->

## Post-implémentation

<!-- Rempli APRÈS le dev par /dev -->

### Écarts avec la référence UI
<!-- Lister les écarts entre l'implémentation et la référence UI, et pourquoi -->
<!-- Si Référence UI = N/A, supprimer cette section -->

### Écarts avec la conception
<!-- Si un invariant a été modifié → document de conception du sujet révisé ? -->

### Composants créés
<!-- Lister pour ajout au component-registry -->
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|

### Notes
<!-- Observations, dette technique identifiée, suggestions -->
