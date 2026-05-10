# Plugin Packaging

SOS Memory is packaged for both Claude Code and Codex-compatible plugin hosts.

## Claude Code

Claude Code requires:

- `.claude-plugin/plugin.json`
- plugin components at plugin root, such as `skills/`, `commands/`, `hooks/`, `bin/`, and `.mcp.json`
- hook configuration in `hooks/hooks.json`

Local test:

```bash
claude --plugin-dir /path/to/sos-memory
```

Claude namespaced commands use:

```text
/sos-memory:sos-health
```

## Codex

Codex-compatible local plugin packaging requires:

- `.codex-plugin/plugin.json`
- optional `skills`, `hooks`, `mcpServers`, and app paths declared in the manifest

This repo declares:

```json
{
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json"
}
```

## Shared Implementation

Both plugin formats call the same Node implementation:

- `bin/sos.js`
- `src/`
- `hooks/sos-health-check.js`
