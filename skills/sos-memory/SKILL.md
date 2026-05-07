# SOS Memory

Use when resuming or saving durable project memory.

## Resume Workflow

1. Resolve the project from the v1 registry by longest path match.
2. Read vault identity, project README, today's daily note, latest local handoff, and QMD context.
3. Read `.continues-handoff.md` only after durable memory.
4. Treat continues content as temporary bridge context.

## Save Workflow

1. Write a concise session handoff under `.claude/sessions/`.
2. Append a short daily note entry.
3. Promote durable decisions to dated decision records.
4. Update project pages only when project state changed.
5. Run `sos health-check --repair` so registry, vault, QMD collections, contexts, index freshness, and embeddings are validated.
