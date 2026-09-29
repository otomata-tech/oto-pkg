# Story E11-S04 — Routage des procédures : questions « comment », égalités, formulations du résumé, fautes de frappe

## Meta

| Champ | Valeur |
|-------|--------|
| **Epic** | E11 — Retours de la démo |
| **Parcours** | 4.2 Faire (la phrase trouve sa procédure) |
| **Statut** | 🟢 Ready |
| **Priorité** | Should |
| **Vague** | E11, sans ordre imposé par E10 ; sa migration est réunie dans celle de 1.0.1 (fiches D131, D124) |
| **Référence UI** | N/A : aucun écran ; texte servi à l'assistant par `context` (`mcp-patterns.md`) |
| **Conventions** | database, supabase, security, registry, mcp, testing |
| **Estimation** | L (trois lots séquentiels : a SQL M, Ⓜ, `route_candidates` et `search_content` recréées sur `lexicon_fix` ; b service M ; c mesures S) |
| **Dépend de** | — (epic E11) |
| **Porteuse de migration** | **Oui** (Ⓜ) : fonction d'aide `platform.lexicon_fix` ; `platform.route_candidates` remplacée ; `platform.search_content` recréée sur la fonction d'aide, corbeille exclue avant la coupe (M58), le reste inchangé |

## Contexte

FB-0004, rapport de tests d'un assistant sur l'organisation Démo : une todo multi-projets, quatre
procédures (« Ajouter une tâche », « Voir mes tâches », « Mettre à jour une tâche », « Créer un
nouveau projet »). « passe la 1 en fait » sert « Mettre à jour » (0,80). Mais « ma todo » met trois
procédures à égalité (0,81) ; « crée le projet X » (0,59) et « qu'est-ce que j'ai à faire
aujourd'hui ? » (0,63, traité comme question) restent sans étapes ; « note que je dois relancer <un
client>… » vaut 0,36 ; « créé une tâcje pour essayer » ne trouve rien, puis 0,42.

Ce qui l'explique dans le code (paquet `packages/plateforme/`, MIG =
`migrations/20260928100000_platform_base_v1.sql`) :

- `route_candidates` (MIG l. 1465-1539) rend `s_summary` = `greatest(similarity, word_similarity(q, résumé))`
  (l. 1523-1524) : toute demande contenue dans le résumé vaut 1. Trois résumés qui contiennent « ma
  todo » sont à égalité, même quand l'un porte « ma todo » comme formulation.
- `lexical` (l. 1527-1529) compte la part des lexèmes de la demande présents dans le titre et le
  résumé réunis, chacun pesant 1 : un mot que toutes les candidates portent (« projet ») pèse autant
  qu'un mot qui les distingue.
- Une formulation courte contenue dans une demande longue (« note que je dois » dans « note que je
  dois relancer… ») n'est pas vue : seul le titre est cherché dans la demande (l. 1525-1526).
- Aucune faute n'est corrigée, alors que `search_content` le fait par le lexique (MIG l. 1600-1620,
  HN-E01S13-1).
- `server/routing.ts` l. 68-72 mélange `0,55·max(s_summary, s_title) + 0,45·lexical`, amorti sous
  deux lexèmes ; bonus l. 75-77 ; décision l. 84-89 au seuil 0,65 et à l'écart 0,1 (l. 25-26,
  réglables par organisation, l. 120-122).
- `isDataQuestion` (l. 159-170) range « comment… » et toute phrase finie par « ? » parmi les
  questions de données. `routingLine` (`server/context/blocks/code.ts` l. 56-72) leur répond « search
  with find… and answer it; do not ask which procedure to run », sans proposer les candidates.
- M58 (`.method/sprint/status.md`) : `route_candidates` et `search_content` n'excluent pas la
  corbeille avant la coupe à 50 lignes (`found_nodes` de `search_content`, MIG l. 1669-1677, ne
  filtre que `status` et `parent_id`) ; le service la retire après (`server/access-facts.ts` l. 97).

Limite déjà mesurée : « Paraphrases servies : 4 sur 13 », QP-D2 à 0,58
(`docs/mcp-golden-queries.md` l. 185). ADR-003 § Conséquences négatives nomme les paraphrases et les
procédures proches. ADR-003 tient : ni embedding, ni dictionnaire de vocabulaire, ni IA serveur.
Les seuils sont flexibles sans ADR (`docs/architecture.md` l. 448-449) ; les poids du mélange ne
sont fixés ni par ADR-003 ni par l'architecture.

**Refs :**
- PRD : FR-TASK-01, FR-TASK-03, FR-TASK-06 (correction par le lexique) ; § 8, « Reconnaissance sans
  host » (≥ 95 % des formulations, 0 négative)
- ADR-003 § 1-3 ; `docs/architecture.md` l. 225 (`route_candidates`), l. 285 (`routing.ts`)
- Décision du responsable d'Oto, 2026-09-29 (préambule E11, point 8) : routage amélioré dans le
  service et en SQL, sans embeddings

## Périmètre

- En SQL : formulations du résumé cherchées une à une, titre compté à part, poids des mots rares,
  correction des fautes par le lexique, corbeille exclue avant la coupe (M58). La correction s'écrit
  une fois, dans `platform.lexicon_fix`, que `search_content` appelle aussi ; `search_content`
  recréée exclut aussi la corbeille avant sa coupe (M58), seul effet voulu sur `find` (AC-a8).
- Dans le service : mélange recalibré, questions « comment » et demandes polies ; sans étapes
  servies, la consigne propose toujours toutes les candidates montrées (jusqu'à `CANDIDATES_SHOWN`,
  3), jamais la première seule.
- Un jeu de phrases « todo » rejoué sans host, et la non-régression des jeux existants.

## Hors périmètre

- Embeddings, synonymes, dictionnaire : ADR-003 (epic E11, OUT).
- Seuil et écart par défaut (0,65 ; 0,1) : inchangés (HN-E11S04-2).
- `search_content` : ses passes, son rang, son dernier mot cherché par préfixe ; seules changent sa
  correction, qui passe par `lexicon_fix`, et l'exclusion de la corbeille (AC-a8, HN-E11S04-4,
  HN-E11S04-9).
