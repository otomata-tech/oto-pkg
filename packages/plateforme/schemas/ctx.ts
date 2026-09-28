// Format du code `ctx` (H27) : la seule définition, lue par la garde de `server/ctx.ts` (forme
// vérifiée avant la base) et par le journal (E05-S05). C'est le check de la table `platform.ctx`
// (E01-S02) ; l'alphabet de Crockford des codes émis en est un sous-ensemble.
import * as z from "zod/v4"

export const CTX_PATTERN = /^[0-9A-Z]{4}-[0-9A-Z]{4}$/

export const ctxCodeSchema = z.string().regex(CTX_PATTERN)
