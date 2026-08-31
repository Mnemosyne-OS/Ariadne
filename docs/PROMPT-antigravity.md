# Prompt à donner à Antigravity

À coller tel quel dans Antigravity, sur cette machine. Il est écrit pour qu'il
n'ait pas à refaire l'enquête déjà faite, et pour que sa réponse soit
directement exploitable.

---

Tu tournes sur cette machine Windows. J'ai besoin de savoir **où tu écris tes
conversations sur le disque**, dans un format lisible sans toi.

## Contexte

J'écris un lecteur externe qui affiche les sessions de plusieurs agents de code
côte à côte. Il fonctionne déjà pour Claude Code, qui écrit un fichier JSONL par
session dans `~/.claude/projects/<projet>/<sessionId>.jsonl`, une ligne JSON par
événement. Le lecteur ouvre ces fichiers en lecture seule et n'exécute rien.

## Ce que j'ai déjà vérifié moi-même, ne le refais pas

- `~/.antigravity` et `~/.antigravity-ide` ne contiennent que `argv.json` et
  `extensions`.
- `%APPDATA%/Antigravity/User/globalStorage/state.vscdb` est une base SQLite.
  Sa table `ItemTable` contient la clé
  `antigravityUnifiedStateSync.trajectorySummaries`, 260 420 octets.
- Cette valeur est une chaîne **base64**. Décodée, elle fait 195 314 octets et
  commence par `0a e8 2a 0a 24` suivi d'un UUID : c'est du **protobuf**
  (champ 1, wiretype 2). Il y a une **seconde couche de base64** imbriquée à
  l'intérieur, qui contient au moins un titre de conversation.
- Les `workspaceStorage/*/state.vscdb` portent `chat.ChatSessionStore.index`
  (26 octets) et `antigravity.agentViewContainerId.state`.

Donc : je sais déjà que l'état est en SQLite et en protobuf. **Ce n'est pas ma
question.**

## Mes questions, dans cet ordre

1. **Existe-t-il un dossier où tu écris les conversations en clair** — JSON,
   JSONL, markdown, n'importe quel texte — en dehors de `state.vscdb` ? Donne le
   chemin absolu exact. Regarde aussi : un dossier de logs, un cache de
   trajectoires, un export, un répertoire par workspace.

2. Si oui : **montre-moi une ligne ou un objet réel** (tu peux caviarder le
   contenu), et dis-moi quel champ porte, pour une conversation :
   - son identifiant
   - son titre
   - l'horodatage de sa dernière activité
   - le modèle utilisé
   - le dossier de travail et la branche git
   - le nom de l'outil appelé
   - ce que l'humain a tapé, distinct de la sortie des outils

3. Si non, dis-le franchement : « tout est dans `state.vscdb`, il n'y a pas de
   copie en clair ». C'est une réponse utile, je ne veux pas d'approximation.

4. Y a-t-il un réglage, un flag ou une commande qui fait écrire un journal en
   clair (`antigravity.*.log`, un mode debug, un export de trajectoire) ?

## Contraintes de la réponse

- **Ne propose pas de code qui parse le protobuf.** Sans le `.proto` officiel
  c'est de la rétro-ingénierie d'un format binaire qui peut changer en silence.
- **Ne devine pas.** Si tu n'es pas sûr d'un chemin, dis que tu n'es pas sûr.
  Un chemin inventé me coûtera plus cher que « je ne sais pas ».
- Vérifie ce que tu affirmes en listant réellement les dossiers, ne réponds pas
  de mémoire sur ton propre produit.

## Le format que j'attends au bout

Si un dossier en clair existe, ta réponse finit par ceci, rempli :

```json
{
  "id": "antigravity",
  "displayName": "Antigravity",
  "version": "1.0.0",
  "format": "jsonl",
  "kind": "session",
  "folderHint": "<chemin relatif au dossier personnel>",
  "filePattern": ".jsonl",
  "fields": {
    "timestamp": "<chemin.vers.le.champ>",
    "model": "<...>",
    "projectPath": "<...>",
    "branch": "<...>",
    "sessionId": "<...>",
    "isSidechain": "<... ou omets si ça n'existe pas>"
  },
  "title": { "where": { "type": "<...>" }, "take": "<...>" },
  "action": { "path": "<...>[]", "where": { "type": "tool_use" }, "take": "name" },
  "humanTurn": {
    "where": { "type": "user" },
    "notWhen": { "path": "<...>[]", "has": "tool_result" },
    "text": "<...>"
  }
}
```

Les chemins utilisent le point pour descendre dans un objet et un `[]` final
pour parcourir un tableau. Un champ qui n'existe pas chez toi, tu l'omets : je
préfère une colonne vide à un champ inventé.
