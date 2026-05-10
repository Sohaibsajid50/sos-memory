---
description: Bootstrap SOS memory for a project folder
argument-hint: "<folder>"
allowed-tools: Bash(node:*), Bash(qmd:*)
---

Bootstrap SOS memory for the folder in `$ARGUMENTS`.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/sos.js" bootstrap-project "$ARGUMENTS"
node "${CLAUDE_PLUGIN_ROOT}/bin/sos.js" health-check --repair
```

If `$ARGUMENTS` is missing, ask for the project folder.
