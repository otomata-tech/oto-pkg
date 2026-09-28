// Les chiffres clés de l'usage (E08-S09, AC3) : quatre tuiles lues, jamais cliquables : elles ne filtrent
// rien. Porté d'oto-frontend (`adoption-des-membres.tsx` l. 77-148), E05-S09 partie d2 : `Grid` à quatre
// colonnes et `Stat` du design system (on la LIT ; une tuile qu'on clique serait une `CounterStrip`), un
// tiret pour un taux sans appel. Retiré : compteurs d'adoption (bloqués, décrochés, jamais actifs).
import type { UsageSummary } from "../../../schemas"
import { Grid } from "../../ds/react/grid"
import { Stat } from "../../ds/react/stat"
import { nombreLisible, tauxLisible } from "../../format/nombres"
import { Ilot } from "../ilot"

export function ChiffresCles({ totaux }: { totaux: UsageSummary["totals"] }) {
  const tuiles = [
    { libelle: "Conversations", valeur: nombreLisible(totaux.conversations) },
    { libelle: "Personnes actives", valeur: nombreLisible(totaux.people) },
    { libelle: "Appels", valeur: nombreLisible(totaux.calls) },
    { libelle: "Taux d'erreur", valeur: tauxLisible(totaux.errors, totaux.calls) ?? "—" },
  ]
  return (
    <Ilot id="usage-chiffres-cles" titre="Chiffres clés">
      <Grid cols={4}>
        {tuiles.map(({ libelle, valeur }) => (
          <Stat key={libelle} value={valeur} label={libelle} />
        ))}
      </Grid>
    </Ilot>
  )
}
