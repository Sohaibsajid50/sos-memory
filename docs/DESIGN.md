# SOS Memory — Design v2: Agent-Installed Memory OS

**Goal:** clone (or `claude plugin install`) → open Claude Code / Codex → the agent
interviews you in ≤3 rounds → full SOS memory system materialized: folders, vault,
registry, hooks, QMD + GBrain retrieval, local models, scheduled jobs, MCP wiring.
Targets: friend's laptop, VPS for clients, founder-OS deployments.
Brand: flagship "Own your stack" artifact for OpenSoh.

---

## 1. Current state audit (2026-07-04)

This repo already has the right skeleton — **dual-shaped plugin + CLI**:

| Area | Present | Notes |
|---|---|---|
| Plugin manifests | `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` | v0.1.0, minimal fields |
| Slash commands | 6 (`/sos-install`, `/sos-health`, `/sos-bootstrap-project`, …) | |
| Skills | `sos-memory`, `sos-bootstrap`, `sos-vault-maintenance` | runtime skills, no *setup interview* skill |
| Hooks | 6 generalized hooks + `_common.js`, `hooks.json` (health-check wired, `${CLAUDE_PLUGIN_ROOT}`) | QMD-era only |
| CLI | `bin/sos.js` → install/validate/health-check/bootstrap-project/update-qmd/embed/audit/continues | readline installer, env-overridable paths, backup-on-write |
| Templates | agent adapters (CLAUDE/AGENTS/GEMINI.md), vault pages, qmd collections, example registry | |
| Docs | `references/` (6 docs: registry schema, health-check, qmd-setup, adapters, …) | good pattern, keep |
| Tests | 6 test files incl. plugin packaging + install | keep the bar |

**Strengths to preserve:** dual plugin+CLI shape; env-overridable paths; write-with-backup;
references/ docs; tests; cross-agent adapters were designed in from the start.

## 2. Gap analysis (repo vs. the live system on Sohaib's Mac)

1. **Hook drift — all 6 hooks.** Live `~/.claude/hooks/*` evolved past the repo copies
   (registry longest-match resolution, async health-check, etc.). Live behavior must
   flow back into the repo *generalized* (no `/Users/ss` literals). Repo becomes the
   single source of truth; live machine reinstalls from it (dogfood test).
2. **Entire GBrain layer missing.** Not in repo: `gbrain-sync.js` (registry-driven
   import), Postgres 17 + pgvector provisioning, Ollama model management
   (think/cycle model split by RAM), the openrouter→local-Ollama chat wiring
   (incl. the file-plane `provider_base_urls` trap + dummy `OPENROUTER_API_KEY`
   in every process env), dream cycle + 2h watchdog + `ollama stop` on exit,
   MCP registration for Claude (`claude mcp add -e`) and Codex
   (`[mcp_servers.gbrain]` + env block), QMD-vs-GBrain routing block for CLAUDE.md.
3. **Transcript distiller missing.** `transcript-distiller.js` + loop-guard sentinel,
   retry/attempts state, `--strict-mcp-config --no-session-persistence` lean flags,
   per-agent parsers (Claude jsonl, Codex rollout; Gemini slot).
4. **No scheduler layer.** Repo automation is Claude-hook-triggered only. Need
   `templates/launchd/*.plist` (macOS) and `templates/systemd/` + cron (VPS),
   with watchdog wrappers baked in.
5. **No agent-native onboarding.** `sos install` is a readline wizard. Add
   `skills/sos-setup/SKILL.md`: ≤3-round interview → writes `~/.sos/sos.config.yaml`
   → `sos apply` generates registry, folders, hooks, jobs, MCP registrations,
   CLAUDE.md/AGENTS.md/GEMINI.md blocks. Idempotent: edit config → re-apply.
6. **No profiles.** `profiles/laptop.yaml` (launchd, TCC, local Ollama) vs
   `profiles/vps.yaml` (systemd, docker-compose: postgres+pgvector, ollama,
   `gbrain serve --http` with OAuth client tokens). Same templates, two renderers.
7. **Doctor gaps.** `sos health-check` covers registry/vault/QMD. Add every incident
   from the reference build: launchd-context **TCC write test to the vault** (silent
   EPERM), Ollama daemon + models present (`ollama list`, not exit codes — pulls
   fail silently), Postgres up + pgvector ext, MCP connectivity + stale
   `gbrain serve` lock detection, gbrain config-plane check (base_urls in file
   plane), dream watchdog present, distiller state sane (given-up entries surfaced).
8. **Permissions are undocumented.** Add `PERMISSIONS.md` + a preflight step in the
   setup skill that tells the user which macOS pop-ups are coming ("Node wants to
   access Documents") and what to click *before* triggering them; document the
   Full-Disk-Access fallback path when a denial is already recorded.
9. **Plugin/marketplace polish.** plugin.json lacks homepage/repository/category;
   add a `marketplace.json` so friends can `claude plugin marketplace add
   <user>/sos-memory` and install with pinned sha (superpowers convention). Ship
   `.mcp.json` so the plugin itself declares the gbrain MCP server. Pin gbrain/QMD
   versions; `sos update` bumps deliberately.
10. **Repo-root agent files.** CLAUDE.md exists; ensure root CLAUDE.md/AGENTS.md say:
    "fresh install → invoke skills/sos-setup; never write into user data dirs;
    read references/ before editing hooks."
11. **Tests** for: gbrain-sync, distiller parsers (fixture transcripts), apply
    idempotency, doctor checks (each with a fault-injection fixture).

## 3. Interview design (hard cap: 3 rounds)

- **R1 — Context:** laptop or VPS? What do you do; name your ventures/projects
  (→ numbered folders + registry). Which agents (Claude/Codex/Gemini)?
- **R2 — Stack (defaults preselected, tradeoffs one line each):** retrieval
  QMD/GBrain/both; models auto-suggested from detected RAM (64GB → qwen3:14b think
  + qwen3:4b cycle; 16GB → qwen3:4b; or Anthropic API key); transcript capture
  on/off per agent.
- **R3 — Confirm:** render the plan (folders, jobs, models, disk/RAM budget, the
  exact permission pop-ups they'll see) → execute → `sos doctor` → print a
  "try these questions" card.

## 4. Milestones (mapped onto the existing repo)

- **M1 — Reconcile + port:** sync live hook improvements back (generalized);
  add gbrain-sync, distiller, scheduler templates, doctor checks; `sos apply`
  regenerates this Mac from a fresh config with zero drift (acceptance test).
- **M2 — Agent onboarding:** sos-setup skill + sos.config.yaml + interview;
  fresh macOS account → working system in one conversation.
- **M3 — VPS profile:** docker-compose + systemd + `gbrain serve --http`;
  client/founder-OS deployment guide.
- **M4 — Release:** marketplace.json, README rewrite, OpenSoh branding, demo
  video ("watch my agent install its own memory"), friend beta.

## 5. Open questions

1. Gemini CLI: instruction-file-only capture (no lifecycle hooks) — acceptable for v1?
2. GBrain pinning: `bun install github:garrytan/gbrain#<sha>` in apply; bump via `sos update`?
3. Windows/WSL2 out of scope for v1?
4. Multi-tenant VPS (per-client brains + OAuth scopes): M3 or post-release?
5. Repo rename: `sos-memory` → `sos`? (OpenSoh branding decision, affects plugin name)
