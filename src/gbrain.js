/**
 * GBrain integration — encodes the working configuration discovered while
 * building the reference deployment (2026-07), including its traps:
 *
 * - GBrain's native ollama provider is EMBEDDINGS-ONLY. Local chat goes
 *   through the `openrouter` provider recipe pointed at Ollama's
 *   OpenAI-compatible endpoint (http://localhost:11434/v1).
 * - `provider_base_urls` must live in the FILE plane (~/.gbrain/config.json).
 *   `gbrain config set` writes a DB plane the gateway ignores for base URLs.
 * - Every gbrain process needs OPENROUTER_API_KEY set (any dummy value —
 *   Ollama ignores auth). Without it, `think` degrades to gather-only and
 *   dream-cycle enrichment phases silently skip.
 * - PGLite is single-writer: concurrent MCP serves + sync jobs deadlock.
 *   Multi-session machines need Postgres + pgvector.
 * - Dream cycles can run away on large first passes: cap with a watchdog and
 *   run background phases on a small model (`models.default`), keeping the
 *   large model only for interactive `think` (`models.think`).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const GBRAIN_HOME = path.join(os.homedir(), '.gbrain');
const GBRAIN_CONFIG_PATH = path.join(GBRAIN_HOME, 'config.json');
const OLLAMA_OPENAI_URL = 'http://localhost:11434/v1';
const DUMMY_OPENROUTER_KEY = 'ollama';
const DREAM_TIMEOUT_SECONDS = 2 * 60 * 60;

/** Merge required keys into ~/.gbrain/config.json (file plane). */
function ensureFilePlaneConfig({ databaseUrl, embeddingModel } = {}) {
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(GBRAIN_CONFIG_PATH, 'utf8'));
  } catch (_) {}
  const next = {
    ...config,
    ...(embeddingModel ? { embedding_model: embeddingModel } : {}),
    provider_base_urls: { ...(config.provider_base_urls || {}), openrouter: OLLAMA_OPENAI_URL }
  };
  fs.mkdirSync(GBRAIN_HOME, { recursive: true });
  fs.writeFileSync(GBRAIN_CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

/** DB-plane model settings (these DO work via `gbrain config set`). */
function setModelConfig(gbrainBin, { thinkModel, cycleModel }) {
  const results = [];
  const set = (key, value) => {
    const run = spawnSync(gbrainBin, ['config', 'set', key, value], {
      encoding: 'utf8',
      timeout: 60000,
      env: { ...process.env, OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || DUMMY_OPENROUTER_KEY }
    });
    results.push({ key, value, ok: run.status === 0, error: run.status === 0 ? null : run.stderr.trim() });
  };
  if (thinkModel) set('models.think', `openrouter:${thinkModel}`);
  if (cycleModel) set('models.default', `openrouter:${cycleModel}`);
  set('cycle.propose_takes.enabled', 'false');
  return results;
}

/** Scheduler job specs for the GBrain + distiller background layer. */
function jobSpecs({ nodeBin, gbrainBin, ollamaBin, hooksDir, cycleModel, thinkModel }) {
  const env = {
    PATH: [path.dirname(gbrainBin || ''), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
      .filter(Boolean)
      .join(path.delimiter),
    OPENROUTER_API_KEY: DUMMY_OPENROUTER_KEY
  };
  const jobs = [
    {
      id: 'gbrain-sync',
      command: [nodeBin, path.join(hooksDir, 'gbrain-sync.js')],
      env,
      schedule: { intervalSeconds: 3600 }
    },
    {
      id: 'transcript-distiller',
      command: [nodeBin, path.join(hooksDir, 'transcript-distiller.js')],
      env: { PATH: env.PATH },
      schedule: { minute: 45 }
    }
  ];
  if (gbrainBin) {
    jobs.push({
      id: 'gbrain-dream',
      command: [gbrainBin, 'dream'],
      env,
      schedule: { hour: 3, minute: 30 },
      timeoutSeconds: DREAM_TIMEOUT_SECONDS,
      onExit: [cycleModel && ollamaBin ? `${ollamaBin} stop ${cycleModel}` : null,
        thinkModel && ollamaBin ? `${ollamaBin} stop ${thinkModel}` : null].filter(Boolean)
    });
  }
  return jobs;
}

/** Shell commands to register the gbrain MCP server with each agent CLI. */
function mcpRegistrationCommands({ gbrainBin }) {
  return {
    claude: `claude mcp add --scope user gbrain -e OPENROUTER_API_KEY=${DUMMY_OPENROUTER_KEY} -- ${gbrainBin} serve`,
    codexToml: [
      '[mcp_servers.gbrain]',
      `command = "${gbrainBin}"`,
      'args = ["serve"]',
      '',
      '[mcp_servers.gbrain.env]',
      `OPENROUTER_API_KEY = "${DUMMY_OPENROUTER_KEY}"`
    ].join('\n')
  };
}

/** Doctor checks for the GBrain layer. Returns { id, ok, detail } entries. */
function doctorChecks({ gbrain, ollama, postgres, requiredModels = [] }) {
  const checks = [];

  checks.push({
    id: 'gbrain_installed',
    ok: Boolean(gbrain.found),
    detail: gbrain.found ? gbrain.path : gbrain.guidance
  });

  if (gbrain.found) {
    const baseUrls = (gbrain.config && gbrain.config.provider_base_urls) || {};
    checks.push({
      id: 'gbrain_file_plane_base_url',
      ok: baseUrls.openrouter === OLLAMA_OPENAI_URL,
      detail: baseUrls.openrouter
        ? `openrouter -> ${baseUrls.openrouter}`
        : 'provider_base_urls.openrouter missing from ~/.gbrain/config.json (gbrain config set writes the DB plane, which the gateway ignores)'
    });
    const engineIsPglite = gbrain.config && String(gbrain.config.database_path || '').includes('pglite');
    checks.push({
      id: 'gbrain_engine_multiwriter',
      ok: !engineIsPglite,
      detail: engineIsPglite
        ? 'PGLite is single-writer: concurrent agent sessions will fail to connect. Migrate to Postgres+pgvector.'
        : 'postgres engine'
    });
  }

  checks.push({
    id: 'ollama_running',
    ok: Boolean(ollama.found && ollama.running),
    detail: ollama.found ? (ollama.running ? 'daemon responding' : 'installed but daemon not responding') : ollama.guidance
  });

  for (const model of requiredModels) {
    checks.push({
      id: `ollama_model_${model.replace(/[^a-z0-9]+/gi, '_')}`,
      ok: ollama.models.some((name) => name.startsWith(model)),
      detail: ollama.models.some((name) => name.startsWith(model))
        ? 'present'
        : `missing — run: ollama pull ${model} (verify with ollama list; pulls can fail silently)`
    });
  }

  if (postgres) {
    checks.push({
      id: 'postgres_pgvector',
      ok: Boolean(postgres.reachable && postgres.pgvectorVersion),
      detail: postgres.reachable
        ? (postgres.pgvectorVersion ? `pgvector ${postgres.pgvectorVersion}` : 'reachable but pgvector extension missing')
        : 'database unreachable'
    });
  }

  return checks;
}

/** Find long-lived `gbrain serve` processes (stale-lock suspects). Unix only. */
function findStaleServeProcesses() {
  if (process.platform === 'win32') return [];
  const ps = spawnSync('ps', ['-axo', 'pid,etime,command'], { encoding: 'utf8' });
  if (ps.status !== 0) return [];
  return ps.stdout
    .split('\n')
    .filter((line) => /gbrain serve/.test(line) && !/grep/.test(line))
    .map((line) => {
      const [pid, etime] = line.trim().split(/\s+/);
      return { pid: Number(pid), etime };
    })
    // etime with a dash means days: 2-13:04:11 — anything over a day is suspect.
    .filter((proc) => /\d+-/.test(proc.etime));
}

module.exports = {
  DREAM_TIMEOUT_SECONDS,
  DUMMY_OPENROUTER_KEY,
  GBRAIN_CONFIG_PATH,
  OLLAMA_OPENAI_URL,
  doctorChecks,
  ensureFilePlaneConfig,
  findStaleServeProcesses,
  jobSpecs,
  mcpRegistrationCommands,
  setModelConfig
};
