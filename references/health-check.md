# SOS Health Check

Run:

```bash
sos health-check --repair
```

Checks:

- Registry v1 exists and project paths resolve.
- Vault project README links exist.
- Registry QMD collections exist.
- QMD collection contexts exist.
- QMD index is refreshed.
- Pending QMD embeddings are generated with `--max-docs-per-batch 4`.

Agents should run this after:

- New top-level project folder setup.
- Session saves.
- Project README updates.
- Decision records.
