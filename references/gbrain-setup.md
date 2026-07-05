# GBrain Layer — Setup Notes and Known Traps

Everything below was learned building the reference deployment (2026-07-02 →
2026-07-04). `src/gbrain.js`, `src/provision.js`, and `src/doctor.js` encode
these; this file explains *why*.

## Architecture

- The vault and project folders are **canonical**. GBrain is a one-way derived
  index (verified: `import`/`sync`/`dream` never write back into source
  folders; only the explicit `export` command writes markdown out).
- Sync is registry-driven: `hooks/gbrain-sync.js` reads the SOS registry,
  dedupes nested sources, imports each top-level folder, embeds stale chunks.
  Hash-based incremental, so hourly runs are cheap.
- Rebuildability is the safety property: the whole brain re-imports from
  markdown in minutes, so engine migrations are re-inits, not data migrations.

## Storage engine: Postgres, not PGLite

PGLite (the default) is **single-writer**. Symptoms on a multi-session machine:
MCP serve processes fail with "Timed out waiting for PGLite lock", agents
silently fall back to other retrieval, and a single stale `gbrain serve` from a
forgotten terminal blocks every other session. Fix: `gbrain init --url
postgres://…` against Postgres 17 + pgvector. Concurrent serves + CLI + cron
sync then coexist fine.

## Local chat model wiring (the openrouter→Ollama redirect)

GBrain's native `ollama` provider is **embeddings-only** ("Provider 'ollama'
does not support touchpoint 'chat'"). For fully-local synthesis:

1. `provider_base_urls.openrouter = "http://localhost:11434/v1"` — written
   directly into `~/.gbrain/config.json` (the **file plane**). `gbrain config
   set` writes a DB plane the gateway ignores for base URLs. This is the #1
   silent-failure trap.
2. `models.think` / `models.default` = `openrouter:<model>` — these DO work
   via `gbrain config set` (DB plane).
3. `OPENROUTER_API_KEY=<any value>` must exist in EVERY gbrain process env
   (Ollama ignores auth, but gbrain's probe requires the variable): the MCP
   registration (`claude mcp add -e …`, codex `[mcp_servers.gbrain.env]`),
   and all scheduler jobs. Missing key → `think` degrades to gather-only
   ("no LLM available") and dream enrichment phases silently skip.

## Model split: think vs cycle

Run interactive `think` on the largest model that fits RAM, but background
cycle/dream work on a small fast model. A first full dream pass on a 14B model
over ~500 pages ran 13 hours and pinned ~13GB in RAM all day. Defaults in
`src/platform.js#suggestModels`. Also disable `cycle.propose_takes` unless the
takes feature is actually enabled — it burns LLM time with no consumer.

## Dream watchdog + run window

The dream job must be wrapped twice (`src/gbrain.js#jobSpecs` +
`src/scheduler.js#watchdogShellLine`):

1. **Hard kill after 2h** and `ollama stop <model>` on exit. First full
   enrichment passes can otherwise run 13+ hours.
2. **Run window (02:00–07:00)**: launchd and systemd both fire *missed*
   calendar jobs when a laptop wakes — so a 3:30am dream runs at 4pm the
   moment the lid opens, loading models mid-workday. The window guard exits
   immediately outside the window; a catch-up rule (no success recorded in
   72h AND before 09:00) keeps always-asleep-at-3:30 laptops dreaming
   eventually.

Cycle phases like `propose_takes` have **no enable gate**, and their USD
budget caps never bind on local models (unpriced calls are always allowed) —
so containment lives in the scheduler wrapper, not gbrain config.

Ollama's own behavior is fine — idle daemon ~54MB, models load on demand and
unload after 5 idle minutes — but only if nothing keeps requesting.

## Ollama context cap (the 24GB 4B model)

Without a server-side cap, one chat request can load a model at its **maximum
context window** — qwen3:4b at 262,144 tokens ≈ 24GB of KV cache for a 3GB
model. Fix: `OLLAMA_CONTEXT_LENGTH=32768` in the ollama server environment
(`src/gbrain.js#ensureOllamaContextCap`). On macOS **do not patch the brew
service plist** — `brew services restart` regenerates it and wipes custom env
(observed live). SOS instead stops brew's service and installs its own
`com.sos.ollama` launchd agent with the env baked in. Linux: systemd drop-in.
`sos doctor` checks the cap is in place.

## Ollama pulls fail silently

A network reset mid-pull can still exit 0. Never trust `ollama pull`'s exit
code; verify with `ollama list` (doctor does).

## macOS TCC (the pop-up problem)

Scheduled jobs run `node` outside the terminal's permission context, so macOS
prompts "Node wants to access Documents". A denial becomes **silent EPERM
failures** in jobs that write the vault. Setup must warn the user which
pop-ups are coming and what to click BEFORE the first scheduled run; recovery
is System Settings → Privacy & Security → Full Disk Access → add the node
binary. `sos doctor` surfaces recent EPERM lines from the distiller log.

## Transcript distiller

Distills finished Claude Code / Codex sessions into vault daily notes via a
headless `claude -p` (Haiku). Hard-won flags: `--strict-mcp-config`
(don't boot every MCP server per call), `--no-session-persistence` (no
transcript of the distill run → no self-distilling loops; the SENTINEL string
is the backup guard), `--disable-slash-commands`. `--bare` is NOT usable — it
drops auth. First run records a cutoff and never backfills history.
