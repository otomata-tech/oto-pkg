#!/usr/bin/env node
/**
 * Hook PreToolUse — garde-fous d'exécution pour que la sortie des checks reste lisible.
 *
 * Exit 0 = autorisé, exit 2 = bloqué (stderr renvoyé à Claude).
 * Ce fichier EST la source de vérité de ces règles — ne pas les dupliquer dans CLAUDE.md.
 * Il reçoit les commandes des outils Bash et PowerShell (matcher de `.claude/settings.json`),
 * chacune lue avec la grammaire de son shell (`scripts/hook-command.mjs`) ; chaque règle nomme
 * aussi ses formes PowerShell (M09).
 *
 * PÉRIMÈTRE : les 3 règles ne s'appliquent QU'AUX COMMANDES DE CHECK. Un hook qui bloque une
 * commande légitime finit désactivé — c'est son mode d'échec le plus probable, et il coûte plus
 * cher que la règle ne rapporte.
 *
 * `run_in_background` n'est PAS bloqué — voir la justification en ligne plus bas.
 */

/**
 * Le module qui lit la commande (`scripts/hook-command.mjs`), ou la raison pour laquelle il ne se
 * charge pas. Importé statiquement, un module absent ou cassé faisait sortir node en code 1 avant la
 * première ligne du hook : Claude Code tient ce code pour une erreur non bloquante, et le check
 * passait sans contrôle (revue de M09). Recopié d'`enforce-git-gate.mjs` : ce chargement ne peut pas
 * vivre dans un module, dont le chargement est justement ce qui peut échouer.
 */
async function chargerLaLecture() {
  try {
    const lecture = await import('../../scripts/hook-command.mjs')
    if (typeof lecture.neutraliser === 'function') return { lecture }
    return { raison: "il n'exporte plus `neutraliser`" }
  } catch (erreur) {
    return { raison: erreur instanceof Error ? erreur.message : String(erreur) }
  }
}

const LECTURE_ILLISIBLE = (raison) =>
  `BLOQUÉ: scripts/hook-command.mjs ne se charge pas (${raison}). Sans lui, ce hook ne lit plus les commandes : il refuse tout check au lieu de le laisser passer sans contrôle. Réparer scripts/hook-command.mjs avec l'outil Edit ou Write, ou dans un terminal hors de Claude Code (git checkout -- scripts/hook-command.mjs), puis relancer la commande.`

// Le motif doit matcher un check EN POSITION DE COMMANDE. Sans les ancres, le simple mot
// `eslint` ou `vitest` n'importe où déclenchait la règle : `ls node_modules/.bin | grep eslint`,
// `which vitest`, `rg "pnpm test" docs/` étaient bloqués.
// `(?![\w.-])` et pas `\b` : `pnpm add -D eslint-plugin-import` et `sed -i … eslint.config.mjs`
// ne sont pas des lancements d'ESLint.
// `\n` fait partie des débuts de commande : une Bash multi-lignes est une seule chaîne, et sans
// lui `git status\npnpm type-check | tail` échappait à la règle. `{ ` aussi : un bloc PowerShell
// (`while ($true) { pnpm test }`, `& { pnpm test } | …`) commence une commande (M09) ; l'espace
// écarte l'expansion d'accolades de Bash (`ls {vitest,eslint}.config.*`). Pas `@{ ` : un objet
// PowerShell (`[pscustomobject]@{ vitest = '3.2.4' } | Out-File …`) commence par une clé, jamais par
// une commande (revue de M09, M13a).
const DEBUT = '(?:^|\\n\\s*|[;&|]\\s*|&&\\s*|\\|\\|\\s*|(?<!@)\\{\\s+)'
// Entre le début de commande et le check : des affectations de variables d'environnement, une ou
// plusieurs (`VITEST_MAX_FORKS=2 pnpm verify > log`), `env`, `timeout <durée>`, ou `rtk` suivi du
// check (`rtk pnpm test`, `rtk vitest`, et le proxy `rtk proxy pnpm verify | head`). Sans ce
// préfixe, un check ainsi lancé échappait aux trois règles (M04, M09).
const PREFIXE = '(?:(?:[A-Za-z_]\\w*=\\S*|env|timeout\\s+(?:-\\S+\\s+)*\\d[\\w.]*|rtk(?:\\s+proxy)?)\\s+)*'
// Un binaire local se lance aussi par `pnpm exec`, par `pnpm` seul quand aucun script ne porte son
// nom (`pnpm vitest run <fichiers>`, la consigne des agents) ou par `npx` (M09).
const LANCEUR = '(?:(?:pnpm|npm|yarn)\\s+exec\\s+|(?:pnpm|yarn)\\s+|npx\\s+)?'
// `--%`, le jeton d'arrêt d'analyse de PowerShell, se place juste après le programme (M09).
const CHECK = new RegExp(
  DEBUT +
    PREFIXE +
    '(?:' +
    '(?:pnpm|npm|yarn)\\s+(?:--%\\s+)?(?:run\\s+)?(?:type-check|lint|test|test:e2e|build|check:framework|verify|verify:cached)(?![\\w.-])' +
    '|' + LANCEUR + '(?:tsc|vitest|eslint)(?![\\w.-])' +
    '|(?:npx\\s+)?playwright\\s+test(?![\\w.-])' +
    '|next\\s+build(?![\\w.-])' +
    // `rtk lint` est l'ESLint de rtk, celui qu'il substitue à `pnpm lint`.
    '|rtk\\s+lint(?![\\w.-])' +
    ')'
)

