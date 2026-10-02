// La vue `page` du widget (story widgets-dans-la-conversation, lot 1) : `read` d'une page ou d'une procédure
// servie entière ajoute ses blocs aux données, que le widget rend comme l'écran (`RenduDUnBloc`). Le texte de
// `read` est du markdown assemblé (en-tête, liens, pied) : sans les blocs, le widget n'aurait rien à rendre.
// Ici et non dans `read.ts`, qui tient sous la borne de longueur d'un fichier.
import type { ReadNodeInput } from "../../schemas"
import { MAX_DATA_CHARS, type ToolOutput } from "../tool-output"
import type { DocBlock } from "./document"

/** Place laissée sous `MAX_DATA_CHARS` à ce que la porte ajoute encore aux données (`new_ctx`, `view`). */
const PORTE_MARGIN = 200

type ServedBody = { blocks: readonly DocBlock[]; outlined?: true }

/** Une page servie entière : ni section, ni plan, ni écart, ni brouillon, ni partie d'une page plus longue. */
function servedWhole(input: ReadNodeInput, served: ServedBody, output: ToolOutput): boolean {
  const modes = input.section !== undefined || input.outline === true || input.since_revision !== undefined || input.draft === true
  return !modes && !served.outlined && input.cursor === undefined && output.continuation === undefined && served.blocks.length > 0
}

/**
 * `output` avec la vue `page` et les blocs servis (type, texte, données), si la page est servie entière et que
 * les données tiennent encore sous `MAX_DATA_CHARS` ; sinon `output` tel quel : le texte suffit.
 */
export function withPageView(output: ToolOutput, served: ServedBody, input: ReadNodeInput): ToolOutput {
  if (!servedWhole(input, served, output)) return output
  const blocks = served.blocks.map(({ type, text, data }) => ({ type, text, data }))
  const data = { ...output.data, blocks }
  if (JSON.stringify(data).length > MAX_DATA_CHARS - PORTE_MARGIN) return output
  return { ...output, data, view: "page" }
}
