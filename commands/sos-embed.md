---
description: Embed pending QMD documents using the SOS batch cap
allowed-tools: Bash(node:*), Bash(qmd:*)
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/sos.js" embed
```

This uses `qmd embed --max-docs-per-batch 4`.