- Score d'une phrase dans l'éditeur de procédure : V2 (FR-TASK-03).
- Liste d'outils, schémas d'entrée, champs de `structuredContent` : inchangés (ADR-002).

## Critères d'acceptation

### Lot a — `route_candidates` (SQL)

- [ ] **AC-a1 — Même porte.** **Given** la migration appliquée **When** on lit la fonction **Then**
  même nom, mêmes arguments, `security definer`, `search_path` vide, même contrôle d'appartenance,
  même niveau de lecture avant la coupe (E01-S13 AC-a2), `execute` à `authenticated` seul. Les
  colonnes rendues gagnent `s_phrase real` et `lexical_title real`. **And** un nœud à la corbeille
  (`deleted_at` non nul) n'est jamais présélectionné (M58). **And** le tri de la coupe devient
  `greatest(s_summary, s_title, s_phrase, lexical) desc, path`.
- [ ] **AC-a2 — Formulations.** **Given** un résumé **Then** il est découpé, avant normalisation,
  aux caractères `«`, `»`, `"`, `“`, `”`, `.`, `;`, `:`, `!`, `?` ; chaque morceau passe par
  `platform.norm_words` ; les morceaux vides sont écartés. `s_phrase` = le plus grand, sur les
  morceaux, de `greatest(similarity(morceau, q), word_similarity(morceau, q))` : 1 quand la demande
  est une formulation, ou quand une formulation est contenue dans la demande. **Test** : résumé
  « Montre les tâches à faire. Se demande : « ma todo », « montre mes tâches ». », demande « ma todo »
  → `s_phrase` = 1 ; résumé « Ajoute une tâche à ma todo, dans un projet. » → `s_phrase` < 0,6.
  `s_summary` et `s_title` gardent leur calcul.
- [ ] **AC-a3 — Mots rares.** **Given** les candidates lisibles d'un appel (`n` lignes avant la
  coupe) **Then** chaque lexème `l` de la demande pèse `w(l) = 1 + ln(n / df(l))`, `df(l)` étant le
  nombre de ces candidates qui le portent ; un lexème qu'aucune ne porte pèse 1. `lexical` = somme
  des poids des lexèmes portés par le nœud (titre et résumé) / somme des poids de tous les lexèmes de
  la demande. **Then** une demande dont le nœud porte tous les lexèmes vaut toujours 1 ; un mot que
  toutes portent pèse 1, comme avant. **Test** : trois candidates portent « projet », une seule
  « cre » : pour « crée le projet Alpha », la candidate qui porte les deux a un `lexical` plus grand
  que celles qui ne portent que « projet ».
- [ ] **AC-a4 — Titre à part.** `lexical_title` = le même calcul qu'AC-a3 sur les seuls lexèmes du
  titre (`to_tsvector('platform.fr', norm(title))`). **Test** : « crée le projet Alpha » →
  « Créer un nouveau projet » a `lexical_title` > 0, « Ajouter une tâche » a 0.
- [ ] **AC-a5 — Fautes de frappe.** **Given** un mot **Then** `platform.lexicon_fix(p_org, mot)` rend
  `null` si le mot n'est pas de 5 à 40 lettres (`^[a-z]{5,40}$`) ou si le lexique de l'organisation le
  porte ; sinon le mot du lexique le plus proche (similarité de trigrammes ≥ 0,3, puis écart de
  longueur, puis ordre alphabétique : la règle de MIG l. 1605-1615, sans l'exception du dernier mot,
  qui reste à `find`), ou `null`. `route_candidates` l'appelle sur chaque mot de la demande après
  `norm_words`. **Then** la demande corrigée
  (chaque mot remplacé par sa correction) entre dans la présélection ; chaque composante vaut le plus
  grand de son calcul sur la demande et sur la demande corrigée ; un lexème compte comme porté si le
  nœud porte le lexème ou celui de sa correction ; `query_lexemes` ne change pas. **Test** :
  « créé une tâcje pour essayer » présélectionne « Ajouter une tâche », dont `lexical` compte « tâche ».
- [ ] **AC-a6 — Rien de perdu.** **Given** les demandes de `tests/integration/route-candidates-index.test.ts`
  (AC-a1 d'E01-S13) **Then** chaque chemin que la fonction d'avant (fixture `route-candidates-avant.sql`)
  rend avec un score montré est aussi rendu par la nouvelle, hors corbeille. **And** le plan de
  `tests/sql/route-candidates-plan.sql` garde `idx_nodes_search_tsv`, `idx_nodes_title_trgm` et
  `idx_nodes_summary_trgm` ; la correction passe par `idx_lexicon_word_trgm`.
- [ ] **AC-a7 — Canaux.** *Fermé* : les poids d'AC-a3 ne comptent que les candidates que la personne
  lit ; un nœud illisible ne change aucun score (test : une procédure illisible qui porte le mot rare
  ne change pas le `lexical` rendu). *Ouvert, borné* : la correction choisit un mot dans tout le
  lexique de l'organisation (comme `find`) ; le mot corrigé n'est jamais rendu, et seules les
  candidates lisibles sortent (AC-a1). `platform.lexicon_fix` n'est exécutable par aucun rôle client
  (`revoke all … from public`, aucun `grant`) : seules `route_candidates` et `search_content`, qui
  s'exécutent sous leur propriétaire (`security definer`), l'appellent.
- [ ] **AC-a8 — `find` : la corbeille seule change.** **Given** la migration appliquée **When** on
  lit `search_content` **Then** même signature, même type rendu, mêmes attributs (`stable`,
  `security definer`, `search_path` vide, `pg_trgm.similarity_threshold` à 0,3) et mêmes privilèges
  qu'avant (recréée par `create or replace`, qui les garde). Deux changements, rien d'autre :
  - dans sa boucle (MIG l. 1600-1620), la sélection du mot proche, la forme du mot et son absence du
    lexique cèdent la place à `v_fix := platform.lexicon_fix(p_org, v_terms[i])`, appelée seulement
    quand l'exception du dernier mot (préfixe d'un mot connu, l. 1607-1609) ne joue pas ;
  - `found_nodes` (l. 1669-1677) gagne `and n.deleted_at is null` : un nœud à la corbeille, ni ses
    blocs, ne prend plus de place dans les `p_limit` lignes (M58).

  **Then** un nœud à la corbeille qui porte les termes n'est rendu ni par son titre, ni par son
  résumé, ni par ses blocs, et un nœud vivant moins bien classé prend sa place sous la coupe
  (**Test** nouveau, `p_limit => 1`, le nœud à la corbeille en tête sur la fonction actuelle, dans `search-content.test.ts`, écrit d'abord et vu échouer sur la fonction
  actuelle). **And** hors ce cas, les suites de `find` passent avec leurs attentes inchangées
  (garde-fou « changement sans effet observable », CLAUDE.md § Garde-fous conditionnels, sauf la
  corbeille) : `tests/integration/recherche-fautes.test.ts` (AC-b1 à AC-b8, AC-b10, fiche D19 A),
  `tests/integration/search-content.test.ts` (dont « grille tarifaier », AC27-AC28),
  `tests/integration/isolation/contenu.test.ts` (AC12), `tests/integration/org-transfer.test.ts`
  l. 395, `tests/unit/find.test.ts`, `tests/sql/search-content-plan.sql`. **Test** :
  `route-candidates-index.test.ts` lit `prosecdef`,
  `provolatile`, `proconfig` et `proacl` de `search_content` et de `lexicon_fix` : les valeurs
  ci-dessus, et `execute` à `authenticated` seul pour la première, à aucun rôle client pour la seconde.

