# Story E11-S16 — `context` à l'échelle : l'assistant arbitre entre les candidates, une nouveauté par contenu, des procédures utiles plus courtes

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | 4.2 Faire (la phrase trouve sa procédure) |
| **Statut** | 🟢 Ready |
| **Priorité** | Should |
| **Référence UI** | N/A : aucun écran ; texte servi à l'assistant par `context` (`mcp-patterns.md`) |
| **Conventions** | security, supabase, registry, mcp, testing |
| **Estimation** | M (lot a : consignes et candidates du bloc code ; lot b : nouveautés ; lot c : procédures utiles) |
| **Dépend de** | E11-S04 (✅, routage des procédures) |
| **Porteuse de migration** | Non : ni table ni fonction SQL touchée ; le lot b dédoublonne dans le service |

## Contexte

Test en direct sur Démo (2026-09-30), espace Privé : 60 procédures fictives d'une entreprise de services, dont des
voisines volontaires, et 20 documents, 171 phrases passées à `demo_context`. Formulations des résumés : 118/120
servies ; paraphrases : 6/25 servies, la bonne en premier candidat pour 21/25 et parmi les trois premiers pour 24/25
(fichiers de résultats du test, relus) ; précision 134/135. La seule procédure
mal servie : « Peux-tu relancer les clients qui n'ont pas répondu à nos devis ? » sert la relance des tickets, dont le
résumé porte « relance les clients qui n'ont pas répondu » ; « devis », absent de ce résumé, ne le pénalise pas, et
la racinisation sépare « répondu » de « réponse ». Sur base jetable, sans bonus d'usage, la phrase du jeu Acme
« relance les clients qui n'ont pas répondu à leur devis » sert la même voisine à 0,70.

Le score reste lexical ; l'assistant qui lit le texte départage « Relancer les devis » et « Relancer les tickets »
sans peine. Aujourd'hui il ne le fait pas : la procédure servie arrive avec « Follow these steps now » et ses voisines
par chemin et score seulement ; sous le seuil, trois candidates par chemin et, pour une action, « Ask the user which
one to run; do not guess » (H37). Décision de JB (2026-09-30) : **l'assistant choisit** parmi trois candidates
montrées avec titre et résumé, vérifie la procédure servie, et ne demande que si aucune ne convient.

Même test : les nouveautés servent une ligne par version ; un document réécrit cinq fois prend cinq des dix lignes. Et
« Procedures you can run » sert chaque procédure par son résumé : les 40 premières du jeu à l'échelle coûtent 6 836
caractères à chaque conversation. Décision de JB : les 15 plus utilisées par leur résumé, les suivantes par leur
titre, 60 lignes au plus comme avant.

**Refs :**
- PRD : FR-TASK (parcours 4.2), FR-CONC-04 (nouveautés)
- Architecture : § MCP, `context`
- Hypothèses remplacées : H37 (consigne sans procédure servie), HN-E11S04-6 (demande polie), H35 (lignes des procédures utiles)

## Périmètre

Lot a : le bloc code de `context` (`server/context/blocks/code.ts`) et le nombre de candidates. Lot b : le bloc des
nouveautés (`server/context/blocks/news.ts`). Lot c : le bloc des procédures utiles (`server/context/blocks/procedures.ts`). Seuil, écart, poids et bonus du routage inchangés (H40).

## Hors périmètre

