# SOS Memory Toolkit

This repo packages a portable durable-memory workflow for Claude, Codex, Gemini, QMD, and continues.

## Structure

- `.claude-plugin/plugin.json`: Claude Code plugin manifest.
- `.codex-plugin/plugin.json`: Codex plugin manifest.
- `commands/`: Claude plugin slash commands.
- `bin/sos.js`: npm CLI entrypoint.
- `src/`: command implementations and reusable utilities.
- `hooks/`: portable plugin hook config and hook scripts. Hooks derive config paths at runtime.
- `skills/`: installable agent workflow skills.
- `templates/`: vault, adapter, QMD, continues, and architecture templates.
- `references/`: implementation notes and schemas.
- `test/`: Node test suite.

## Development Rules

- Keep hooks portable. Do not hardcode home directories or machine-specific paths.
- Keep Claude and Codex plugin manifests in sync when adding capabilities.
- Treat continues handoffs as transient bridge context, not canonical memory.
- Keep GSD hooks out of v1.
- All write operations must support backups before overwriting user files.
- Prefer small modules with explicit behavior over broad framework code.

## Verification

Run:

```bash
npm test
```

Use `SOS_MEMORY_HOME`, `CLAUDE_CONFIG_DIR`, `SOS_DOCUMENTS_ROOT`, `SOS_VAULT_ROOT`, and `SOS_PENDING_ROOT` in tests or local dry runs to avoid touching real user memory.