### Lot b — Le service

- [ ] **AC-b1 — Mélange.** `blendScore` devient, comme point de départ à calibrer :
  `score = W.text·max(s_summary, s_title) + W.phrase·s_phrase + W.lexical·lex`, avec
  `lex = (0,75·lexical + 0,25·lexical_title) · min(1, query_lexemes / 2)`, `W = { text: 0,35,
  phrase: 0,25, lexical: 0,40 }`, borné à [0, 1]. Bonus, `SHOW_THRESHOLD`, `decide` et réglage par
  organisation inchangés. Les poids sont exportés (`WEIGHTS`) ; le dev peut les ajuster pour tenir
  AC-c1 et AC-c2, jamais le seuil ni l'écart (HN-E11S04-2). Les seuils `pg_trgm` de la fonction se
  recalculent sur ces poids (E01-S13 AC-a4 : le plus bas score montré sans lexème commun, bonus
  compris).
- [ ] **AC-b2 — Genre de la demande.** `requestKind(phrase)` rend, après `trim`, casse ignorée et
  `’` ramené à `'` :
  - `how` : la phrase commence par « comment » suivi d'une frontière de mot ;
  - `request` : elle commence par une formule de demande (liste fermée, HN-E11S04-12) : « peux-tu »,
    « pouvez-vous », « pourrais-tu », « pourriez-vous », « tu peux », « vous pouvez », « tu
    pourrais », « vous pourriez », « est-ce que tu peux », « est-ce que vous pouvez », « est-ce que tu
    pourrais », « est-ce que vous pourriez », « tu veux bien », « vous voulez bien » ;
  - `data` : sinon, la règle actuelle d'`isDataQuestion` sans « comment » ;
  - `action` : tout le reste.

  `isDataQuestion(phrase)` = `requestKind(phrase) === "data"`. **Test** : les listes actuelles
  d'`isDataQuestion` (`tests/unit/routing.test.ts` l. 108-131) gardent leur verdict ; « Comment je
  crée un projet ? » → `how` ; « Peux-tu ajouter une tâche ? » et « Est-ce que tu peux relancer les
  devis ? » → `request` ; « Est-ce qu'il reste des prospects » → `data`.
