# AGENTS.md

Use SOS memory before asking for project context.

## QMD Retrieval

- When older memory, previous decisions, research, project history, implementation details, or session context may be relevant, query QMD before asking the user.
- Use `qmd query "natural language question"` for semantic/vector retrieval.
- Use `qmd search "exact keywords"` for exact names, identifiers, filenames, and code terms.
- Filter to the resolved project collection when possible; otherwise search the vault and relevant project collections.
- Treat QMD results as retrieval context. Confirm important claims against source files or vault notes before making changes.

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

After adding a new project folder, prefer `sos bootstrap-project <folder>` or `/sos-memory:sos-bootstrap-project <folder>`. Bootstrap registers the folder, creates the vault page, configures QMD, runs `qmd update`, and embeds pending documents so vectors exist for retrieval.

Use `sos update-qmd` when files changed and only index freshness is needed. Use `sos embed` when `qmd status` reports documents needing embedding, or after substantial new project/vault notes are added.

## Canonical Memory

The vault, registry, QMD index, daily notes, decisions, and project pages are canonical. `.continues-handoff.md` is temporary.
