# AGENTS.md

Use SOS memory before asking for project context.

## Resume

1. Read the registry from the configured Claude config directory.
2. Resolve the current project by longest matching project path.
3. Read vault identity, the project page, today's daily note section, latest session handoff, and QMD context if available.
4. If `.continues-handoff.md` exists, read it after durable memory and treat it as bridge context.

## Save Session

Write a concise handoff to `.claude/sessions/`, append a daily note entry, and promote durable decisions into vault decision records when needed.

After saving a session, updating a project page, or bootstrapping a project, run:

```bash
sos health-check --repair
```

This validates registry paths, vault README links, QMD collections, QMD contexts, QMD index freshness, and pending embeddings.

## Canonical Memory

The vault, registry, QMD index, daily notes, decisions, and project pages are canonical. `.continues-handoff.md` is temporary.
