---
name: sos-setup
description: Agent-native onboarding for SOS Memory. Interviews the user, writes ~/.sos/sos.config.json, builds the folder structure + vault + registry, provisions QMD/GBrain/Ollama/Postgres, installs scheduled jobs and MCP wiring, then verifies with sos doctor. Use when the user says "set me up", "install sos", "set up my memory", "onboard me", or runs /sos-setup in this repo.
---

# SOS Setup — Interview and Install

USE WHEN the user asks to set up SOS Memory on this machine (laptop or VPS).
You are the installer: interview briefly, then build everything and verify.

Four phases: **Pre-flight → Interview → Execute → Verify & handoff**.

## Ground rules

- **Use AskUserQuestion for every choice question** when the tool is available
  (Claude Code). You MUST pass both `label` AND `description` for every
  option — the description is what lets the user decide. Never leave
  `description` empty. Mark the sensible default `(Recommended)` and list it
  first. Batch related questions into ONE AskUserQuestion call (it supports up
  to 4 questions per call).
- **No AskUserQuestion available** (Codex, other hosts): ask the same
  questions as ONE compact numbered message per round; accept free-text
  answers; apply the marked defaults for anything skipped.
- **Respect the user's time.** Aim for 3–4 interactions total. Accept walls of
  text, uploaded files, or "skip" — extract what you can, never interrogate.
  If an answer covers a later question, don't ask it again.
- **Free-text answers beat menus for identity.** Who the user is and what they
  work on is one open question, BenAI-style — not a form.
- **Tiered execution** (borrowed from `gbrain onboard`): commands that only
  touch user-space run automatically; anything needing `sudo`, large downloads
  (>1 GB), or account credentials is shown first and confirmed.
- **Never overwrite existing memory.** If a vault, registry, or config already
  exists, switch to re-run/repair mode (Phase 0).
- Work silently during builds — report at phase boundaries, not per file.

## Phase 0 — Pre-flight

1. From the repo root, run: `node bin/sos.js platform` — capture OS, scheduler,
   RAM, package manager, and suggested models. On failure, ask the user to
   install Node ≥18 first (give the command for their platform) and stop.
2. Check for an existing installation: `~/.sos/sos.config.json`, the registry
   (`~/.claude/projects.json` or `$CLAUDE_CONFIG_DIR/projects.json`), and a
   vault directory.
3. **If any exist**, ask (AskUserQuestion, header "Existing setup"):
   - `Re-run interview (Recommended)` — keep memory, update config and re-apply
   - `Repair only` — skip questions, run `sos apply` + `sos doctor`
   - `Cancel` — do nothing
4. **If nothing exists**, continue to Phase 1.

## Phase 1 — Interview

### Round 1 — machine and agents (one AskUserQuestion call, 2 questions)

- **Q1 header "Machine"**: "What is this machine for?"
  - `Personal laptop (Recommended if not headless)` — full setup: vault,
    session capture, local models, scheduled jobs
  - `Server / VPS` — headless profile: same system, systemd/cron scheduling,
    designed for agents accessing business context remotely
  Preselect from platform detection (`headless` → VPS first + Recommended).
- **Q2 header "Agents", multiSelect: true**: "Which AI coding agents do you
  use?" Options: `Claude Code`, `Codex`, `Gemini CLI` — mark each detected on
  PATH as `(Recommended)`; note in the description if not detected.

### Round 2 — identity and projects (one open free-text question, no menu)

Ask exactly this, as a normal message:

> **Tell me about yourself and what you're working on.**
> Paste anything — a bio, your ventures/clients/projects with a line each,
> a LinkedIn profile, project briefs. The more you give, the better your
> agents' memory starts. Or say "skip" to start minimal.

Extract silently: owner identity (name, role, one-line description), and a
project list. For each project derive: numbered folder name (`01-<Name>`),
registry id/label, QMD collection slug, daily-note section. If the user gave
rich detail for a project, keep it for the project README. **No follow-up
questions** — skip means defaults (a `01-Projects` starter folder only).

### Round 3 — stack (one AskUserQuestion call, up to 3 questions)

- **Q1 header "Retrieval"**: "How should memory retrieval work?"
  - `QMD + GBrain (Recommended)` — keyword/vector search plus a local
    knowledge graph with synthesized, cited answers; needs Postgres + Ollama
  - `QMD only` — lightweight local search; no graph/synthesis; fewest moving
    parts
  - `GBrain only` — graph + synthesis without the lexical layer
