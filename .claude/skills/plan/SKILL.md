---
name: plan
description: "Cadrage produit : brief, PRD par parcours, documents de conception, design, issues et stories. Quatre niveaux — refus, story seule, évolution ciblée, initial."
when_to_use: "Uniquement sur invocation explicite de l'utilisateur (/plan). Face à un besoin produit large exprimé autrement, PROPOSER un cadrage et attendre l'accord — un cadrage réécrit PRD, conception et stories."
disable-model-invocation: true
argument-hint: "[scope / version optionnels]"
---

# plan — Cadrage

Un dialogue qui produit les documents de cadrage. Pas un formulaire, pas un pipeline
obligatoire : **une liste d'artefacts dont seuls les manquants ou les impactés sont produits.**

> **RÈGLE CRITIQUE — zéro code, zéro commande système.**
> Ce skill ne modifie que des Markdown dans `docs/` et `.method/sprint/` ; les issues GitHub se
> proposent, et ne se créent qu'avec l'accord de JB (`CLAUDE.md § Projet`). Interdit pendant un
> cadrage : installer des dépendances, créer/modifier `.ts` `.tsx` `.js` `.css` `.json`, lancer
> un build/lint/test, créer des dossiers dans `src/`,
> `supabase/`, `.github/`. L'installation technique est faite par `dev`, dans la story de setup.

## Étape 0 — Choisir le niveau (ou refuser)

Regarder ce qui existe déjà (`docs/produit/prd.md`, `docs/conception/`, `docs/produit/stories/`,
les issues ouvertes : `gh issue list`) et ce que la demande touche :

| Niveau | Quand | Ce qui est produit |
|--------|-------|--------------------|
| **Refus** | La demande tient en quelques fichiers, sans nouveau parcours ni changement de modèle de données | **Rien.** Le dire et basculer sur `dev`. |
| **Story seule** | `dev` a détecté l'échelle Module et l'utilisateur a accepté une story — mais le parcours existe déjà au PRD | **Une story**, rien d'autre |
| **Évolution** | `docs/produit/prd.md` est rempli et la demande ouvre ou modifie un parcours | Le parcours concerné + la cascade réellement impactée |
| **Initial** | `docs/produit/prd.md` absent, vide ou placeholder | La chaîne complète |