- [ ] **AC-b3 — Consigne.** **Given** `context` avec une phrase **Then** la dernière ligne du bloc
  `code` est, mot pour mot (`<p>` = préfixe ; `<list>` = la liste actuelle de `candidateList`,
  `code.ts` l. 51-53 : toutes les candidates montrées, de score ≥ 0,30, jusqu'à `CANDIDATES_SHOWN`,
  3, `server/routing.ts` l. 38) :
  - servie, `how` : la ligne actuelle, suivie de « It asks how: explain these steps, and run them only
    if the user asks. » ;
  - servie, `action`, `request` ou `data` : la ligne actuelle, inchangée (HN-E11S04-14) ;
  - non servie, au moins une candidate — la première sous le seuil, ou à moins de l'écart de la
    deuxième, même ligne —, selon le genre (HN-E11S04-6) :
    - `action` : la ligne actuelle, inchangée, qui propose déjà toutes les candidates :
      `Request « … »: no clear match. Candidates: <list>. Ask the user which one to run; do not guess.` ;
    - `how` : `Request « … »: no clear match. Candidates: <list>. It asks how to do something: offer
      the user all the candidates above as choices, read the one they pick with <p>_read and explain
      its steps; run nothing unless the user asks.` ;
    - `request` : `Request « … »: no clear match. Candidates: <list>. It asks for an action: offer the
      user all the candidates above as choices, and run only the one they pick, after their yes.` ;
    - `data` : `Request « … »: no clear match. Candidates: <list>. It is a question: answer it without
      changing data, searching with <p>_find, <p>_read or <p>_call table.rows; then offer the user all
      the candidates above as choices, and run one only if they pick it.` ;
  - aucune candidate, ou routage en panne : lignes actuelles (`how` et `request` sans candidate
    reprennent la ligne d'une action).

  Une seule candidate montrée : la même ligne, qui n'en propose qu'une, faute d'autres
  (HN-E11S04-15). **And** `structuredContent.data_question` garde son sens (`true` pour `data`
  seul) ; aucun champ ajouté (HN-E11S04-8).

### Lot c — Résultats mesurés sans host

- [ ] **AC-c1 — Jeu « todo ».** **Given** une organisation jetable, une personne membre, les quatre
  procédures du jeu (§ Jeu de phrases), sans bonus d'équipe ni d'usage, réglage par défaut **When**
  chaque phrase passe par `rankCandidates` puis `decide` **Then** :
  - « passe la 1 en fait » → servie : `todo/mettre_a_jour_une_tache` ;
  - « ma todo » → servie : `todo/voir_mes_taches` ;
  - « crée le projet Alpha » → servie : `todo/creer_un_projet` ;
  - « créé une tâcje pour essayer » → servie : `todo/ajouter_une_tache` (score ≥ 0,65) ;
  - « note que je dois relancer la Boulangerie des Tilleuls demain » → première candidate :
    `todo/ajouter_une_tache` (score imprimé), servie ou proposée avec les autres par la ligne d'une
    `action` ;
  - « qu'est-ce que j'ai à faire aujourd'hui ? » → `todo/voir_mes_taches` parmi les candidates
    montrées (au plus 3) ; servie, ou proposée avec les autres candidates par la consigne `data`
    d'AC-b3 ;
  - « comment je crée un projet ? » → `todo/creer_un_projet` parmi les candidates montrées ; servie
    avec la phrase `how`, ou proposée avec les autres par la consigne `how` ;
  - « quelle heure est-il ? » et « supprime le projet Alpha » → jamais servies.

  **And** sur la fonction et le mélange d'avant, le même test échoue sur « ma todo » (trois à égalité),
  « crée le projet Alpha » et « créé une tâcje » (non servies) : il est écrit d'abord.
- [ ] **AC-c2 — Non-régression.** Passent sans changer leurs attentes : `tests/integration/routing.test.ts`
  (Acme : ≥ 95 % des formulations servies, précision ≥ 95 %, aucune phrase servie sur la procédure
  qu'elle interdit) ; `tests/integration/pilot-qualification.test.ts` AC4 (formulations, titre, QP-D1
  et QP-D3 servies ; QP-D2 et QP-I1 en premier ; négatives, voisines et questions de données jamais
  servies) ; `tests/integration/feedback-prompts.test.ts` (N4 : le titre en tête, `s_title` 1) ;
  `tests/integration/search-content.test.ts` AC27-AC28 (droits). **And** les taux imprimés ne
  baissent pas : paraphrases du pilote ≥ 4 sur 13, paraphrases d'Acme au moins le taux d'avant. Le
  dev note les deux taux, avant et après, dans le rapport de revue. **And** si une cible d'AC-c1 ne
  s'obtient qu'au prix d'une de ces régressions, le dev s'arrête et remonte le choix.

## Jeu de phrases « todo »

`tests/integration/fixtures/todo-routing.cases.ts`. Titres du rapport ; résumés reconstitués
(HN-E11S04-1), chacun sous 200 caractères, procédures d'organisation (aucune équipe) :

- `todo/ajouter_une_tache`, « Ajouter une tâche » : « Ajoute une tâche à ma todo, dans un projet, avec
  son échéance. Se demande : « ajoute une tâche », « crée une tâche », « note que je dois ». »
- `todo/voir_mes_taches`, « Voir mes tâches » : « Montre les tâches à faire, par projet, les plus
  urgentes d'abord. Se demande : « ma todo », « montre mes tâches », « quoi de prévu ». »
- `todo/mettre_a_jour_une_tache`, « Mettre à jour une tâche » : « Change le statut, l'échéance ou le
  projet d'une tâche de ma todo. Se demande : « passe la 2 en fait », « décale la tâche à lundi ». »
- `todo/creer_un_projet`, « Créer un nouveau projet » : « Crée un projet de la todo pour y ranger des
  tâches. Se demande : « crée un projet », « nouveau projet ». »

Chaque procédure porte un bloc d'étapes minimal (un paragraphe), assez pour être servie.

## Implémentation

### Migrations prévues

`packages/plateforme/migrations/<horodatage>_route_candidates_formulations.sql`, additive, réunie
par le pilote dans la migration unique de 1.0.1 (HN-E11S04-11) :
- `create function platform.lexicon_fix(p_org uuid, p_word text) returns text`, `stable`,
  `search_path` vide, `set pg_trgm.similarity_threshold = '0.3'` (seuil sans paramètre,
  HN-E11S04-13) ; forme du mot, absence du lexique, puis la sélection de MIG l. 1610-1615 par
  l'opérateur `%` (index `idx_lexicon_word_trgm`) ; `revoke all … from public`, aucun `grant` ;
- `drop function if exists platform.route_candidates(uuid, text, text, integer)` suivi aussitôt de sa
  recréation (forme admise par `cli/migrations-check.mjs` l. 100, 142-151), puis `revoke all … from
  public` et `grant execute … to authenticated` ;
- `create or replace function platform.search_content(…)` : le texte de MIG l. 1541-1779 recopié,
  seules la boucle de correction et la condition de corbeille de `found_nodes` changées (AC-a8) ; signature et type rendu inchangés, donc ni `drop`
  ni privilège à rejouer (`create or replace` admis par `cli/migrations-check.mjs` l. 99) ;
- aucune table, colonne ni index nouveau.

### Schémas Zod

Aucun : ni entrée ni sortie d'outil ne change.

### Fichiers à créer

- `migrations/` : le fichier ci-dessus.
- `tests/integration/fixtures/todo-routing.cases.ts` : procédures et phrases du jeu « todo », attentes
  d'AC-c1.

### Fichiers à modifier

- `server/routing.ts` : `Components` (`s_phrase`, `lexical_title`), `WEIGHTS`, `blendScore`,
  `RouteRow` et la sélection de `routeRows` (l. 185-189), `requestKind` et `isDataQuestion`
  (l. 158-170), type `RequestKind` exporté.
- `server/context/blocks/code.ts` : `CodeBlockInput.dataQuestion` remplacé par `kind: RequestKind |
  null`, `routingLine` (l. 56-72).
- `server/context/index.ts` : `Routing.dataQuestion` → `kind` (l. 40-45, 76-77) ; `routingData`
  rend `data_question: kind === null ? null : kind === "data"` (l. 81-88).
- `server/database.ts` : type rendu de `route_candidates` (`pnpm db:types`).
- `tests/unit/routing.test.ts` : `blendScore` (l. 71-81), `requestKind` (l. 108-131).
- `tests/unit/context-blocks.test.ts` : appels de `codeBlock` (l. 145-186) et textes d'AC-b3 ; la
  ligne attendue d'une question avec candidates (l. 178) devient celle de `data`.
- `tests/unit/e05s13-lignes-servies.test.ts` l. 110, 115 : `kind: null` au lieu de `dataQuestion: null`.
- `tests/integration/routing.test.ts` : un `describe` du jeu « todo » (AC-c1).
- `tests/integration/route-candidates-index.test.ts` : AC-a1 comparé par chemin (l. 78-141), AC-a4
  recalculé (l. 199-205), un cas de corbeille (M58), un cas de canal fermé (AC-a7), les attributs de
  `search_content` et de `lexicon_fix` (AC-a8).
- `tests/integration/search-content.test.ts` l. 193 : `CANDIDATE_COLUMNS` + `s_phrase`, `lexical_title` ;
  un cas de corbeille pour `search_content` (AC-a8), écrit d'abord.
- Les suites de `find` (liste d'AC-a8) : lues avant le changement, aucune attente changée ; seul le
  cas de corbeille s'ajoute.
- `tests/sql/route-candidates-plan.sql` : l'index du lexique attendu dans le plan de la correction.

**Par le pilote, pas par le dev** : `docs/mcp-golden-queries.md` (§ Golden queries ci-dessous) ;
`docs/architecture.md` l. 194 (le lexique corrige `find` et le routage), l. 225 (formulations, mots
rares, correction), l. 226-227 (`lexicon_fix`, partagée) ; ADR-003 § 1, une phrase : « `context`
corrige aussi une faute de frappe par le lexique » ; amendement d'ADR-003 § 2 et de `docs/prd.md`
l. 251 : sans étapes servies, les candidates sont toujours proposées en choix, question de données
comprise, après la réponse (HN-E11S04-6) ; `docs/mcp-golden-queries.md` R3, I2, I3 (l. 80, 37, 38),
attendu amendé (§ Golden queries) ; `packages/plateforme/migrations/README.md` l. 303 (« seule
`search_content` le lit » → « seule `lexicon_fix` le lit ») ; `.method/sprint/status.md` : la ligne
M58 sort entièrement (les deux fonctions excluent la corbeille avant la coupe) ;
`packages/plateforme/CHANGELOG.md` § Hosts ; copie de la migration dans `supabase/migrations/`
(`oto-platform migrations sync`).

### Patterns à suivre

- `security-patterns.md § Droits dans le service` : le service garde `nodeLevels` après la fonction.
- `database-patterns.md` : fonction `security definer` à `search_path` vide, révocation à `public`.
- `mcp-patterns.md § 4` : consignes en anglais, courtes, qui disent quoi faire ensuite.
- `testing-strategy.md § Budget de tests` : une phrase par cas du rapport, pas de permutation.
- CLAUDE.md § Garde-fous conditionnels, pour `search_content` : suites lues avant, attentes
  identiques après, sauf le cas de corbeille ; correction d'un comportement (M58) : son test échoue
  d'abord.

## Rayon d'impact

### Appelants

- `route_candidates` : `rg -n "route_candidates" C:/apps/oto-pkg --glob "!**/node_modules/**" --glob "!.claude/**"`
  → service : `server/routing.ts` l. 186-188 (colonnes nommées : deux de plus) ; types :
  `server/database.ts` l. 1414-1433 ; tests : `route-candidates-index.test.ts` (compare à la fixture
  d'avant, lit `proconfig`), `search-content.test.ts` l. 31, 193, 560 (`select *`, colonnes comptées),
  `feedback-prompts.test.ts` l. 289 (`select *`, premier rang : le tri change), `pilot-qualification`
  et `routing.test.ts` (par `rankCandidates`) ; commentaires seuls : `server/access.ts` l. 5,
  `access-parity.test.ts` l. 9, `watch-db-sql.test.ts` l. 70 ; copie de l'hôte :
  `supabase/migrations/20260928100000_platform_base_v1.sql`. Aucun écran ne l'appelle.
- Mélange et genre : `rg -n "blendScore|WEIGHTS|SHOW_THRESHOLD|isDataQuestion|dataQuestion|data_question" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → `server/context/index.ts` l. 21, 76-77 ; `server/context/blocks/code.ts` l. 47 ;
  `route-candidates-index.test.ts` l. 12, 201 ; `unit/routing.test.ts` ; `unit/context-blocks.test.ts`
  (l. 145-186, 297-307, 789) ; `e05s13-lignes-servies.test.ts` l. 110, 115 ; `mcp-core.test.ts` l. 175
  (`data_question: false`, inchangé). Les doublures qui passent `dataQuestion` ne compilent plus :
  toutes listées ci-dessus.
- `codeBlock` : `rg -n "codeBlock\(" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests` → un appelant
  de production, `server/context/index.ts` l. 157 ; les tests ci-dessus.
- Texte de la consigne `data` : `rg -n "do not ask which procedure|which one to run" C:/apps/oto-pkg --glob "!**/node_modules/**" --glob "!.claude/**"`
  → `server/context/blocks/code.ts` l. 68, `tests/unit/context-blocks.test.ts` l. 174 (action,
  inchangée) et l. 178 (réécrite), `docs/mcp-golden-queries.md` l. 79 (R2, inchangée).
- `search_content` : `rg -n "search_content" C:/apps/oto-pkg/packages C:/apps/oto-pkg/tests`
  → un appelant de production, `server/find.ts` l. 171 (colonnes inchangées ; ses 50 lignes,
  `SEARCH_ROWS` l. 26, ne comptent plus de nœud à la corbeille, que `nodeLevels` l. 173 retirait
  après : `find` peut rendre des nœuds vivants qu'il perdait sous la coupe) ; doublures `watchDb` de
  `tests/unit/find.test.ts` l. 108 et `tests/unit/routing.test.ts` l. 171 (forme inchangée) ; appels
  SQL de `recherche-fautes.test.ts`, `search-content.test.ts`, `isolation/contenu.test.ts` l. 118,
  `org-transfer.test.ts` l. 395 (attentes inchangées, AC-a8 ; aucun ne met de nœud à la corbeille :
  `rg -n -i "corbeille|trash|deleted_at" C:/apps/oto-pkg/tests/integration/search-content.test.ts C:/apps/oto-pkg/tests/integration/recherche-fautes.test.ts C:/apps/oto-pkg/tests/unit/find.test.ts`
  ne trouve rien) ; commentaires seuls ailleurs. Le lexique : `rg -n "platform.lexicon" C:/apps/oto-pkg/packages/plateforme/migrations`
  → lu par la boucle de `search_content` seule, écrit par ses déclencheurs et `lexicon_rebuild`
  (inchangés).

### Doublons

- Correction par le lexique : `rg -n "platform.lexicon l" C:/apps/oto-pkg/packages/plateforme/migrations`
  → la boucle de `search_content` (MIG l. 1604-1620), seule autre occurrence. Verdict : fusionner.
  La règle s'écrit une fois dans `platform.lexicon_fix`, que `route_candidates` et `search_content`
  appellent ; l'exception du dernier mot reste propre à `find` (HN-E11S04-4, tranchée).
- Liste des candidates dans la consigne : `rg -n "candidateList" C:/apps/oto-pkg/packages/plateforme/server`
  → `code.ts` l. 51-53, déjà employée par les lignes servie et non servie. Verdict : réutiliser ; les
  trois consignes nouvelles la reprennent, aucune liste nouvelle.
- Découpe d'un texte en morceaux : `rg -n "regexp_split|string_to_array" C:/apps/oto-pkg/packages/plateforme/migrations`
  → `lexicon_words` et `search_content` coupent en mots, jamais en phrases. Verdict : laisser ; la
  découpe du résumé est propre au routage, en ligne dans la fonction.
- Registry : `rg -n "rankCandidates" C:/apps/oto-pkg/.method/conventions/component-registry.md` →
  l. 193 ; la ligne gagne `requestKind` et le mélange à trois parts (écrit en finalisation).

### Effet produit

- MCP : la dernière ligne du bloc `code` de `context` change pour les questions et les demandes
  polies sans étapes servies ; liste d'outils, schémas et champs inchangés. Golden queries à
  rejouer : R2, R3, I2, I3, QP-D2, QP-I1 à QP-I5, et les nouvelles. R3, I2 et I3 attendent
  aujourd'hui « aucune question sur la procédure » : quand des candidates sont montrées, leur attendu
  devient « réponse, puis les candidates proposées en choix ; aucune exécution sans choix »
  (HN-E11S04-6), écrit par le pilote ; sans candidate, la ligne et l'attendu ne changent pas. C'est
  un retour voulu sur E03-S02 (« do not ask which procedure to run »), validé par le responsable
  d'Oto le 2026-09-29 ; ADR-003 § 2 et `docs/prd.md` l. 251 s'amendent en conséquence.
- `find` : un seul effet, voulu (M58) : un nœud à la corbeille ne prend plus de place dans les 50
  lignes de `search_content` ; hors ce cas, mêmes lignes, même ordre (AC-a8).
- Schéma : Ⓜ, une fonction remplacée, une recréée (boucle de correction et corbeille), une
  ajoutée ; l'hôte copie et applique la migration de 1.0.1.
- Scores : toute organisation voit ses scores bouger ; un réglage `orgs.settings.routing` posé
  garde son sens (même échelle 0-1), pas sa calibration.
- Prompts MCP (FR-TASK-08) : leur message est le titre ; `feedback-prompts.test.ts` garde « titre en
  tête ».
- Aucun écran, aucune policy, aucun export.

### Refacto

- Proposé et accepté par le responsable d'Oto (2026-09-29, HN-E11S04-4) : recréer `search_content`
  pour qu'elle appelle `platform.lexicon_fix`. Coût : environ 240 lignes de plus dans la migration
  (MIG l. 1541-1779 recopiées) et `find` revalidé par ses suites existantes, attentes inchangées
  (AC-a8). Gain : la règle de correction écrite une fois ; sans lui, elle vivrait en deux endroits.
- Retenu par le responsable d'Oto (2026-09-29, HN-E11S04-9) : `search_content` recréée exclut aussi
  la corbeille avant sa coupe, ce qui solde M58. Coût : une condition, un test ; seul effet
  observable sur `find`, voulu.

## Hypothèses

- **HN-E11S04-1** : les résumés du jeu « todo » sont reconstitués ; le rapport ne garde que les titres
  et les scores. Ils reproduisent l'égalité de « ma todo » et les scores bas de « crée le projet X »
  et « tâcje » sur le code d'avant (AC-c1) (source : rapport de tests).
- **HN-E11S04-2** : seuil 0,65 et écart 0,1 inchangés ; seuls les poids du mélange se recalibrent,
  sans ADR (source : `docs/architecture.md` l. 448-449 ; ADR-003 ne fixe pas les poids).
- **HN-E11S04-3** : la correction est toujours tentée, en plus de la demande telle quelle, et non en
  dernier recours comme dans `find` ; mots de 5 à 40 lettres, seuil 0,3, sans l'exception du dernier
  mot (`find` cherche aussi par préfixe, le routage non) (source : HN-E01S13-1, simple).
- **HN-E11S04-4** (tranchée par le responsable d'Oto, 2026-09-29 : refacto accepté) : la correction
  s'écrit une fois, dans `platform.lexicon_fix` (forme du mot, absence du lexique, mot le plus
  proche) ; `search_content` est recréée sur elle dans la même migration. Son exception du dernier
  mot reste en ligne, propre à `find` (HN-E11S04-3). Conséquence : la correction de `find` ne
  change pas, prouvé par ses suites aux attentes inchangées (AC-a8) ; seule la corbeille change
  (HN-E11S04-9).
- **HN-E11S04-5** : les poids des mots rares se comptent sur les candidates lisibles de l'appel, pas
  sur toute l'organisation : aucun canal vers un nœud illisible, aucune lecture de plus (source :
  `security-patterns.md § Droits dans le service`, E01-S13 AC-a2).
- **HN-E11S04-6** (validée par le responsable d'Oto, 2026-09-29, avec un amendement, puis le retour
  sur E03-S02 validé le même jour : « toujours proposer » ; consigne : « il faut
  toujours proposer les X meilleures procédures proches et jamais qu'une seule ! ») : sans étapes
  servies, une question (`data`, `how`) ou une demande polie (`request`) ne suit aucune procédure
  d'elle-même ; la consigne dit de répondre ou de chercher sans modifier de données, et de proposer
  en choix toutes les candidates montrées, X = `CANDIDATES_SHOWN` (3, `server/routing.ts` l. 38),
  jamais la première seule. Même ligne quand la première est sous le seuil et quand deux candidates
  sont à moins de l'écart : `decide` rend `null` dans les deux cas (`server/routing.ts` l. 84-89).
  La ligne d'une `action` le fait déjà (« Ask the user which one to run », `code.ts` l. 68) et ne
  change pas. Conséquence : une question de données propose désormais les candidates après sa
  réponse, là où E03-S02 disait « do not ask which procedure to run » : retour voulu, qui amende
  ADR-003 § 2, `docs/prd.md` l. 251 et les golden queries R3, I2, I3 (écrits par le pilote).
- **HN-E11S04-7** : une question « comment » servie reçoit les étapes et « explain these steps, and
  run them only if the user asks » (source : ADR-003 § 4).
- **HN-E11S04-8** : pas de champ nouveau dans `structuredContent` ; `data_question` est `false` pour
  `how` et `request` (source : surface minimale ; ADR-002, champ optionnel possible plus tard).
- **HN-E11S04-9** (tranchée par le responsable d'Oto, 2026-09-29 : inclus) : M58 est pris en
  entier. `route_candidates` et `search_content`, recréées toutes deux, excluent la corbeille avant
  la coupe (`deleted_at is null`). Conséquence : `find` change sur ce seul point, un nœud à la
  corbeille ne prenant plus de place dans les 50 lignes ; le garde-fou devient « attentes de `find`
  identiques sauf la corbeille », dont le test échoue d'abord sur la fonction actuelle (AC-a8). Le
  service garde `nodeLevels` après la fonction (`security-patterns.md § Droits dans le service`).
- **HN-E11S04-10** : aucune branche de présélection nouvelle pour « formulation contenue dans la
  demande » : ses mots sont des lexèmes de la demande, que la branche plein texte trouve. AC-a6 le
  prouve (source : simple).
- **HN-E11S04-11** : la story livre son propre fichier de migration ; le pilote le réunit dans la
  migration unique de 1.0.1 (source : fiches D131, D124).
- **HN-E11S04-12** : la liste des formules de demande est fermée et écrite dans le code, comme les
  interrogatifs (source : H37, N1).
- **HN-E11S04-13** (acceptée par le responsable d'Oto, 2026-09-29) : le seuil de la correction reste écrit une fois, dans la clause `set
  pg_trgm.similarity_threshold = '0.3'` de `lexicon_fix`, sans paramètre. Les deux appelants
  corrigent à 0,3 (`search_content`, MIG l. 1544 ; le routage, HN-E11S04-3), donc `find` garde
  exactement son seuil ; « tâcje » → « tâche » vaut 1/3 (trois trigrammes communs, `  t`, ` ta`,
  `tac`, sur neuf), au-dessus. Un paramètre ne servirait qu'à deux seuils différents, qu'aucun
  appelant ne demande (source : CLAUDE.md § Justifier une surface nouvelle). S'il en fallait un, la
  forme garderait l'index : clause au plus bas des seuils, `%`, puis `similarity(…) >= p_min`.
- **HN-E11S04-14** : quand des étapes sont servies (candidate nette), la ligne ne change pas, sauf
  la phrase `how` d'AC-b3 ; les autres candidates y sont déjà listées (« Other candidates », `code.ts`
  l. 61-64) (source : consigne du responsable d'Oto, qui vise le cas sans étapes).
- **HN-E11S04-15** : une seule candidate de score ≥ 0,30 : la consigne n'en propose qu'une, faute
  d'autres ; aucune procédure sous 0,30 n'est ajoutée pour atteindre trois (source : `SHOW_THRESHOLD`,
  `server/routing.ts` l. 28, inchangé).

## Actions JB

- Aucune propre à la story (la publication de 1.0.1 relève de la fiche D131).

## Tests attendus

### Unit tests (`tests/unit/routing.test.ts`, `tests/unit/context-blocks.test.ts`)
- [ ] `blendScore` : les trois parts, l'amorti sous deux lexèmes, les bornes [0, 1] (AC-b1).
- [ ] `requestKind` : les listes actuelles gardent leur verdict ; un cas `how`, deux `request` (AC-b2).
- [ ] `routingLine` : la phrase `how` servie et les trois lignes non servies nouvelles d'AC-b3,
  comparées à l'octet, avec deux candidates (toutes dans la ligne) et avec une seule ; la ligne
  d'une `action` inchangée ; `data_question` inchangé.

### Integration tests (données jetables, suites portables `sqlConfigured`)
- [ ] `route-candidates-index.test.ts` : formulation égale et formulation contenue (AC-a2), mots rares
  (AC-a3), titre (AC-a4), correction (AC-a5), rien de perdu par chemin (AC-a6), corbeille (M58),
  mot rare dans une procédure illisible sans effet (AC-a7), seuils `pg_trgm` recalculés, attributs
  de `search_content` et de `lexicon_fix` (AC-a8).
- [ ] `routing.test.ts` : le jeu « todo » (AC-c1), écrit et vu échouer avant le changement.
- [ ] Les suites d'AC-c2, inchangées dans leurs attentes ; `search-content.test.ts` avec les deux
  colonnes.
- [ ] Les suites de `find` d'AC-a8 (trouvées par `rg -l "search_content" C:/apps/oto-pkg/tests`),
  lues avant le changement, vertes sans une attente changée.
- [ ] `search-content.test.ts` : un nœud à la corbeille qui porte les termes, en tête avec
  `p_limit => 1` sur la fonction actuelle, n'est plus rendu ; le nœud vivant suivant l'est (AC-a8,
  M58). Écrit d'abord, vu échouer ; seul test nouveau pour `find`.

MCP : aucun test nouveau (outils et schémas inchangés ; textes d'AC-b3 prouvés par `codeBlock`).

### Golden queries (écrites par le pilote dans `docs/mcp-golden-queries.md`)

Section « Routage de la todo — E11-S04 (organisation Démo) », format `| # | Prompt | Attendu au
journal |`, jouée sur Démo quand la todo y est ; une ligne « Rejeu sans host » (scores d'AC-c1) en
tête, et la ligne du pilote (l. 185) mise à jour avec les taux d'AC-c2 :
- [ ] TD1 « Passe la 1 en fait. » → `demo_context` sert « Mettre à jour une tâche », puis l'écriture
  de la tâche 1. TD2 « Ma todo. » → sert « Voir mes tâches », aucune écriture. TD3 « Crée le projet
  Alpha. » → sert « Créer un nouveau projet ». TD6 « Créé une tâcje pour essayer. » → sert
  « Ajouter une tâche ».
- [ ] TD4 « Qu'est-ce que j'ai à faire aujourd'hui ? » → « Voir mes tâches » servie, ou proposée en
  choix avec les autres candidates après la réponse (`demo_find`, `demo_read` ou `demo_call
  table.rows`) ; aucune écriture.
- [ ] TD5 « Note que je dois relancer la Boulangerie des Tilleuls demain. » → « Ajouter une tâche »
  servie, ou proposée en tête des candidates, la personne choisissant ; aucun `mail.*`.
- [ ] TD7 « Comment je crée un projet ? » → explication tirée des étapes de « Créer un nouveau
  projet », servie, ou choisie par la personne parmi les candidates proposées ; aucune écriture sans
  accord.
- [ ] R3, I2, I3 (Acme), quand `context` montre des candidates : attendu réécrit, « réponse, puis les
  candidates proposées en choix ; aucune exécution sans choix » au lieu de « aucune question sur la
  procédure » (HN-E11S04-6). TDN1 « Supprime le projet Alpha. » → rien de servi ; le
  modèle dit qu'aucune procédure ne le fait, ou demande.

E2E : aucun, pas d'écran.

## Post-implémentation

### Écarts avec l'architecture

- Aucun invariant touché. ADR-003 § 1 (le routage corrige aussi une faute par le lexique) et § 2
  (sans étapes servies, toutes les candidates proposées en choix, question de données comprise),
  `docs/prd.md` (« Faire une tâche avec son assistant ») et `docs/architecture.md` (`lexicon`, `route_candidates`, `search_content`,
  `lexicon_fix`) amendés à la fusion.
- Écarts avec la story, pris en hypothèse au dev : `WEIGHTS` = 0,25 / 0,30 / 0,45 au lieu du point de
  départ 0,35 / 0,25 / 0,40 (HN-E11S04-16) ; `lexical_title` sur `norm_words(title)` et non
  `norm(title)` (HN-E11S04-18) ; la migration redit les privilèges de `search_content`, que la story
  disait inutiles à rejouer, parce que `check:migrations` exige la révocation (HN-E11S04-20) ;
  retour arrière en commentaire (HN-E11S04-21).
- Migration `20260929140000_route_candidates_formulations.sql` : `lexicon_fix` (sous l'appelant,
  `revoke all … from public`, aucun `grant`), `route_candidates` retirée puis recréée avec
  `s_phrase` et `lexical_title`, `search_content` recréée (correction par `lexicon_fix`, corbeille
  exclue avant la coupe : M58 soldée). À réunir dans la migration unique de 1.0.1 (HN-E11S04-11).

### Composants créés
| Composant/Hook/Action | Path | Notes |
|----------------------|------|-------|
| `platform.lexicon_fix` | `packages/plateforme/migrations/20260929140000_route_candidates_formulations.sql` | La seule correction d'un mot par le lexique ; appelée par `route_candidates` et `search_content`, exécutable par aucun rôle client |
| `requestKind`, type `RequestKind` | `packages/plateforme/server/routing.ts` | `how`, `request`, `data`, `action` ; `isDataQuestion` = `data` ; lu par la consigne de `context/blocks/code.ts` |
| Jeu « todo » | `tests/integration/fixtures/todo-routing.cases.ts` | Quatre procédures et les phrases d'AC-c1 |

### Notes

- Mesures (AC-c2, avant → après) : Acme, paraphrases servies 29 → 30 sur 53, formulations 20 sur 20,
  précision 100 %, ambiguës servies 2 → 1 sur 6, premier candidat juste 95,6 % → 97,8 % ; pilote,
  paraphrases servies 4 sur 13 (inchangé), QP-D2 0,58. QP-I5 (« Prospects. ») n'est plus servie
  (0,805 → 0,635) : aucun test ne l'attendait servie ; dit dans `docs/mcp-golden-queries.md`.
- Jeu « todo » (AC-c1) : TD1 0,67, TD2 0,72, TD3 0,65 (0,653, marge mince), TD6 0,72, TD7 0,78
  servies ; TD5 non servie, « Ajouter une tâche » en tête à 0,60 ; TD4 non servie, « Voir mes tâches »
  montrée à 0,31 ; les deux négatives jamais servies. Golden queries TD1 à TD7 et TDN1 écrites.
- Revue approuvée. BASSE : `database-patterns.md § Migrations` (« rollback fourni ») contredit
  `packages/plateforme/migrations/README.md` (« rollback en commentaire ») : à trancher dans la
  convention, hors de cette story. Suites propres à Supabase sautées sur la base locale, à rejouer
  sur le projet : `org-transfer`, `portabilite-schema`, `pilot-qualification`, `mcp-core`,
  `isolation/{tables,contenu,mcp,api}`, `feedback-prompts`.
