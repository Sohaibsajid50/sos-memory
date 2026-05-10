---
description: Validate and repair SOS registry, vault, QMD collections, contexts, index, and embeddings
allowed-tools: Bash(node:*), Bash(qmd:*)
---

Run the SOS memory health check.

Use:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/sos.js" health-check --repair
```

Report any warnings or repairs clearly. If `${CLAUDE_PLUGIN_ROOT}` is not available, run from the plugin root with:

```bash
node bin/sos.js health-check --repair
```
