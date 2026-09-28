# ADR-009 — Transport MCP sans état (Streamable HTTP, aucune session serveur) ; texte seul dans la conversation

| Champ | Valeur |
|-------|--------|
| **Date** | 2026-09-23 |
| **Statut** | Accepté |
| **Décideur(s)** | JB |

## Contexte

`mcp-patterns.md § 7` exige que le transport soit figé par ADR. Le banc a mesuré qu'aucune affinité réseau n'est possible (claude.ai et ChatGPT
changent d'adresse à chaque requête), que `notifications/tools/list_changed` n'est relue que par
Claude Code, et que le code `ctx` en base porte tout ce qu'une session porterait. Les widgets MCP
Apps sont possibles, mais aucun retour d'utilisateur ne les demande encore.

## Décision

1. **Transport sans état** : Streamable HTTP, pas de `Mcp-Session-Id` persisté, pas de Redis,
   chaque requête reconstruit le serveur (`disableSse: true`). Tout l'état métier est en Postgres ;
   l'état conversationnel appartient à l'host ; le code `ctx` regroupe les appels.
2. Pas de notification serveur → client hors requête, pas de subscription de resources : ne pas
   en introduire sans rouvrir cet ADR. Une opération longue tient dans la requête (`maxDuration`
   sur la route) ; au-delà de 60 s, pattern « job + fonction de statut » derrière `call`.
3. **Texte seul dans la conversation** : aucun widget MCP Apps, aucune resource `ui://` ; les
   composants d'`ui/` serviront aux widgets plus tard, sur le retour des
   premiers utilisateurs. Tout résultat reste pleinement utilisable en texte (mcp-patterns § 5.3
   « Dégradation »).

## Conséquences

### Positives
- Simple, scale-to-zero, aucun Redis, tests légers ; compatible Vercel et Scaleway.
- Rien à invalider quand les règles changent : `ctx` le fait.

### Négatives
- Aucun push : une nouveauté n'atteint le modèle qu'à la conversation suivante ou au prochain
  appel — c'est le comportement mesuré et accepté (« Mises à jour sans geste »).
- Sans widget, une grille de tableau se lit en texte borné (mesure 3 : 45 000 caractères).

### Neutres
- Ce qui rouvrirait l'ADR : un besoin de notification serveur → client, inopérant de toute façon
  sur claude.ai et ChatGPT ; le retour des premiers utilisateurs pour les widgets.

## Alternatives considérées

### Transport avec état (sessions + SSE via Redis)
Coût Redis, fin du scale-to-zero, invalidation de session, tests plus lourds ; le seul gain
(`listChanged` poussé) n'est vu que par Claude Code. Rejetée.

### Widgets dans la conversation
Build Vite single-file, triple méta, matrice de hosts à maintenir, sans demande d'utilisateur.
Reportée.
