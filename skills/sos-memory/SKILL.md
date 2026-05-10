# SOS Memory

Use when resuming or saving durable project memory.

## Resume Workflow

1. Resolve the project from the v1 registry by longest path match.
2. Read vault identity, project README, today's daily note, latest local handoff, and QMD context.
3. Query QMD before asking the user when older memory, prior decisions, research, project history, implementation details, or session context may be relevant.
4. Use `qmd query "natural language question"` for semantic/vector retrieval and `qmd search "exact keywords"` for exact names, identifiers, filenames, and code terms.
5. Read `.continues-handoff.md` only after durable memory.
6. Treat continues content as temporary bridge context.

## Save Workflow

1. Write a concise session handoff under `.claude/sessions/`.
2. Append a short daily note entry.
3. Promote durable decisions to dated decision records.
4. Update project pages only when project state changed.
5. Run `sos health-check --repair` so registry, vault, QMD collections, contexts, index freshness, and embeddings are validated.

## Bootstrap Workflow

Use `sos bootstrap-project <folder>` or `/sos-memory:sos-bootstrap-project <folder>` for new project folders. Bootstrap must register the folder, create the vault page, configure QMD, run a repair health check, update the QMD index, and embed pending documents so vectors exist for retrieval.
