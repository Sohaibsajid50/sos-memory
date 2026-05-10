---
description: Dry-run or install SOS memory using portable local paths
argument-hint: "[--dry-run|--auto]"
allowed-tools: Bash(node:*), Bash(npm:*)
---

Install or dry-run the SOS memory toolkit.

Default to dry-run unless the user explicitly approves installation:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/sos.js" install --dry-run
```

If approved, use environment variables for portable paths before running `install --auto`.
