# QMD Setup

Detection order:

1. `which qmd`
2. `~/.local/bin/qmd`
3. `/usr/local/bin/qmd`

If missing, print:

```text
Install QMD: npm install -g @tobilu/qmd
```

## Retrieval Rules

- Use `qmd query "natural language question"` for semantic/vector retrieval.
- Use `qmd search "exact keywords"` for exact names, identifiers, filenames, and code terms.
- Query QMD before asking the user for older memory, previous decisions, research, project history, or session context.
- Filter to the resolved project collection when possible.

## Update And Embed Rules

- `sos bootstrap-project <folder>` verifies registry/vault/QMD setup, runs `qmd update`, and embeds pending documents.
- Use `sos update-qmd` after file changes when lexical/index freshness is enough.
- Use `sos embed` when `qmd status` reports pending embeddings or after adding substantial new vault/project notes.
