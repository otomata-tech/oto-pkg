// Jeu « todo » du routage sans host (E11-S04, AC-c1) : une todo multi-projets, quatre procédures
// d'organisation (aucune équipe), les phrases du rapport de tests d'un assistant sur l'organisation de
// démonstration et ce que chacune doit donner. Titres du rapport ; résumés reconstitués (HN-E11S04-1),
// chacun sous 200 caractères, qui reproduisent sur le routage d'avant l'égalité de « ma todo » et les
// scores bas de « crée le projet Alpha » et de « tâcje ». Chaque procédure porte un paragraphe d'étapes,
// assez pour être servie. Seul le résumé porte les formulations (P37).
import type { SeedNode } from "../../helpers/plateforme"

export const TODO_ADD = "todo/ajouter_une_tache"
export const TODO_LIST = "todo/voir_mes_taches"
export const TODO_UPDATE = "todo/mettre_a_jour_une_tache"
export const TODO_PROJECT = "todo/creer_un_projet"

const procedure = (path: string, title: string, summary: string, step: string): SeedNode => ({
  path,
  kind: "procedure",
  title,
  summary,
  blocks: [{ type: "paragraph", text: step }],
})

export const TODO_PROCEDURES: SeedNode[] = [
  procedure(
    TODO_ADD,
    "Ajouter une tâche",
    "Ajoute une tâche à ma todo, dans un projet, avec son échéance. Se demande : « ajoute une tâche », « crée une tâche », « note que je dois ».",
    "Demande le projet et l'échéance, puis écris la tâche dans le tableau de la todo.",
  ),
  procedure(
    TODO_LIST,
    "Voir mes tâches",
    "Montre les tâches à faire, par projet, les plus urgentes d'abord. Se demande : « ma todo », « montre mes tâches », « quoi de prévu ».",
    "Lis les tâches ouvertes du tableau de la todo et montre-les par projet, les plus urgentes d'abord.",
  ),
  procedure(
    TODO_UPDATE,
    "Mettre à jour une tâche",
    "Change le statut, l'échéance ou le projet d'une tâche de ma todo. Se demande : « passe la 2 en fait », « décale la tâche à lundi ».",
    "Retrouve la tâche nommée ou numérotée, puis écris son nouveau statut, son échéance ou son projet.",
  ),
  procedure(
    TODO_PROJECT,
    "Créer un nouveau projet",
    "Crée un projet de la todo pour y ranger des tâches. Se demande : « crée un projet », « nouveau projet ».",
    "Demande le nom du projet, puis ajoute-le à la liste des projets de la todo.",
  ),
]

export type TodoRoutingCase = {
  phrase: string
  /**
   * `served` : les étapes de `path` servies ; `first` : `path` en premier candidat, servi ou proposé avec
   * les autres ; `shown` : `path` parmi les candidats montrés, et rien d'autre servi ; `never` : aucune
   * étape servie.
   */
  expect: "served" | "first" | "shown" | "never"
  path?: string
}

export const TODO_CASES: TodoRoutingCase[] = [
  { phrase: "passe la 1 en fait", expect: "served", path: TODO_UPDATE },
  { phrase: "ma todo", expect: "served", path: TODO_LIST },
  { phrase: "crée le projet Alpha", expect: "served", path: TODO_PROJECT },
  { phrase: "créé une tâcje pour essayer", expect: "served", path: TODO_ADD },
  { phrase: "note que je dois relancer la Boulangerie des Tilleuls demain", expect: "first", path: TODO_ADD },
  { phrase: "qu'est-ce que j'ai à faire aujourd'hui ?", expect: "shown", path: TODO_LIST },
  { phrase: "comment je crée un projet ?", expect: "shown", path: TODO_PROJECT },
  { phrase: "quelle heure est-il ?", expect: "never" },
  { phrase: "supprime le projet Alpha", expect: "never" },
]
