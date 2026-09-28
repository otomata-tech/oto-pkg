# Polices du design system

Copiées d'oto-frontend (`src/design-system/assets/fonts/`), sous-ensembles latins variables :

| Fichier | Famille | Rôle | Licence |
|---|---|---|---|
| `inter-variable.woff2` | Inter | texte de l'application | SIL Open Font License 1.1 |
| `jetbrains-mono-variable.woff2` | JetBrains Mono | étiquettes, repères, chiffres | SIL Open Font License 1.1 |

Chargées par `ui/ds/tokens/fonts.css` (`@font-face` locaux) : aucune requête vers un CDN.
Le texte de la licence et les mentions de copyright des deux familles (lues dans la table `name` des
fichiers) sont dans `OFL.txt`, à côté : l'OFL exige qu'ils accompagnent toute copie redistribuée.
