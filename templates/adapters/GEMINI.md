# GEMINI.md

Follow the SOS memory protocol for project context.

- Resolve projects from the registry.
- Query QMD before asking the user when older memory, prior decisions, research, project history, implementation details, or session context may be relevant.
- Use `qmd query "natural language question"` for semantic/vector retrieval.
- Use `qmd search "exact keywords"` for exact names, identifiers, filenames, and code terms.
- Prefer vault and QMD context before asking the user for background.
- Treat continues handoffs as session-transfer context only.
- Save durable outcomes into daily notes, project pages, and decision records.
- After session saves, project updates, or project bootstraps, run `sos health-check --repair`.
- After adding a project folder, use `sos bootstrap-project <folder>` so registry, vault page, QMD collection/context, index update, and embeddings are verified.
- Use `sos update-qmd` for index freshness and `sos embed` when `qmd status` reports pending embeddings.
