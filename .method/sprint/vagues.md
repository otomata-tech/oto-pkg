# Vagues de stories menées sans JB

Quand JB demande d'avancer sans lui, un pilote lance un agent par story 🟢 Ready de
[`status.md`](status.md), chacun dans son worktree, puis fusionne. Ces règles s'ajoutent à
`CLAUDE.md` ; le sémaphore des commandes lourdes et le script de workflow vivent hors du dépôt.

## Pilote et agents

- **Le pilote ne modifie ni `src/`, ni `tests/`, ni `packages/`** : il découpe en lots, écrit les
  critères vérifiables, lance les agents (dans le même message quand les lots ne se touchent pas),
  relit les diffs, arbitre et finalise (revue, changelog, registre, `commit-push`). Chaque agent est
  lancé avec son modèle écrit explicitement (sans lui, il hérite de celui du pilote), effort `high`,
  jamais `max`, qui épuise les limites de session.
- **Un agent neuf par étape** (implémentation, correction, revue, recalage), avec un résumé court de
  l'étape d'avant. Des tâches Micro ou S sans migration, prêtes ensemble, partent dans un seul agent
  et un seul worktree, l'une après l'autre, avec une seule vérification et une seule fusion.
- **Hypothèses, jamais bloquantes.** Face à une ambiguïté, l'agent prend l'option la plus proche des
  ADR et de `docs/architecture.md`, sinon la plus simple, et l'écrit sourcée dans la section
  « Hypothèses » de la story ; le pilote la reporte dans `docs/decisions/hypotheses.md`. Ce qui
  changerait l'expérience d'un client ou coûterait cher à défaire va aussi dans
  `docs/decisions/fiche-decisions.md`, et la story avance sous l'option recommandée.
- **Le pilote n'attend pas JB** : avant une question (`AskUserQuestion`), il lance tout le travail qui
  n'en dépend pas ; celui qui en dépend part sous l'option recommandée, hypothèse notée. Vérifiable
  sur la trace : aucune question n'est suivie d'une attente alors qu'un lot indépendant restait à lancer.
- **Oto est une source de détails, jamais de conception** : une reprise d'un fichier d'Oto dit ce
  qu'elle reprend et ce qu'elle retire ; la revue refuse celle qui réintroduit une ligne de
  `docs/architecture.md § 10`.
- **Actions réservées à JB**, listées dans le rapport, jamais exécutées : vrais secrets, création de
  services ou de comptes externes, réglages des projets Supabase et Vercel.
- **Fichiers partagés, écrits par le pilote seul à la fusion** : `docs/changelog.md`,
  `.method/sprint/status.md`, `.method/conventions/component-registry.md`, `.method/conventions/_index.md`,
  `CLAUDE.md`, `docs/architecture.md`, `docs/decisions/hypotheses.md`,
  `docs/decisions/fiche-decisions.md`, `docs/mcp-golden-queries.md` et `packages/plateforme/CHANGELOG.md`.
  L'agent met dans son rapport ce qu'il faudrait y écrire.
- **Rapport de fin de vague** : stories livrées, hypothèses prises, actions JB en attente.

## Parallélisme

- Une story démarre dès que ses dépendances sont **approuvées** par la revue : son worktree part de
  `main` plus leur diff approuvé, et se recale sur `main` après leur fusion ; la fusion suit l'ordre
  des dépendances.