**Story seule** est le niveau attendu quand `dev` propose « je cadre une story d'abord » :
écrire la story dans `docs/produit/stories/<sujet>.md`, nommée par sujet, depuis
`.method/templates/story.tmpl.md` — AC en Given/When/Then, fichiers à
créer, tests attendus, tags `Conventions`, **rayon d'impact** (appelants avec commande citée,
doublons, effet produit, refacto proposé ou écarté — `CLAUDE.md § Avant de coder`) — **sans
toucher au PRD ni à la conception**. Gate réduit à `.method/checklists/story-ready.md`. L'issue
qui porte le chantier reçoit le chemin de la story dans son corps (la story ne cite jamais
l'issue). Puis **rendre la main à `dev`** sur cette issue.

Tout arbitrage rencontré pendant le cadrage — produit, périmètre, refacto — se pose via
`AskUserQuestion` avec le contexte pour trancher, **avant** d'écrire la décision dans un
document. Un cadrage qui tranche en prose fige un choix que personne n'a validé, et le document
le rend ensuite vrai pour toutes les sessions suivantes.

Ne jamais déclencher une évolution de PRD complète pour une demande qui n'ouvre pas de parcours :
c'est le piège qui rend la proposition de story dissuasive.

**Le refus est une issue normale, pas un échec.** Formuler :
> « Ça ne mérite pas un cadrage : pas de nouveau parcours, pas de changement de modèle de
> données. Je passe directement en implémentation — dis-moi si tu veux une story quand même. »

En **Évolution**, confirmer avant d'écrire :
> « `docs/produit/prd.md` est déjà rempli. Je fais évoluer le parcours [X] et je cascade sur ce qui est
> réellement impacté — je ne recrée rien. OK ? »

### Règles absolues en Évolution

1. **Jamais de réécriture** d'un document existant — Edit, pas Write
2. Préserver le contenu existant sauf demande explicite
3. **Document de conception du sujet révisé** dans `docs/conception/` pour tout invariant touché
   (structure, sécurité, modèle de données) : corps corrigé en place, ligne d'historique datée
   (`CLAUDE.md § Documents de conception vivants`)
4. Stories et issues existantes non retouchées, sauf si leur scope change
5. Passer `.method/checklists/prd-evolution.md` en plus du readiness-gate

## Les artefacts

Produire **uniquement** ceux qui manquent ou que la demande impacte. Pour chacun, dire
explicitement s'il est produit, mis à jour, ou volontairement laissé de côté.

### `docs/produit/brief.md` — comprendre le problème

Quel problème, pour qui, pourquoi maintenant · personas (nom/rôle/besoin/frustration) · scope
MVP IN/OUT explicites · contraintes (techniques, business, légales, RGPD) · KPIs concrets ·
risques. Quantifier la douleur : « perd 2h/semaine » > « c'est lent ».

En Évolution : ajouter une section de version, ne pas réécrire l'existant.
→ `.method/templates/brief.tmpl.md`

### `docs/produit/prd.md` — le PRD par parcours

Un parcours = un objectif utilisateur complet. Pour chacun : flow Mermaid · écrans · FR
`FR-[PARCOURS]-[XX]` avec priorité MoSCoW et AC en Given/When/Then · NFR liés.

Cohérence à vérifier : chaque FR a une référence UI (maquette, description **ou `N/A`**) ·
chaque écran est dans un flow · max 60 % de Must · chaque FR est testable.

En Évolution : les nouvelles sections sont marquées 🔶 Draft, les parcours existants intacts.
→ `.method/templates/prd.tmpl.md`

### `docs/conception/` — la conception, un document par sujet

Pour chaque sujet que la demande touche, le document existant s'enrichit ; un sujet nouveau
ouvre un document (`.method/templates/conception.tmpl.md`) et une ligne de la table de
`docs/conception/README.md`. Modèle de données (Mermaid ER), RLS par table, Server Actions par
parcours, points de performance : le pourquoi dans la conception, ce qui se consulte (tables,
fonctions, routes) dans `docs/reference/`. Commencer simple. RLS dès le jour 1. Un schema Zod =
une source de vérité.

→ `CLAUDE.md § Documents de conception vivants` · consulter `.method/conventions/_index.md`

### `docs/design/` — le design

Trois situations, toutes valides :

- **Maquettes fournies** → vérifier qu'un fichier existe pour chaque écran du PRD, signaler les
  manquants, mettre à jour `docs/design/screens/_index.md` et `components/_index.md`
- **Pas de maquettes, design system à personnaliser** → questions ciblées (couleur primaire,
  secondaire, font, style) → mettre à jour `docs/design/system.md`. Les fichiers de code
  (`globals.css`, `tailwind.config.ts`) seront modifiés par `dev` à la story de setup
- **Pas de maquettes, design system par défaut** → ne rien faire, le dire, passer à la suite

L'absence de maquette n'est jamais un blocage : les stories portent alors une description
textuelle ou `N/A`.

### Issues et `docs/produit/stories/` — le découpage

Une épic est une issue parente (type Feature, corps depuis `.method/templates/epic.tmpl.md`),
référençant son parcours ; ses chantiers sont des sous-issues (type, étiquettes `area: …`,
jalon). Une story (`.method/templates/story.tmpl.md`, contexte, AC Given/When/Then, fichiers à
créer, tests attendus, référence UI) ne s'écrit que si l'issue ne suffit pas : fichier
`docs/produit/stories/<sujet>.md`, chemin porté par le corps de l'issue (`CLAUDE.md § Issues et
stories`). Les issues se proposent en liste et ne se créent qu'avec l'accord de JB.

Chaque story déclare ses tags `Conventions` (liste dans `.method/conventions/_index.md`). Ils
s'ajoutent aux tags déduits des globs au moment du dev — les déclarer sert à couvrir ce que les
chemins de fichiers ne révèlent pas encore.

Ordonner par dépendance et priorité. Une story = un déploiement possible. Taille S/M/L, pas XL.

En Évolution : **uniquement les nouvelles** issues et stories.

### Socle installé

Base de données, authentification et canal MCP sont installés (paquet et hôte de référence) :
aucune story de setup à prévoir. Une demande qui touche la surface MCP (outil, description,
résultat) lit `.method/conventions/mcp-patterns.md` et passe `.method/checklists/mcp-design.md`
pendant le PRD (phrases réelles des utilisateurs, une fiche par outil, golden queries dans
`docs/reference/mcp-golden-queries.md`, depuis `.method/templates/mcp-golden-queries.tmpl.md` s'il manque) ;
la liste des six outils est figée, ajout seulement (ADR-002).

## Gate de sortie

Passer `.method/checklists/readiness-gate.md` (+ `prd-evolution.md` en Évolution). Vérifier la
cohérence PRD ↔ conception ↔ design ↔ issues et stories. Si KO, corriger avant de clore.

Initialiser ou mettre à jour `.method/sprint/status.md` : dates, epic focus, stories
sélectionnées. Puis résumer : ce qui a été produit, ce qui a été volontairement laissé de côté,
et la première story à implémenter.

**Rendre la main explicitement.** Un cadrage ne se termine pas sur un document : il se termine
sur une phrase qui relance l'implémentation, sinon la session s'arrête là et l'utilisateur doit
relancer à la main.

> « Cadrage terminé. Je reprends en `dev` sur l'issue `#<n>` — conventions rechargées par globs
> plus les tags déclarés dans sa story. »
