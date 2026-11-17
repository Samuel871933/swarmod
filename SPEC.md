# swarmod — spec

## Objectif
Donner à n'importe quel agent IA une carte légère d'un projet (tout langage) et
l'aider à travailler par zones pour garder le contexte principal petit.

## Principes
- Cœur agnostique : fichiers markdown + CLI. Tout agent qui lit un fichier en profite.
- Zéro dépendance au départ (Node >= 18). Pas de LLM pour générer la carte.
- Incrémental : seuls les fichiers modifiés (mtime/taille) sont ré-analysés.

## Étapes
1. **`swarmod map [dir]`** (fait) — génère :
   - `.swarmod/map.md` : vue d'ensemble, une ligne par zone (budget ~2-3k tokens)
   - `.swarmod/zones/<zone>.md` : détail d'une zone (fichier → rôle, symboles, imports)
   - `.swarmod/cache.json` : cache incrémental
   Zones = dossiers, redécoupés tant qu'un dossier dépasse `MAX_ZONE` fichiers.
2. **Plugin Claude Code** (fait) :
   - hook `SessionStart` (`swarmod session`) : injecte les ordres partout ; rafraîchit et injecte la carte (projets git ou déjà opt-in),
     injecte `.swarmod/HANDOFF.md` une seule fois puis le renomme en `HANDOFF.done.md`.
   - hook `UserPromptSubmit` (`swarmod guard`) : rappelle à chaque prompt, partout (même dossier vide), de découper
     le travail qui se découpe (sans avoir à dire « swarmod ») ; lit la taille réelle du contexte dans le transcript ;
     au-delà de `SWARMOD_HANDOFF_TOKENS` (défaut 110000), demande à Claude d'écrire le handoff et de proposer `/clear`.
   - skill `swarmod` : l'agent principal coordonne (plan depuis la carte, fichiers partagés d'abord, workers parallèles, check final).
   - agents par grade : `swarmod:soldier` (haiku, lecture seule), `swarmod:lieutenant` (sonnet, édite, envoie des soldats), `swarmod:captain` (opus, cas durs, arbitrage).
   - hook `PostToolUse` (`refresh`) : carte rafraîchie après chaque édition, sans LLM.
   - hook `PreCompact` (`precompact`) : la compaction auto produit un handoff → reset auto avec `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`.
   - carte classée par PageRank sur le graphe d'imports (inspiré du repo map d'Aider / RepoMapper), cache versionné.

## Plus tard
Serveur MCP / `AGENTS.md` pour les autres agents, tree-sitter (remplace l'extracteur regex),
agents par zone générés, résumés LLM.

## Débat v0.3 (économiste des tokens × éclaireur de compétences, arbitré)
Adopté : `find` comme point d'entrée (préfixes de classe, nom de fichier, tests rétrogradés) ; zones actives d'après git
(30 derniers commits + non commité), repli mtime ; fichiers de zone plafonnés ~2k tokens ; refresh incrémental du seul
fichier édité + lint syntaxique silencieux (php, node, python, json) ; ligne `Checks:` ; règle de délégation par volume
à lire (< ~3k tokens → soi-même) ; découpage par feature avec listes de fichiers disjointes ; garde à 110k.
Supprimé : `$.env.set` de l'autocompact (non fiable d'après les issues GitHub). Rejeté : `refs`, LSP par défaut.
Mesuré : sous-agent restreint ~3.5k tokens au démarrage, général ~33k.

## v0.4 — chaîne de commandement
Général (agent principal) → capitaine (opus) → lieutenant (sonnet) → soldat (haiku) : 3 niveaux = profondeur max des sous-agents.
Tâche au grade le moins cher capable ; le général fournit fichiers et lignes aux soldats. Protocole commun :
preuve `path:line` pour tout fait, rapport `STATUS: done|blocked|contested`, pas de communication latérale (mémoire partagée =
lignes `NOTE <zone>: … — proof: …`, gardées par le hook `SubagentStop` (`intel`) si la ligne citée existe), blocage → remonte d'un grade,
fait douteux dont dépend une décision → paire de soldats PROUVER / RÉFUTER, désaccord → arbitrage par le supérieur, puis l'utilisateur.

## v0.5 — preuves vérifiées, plan en étapes, skills à la demande
Preuves vérifiées par code : le hook `SubagentStop` bloque une fois un rapport qui annonce un `check:` jamais exécuté ;
`STATUS: unproven` (ni prouvé ni réfuté) traité comme non fait ; les NOTE portent une citation `"<texte>"` vérifiée à ±2 lignes
et ré-ancrée (ou supprimée) quand le fichier change. Garde anti-affaiblissement des tests, journal + `swarmod stats`.
Pensée en étapes : `.swarmod/PLAN.md` (≥3 étapes, preuve attendue, dépendances, grade, skill), `swarmod plan`, ligne `Default steps:` dans chaque brief.
Skills à la demande : `swarmod skills <mots>` remplace le balayage de la liste native ; les skills `[library]` se lisent par `Read`.
Bug délégué : test qui échoue écrit d'abord, hors des fichiers du correcteur ; paire PROUVER/RÉFUTER avec RÉFUTER en `sonnet`.
La règle « déléguer seulement pour le parallélisme » est inchangée.
