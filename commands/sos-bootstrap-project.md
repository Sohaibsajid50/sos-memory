---
description: Bootstrap SOS memory for a project folder
argument-hint: "<folder>"
allowed-tools: Bash(node:*), Bash(qmd:*)
---

Bootstrap SOS memory for the folder in `$ARGUMENTS`.

If `$ARGUMENTS` is not an existing folder path, do not treat the words as a literal folder. Search the current workspace and home directory for likely matching folders, show the best candidates, and ask the user to choose one.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/sos.js" bootstrap-project "$ARGUMENTS"
```

The bootstrap command registers the folder, creates the vault page, configures QMD, runs a repair health check, updates the QMD index, and embeds pending documents so vectors exist for the new project. After it completes, report whether health-check passed and whether QMD had pending embeddings before repair.

If `$ARGUMENTS` is missing, ask for the project folder.