const deny = (msg) => {
  process.stderr.write(msg + ' Règle définie dans .claude/hooks/enforce-bash-rules.mjs.\n')
  process.exit(2)
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => (raw += c))
process.stdin.on('end', async () => {
  let input
  try {
    input = JSON.parse(raw)
  } catch {
    process.exit(0)
  }
  const command = input?.tool_input?.command
  if (typeof command !== 'string' || !command.trim()) process.exit(0)

  // Sans lecture, le hook échoue fermé sur ce qu'il garde : un check, cherché dans la commande brute ;
  // les autres commandes passent, sans quoi toute commande de toute session serait refusée (M13a).
  const { lecture, raison } = await chargerLaLecture()
  if (!lecture) {
    if (CHECK.test(command)) deny(LECTURE_ILLISIBLE(raison))
    process.exit(0)
  }

  // Neutraliser les chaînes entre quotes : `grep "pnpm test | head"` n'est pas un check tronqué,
  // et un heredoc qui écrit un workflow contenant `pnpm build` n'en est pas un non plus.
  const bare = lecture.neutraliser(command, input?.tool_name)

  // Toutes les règles sont conditionnées au fait qu'il s'agisse d'un check.
  if (!CHECK.test(bare)) process.exit(0)

  // `run_in_background` EST AUTORISÉ, y compris sur un check. La règle qui le bloquait reposait
  // sur « sa sortie serait invisible » — c'est faux : le harness notifie à la fin de la commande
  // et sa sortie reste récupérable. Et surtout, ce n'est pas la lecture de la sortie qui atteste
  // qu'un check est passé, c'est le REÇU : `pnpm verify` l'écrit en arrière-plan comme au
  // premier plan, et le gate de commit le relit dans les deux cas. La garantie est intacte.
  // Le coût, lui, était réel : une suite de tests ou un build long monopolisait la session.

  // --- Règle 1 : pas de troncature de la sortie d'un check ---
  // Les erreurs sont souvent en fin de sortie : la tronquer les masque. En PowerShell,
  // Select-Object (alias select) et Measure-Object (alias measure) ; Select-String est un grep.
  if (/\|\s*(?:tail|head|less|more|wc)\b/.test(bare) || /\|\s*(?:select|measure)(?:-object)?(?![\w-])/i.test(bare)) {
    deny('BLOQUÉ: sortie de check tronquée par un pipe. Exécuter la commande brute.')
  }

  // --- Règle 2 : pas de redirection fichier pour un check ---
  // `*>` (tous les flux, PowerShell) est couvert par le premier motif ; les cmdlets qui écrivent
  // un fichier ou jettent la sortie reçoivent le pipe comme `tee`. Vers la sortie ou les erreurs
  // (`*>&1`, qui réunit tous les flux de PowerShell dans la sortie ; `>&2`), rien ne quitte le
  // terminal ; pas vers un autre descripteur, qu'`exec 3>out.txt` lie à un fichier (M13a).
  if (
    /(?:^|[^0-9>])>{1,2}(?!&[12](?!\d))\s*\S/.test(bare) ||
    /\|\s*(?:tee|tee-object|out-file|set-content|add-content|out-null)(?![\w-])/i.test(bare)
  ) {
    deny('BLOQUÉ: sortie de check redirigée vers un fichier. Elle doit rester dans le terminal.')
  }

  // --- Règle 3 : pas de boucle d'attente / polling ---
  // En PowerShell : `while ($true) { … }`.
  if (/\bwhile\s+(?:true|:)|(?:^|[;&\s])watch\s|\buntil\s+.*;\s*do/.test(bare) || /\bwhile\s*\(\s*\$true\s*\)/i.test(bare)) {
    deny("BLOQUÉ: boucle d'attente/polling. Exécuter la commande une fois et lire le résultat.")
  }

  process.exit(0)
})
