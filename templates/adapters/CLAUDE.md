# CLAUDE.md

Use SOS memory before asking the user for old project context.

## QMD Retrieval

- When older memory, prior decisions, research, project history, implementation details, or session context may be relevant, query QMD before asking the user.
- Use `qmd query "natural language question"` for semantic/vector retrieval.
- Use `qmd search "exact keywords"` for exact names, identifiers, filenames, and code terms.
- Filter to the resolved project collection when possible; otherwise search the vault and relevant project collections.
- Treat QMD results as retrieval context. Confirm important claims against source files or vault notes before making changes.

## QMD Update And Embed

- After bootstrapping a project, run `sos bootstrap-project <folder>` or `/sos-memory:sos-bootstrap-project <folder>`. The command verifies registry/vault/QMD setup, runs `qmd update`, and embeds pending documents.
- After saving a session, changing vault project pages, adding important markdown notes, or creating new project folders, run `sos health-check --repair`.
- Use `sos update-qmd` when files changed and only lexical/index freshness is needed.
- Use `sos embed` when `qmd status` reports documents needing embedding, or after adding substantial new project/vault documents.

## Canonical Memory

The registry, vault project pages, daily notes, decision records, and QMD index are canonical. `.continues-handoff.md` is temporary bridge context and should be promoted into durable memory when valuable.
