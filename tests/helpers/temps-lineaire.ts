/**
 * La borne d'une lecture linéaire d'un texte hostile de la plus grande taille qu'un client envoie (100 000
 * caractères et plus ; `security-patterns.md § Validation des inputs`). Une lecture quadratique y met plus de
 * 3 s (mesuré sur `segmentsEnLigne`, revue 1 d'E05-S10) ; la lecture linéaire, jusqu'à 318 ms sur la machine
 * partagée par les agents, qui faisait échouer une borne de 250 ms. 1 000 ms attrape le temps quadratique
 * sans dépendre de la charge. Un texte plus court (40 000 caractères et moins) garde sa borne de 250 ms : un
 * temps quadratique y a été mesuré dès 0,4 s.
 */
export const TEMPS_LINEAIRE_MS = 1_000
