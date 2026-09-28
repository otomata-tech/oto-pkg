#!/usr/bin/env node
// Le `bin` du paquet, `oto-platform`. Séparé d'index.mjs : un bin est lancé par un lien de
// node_modules/.bin, où comparer import.meta.url à process.argv[1] ne reconnaît pas l'appel direct.
import { run } from './index.mjs'

process.exitCode = await run(process.argv.slice(2))