- **Q2 header "Models"** (skip if GBrain not chosen): build options from
  platform detection. Example for 64 GB RAM:
  - `qwen3:14b + qwen3:4b (Recommended)` — "fits your 64GB; 14B answers your
    questions, 4B runs nightly enrichment; ~12 GB disk"
  - `qwen3:4b only` — "lighter: ~3 GB disk, faster, lower answer quality"
  - `Anthropic API key` — "highest quality synthesis; per-call cost; key stored
    in gbrain config"
  Under 12 GB RAM: offer only the API option and say why.
- **Q3 header "Capture", multiSelect: true**: "What should be captured
  automatically?"
  - `Session summaries (Recommended)` — on session end, a 3–6 bullet digest
    into the daily note
  - `Transcript distiller (Recommended)` — hourly job digests finished
    Claude/Codex sessions (uses a small headless model call per session)
  - `Action log` — audit line for every agent file-write under Documents

### Round 4 — confirm the plan

Render the full plan compactly, then confirm (AskUserQuestion, header "Plan"):

```
Profile: laptop (macos/arm64, 64GB, launchd)
Folders:  ~/Documents/01-Acme-Corp, 02-Side-Project, 05-Personal/vault
Registry: 2 projects + Personal HQ
Retrieval: QMD (2 collections) + GBrain (Postgres 17 + pgvector)
Models:   qwen3:14b (think) + qwen3:4b (cycle) + nomic-embed-text (~12.5 GB download)
Jobs:     gbrain-sync hourly · transcript-distiller hourly · dream 3:30am (2h cap)
MCP:      gbrain → Claude Code, Codex
Installs needing confirmation: postgresql@17 (brew), ollama (brew)
⚠ macOS will show pop-ups: "Node wants to access Documents" — click Allow.
```

Options: `Proceed (Recommended)` / `Adjust` (ask what to change, loop once) /
`Cancel`. On macOS, the TCC warning is mandatory in the plan — the user must
know the pop-ups are coming and that **Allow** is the right answer BEFORE the
first scheduled job triggers them; a denial becomes silent write failures.

## Phase 2 — Execute

Work through this order; stop and report on any failure:

1. **Config** — write `~/.sos/sos.config.json` (version 1: profile, retrieval,
   gbrain models + databaseUrl, distiller, agents) from the interview.
2. **Folders + vault** — create the numbered project folders and the vault
   skeleton (`Daily/`, `Projects/<Project>/README.md`, `Context/me.md` filled
   with the identity from Round 2, `00-Inbox/`). Use `templates/vault/` files
   as the base. Never overwrite an existing file.
3. **Registry** — `node bin/sos.js install --auto --yes` (hooks, skills,
   adapters), then `node bin/sos.js bootstrap-project <folder>` per project.
4. **Provision** — run `node bin/sos.js apply`. It prints the provisioning
   plan. Execute the INSTALL commands it lists: user-space ones directly;
   `sudo`/brew-install/large-download ones only after the Phase 1 Round 4
   confirmation covered them (it did — proceed; re-confirm only if something
   NEW appears). After each install, run the step's `verify` command —
   especially `ollama list` after model pulls (pulls can fail silently).
5. **Wire** — re-run `node bin/sos.js apply` until it reports jobs installed
   and MCP registered (idempotent).
6. **Adapters** — append the SOS routing block to the user's agent instruction
   files (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.gemini/GEMINI.md`)
   from `templates/adapters/` — only the sections that match the chosen stack,
   and only if not already present.

## Phase 3 — Verify and hand off

1. Run `node bin/sos.js doctor`. Fix FAIL lines (they include remediation);
   re-run until clean or explain any remaining failure honestly.
2. If GBrain is enabled, run one real end-to-end test: ask GBrain to sync one
   project (`node hooks/gbrain-sync.js` once) and then `gbrain query` a term
   the user mentioned in Round 2. Show the hit.
3. Print the handoff card:

```
✅ SOS Memory is live.

Try these in a NEW session:
  · "what do we know about <project from their list>?"   (GBrain synthesis)
  · "find the note where..."                              (QMD search)
  · just work — today's session will appear in the vault daily note

Your memory lives in: <documents root>  (plain markdown — yours)
Health check any time: node bin/sos.js doctor
Change anything:       edit ~/.sos/sos.config.json, run sos apply
```

4. Append a setup record to the vault daily note (what was installed, chosen
   models, anything skipped) so the system's first memory is its own birth.
