/**
 * Provisioning plan — ordered install commands for everything SOS depends on,
 * per platform/package manager. v1 prints commands for the agent (or human)
 * to run rather than executing them: installs may need sudo, licenses, or
 * network judgment calls that belong in the conversation, not a script.
 */

const {
  detectAgents,
  detectBun,
  detectGbrain,
  detectOllama,
  detectPostgres,
  detectQmd
} = require('./detect');

function installCommandsFor(pm, component) {
  const table = {
    bun: {
      brew: ['brew install oven-sh/bun/bun'],
      default: ['curl -fsSL https://bun.sh/install | bash']
    },
    ollama: {
      brew: ['brew install ollama', 'brew services start ollama'],
      default: ['curl -fsSL https://ollama.com/install.sh | sh', 'systemctl --user enable --now ollama 2>/dev/null || ollama serve &']
    },
    postgres: {
      brew: ['brew install postgresql@17 pgvector', 'brew services start postgresql@17'],
      apt: ['sudo apt install -y postgresql-17 postgresql-17-pgvector', 'sudo systemctl enable --now postgresql'],
      default: ['# install PostgreSQL 17 + pgvector with your package manager']
    },
    qmd: {
      default: ['npm install -g @tobilu/qmd']
    },
    gbrain: {
      default: ['bun install -g github:garrytan/gbrain', 'gbrain apply-migrations --yes --non-interactive']
    }
  };
  const entry = table[component];
  return entry[pm] || entry.default;
}

/**
 * Build the ordered provisioning plan for a config on this machine.
 * Each step: { component, needed, commands, verify }.
 */
function provisioningPlan(config, platformInfo) {
  const pm = platformInfo.packageManager;
  const wantsGbrain = config.retrieval && config.retrieval.gbrain;
  const wantsQmd = config.retrieval && config.retrieval.qmd;

  const bun = detectBun();
  const gbrain = detectGbrain();
  const ollama = detectOllama();
  const postgres = detectPostgres(wantsGbrain ? config.gbrain.databaseUrl : null);
  const qmd = detectQmd();
  const agents = detectAgents();

  const steps = [];

  if (wantsQmd) {
    steps.push({
      component: 'qmd',
      needed: !qmd.found,
      commands: installCommandsFor(pm, 'qmd'),
      verify: 'qmd --version'
    });
  }

  if (wantsGbrain) {
    steps.push({
      component: 'bun',
      needed: !bun.found,
      commands: installCommandsFor(pm, 'bun'),
      verify: 'bun --version'
    });
    steps.push({
      component: 'postgres',
      needed: !(postgres.found && postgres.reachable && postgres.pgvectorVersion),
      commands: [
        ...installCommandsFor(pm, 'postgres'),
        `createdb ${databaseNameFrom(config.gbrain.databaseUrl)} 2>/dev/null || true`,
        `psql ${config.gbrain.databaseUrl} -c "CREATE EXTENSION IF NOT EXISTS vector;"`
      ],
      verify: `psql ${config.gbrain.databaseUrl} -tAc "SELECT extversion FROM pg_extension WHERE extname='vector'"`
    });
    steps.push({
      component: 'ollama',
      needed: !ollama.found,
      commands: installCommandsFor(pm, 'ollama'),
      verify: 'ollama list'
    });
    const requiredModels = [
      config.gbrain.embeddingModel && config.gbrain.embeddingModel.replace(/^ollama:/, ''),
      config.gbrain.thinkModel,
      config.gbrain.cycleModel
    ].filter(Boolean);
    for (const model of [...new Set(requiredModels)]) {
      steps.push({
        component: `ollama model ${model}`,
        needed: !ollama.models.some((name) => name.startsWith(model)),
        // Pulls can fail silently (network resets still exit 0) — always verify with `ollama list`.
        commands: [`ollama pull ${model}`],
        verify: `ollama list | grep ${model}`
      });
    }
    steps.push({
      component: 'gbrain',
      needed: !gbrain.found,
      commands: [
        ...installCommandsFor(pm, 'gbrain'),
        `gbrain init --url "${config.gbrain.databaseUrl}" --embedding-model ${config.gbrain.embeddingModel}`
      ],
      verify: 'gbrain doctor --fast'
    });
  }

  return { steps, detections: { bun, gbrain, ollama, postgres, qmd, agents } };
}

function databaseNameFrom(databaseUrl) {
  const match = String(databaseUrl).match(/\/([^/?]+)(\?|$)/);
  return match ? match[1] : 'gbrain';
}

function formatPlan(plan) {
  const lines = [];
  for (const step of plan.steps) {
    lines.push(`${step.needed ? '[ ] INSTALL' : '[x] present'} ${step.component}`);
    if (step.needed) {
      for (const command of step.commands) lines.push(`      ${command}`);
      lines.push(`      verify: ${step.verify}`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  databaseNameFrom,
  formatPlan,
  provisioningPlan
};
