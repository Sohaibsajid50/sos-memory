# sos-memory

Reusable Git repo toolkit for durable project memory across Claude, Codex, Gemini, QMD, and continues.

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