- Le calcul du score (`route_candidates`, poids, bonus) : option écartée par JB au profit de l'arbitrage par l'assistant.
- Une ligne « … and N more » des nouveautés : aucun outil ne liste les nouveautés au-delà des dix, le pointeur
  n'aurait pas de cible ; l'écran du Contexte (`ui/contexte/`, en cours d'édition par E11-S15) devrait en plus
  apprendre à la lire. Rouvrable avec un outil qui liste l'historique.

## Critères d'acceptation

### Lot a — l'assistant arbitre

- [ ] **AC-a1** — **Given** une phrase et au moins une candidate de score ≥ 0,30 **When** `context` route **Then** jusqu'à
  **3** candidates sont montrées (`CANDIDATES_SHOWN` = 3), chacune sur sa ligne `- <chemin> — <titre>: <résumé> (<score>)`,
  et `structuredContent.candidates` en compte autant.
- [ ] **AC-a2** — **Given** une procédure servie **When** `context` répond **Then** la ligne du routage dit que ses étapes
  suivent si la demande porte bien sur elle (son titre cité), liste les autres candidates (AC-a1) et dit, si la demande
  porte sur l'une d'elles, de ne pas suivre les étapes servies mais de lire celle-là avec `<p>_read` et de la suivre.
  La phrase « how » (expliquer sans exécuter) reste ajoutée.
- [ ] **AC-a3** — **Given** aucune procédure servie et des candidates, quel que soit le genre de la phrase **When**
  `context` répond **Then** une seule consigne neutre suit la liste : ce sont les procédures les plus proches ; lire
  avec `<p>_read` celle qui correspond à la demande, s'il y en a une ; sinon chercher avec `<p>_find` ou demander à
  l'utilisateur. Plus de consigne par genre (`action`, `request`, `how`, `data`) : l'assistant juge (décision de JB).
- [ ] **AC-a4** — **Given** les règles de l'espace **When** `context` les sert **Then** la règle du routage ne dit plus
  « ask the user rather than guess » mais renvoie aux candidates : suivre les étapes servies, sinon prendre la
  candidate qui correspond, ou chercher, et demander quand rien ne correspond. Le nombre de règles est inchangé.
- [ ] **AC-a5** — **Given** une question de données **When** `context` répond **Then** `structuredContent.data_question`
  reste servi tel qu'aujourd'hui (E11-S04) ; seul le texte de la consigne change (AC-a3).
- [ ] **AC-a6** — **Given** le jeu « à l'échelle » (60 procédures, `tests/integration/fixtures/scale-routing.cases.ts`)
  **When** chaque phrase est routée au réglage par défaut **Then** ≥ 95 % des formulations sont servies, et chaque
  phrase à procédure attendue a cette procédure parmi les candidates montrées, sauf celles marquées hors de portée du
  lexique (score imprimé).

### Lot b — une nouveauté par contenu

- [ ] **AC-b1** — **Given** plusieurs versions publiées d'un même contenu depuis la borne **When** `context` sert les
  nouveautés **Then** une seule ligne le dit, celle de sa dernière version, et les dix lignes vont à dix contenus
  (ou activations) distincts, les plus récents d'abord.

### Lot c — procédures utiles plus courtes

- [ ] **AC-c1** — **Given** plus de 15 procédures lisibles **When** `context` sert « Procedures you can run » **Then** les
  15 premières dans l'ordre d'usage gardent leur ligne `- <chemin>: <résumé>`, les suivantes `- <chemin>: <titre>`,
  60 lignes au plus, puis la ligne qui compte les autres ; le format reste celui que relit l'écran du Contexte.

## Implémentation

### Fichiers à modifier
- `packages/plateforme/server/routing.ts` — `CANDIDATES_SHOWN` = 3.
- `packages/plateforme/server/context/blocks/procedures.ts` — titre lu, 15 lignes par résumé puis par titre (AC-c1).
- `packages/plateforme/server/context/blocks/code.ts` — lignes des candidates, consignes, règle du routage (AC-a2 à AC-a4).
- `packages/plateforme/server/context/blocks/news.ts` — `versionsSince` garde la plus récente version par nœud.
- `tests/unit/context-blocks.test.ts`, `tests/unit/routing.test.ts`, `tests/unit/context-engine.test.ts` — textes
  du bloc code, budget de la coupe ; `e05s12-texte-servi.test.ts`, `e05s13-lignes-servies.test.ts` — titres des procédures.
- `tests/integration/routing.test.ts`, `tests/integration/fixtures/scale-routing.cases.ts` — jeu à l'échelle (AC-a6).
- `docs/decisions/ADR-003-routage-lexical-sans-ia-serveur.md` § 2 (amendement), `docs/prd.md` (même passage),
  `docs/decisions/hypotheses.md` (H35, H37, HN-E11S04-6), `docs/mcp-golden-queries.md` (R2, R3, QP-I5, TD4, TD5).

### Patterns à suivre
- `mcp-patterns.md` : textes servis courts, consigne qui dit quoi faire ensuite.

## Rayon d'impact

### Appelants
- `CANDIDATES_SHOWN` — `rg -n "CANDIDATES_SHOWN" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests C:/apps/oto-pkg/src` →
  `server/context/index.ts:65` (routage de `context` : 3 candidates, montrées et en données, comme avant) ;
  `tests/integration/routing.test.ts` (jeux todo et échelle : `shown` lit 3 candidates, « premier candidat » inchangé) ;
  `tests/integration/pilot-qualification.test.ts:103` (lit le score et le rang de la procédure du pilote : inchangés).
- `codeBlock` — `rg -n "codeBlock\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests` → `server/context/index.ts:160`
  (seul appelant : `context` et son aperçu) ; `tests/unit/context-blocks.test.ts` l. 149-214 (textes attendus, à réécrire).
- `newsItems` / `newsBlock` — `rg -n "newsItems\(|newsBlock\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests` →
  `server/context/index.ts:153` ; `tests/integration/context-blocks-sql.test.ts:48` (requête inchangée) ;
  `tests/unit/context-blocks.test.ts`, `e05s13-lignes-servies.test.ts`, `e05s12-texte-servi.test.ts` (format des lignes inchangé).
- `proceduresText` / `proceduresBlock` — `rg -n "proceduresText|proceduresBlock" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests C:/apps/oto-pkg/src`
  → `server/context/index.ts:154` ; tests `context-blocks`, `context-blocks-sql`, `e05s12-activites-sql` (ordre des
  chemins, inchangé), `e05s12-texte-servi`, `e05s13-lignes-servies` (entrées complétées d'un titre). `usefulProcedures`
  (accueil) lit déjà le titre, inchangée.
- `previewContext` (écrans `/context`, `/n/…`, `/admin/organization`) : même assemblage, le texte montré suit.

### Doublons
- `rg -n "offer the user|Ask the user which" C:/apps/oto-pkg/packages` → seul `code.ts` porte les consignes du
  routage : réutiliser, modifier sur place.

### Effet produit
- Liste d'outils MCP : inchangée (ADR-002) ; le texte de `context` change (consignes, candidates par titre et résumé,
  procédures utiles au-delà de 15 par titre).
- Écran du Contexte (`ui/contexte/parties-du-contexte.ts`) : il relit les blocs nouveautés, procédures, récents, pas
  le bloc code ; format des lignes de nouveautés et de procédures inchangé (une ligne par titre se lit comme une ligne
  par résumé) : aucun effet.
- Journal et bonus d'usage : la cible reste la procédure servie ou la phrase.

### Refacto
- Écarté : rien à extraire, deux fonctions de `code.ts` réécrites.

## Tests attendus

### Unit tests
- [ ] `context-blocks.test.ts` : lignes des candidates (titre, résumé, score) ; consigne servie (AC-a2) ; une seule
  consigne sans procédure servie, pour chaque genre de phrase (AC-a3).
- [ ] `context-blocks.test.ts` : nouveautés, huit versions d'un même nœud → une ligne, la dernière ; dix nœuds
  distincts, le onzième coupé (AC-b1), sur la base réelle.
- [ ] `routing.test.ts` (unit, AC7) : quatre candidates au-dessus de 0,30, trois montrées par titre et résumé, en texte
  et en données.
- [ ] `context-blocks.test.ts` : 70 procédures, les 15 premières par résumé, les 45 suivantes par titre, puis le
  décompte (AC-c1), sur la base réelle.

### Integration tests
- [ ] `routing.test.ts`, jeu à l'échelle (AC-a6).

## Hypothèses

- **H-a1 (AC-a2, AC-a3).** Décision de JB : remonter le contexte et les procédures pertinentes, sans trop contraindre
  l'assistant, qui juge si la phrase est un ordre, une question ou une demande d'explication. Seule garde gardée : une
  procédure servie sur une phrase « comment » garde « explain these steps, and run them only if the user asks »
  (E11-S04), qui évite d'exécuter ce qu'on demandait seulement d'expliquer.
- **H-a2 (AC-a1).** Trois, décision de JB : sur le test en direct, la bonne procédure est dans les trois premières pour
  24 paraphrases sur 25 ; sur le jeu à l'échelle joué avec cinq, aucune au rang 4 ou 5. Au-delà, le bloc « Procedures
  you can run » les liste déjà.

## Post-implémentation

### Écarts avec l'architecture
- ADR-003 § 2 amendé (consigne unique, trois candidates par titre et résumé) ; `docs/prd.md` aligné ; H35 et H37
  amendées, HN-E11S04-6 remplacée.

### Composants créés
Aucun : `candidateLines` remplace `candidateList` dans `code.ts`, `unmatchedInstruction` retirée.

### Notes
- Mutations (`mutations.mjs` du bloc-notes de la session : copie, mutation, test ciblé, fichier rendu dans un
  `finally`, empreinte comparée, témoin vert avant chacune) : dédoublonnage des nouveautés retiré, puis plus ancienne
  version gardée → « what's new » rouge ; `CANDIDATES_SHOWN` à 2, puis à 4 → jeu à l'échelle rouge ;
  `PROCEDURES_WITH_SUMMARY` à 14, puis à 16 → test des 70 procédures rouge.
- Mesures du jeu à l'échelle (base jetable, sans bonus, ligne « [routage échelle] » du test, trois montrées) :
  formulations 118/120 servies ; paraphrases 5/26 servies, 22/26 en tête, 24/26 parmi les trois montrées ; hors de portée du lexique : « lien suspect », « renvoyer son imprimante ».
- Budget du test de coupe de `context-engine.test.ts` porté de 4 800 à 5 800 : les autres candidates d'une procédure
  servie, par titre et résumé, allongent le bloc code (taille non mesurée ; 5 800 tient le code et la procédure).
- Golden queries R2, R3, QP-I5, TD4, TD5 réécrites, à rejouer sur claude.ai et ChatGPT après publication.