- Deux stories en cours ne touchent jamais la même migration, la même table ni le même fichier
  source, sauf les **fichiers d'ajout**, réconciliés à trois voies à la fusion : `schemas/index.ts`,
  `server/index.ts`, `ui/index.ts`, la table de dispatch d'`api/handler.ts`, la base simulée et les
  aides SQL de `tests/helpers/`, la carte `TABLES` de `scripts/lib/org-transfer.mjs` et les lignes de B
  de la suite d'isolation (`tests/integration/isolation/`). Dans un fichier d'ajout, le diff ne
  contient que des lignes ajoutées ; la factorisation se propose au pilote (vérifiable : `git diff
  --numstat` n'y compte aucune ligne retirée). Une aide de test propre à un lot porte un nom préfixé
  par son lot, ou vit dans `tests/helpers/<lot>.ts` (vérifiable : `pnpm type-check` après la fusion
  ne signale aucun identifiant en double).
- Une fonction commune que `main` a déjà déplacée s'importe de sa place, au texte de `main`
  (`git show main:<fichier>`), jamais recopiée.
- Une story découpée en lots donne à chaque lot la **liste explicite** de ses fichiers. Vérifiable
  avant la fusion : les `git diff --name-only` des lots, hors fichiers d'ajout, n'ont aucune ligne commune.
- **Mémoire** : les agents lancent Vitest avec `VITEST_MAX_FORKS=2` ; chaque commande lourde
  (`pnpm verify`, `type-check`, Vitest complet, `build`, `next dev`, Playwright : 2 à 3 Go au pic)
  passe par le sémaphore du pilote, N créneaux = (RAM libre − 3 Go) / 3 Go, au moins 1 ; sous 3 Go
  libres, plus de nouvelle commande lourde.
- **Un seul `pnpm verify` complet par fusion** : dans son worktree, un agent lance `type-check`,
  `lint`, `check:framework` et Vitest sur ses tests et sur les suites qui importent ses fichiers
  (liste citée dans son rapport) ; le `verify` complet tourne sur `main` à la fusion.

## Base de test et migrations

- Chaque worktree reçoit une copie de `.env.local`. Les tests tournent sur la base locale du poste
  (`testing-strategy.md § Base de test locale`), le `verify` de la fusion aussi ; les fichiers qu'il
  saute tournent sur le projet Supabase partagé, avec des données jetables (`CLAUDE.md § Vérifier,
  commiter, pousser`, `testing-strategy.md § Base de test`).
- **Une seule migration non fusionnée appliquée à la fois au projet partagé** (Ⓜ dans `status.md`),
  dans l'ordre des horodatages : l'historique des migrations du projet reste égal à celui de `main`,
  sinon le déploiement des migrations par la CI échoue. L'agent l'applique par
  `supabase db push --db-url`, jamais `migration repair`. Une migration appliquée n'est jamais
  modifiée ni renommée : une correction est une nouvelle migration additive.
- **Toute migration appliquée part sur `main`**, même si la story est bloquée ensuite : additive ne
  veut pas dire sans effet, et tant qu'elle n'y est pas, la base porte un schéma que `main` ignore.
  Le pilote fusionne les stories déjà approuvées avant de lancer une story Ⓜ, fusionne la Ⓜ en
  premier et recale les autres sur `main` ; leurs revues nomment comme connus les échecs hors du
  diff que cette migration explique. Une spécification Ⓜ ne promet jamais une migration « sans
  effet sur les tests de main ».
- **Un seul fichier de migration par version publiée** du paquet : chaque story Ⓜ garde le sien
  pendant le développement, et le pilote les réunit en `<horodatage>_vX_Y_0.sql` avant le tag, puis
  répare l'historique du projet de test (fiche D124).

## Cycle, revue et fusion

- **Cycle** : implémentation et tests ; vérifications ciblées ; revue par un agent isolé (skill
  `revue`) jusqu'à approbation, par le pilote pour une taille S ; fusion et `commit-push` par le pilote.
- **Revues** : la première est complète ; après une correction, elle est ciblée (chaque constat
  bloquant corrigé, la vérification, le code que la correction a changé ; un constat nouveau ailleurs
  est BASSE). Deux corrections au plus : ensuite, une MOYENNE qui n'est ni de sécurité, ni de droits,
  ni d'AC devient une tâche de suite dans `status.md`, et la story fusionne ; une HAUTE, ou une
  MOYENNE de sécurité, de droits ou d'AC, la bloque. Une tâche sans story reçoit en revue les
  hypothèses et les écarts de son rapport : un reste qu'il ne source pas est un critère non livré.
- **Fusion** : le diff de la branche s'applique sur `main` (le gate bloque `git merge` et
  `git rebase`), puis `pnpm verify` tourne sur `main` avant le commit. Deux ou trois stories
  approuvées, sans fichier source commun hors des fichiers d'ajout, se fusionnent ensemble, avec un
  `verify` et un commit qui les nomment toutes ; une Ⓜ passe en tête du lot, sa migration appliquée
  avant le `verify`.
- **Signature changée** : une story qui change une signature exportée ou un type partagé casse les
  stories fusionnées depuis sa base. Avant le `verify`, le pilote cherche dans `main` les appelants
  (`rg` sur le nom), les doublures de test qui servent la forme retirée et celles qui reçoivent le
  type changé (elles passent le type-check et n'échouent qu'à l'exécution), et les fait adapter dans
  la même fusion. Une story qui retire une page laisse `.next/types` périmé : le supprimer avant le
  `verify`.

## Reprise d'un workflow interrompu

- `resumeFromRunId` ne rend en cache que le plus long préfixe inchangé d'appels `agent()` : un appel
  modifié relance tous les suivants, et un appel `isolation: "worktree"` relancé échoue sur le nom du
  worktree existant. Un run se reprend donc avec le script et les arguments inchangés ; sinon, un
  nouveau workflow reçoit en première étape le worktree et la branche de chaque story déjà
  implémentée.
- Un agent perdu (limite de session) arrête sa story, statut `interrupted` ; un statut
  `blocked-review` se vérifie sur les verdicts rendus avant d'être cru. Un agent repris relit d'abord
  son diff de `packages/` contre sa base, condition par condition : un agent arrêté pendant ses
  mutations laisse la dernière en place.
