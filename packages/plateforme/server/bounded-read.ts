// Le lecteur borné d'un corps (E10-S02 lot f) : les octets d'une source lue par morceaux, arrêtée au premier morceau qui
// passe la borne. Partagé par la porte du dépôt par lien (`api/uploads.ts`, 1 Mo), le téléchargement d'une adresse
// fournie (`uploads-fetch.ts`, 1 Mo) et la lecture du texte d'un fichier joint (`files/service.ts`, 4 Mo) : sans lui,
// chacun recopierait la boucle, la coupe et l'assemblage (`coding-standards.md § DRY`).

/** Une source d'octets : un flux web (`Request.body`, `Response.body`) ou un itérable asynchrone (`IncomingMessage`). */
export type ByteSource = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>

/**
 * Les octets de `source`, au plus `max` : au premier morceau qui passe la borne, la lecture s'arrête, la source est
 * annulée (flux web) ou refermée (itérable), et `refuse` donne l'issue — une valeur rendue, ou une erreur levée.
 */
export async function readBounded<Refused>(source: ByteSource, max: number, refuse: () => Refused): Promise<Uint8Array | Refused> {
  const chunks: Uint8Array[] = []
  let total = 0
  const kept = (chunk: Uint8Array): boolean => {
    total += chunk.byteLength
    if (total > max) return false
    chunks.push(chunk)
    return true
  }
  if ("getReader" in source) {
    const reader = source.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!kept(value)) {
        await reader.cancel()
        return refuse()
      }
    }
  } else {
    // Sortir de la boucle referme l'itérable (`return`), donc le flux Node qu'il lit.
    for await (const chunk of source) if (!kept(chunk)) return refuse()
  }
  const bytes = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  return bytes
}
