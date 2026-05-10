# sos-memory

Reusable Git repo toolkit and Claude/Codex plugin bundle for durable project memory across Claude, Codex, Gemini, QMD, and continues.

## Plugin Layout

This repo is intentionally dual-shaped:

- Claude Code plugin manifest: `.claude-plugin/plugin.json`
- Codex plugin manifest: `.codex-plugin/plugin.json`
- Claude slash commands: `commands/`
- Shared skills: `skills/`
- Plugin hooks: `hooks/hooks.json`
- Node CLI: `bin/sos.js`
- Shared implementation: `src/`

Claude Code can load it locally with:

```bash
claude --plugin-dir /path/to/sos-memory
```

Codex-compatible hosts should use the `.codex-plugin/plugin.json` manifest and the same `skills/` and `hooks/` directories.

## Commands

```bash
npm test
node bin/sos.js install --dry-run
node bin/sos.js install --auto
node bin/sos.js validate
node bin/sos.js health-check --repair
node bin/sos.js bootstrap-project /absolute/project/path
node bin/sos.js update-qmd
node bin/sos.js embed
node bin/sos.js audit-vault
node bin/sos.js continues
```

Claude plugin slash commands:

```text
/sos-memory:sos-health
/sos-memory:sos-install
/sos-memory:sos-validate
/sos-memory:sos-bootstrap-project <folder>
/sos-memory:sos-update-qmd
/sos-memory:sos-embed
```

## Memory Model

Canonical memory lives in:

- Registry: `projects.json`
- Vault: daily notes, project pages, decisions, identity, and action log
- QMD: local search index over vault and project collections

Bridge context lives in `.continues-handoff.md` and should be promoted into canonical memory when valuable.

## Health Check

Run after session saves, project page updates, and new top-level project folders:

```bash
node bin/sos.js health-check --repair
```

It validates registry paths, vault README links, QMD collections, QMD contexts, QMD index freshness, and pending embeddings.

The plugin hook also runs this check automatically after memory-sensitive `Write`, `Edit`, `MultiEdit`, or `Bash` usage. Hook mode is throttled to avoid running full QMD maintenance after every small tool call.
